import { describe, expect, it } from "vitest";
import {
  commercialValue,
  invoiceStatusFromPaid,
  invoiceTotalPaise,
  outstandingPaise,
  taxOnExclusive,
} from "./pricing.js";
import { resolveEntitlementStatus, resolveSubscriptionStatus } from "./entitlement-service.js";

const partnerSnapshot = {
  studentUnitPricePaise: 99_900,
  klunexUnitRealizationPaise: 50_000,
  partnerUnitSharePaise: 49_900,
};

describe("pricing calculations", () => {
  it("computes 100 and 1000 student partner economics from the snapshot", () => {
    expect(commercialValue(100, partnerSnapshot)).toEqual({
      billableStudents: 100,
      grossPaise: 9_990_000,
      klunexRealizationPaise: 5_000_000,
      partnerSharePaise: 4_990_000,
    });
    expect(commercialValue(1000, partnerSnapshot)).toEqual({
      billableStudents: 1000,
      grossPaise: 99_900_000,
      klunexRealizationPaise: 50_000_000,
      partnerSharePaise: 49_900_000,
    });
  });

  it("does not derive partner share as price minus realization", () => {
    const negotiated = { studentUnitPricePaise: 99_900, klunexUnitRealizationPaise: 40_000, partnerUnitSharePaise: 20_000 };
    const out = commercialValue(10, negotiated);
    expect(out.partnerSharePaise).toBe(200_000);
    expect(out.klunexRealizationPaise + out.partnerSharePaise).not.toBe(out.grossPaise);
  });

  it("totals invoices in paise and computes outstanding", () => {
    expect(invoiceTotalPaise(99900, 0, 0)).toBe(99900);
    expect(taxOnExclusive(100_000, 1800)).toBe(18_000);
    expect(outstandingPaise(99_900_000, 50_000_000)).toBe(49_900_000);
    expect(invoiceStatusFromPaid(100, 40, "ISSUED")).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFromPaid(100, 100, "ISSUED")).toBe("PAID");
    expect(invoiceStatusFromPaid(100, 0, "OVERDUE")).toBe("OVERDUE");
    expect(invoiceStatusFromPaid(100, 100, "OVERDUE")).toBe("PAID");
  });
});

describe("lifecycle", () => {
  it("keeps access in grace then expires", () => {
    const endsAt = new Date("2027-03-31T00:00:00.000Z");
    expect(resolveEntitlementStatus({ stored: "ACTIVE", endsAt, gracePeriodDays: 7, asOf: new Date("2027-03-31T00:00:00.000Z") })).toBe("ACTIVE");
    expect(resolveEntitlementStatus({ stored: "ACTIVE", endsAt, gracePeriodDays: 7, asOf: new Date("2027-04-03T00:00:00.000Z") })).toBe("GRACE");
    expect(resolveEntitlementStatus({ stored: "ACTIVE", endsAt, gracePeriodDays: 7, asOf: new Date("2027-04-10T00:00:00.000Z") })).toBe("EXPIRED");
    expect(resolveSubscriptionStatus({ stored: "CANCELLED", endsAt, gracePeriodDays: 7, asOf: new Date("2027-04-10T00:00:00.000Z") })).toBe("CANCELLED");
  });
});
