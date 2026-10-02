import { test, expect, type Page } from "@playwright/test";

/**
 * Live AI journey against the real stack and the real OpenAI API:
 *   save key in Settings → upload → processing → summarize → semantic/hybrid search
 *   → RAG chat with citations → agent workflow → remove key
 *
 * Opt-in: runs only when E2E_OPENAI_KEY is set (costs a few cents per run).
 *   E2E_OPENAI_KEY=sk-... pnpm test:e2e ai-live
 * Assertions on model output are deliberately loose (facts from the fixtures, not wording).
 */

const OPENAI_KEY = process.env.E2E_OPENAI_KEY;
const PASSWORD = "Password123!";

test.skip(!OPENAI_KEY, "E2E_OPENAI_KEY not set — skipping live OpenAI journey");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const POLICY = {
  name: "pto-policy.txt",
  body:
    "Employee leave policy. Full-time staff receive 25 days of paid vacation per year. " +
    "Unused vacation days may carry over up to 5 days into the next calendar year.",
};
const INVOICE = {
  name: "invoice-acme.txt",
  body:
    "INVOICE #INV-2291 from Acme Cloud Hosting Ltd. Amount due: $4,320.00 USD. " +
    "Due date: 2026-11-15. Services: dedicated servers and bandwidth for September 2026.",
};

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Live");
  await page.getByLabel("Email").fill(`e2e-ai-${Date.now()}@test.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Organization name").fill("AI Live Org");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function upload(page: Page, file: { name: string; body: string }) {
  await page.locator('input[type="file"]').setInputFiles({
    name: file.name,
    mimeType: "text/plain",
    buffer: Buffer.from(file.body),
  });
  await expect(page.locator(".doc-row", { hasText: file.name })).toBeVisible({ timeout: 15_000 });
}

test("full AI journey with a real OpenAI key", async ({ page }) => {
  await signUp(page);

  await test.step("save the key in Settings", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Add key").fill(OPENAI_KEY!);
    await page.getByRole("button", { name: "Verify & save" }).click();
    await expect(page.getByText(/Using your organization's key/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`••••${OPENAI_KEY!.slice(-4)}`)).toBeVisible();
    // The full key is never rendered back.
    expect(await page.content()).not.toContain(OPENAI_KEY!.slice(8, 30));
  });

  await test.step("upload two documents; statuses update without a reload", async () => {
    await page.getByRole("button", { name: "Documents" }).click();
    await upload(page, POLICY);
    await upload(page, INVOICE);
    for (const f of [POLICY, INVOICE]) {
      await expect(page.locator(".doc-row", { hasText: f.name }).getByText("✓ Ready")).toBeVisible({
        timeout: 45_000,
      });
    }
  });

  await test.step("summarize a document", async () => {
    await page.getByRole("button", { name: `Summarize ${INVOICE.name}` }).click();
    const summary = page.getByRole("region", { name: `Summary of ${INVOICE.name}` });
    await expect(summary.locator("li").first()).toBeVisible({ timeout: 45_000 });
    await expect(summary).toContainText(/4,320/);
  });

  await test.step("semantic search finds the policy by meaning", async () => {
    await page.getByRole("button", { name: "AI Search" }).click();
    await page.getByPlaceholder("Ask anything about your documents...").fill("how much time off do employees get");
    await page.locator("select.search-mode").selectOption("semantic");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const first = page.locator(".doc-row").first();
    await expect(first).toContainText(POLICY.name, { timeout: 20_000 });
    await expect(first.locator(".search-score")).toContainText("% match");

    // Hybrid scores are rank-fusion values, not percentages — no badge.
    await page.locator("select.search-mode").selectOption("hybrid");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".doc-row").first()).toContainText(POLICY.name, { timeout: 20_000 });
    await expect(page.locator(".search-score")).toHaveCount(0);
  });

  await test.step("RAG chat answers with citations and keeps the user's message", async () => {
    await page.getByRole("button", { name: "AI Chat" }).click();
    const question = "How many vacation days can carry over, and when is the Acme invoice due?";
    await page.getByPlaceholder("Ask a question about your documents...").fill(question);
    await page.keyboard.press("Enter");

    const userMsg = page.locator('[data-role="user"]', { hasText: question });
    await expect(userMsg).toBeVisible();
    const answer = page.locator('[data-role="assistant"]').last();
    await expect(answer).toBeVisible({ timeout: 45_000 });
    await expect(answer).toContainText(/\b5\b/);
    await expect(answer.getByLabel("Sources")).toContainText(INVOICE.name);
    await expect(userMsg).toBeVisible(); // not wiped when the conversation finished loading

    // Persisted history: roles and citations survive a reload.
    await page.reload();
    await page.getByRole("button", { name: "AI Chat" }).click();
    await page.locator(".chat-conv-item").first().click();
    await expect(page.locator('[data-role="user"]', { hasText: question })).toContainText("You");
    await expect(page.locator('[data-role="assistant"]').last().getByLabel("Sources")).toContainText(
      INVOICE.name
    );
  });

  await test.step("agent finds documents by their content", async () => {
    await page.getByRole("button", { name: "AI Agent" }).click();
    await page.getByLabel("Task type").selectOption("general");
    const instructions = `Which documents mention a due date? (${Date.now()})`;
    await page.getByLabel("Instructions").fill(instructions);
    await page.getByRole("button", { name: "Run agent" }).click();
    const item = page.getByRole("listitem").filter({ hasText: instructions });
    await expect(item).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });
    await expect(item.locator(".workflow-result")).toContainText(/invoice/i);
  });

  await test.step("remove the key", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Remove key" }).click();
    await page.getByRole("button", { name: "Click again to remove" }).click();
    await expect(page.getByText("Not configured.")).toBeVisible();
  });
});

test("documents uploaded before a key is added get indexed from Settings", async ({ page }) => {
  await signUp(page);
  const MANUAL = {
    name: "espresso-manual.txt",
    body: "Descaling guide: run the citric acid cycle on the Barista Pro every 90 days to remove limescale.",
  };

  await test.step("upload without a key: stored, but not embedded", async () => {
    await upload(page, MANUAL);
    await expect(page.locator(".doc-row", { hasText: MANUAL.name }).getByText("✓ Ready")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("add the key; Settings offers to reindex the document", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Add key").fill(OPENAI_KEY!);
    await page.getByRole("button", { name: "Verify & save" }).click();
    await expect(page.getByText(/1 document isn't fully indexed/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Reindex 1 document" }).click();
    await expect(page.getByText(/Reindexing 1 document/)).toBeVisible();
  });

  await test.step("semantic search now finds it by meaning", async () => {
    await page.getByRole("button", { name: "Documents" }).click();
    await expect(page.locator(".doc-row", { hasText: MANUAL.name }).getByText("✓ Ready")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "AI Search" }).click();
    await page.getByPlaceholder("Ask anything about your documents...").fill("how often should the coffee machine be cleaned of mineral buildup");
    await page.locator("select.search-mode").selectOption("semantic");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".doc-row").first()).toContainText(MANUAL.name, { timeout: 20_000 });
    await expect(page.locator(".search-score").first()).toContainText("% match");
  });

  await test.step("nothing left to index", async () => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText(/fully indexed/)).toHaveCount(0);
    await page.getByRole("button", { name: "Remove key" }).click();
    await page.getByRole("button", { name: "Click again to remove" }).click();
  });
});
