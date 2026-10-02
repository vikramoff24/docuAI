import { test, expect, type Page } from "@playwright/test";

/**
 * Core user journey against the real stack:
 *   sign up → dashboard → upload → search → AI agent workflow → logout → login
 * plus session edge cases (expired access token, revoked refresh token).
 */

const PASSWORD = "Password123!";
const STORAGE_KEY = "docuflow_auth";

function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Eve");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Organization name").fill("E2E Org");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

async function readSession(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
}

test.describe("auth journey", () => {
  test("redirects anonymous users from the dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign up, log out, log back in", async ({ page }) => {
    const email = uniqueEmail("auth");
    await signUp(page, email);

    await expect(page.getByText("Eve Tester")).toBeVisible();
    await expect(page.getByText("E2E Org")).toBeVisible();
    await expect(page.getByText("No documents yet")).toBeVisible();

    await page.getByTitle("Sign out").click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await readSession(page)).toBeNull();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Eve Tester")).toBeVisible();
  });

  test("shows an error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("nobody"));
    await page.getByLabel("Password").fill("WrongPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("session refresh", () => {
  test("transparently refreshes an expired access token", async ({ page }) => {
    await signUp(page, uniqueEmail("refresh"));
    const before = await readSession(page);

    // Simulate expiry: the API rejects this token with 401.
    await page.evaluate(
      ([key, s]) => localStorage.setItem(key, JSON.stringify({ ...s, accessToken: "expired.token.value" })),
      [STORAGE_KEY, before] as const
    );
    await page.reload();

    await expect(page.getByText("No documents yet")).toBeVisible();
    const after = await readSession(page);
    expect(after.accessToken).not.toBe("expired.token.value");
    expect(after.refreshToken).not.toBe(before.refreshToken); // rotated
  });

  test("logs out when the refresh token is no longer valid", async ({ page }) => {
    await signUp(page, uniqueEmail("revoked"));
    const s = await readSession(page);
    await page.evaluate(
      ([key, sess]) =>
        localStorage.setItem(
          key,
          JSON.stringify({ ...sess, accessToken: "expired.token.value", refreshToken: "revoked" })
        ),
      [STORAGE_KEY, s] as const
    );
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("documents + search", () => {
  test("uploads a document and finds it via search without executing markup in its name", async ({ page }) => {
    await signUp(page, uniqueEmail("docs"));

    const marker = `zebra${Date.now()}`;
    const name = `${marker} <img src=x onerror="window.__xss=1">.txt`;
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(`Quarterly report ${marker}. Revenue grew.`),
    });

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 document in your workspace")).toBeVisible();
    // Search only covers processed documents; wait for the worker like a user would.
    await expect(page.getByText("✓ Ready")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "AI Search" }).click();
    await page.getByPlaceholder("Ask anything about your documents...").fill(marker);
    await page.locator("select.search-mode").selectOption("fulltext");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText(/1 result/)).toBeVisible();
    // The snippet renders the literal markup as text, with the match highlighted.
    await expect(page.locator("mark", { hasText: marker }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe("upload failures", () => {
  test("a failed storage upload shows an error and leaves no orphaned document", async ({ page }) => {
    await signUp(page, uniqueEmail("s3fail"));
    // Simulate storage being unreachable (e.g. CORS/network) for the presigned PUT.
    await page.route(/docuflow-dev/, (route) =>
      route.request().method() === "PUT" ? route.abort() : route.continue()
    );

    await page.locator('input[type="file"]').setInputFiles({
      name: "orphan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("never reaches storage"),
    });

    await expect(page.getByText("Couldn't reach file storage — upload failed")).toBeVisible();
    await expect(page.getByText("No documents yet")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No documents yet")).toBeVisible();
  });
});

test.describe("AI agent", () => {
  test("starts a workflow and follows it to a terminal state", async ({ page }) => {
    await signUp(page, uniqueEmail("agent"));
    await page.getByRole("button", { name: "AI Agent" }).click();
    await expect(page.getByRole("heading", { name: "AI Agent" })).toBeVisible();
    await expect(page.getByText("No workflows yet")).toBeVisible();

    const run = page.getByRole("button", { name: "Run agent" });
    await expect(run).toBeDisabled();

    await page.getByLabel("Task type").selectOption("document_categorization");
    const instructions = `Tag every invoice as Finance (${Date.now()})`;
    await page.getByLabel("Instructions").fill(instructions);
    await expect(page.getByText(`${instructions.length}/2000`)).toBeVisible();
    await run.click();

    const item = page.getByRole("listitem").filter({ hasText: instructions });
    await expect(item).toBeVisible();
    await expect(page.getByLabel("Instructions")).toHaveValue("");

    // The worker picks the job up; the panel polls until COMPLETED or FAILED.
    // Without OPENAI_API_KEY the run fails with a clear message — both are valid outcomes.
    await expect(item).toHaveAttribute("data-status", /COMPLETED|FAILED/, { timeout: 30_000 });

    const detail = item.locator(".workflow-detail");
    await expect(detail).toBeVisible(); // new workflows are expanded
    const status = await item.getAttribute("data-status");
    if (status === "FAILED") {
      await expect(detail.locator(".workflow-error")).not.toBeEmpty();
    } else {
      await expect(detail.locator(".workflow-result")).not.toBeEmpty();
    }

    // History survives a reload (served by GET /workflows)
    await page.reload();
    await page.getByRole("button", { name: "AI Agent" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: instructions })).toBeVisible();
  });
});

test.describe("settings: OpenAI API key", () => {
  test("agent tab points to Settings when no key is configured", async ({ page }) => {
    await signUp(page, uniqueEmail("nokey"));
    await page.getByRole("button", { name: "AI Agent" }).click();
    await expect(page.getByText("No OpenAI API key configured.")).toBeVisible();

    await page.getByRole("button", { name: "Open Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Not configured.")).toBeVisible();
  });

  test("validates and verifies keys without ever storing a rejected one", async ({ page }) => {
    await signUp(page, uniqueEmail("keys"));
    await page.getByRole("button", { name: "Settings" }).click();

    const form = page.getByRole("form", { name: "OpenAI API key" });
    const input = page.getByLabel("Add key");
    const save = page.getByRole("button", { name: "Verify & save" });
    await expect(input).toHaveAttribute("type", "password");
    await expect(save).toBeDisabled();

    // Show / hide
    await input.fill("not-a-key");
    await page.getByRole("button", { name: "Show key" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide key" }).click();
    await expect(input).toHaveAttribute("type", "password");

    // Malformed → rejected by the API before contacting OpenAI
    await save.click();
    await expect(form.getByRole("alert")).toContainText('should start with "sk-"');

    // Well-formed but fake → OpenAI rejects it (or is unreachable from this machine)
    await input.fill(`sk-proj-e2efake${Date.now()}abcdefghij`);
    await save.click();
    await expect(form.getByRole("alert")).toContainText(/rejected this API key|Couldn't reach OpenAI/, {
      timeout: 15_000,
    });

    // Nothing was stored
    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Not configured.")).toBeVisible();
  });
});
