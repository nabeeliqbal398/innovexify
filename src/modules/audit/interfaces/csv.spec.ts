import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx", '=HYPERLINK("http://evil","click")'])("prefixes %j so a spreadsheet shows it as text", (value) => {
    expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("leaves ordinary text alone and quotes commas, quotes and newlines", () => {
    expect(csvCell("Created case")).toBe("Created case");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-05-01T10:00:00.000Z"))).toBe("2026-05-01T10:00:00.000Z");
  });
  it("ends a row with CRLF", () => {
    expect(csvRow(["a", "=b"])).toBe("a,'=b\r\n");
  });
});
