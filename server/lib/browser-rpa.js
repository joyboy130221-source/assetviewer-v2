const fs = require("fs");
const os = require("os");
const path = require("path");
const { render } = require("./form-engine");
const { readWorkflowLimits } = require("../config/workflow-limits");
const { createSemaphore } = require("./semaphore");
const { assertUrlAllowed } = require("./network-policy");
const { getSecurityConfig } = require("../config/security-config");

let warnedUploadRoot = false;
/**
 * Resolves an Upload File path. With WORKFLOW_RPA_UPLOAD_ROOT set, the file
 * must live inside that directory (no traversal, no symlink escape).
 * Without it the legacy behaviour (any runner path) remains, with a warning.
 */
async function resolveUploadPath(filePath) {
  const root = getSecurityConfig().network.rpaUploadRoot;
  if (!root) {
    if (!warnedUploadRoot) {
      warnedUploadRoot = true;
      console.warn(
        "[security] WORKFLOW_RPA_UPLOAD_ROOT is not set: Browser RPA Upload File can read any file on the runner.",
      );
    }
    return filePath;
  }
  const realRoot = await fs.promises.realpath(path.resolve(root));
  const candidate = path.resolve(realRoot, String(filePath));
  let realFile;
  try {
    realFile = await fs.promises.realpath(candidate);
  } catch {
    throw new Error(
      "Upload file was not found in the configured upload folder.",
    );
  }
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Upload file must be inside the configured upload folder.");
  return realFile;
}

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch {
    throw new Error(
      "Browser RPA requires Playwright. Run npm install and npx playwright install chromium on the RPA runner.",
    );
  }
}

function timeoutClamp(value, defaultTimeoutMs, maxTimeoutMs) {
  return Math.min(
    Math.max(Number(value) || defaultTimeoutMs, 1000),
    maxTimeoutMs,
  );
}

const safeFileName = (value, fallback) => {
  const cleaned = String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return cleaned || fallback;
};

/**
 * One isolated browser session (one browser context) for a workflow execution.
 *
 * Backward compatible: `new BrowserRpaSession()` launches and owns a private
 * Chromium instance exactly as before. When `contextProvider` is supplied
 * (see BrowserPool) the session leases an isolated context from a shared
 * browser instead, which is much cheaper for high-volume executions.
 */
class BrowserRpaSession {
  constructor(options = {}) {
    const limits = readWorkflowLimits().browser;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.lease = null;
    this.networkGuardInstalled = false;
    this.lastBlockedRequest = null;
    this.artifactDirectory = null;
    this.contextProvider = options.contextProvider || null;
    this.headless = options.headless ?? limits.headless;
    this.maxTimeoutMs = Math.min(
      Number(options.maxTimeoutMs) || limits.maxTimeoutMs,
      limits.maxTimeoutMs,
    );
    this.defaultTimeoutMs = Math.min(
      Number(options.defaultTimeoutMs) || limits.defaultTimeoutMs,
      this.maxTimeoutMs,
    );
  }

  get started() {
    return Boolean(this.context);
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.context) {
      if (this.contextProvider) {
        this.lease = await this.contextProvider();
        this.context = this.lease.context;
      } else {
        const chromium = loadChromium();
        this.browser = await chromium.launch({ headless: this.headless });
        this.context = await this.browser.newContext({ acceptDownloads: true });
      }
    }
    if (!this.networkGuardInstalled) {
      await this.installNetworkGuard(this.context);
      this.networkGuardInstalled = true;
    }
    this.page = await this.context.newPage();
    return this.page;
  }

  /**
   * Applies the outbound network policy to every request the browser makes
   * (navigations, redirects, sub-resources, pop-ups), not only to the Open
   * Page URL. WORKFLOW_RPA_NETWORK_POLICY=unrestricted disables it.
   */
  async installNetworkGuard(context) {
    if (getSecurityConfig().network.rpaPolicy === "unrestricted") return;
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (!/^https?:/i.test(url)) return route.continue();
      try {
        await assertUrlAllowed(url);
        return route.continue();
      } catch (error) {
        this.lastBlockedRequest = { url, reason: error.message };
        return route.abort("blockedbyclient");
      }
    });
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
    const timeout = timeoutClamp(
      action.timeoutMs,
      this.defaultTimeoutMs,
      this.maxTimeoutMs,
    );
    const started = Date.now();
    let response = { action: action.action };

    switch (action.action) {
      case "openPage": {
        if (!action.url) throw new Error("Browser Open Page requires a URL.");
        if (getSecurityConfig().network.rpaPolicy !== "unrestricted")
          await assertUrlAllowed(action.url);
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
        const uploadPath = await resolveUploadPath(action.filePath);
        await this.getLocator(page, action).setInputFiles(uploadPath, {
          timeout,
        });
        response = {
          action: action.action,
          value: path.basename(uploadPath),
          fileName: path.basename(uploadPath),
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
      // Never launch a browser just to capture an empty failure screenshot.
      if (!this.page || this.page.isClosed()) return null;
      const page = this.page;
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
    if (this.lease) await this.lease.dispose().catch(() => {});
    else if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
    this.lease = null;
    this.networkGuardInstalled = false;
  }
}

/**
 * Shares one lazily-launched Chromium process across many sessions and bounds
 * the number of concurrently open (isolated) contexts with a semaphore.
 * Each session still gets its own cookies/storage because it has its own
 * browser context.
 */
class BrowserPool {
  constructor(options = {}) {
    const limits = readWorkflowLimits().browser;
    this.maxConcurrency = Math.min(
      Math.max(Number(options.maxConcurrency) || 1, 1),
      limits.maxConcurrency,
    );
    this.headless = options.headless ?? limits.headless;
    this.sessionOptions = {
      maxTimeoutMs: options.maxTimeoutMs,
      defaultTimeoutMs: options.defaultTimeoutMs,
    };
    this.semaphore = createSemaphore(this.maxConcurrency);
    this.browserPromise = null;
    this.closed = false;
  }

  async getBrowser() {
    if (this.closed) throw new Error("Browser pool is closed.");
    if (!this.browserPromise) {
      const chromium = loadChromium();
      this.browserPromise = chromium
        .launch({ headless: this.headless })
        .then((browser) => {
          // A crashed browser is relaunched on the next lease.
          browser.on("disconnected", () => {
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((error) => {
          this.browserPromise = null;
          throw error;
        });
    }
    return this.browserPromise;
  }

  async leaseContext() {
    const release = await this.semaphore.acquire();
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({ acceptDownloads: true });
      return {
        context,
        dispose: async () => {
          await context.close().catch(() => {});
          release();
        },
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  createSession() {
    return new BrowserRpaSession({
      ...this.sessionOptions,
      headless: this.headless,
      contextProvider: () => this.leaseContext(),
    });
  }

  async close() {
    this.closed = true;
    const pending = this.browserPromise;
    this.browserPromise = null;
    if (pending) {
      const browser = await pending.catch(() => null);
      if (browser) await browser.close().catch(() => {});
    }
  }
}

module.exports = { BrowserRpaSession, BrowserPool };
