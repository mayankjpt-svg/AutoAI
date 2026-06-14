const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { ensureDir } = require("../../../packages/shared/src");
const { resolveFromRoot } = require("./config");

async function prepareAuthenticatedContext(browserManager, config) {
  const auth = config.auth || { mode: "none" };
  const storagePath = auth.storageStatePath ? resolveFromRoot(auth.storageStatePath) : null;
  const contextOptions = { headless: config.headless };

  if ((auth.mode === "storageState" || auth.mode === "manual" || auth.mode === "credentials") && storagePath && fs.existsSync(storagePath)) {
    contextOptions.storageState = storagePath;
  }

  const context = await browserManager.launch(contextOptions);
  const page = await context.newPage();

  if (auth.mode === "credentials" && !contextOptions.storageState) {
    await loginWithCredentials(page, config);
    await saveStorageState(context, storagePath);
  }

  if (auth.mode === "manual" && !contextOptions.storageState) {
    await loginManually(page, config);
    await saveStorageState(context, storagePath);
  }

  return { context, page };
}

async function loginWithCredentials(page, config) {
  const auth = config.auth;
  const credentials = auth.credentials || {};
  const username = process.env[credentials.usernameEnv || "AUTOAI_USERNAME"];
  const password = process.env[credentials.passwordEnv || "AUTOAI_PASSWORD"];
  if (!username || !password) {
    throw new Error(`Auth mode "credentials" requires ${credentials.usernameEnv || "AUTOAI_USERNAME"} and ${credentials.passwordEnv || "AUTOAI_PASSWORD"}.`);
  }

  await page.goto(auth.loginUrl || config.targetUrl, { waitUntil: "networkidle" });
  await page.locator(credentials.usernameSelector).first().fill(username);
  await page.locator(credentials.passwordSelector).first().fill(password);
  await page.locator(credentials.submitSelector).first().click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function loginManually(page, config) {
  const auth = config.auth;
  await page.goto(auth.loginUrl || config.targetUrl, { waitUntil: "domcontentloaded" });
  console.log("");
  console.log("Manual auth mode is active.");
  console.log("A browser window is open. Log in to the SaaS app, then return here and press Enter.");
  console.log(`Waiting up to ${Math.round((auth.manualTimeoutMs || 120000) / 1000)} seconds.`);
  await waitForEnter(auth.manualTimeoutMs || 120000);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

function waitForEnter(timeoutMs) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      rl.close();
      resolve();
    }, timeoutMs);
    rl.question("Press Enter after login is complete: ", () => {
      clearTimeout(timer);
      rl.close();
      resolve();
    });
  });
}

async function saveStorageState(context, storagePath) {
  if (!storagePath) return;
  ensureDir(path.dirname(storagePath));
  await context.storageState({ path: storagePath });
}

module.exports = { prepareAuthenticatedContext };
