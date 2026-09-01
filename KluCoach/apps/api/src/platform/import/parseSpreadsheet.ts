import ExcelJS from "exceljs";
import Papa from "papaparse";

export class SpreadsheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetParseError";
  }
}

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && value.text != null) return String(value.text).trim();
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value && "text" in value) return String((value as { text: string }).text).trim();
  }
  return String(value).trim();
}

function matrixToSheet(matrix: string[][]): ParsedSheet {
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0]!.map(normalizeHeader);
  const rows = matrix.slice(1).map((row) => headers.map((_, i) => (row[i] ?? "").trim()));
  return { headers, rows };
}

function parseCsv(text: string): ParsedSheet {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const fatal = parsed.errors.find((err) => err.type === "Delimiter" || err.type === "Quotes");
  if (fatal && parsed.data.length === 0) {
    throw new SpreadsheetParseError(fatal.message || "CSV could not be parsed");
  }
  const matrix = parsed.data.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []));
  return matrixToSheet(matrix);
}

async function parseXlsx(buf: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetParseError("Workbook has no worksheets");
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const width = Math.max(sheet.columnCount, row.cellCount);
    const cells: string[] = [];
    for (let i = 1; i <= width; i++) cells.push(cellToString(row.getCell(i).value));
    if (cells.some((cell) => cell.length > 0)) matrix.push(cells);
  });
  return matrixToSheet(matrix);
}

/**
 * Parse-only port. Callers own authorization, tenant scope, and record validation.
 */
export async function parseSpreadsheet(buf: Buffer, filename: string): Promise<ParsedSheet> {
  const name = filename.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    throw new SpreadsheetParseError("Legacy .xls is not supported. Save as .xlsx or CSV and upload again.");
  }
  const looksZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (name.endsWith(".xlsx") || looksZip) return parseXlsx(buf);
  return parseCsv(buf.toString("utf8"));
}
