export const LOGO_MAX_BYTES = 200 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Checks a logo sent as a data URL and returns a problem to show the user, or null when it is fine. The declared type
 * must be PNG or JPEG, the base64 must decode, the size must be under 200 KB, and the first bytes must really be a PNG or
 * JPEG header: the declared type is not trusted, so an SVG (which can carry script) or an HTML file labelled as a PNG is refused.
 */
export function logoProblem(dataUrl: string): string | null {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return "The logo must be a PNG or JPEG image (a data URL such as data:image/png;base64,...). SVG and other types aren't accepted.";
  const bytes = Buffer.from(match[2] as string, "base64");
  if (bytes.length === 0) return "The logo image is empty.";
  if (bytes.length > LOGO_MAX_BYTES) return `The logo is ${Math.ceil(bytes.length / 1024)} KB. It must be under 200 KB.`;
  const png = match[1] === "image/png";
  const header = png ? PNG : JPEG;
  if (!bytes.subarray(0, header.length).equals(header)) return `That file isn't really a ${png ? "PNG" : "JPEG"} image. Export it again from an image editor and upload that.`;
  return null;
}
