# Back up the production stack: a pg_dump of the database plus a tar of the uploads volume, both timestamped (UTC), into
# BACKUP_DIR, keeping the newest BACKUP_KEEP of each. Same behaviour as scripts/backup.sh.
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
#
# Settings (environment, or the .env next to docker-compose.yml): BACKUP_DIR (default .\backups), BACKUP_KEEP (default 14),
# POSTGRES_USER, POSTGRES_DB. The backup holds password hashes and client documents: keep BACKUP_DIR on an encrypted disk and copy it
# off the machine (GO-LIVE.md, item 8). Restoring: scripts\RESTORE.md.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Values already in the environment win over .env.
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^(BACKUP_DIR|BACKUP_KEEP|POSTGRES_USER|POSTGRES_DB)=(.*)$') {
      if (-not [Environment]::GetEnvironmentVariable($Matches[1])) { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim()) }
    }
  }
}
$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $root "backups" }
$keep = if ($env:BACKUP_KEEP) { [int]$env:BACKUP_KEEP } else { 14 }
$pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "innovexify" }
$pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "innovexify" }
if ($keep -lt 1) { throw "BACKUP_KEEP must be a whole number of at least 1." }

function Invoke-Docker {
  # Native commands do not throw in PowerShell: check the exit code ourselves.
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') failed with exit code $LASTEXITCODE" }
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupDir = (Resolve-Path $backupDir).Path
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$dbFile = "innovexify-db-$stamp.dump"
$uploadsFile = "innovexify-uploads-$stamp.tar.gz"

# 1. The database. pg_dump runs inside the db container and writes a file there, which is then copied out: PowerShell's pipeline
#    would re-encode binary output, so nothing binary is ever piped.
Invoke-Docker compose exec -T db sh -c "pg_dump -U '$pgUser' -d '$pgDb' --format=custom --file=/tmp/backup.dump"
Invoke-Docker compose cp "db:/tmp/backup.dump" (Join-Path $backupDir $dbFile)
Invoke-Docker compose exec -T db rm -f /tmp/backup.dump
# A dump that cannot be read back is not a backup: copy it in and list it.
Invoke-Docker compose cp (Join-Path $backupDir $dbFile) "db:/tmp/check.dump"
Invoke-Docker compose exec -T db sh -c "pg_restore --list /tmp/check.dump >/dev/null && rm -f /tmp/check.dump"

# 2. The uploads volume, found through the api container so the project name does not have to be guessed.
$apiId = (& docker compose ps -a -q api).Trim()
if (-not $apiId) { throw "The api container does not exist; start the stack first (docker compose up -d)." }
# (Parsed as JSON here: PowerShell strips the double quotes out of a Go template passed to a native command.)
$mounts = (& docker inspect --format '{{json .Mounts}}' $apiId) | ConvertFrom-Json
$volume = ($mounts | Where-Object { $_.Destination -eq "/app/storage" } | Select-Object -First 1).Name
if (-not $volume) { throw "Could not find the uploads volume on the api container." }
Invoke-Docker run --rm -v "${volume}:/data:ro" -v "${backupDir}:/backup" alpine:3 tar czf "/backup/$uploadsFile" -C /data .
Invoke-Docker run --rm -v "${backupDir}:/backup" alpine:3 tar tzf "/backup/$uploadsFile" | Out-Null

# 3. Keep the newest BACKUP_KEEP of each kind (the UTC stamp in the name sorts oldest first).
foreach ($pattern in @("innovexify-db-*.dump", "innovexify-uploads-*.tar.gz")) {
  $files = @(Get-ChildItem -Path $backupDir -Filter $pattern | Sort-Object Name)
  if ($files.Count -gt $keep) {
    foreach ($old in $files[0..($files.Count - $keep - 1)]) { Remove-Item -Force $old.FullName; Write-Host "removed old backup $($old.Name)" }
  }
}

Write-Host "Backup $stamp written to $backupDir"
foreach ($name in @($dbFile, $uploadsFile)) { Write-Host ("  {0} ({1:N1} KB)" -f $name, ((Get-Item (Join-Path $backupDir $name)).Length / 1KB)) }
