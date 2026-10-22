/* eslint-disable no-control-regex -- asserting that no control character survives */
import { attachmentDisposition, inspectUpload, sanitizeFileName, sniffKind } from "./file-policy";

const MB = 1_048_576;
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("1 0 obj <<>> endobj\n%%EOF")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml"), Buffer.from("word/document.xml"), Buffer.alloc(16)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("notes.txt"), Buffer.alloc(16)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]);

const inspect = (name: string, data: Buffer, max = 25 * MB) => inspectUpload({ originalName: name, data }, max);
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { errorCode?: string }).errorCode;
  }
  return undefined;
};
const messageOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error & { getResponse(): { message: string } }).getResponse().message;
  }
  return "";
};

describe("file policy", () => {
  describe("accepts real files", () => {
    it.each([
      ["passport.pdf", PDF, "application/pdf"],
      ["photo.png", PNG, "image/png"],
      ["photo.jpg", JPG, "image/jpeg"],
      ["photo.JPEG", JPG, "image/jpeg"],
      ["agreement.docx", DOCX, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ])("%s", (name, data, mime) => {
      expect(inspect(name, data)).toMatchObject({ fileName: name, mimeType: mime, sizeBytes: data.length });
    });

    it("accepts a name with dots that are not extensions", () => {
      expect(inspect("Passport v2.final.pdf", PDF).fileName).toBe("Passport v2.final.pdf");
    });
  });

  describe("sniffs by content, not by name", () => {
    it("recognises the four types and nothing else", () => {
      expect([PDF, PNG, JPG, DOCX].map(sniffKind)).toEqual(["pdf", "png", "jpeg", "docx"]);
      expect(sniffKind(EXE)).toBeNull();
      expect(sniffKind(ZIP)).toBeNull();
      expect(sniffKind(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
      expect(sniffKind(Buffer.from("just text"))).toBeNull();
      expect(sniffKind(Buffer.alloc(0))).toBeNull();
    });
    it("requires the PDF signature at the very start", () => {
      expect(sniffKind(Buffer.from("<html>%PDF-1.4"))).toBeNull();
    });
  });

  describe("rejects, each with its own code and message", () => {
    it("an empty file", () => {
      expect(codeOf(() => inspect("a.pdf", Buffer.alloc(0)))).toBe("FILE_EMPTY");
      expect(messageOf(() => inspect("a.pdf", Buffer.alloc(0)))).toContain("is empty");
    });
    it("an oversized file, naming the limit", () => {
      const big = Buffer.concat([PDF, Buffer.alloc(2 * MB)]);
      expect(codeOf(() => inspect("a.pdf", big, 2 * MB))).toBe("FILE_TOO_LARGE");
      expect(messageOf(() => inspect("a.pdf", big, 2 * MB))).toBe("That file is larger than 2 MB. Compress it or split it into parts.");
      expect(codeOf(() => inspect("a.pdf", Buffer.concat([PDF, Buffer.alloc(2 * MB - PDF.length)]), 2 * MB))).toBeUndefined();
    });
    it("an extension that isn't allowed", () => {
      expect(codeOf(() => inspect("setup.exe", EXE))).toBe("FILE_TYPE_NOT_ALLOWED");
      expect(messageOf(() => inspect("notes.txt", PDF))).toBe("That file type isn't accepted (.txt). Use PDF, PNG, JPG or DOCX.");
      expect(codeOf(() => inspect("README", PDF))).toBe("FILE_TYPE_NOT_ALLOWED");
    });
    it("a double extension, whichever way round", () => {
      for (const name of ["invoice.pdf.exe", "invoice.exe.pdf", "photo.jpg.js", "scan.pdf.pdf", "doc.docx.vbs"]) {
        expect(codeOf(() => inspect(name, PDF))).toBe("FILE_DOUBLE_EXTENSION");
      }
      expect(messageOf(() => inspect("invoice.pdf.exe", EXE))).toContain("more than one file extension");
    });
    it("a program renamed to .pdf", () => {
      expect(codeOf(() => inspect("invoice.pdf", EXE))).toBe("FILE_CONTENT_NOT_ALLOWED");
      expect(messageOf(() => inspect("invoice.pdf", EXE))).toContain("whatever its name says");
    });
    it("a plain ZIP renamed to .docx", () => {
      expect(codeOf(() => inspect("report.docx", ZIP))).toBe("FILE_CONTENT_NOT_ALLOWED");
    });
    it("HTML renamed to an image", () => {
      expect(codeOf(() => inspect("logo.png", Buffer.from("<svg onload=alert(1)>")))).toBe("FILE_CONTENT_NOT_ALLOWED");
    });
    it("a real file of one type named as another", () => {
      expect(codeOf(() => inspect("scan.png", JPG))).toBe("FILE_TYPE_MISMATCH");
      expect(messageOf(() => inspect("scan.png", JPG))).toBe('"scan.png" is named as a .png file but its contents are a JPEG image. Save it in the right format, or rename it, and upload it again.');
      expect(codeOf(() => inspect("scan.pdf", PNG))).toBe("FILE_TYPE_MISMATCH");
      expect(codeOf(() => inspect("scan.docx", PDF))).toBe("FILE_TYPE_MISMATCH");
    });
    it("a name with nothing usable left", () => {
      expect(codeOf(() => inspect("../../", PDF))).toBe("FILE_NAME_INVALID");
      expect(codeOf(() => inspect("   ", PDF))).toBe("FILE_NAME_INVALID");
    });
  });

  describe("sanitizeFileName", () => {
    it.each([
      ["../../etc/passwd.pdf", "passwd.pdf"],
      ["..\\..\\windows\\evil.pdf", "evil.pdf"],
      ["/abs/olute/path/cv.pdf", "cv.pdf"],
      ["C:\\Users\\me\\scan.png", "scan.png"],
      ["na\u0000me\u001f.pdf", "name.pdf"],
      ['we<ir>d:"na|me?*.pdf', "weirdname.pdf"],
      ["  spaced   out  .pdf", "spaced out .pdf"],
      ["...hidden.pdf", "hidden.pdf"],
      ["trailing.pdf...", "trailing.pdf"],
    ])("%j -> %j", (raw, expected) => {
      expect(sanitizeFileName(raw)).toBe(expected);
    });

    it("keeps at most 255 characters and the extension", () => {
      const out = sanitizeFileName(`${"a".repeat(400)}.pdf`);
      expect(out).toHaveLength(255);
      expect(out.endsWith(".pdf")).toBe(true);
    });

    it("repairs a UTF-8 name that arrived read as Latin-1", () => {
      const garbled = Buffer.from("Résumé.pdf", "utf8").toString("latin1");
      expect(sanitizeFileName(garbled)).toBe("Résumé.pdf");
    });

    it("never leaves a path separator or control character", () => {
      const out = sanitizeFileName("a/b\\c\nd\re\tf.pdf");
      expect(out).not.toMatch(/[\\/\u0000-\u001f]/);
    });
  });

  describe("attachmentDisposition", () => {
    it("builds a safe header", () => {
      expect(attachmentDisposition("Passport.pdf")).toBe("attachment; filename=\"Passport.pdf\"; filename*=UTF-8''Passport.pdf");
    });
    it("keeps quotes, semicolons and non-ASCII out of the plain filename and encodes the real one", () => {
      const header = attachmentDisposition('a"b;c Résumé.pdf');
      expect(header).toContain('filename="a_b_c R_sum_.pdf"');
      expect(header).toContain("filename*=UTF-8''a%22b%3Bc%20R%C3%A9sum%C3%A9.pdf");
      expect(header).not.toMatch(/[\r\n]/);
    });
  });
});
