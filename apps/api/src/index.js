const http = require("http");
const path = require("path");
const fs = require("fs");
const { latestRunDir, readJson } = require("../../../packages/shared/src");
const { runAutonomousDemo } = require("../../worker/src/index");

function createApiServer(port = 5050) {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") return json(res, { ok: true });
    if (req.url === "/runs/latest") return json(res, readJson(path.join(latestRunDir, "run.json"), {}));
    if (req.url === "/runs/latest/issue") return text(res, readText("issue.md"), "text/markdown");
    if (req.url === "/runs/latest/test") return text(res, readText("generated.spec.js"), "text/javascript");
    if (req.url === "/runs" && req.method === "POST") {
      const run = await runAutonomousDemo({ quiet: true });
      return json(res, run, 201);
    }
    json(res, { error: "Not found" }, 404);
  });

  return {
    start: () => new Promise(resolve => server.listen(port, "127.0.0.1", resolve)),
    stop: () => new Promise(resolve => server.close(resolve)),
    url: `http://127.0.0.1:${port}`
  };
}

function readText(name) {
  const file = path.join(latestRunDir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function json(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value, null, 2));
}

function text(res, value, contentType) {
  res.writeHead(200, { "content-type": `${contentType}; charset=utf-8` });
  res.end(value);
}

if (require.main === module) {
  const api = createApiServer(Number(process.env.PORT || 5050));
  api.start().then(() => console.log(`AutoAI API running at ${api.url}`));
}

module.exports = { createApiServer };
