import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Team & workspace journeys against the real stack:
 *   invite link → newcomer signs up straight into the org
 *   existing user accepts → org switcher → resumes last org after login
 *   role change / removal take effect for the other person
 *   folders: create, upload into, move out, delete
 *   retry a failed document
 * Each person gets their own browser context (separate localStorage session).
 */

const PASSWORD = "Password123!";

function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

async function signUp(page: Page, email: string, org: string, first = "Eve") {
  await page.goto("/signup");
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Organization name").fill(org);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

async function newPerson(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept()); // confirm() on remove/delete
  return page;
}

/** Owner creates an invite in the Team tab and returns the link. */
async function createInvite(owner: Page, email: string, role: "Viewer" | "Member" | "Admin") {
  await owner.getByRole("button", { name: "Team" }).click();
  await owner.getByLabel("Email").fill(email);
  await owner.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await owner.getByRole("button", { name: "Create invite link" }).click();
  const link = owner.getByLabel(`Invitation link for ${email}`).first();
  await expect(link).toBeVisible();
  return link.inputValue();
}

const orgName = (page: Page) => page.locator(".org-switcher-name");

test.describe("team", () => {
  test("a newcomer joins through an invite link and sees the team's documents", async ({ page, browser }) => {
    page.on("dialog", (d) => d.accept());
    const org = `Acme ${Date.now()}`;
    await signUp(page, uniqueEmail("owner"), org, "Olivia");
    await page.locator('input[type="file"]').setInputFiles({
      name: "handbook.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Team handbook: we ship on Thursdays."),
    });
    await expect(page.getByText("handbook.txt")).toBeVisible({ timeout: 15_000 });

    const newcomer = uniqueEmail("newcomer");
    const link = await createInvite(page, newcomer, "Member");
    await expect(page.getByRole("list", { name: "Pending invitations" })).toContainText(newcomer);

    const guest = await newPerson(browser);
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: `Join ${org}` })).toBeVisible();
    await expect(guest.getByText(/Olivia Tester invited/)).toBeVisible();
    await guest.getByRole("link", { name: "Create account & join" }).click();

    // Email is fixed to the invited address and no organization is created
    await expect(guest.getByLabel("Email")).toHaveValue(newcomer);
    await expect(guest.getByLabel("Email")).toHaveAttribute("readonly", "");
    await expect(guest.getByLabel("Organization name")).toHaveCount(0);
    await guest.getByLabel("First name").fill("Nina");
    await guest.getByLabel("Last name").fill("New");
    await guest.getByLabel("Password").fill(PASSWORD);
    await guest.getByRole("button", { name: `Create account & join ${org}` }).click();

    await expect(guest).toHaveURL(/\/dashboard$/);
    await expect(orgName(guest)).toHaveText(org);
    await expect(guest.getByText("handbook.txt")).toBeVisible();

    // The owner sees them as a member, and the invitation is no longer pending
    await page.getByRole("button", { name: "Documents" }).click();
    await page.getByRole("button", { name: "Team" }).click();
    await expect(page.locator(`.team-row[data-email="${newcomer}"]`)).toContainText("Nina New");
    await expect(page.getByRole("list", { name: "Pending invitations" })).toHaveCount(0);

    // The link can't be reused
    const other = await newPerson(browser);
    await other.goto(link);
    await expect(other.getByText(/This invitation is accepted/)).toBeVisible();
  });

  test("an existing user accepts, switches organizations, and resumes in the last one", async ({ page, browser }) => {
    const ownerOrg = `Owner Co ${Date.now()}`;
    await signUp(page, uniqueEmail("owner2"), ownerOrg);

    const guestEmail = uniqueEmail("existing");
    const guestOrg = `Guest Co ${Date.now()}`;
    const guest = await newPerson(browser);
    await signUp(guest, guestEmail, guestOrg);
    await expect(guest.getByRole("button", { name: "Upload" })).toBeVisible();

    const link = await createInvite(page, guestEmail, "Viewer");
    await guest.goto(link);
    await guest.getByRole("button", { name: `Accept & open ${ownerOrg}` }).click();

    await expect(guest).toHaveURL(/\/dashboard$/);
    await expect(orgName(guest)).toHaveText(ownerOrg);
    // Viewer in this org: no uploads
    await expect(guest.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Upload" })).toHaveCount(0);

    // Switch back through the sidebar
    await guest.getByRole("button", { name: /Switch organization/ }).click();
    await guest.getByRole("option", { name: new RegExp(guestOrg) }).click();
    await expect(orgName(guest)).toHaveText(guestOrg);
    await expect(guest.getByRole("button", { name: "Upload" })).toBeVisible();

    // …and into the other org again; a fresh login resumes there
    await guest.getByRole("button", { name: /Switch organization/ }).click();
    await guest.getByRole("option", { name: new RegExp(ownerOrg) }).click();
    await expect(orgName(guest)).toHaveText(ownerOrg);
    await guest.locator(".sidebar-logout").click();
    await expect(guest).toHaveURL(/\/login$/);
    await guest.getByLabel("Email").fill(guestEmail);
    await guest.getByLabel("Password").fill(PASSWORD);
    await guest.getByRole("button", { name: "Sign in" }).click();
    await expect(orgName(guest)).toHaveText(ownerOrg);
  });

  test("a signed-out invitee with an account is sent to sign in and comes back to accept", async ({ page, browser }) => {
    const ownerOrg = `Signin Co ${Date.now()}`;
    await signUp(page, uniqueEmail("owner3"), ownerOrg);
    const guestEmail = uniqueEmail("returning");
    const setup = await newPerson(browser);
    await signUp(setup, guestEmail, "Their Own Co");

    const link = await createInvite(page, guestEmail, "Member");
    const guest = await newPerson(browser); // signed out
    await guest.goto(link);
    await guest.getByRole("link", { name: "Sign in to accept" }).click();
    await expect(guest.getByLabel("Email")).toHaveValue(guestEmail);
    await guest.getByLabel("Password").fill(PASSWORD);
    await guest.getByRole("button", { name: "Sign in" }).click();

    await expect(guest).toHaveURL(/\/invite\?token=/);
    await guest.getByRole("button", { name: `Accept & open ${ownerOrg}` }).click();
    await expect(orgName(guest)).toHaveText(ownerOrg);
  });

  test("an invite for someone else's address can't be accepted by the signed-in user", async ({ page, browser }) => {
    await signUp(page, uniqueEmail("owner4"), `Mixup Co ${Date.now()}`);
    const link = await createInvite(page, uniqueEmail("intended"), "Member");
    const wrong = await newPerson(browser);
    await signUp(wrong, uniqueEmail("wrong"), "Wrong Co");
    await wrong.goto(link);
    await expect(wrong.getByText(/but this invitation is for/)).toBeVisible();
    await expect(wrong.getByRole("button", { name: /Accept/ })).toHaveCount(0);
  });

  test("role changes and removal apply to the other person's open session", async ({ page, browser }) => {
    page.on("dialog", (d) => d.accept());
    const org = `Roles Co ${Date.now()}`;
    await signUp(page, uniqueEmail("owner5"), org);
    const memberEmail = uniqueEmail("member");
    const link = await createInvite(page, memberEmail, "Member");

    const member = await newPerson(browser);
    await member.goto(link);
    await member.getByRole("link", { name: "Create account & join" }).click();
    await member.getByLabel("First name").fill("Max");
    await member.getByLabel("Last name").fill("Member");
    await member.getByLabel("Password").fill(PASSWORD);
    await member.getByRole("button", { name: /Create account & join/ }).click();
    await expect(member.getByRole("button", { name: "Upload" })).toBeVisible();

    // Owner demotes them to Viewer
    await page.getByRole("button", { name: "Documents" }).click();
    await page.getByRole("button", { name: "Team" }).click();
    await page.getByLabel(`Role for ${memberEmail}`).selectOption({ label: "Viewer" });
    await expect(page.getByLabel(`Role for ${memberEmail}`)).toHaveValue("VIEWER");

    // Their next upload is refused by the server even before their session refreshes
    await member.locator('input[type="file"]').setInputFiles({
      name: "late.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("too late"),
    });
    await expect(member.locator(".auth-error")).toContainText(/Insufficient permissions/i);

    // Removal: their session ends (no other org), and signing in again gives them their own workspace
    await page.getByLabel(`Remove ${memberEmail}`).click();
    await expect(page.locator(`.team-row[data-email="${memberEmail}"]`)).toHaveCount(0);
    await member.reload();
    await expect(member).toHaveURL(/\/login$/);
    await member.getByLabel("Email").fill(memberEmail);
    await member.getByLabel("Password").fill(PASSWORD);
    await member.getByRole("button", { name: "Sign in" }).click();
    await expect(orgName(member)).toHaveText("Max's workspace");
  });
});

