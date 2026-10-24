# Restoring a backup

`scripts/backup.sh` (or `backup.ps1` on Windows) writes two files per run into `BACKUP_DIR`, with the same UTC stamp:

| File | What |
| --- | --- |
| `innovexify-db-<stamp>.dump` | `pg_dump --format=custom` of the database |
| `innovexify-uploads-<stamp>.tar.gz` | the `uploads` volume (client documents) |

A document row without its file is a broken document, so always restore a pair with the same stamp.

**Practise this on a scratch database first** (every quarter, and before trusting a new backup process). The steps below restore into a
scratch database next to the live one and leave the live one alone. Run them from the repository root; the commands are for a shell with
`docker`. In PowerShell, replace `$STAMP` with `$env:STAMP` after `$env:STAMP = "<stamp>"`, and `\` line continuations with a backtick.

## 1. Restore the database into a scratch database

```bash
STAMP=20261024T040000Z                      # the stamp of the backup you are restoring
SCRATCH=innovexify_restore
. ./.env 2>/dev/null; PGUSER=${POSTGRES_USER:-innovexify}

docker compose exec -T db psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH"
docker compose cp "backups/innovexify-db-$STAMP.dump" db:/tmp/restore.dump
docker compose exec -T db pg_restore -U "$PGUSER" -d "$SCRATCH" --no-owner --exit-on-error /tmp/restore.dump
docker compose exec -T db rm -f /tmp/restore.dump
```

`--exit-on-error` makes a damaged dump stop the restore instead of leaving a half-filled database.

## 2. Check it: row counts of the scratch database against the live one

```bash
cat > /tmp/counts.sql <<'SQL'
SELECT table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS rows
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
SQL
for DB in "${POSTGRES_DB:-innovexify}" "$SCRATCH"; do
  docker compose exec -T db psql -U "$PGUSER" -d "$DB" -tA -F ' ' < /tmp/counts.sql > "/tmp/counts-$DB.txt"
done
diff "/tmp/counts-${POSTGRES_DB:-innovexify}.txt" "/tmp/counts-$SCRATCH.txt" && echo "Row counts match."
```

Only run the comparison right after a backup, with the live system quiet: rows added since the backup are real differences. Also compare the
migration history: `SELECT count(*) FROM _prisma_migrations` should equal the number of folders in `backend/prisma/migrations` at the time of the backup.

## 3. Restore the uploads into a scratch volume and check them

```bash
docker volume create innovexify_uploads_restore
docker run --rm -v innovexify_uploads_restore:/data -v "$PWD/backups:/backup:ro" alpine:3 \
  tar xzf "/backup/innovexify-uploads-$STAMP.tar.gz" -C /data
# Same number of files and the same total size as the live volume (right after the backup):
docker run --rm -v innovexify_uploads_restore:/data:ro alpine:3 sh -c 'find /data -type f | wc -l; du -sk /data'
```

Every non-null `storageKey` in the `Document` and `Message` tables must have a file under `<first two characters>/<key>` in the volume.

## 4. Restore for real (disaster recovery)

1. Announce the maintenance window and stop the API: `docker compose stop api web`.
2. Take a fresh backup of what is there now, in case the restore is the wrong one.
3. Restore the database over the live one:
   ```bash
   docker compose exec -T db psql -U "$PGUSER" -d postgres -c "DROP DATABASE ${POSTGRES_DB:-innovexify} WITH (FORCE)" -c "CREATE DATABASE ${POSTGRES_DB:-innovexify}"
   docker compose cp "backups/innovexify-db-$STAMP.dump" db:/tmp/restore.dump
   docker compose exec -T db pg_restore -U "$PGUSER" -d "${POSTGRES_DB:-innovexify}" --no-owner --exit-on-error /tmp/restore.dump
   ```
4. Replace the uploads volume contents (empty it first so no file from the wrong moment survives):
   ```bash
   VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Name}}{{end}}{{end}}' "$(docker compose ps -a -q api)")
   docker run --rm -v "$VOLUME:/data" -v "$PWD/backups:/backup:ro" alpine:3 sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/innovexify-uploads-$STAMP.tar.gz -C /data"
   ```
5. `docker compose up -d`, then check `GET /api/health/ready` and open a document as a reviewer.

Clean up the scratch copies when you are done: `docker compose exec -T db psql -U "$PGUSER" -d postgres -c "DROP DATABASE $SCRATCH"` and `docker volume rm innovexify_uploads_restore`.
