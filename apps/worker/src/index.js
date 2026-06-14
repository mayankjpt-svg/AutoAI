const fs = require("fs");
const path = require("path");
const { createDemoSaasServer } = require("../../demo-saas/server");
const { PlannerAgent } = require("../../../packages/agents/src");
const { BrowserManager, snapshotPage, executeAction } = require("../../../packages/playwright-engine/src");
const { BugDetector } = require("../../../packages/bug-detector/src");
const { StateGraph } = require("../../../packages/state-graph/src");
const { generatePlaywrightTest, generateIssueMarkdown } = require("../../../packages/test-generator/src");
const { latestRunDir, ensureDir, writeJson, nowIso } = require("../../../packages/shared/src");
const { OpenAIClient } = require("../../../packages/llm/src");
const { loadRunnerConfig } = require("./config");
const { prepareAuthenticatedContext } = require("./auth");
const { applyActionPolicy, evaluateAction } = require("./policy");

async function runAutonomousDemo(options = {}) {
  resetLatestRun();

  const config = options.config || loadRunnerConfig(process.argv, process.env);
  const app = config.targetUrl ? null : createDemoSaasServer(options.port || 4173);
  if (app) await app.start();
  const baseUrl = config.targetUrl || app.url;
  config.targetUrl = baseUrl;
  const startedAt = nowIso();

  try {
    try {
      return await runBrowserExploration(baseUrl, startedAt, { ...options, config });
    } catch (error) {
      if (!isBrowserLaunchBlocked(error)) throw error;
      if (config.targetUrl && !app) {
        throw new Error("Chromium launch was blocked, and HTTP fallback is only supported for the bundled demo target in this environment.");
      }
      if (!options.quiet) {
        console.log("Browser launch was blocked in this environment; using the built-in HTTP explorer fallback.");
      }
      return await runHttpExploration(baseUrl, startedAt, { ...options, config });
    }
  } finally {
    if (app) await app.stop();
  }
}

async function runBrowserExploration(baseUrl, startedAt, options) {
  const config = options.config;
  const browser = new BrowserManager({ runDir: latestRunDir });
  const { page } = await prepareAuthenticatedContext(browser, config);
  const detector = new BugDetector();
  detector.attach(page);

  const graph = new StateGraph();
  const planner = new PlannerAgent(config.persona, config.planner);
  const llm = new OpenAIClient({ model: config.planner.openaiModel });
  const actions = [];
  const blockedActions = [];
  const stateVisitCounts = new Map();
  const actionVisitCounts = new Map();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    for (let step = 0; step < config.maxSteps; step += 1) {
      const rawSnapshot = await snapshotPage(page, latestRunDir, `step-${step}-${page.url().split("/").pop() || "home"}`);
      const snapshot = prepareSnapshot(rawSnapshot, { config, blockedActions, actionVisitCounts });
      await maybeAddVision(snapshot, config, llm);
      const stateKey = stateSignature(snapshot);
      stateVisitCounts.set(stateKey, (stateVisitCounts.get(stateKey) || 0) + 1);
      graph.addState(snapshot);

      if ((stateVisitCounts.get(stateKey) || 0) > 3) {
        detector.recordFlowFailure({
          action: "state traversal",
          selector: stateKey,
          reason: "Loop prevention stopped repeated visits to the same state.",
          url: snapshot.url
        });
        break;
      }

      const plan = await choosePlan({ planner, llm, snapshot, actions, config });
      if (!plan) break;

      const action = await executeAction(page, plan, { persona: config.persona });
      actions.push(action);
      incrementActionVisit(actionVisitCounts, snapshot, action);
      graph.addEdge(action.beforeUrl, action.afterUrl, action);

      if (!action.success) {
        detector.recordFlowFailure({
          action: action.label,
          selector: action.selector,
          reason: action.failureReason,
          url: action.beforeUrl
        });
      }

      if (config.stopOnFirstBug && detector.summarize().length > 0) break;
    }

    const finalSnapshot = prepareSnapshot(await snapshotPage(page, latestRunDir, "final"), { config, blockedActions, actionVisitCounts });
    graph.addState(finalSnapshot);

    const bugs = detector.summarize();
    const run = {
      id: `run-${Date.now()}`,
      status: bugs.length > 0 ? "failed" : "passed",
      baseUrl,
      startedAt,
      completedAt: nowIso(),
      mode: "playwright",
      config: publicConfig(config),
      persona: config.persona,
      actions,
      blockedActions,
      bugs,
      graph: graph.toJSON(),
      intelligence: intelligenceSummary(config),
      evidence: {
        finalScreenshot: finalSnapshot.screenshot,
        video: await resolveVideoPath(page)
      },
      summary: {
        states: graph.toJSON().states.length,
        actions: actions.length,
        bugs: bugs.length,
        tests: 1,
        coverage: graph.coverageScore()
      }
    };

    writeJson(path.join(latestRunDir, "run.json"), run);
    fs.writeFileSync(path.join(latestRunDir, "issue.md"), generateIssueMarkdown(run));
    fs.writeFileSync(path.join(latestRunDir, "generated.spec.js"), generatePlaywrightTest(run));

    if (!options.quiet) {
      console.log(`Autonomous QA demo complete: ${run.status}`);
      console.log(`Artifacts: ${latestRunDir}`);
      console.log(`Bugs found: ${bugs.length}`);
    }

    return run;
  } finally {
    await browser.close();
  }
}

