import { test, expect, type Page } from "@playwright/test";

/**
 * UI edge cases found in the 2026-10-01 deep-dive, against the real stack:
 * body-text search, upload validation and MIME detection, chat errors that
 * used to vanish, mixed-case email login, and concurrent token refresh across tabs.
 */

const PASSWORD = "Password123!";
const STORAGE_KEY = "docuflow_auth";

function uniqueEmail(label: string) {
  return `e2e-edge-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Eve");
  await page.getByLabel("Last name").fill("Edge");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Organization name").fill("Edge Org");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

async function readSession(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
}

const fileInput = (page: Page) => page.locator('input[type="file"]');

/** Minimal single-page PDF with a real text layer. */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

test.describe("documents", () => {
  test("search finds a document by words that only appear in its body", async ({ page }) => {
    await signUp(page, uniqueEmail("body"));
    const marker = `kumquat${Date.now()}`;
    await fileInput(page).setInputFiles({
      name: "minutes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`Board minutes. The ${marker} budget was approved.`),
    });
    await expect(page.getByText("✓ Ready")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "AI Search" }).click();
    await page.getByPlaceholder("Ask anything about your documents...").fill(marker);
    await page.locator("select.search-mode").selectOption("fulltext");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText("minutes.txt")).toBeVisible();
    await expect(page.locator("mark", { hasText: marker })).toBeVisible();
  });

  test("indexes PDF text, and shows why an unreadable PDF failed", async ({ page }) => {
    await signUp(page, uniqueEmail("pdf"));
    const marker = `quokka${Date.now()}`;
    await fileInput(page).setInputFiles({
      name: "warranty.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(`Warranty terms. The ${marker} model is covered for 18 months.`),
    });
    await expect(page.locator(".doc-row", { hasText: "warranty.pdf" }).getByText("✓ Ready")).toBeVisible({
      timeout: 20_000,
    });
    await fileInput(page).setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 truncated garbage"),
    });
    const broken = page.locator(".doc-item", { hasText: "broken.pdf" });
    await expect(broken.getByText("FAILED")).toBeVisible({ timeout: 20_000 });
    await expect(broken.locator(".doc-failure")).toContainText(/could not read pdf/i);

    await page.getByRole("button", { name: "AI Search" }).click();
    await page.getByPlaceholder("Ask anything about your documents...").fill(marker);
    await page.locator("select.search-mode").selectOption("fulltext");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("warranty.pdf")).toBeVisible();
    await expect(page.locator("mark", { hasText: marker })).toBeVisible();
  });

  test("detects Markdown files the browser reports without a MIME type", async ({ page }) => {
    await signUp(page, uniqueEmail("md"));
    await fileInput(page).setInputFiles({ name: "notes.md", mimeType: "", buffer: Buffer.from("# Notes\n\nhello") });
    await expect(page.getByText("notes.md")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".auth-error")).toHaveCount(0);
  });

  test("rejects unsupported and empty files before contacting the API", async ({ page }) => {
    await signUp(page, uniqueEmail("reject"));
    const uploadCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/documents/upload-url") && uploadCalls.push(r.url()));

    await fileInput(page).setInputFiles({ name: "archive.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
    await expect(page.getByText(`"archive.zip" isn't a supported file type`)).toBeVisible();

    await fileInput(page).setInputFiles({ name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) });
    await expect(page.getByText(`"empty.txt" is empty`)).toBeVisible();

    expect(uploadCalls).toEqual([]);
    await expect(page.getByText("No documents yet")).toBeVisible();
  });
});

test.describe("chat", () => {
  test("keeps the error visible when AI is not configured", async ({ page }) => {
    await signUp(page, uniqueEmail("chat"));
    await page.getByRole("button", { name: "AI Chat" }).click();
    await page.getByPlaceholder("Ask a question about your documents...").fill("What is in my documents?");
    await page.keyboard.press("Enter");

    await expect(page.locator(".chat-msg-user")).toContainText("What is in my documents?");
    // The error used to flash for one render and disappear with the stream.
    const error = page.getByRole("alert").filter({ hasText: /not configured/i });
    await expect(error).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(error).toBeVisible();
    await expect(page.getByPlaceholder("Ask a question about your documents...")).toBeEnabled();
  });
});

test.describe("auth", () => {
  test("an account created with a mixed-case email signs in with any casing", async ({ page }) => {
    const email = uniqueEmail("Case").replace("e2e-edge-case", "E2E-Edge-Case");
    await signUp(page, email);
    await page.getByTitle("Sign out").click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email.toLowerCase());
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("two tabs refreshing an expired token at once both stay signed in", async ({ context }) => {
    const first = await context.newPage();
    await signUp(first, uniqueEmail("tabs"));
    const second = await context.newPage();
    await second.goto("/dashboard");
    await expect(second.getByRole("heading", { name: "Documents" })).toBeVisible();

    // Expire the shared access token. Both tabs re-render with it (the
    // `storage` event in the second, a manual session event in the first) and
    // hit the API at once: two 401s racing to use one single-use refresh token.
    const refreshes: number[] = [];
    for (const page of [first, second]) {
      page.on("response", (r) => r.url().endsWith("/auth/refresh") && refreshes.push(r.status()));
    }
    const session = await readSession(first);
    await first.evaluate(
      ([key, s]) => {
        localStorage.setItem(key, JSON.stringify({ ...s, accessToken: "expired.token.value" }));
        window.dispatchEvent(new Event("docuflow-auth-change"));
      },
      [STORAGE_KEY, session] as const
    );

    await expect.poll(() => readSession(first).then((s) => s?.accessToken)).not.toBe("expired.token.value");
    await first.waitForTimeout(1000);
    for (const page of [first, second]) {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText("No documents yet")).toBeVisible();
    }
    // Serialized across tabs: one refresh, reused by the other tab
    expect(refreshes).toEqual([200]);

    const after = await readSession(first);
    expect(after?.accessToken).toBeTruthy();
    expect(after.accessToken).not.toBe("expired.token.value");
  });
});
