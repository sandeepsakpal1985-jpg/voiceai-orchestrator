import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, SpreadsheetParseError } from "./parseSpreadsheet.js";

describe("parseSpreadsheet", () => {
  it("parses CSV including quoted commas", async () => {
    const csv = Buffer.from('firstName,lastName,admissionNumber\n"A,va","Kumar",A1\n');
    const sheet = await parseSpreadsheet(csv, "students.csv");
    expect(sheet.headers).toEqual(["firstName", "lastName", "admissionNumber"]);
    expect(sheet.rows[0]).toEqual(["A,va", "Kumar", "A1"]);
  });

  it("strips a BOM from the first header", async () => {
    const csv = Buffer.from("\uFEFFfirstName,lastName\nAda,Lovelace\n");
    const sheet = await parseSpreadsheet(csv, "students.csv");
    expect(sheet.headers[0]).toBe("firstName");
  });

  it("parses XLSX via ExcelJS without authorizing", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Students");
    ws.addRow(["firstName", "lastName", "admissionNumber"]);
    ws.addRow(["Ada", "Lovelace", "A-1"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const sheet = await parseSpreadsheet(buf, "students.xlsx");
    expect(sheet.headers).toEqual(["firstName", "lastName", "admissionNumber"]);
    expect(sheet.rows[0]).toEqual(["Ada", "Lovelace", "A-1"]);
  });

  it("rejects legacy .xls", async () => {
    await expect(parseSpreadsheet(Buffer.from("x"), "old.xls")).rejects.toBeInstanceOf(SpreadsheetParseError);
  });
});
