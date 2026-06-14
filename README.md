# AutoAI

AutoAI is a working local demo of an Autonomous QA Engineer. It launches a demo SaaS dashboard, explores it as a project manager persona, detects an intentional project-creation failure, and emits evidence, an issue report, a state graph, and a generated Playwright regression test.

## Run the Demo

```bash
npm run demo
npm run dashboard
```

Then open:

```text
http://127.0.0.1:3000
```

## What the Demo Produces

The latest run is written to:

```text
artifacts/latest/
```

Key files:

- `run.json`: full autonomous run record
- `issue.md`: generated bug report
- `generated.spec.js`: generated Playwright regression test
- `screenshots/`: evidence snapshots

## How It Works

- `apps/demo-saas`: local SaaS target with one intentional `POST /api/projects` 500 error
- `apps/worker`: autonomous runner
- `apps/dashboard`: artifact dashboard
- `packages/agents`: deterministic planner persona
- `packages/playwright-engine`: Playwright browser path for normal local environments
- `packages/bug-detector`: console, network, and flow failure detection
- `packages/state-graph`: discovered page/action graph
- `packages/test-generator`: issue and regression test generation

If Chromium launch is blocked by the execution environment, the worker automatically falls back to a built-in HTTP explorer so the demo still completes end-to-end.

## Run Against Another SaaS App

Quick one-off:

```bash
set TARGET_URL=https://your-saas.example.com
npm run demo
```

With a config file:

```bash
copy autoai.config.example.json autoai.config.json
npm run demo -- --config autoai.config.json
```

The bundled demo target is used only when no `TARGET_URL` and no config `targetUrl` are provided.

## Auth Modes

`auth.mode` supports:

- `none`: start directly at the target URL
- `storageState`: reuse a saved Playwright login state file
- `credentials`: fill configured username/password selectors from environment variables
- `manual`: open the login page, let you log in once, then save storage state

Credential mode uses these by default:

```bash
set AUTOAI_USERNAME=you@example.com
set AUTOAI_PASSWORD=your-password
set AUTOAI_AUTH_MODE=credentials
npm run demo
```

Manual auth is safer for MFA/SSO:

```bash
set AUTOAI_AUTH_MODE=manual
set AUTOAI_HEADLESS=false
npm run demo
```

## Safety And Scope

The runner blocks risky actions by default, including delete, billing, invite, send, purchase, publish, subscribe, upgrade, downgrade, and logout. You can tune this in `autoai.config.json` under:

- `safety.denyActionKeywords`
- `safety.denySelectors`
- `routes.allowlist`
- `routes.denylist`
- `routes.stayOnOrigin`

## Personas And Goals

Add app-specific personas in `autoai.config.json`:

```json
{
  "personas": [
    {
      "role": "workspace_admin",
      "goals": ["open dashboard", "create report", "edit settings"],
      "formValues": {
        "email": "qa@example.com",
        "name": "Demo Record"
      }
    }
  ]
}
```

Run a specific persona:

```bash
npm run demo -- --persona workspace_admin
```

## Optional OpenAI Planning And Vision

The config accepts `planner.provider: "openai"` and `vision.enabled: true`. If `OPENAI_API_KEY` is not present, the runner safely falls back to the local heuristic planner and records that in `run.json`.
