const fs = require("fs");
const os = require("os");
const path = require("path");
const { render } = require("./form-engine");

const clampTimeout = (value) =>
  Math.min(Math.max(Number(value) || 15000, 1000), 120000);

const safeFileName = (value, fallback) => {
  const cleaned = String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return cleaned || fallback;
};

class BrowserRpaSession {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.artifactDirectory = null;
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;

    let chromium;
    try {
      ({ chromium } = require("playwright"));
    } catch {
      throw new Error(
        "Browser RPA requires Playwright. Run npm install and npx playwright install chromium on the RPA runner.",
      );
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ acceptDownloads: true });
    this.page = await this.context.newPage();
    return this.page;
  }

  async ensureArtifactDirectory() {
    if (this.artifactDirectory) return this.artifactDirectory;
    this.artifactDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "bib-rpa-"),
    );
    return this.artifactDirectory;
  }

  getScope(page, action) {
    if (!action.frameSelector) return page;
    return page.frameLocator(action.frameSelector);
  }

  getLocator(page, action) {
    if (!action.selector) {
      throw new Error(`Browser ${action.action} requires a selector.`);
    }

    let locator = this.getScope(page, action).locator(action.selector);
    switch (action.match || "single") {
      case "first":
        locator = locator.first();
        break;
      case "last":
        locator = locator.last();
        break;
      case "nth":
        locator = locator.nth(Math.max(Number(action.matchIndex) || 0, 0));
        break;
      case "single":
      default:
        break;
    }
    return locator;
  }

  async execute(rawAction, context) {
    const action = render(rawAction || {}, context);
    const page = await this.ensurePage();
    const timeout = clampTimeout(action.timeoutMs);
    const started = Date.now();
    let response = { action: action.action };

    switch (action.action) {
      case "openPage": {
        if (!action.url) throw new Error("Browser Open Page requires a URL.");
        await page.goto(action.url, {
          waitUntil: action.waitUntil || "domcontentloaded",
          timeout,
        });
        response = {
          action: action.action,
          value: page.url(),
          url: page.url(),
          title: await page.title(),
        };
        break;
      }
      case "click": {
        await this.getLocator(page, action).click({ timeout });
        response = { action: action.action, value: true, url: page.url() };
        break;
      }
      case "fill": {
        await this.getLocator(page, action).fill(String(action.value ?? ""), {
          timeout,
        });
        response = { action: action.action, value: action.value ?? "" };
        break;
      }
      case "select": {
        const selected = await this.getLocator(page, action).selectOption(
          String(action.value ?? ""),
          { timeout },
        );
        response = { action: action.action, value: selected };
        break;
      }
      case "waitFor": {
        const state = action.waitState || "visible";
        await this.getLocator(page, action).waitFor({ state, timeout });
        response = { action: action.action, value: state, state };
        break;
      }
      case "delay": {
        const delayMs = Math.min(
          Math.max(Number(action.delayMs) || 1000, 0),
          60000,
        );
        await page.waitForTimeout(delayMs);
        response = { action: action.action, value: delayMs, delayMs };
        break;
      }
      case "readText": {
        const value = await this.getLocator(page, action).innerText({
          timeout,
        });
        response = { action: action.action, value };
        break;
      }
      case "readAttribute": {
        if (!action.attributeName) {
          throw new Error("Browser Read Attribute requires an attribute name.");
        }
        const value = await this.getLocator(page, action).getAttribute(
          action.attributeName,
          { timeout },
        );
        response = {
          action: action.action,
          attribute: action.attributeName,
          value,
        };
        break;
      }
      case "check": {
        await this.getLocator(page, action).check({ timeout });
        response = { action: action.action, value: true };
        break;
      }
      case "uncheck": {
        await this.getLocator(page, action).uncheck({ timeout });
        response = { action: action.action, value: false };
        break;
      }
      case "uploadFile": {
        if (!action.filePath) {
          throw new Error(
            "Browser Upload File requires a runner-local file path.",
          );
        }
        await this.getLocator(page, action).setInputFiles(action.filePath, {
          timeout,
        });
        response = {
          action: action.action,
          value: path.basename(action.filePath),
          fileName: path.basename(action.filePath),
        };
        break;
      }
      case "downloadFile": {
        const directory = await this.ensureArtifactDirectory();
        const downloadPromise = page.waitForEvent("download", { timeout });
        await this.getLocator(page, action).click({ timeout });
        const download = await downloadPromise;
        const fileName = safeFileName(
          action.fileName || download.suggestedFilename(),
          "download.bin",
        );
        const destination = path.join(directory, fileName);
        await download.saveAs(destination);
        const stat = await fs.promises.stat(destination);
        response = {
          action: action.action,
          value: fileName,
          fileName,
          size: stat.size,
          artifactPath: destination,
        };
        break;
      }
      case "screenshot": {
        const directory = await this.ensureArtifactDirectory();
        const fileName = safeFileName(
          action.fileName || `screenshot-${Date.now()}.png`,
          "screenshot.png",
        );
        const destination = path.join(
          directory,
          fileName.endsWith(".png") ? fileName : `${fileName}.png`,
        );
        if (action.selector) {
          await this.getLocator(page, action).screenshot({
            path: destination,
            timeout,
          });
        } else {
          await page.screenshot({
            path: destination,
            fullPage: action.fullPage !== false,
            timeout,
          });
        }
        response = {
          action: action.action,
          value: path.basename(destination),
          fileName: path.basename(destination),
          artifactPath: destination,
        };
        break;
      }
      case "pressKey": {
        const key = String(action.key || "Enter");
        if (action.selector) {
          await this.getLocator(page, action).press(key, { timeout });
        } else {
          await page.keyboard.press(key);
        }
        response = { action: action.action, value: key, key };
        break;
      }
      case "hover": {
        await this.getLocator(page, action).hover({ timeout });
        response = { action: action.action, value: true };
        break;
      }
      case "scrollIntoView": {
        await this.getLocator(page, action).scrollIntoViewIfNeeded({ timeout });
        response = { action: action.action, value: true };
        break;
      }
      case "switchToLatestPage": {
        const pages = this.context
          .pages()
          .filter((candidate) => !candidate.isClosed());
        if (!pages.length) throw new Error("No browser page is available.");
        this.page = pages[pages.length - 1];
        await this.page
          .waitForLoadState("domcontentloaded", { timeout })
          .catch(() => {});
        response = {
          action: action.action,
          value: this.page.url(),
          url: this.page.url(),
          title: await this.page.title(),
        };
        break;
      }
      default:
        throw new Error(
          `Unsupported Browser RPA action: ${action.action || "unknown"}`,
        );
    }

    return {
      success: true,
      status: null,
      error: null,
      durationMs: Date.now() - started,
      request: {
        method: `BROWSER:${String(action.action || "").toUpperCase()}`,
        url: action.url || this.page.url(),
        headers: {},
        params: {
          selector: action.selector || null,
          frameSelector: action.frameSelector || null,
          match: action.match || "single",
          matchIndex:
            action.match === "nth" ? Number(action.matchIndex) || 0 : null,
          waitState: action.waitState || null,
          attributeName: action.attributeName || null,
        },
        body: action.value == null ? null : { value: action.value },
      },
      response,
    };
  }

  async captureFailureScreenshot() {
    try {
      const page = await this.ensurePage();
      const directory = await this.ensureArtifactDirectory();
      const destination = path.join(directory, `failure-${Date.now()}.png`);
      await page.screenshot({
        path: destination,
        fullPage: true,
        timeout: 10000,
      });
      return destination;
    } catch {
      return null;
    }
  }

  async close() {
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

module.exports = { BrowserRpaSession };
