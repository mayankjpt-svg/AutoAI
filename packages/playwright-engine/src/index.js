const path = require("path");
const { chromium } = require("playwright");
const { slugify, ensureDir } = require("../../shared/src");

class BrowserManager {
  constructor({ runDir }) {
    this.runDir = runDir;
    this.browser = null;
    this.context = null;
  }

  async launch(contextOptions = {}) {
    ensureDir(path.join(this.runDir, "videos"));
    this.browser = await chromium.launch({ headless: contextOptions.headless !== false });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 950 },
      recordVideo: { dir: path.join(this.runDir, "videos"), size: { width: 1440, height: 950 } },
      storageState: contextOptions.storageState
    });
    return this.context;
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}

async function snapshotPage(page, runDir, label) {
  const actions = await collectActions(page);
  const title = await page.title();
  const url = page.url();
  const screenshot = path.join("screenshots", `${slugify(label)}.png`);
  await page.screenshot({ path: path.join(runDir, screenshot), fullPage: true });
  return { title, url, actions, screenshot };
}

async function collectActions(page) {
  return page.locator("a,button,input,textarea,select").evaluateAll(nodes => {
    function labelFor(node) {
      const aria = node.getAttribute("aria-label");
      const testId = node.getAttribute("data-testid");
      const placeholder = node.getAttribute("placeholder");
      const value = node.getAttribute("value");
      const text = node.innerText || node.textContent;
      return (aria || placeholder || text || value || testId || node.name || node.id || node.tagName).trim();
    }

    function selectorFor(node) {
      const testId = node.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      if (node.id) return `#${CSS.escape(node.id)}`;
      const aria = node.getAttribute("aria-label");
      if (aria) return `[aria-label="${aria.replace(/"/g, '\\"')}"]`;
      return node.tagName.toLowerCase();
    }

    return nodes
      .filter(node => {
        if (node.disabled) return false;
        let current = node;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const style = window.getComputedStyle(current);
          if (style.visibility === "hidden" || style.display === "none") return false;
          current = current.parentElement;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(node => ({
        type: ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) ? "fill" : "click",
        label: labelFor(node),
        selector: selectorFor(node),
        href: node.getAttribute("href") || null,
        role: node.getAttribute("role") || null,
        tag: node.tagName.toLowerCase()
      }))
      .filter(action => action.label && action.selector);
  });
}

async function executeAction(page, action, options = {}) {
  const beforeUrl = page.url();
  const beforeText = await page.locator("body").innerText().catch(() => "");
  const started = Date.now();

  if (action.type === "fill") {
    const value = valueFor(action, options.persona);
    const locator = await resolveLocator(page, action);
    const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
    if (!visible) {
      return result(action, beforeUrl, page.url(), false, value, started, "Field was not visible or editable");
    }
    await locator.fill(value, { timeout: 5000 });
    return result(action, beforeUrl, page.url(), true, value, started);
  }

  const locator = await resolveLocator(page, action);
  const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
  if (!visible) {
    return result(action, beforeUrl, page.url(), false, undefined, started, "Target was not visible");
  }
  await locator.click({ timeout: 5000 });
  await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(350);

  const afterText = await page.locator("body").innerText().catch(() => "");
  const afterUrl = page.url();
  const changed = beforeUrl !== afterUrl || beforeText !== afterText;
  return result(action, beforeUrl, afterUrl, changed, undefined, started, changed ? null : "No page change after click");
}

async function resolveLocator(page, action) {
  const primary = page.locator(action.selector).first();
  if (await primary.count().catch(() => 0)) return primary;
  const healed = await healLocator(page, action);
  return healed || primary;
}

async function healLocator(page, action) {
  const label = action.label || "";
  const candidates = [];

  if (action.type === "fill") {
    candidates.push(page.getByLabel(label).first());
    candidates.push(page.getByPlaceholder(label).first());
  } else {
    candidates.push(page.getByRole("button", { name: label }).first());
    candidates.push(page.getByRole("link", { name: label }).first());
    candidates.push(page.getByText(label, { exact: true }).first());
  }

  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    if (count > 0) {
      action.healedSelector = true;
      action.originalSelector = action.selector;
      return candidate;
    }
  }

  return null;
}

function valueFor(action, persona = {}) {
  const values = persona.formValues || {};
  const label = action.label.toLowerCase();
  for (const [key, value] of Object.entries(values)) {
    if (label.includes(key.toLowerCase())) return value;
  }
  if (label.includes("email")) return "qa@example.com";
  if (label.includes("name")) return "Demo Launch";
  if (label.includes("project")) return "Demo Launch";
  return "Demo value";
}

function result(action, beforeUrl, afterUrl, success, value, started, failureReason = null) {
  return {
    ...action,
    value,
    beforeUrl,
    afterUrl,
    success,
    failureReason,
    durationMs: Date.now() - started,
    timestamp: new Date().toISOString()
  };
}

module.exports = { BrowserManager, snapshotPage, executeAction };
