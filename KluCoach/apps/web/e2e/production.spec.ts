import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, expectHeading, loginAs } from "./helpers";

test("password reset request is generic and completion updates the password", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill("resetme@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByTestId("reset-generic")).toHaveText(/If the account exists/);

  const unknown = await request.post("http://localhost:3100/auth/password-reset/request", {
    data: { email: "does-not-exist@example.test" },
  });
  expect(unknown.ok()).toBeTruthy();
  expect((await unknown.json()).message).toMatch(/If the account exists/);

  await request.post("http://localhost:3100/auth/password-reset/request", {
    data: { email: "resetme@example.test" },
  });
  const tokenRes = await request.get("http://localhost:3100/auth/password-reset/dev-token?email=resetme@example.test");
  expect(tokenRes.ok(), await tokenRes.text()).toBeTruthy();
  const token = ((await tokenRes.json()) as { token: string }).token;
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password").fill("ResetPassw0rd!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByTestId("reset-complete")).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email").fill("resetme@example.test");
  await page.getByLabel("Password").fill("ResetPassw0rd!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectHeading(page, "Institute snapshot");

  await request.post("http://localhost:3100/auth/password-reset/request", {
    data: { email: "resetme@example.test" },
  });
  const restore = await request.get("http://localhost:3100/auth/password-reset/dev-token?email=resetme@example.test");
  const restoreToken = ((await restore.json()) as { token: string }).token;
  await request.post("http://localhost:3100/auth/password-reset/complete", {
    data: { token: restoreToken, password: DEMO_PASSWORD },
  });
});

test("institution billing shows invoices and test payment failure then success", async ({ page }) => {
  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await page.getByRole("link", { name: "Billing" }).click();
  await expectHeading(page, "Billing");
  await expect(page.getByText("KC-2026-0001")).toBeVisible();
  const card = page.getByTestId("invoice-KC-2026-0001");
  const status = page.getByTestId("invoice-status-KC-2026-0001");
  await expect(status).toBeVisible();

  const alreadyPaid = ((await status.textContent()) ?? "").trim() === "PAID";
  if (alreadyPaid) {
    await expect(status).toHaveText("PAID");
    return;
  }
  const pay = card.getByRole("button", { name: "Pay invoice" });
  if (!(await pay.isVisible())) {
    throw new Error("Payment initiation unavailable — start the API with PAYMENTS_ENABLED=true PAYMENT_PROVIDER=test");
  }
  await card.getByRole("button", { name: "Simulate failure" }).click();
  await expect(status).not.toHaveText("PAID");
  await card.getByRole("button", { name: "Pay invoice" }).click();
  await expect(status).toHaveText("PAID", { timeout: 15000 });
});

test("super-admin can renew a subscription without waiting for the calendar", async ({ page }) => {
  await loginAs(page, "superadmin@example.test");
  await expectHeading(page, "Commercial");
  const result = await page.evaluate(async () => {
    const reportRes = await fetch("/api/billing/report", { credentials: "include" });
    const report = (await reportRes.json()) as {
      rows: { institutionId: string; institution: string }[];
    };
    const inst = report.rows.find((r) => r.institution === "Demo Coaching Institute");
    const csrf = document.cookie.match(/(?:^|; )klucoach\.csrf=([^;]*)/)?.[1];
    if (!inst || !csrf) return { status: 0, error: "missing institution or csrf" };
    const res = await fetch("/api/billing/subscriptions/renew", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrf),
      },
      body: JSON.stringify({
        institutionId: inst.institutionId,
        startsAt: "2026-04-01",
        endsAt: "2027-03-31",
        renewalDate: "2027-03-01",
      }),
    });
    return { status: res.status };
  });
  expect(result.status).toBe(200);
});
