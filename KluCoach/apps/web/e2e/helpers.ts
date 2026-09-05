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

export async function apiJson<T>(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const me = await fetch("/api/me", { credentials: "include" });
      const session = (await me.json()) as { csrfToken?: string };
      const res = await fetch(`/api${path}`, {
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken ?? "",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: T | null = null;
      try {
        json = text ? (JSON.parse(text) as T) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
    { method, path, body },
  );
}

export async function csrfPostStatus(page: Page, path: string, body: unknown) {
  const res = await apiJson(page, "POST", path, body);
  return res.status;
}