async function runHttpExploration(baseUrl, startedAt, options) {
  const config = options.config;
  const graph = new StateGraph();
  const planner = new PlannerAgent(config.persona, config.planner);
  const llm = new OpenAIClient({ model: config.planner.openaiModel });
  const actions = [];
  const blockedActions = [];
  const actionVisitCounts = new Map();
  const bugs = [];
  const formState = {};
  let currentUrl = baseUrl;
  let modalOpen = false;

  for (let step = 0; step < config.maxSteps; step += 1) {
    const snapshot = prepareSnapshot(await httpSnapshot(currentUrl, latestRunDir, `step-${step}`, modalOpen), { config, blockedActions, actionVisitCounts });
    graph.addState(snapshot);
    const plan = await choosePlan({ planner, llm, snapshot, actions, config });
    if (!plan) break;

    const action = {
      ...plan,
      beforeUrl: currentUrl,
      success: true,
      timestamp: nowIso(),
      durationMs: 0
    };

    if (plan.type === "fill") {
      action.value = plan.label.toLowerCase().includes("email") ? "qa@example.com" : "Demo Launch";
      formState[plan.selector] = action.value;
    } else if (plan.selector === "[data-testid=\"create-project\"]") {
      modalOpen = true;
    } else if (plan.selector === "[data-testid=\"submit-project\"]") {
      const response = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formState["[data-testid=\"project-name\"]"] || "Demo Launch",
          owner: formState["[data-testid=\"owner-email\"]"] || "qa@example.com"
        })
      });
      if (!response.ok) {
        bugs.push({
          id: "bug-1",
          type: "network",
          severity: "critical",
          status: response.status,
          method: "POST",
          url: `${baseUrl}/api/projects`,
          timestamp: nowIso(),
          title: `POST /api/projects returned ${response.status}`,
          expected: "Project creation should complete successfully.",
          actual: `POST ${baseUrl}/api/projects returned HTTP ${response.status}.`,
          rootCauseGuess: "/api/projects is likely failing in its server-side create handler.",
          confidence: 0.84
        });
      }
      modalOpen = true;
      actions.push(action);
      break;
    } else if (plan.href) {
      currentUrl = new URL(plan.href, baseUrl).toString();
    }

    action.afterUrl = currentUrl;
    actions.push(action);
    incrementActionVisit(actionVisitCounts, snapshot, action);
    graph.addEdge(action.beforeUrl, action.afterUrl || currentUrl, action);
  }

  const finalSnapshot = prepareSnapshot(await httpSnapshot(currentUrl, latestRunDir, "final", modalOpen, bugs.length > 0), { config, blockedActions, actionVisitCounts });
  graph.addState(finalSnapshot);

  const run = {
    id: `run-${Date.now()}`,
    status: bugs.length > 0 ? "failed" : "passed",
    baseUrl,
    startedAt,
    completedAt: nowIso(),
    mode: "http-fallback",
    config: publicConfig(config),
    persona: config.persona,
    actions,
    blockedActions,
    bugs,
    graph: graph.toJSON(),
    intelligence: intelligenceSummary(config),
    evidence: {
      finalScreenshot: finalSnapshot.screenshot,
      video: null
    },
    summary: {
      states: graph.toJSON().states.length,
      actions: actions.length,
      bugs: bugs.length,
      tests: 1,
      coverage: graph.coverageScore()
    }
  };

  writeJson(path.join(latestRunDir, "run.json"), run);
  fs.writeFileSync(path.join(latestRunDir, "issue.md"), generateIssueMarkdown(run));
  fs.writeFileSync(path.join(latestRunDir, "generated.spec.js"), generatePlaywrightTest(run));

  if (!options.quiet) {
    console.log(`Autonomous QA demo complete: ${run.status}`);
    console.log(`Artifacts: ${latestRunDir}`);
    console.log(`Bugs found: ${bugs.length}`);
  }

  return run;
}

