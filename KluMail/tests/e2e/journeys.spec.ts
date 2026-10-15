import { expect, test, type Page } from "@playwright/test";

const password = "correct-horse-1";

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function register(page: Page, email: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?notice=/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

test("organization setup, simulated mailbox, ticket lifecycle, and tenant isolation", async ({ page, browser }) => {
  const id = stamp();
  const adminEmail = `admin-${id}@example.com`;
  const agentEmail = `agent-${id}@example.com`;
  const otherEmail = `other-${id}@example.com`;

  await register(page, adminEmail, "Admin User");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill(`Acme ${id}`);
  await page.getByLabel("Timezone").fill("UTC");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: "Organization queue" })).toBeVisible();

  await page.getByRole("link", { name: "Teams" }).click();
  await page.getByLabel("Name").fill("Support");
  await page.getByLabel("Description").fill("Customer support");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();

  await page.getByRole("link", { name: "Users" }).click();
  await page.getByLabel("Email").fill(agentEmail);
  await page.getByLabel("Role").selectOption("agent");
  await page.getByRole("button", { name: "Invite" }).click();
  const invite = page.locator(".banner").filter({ hasText: "/invite/" });
  await expect(invite).toBeVisible();
  const invitePath = (await invite.textContent())?.match(/\/invite\/[A-Za-z0-9_-]+/)?.[0];
  expect(invitePath).toBeTruthy();

  await page.getByRole("link", { name: "Mailboxes" }).click();
  await page.getByLabel("Provider").selectOption("mock");
  await page.getByLabel("Team").selectOption({ label: "Support" });
  await page.getByLabel("Mailbox address").fill(`support-${id}@example.com`);
  await page.getByRole("button", { name: "Connect mailbox" }).click();
  await expect(page.getByText("Simulated development mailbox")).toBeVisible();

  await page.getByLabel("From").fill(`customer-${id}@example.com`);
  await page.getByLabel("Subject").fill(`Printer jam ${id}`);
  await page.getByLabel("Body").fill("The printer on floor two is jammed.");
  await page.getByRole("button", { name: "Inject and sync" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`Printer jam ${id}`) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`Printer jam ${id}`) }).click();
  await expect(page).toHaveURL(/\/tickets\//);
  await expect(page.getByText("This ticket came from a simulated mailbox")).toBeVisible();

  await page.locator("form", { has: page.getByRole("button", { name: "Update status" }) }).getByLabel("Status").selectOption("in_progress");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("in progress", { exact: false }).first()).toBeVisible();

  await page.getByLabel("Message").fill("We are sending a technician.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Accepted by mailbox")).toBeVisible();

  await page.getByRole("heading", { name: "Internal note" }).locator("..").getByRole("textbox").fill("Checked the toner. Do not send this to the customer.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Checked the toner")).toBeVisible();
  await expect(page.getByRole("strong").filter({ hasText: "Internal note" })).toBeVisible();

  await page.getByLabel("Status").selectOption("resolved");
  await page.getByLabel("Resolution note").fill("Technician replaced the roller.");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.locator("span.badge").first()).toContainText("resolved");

  await page.getByLabel("Status").selectOption("open");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.locator("span.badge").first()).toContainText("open");

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tickets created" })).toBeVisible();
  const exportResponse = await page.request.get("/api/reports/tickets.csv");
  expect(exportResponse.ok()).toBeTruthy();
  expect(await exportResponse.text()).toContain("Printer jam");

  const agentContext = await browser.newContext();
  const agentPage = await agentContext.newPage();
  await register(agentPage, agentEmail, "Agent User");
  await agentPage.goto(invitePath ?? "/");
  await agentPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(agentPage.getByRole("heading", { name: "My queue" })).toBeVisible();
  const denied = await agentPage.request.get("/api/reports/tickets.csv");
  expect(denied.status()).toBe(403);
  await agentContext.close();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await register(otherPage, otherEmail, "Other Admin");
  await otherPage.getByLabel("Organization name").fill(`Other ${id}`);
  await otherPage.getByLabel("Timezone").fill("UTC");
  await otherPage.getByRole("button", { name: "Create organization" }).click();
  const leaked = await otherPage.request.get("/api/tickets?view=all&q=" + encodeURIComponent(`Printer jam ${id}`));
  expect(leaked.ok()).toBeTruthy();
  const body = await leaked.json();
  expect(body.total).toBe(0);
  await otherContext.close();
});
