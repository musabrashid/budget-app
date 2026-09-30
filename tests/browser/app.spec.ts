import { test, expect } from "@playwright/test";
test("budget overview renders safely with no overflow or client errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Your month, at a glance." }),
  ).toBeVisible();
  await expect(page.locator(".big-money")).toHaveText("$4,787.18");
  await expect(
    page.getByRole("heading", { name: /Needs a little attention/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("custom category, budget, and manual transaction edits persist after reload", async ({
  page,
}) => {
  await page.goto("/demo/budgets");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Coffee");
  await page.getByLabel("Recurring monthly budget ($)").fill("120");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.locator(".budget-card").filter({ hasText: "Coffee" }),
  ).toBeVisible();
  await page.goto("/demo/transactions");
  await page
    .locator(".transaction-row")
    .filter({ hasText: "Café North" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Coffee" });
  await dialog.getByLabel("Notes").fill("Monthly coffee check-in");
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await page.reload();
  await page
    .locator(".transaction-row")
    .filter({ hasText: "Café North" })
    .click();
  await expect(page.getByLabel("Notes")).toHaveValue("Monthly coffee check-in");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/demo/budgets");
  await page.locator(".budget-card").filter({ hasText: "Coffee" }).click();
  await page.getByRole("button", { name: "Change budget" }).click();
  await page.getByLabel("Budget amount ($)").fill("900");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await page.reload();
  const coffee = page.locator(".budget-card").filter({ hasText: "Coffee" });
  await expect(coffee).toContainText("$900");
  await expect(coffee).toContainText("Watch");
});
test("rules, pending preference, dark mode, and account inclusion work", async ({
  page,
}) => {
  await page.goto("/demo/settings");
  await page.getByRole("button", { name: "New rule", exact: true }).click();
  await page.getByLabel("Text to match").fill("Whole Foods");
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Dining & Drinks" });
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.locator(".rule-row")).toContainText(
    "Whole Foods → Dining & Drinks",
  );
  await page
    .getByRole("switch", { name: "Include pending transactions", exact: true })
    .uncheck();
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/demo/accounts");
  await page
    .getByRole("switch", { name: "Include Everyday Checking in budget" })
    .uncheck();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Include Everyday Checking in budget" }),
  ).not.toBeChecked();
});
test("deleting custom category preserves history and reassigns its transactions", async ({
  page,
}) => {
  await page.goto("/demo/budgets");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Temporary");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await page.goto("/demo/transactions");
  await page
    .locator(".transaction-row")
    .filter({ hasText: "Whole Foods" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Temporary" });
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await page.goto("/demo/settings");
  await page
    .locator(".category-management-row")
    .filter({ hasText: "Temporary" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByLabel("Move to category")
    .selectOption({ label: "Groceries" });
  await page
    .getByRole("button", { name: "Move transactions and delete" })
    .click();
  await expect(
    page.locator(".category-management-row").filter({ hasText: "Temporary" }),
  ).toHaveCount(0);
  await page.goto("/demo/transactions");
  await expect(
    page.locator(".transaction-row").filter({ hasText: "Whole Foods" }),
  ).toContainText("Groceries");
});
test("PWA manifest and offline screen are accessible", async ({
  page,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  await page.goto("/demo");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("still-shell-v1");
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain("/offline.html");
  expect(cached.some((p) => p.startsWith("/api") || p === "/demo")).toBe(false);
  await page.goto("/offline.html");
  await expect(
    page.getByRole("heading", { name: "A moment to reconnect." }),
  ).toBeVisible();
});
test("private pages and financial endpoints reject anonymous access", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  const r = await request.get("/api/data");
  expect([401, 503]).toContain(r.status());
  expect(await r.json()).not.toHaveProperty("transactions");
  const webhook = await request.post("/api/plaid/webhook", {
    data: {
      item_id: "invalid",
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
    },
  });
  expect(webhook.status()).toBe(401);
});
