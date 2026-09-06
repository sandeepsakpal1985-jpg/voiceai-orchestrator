import type { ParsedSheet } from "./parseSpreadsheet.js";

export const REQUIRED_STUDENT_IMPORT_COLUMNS = [
  "firstName",
  "lastName",
  "admissionNumber",
  "branchName",
  "batchName",
] as const;

/** Soft cap so a preview cannot dump an unbounded sheet into API memory or the browser. */
export const STUDENT_IMPORT_MAX_ROWS = 2000;
export const STUDENT_IMPORT_PREVIEW_ERROR_LIMIT = 100;
export const STUDENT_IMPORT_STORED_ERROR_LIMIT = 200;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function col(headers: string[], row: string[], name: string) {
  const i = headers.indexOf(name);
  return i >= 0 ? (row[i] ?? "").trim() : "";
}

export function missingRequiredColumns(headers: string[]) {
  return REQUIRED_STUDENT_IMPORT_COLUMNS.filter((name) => !headers.includes(name));
}

export function sheetExceedsImportLimit(rowCount: number) {
  return rowCount > STUDENT_IMPORT_MAX_ROWS;
}

export function invalidEmail(value: string) {
  return value.length > 0 && !EMAIL_RE.test(value);
}

export function invalidPhone(value: string) {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length < 10 || digits.length > 15;
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
    if (invalidEmail(rec.email)) {
      errors.push({ rowNumber, message: `invalid email: ${rec.email}` });
      return;
    }
    if (invalidEmail(rec.parentEmail)) {
      errors.push({ rowNumber, message: `invalid parentEmail: ${rec.parentEmail}` });
      return;
    }
    if (invalidPhone(rec.phone)) {
      errors.push({ rowNumber, message: `invalid phone: ${rec.phone}` });
      return;
    }
    if (invalidPhone(rec.parentPhone)) {
      errors.push({ rowNumber, message: `invalid parentPhone: ${rec.parentPhone}` });
      return;
    }
    valid.push(rec);
  });

  return { valid, errors };
}
