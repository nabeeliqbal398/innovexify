/**
 * Quick checks before a file is sent, so a wrong choice is caught without waiting for the upload. They mirror the server's rules
 * (type by extension, size, not empty) but never replace them: the server re-checks the content itself and its message wins.
 */
export const ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx"] as const;
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.pdf,.docx";
export const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1_048_576;

/** An error message, or an empty string when the file looks acceptable. */
export function validateFile(file: { name: string; size: number } | null | undefined): string {
  if (!file) return "Choose a file.";
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return "That file type isn't accepted. Use PDF, PNG, JPG or DOCX.";
  if (file.size > MAX_FILE_BYTES) return `That file is larger than ${MAX_FILE_MB} MB. Compress it or split it into parts.`;
  if (file.size === 0) return "That file is empty.";
  return "";
}
