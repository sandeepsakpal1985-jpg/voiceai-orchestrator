import { describe, expect, it } from "vitest";
import { can } from "./policies.js";

describe("RBAC policies", () => {
  it("does not let a parent write students", () => {
    expect(can("PARENT", "students:write")).toBe(false);
    expect(can("PARENT", "students:read")).toBe(true);
  });

  it("lets institution admin write students", () => {
    expect(can("INSTITUTION_ADMIN", "students:write")).toBe(true);
  });

  it("lets teachers mark attendance but not import", () => {
    expect(can("TEACHER", "attendance:write")).toBe(true);
    expect(can("TEACHER", "import:write")).toBe(false);
  });

  it("lets parents only see parent dashboard", () => {
    expect(can("PARENT", "dashboard:parent")).toBe(true);
    expect(can("PARENT", "dashboard:admin")).toBe(false);
  });

  it("lets students submit assignments but not create notices", () => {
    expect(can("STUDENT", "assignments:write")).toBe(true);
    expect(can("STUDENT", "notices:write")).toBe(false);
  });

  it("lets institution admin write teachers and invitations", () => {
    expect(can("INSTITUTION_ADMIN", "teachers:write")).toBe(true);
    expect(can("TEACHER", "teachers:write")).toBe(false);
    expect(can("PARENT", "teachers:write")).toBe(false);
  });

  it("keeps commercial write on super admin only", () => {
    expect(can("SUPER_ADMIN", "billing:write")).toBe(true);
    expect(can("INSTITUTION_ADMIN", "billing:read")).toBe(true);
    expect(can("INSTITUTION_ADMIN", "billing:write")).toBe(false);
    expect(can("TEACHER", "billing:read")).toBe(false);
    expect(can("STAFF", "fees:read")).toBe(false);
  });
});
