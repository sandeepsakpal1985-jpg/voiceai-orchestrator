import { expect, test } from "@playwright/test";
import { expectHeading, loginAs } from "./helpers";

test("institution admin sees subscription, billable students, and invoices from the API", async ({ page }) => {
  await loginAs(page, "superadmin@example.test");
  await expectHeading(page, "Commercial");
  await expect(page.getByText("PARTNER").first()).toBeVisible();
  await expect(page.getByText("Demo Coaching Institute")).toBeVisible();

  await loginAs(page, "admin@example.test");
  await page.getByRole("link", { name: "Billing" }).click();
  await expectHeading(page, "Billing");
  await expect(page.getByTestId("subscription-status")).toHaveText("ACTIVE");
  const billable = page.getByTestId("billable-students");
  await expect(billable).toBeVisible();
  await expect(billable).not.toHaveText("0");
  await expect(page.getByText("KC-2026-0001")).toBeVisible();
  await expect(page.getByText(/KluNex/)).toBeVisible();
});

test("parent sees child fee status without institution economics", async ({ page }) => {
  await loginAs(page, "parent@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByTestId("fee-status")).toHaveText("Pending");
  await expect(page.getByText(/24,000/)).toBeVisible();
  await expect(page.getByText(/2026-09-30/)).toBeVisible();
  await expect(page.getByText("KluNex")).toHaveCount(0);
  await expect(page.getByText("partner share", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
});

test("subscription asOf date shows expired without waiting", async ({ page }) => {
  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await page.goto("/billing?asOf=2028-04-01");
  await expectHeading(page, "Billing");
  await expect(page.getByTestId("subscription-status")).toHaveText("EXPIRED");
});

test("tenant B cannot read tenant A billing invoices", async ({ page, browser }) => {
  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await page.getByRole("link", { name: "Billing" }).click();
  await expectHeading(page, "Billing");
  const invoiceId = await page.evaluate(async () => {
    const res = await fetch("/api/billing/invoices?page=1", { credentials: "include" });
    const body = (await res.json()) as { items?: { id: string }[] };
    return body.items?.[0]?.id ?? null;
  });
  expect(invoiceId).toBeTruthy();

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "admin-b@example.test");
  await other.getByRole("link", { name: "Billing" }).click();
  await expectHeading(other, "Billing");
  await expect(other.getByText("KC-2026-0001")).toHaveCount(0);
  const status = await other.evaluate(async (id) => {
    const res = await fetch(`/api/billing/invoices/${id}`, { credentials: "include" });
    return res.status;
  }, invoiceId);
  expect(status).toBe(404);
  await otherCtx.close();
});
