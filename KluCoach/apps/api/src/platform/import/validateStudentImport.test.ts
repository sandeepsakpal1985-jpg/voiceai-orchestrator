import { describe, expect, it } from "vitest";
import { missingRequiredColumns, validateStudentImport } from "./validateStudentImport.js";

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
});
