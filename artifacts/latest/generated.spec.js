const { test, expect } = require('@playwright/test');

test('autonomous regression from latest run', async ({ page }) => {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await page.locator("[data-testid=\"start-trial\"]").click();
  await page.locator("[data-testid=\"create-project\"]").click();
  await page.locator("[data-testid=\"project-name\"]").fill("Demo Launch");
  await page.locator("[data-testid=\"owner-email\"]").fill("qa@example.com");
});
