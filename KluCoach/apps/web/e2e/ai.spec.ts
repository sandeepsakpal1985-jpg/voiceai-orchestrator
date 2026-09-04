import { expect, test } from "@playwright/test";
import { csrfPostStatus, expectHeading, loginAs } from "./helpers";

test("parent asks about Aarav, then Diya, and cannot tamper studentId", async ({ page, browser }) => {
  await loginAs(page, "parent@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByTestId("ai-panel")).toBeVisible();
  await page.getByRole("button", { name: "How is my child doing?" }).click();
  await expect(page.getByTestId("ai-answer")).toContainText(/Aarav/, { timeout: 15000 });
  await expect(page.getByTestId("ai-answer")).not.toContainText("Diya");
  await expect(page.getByTestId("ai-citations")).toBeVisible();

  await page.getByRole("button", { name: "Diya Sharma", exact: true }).click();
  await expectHeading(page, /Diya/);
  await expect(page.getByRole("heading", { name: /Ask about Diya/ })).toBeVisible();
  await page.getByRole("button", { name: "How is my child doing?" }).click();
  await expect(page.getByTestId("ai-answer")).toContainText(/Diya/, { timeout: 15000 });
  await expect(page.getByTestId("ai-answer")).not.toContainText("Aarav");

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "parent-b@example.test");
  await expectHeading(other, /.+/);
  const foreignId = await other.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { snapshot?: { student?: { id: string } } };
    return body.snapshot?.student?.id ?? null;
  });
  await otherCtx.close();
  expect(foreignId).toBeTruthy();
  const denied = await csrfPostStatus(page, `/ai/students/${foreignId}/ask`, { message: "How is my child doing?" });
  expect(denied).toBe(404);
});

test("student asks about own progress and cannot ask about a sibling", async ({ page, browser }) => {
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await loginAs(parent, "parent@example.test");
  await expectHeading(parent, /Aarav/);
  const diyaId = await parent.evaluate(async () => {
    const res = await fetch("/api/dashboard/parent", { credentials: "include" });
    const body = (await res.json()) as { children: { id: string; firstName: string }[] };
    return body.children.find((c) => c.firstName === "Diya")!.id;
  });
  await parentCtx.close();

  await loginAs(page, "student@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByRole("heading", { name: "Ask about my progress" })).toBeVisible();
  await page.getByRole("button", { name: "How am I doing?" }).click();
  await expect(page.getByTestId("ai-answer")).toContainText(/Aarav/, { timeout: 15000 });
  await expect(page.getByTestId("ai-answer")).not.toContainText("Diya");

  const denied = await csrfPostStatus(page, `/ai/students/${diyaId}/ask`, { message: "How is Diya doing?" });
  expect(denied).toBe(404);
});

test("teacher asks about an authorized batch and cannot ask about tenant B", async ({ page, browser }) => {
  await loginAs(page, "teacher@example.test");
  await page.getByRole("link", { name: "Batches" }).click();
  await expectHeading(page, "Batches");
  await page.getByText("JEE 2027 Morning Batch", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /AI insights/ })).toBeVisible();
  await page.getByRole("button", { name: "How is attendance?" }).click();
  await expect(page.getByTestId("ai-answer")).toContainText(/JEE 2027 Morning Batch/, { timeout: 15000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "teacher-b@example.test");
  await other.getByRole("link", { name: "Batches" }).click();
  await expectHeading(other, "Batches");
  const foreignBatchId = await other.evaluate(async () => {
    const res = await fetch("/api/batches?page=1", { credentials: "include" });
    const body = (await res.json()) as { items?: { id: string }[] };
    return body.items?.[0]?.id ?? null;
  });
  await otherCtx.close();
  expect(foreignBatchId).toBeTruthy();
  const denied = await csrfPostStatus(page, `/ai/batches/${foreignBatchId}/ask`, { message: "How is attendance?" });
  expect(denied).toBe(404);
});

test("admin asks institution questions and cannot read tenant B students", async ({ page, browser }) => {
  await loginAs(page, "admin@example.test");
  await expectHeading(page, "Institute snapshot");
  await expect(page.getByRole("heading", { name: "Institution insights" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "How is attendance?" }).click();
  await expect(page.getByTestId("ai-answer")).toContainText(/active students|batches/i, { timeout: 15000 });

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAs(other, "admin-b@example.test");
  await expectHeading(other, "Institute snapshot");
  const foreignStudentId = await other.evaluate(async () => {
    const res = await fetch("/api/students", { credentials: "include" });
    const body = (await res.json()) as { id: string }[] | { items?: { id: string }[] };
    if (Array.isArray(body)) return body[0]?.id ?? null;
    return body.items?.[0]?.id ?? null;
  });
  await otherCtx.close();
  expect(foreignStudentId).toBeTruthy();
  const denied = await csrfPostStatus(page, `/ai/students/${foreignStudentId}/ask`, { message: "How is attendance?" });
  expect(denied).toBe(404);
});

test("AI disabled state renders when status reports AI off", async ({ page }) => {
  await page.route("**/api/ai/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, provider: "none" }),
    });
  });
  await loginAs(page, "parent@example.test");
  await expectHeading(page, /Aarav/);
  await expect(page.getByTestId("ai-disabled")).toHaveText(/not enabled for this environment/i);
  await expect(page.getByTestId("ai-ask")).toHaveCount(0);
});
