import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { assertSafeHost, inspectRequest } from "./policy.mjs";
import { reportMarkdown } from "./report.mjs";

export async function runAudit(options) {
  const target = new URL(options.url);
  const allowedHosts = new Set([target.hostname.toLowerCase(), ...(options.allowedHosts || []).map((host) => host.toLowerCase())]);
  const policy = {
    allowedHosts,
    allowHttp: Boolean(options.allowHttp),
  };
  const initial = inspectRequest(target.href, "GET", policy);
  if (!initial.ok) throw new Error("Target blocked: " + initial.reason);
  await assertSafeHost(target.hostname, Boolean(options.allowPrivateNetwork));

  const output = resolve(options.output || "artifacts/browser-qa");
  await mkdir(output, { recursive: true });
  const blockedRequests = [];
  const failedRequests = [];
  const consoleErrors = [];
  const checkedHosts = new Map();
  const browser = await chromium.launch({ headless: options.headless !== false });
  try {
    const viewport = { width: options.width || 1440, height: options.height || 900 };
    const context = await browser.newContext({
      viewport,
      colorScheme: options.colorScheme || "dark",
      locale: "en-US",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const decision = inspectRequest(request.url(), request.method(), policy);
      if (!decision.ok) {
        blockedRequests.push({ method: request.method(), url: request.url(), reason: decision.reason });
        await route.abort("blockedbyclient");
        return;
      }
      if (decision.network) {
        const host = decision.url.hostname.toLowerCase();
        let check = checkedHosts.get(host);
        if (!check) {
          check = assertSafeHost(host, Boolean(options.allowPrivateNetwork));
          checkedHosts.set(host, check);
        }
        try {
          await check;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "network destination blocked";
          blockedRequests.push({ method: request.method(), url: request.url(), reason });
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 1_000));
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      failedRequests.push({
        method: request.method(),
        url: request.url(),
        reason: failure?.errorText || "request failed",
      });
    });

    await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs || 30_000,
    });
    await page.waitForTimeout(Math.min(options.settleMs ?? 750, 5_000));
    const pageSummary = await page.evaluate(() => {
      const selectorFor = (element) => {
        const id = element.id ? "#" + element.id : "";
        const classes = Array.from(element.classList || []).slice(0, 2).join(".");
        return element.tagName.toLowerCase() + id + (classes ? "." + classes : "");
      };
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .filter(visible)
        .slice(0, 40)
        .map((element) => ({ level: element.tagName.toLowerCase(), text: (element.textContent || "").trim().slice(0, 300) }));
      const overflow = Array.from(document.querySelectorAll("body *"))
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { selector: selectorFor(element), left: Math.round(rect.left), right: Math.round(rect.right) };
        })
        .filter((entry) => entry.left < -1 || entry.right > window.innerWidth + 1)
        .slice(0, 30);
      const controls = Array.from(document.querySelectorAll("input:not([type=hidden]),select,textarea,button")).filter(visible);
      const unlabeledControls = controls
        .filter((element) => {
          if (element.tagName === "BUTTON" && (element.textContent || "").trim()) return false;
          const id = element.getAttribute("id");
          return !element.getAttribute("aria-label")
            && !element.getAttribute("aria-labelledby")
            && !element.getAttribute("title")
            && !(id && document.querySelector('label[for="' + CSS.escape(id) + '"]'))
            && !element.closest("label");
        })
        .slice(0, 30)
        .map(selectorFor);
      return {
        title: document.title,
        language: document.documentElement.lang || "",
        headings,
        linkCount: document.querySelectorAll("a[href]").length,
        buttonCount: document.querySelectorAll("button").length,
        formControlCount: controls.length,
        overflow,
        unlabeledControls,
      };
    });
    await page.screenshot({ path: resolve(output, "page.png"), fullPage: false });
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      requestedUrl: target.href,
      finalUrl: page.url(),
      viewport,
      page: pageSummary,
      consoleErrors,
      failedRequests,
      blockedRequests,
      policy: {
        allowedHosts: Array.from(allowedHosts).sort(),
        writeMethodsBlocked: true,
        privateNetworkAllowed: Boolean(options.allowPrivateNetwork),
        persistentSession: false,
      },
    };
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    await writeFile(resolve(output, "report.md"), reportMarkdown(report) + "\n");
    await context.close();
    return { report, output };
  } finally {
    await browser.close();
  }
}
