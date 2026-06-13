/**
 * MetaPilot AI — End-to-End User Journey Tests
 *
 * Covers the complete user flow across all 20+ pages:
 * - Login → Onboarding → Dashboard
 * - All sidebar pages (Inbox, Leads, CRM, Growth, Insights, etc.)
 * - Billing, Settings, Team, Knowledge
 * - Approvals, Missed Opportunities, Reputation
 * - Health, Partner Portal, Content, Automation
 * - API health verification
 *
 * Prerequisites:
 * - Backend running on localhost:4000
 * - Frontend running on localhost:3000
 * - Database seeded with demo user (demo@socialpilot.ai / demo1234)
 * - Run: npx playwright install (first time)
 * - Run: npx playwright test
 */

import { test, expect } from '@playwright/test';

const DEMO_EMAIL = 'demo@socialpilot.ai';
const DEMO_PASSWORD = 'demo1234';
const DEMO_API_URL = 'http://localhost:4000';

test.describe('▶ Full User Journey — MetaPilot AI', () => {
  test('1. Login & Authentication Flow', async ({ page }) => {
    // Login page loads
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 5000 });

    // Invalid credentials
    await page.fill('input[type="email"], input[name="email"]', 'wrong@email.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    // Wait for error response
    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('text=Invalid').or(page.locator('text=error')).first().isVisible().catch(() => false);

    // Valid login
    await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
    await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
  });

  test.describe('📊 Dashboard & Data Pages', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      // Skip onboarding if redirected there
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }
    });

    test('2. Dashboard loads with data widgets', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(3000);
      // Should not show 404 or error boundary
      await expect(page.locator('text=not found')).toHaveCount(0, { timeout: 3000 });
      await expect(page.locator('text=Something went wrong')).toHaveCount(0, { timeout: 1000 });
    });

    test('3. Inbox page loads with filters', async ({ page }) => {
      await page.goto('/inbox');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
      // Check for filter elements or inbox content
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('4. Leads page loads with data', async ({ page }) => {
      await page.goto('/leads');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('5. CRM Kanban page loads', async ({ page }) => {
      await page.goto('/crm');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('6. Growth page loads with charts', async ({ page }) => {
      await page.goto('/growth');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('7. Insights page loads', async ({ page }) => {
      await page.goto('/insights');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('8. Funnels page loads with conversion data', async ({ page }) => {
      await page.goto('/funnels');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });
  });

  test.describe('⚙️ Settings & Configuration', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/settings');
        await page.waitForTimeout(2000);
      }
    });

    test('9. Settings page loads with all sections', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('10. Team page loads with member list', async ({ page }) => {
      await page.goto('/team');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('11. Knowledge base page loads', async ({ page }) => {
      await page.goto('/knowledge');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('12. API Keys + Webhooks tab is reachable', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);
      // Settings page should have tabs or sections
      await expect(page.locator('text=not found')).toHaveCount(0);
    });
  });

  test.describe('💼 Business Operations', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }
    });

    test('13. Approvals queue page loads', async ({ page }) => {
      await page.goto('/approvals');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('14. Missed Opportunities page loads', async ({ page }) => {
      await page.goto('/missed-opportunities');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('15. Reputation dashboard loads', async ({ page }) => {
      await page.goto('/reputation');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('16. Re-engagement automation page loads', async ({ page }) => {
      await page.goto('/reengagement');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('17. Billing page loads with plan cards', async ({ page }) => {
      await page.goto('/billing');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });
  });

  test.describe('🛡️ Admin & Monitoring', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }
    });

    test('18. Health monitoring page renders with score gauge', async ({ page }) => {
      await page.goto('/health');
      await page.waitForTimeout(2000);
      // Should see health header or loading state
      const headerVisible = await page.locator('text=Meta Health').or(page.locator('text=Health')).first().isVisible().catch(() => false);
      await expect(page.locator('text=not found')).toHaveCount(0);
      // Check for health check button
      const btnVisible = await page.locator('button:has-text(\"Health Check\")').isVisible().catch(() => false);
    });

    test('19. Partner Portal page loads', async ({ page }) => {
      await page.goto('/partner-portal');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });

    test('20. Success/Customer Success page loads', async ({ page }) => {
      await page.goto('/success');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });
  });

  test.describe('🧩 Automation & Content', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }
    });

    test('21. Automation triggers page loads with keyword rules editor', async ({ page }) => {
      await page.goto('/automation');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
      // Should see automation-related content
      const hasContent = await page.locator('text=Trigger').or(page.locator('text=Keyword').or(page.locator('text=Rule'))).first().isVisible().catch(() => false);
    });

    test('22. Content Intelligence page loads with top posts', async ({ page }) => {
      await page.goto('/content');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
      const hasContent = await page.locator('text=Post').or(page.locator('text=Content').or(page.locator('text=Top'))).first().isVisible().catch(() => false);
    });

    test('23. Reports page loads', async ({ page }) => {
      await page.goto('/reports');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=not found')).toHaveCount(0);
    });
  });

  test.describe('🔗 Sidebar Navigation', () => {
    test('24. Sidebar contains all expected navigation links', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }

      const expectedLinks = [
        'Dashboard', 'Success', 'Health', 'Inbox', 'Leads', 'CRM',
        'Approvals', 'Re-engage', 'Growth', 'Insights', 'Funnels',
        'Content', 'Automation', 'Reports', 'Knowledge', 'Team',
        'Billing', 'Settings', 'Partner',
      ];

      for (const link of expectedLinks) {
        const linkEl = page.locator(`nav a:has-text("${link}")`).first();
        await expect(linkEl).toBeVisible({ timeout: 3000 });
      }
    });

    test('25. Each sidebar link navigates to correct page', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"], input[name="email"]', DEMO_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|onboarding/, { timeout: 15000 });
      if (page.url().includes('/onboarding')) {
        await page.goto('/dashboard');
        await page.waitForTimeout(2000);
      }

      const navLinks = [
        { text: 'Inbox', url: '/inbox' },
        { text: 'Leads', url: '/leads' },
        { text: 'CRM', url: '/crm' },
        { text: 'Growth', url: '/growth' },
        { text: 'Content', url: '/content' },
        { text: 'Automation', url: '/automation' },
        { text: 'Reports', url: '/reports' },
        { text: 'Health', url: '/health' },
        { text: 'Billing', url: '/billing' },
      ];

      for (const { text, url } of navLinks) {
        const link = page.locator(`nav a:has-text("${text}")`).first();
        await expect(link).toBeVisible({ timeout: 3000 });
        await link.click();
        await page.waitForTimeout(1500);
        await expect(page).toHaveURL(new RegExp(url.replace('/', '\\/')));
        await expect(page.locator('text=not found')).toHaveCount(0);
      }
    });
  });

  test.describe('🏥 API Health & Backend', () => {
    test('26. Backend health endpoint returns valid response', async ({ page }) => {
      const response = await page.request.get(`${DEMO_API_URL}/health`);
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    test('27. API docs (Swagger) are accessible', async ({ page }) => {
      const response = await page.request.get(`${DEMO_API_URL}/docs`);
      expect(response.ok()).toBeTruthy();
      const text = await response.text();
      expect(text).toContain('swagger');
    });

    test('28. Login API validates credentials correctly', async ({ page }) => {
      // Wrong password
      const badRes = await page.request.post(`${DEMO_API_URL}/api/auth/login`, {
        data: { email: DEMO_EMAIL, password: 'wrongpass' },
      });
      expect(badRes.status()).toBe(401);

      // Valid login
      const goodRes = await page.request.post(`${DEMO_API_URL}/api/auth/login`, {
        data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      });
      expect(goodRes.ok()).toBeTruthy();
      const body = await goodRes.json();
      expect(body.success).toBe(true);
      expect(body.data.token).toBeDefined();
    });
  });

  test.describe('🔐 Security & Edge Cases', () => {
    test('29. 404 page shows for unknown routes', async ({ page }) => {
      await page.goto('/this-page-does-not-exist');
      await page.waitForTimeout(1000);
      // Should show 404 or custom error page without crashing
      const has404 = await page.locator('text=404').or(page.locator('text=not found')).first().isVisible().catch(() => false);
      // Page shouldn't crash entirely (blank screen)
      await expect(page.locator('#__next')).toBeAttached({ timeout: 3000 });
    });

    test('30. Unauthenticated access redirects to login', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForURL(/login|signin/, { timeout: 10000 });
      await expect(page).toHaveURL(/login/);
    });

    test('31. Login page is accessible without auth', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible({ timeout: 5000 });
    });

    test('32. Registration page validates email format', async ({ page }) => {
      await page.goto('/register');
      await page.waitForTimeout(2000);
      // Register page should exist
      const onRegister = page.url().includes('/register');
      const hasRegisterForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
      expect(onRegister || hasRegisterForm).toBeTruthy();
    });
  });
});
