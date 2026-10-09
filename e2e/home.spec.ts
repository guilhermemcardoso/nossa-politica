import { expect, test } from "@playwright/test";

test("a página inicial mostra o nome do site", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Nossa Política");
  await expect(
    page.getByRole("heading", { level: 1, name: "Nossa Política" }),
  ).toBeVisible();
});
