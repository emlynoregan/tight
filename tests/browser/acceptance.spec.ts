import { expect, test, type Page } from "@playwright/test";

async function boot(page: Page, query = "?new=1&seed=0"): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator(".tight-plane")).toContainText("tick", { timeout: 30_000 });
}

test.describe("Tight browser acceptance", () => {
  test("boots the production static build without external media", async ({ page }) => {
    const extra: string[] = [];
    page.on("request", (request) => {
      if (/\.(png|jpe?g|gif|webp|mp3|ogg|wav)(\?|$)/i.test(request.url())) {
        extra.push(request.url());
      }
    });
    await boot(page);
    await expect(page.locator(".tight-hp")).toContainText("HP");
    await expect(page.locator("canvas")).toHaveAttribute("aria-label", "Current plane");
    await expect(page.locator(".gem")).toHaveCount(16);
    expect(await page.locator("img").count()).toBe(0);
    expect(extra).toEqual([]);
  });

  test("opens settings, copies seed, and starts a New Game", async ({ page }) => {
    await boot(page, "?new=1&seed=0");
    await page.keyboard.press("o");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.locator("[data-seed-input]")).toHaveValue("0");
    await page.locator("[data-seed-input]").fill("seed-alpha");
    await page.getByRole("button", { name: "New Game" }).click();
    await expect(page.getByRole("heading", { name: "Start a New Game?" })).toBeVisible();
    await page.getByRole("button", { name: "Replace save" }).click();
    await page.keyboard.press("o");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-seed-input]")).toHaveValue("seed-alpha");
  });

  test("moves, pauses in a modal, and restores after reload", async ({ page }) => {
    await boot(page);
    await page.keyboard.press("Space");
    await expect(page.locator(".tight-plane")).toContainText("tick 1", { timeout: 4_000 });
    await page.keyboard.press("i");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    const paused = await page.locator(".tight-plane").textContent();
    await page.waitForTimeout(1200);
    expect(await page.locator(".tight-plane").textContent()).toBe(paused);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Inventory" })).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".tight-plane")).toContainText("tick 1", { timeout: 30_000 });
  });

  test("uses a healing herb from the inventory modal", async ({ page }) => {
    await boot(page);
    await page.keyboard.press("i");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    const useHerb = page.locator('[data-cmd="use"][data-item="healing_herb"]');
    await expect(useHerb).toBeVisible();
    await page.waitForTimeout(120);
    await useHerb.click();
    await expect(page.getByRole("heading", { name: "Inventory" })).toHaveCount(0);
    await expect(page.locator(".tight-log")).toContainText("Used healing_herb", { timeout: 4_000 });
  });

  test("exports and imports a save", async ({ page }) => {
    await boot(page);
    await page.keyboard.press("Space");
    await expect(page.locator(".tight-plane")).toContainText("tick 1", { timeout: 4_000 });
    await page.keyboard.press("o");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export save" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    await page.keyboard.press("Escape");
    await page.goto("/?new=1&seed=1");
    await expect(page.locator(".tight-plane")).toContainText("tick 0", { timeout: 30_000 });
    await page.keyboard.press("o");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import save" }).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(path!);
    await expect(page.getByRole("heading", { name: "Import this save?" })).toBeVisible();
    await page.getByRole("button", { name: "Replace save" }).click();
    await expect(page.locator(".tight-plane")).toContainText("tick 1", { timeout: 30_000 });
  });

  test("legend smoke and audio disable after gesture", async ({ page }) => {
    await boot(page);
    await page.mouse.click(10, 10);
    await page.keyboard.press("l");
    await expect(page.locator("#tight-modal-title")).toHaveText("Map key");
    await expect(page.locator(".tight-legend")).toContainText("Leave this plane");
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");
    const audio = page.locator('input[data-app="audio"]');
    await expect(audio).toBeChecked();
    await audio.uncheck();
    await expect(audio).not.toBeChecked();
  });

  test("controlled victory uses the real Olympus boss path", async ({ page }) => {
    await boot(page, "?qa=1&new=1&seed=0");
    await page.evaluate(() => {
      const qa = (window as unknown as { __tightQa: { controller: { debugDefeatOlympus: () => void } } }).__tightQa;
      qa.controller.debugDefeatOlympus();
    });
    await expect(page.getByRole("heading", { name: "Olympus conquered." })).toBeVisible();
    await expect(page.locator(".tight-modal")).toContainText("World seed");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Olympus conquered." })).toHaveCount(0);
  });

  test("activates a real transition through interact", async ({ page }) => {
    await boot(page, "?qa=1&new=1&seed=0");
    const setup = await page.evaluate(() => {
      const qa = (window as unknown as { __tightQa: { controller: { debugStandAtInteractExit: () => { fromPlane: string; destinationPlane: string } } } }).__tightQa;
      return qa.controller.debugStandAtInteractExit();
    });
    expect(setup.fromPlane).not.toBe(setup.destinationPlane);
    await page.keyboard.press("e");
    await expect(page.locator(".tight-plane")).toContainText(`Plane (${setup.destinationPlane})`, { timeout: 4_000 });
    await expect(page.locator(".tight-log")).toContainText("Transition to");
  });

  test("resolves ordinary combat through the attack key", async ({ page }) => {
    await boot(page, "?qa=1&new=1&seed=0");
    await page.evaluate(() => {
      const qa = (window as unknown as { __tightQa: { controller: { debugPlaceAdjacentHostile: () => unknown } } }).__tightQa;
      qa.controller.debugPlaceAdjacentHostile();
    });
    await page.keyboard.press("f");
    await expect(page.locator(".tight-log")).toContainText(/hits|misses|takes/, { timeout: 4_000 });
  });
});
