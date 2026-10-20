import { test, expect } from "@playwright/test";
import seed from "../../src/data/routine.json";
test("logs persist, reader cannot edit, preview is isolated, and replacement has recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your training, in focus." }),
  ).toBeVisible();
  await expect(page.getByText("Saved on this device")).toBeAttached();
  const reps = page.getByRole("spinbutton", {
    name: "Set 1 reps for Cossack Squat",
    exact: true,
  });
  await reps.fill("12");
  await page
    .getByRole("textbox", { name: "Set 1 load for Cossack Squat", exact: true })
    .fill("BW");
  await page
    .getByRole("button", { name: "Set 1 done for Cossack Squat", exact: true })
    .click();
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.reload();
  await expect(reps).toHaveValue("12");
  await expect(
    page.getByRole("textbox", {
      name: "Set 1 load for Cossack Squat",
      exact: true,
    }),
  ).toHaveValue("BW");
  await page.getByRole("button", { name: "Reader", exact: true }).click();
  await expect(reps).toBeDisabled();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.goto("/#sync");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(seed)),
    });
  await expect(page.getByText("Preview: restore.json")).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.goto("/#workout");
  await expect(reps).toHaveValue("12");
  await page.goto("/#sync");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(seed)),
    });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Replace local data" }).click();
  await expect(page.getByText("Preview: restore.json")).toHaveCount(0);
  await page.getByRole("button", { name: "Open recovery copy" }).click();
  await expect(page.getByText("Preview: Previous local dataset")).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.goto("/#workout");
  await expect(reps).toHaveValue("");
});
test("rejects a second active tab and preserves offline sessions", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your training, in focus." }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByText(/Another tab has this journal open/),
  ).toBeVisible();
  await other.close();
  await page.waitForFunction(async () =>
    Boolean(await navigator.serviceWorker.getRegistration()),
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your training, in focus." }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("mobile layout stays within viewport and creates a blank new week", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your training, in focus." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "New week", exact: true }).click();
  await page.getByRole("button", { name: "Create week" }).click();
  await expect(
    page.getByRole("combobox", { name: "Select training week" }),
  ).toContainText("Week 1");
  await expect(
    page.getByRole("spinbutton", {
      name: "Set 1 reps for Cossack Squat",
      exact: true,
    }),
  ).toHaveValue("");
});
