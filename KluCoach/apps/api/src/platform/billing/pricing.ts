/** Monetary amounts are integer minor units (paise). Do not use floats. */

export function assertPaise(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer in paise`);
  }
}

export function timesPaise(unitPaise: number, count: number) {
  assertPaise(unitPaise, "unit");
  if (!Number.isInteger(count) || count < 0) throw new Error("count must be a non-negative integer");
  return unitPaise * count;
}

export function invoiceTotalPaise(subtotalPaise: number, discountPaise: number, taxPaise: number) {
  assertPaise(subtotalPaise, "subtotal");
  assertPaise(discountPaise, "discount");
  assertPaise(taxPaise, "tax");
  const total = subtotalPaise - discountPaise + taxPaise;
  if (total < 0) throw new Error("invoice total cannot be negative");
  return total;
}

export function taxOnExclusive(basePaise: number, rateBps: number) {
  assertPaise(basePaise, "tax base");
  if (!Number.isInteger(rateBps) || rateBps < 0) throw new Error("tax rate bps must be a non-negative integer");
  return Math.trunc((basePaise * rateBps) / 10_000);
}

export type PriceSnapshot = {
  studentUnitPricePaise: number;
  klunexUnitRealizationPaise: number;
  partnerUnitSharePaise: number;
};

export function commercialValue(billableStudents: number, snapshot: PriceSnapshot) {
  return {
    billableStudents,
    grossPaise: timesPaise(snapshot.studentUnitPricePaise, billableStudents),
    klunexRealizationPaise: timesPaise(snapshot.klunexUnitRealizationPaise, billableStudents),
    partnerSharePaise: timesPaise(snapshot.partnerUnitSharePaise, billableStudents),
  };
}

export function outstandingPaise(totalPaise: number, paidPaise: number) {
  assertPaise(totalPaise, "total");
  assertPaise(paidPaise, "paid");
  return Math.max(0, totalPaise - paidPaise);
}

export function invoiceStatusFromPaid(totalPaise: number, paidPaise: number, current: string) {
  if (current === "VOID" || current === "DRAFT" || current === "REFUNDED") return current;
  if (paidPaise <= 0) return current === "OVERDUE" ? "OVERDUE" : "ISSUED";
  if (paidPaise >= totalPaise) return "PAID";
  return "PARTIALLY_PAID";
}