async function choosePlan({ planner, llm, snapshot, actions, config }) {
  if (config.planner && config.planner.provider === "openai" && llm.available()) {
    try {
      const selected = await llm.chooseAction({ persona: config.persona, snapshot, actions: snapshot.actions });
      if (selected) return selected;
    } catch (error) {
      snapshot.plannerWarning = error.message;
    }
  }
  return planner.chooseNextAction(snapshot, actions);
}

async function maybeAddVision(snapshot, config, llm) {
  if (!config.vision || !config.vision.enabled || !llm.available() || !snapshot.screenshot.endsWith(".png")) return;
  try {
    const screenshotPath = path.join(latestRunDir, snapshot.screenshot);
    const screenshotBase64 = fs.readFileSync(screenshotPath).toString("base64");
    snapshot.vision = await llm.analyzeVision({
      persona: config.persona,
      snapshot,
      screenshotBase64,
      mimeType: "image/png"
    });
  } catch (error) {
    snapshot.visionWarning = error.message;
  }
}

function prepareSnapshot(snapshot, run) {
  const allowed = applyActionPolicy(snapshot.actions, snapshot, run);
  let blockedCount = 0;
  for (const action of snapshot.actions) {
    const policy = evaluateAction(action, snapshot, run);
    if (!policy.allowed) {
      blockedCount += 1;
      run.blockedActions.push({ ...action, url: snapshot.url, reason: policy.reason });
    }
  }
  snapshot.actions = allowed.filter(action => (run.actionVisitCounts.get(actionKey(snapshot, action)) || 0) < 1);
  snapshot.blockedCount = blockedCount;
  return snapshot;
}

function actionKey(snapshot, action) {
  return `${stateSignature(snapshot)}::${action.type}::${action.selector}`;
}

function stateSignature(snapshot) {
  const url = new URL(snapshot.url);
  return `${url.origin}${url.pathname}`;
}

function incrementActionVisit(actionVisitCounts, snapshot, action) {
  const key = actionKey(snapshot, action);
  actionVisitCounts.set(key, (actionVisitCounts.get(key) || 0) + 1);
}

function publicConfig(config) {
  return {
    targetUrl: config.targetUrl,
    maxSteps: config.maxSteps,
    headless: config.headless,
    authMode: config.auth && config.auth.mode,
    safety: config.safety,
    routes: config.routes,
    planner: config.planner,
    vision: config.vision,
    configPath: config.configPath
  };
}

function intelligenceSummary(config) {
  const plannerProvider = config.planner && config.planner.provider;
  const openAiAvailable = Boolean(process.env.OPENAI_API_KEY);
  return {
    planner: plannerProvider === "openai" && openAiAvailable ? "openai" : "heuristic",
    plannerNote: plannerProvider === "openai" && !openAiAvailable
      ? "OpenAI planner requested but OPENAI_API_KEY was not set; heuristic planner used."
      : "Planner completed.",
    vision: config.vision && config.vision.enabled && openAiAvailable ? "openai" : "disabled",
    visionNote: config.vision && config.vision.enabled && !openAiAvailable
      ? "Vision analysis requested but OPENAI_API_KEY was not set."
      : "Vision can be enabled with AUTOAI_VISION=true and OPENAI_API_KEY."
  };
}

async function httpSnapshot(url, runDir, label, modalOpen = false, errorVisible = false) {
  const response = await fetch(url);
  const html = await response.text();
  const title = (html.match(/<title>(.*?)<\/title>/i) || [null, "Untitled"])[1];
  const actions = extractHtmlActions(html, modalOpen);
  const screenshot = path.join("screenshots", `${label}.svg`).replace(/\\/g, "/");
  fs.writeFileSync(path.join(runDir, screenshot), renderEvidenceSvg({ title, url, actions, modalOpen, errorVisible }));
  return { title, url, actions, screenshot };
}

