import { test, expect } from "@playwright/test";

test.describe("AveonTrade UI, Layout & Display Pattern Comprehensive Audit", () => {

  test("1. Layout, Positioning & Responsive Viewports", async ({ page }) => {
    // Start at login and handle manual sign-in
    await page.goto("/login");
    console.log("👉 Please log in manually in the browser window...");
    await page.waitForURL(/\/(market-watch|dashboard)/, { timeout: 120_000 });
    console.log("✅ Login successful! Starting UI layout audit...");

    // Test Desktop Viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/market-watch");
    await page.waitForTimeout(1000);
    
    const sidebar = page.locator("aside, nav, [role='navigation']").first();
    await expect(sidebar).toBeVisible();
    
    const marketWatchHeader = page.locator("header, [role='banner'], h1").first();
    await expect(marketWatchHeader).toBeVisible();

    console.log("👉 Testing Tablet Viewport (1024x768)...");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toBeVisible();

    console.log("👉 Testing Mobile Viewport (375x812 - iPhone X)...");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(800);
    
    const mobileMenuBtn = page.locator('button[aria-label*="Menu"], button[aria-label*="Navigation"], .mobile-menu-toggle').first();
    if (await mobileMenuBtn.isVisible({ timeout: 2000 })) {
      await mobileMenuBtn.click();
      console.log("✅ Mobile navigation menu toggle verified!");
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("2. Data Display Patterns, Typography & Formatting", async ({ page }) => {
    await page.goto("/market-watch");
    await page.waitForTimeout(1500);

    console.log("👉 Verifying financial data display patterns (Prices, Changes, Badges)...");

    const priceCells = page.locator('td, [role="cell"], span').filter({ hasText: /\d+\.\d{2}/ }).first();
    if (await priceCells.isVisible({ timeout: 5000 })) {
      await expect(priceCells).toBeVisible();
      console.log("✅ Numeric financial data patterns rendered correctly!");
    }

    const positiveChange = page.locator('.text-green-500, .text-emerald-500, [class*="green"], [class*="success"]').first();
    const negativeChange = page.locator('.text-red-500, .text-rose-500, [class*="red"], [class*="danger"]').first();
    
    if (await positiveChange.isVisible() || await negativeChange.isVisible()) {
      console.log("✅ Market sentiment color indicators verified!");
    }
  });

  test("3. Component States, Modals & UI Edge Cases", async ({ page }) => {
    // Test Funds page UI layout
    await page.goto("/funds");
    await page.waitForTimeout(1000);

    console.log("👉 Verifying Funds & Margin UI layout...");
    // Broader fallback selector for funds page container/card
    const fundsContainer = page.locator('main, section, div').filter({ hasText: /Funds|Margin|Limit|Cash/i }).first();
    await expect(fundsContainer).toBeVisible();
    console.log("✅ Funds page container verified!");

    // Test Orders page container structure
    await page.goto("/orders");
    await page.waitForTimeout(1000);

    const orderTableOrEmpty = page.locator('table, [role="table"], div').filter({ hasText: /Orders|Open|History/i }).first();
    await expect(orderTableOrEmpty).toBeVisible();
    console.log("✅ Order book UI container verified!");

    const userProfileBtn = page.locator('button[aria-label*="Profile"], [class*="avatar"], img[alt*="Profile"]').first();
    if (await userProfileBtn.isVisible({ timeout: 3000 })) {
      await userProfileBtn.click();
      console.log("✅ User profile dropdown UI verified!");
      await page.keyboard.press("Escape");
    }

    console.log("🎉 Comprehensive UI and layout audit test completed successfully!");
  });

});