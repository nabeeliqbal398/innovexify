/** Hand a file the API returned to the browser as a download. The blob is released straight after. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file name the server chose, from a Content-Disposition header (`filename*=UTF-8''...` first, then `filename="..."`). */
export function filenameFromDisposition(header: string | null | undefined, fallback = "download"): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/**
 * Downloaded bytes wait here, outside Redux (a Blob is not serializable), until the screen that asked for them takes them.
 * The store only ever holds the small `{ key, filename, mimeType }` summary.
 */
const pending = new Map<string, Blob>();
let counter = 0;

export function holdBlob(blob: Blob): string {
  const key = `blob-${++counter}`;
  pending.set(key, blob);
  return key;
}

export function takeBlob(key: string): Blob | undefined {
  const blob = pending.get(key);
  pending.delete(key);
  return blob;
}

export interface DownloadSummary {
  key: string;
  filename: string;
  mimeType: string;
}
