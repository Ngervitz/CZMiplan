/**
 * Captures QA screenshots for "Tu situación hoy" scenarios A–D.
 * Run from repo root: node dev/capture-situacion-qa.mjs
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function createStaticServer() {
  const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, ""));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}

async function main() {
  let chromium;
  try {
    const require = createRequire(import.meta.url);
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Playwright no instalado. Ejecutá: npm install -D playwright && npx playwright install chromium");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(8765, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:8765/dev/qa-situacion-hoy.html";

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  for (const id of ["A", "B", "C", "D"]) {
    const page = await context.newPage();
    await page.goto(base + "#scenario-" + id, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const el = page.locator("#scenario-" + id);
    await el.scrollIntoViewIfNeeded();
    const out = path.join(outDir, "situacion-qa-" + id + ".png");
    await el.screenshot({ path: out });
    console.log("OK", out);
    await page.close();
  }

  const fullPage = await context.newPage();
  await fullPage.goto(base, { waitUntil: "networkidle" });
  await fullPage.waitForTimeout(500);
  const fullOut = path.join(outDir, "situacion-qa-all.png");
  await fullPage.screenshot({ path: fullOut, fullPage: true });
  console.log("OK", fullOut);

  await browser.close();
  server.close();
  console.log("\nCapturas en:", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
