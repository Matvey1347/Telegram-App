const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const base = process.env.LEAD_E2E_WEB_URL || "http://127.0.0.1:3351",
  api = "http://127.0.0.1:3352";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("E2E requires a local web server");
const origin = {
  "access-control-allow-origin": base,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};
const observation = (id, decision) => ({
  id,
  sourceId: "source",
  sourceTitle: "Public source",
  externalMessageId: id,
  messageUrl: `https://t.me/public_source/${id}`,
  publishedAt: "2026-10-01T10:00:00Z",
  observedAt: "2026-10-01T10:00:00Z",
  expiresAt: "2027-10-01T10:00:00Z",
  text: `evidence ${id}`,
  links: [],
  contentHash: id,
  originalStatus: "OBSERVED",
  processingStatus: "NEEDS_MEDIA_ANALYSIS",
  classificationVersion: null,
  prefilterDecision: decision,
  classification: null,
  extraction: null,
  candidateId: "business",
  reviewStatus: "PENDING",
  classificationOperation: null,
  extractionOperation: null,
});
const candidate = (id, title, contacts, observations = []) => ({
  id,
  workspaceId: "test-workspace",
  title,
  niche: "",
  offerType: "",
  contacts,
  risks: [],
  riskStatus: "NEEDS_REVIEW",
  reviewStatus: "PENDING",
  contactId: null,
  revision: 1,
  createdAt: "2026-10-01T10:00:00Z",
  expiresAt: "2027-10-01T10:00:00Z",
  sources: [
    { id: "source", title: "Public source", url: "https://t.me/public_source" },
  ],
  observations,
  hasMoreObservations: false,
  aliases: [],
  reviewHistory: [],
});
const rows = [
  candidate(
    "business",
    "Business project",
    [
      {
        type: "TELEGRAM",
        value: "@public_project",
        role: "ADVERTISED_DESTINATION",
        evidence: "button",
      },
      {
        type: "TELEGRAM",
        value: "@public_ads",
        role: "SALES_CONTACT",
        purpose: "CONTACT_FOR_ADS",
        evidence: "profile",
        evidenceUrl: "https://t.me/public_project",
        confirmed: true,
      },
    ],
    ["LIKELY_AD", "LIKELY_VP", "UNKNOWN"].map((d, i) =>
      observation(String(i + 1), d),
    ),
  ),
  ...Array.from({ length: 55 }, (_, i) =>
    candidate(`point-${i}`, `Point project ${String(i).padStart(2, "0")}`, [
      {
        type: "WEBSITE",
        value: "https://example.org",
        role: "ADVERTISED_DESTINATION",
        evidence: "link",
      },
    ]),
  ),
];
let mode = "normal";
const changes = [];
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(() => {
    localStorage.setItem("telegram_system_access_token", "test-token");
    localStorage.setItem("selected-workspace-id", "test-workspace");
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base && !url.pathname.startsWith("/api/")
      ? route.continue()
      : route.abort();
  });
  await page.route(`${api}/**`, async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      p = u.pathname;
    let body = {},
      status = 200;
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: origin });
    if (p.endsWith("/auth/me"))
      body = {
        workspace: {
          id: "test-workspace",
          name: "Test",
          access: {
            isOwner: mode !== "denied",
            permissionKeys: [],
            featureIds: ["adSales.leads", "adSales.crm"],
          },
        },
        user: { id: "tester", name: "Tester" },
      };
    else if (p.endsWith("/account/me"))
      body = {
        id: "tester",
        name: "Tester",
        email: "test@example.invalid",
        locale: "en",
      };
    else if (p.endsWith("/workspaces")) body = [];
    else if (p.endsWith("/config"))
      body = {
        enabled: true,
        canManage: true,
        canReview: true,
        canAnalyze: false,
        maxSources: 100,
        maxPostsPerDay: 1000,
        maxSourceImport: 100,
        maxMaterialBatch: 20,
      };
    else if (p.endsWith("/sources"))
      body = { items: [], hasMore: false, nextCursor: null };
    else if (p.endsWith("/preparation/queue")) {
      if (mode === "error") {
        status = 503;
        body = { message: "unavailable" };
      } else {
        let filtered =
          mode === "empty"
            ? []
            : rows
                .filter(
                  (x) =>
                    !u.searchParams.get("search") ||
                    x.title
                      .toLowerCase()
                      .includes(u.searchParams.get("search").toLowerCase()),
                )
                .filter(
                  (x) =>
                    !u.searchParams.get("contactCategory") ||
                    (u.searchParams.get("contactCategory") ===
                    "BUSINESS_CONTACT_FOUND"
                      ? x.id === "business"
                      : u.searchParams.get("contactCategory") ===
                          "CONTACT_POINT_ONLY"
                        ? x.id.startsWith("point-")
                        : false),
                );
        const off = Number(u.searchParams.get("cursor") || 0),
          items = filtered.slice(off, off + 50);
        body = {
          items,
          total: filtered.length,
          hasMore: off + 50 < filtered.length,
          nextCursor: off + 50 < filtered.length ? String(off + 50) : null,
        };
      }
    } else if (
      /\/candidates\/[^/]+\/review$/.test(p) &&
      req.method() === "PATCH"
    ) {
      const id = p.split("/").at(-2),
        c = rows.find((x) => x.id === id),
        data = req.postDataJSON();
      c.reviewStatus = data.action === "APPROVE" ? "APPROVED" : "REJECTED";
      c.revision++;
      changes.push({ id, action: data.action });
      body = c;
    } else if (/\/candidates\/[^/]+$/.test(p)) {
      body = rows.find((x) => x.id === p.split("/").at(-1)) || {};
    } else {
      status = 503;
      body = { message: "not required by test" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: origin,
      body: JSON.stringify(body),
    });
  });
  const visible = async (label) =>
    await page
      .getByText(label, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
  await page.goto(`${base}/ad-sales/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Business project" }).waitFor();
  console.log("PASS list");
  await page.getByLabel("Search candidates").fill("Business project");
  await page.getByRole("button", { name: "Apply candidate filters" }).click();
  await visible("Найдено: 1");
  console.log("PASS search/count");
  await page.getByLabel("Search candidates").fill("");
  await page.getByRole("button", { name: "Apply candidate filters" }).click();
  await page.getByLabel("Категория контакта").click();
  await page.getByRole("option", { name: "Только ссылка на проект" }).click();
  await visible("Найдено: 55");
  await page.getByRole("button", { name: "Load more candidates" }).click();
  await page.getByRole("button", { name: "Point project 54" }).waitFor();
  console.log("PASS filter/pagination");
  await page.getByLabel("Категория контакта").click();
  await page.getByRole("option", { name: "Все категории" }).click();
  await page.getByRole("button", { name: "Business project" }).click();
  for (const text of [
    "@public_project",
    "@public_ads",
    "Подтверждено человеком",
    "Вероятная реклама",
    "Вероятный взаимопиар",
    "Не определено",
    "evidence 1",
    "evidence 2",
    "evidence 3",
  ])
    await visible(text);
  assert.equal(
    await page.getByRole("link", { name: "Open original reference" }).count(),
    3,
  );
  console.log("PASS target/contact/evidence/classification");
  await page
    .getByRole("button", { name: "Approve candidate", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.body.innerText.includes("APPROVED"),
  );
  assert.deepEqual(changes[0], { id: "business", action: "APPROVE" });
  await page.getByRole("button", { name: "Back to candidates" }).click();
  await page.getByRole("button", { name: "Point project 00" }).click();
  await page
    .getByRole("button", { name: "Reject candidate", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.body.innerText.includes("REJECTED"),
  );
  assert.deepEqual(changes[1], { id: "point-0", action: "REJECT" });
  assert.equal(rows[2].reviewStatus, "PENDING");
  console.log("PASS review/isolation");
  mode = "empty";
  await page.reload();
  await visible("No records match these filters.");
  console.log("PASS empty");
  mode = "error";
  await page.reload();
  await visible("Lead Discovery could not be loaded");
  console.log("PASS API error");
  mode = "denied";
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("telegram_system_access_token", "test-token");
    localStorage.setItem("selected-workspace-id", "test-workspace");
  });
  await page.reload();
  await visible("Lead Discovery view permission is required.");
  console.log("PASS no access");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
