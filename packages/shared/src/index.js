const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../../..");
const artifactsDir = path.join(rootDir, "artifacts");
const latestRunDir = path.join(artifactsDir, "latest");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  rootDir,
  artifactsDir,
  latestRunDir,
  ensureDir,
  writeJson,
  readJson,
  slugify,
  nowIso
};
