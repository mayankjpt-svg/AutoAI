const http = require("http");
const { URL } = require("url");

function createDemoSaasServer(port = 4173) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/projects" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: "ProjectService.create failed",
          detail: "Intentional demo failure for autonomous QA detection.",
          received: body ? JSON.parse(body) : null
        }));
      });
      return;
    }

    if (url.pathname === "/api/projects") {
      sendJson(res, [
        { id: "p1", name: "Checkout Refresh", status: "Healthy" },
        { id: "p2", name: "Billing Portal", status: "At risk" }
      ]);
      return;
    }

    if (url.pathname === "/dashboard") return sendHtml(res, dashboardPage());
    if (url.pathname === "/settings") return sendHtml(res, settingsPage());
    if (url.pathname === "/pricing") return sendHtml(res, pricingPage());
    sendHtml(res, landingPage());
  });

  return {
    server,
    url: `http://127.0.0.1:${port}`,
    start: () => new Promise(resolve => server.listen(port, "127.0.0.1", resolve)),
    stop: () => new Promise(resolve => server.close(resolve))
  };
}

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function shell(title, body, script = "") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, Segoe UI, Arial, sans-serif; color: #18202b; background: #f6f7f9; }
    body { margin: 0; }
    header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; border-bottom: 1px solid #dde2ea; background: #fff; }
    nav { display: flex; gap: 12px; align-items: center; }
    a, button { font: inherit; }
    a { color: #2552a4; text-decoration: none; }
    .brand { font-weight: 800; color: #18202b; }
    main { max-width: 1120px; margin: 0 auto; padding: 36px 24px; }
    .hero { min-height: 440px; display: grid; align-items: center; grid-template-columns: 1.1fr .9fr; gap: 40px; }
    h1 { font-size: 56px; line-height: 1; margin: 0 0 18px; letter-spacing: 0; }
    h2 { font-size: 28px; margin: 0 0 16px; }
    p { color: #526070; line-height: 1.6; }
    .panel, .card { background: #fff; border: 1px solid #dde2ea; border-radius: 8px; box-shadow: 0 18px 50px rgba(36, 46, 66, .08); }
    .panel { padding: 28px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { padding: 18px; }
    .button, button { border: 0; border-radius: 6px; padding: 11px 16px; background: #2552a4; color: #fff; cursor: pointer; font-weight: 700; }
    .secondary { background: #e9eef7; color: #2552a4; }
    .danger { background: #b3261e; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 6px; border: 1px solid #c8d0dc; margin: 8px 0 14px; font: inherit; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dde2ea; border-radius: 8px; overflow: hidden; }
    th, td { padding: 14px 16px; border-bottom: 1px solid #e8ecf2; text-align: left; }
    th { color: #526070; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 16px; }
    .modal { position: fixed; inset: 0; display: none; place-items: center; background: rgba(24,32,43,.45); }
    .modal.open { display: grid; }
    .modal .panel { width: min(460px, calc(100vw - 32px)); }
    .toast { position: fixed; right: 24px; bottom: 24px; max-width: 420px; padding: 14px 16px; border-radius: 8px; background: #fff3f1; border: 1px solid #f3b7b1; color: #842019; display: none; }
    .toast.show { display: block; }
    @media (max-width: 760px) { header { padding: 0 16px; } .hero, .grid { grid-template-columns: 1fr; } h1 { font-size: 40px; } }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/">LaunchBoard</a>
    <nav>
      <a data-testid="pricing-link" href="/pricing">Pricing</a>
      <a data-testid="dashboard-link" href="/dashboard">Dashboard</a>
      <a data-testid="settings-link" href="/settings">Settings</a>
    </nav>
  </header>
  ${body}
  ${script}
</body>
</html>`;
}

function landingPage() {
  return shell("LaunchBoard", `<main class="hero">
    <section>
      <h1>LaunchBoard</h1>
      <p>Demo SaaS dashboard for autonomous QA exploration, with a realistic project creation flow and one intentional server-side defect.</p>
      <a class="button" data-testid="start-trial" href="/dashboard">Start trial</a>
      <a class="button secondary" data-testid="view-pricing" href="/pricing">View pricing</a>
    </section>
    <section class="panel">
      <h2>Operations snapshot</h2>
      <div class="grid">
        <div class="card"><strong>24</strong><p>Active projects</p></div>
        <div class="card"><strong>8</strong><p>Team members</p></div>
        <div class="card"><strong>99.9%</strong><p>Uptime</p></div>
      </div>
    </section>
  </main>`);
}

function dashboardPage() {
  return shell("Dashboard", `<main>
    <div class="toolbar">
      <div>
        <h1 style="font-size:36px">Projects</h1>
        <p>Manage launches, ownership, and delivery health.</p>
      </div>
      <button data-testid="create-project">Create Project</button>
    </div>
    <table>
      <thead><tr><th>Project</th><th>Status</th><th>Owner</th><th></th></tr></thead>
      <tbody>
        <tr><td>Checkout Refresh</td><td>Healthy</td><td>Nandita</td><td><button class="secondary" data-testid="edit-checkout">Edit</button></td></tr>
        <tr><td>Billing Portal</td><td>At risk</td><td>QA Team</td><td><button class="secondary" data-testid="edit-billing">Edit</button></td></tr>
      </tbody>
    </table>
  </main>
  <div class="modal" data-testid="project-modal">
    <form class="panel" data-testid="project-form">
      <h2>Create project</h2>
      <label>Project Name<input data-testid="project-name" aria-label="Project Name" name="name" placeholder="Demo Launch"></label>
      <label>Owner Email<input data-testid="owner-email" aria-label="Owner Email" name="email" placeholder="qa@example.com"></label>
      <button data-testid="submit-project" type="submit">Submit Project</button>
      <button data-testid="cancel-project" class="secondary" type="button">Cancel</button>
    </form>
  </div>
  <div class="toast" data-testid="toast"></div>`, `<script>
    const modal = document.querySelector('[data-testid="project-modal"]');
    const toast = document.querySelector('[data-testid="toast"]');
    document.querySelector('[data-testid="create-project"]').addEventListener('click', () => modal.classList.add('open'));
    document.querySelector('[data-testid="cancel-project"]').addEventListener('click', () => modal.classList.remove('open'));
    document.querySelector('[data-testid="project-form"]').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.target);
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), owner: form.get('email') })
      });
      if (!response.ok) {
        console.error('Create project failed with status', response.status);
        toast.textContent = 'Create Project failed: server returned ' + response.status;
        toast.classList.add('show');
        return;
      }
      toast.textContent = 'Project created';
      toast.classList.add('show');
    });
  </script>`);
}

function settingsPage() {
  return shell("Settings", `<main>
    <h1 style="font-size:36px">Settings</h1>
    <div class="grid">
      <section class="card"><h2>Workspace</h2><p>LaunchBoard Demo</p><button data-testid="save-settings">Save settings</button></section>
      <section class="card"><h2>Team</h2><p>Invite teammates and assign roles.</p><button data-testid="invite-user">Invite User</button></section>
      <section class="card"><h2>Billing</h2><p>Current plan: Growth.</p><button data-testid="manage-billing">Manage Billing</button></section>
    </div>
  </main>`);
}

function pricingPage() {
  return shell("Pricing", `<main>
    <h1 style="font-size:36px">Pricing</h1>
    <div class="grid">
      <section class="card"><h2>Starter</h2><p>$19/month</p><a class="button" data-testid="choose-starter" href="/dashboard">Choose Starter</a></section>
      <section class="card"><h2>Growth</h2><p>$79/month</p><a class="button" data-testid="choose-growth" href="/dashboard">Choose Growth</a></section>
      <section class="card"><h2>Scale</h2><p>Custom</p><button data-testid="contact-sales">Contact Sales</button></section>
    </div>
  </main>`);
}

if (require.main === module) {
  const app = createDemoSaasServer(Number(process.env.PORT || 4173));
  app.start().then(() => {
    console.log(`Demo SaaS running at ${app.url}`);
  });
}

module.exports = { createDemoSaasServer };