test.describe("folders", () => {
  test("create a folder, upload into it, move a document out, delete the empty folder", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signUp(page, uniqueEmail("folders"), "Folder Co");

    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("Folder name").fill("Contracts");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: /^Contracts/ }).click();
    await expect(page.getByRole("navigation", { name: "Folder" })).toContainText("Contracts");
    await expect(page.getByText("This folder is empty")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "nda.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Mutual NDA between the parties."),
    });
    await expect(page.locator(".doc-row", { hasText: "nda.txt" }).getByText("✓ Ready")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("1 document in Contracts")).toBeVisible();

    // Back at the top level the document is inside the folder, not loose
    await page.getByRole("button", { name: "All documents" }).click();
    await expect(page.getByText("1 doc", { exact: true })).toBeVisible();
    await expect(page.locator(".doc-row", { hasText: "nda.txt" })).toHaveCount(0);
    await expect(page.getByLabel("Delete folder Contracts")).toHaveCount(0); // not empty

    // Move it out again
    await page.getByRole("button", { name: /^Contracts/ }).click();
    await page.getByLabel("Move nda.txt").selectOption({ label: "All documents (no folder)" });
    await expect(page.getByText("This folder is empty")).toBeVisible();
    await page.getByRole("button", { name: "All documents" }).click();
    await expect(page.locator(".doc-row", { hasText: "nda.txt" })).toBeVisible();

    await page.getByLabel("Delete folder Contracts").click();
    await expect(page.getByRole("button", { name: /^Contracts/ })).toHaveCount(0);
  });

  test("rename a folder and move it, with its contents, into another folder and back", async ({ page }) => {
    await signUp(page, uniqueEmail("folder-move"), "Folder Move Co");
    const createFolder = async (name: string) => {
      await page.getByRole("button", { name: "New folder" }).click();
      await page.getByLabel("Folder name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
    };
    await createFolder("Clients");
    await createFolder("Archive");

    // A document inside Clients
    await page.getByRole("button", { name: /^Clients/ }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "acme.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Acme master services agreement."),
    });
    await expect(page.locator(".doc-row", { hasText: "acme.txt" }).getByText("✓ Ready")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "All documents" }).click();

    // Rename: Escape cancels, a clash shows the API's reason, Enter saves
    await page.getByLabel("Rename folder Clients").click();
    await page.getByLabel("New folder name").fill("Nope");
    await page.getByLabel("New folder name").press("Escape");
    await expect(page.getByRole("button", { name: /^Clients/ })).toBeVisible();

    await page.getByLabel("Rename folder Clients").click();
    await page.getByLabel("New folder name").fill("Archive");
    await page.getByLabel("New folder name").press("Enter");
    await expect(page.locator(".auth-error")).toContainText("already exists");

    await page.getByLabel("New folder name").fill("Customers");
    await page.getByLabel("New folder name").press("Enter");
    await expect(page.getByRole("button", { name: /^Customers/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Clients/ })).toHaveCount(0);
    await expect(page.locator(".auth-error")).toHaveCount(0);

    // Move Customers into Archive: it disappears from the top level and keeps its document
    const options = await page.getByLabel("Move folder Customers").locator("option").allTextContents();
    expect(options).toEqual(["Move…", "Archive"]); // not itself, not "Top level" (already there)
    await page.getByLabel("Move folder Customers").selectOption({ label: "Archive" });
    await expect(page.getByRole("button", { name: /^Customers/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Archive/ })).toContainText("1 folder");

    await page.getByRole("button", { name: /^Archive/ }).click();
    await page.getByRole("button", { name: /^Customers/ }).click();
    await expect(page.getByRole("navigation", { name: "Folder" })).toContainText("Archive/Customers");
    await expect(page.locator(".doc-row", { hasText: "acme.txt" })).toBeVisible();

    // The document's own "Move…" lists the new path
    const docOptions = await page.getByLabel("Move acme.txt").locator("option").allTextContents();
    expect(docOptions).toContain("Archive");

    // Back to the top level from inside Archive
    await page.getByRole("navigation", { name: "Folder" }).getByRole("button", { name: "Archive" }).click();
    await page.getByLabel("Move folder Customers").selectOption({ label: "Top level" });
    await expect(page.getByText("This folder is empty")).toBeVisible();
    await page.getByRole("button", { name: "All documents" }).click();
    await expect(page.getByRole("button", { name: /^Customers/ })).toContainText("1 doc");
  });

  test("a failed document can be retried", async ({ page }) => {
    await signUp(page, uniqueEmail("retry"), "Retry Co");
    await page.locator('input[type="file"]').setInputFiles({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 garbage"),
    });
    const row = page.locator(".doc-item", { hasText: "broken.pdf" });
    await expect(row.getByText("FAILED")).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Retry processing broken.pdf" }).click();
    // It goes back through processing (and, still being corrupt, fails again with its reason)
    await expect(row.locator(".doc-failure")).toContainText(/could not read pdf/i, { timeout: 20_000 });
    await expect(page.locator(".auth-error")).toHaveCount(0);
  });
});
