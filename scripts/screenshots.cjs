const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", "public", "training-screenshots");

const EMAIL = "aarav@stockscript.dev";
const PASS = "Trader@123";

fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // 1. Login page
  console.log("1/7  Login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "01-login.png"), fullPage: true });
  console.log("  ✓ 01-login.png");

  // Login as aarav
  console.log("   Logging in as aarav@stockscript.dev...");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("   Current URL:", page.url());

  // 2. Dashboard
  console.log("2/7  Dashboard...");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("   URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "02-dashboard.png"), fullPage: true });
  console.log("  ✓ 02-dashboard.png");

  // 3. Journal
  console.log("3/7  Journal...");
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("   URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "03-journal.png"), fullPage: true });
  console.log("  ✓ 03-journal.png");

  // 4. New Trade form
  console.log("4/7  New Trade form...");
  await page.goto(`${BASE}/trades/new`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log("   URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "04-new-trade.png"), fullPage: true });
  console.log("  ✓ 04-new-trade.png");

  // 5. Trade detail - navigate to Journal first, then click first trade link
  console.log("5/7  Trade detail...");
  await page.goto(`${BASE}/trades`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("   Looking for trade links...");
  // Get all links that start with /trades/ but not /trades/new or /trades/edit
  const links = await page.locator('a[href^="/trades/"]').all();
  let tradeHref = null;
  for (const link of links) {
    const href = await link.getAttribute("href");
    if (href && href !== "/trades/new" && !href.includes("/edit/")) {
      tradeHref = href;
      break;
    }
  }
  if (tradeHref) {
    console.log("   Navigating to:", tradeHref);
    await page.goto(`${BASE}${tradeHref}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
  } else {
    console.log("   No trade link found, staying on journal");
  }
  await page.screenshot({ path: path.join(OUT, "05-trade-detail.png"), fullPage: true });
  console.log("  ✓ 05-trade-detail.png");

  // 6. Leaderboard
  console.log("6/7  Leaderboard...");
  await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log("   URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "06-leaderboard.png"), fullPage: true });
  console.log("  ✓ 06-leaderboard.png");

  // 7. Account
  console.log("7/7  Account...");
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log("   URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "07-account.png"), fullPage: true });
  console.log("  ✓ 07-account.png");

  await browser.close();
  console.log("\nAll done! Files in:", OUT);
  const files = fs.readdirSync(OUT).filter(f => f.endsWith(".png")).sort();
  for (const f of files) {
    const stat = fs.statSync(path.join(OUT, f));
    console.log(`   ${f}  (${(stat.size / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
