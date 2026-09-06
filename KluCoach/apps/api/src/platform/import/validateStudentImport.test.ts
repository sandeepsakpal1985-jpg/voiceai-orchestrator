import { describe, expect, it } from "vitest";
import { missingRequiredColumns, sheetExceedsImportLimit, STUDENT_IMPORT_MAX_ROWS, validateStudentImport } from "./validateStudentImport.js";

const headers = ["firstName", "lastName", "admissionNumber", "branchName", "batchName"];

function sheet(rows: string[][]) {
  return { headers, rows };
}

const ctx = {
  branchNames: new Set(["Main"]),
  batchNames: new Set(["JEE 2027"]),
  existingAdmissionNumbers: new Set(["EXISTING"]),
};

describe("validateStudentImport", () => {
  it("reports missing columns without treating the parser as authority", () => {
    expect(missingRequiredColumns(["firstName", "lastName"])).toEqual([
      "admissionNumber",
      "branchName",
      "batchName",
    ]);
  });

  it("accepts a valid row", () => {
    const result = validateStudentImport(sheet([["Ada", "Lovelace", "A1", "Main", "JEE 2027"]]), ctx);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("does not silently drop invalid rows — each failure is explained", () => {
    const result = validateStudentImport(
      sheet([
        ["Ada", "Lovelace", "A1", "Main", "JEE 2027"],
        ["", "NoFirst", "A2", "Main", "JEE 2027"],
        ["Bob", "Builder", "", "Main", "JEE 2027"],
        ["Cara", "Lee", "EXISTING", "Main", "JEE 2027"],
        ["Dan", "Wu", "A3", "Other Campus", "JEE 2027"],
        ["Eve", "Ng", "A4", "Main", "NEET 2028"],
        ["Fay", "Ok", "A1", "Main", "JEE 2027"],
      ]),
      ctx,
    );
    expect(result.valid.map((r) => r.admissionNumber)).toEqual(["A1"]);
    expect(result.errors.map((e) => e.message)).toEqual([
      "firstName and lastName required",
      "admissionNumber required",
      "admissionNumber already exists in this institution: EXISTING",
      "branchName not found in this institution: Other Campus",
      "batchName not found in this institution: NEET 2028",
      "Duplicate admissionNumber in file: A1",
    ]);
  });

  it("rejects invalid email and phone without dropping other valid rows", () => {
    const wide = {
      headers: [...headers, "email", "parentEmail", "phone", "parentPhone"],
      rows: [
        ["Ada", "Lovelace", "A1", "Main", "JEE 2027", "ada@example.test", "parent@example.test", "9876543210", "9876543211"],
        ["Bob", "Builder", "A2", "Main", "JEE 2027", "not-an-email", "", "", ""],
        ["Cara", "Lee", "A3", "Main", "JEE 2027", "", "", "", "123"],
      ],
    };
    const result = validateStudentImport(wide, ctx);
    expect(result.valid.map((r) => r.admissionNumber)).toEqual(["A1"]);
    expect(result.errors.map((e) => e.message)).toEqual(["invalid email: not-an-email", "invalid parentPhone: 123"]);
  });

  it("validates 500 and 1,000 rows without silently dropping a malformed row", () => {
    const make = (n: number) => {
      const rows = Array.from({ length: n }, (_, i) => [`Stu${i}`, "Patel", `IMP-${i}`, "Main", "JEE 2027"]);
      rows[10] = ["", "Bad", "IMP-BAD", "Main", "JEE 2027"];
      return validateStudentImport(sheet(rows), ctx);
    };
    const five = make(500);
    expect(five.valid).toHaveLength(499);
    expect(five.errors).toHaveLength(1);
    expect(five.errors[0]?.rowNumber).toBe(12);
    const thousand = make(1000);
    expect(thousand.valid).toHaveLength(999);
    expect(thousand.errors).toHaveLength(1);
  });

  it("flags sheets above the import row cap", () => {
    expect(sheetExceedsImportLimit(STUDENT_IMPORT_MAX_ROWS)).toBe(false);
    expect(sheetExceedsImportLimit(STUDENT_IMPORT_MAX_ROWS + 1)).toBe(true);
  });
});