function extractHtmlActions(html, modalOpen) {
  const actions = [];
  const elementPattern = /<(a|button|input)\b([^>]*)>(.*?)<\/\1>|<(input)\b([^>]*)>/gis;
  let match;
  while ((match = elementPattern.exec(html))) {
    const tag = (match[1] || match[4]).toLowerCase();
    const attrs = parseAttrs(match[2] || match[5] || "");
    const text = stripTags(match[3] || "");
    const testId = attrs["data-testid"];
    if (!testId) continue;
    const inModal = ["project-name", "owner-email", "submit-project", "cancel-project"].includes(testId);
    if (inModal && !modalOpen) continue;
    actions.push({
      type: tag === "input" ? "fill" : "click",
      label: attrs["aria-label"] || attrs.placeholder || text || testId,
      selector: `[data-testid="${testId}"]`,
      href: attrs.href || null,
      tag
    });
  }
  return actions;
}

function parseAttrs(value) {
  const attrs = {};
  const pattern = /([a-zA-Z0-9-:]+)=["']([^"']*)["']/g;
  let match;
  while ((match = pattern.exec(value))) attrs[match[1]] = match[2];
  return attrs;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function renderEvidenceSvg({ title, url, actions, modalOpen, errorVisible }) {
  const rows = actions.slice(0, 6).map((action, index) =>
    `<text x="80" y="${270 + index * 38}" font-size="20" fill="#18202b">${escapeXml(action.type)}: ${escapeXml(action.label)}</text>`
  ).join("");
  const toast = errorVisible
    ? `<rect x="760" y="570" width="420" height="72" rx="8" fill="#fff3f1" stroke="#f3b7b1"/>
       <text x="786" y="615" font-size="22" fill="#842019">Create Project failed: server returned 500</text>`
    : "";
  const modal = modalOpen
    ? `<rect x="390" y="190" width="500" height="320" rx="10" fill="#ffffff" stroke="#cbd3df"/>
       <text x="430" y="245" font-size="30" font-weight="700" fill="#18202b">Create project</text>
       <rect x="430" y="282" width="420" height="48" rx="6" fill="#f8fafc" stroke="#cbd3df"/>
       <text x="448" y="313" font-size="18" fill="#667386">Demo Launch</text>
       <rect x="430" y="350" width="420" height="48" rx="6" fill="#f8fafc" stroke="#cbd3df"/>
       <text x="448" y="381" font-size="18" fill="#667386">qa@example.com</text>
       <rect x="430" y="425" width="180" height="48" rx="6" fill="#2552a4"/>
       <text x="455" y="456" font-size="18" fill="#ffffff">Submit Project</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#f4f6f8"/>
    <rect x="0" y="0" width="1280" height="68" fill="#ffffff"/>
    <text x="56" y="43" font-size="24" font-weight="800" fill="#18202b">LaunchBoard</text>
    <text x="880" y="43" font-size="18" fill="#2552a4">Pricing</text>
    <text x="970" y="43" font-size="18" fill="#2552a4">Dashboard</text>
    <text x="1100" y="43" font-size="18" fill="#2552a4">Settings</text>
    <text x="64" y="132" font-size="16" fill="#2552a4" font-weight="800">AUTONOMOUS QA SNAPSHOT</text>
    <text x="64" y="182" font-size="44" font-weight="800" fill="#18202b">${escapeXml(title)}</text>
    <text x="64" y="222" font-size="20" fill="#667386">${escapeXml(new URL(url).pathname || "/")}</text>
    <rect x="64" y="242" width="360" height="310" rx="8" fill="#ffffff" stroke="#dde3eb"/>
    <text x="80" y="242" dy="36" font-size="22" font-weight="700" fill="#18202b">Visible actions</text>
    ${rows}
    ${modal}
    ${toast}
  </svg>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBrowserLaunchBlocked(error) {
  return String(error && (error.message || error)).includes("spawn EPERM");
}

async function resolveVideoPath(page) {
  try {
    const video = page.video();
    if (!video) return null;
    const absolute = await video.path();
    return path.relative(latestRunDir, absolute).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

function resetLatestRun() {
  fs.rmSync(latestRunDir, { recursive: true, force: true });
  ensureDir(path.join(latestRunDir, "screenshots"));
  ensureDir(path.join(latestRunDir, "videos"));
}

if (require.main === module) {
  runAutonomousDemo({ quiet: process.argv.includes("--quiet") })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { runAutonomousDemo };
