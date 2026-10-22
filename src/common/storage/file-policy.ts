/* eslint-disable no-control-regex -- stripping control characters from file names is the point of this file */
import {
  FileContentNotAllowedException,
  FileDoubleExtensionException,
  FileEmptyException,
  FileNameInvalidException,
  FileTooLargeException,
  FileTypeMismatchException,
  FileTypeNotAllowedException,
} from "../exceptions";

/**
 * What may be uploaded, and how that is decided. Pure functions, no I/O, so every rule is unit-tested directly.
 * The decision is made on the file's CONTENT (magic bytes) and its sanitised name. The type the browser claims
 * (the multipart Content-Type) is never consulted: it is just another thing the sender controls.
 */

export type FileKind = "pdf" | "png" | "jpeg" | "docx";

export const MIME_OF: Record<FileKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const DESCRIBE: Record<FileKind, string> = { pdf: "a PDF", png: "a PNG image", jpeg: "a JPEG image", docx: "a Word (DOCX) document" };

/** Extension -> the kind of content it must have. */
const KIND_OF_EXTENSION: Record<string, FileKind> = { pdf: "pdf", png: "png", jpg: "jpeg", jpeg: "jpeg", docx: "docx" };

export const ACCEPTED_EXTENSIONS = Object.keys(KIND_OF_EXTENSION);

/**
 * A name like "report.pdf.exe" or "invoice.exe.pdf" hides what the file is. Any middle segment that looks like a
 * file extension of a program, script or accepted document makes the name suspect.
 */
const SUSPECT_MIDDLE_EXTENSIONS = new Set([
  "exe", "com", "scr", "bat", "cmd", "msi", "dll", "js", "mjs", "vbs", "vbe", "wsf", "ps1", "sh", "jar", "php", "py", "pl", "rb", "hta", "lnk", "apk", "app", "bin", "iso", "docm", "xlsm", "html", "htm", "svg",
  ...ACCEPTED_EXTENSIONS,
  "doc", "xls", "xlsx", "ppt", "pptx", "zip", "rar", "7z", "txt",
]);

const MAX_NAME_LENGTH = 255;

/**
 * Multer reads the file name as Latin-1. A UTF-8 name ("Résumé.pdf") arrives garbled; if reading it as UTF-8 gives clean
 * text, that is what the sender meant.
 */
function repairEncoding(raw: string): string {
  if (!/[^\u0000-\u007f]/.test(raw)) return raw;
  const repaired = Buffer.from(raw, "latin1").toString("utf8");
  return repaired.includes("\ufffd") ? raw : repaired;
}

/**
 * The name we keep in the database and show to people: no folders, no control characters, no characters Windows
 * forbids, no leading or trailing dots and spaces, at most 255 characters (the extension is preserved when cutting).
 * Returns "" when nothing usable is left. It is only ever a label: files are stored under a random key, never this name.
 */
export function sanitizeFileName(raw: string): string {
  const slashed = repairEncoding(raw).replace(/\\/g, "/");
  const last = slashed.slice(slashed.lastIndexOf("/") + 1);
  const cleaned = last.replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, "").replace(/[<>:"|?*]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").trim();
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}

/** What the bytes really are, from their signature. `null` for anything that isn't one of the four accepted types. */
export function sniffKind(data: Buffer): FileKind | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    // A DOCX is a ZIP archive that holds [Content_Types].xml and a word/ folder. A bare ZIP renamed .docx is not one.
    const text = data.toString("latin1");
    if (text.includes("[Content_Types].xml") && text.includes("word/")) return "docx";
  }
  return null;
}

export interface UploadInput {
  originalName: string;
  data: Buffer;
}

export interface InspectedUpload {
  /** The sanitised display name. */
  fileName: string;
  extension: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Applies every upload rule in a fixed order and throws the specific exception for the first one that fails:
 * empty, too large, unusable name, double extension, extension not allowed, content not an accepted type, and
 * content that doesn't match the extension.
 */
export function inspectUpload(file: UploadInput, maxBytes: number): InspectedUpload {
  const fileName = sanitizeFileName(file.originalName);
  const display = fileName || "That file";

  if (file.data.length === 0) throw new FileEmptyException(display);
  if (file.data.length > maxBytes) throw new FileTooLargeException(Math.floor(maxBytes / 1_048_576));
  if (!fileName) throw new FileNameInvalidException();

  const parts = fileName.split(".");
  const middle = parts.slice(1, -1).map((p) => p.toLowerCase());
  if (parts.length > 2 && middle.some((p) => SUSPECT_MIDDLE_EXTENSIONS.has(p))) throw new FileDoubleExtensionException(fileName);

  const extension = parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
  const expected = KIND_OF_EXTENSION[extension];
  if (!expected) throw new FileTypeNotAllowedException(extension);

  const actual = sniffKind(file.data);
  if (!actual) throw new FileContentNotAllowedException(fileName);
  if (actual !== expected) throw new FileTypeMismatchException(fileName, extension, DESCRIBE[actual]);

  return { fileName, extension, kind: actual, mimeType: MIME_OF[actual], sizeBytes: file.data.length };
}

/**
 * A Content-Disposition header value for a download. The name is already sanitised; here it is made safe for a header:
 * an ASCII fallback with quotes and backslashes removed, plus the full UTF-8 name in `filename*` (RFC 6266 / 5987).
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_") || "download";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
