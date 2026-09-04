import { type Page, expect } from "@playwright/test";

export const DEMO_PASSWORD = "DemoPassw0rd!";

export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name }).first()).toBeVisible({ timeout: 15000 });
}

export async function csrfPostStatus(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const me = await fetch("/api/me", { credentials: "include" });
      const session = (await me.json()) as { csrfToken?: string };
      const res = await fetch(`/api${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken ?? "",
        },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    { path, body },
  );
}
