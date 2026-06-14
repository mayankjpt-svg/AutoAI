const fs = require("fs");
const path = require("path");
const { rootDir } = require("../../../packages/shared/src");
const { personas } = require("../../../packages/agents/src");

const defaultConfig = {
  targetUrl: null,
  maxSteps: 12,
  headless: true,
  auth: {
    mode: "none",
    loginUrl: null,
    storageStatePath: "artifacts/auth/storage-state.json",
    manualTimeoutMs: 120000,
    credentials: {
      usernameEnv: "AUTOAI_USERNAME",
      passwordEnv: "AUTOAI_PASSWORD",
      usernameSelector: "[name=\"email\"], [type=\"email\"]",
      passwordSelector: "[name=\"password\"], [type=\"password\"]",
      submitSelector: "button[type=\"submit\"], [data-testid*=\"login\"], [data-testid*=\"sign-in\"]"
    }
  },
  personas,
  safety: {
    denyActionKeywords: [
      "delete",
      "remove",
      "archive",
      "billing",
      "payment",
      "invite",
      "send",
      "publish",
      "purchase",
      "subscribe",
      "upgrade",
      "downgrade",
      "logout"
    ],
    allowActionKeywords: [],
    denySelectors: [],
    requireConfirmationKeywords: []
  },
  routes: {
    stayOnOrigin: true,
    allowlist: [],
    denylist: ["/logout", "/billing", "/payment"]
  },
  planner: {
    provider: "heuristic",
    openaiModel: "gpt-4.1-mini"
  },
  vision: {
    enabled: false,
    openaiModel: "gpt-4.1-mini"
  }
};

function loadRunnerConfig(argv = process.argv, env = process.env) {
  const configPath = valueAfter(argv, "--config") || env.AUTOAI_CONFIG || "autoai.config.json";
  const fileConfig = readConfig(configPath);
  const merged = mergeDeep(defaultConfig, fileConfig);

  if (env.TARGET_URL) merged.targetUrl = env.TARGET_URL;
  if (env.AUTOAI_MAX_STEPS) merged.maxSteps = Number(env.AUTOAI_MAX_STEPS);
  if (env.AUTOAI_HEADLESS) merged.headless = env.AUTOAI_HEADLESS !== "false";
  if (env.AUTOAI_AUTH_MODE) merged.auth.mode = env.AUTOAI_AUTH_MODE;
  if (env.AUTOAI_LOGIN_URL) merged.auth.loginUrl = env.AUTOAI_LOGIN_URL;
  if (env.AUTOAI_STORAGE_STATE) merged.auth.storageStatePath = env.AUTOAI_STORAGE_STATE;
  if (env.OPENAI_API_KEY && env.AUTOAI_PLANNER === "openai") merged.planner.provider = "openai";
  if (env.AUTOAI_VISION === "true") merged.vision.enabled = true;

  merged.persona = choosePersona(merged, valueAfter(argv, "--persona") || env.AUTOAI_PERSONA);
  merged.configPath = fs.existsSync(resolveFromRoot(configPath)) ? resolveFromRoot(configPath) : null;
  return merged;
}

function choosePersona(config, requestedRole) {
  if (requestedRole) {
    const found = config.personas.find(persona => persona.role === requestedRole);
    if (found) return found;
  }
  return config.personas[0] || personas[0];
}

function readConfig(configPath) {
  const resolved = resolveFromRoot(configPath);
  if (!fs.existsSync(resolved)) return {};
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function resolveFromRoot(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

function valueAfter(argv, key) {
  const index = argv.indexOf(key);
  return index >= 0 ? argv[index + 1] : null;
}

function mergeDeep(base, override) {
  if (!override || typeof override !== "object") return structuredClone(base);
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = mergeDeep(base[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

module.exports = { loadRunnerConfig, resolveFromRoot };
