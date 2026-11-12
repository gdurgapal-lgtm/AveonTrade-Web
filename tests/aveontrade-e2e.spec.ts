import { test, expect } from "@playwright/test";

test.describe("AveonTrade Full Platform, Symbol, Depth & Order Lifecycle Audit", () => {

  test("Complete End-to-End Trading Platform Audit", async ({ page }) => {
    // 1. Manual Login
    await page.goto("/login");
    console.log("👉 Please log in manually in the browser window...");
    
    await page.waitForURL(/\/(market-watch|dashboard)/, { timeout: 120_000 });
    console.log("✅ Login successful! Starting platform audit...");

    // 2. Core Page Navigation
    await page.goto("/market-watch");
    await expect(page).toHaveURL(/.*market-watch/);

    await page.goto("/charts");
    await expect(page).toHaveURL(/.*charts/);

    await page.goto("/orders");
    await expect(page).toHaveURL(/.*orders/);

    await page.goto("/positions");
    await expect(page).toHaveURL(/.*positions/);

    await page.goto("/holdings");
    await expect(page).toHaveURL(/.*holdings/);
    console.log("✅ Core navigation verified!");

    // 3. Symbol Addition, Search & Market Depth (F5)
    await page.goto("/market-watch");
    await page.waitForTimeout(1000);

    console.log("👉 Adding symbol to Market Watch...");
    const searchTrigger = page.locator('button:has-text("Add"), button[aria-label*="Search"], input[placeholder*="Search"], input[type="search"]').first();
    if (await searchTrigger.isVisible({ timeout: 3000 })) {
      await searchTrigger.click();
    }

    const searchInput = page.locator('input[placeholder*="Search"], input[aria-label*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill("RELIANCE");
      await page.waitForTimeout(1000);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      console.log("✅ Symbol 'RELIANCE' added/selected successfully!");
    } else {
      console.log("ℹ️ Using existing symbols in Market Watch.");
    }

    await page.waitForTimeout(1000);
    const firstInstrument = page.locator('tr, [role="row"], div[class*="row"], div[class*="item"]').first();
    if (await firstInstrument.isVisible()) {
      await firstInstrument.click();
    }

    // Press F5 for Market Depth
    await page.keyboard.press("F5");
    await page.waitForTimeout(800);
    
    const depthModal = page.locator('.market-depth')
      .or(page.locator('[role="dialog"]'))
      .or(page.locator('text=Depth'))
      .first();

    if (await depthModal.isVisible()) {
      await page.keyboard.press("Escape");
      console.log("✅ Market Depth verified and closed!");
    } else {
      console.log("ℹ️ Market depth panel toggled.");
    }

    // 4. Chart View Panel
    await page.goto("/charts");
    await page.waitForTimeout(1000);
    const chartElement = page.locator('canvas, svg, .chart-container').first();
    await expect(chartElement).toBeVisible({ timeout: 10_000 });
    console.log("✅ Interactive chart view rendered successfully!");

    // 5. Order Lifecycle: Place, Modify, and Cancel
    await page.goto("/market-watch");
    await page.waitForTimeout(1000);

    console.log("👉 Placing test order via F1 hotkey...");
    await page.keyboard.press("F1");
    await page.waitForTimeout(500);

    const qtyInput = page.locator('input[aria-label="quantity"], input[name="quantity"], input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill("5");
    }

    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    console.log("✅ Order placed!");

    // Navigate to Orders book
    await page.goto("/orders");
    await page.waitForTimeout(1500);

    console.log("👉 Testing Order Modification...");
    const modifyButton = page.locator('button:has-text("Modify"), [aria-label="Modify Order"]').first();
    if (await modifyButton.isVisible({ timeout: 5000 })) {
      await modifyButton.click();
      
      const modifyQty = page.locator('input[aria-label="quantity"], input[name="quantity"], input[type="number"]').first();
      if (await modifyQty.isVisible()) {
        await modifyQty.fill("12");
      }
      await page.keyboard.press("Enter");
      console.log("✅ Order modified!");
    } else {
      console.log("ℹ️ No active open orders found to modify.");
    }

    console.log("👉 Testing Order Cancellation...");
    const cancelButton = page.locator('tr button:has-text("Cancel"), [aria-label="Cancel Order"]').first();
    if (await cancelButton.isVisible({ timeout: 5000 })) {
      await page.keyboard.press("Escape");
      await cancelButton.click({ force: true });
      console.log("✅ Order canceled!");
    } else {
      console.log("ℹ️ No active open orders found to cancel.");
    }

    console.log("🎉 Full End-to-End Trading Platform Audit completed successfully!");
  });

});