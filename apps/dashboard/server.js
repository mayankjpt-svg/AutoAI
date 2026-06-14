const http = require("http");
const fs = require("fs");
const path = require("path");
const { latestRunDir, readJson } = require("../../packages/shared/src");

function createDashboardServer(port = 3000) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/artifacts/")) {
      const relative = decodeURIComponent(url.pathname.replace("/artifacts/", ""));
      const file = path.normalize(path.join(latestRunDir, relative));
      if (!file.startsWith(latestRunDir) || !fs.existsSync(file)) return notFound(res);
      return serveFile(res, file);
    }

    if (url.pathname === "/api/latest") {
      return json(res, readJson(path.join(latestRunDir, "run.json"), null));
    }

    sendHtml(res, dashboardHtml());
  });

  return {
    start: () => new Promise(resolve => server.listen(port, "127.0.0.1", resolve)),
    stop: () => new Promise(resolve => server.close(resolve)),
    url: `http://127.0.0.1:${port}`
  };
}

function dashboardHtml() {
  const run = readJson(path.join(latestRunDir, "run.json"), null);
  const issue = readText("issue.md");
  const generatedTest = readText("generated.spec.js");

  if (!run) {
    return shell(`<main class="empty">
      <h1>AutoAI Dashboard</h1>
      <p>No run artifacts yet. Run <code>npm run demo</code> first, then refresh this page.</p>
    </main>`);
  }

  const states = run.graph.states.map(state => `
    <article class="state">
      <div>
        <strong>${escapeHtml(state.title)}</strong>
        <span>${escapeHtml(new URL(state.url).pathname || "/")}</span>
      </div>
      <small>${state.actions.length} actions</small>
    </article>
  `).join("");

  const bugs = run.bugs.map(bug => `
    <article class="bug">
      <div class="severity">${escapeHtml(bug.severity)}</div>
      <h3>${escapeHtml(bug.title)}</h3>
      <p>${escapeHtml(bug.actual)}</p>
      <small>${escapeHtml(bug.rootCauseGuess)}</small>
    </article>
  `).join("") || `<p class="muted">No bugs detected.</p>`;

  const actions = run.actions.map((action, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(action.type)}</td>
      <td>${escapeHtml(action.label)}</td>
      <td>${action.success ? "Passed" : "Flagged"}</td>
    </tr>
  `).join("");

  return shell(`
    <main>
      <section class="topbar">
        <div>
          <p class="eyebrow">Autonomous QA Engineer</p>
          <h1>Latest Run: ${escapeHtml(run.status.toUpperCase())}</h1>
          <p>Explored ${escapeHtml(run.baseUrl)} as ${escapeHtml(run.persona.role)}.</p>
        </div>
        <a class="button" href="/artifacts/generated.spec.js">Open Generated Test</a>
      </section>

      <section class="metrics">
        ${metric("States", run.summary.states)}
        ${metric("Actions", run.summary.actions)}
        ${metric("Bugs", run.summary.bugs)}
        ${metric("Coverage", `${run.summary.coverage}%`)}
      </section>

      <section>
        <h2>Runner Configuration</h2>
        <div class="config-grid">
          ${metric("Mode", run.mode || "playwright")}
          ${metric("Auth", (run.config && run.config.authMode) || "none")}
          ${metric("Planner", (run.intelligence && run.intelligence.planner) || "heuristic")}
          ${metric("Blocked", (run.blockedActions || []).length)}
        </div>
        <p>${escapeHtml((run.intelligence && run.intelligence.plannerNote) || "")}</p>
      </section>

      <section class="layout">
        <div>
          <h2>State Graph</h2>
          <div class="states">${states}</div>
        </div>
        <div>
          <h2>Bugs</h2>
          ${bugs}
        </div>
      </section>

      <section class="layout">
        <div>
          <h2>Final Evidence</h2>
          <img src="/artifacts/${escapeHtml(run.evidence.finalScreenshot)}" alt="Final screenshot from autonomous run">
        </div>
        <div>
          <h2>Issue Report</h2>
          <pre>${escapeHtml(issue)}</pre>
        </div>
      </section>

      <section>
        <h2>Recorded Actions</h2>
        <table>
          <thead><tr><th>#</th><th>Type</th><th>Target</th><th>Result</th></tr></thead>
          <tbody>${actions}</tbody>
        </table>
      </section>

      <section>
        <h2>Generated Playwright Test</h2>
        <pre>${escapeHtml(generatedTest)}</pre>
      </section>
    </main>
  `);
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function shell(body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AutoAI Dashboard</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, Segoe UI, Arial, sans-serif; color: #18202b; background: #f4f6f8; }
    body { margin: 0; }
    main { max-width: 1220px; margin: 0 auto; padding: 32px 24px 56px; }
    h1 { margin: 0 0 10px; font-size: 42px; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 22px; }
    h3 { margin: 8px 0; }
    p { color: #586575; line-height: 1.55; }
    .eyebrow { color: #2552a4; font-weight: 800; text-transform: uppercase; font-size: 12px; letter-spacing: .08em; margin: 0 0 8px; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .button { display: inline-flex; align-items: center; border-radius: 6px; padding: 11px 16px; color: #fff; background: #2552a4; text-decoration: none; font-weight: 800; white-space: nowrap; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
    .config-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .metric, .state, .bug, section, pre, table { background: #fff; border: 1px solid #dde3eb; border-radius: 8px; }
    .metric { padding: 18px; }
    .metric span { display: block; color: #667386; font-size: 13px; margin-bottom: 8px; }
    .metric strong { font-size: 34px; }
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; background: transparent; border: 0; padding: 0; }
    section { padding: 20px; margin-bottom: 18px; }
    .states { display: grid; gap: 10px; }
    .state { padding: 14px; display: flex; justify-content: space-between; gap: 12px; }
    .state span, small, .muted { color: #667386; }
    .bug { padding: 16px; border-left: 4px solid #b3261e; }
    .severity { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #fff3f1; color: #9f261d; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    img { width: 100%; border: 1px solid #dde3eb; border-radius: 8px; display: block; }
    pre { overflow: auto; padding: 16px; line-height: 1.45; white-space: pre-wrap; max-height: 520px; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e7ebf0; text-align: left; }
    th { font-size: 12px; color: #667386; text-transform: uppercase; letter-spacing: .06em; }
    .empty { min-height: 80vh; display: grid; place-content: center; text-align: center; }
    code { background: #e9edf3; padding: 3px 6px; border-radius: 4px; }
    @media (max-width: 820px) { .topbar, .layout { display: block; } .metrics, .config-grid { grid-template-columns: repeat(2, 1fr); } .button { margin-top: 12px; } h1 { font-size: 34px; } }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function readText(name) {
  const file = path.join(latestRunDir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const types = { ".png": "image/png", ".svg": "image/svg+xml", ".js": "text/javascript", ".md": "text/markdown", ".json": "application/json", ".webm": "video/webm" };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function json(res, value) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value, null, 2));
}

function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (require.main === module) {
  const app = createDashboardServer(Number(process.env.PORT || 3000));
  app.start().then(() => console.log(`AutoAI dashboard running at ${app.url}`));
}

module.exports = { createDashboardServer };
