/**
 * CSV for the audit export. A spreadsheet treats a cell that starts with = + - or @ (and tab or carriage return, which some
 * versions also honour) as a formula, so a value such as `=HYPERLINK("http://evil","click")` typed into, say, a client's name
 * would run when an Admin opens the export. Such cells are prefixed with an apostrophe, which a spreadsheet shows as plain text.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvRow = (cells: readonly unknown[]): string => `${cells.map(csvCell).join(",")}\r\n`;

/** UTF-8 byte order mark, so Excel reads accented names correctly. */
export const CSV_BOM = "﻿";
