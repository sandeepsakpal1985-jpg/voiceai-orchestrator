import type { ParsedSheet } from "./parseSpreadsheet.js";

export const REQUIRED_STUDENT_IMPORT_COLUMNS = [
  "firstName",
  "lastName",
  "admissionNumber",
  "branchName",
  "batchName",
] as const;

export type StudentImportRecord = {
  firstName: string;
  lastName: string;
  admissionNumber: string;
  branchName: string;
  batchName: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  email: string;
  phone: string;
};

export type StudentImportError = { rowNumber: number; message: string };

export type StudentImportContext = {
  branchNames: Set<string>;
  batchNames: Set<string>;
  existingAdmissionNumbers: Set<string>;
};

function col(headers: string[], row: string[], name: string) {
  const i = headers.indexOf(name);
  return i >= 0 ? (row[i] ?? "") : "";
}

export function missingRequiredColumns(headers: string[]) {
  return REQUIRED_STUDENT_IMPORT_COLUMNS.filter((name) => !headers.includes(name));
}

/**
 * Domain validation. Does not parse files and does not authorize — tenant lookups must be supplied.
 */
export function validateStudentImport(
  sheet: ParsedSheet,
  ctx: StudentImportContext,
): { valid: StudentImportRecord[]; errors: StudentImportError[] } {
  const seenInFile = new Set<string>();
  const valid: StudentImportRecord[] = [];
  const errors: StudentImportError[] = [];

  sheet.rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const rec: StudentImportRecord = {
      firstName: col(sheet.headers, row, "firstName"),
      lastName: col(sheet.headers, row, "lastName"),
      admissionNumber: col(sheet.headers, row, "admissionNumber"),
      branchName: col(sheet.headers, row, "branchName"),
      batchName: col(sheet.headers, row, "batchName"),
      parentName: col(sheet.headers, row, "parentName"),
      parentPhone: col(sheet.headers, row, "parentPhone"),
      parentEmail: col(sheet.headers, row, "parentEmail"),
      email: col(sheet.headers, row, "email"),
      phone: col(sheet.headers, row, "phone"),
    };

    if (!rec.firstName || !rec.lastName) {
      errors.push({ rowNumber, message: "firstName and lastName required" });
      return;
    }
    if (!rec.admissionNumber) {
      errors.push({ rowNumber, message: "admissionNumber required" });
      return;
    }
    if (!rec.branchName) {
      errors.push({ rowNumber, message: "branchName required" });
      return;
    }
    if (!rec.batchName) {
      errors.push({ rowNumber, message: "batchName required" });
      return;
    }
    if (seenInFile.has(rec.admissionNumber)) {
      errors.push({ rowNumber, message: `Duplicate admissionNumber in file: ${rec.admissionNumber}` });
      return;
    }
    seenInFile.add(rec.admissionNumber);
    if (ctx.existingAdmissionNumbers.has(rec.admissionNumber)) {
      errors.push({
        rowNumber,
        message: `admissionNumber already exists in this institution: ${rec.admissionNumber}`,
      });
      return;
    }
    if (!ctx.branchNames.has(rec.branchName)) {
      errors.push({ rowNumber, message: `branchName not found in this institution: ${rec.branchName}` });
      return;
    }
    if (!ctx.batchNames.has(rec.batchName)) {
      errors.push({ rowNumber, message: `batchName not found in this institution: ${rec.batchName}` });
      return;
    }
    valid.push(rec);
  });

  return { valid, errors };
}
