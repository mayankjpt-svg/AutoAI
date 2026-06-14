function applyActionPolicy(actions, snapshot, run) {
  return actions
    .map(action => ({ ...action, policy: evaluateAction(action, snapshot, run) }))
    .filter(action => action.policy.allowed);
}

function evaluateAction(action, snapshot, run) {
  const label = `${action.label || ""} ${action.selector || ""}`.toLowerCase();
  const safety = run.config.safety || {};
  const routes = run.config.routes || {};

  for (const selector of safety.denySelectors || []) {
    if (action.selector && action.selector.includes(selector)) {
      return deny(`selector matched deny rule: ${selector}`);
    }
  }

  for (const keyword of safety.denyActionKeywords || []) {
    if (label.includes(String(keyword).toLowerCase())) {
      return deny(`blocked by safety keyword: ${keyword}`);
    }
  }

  if (action.href) {
    const target = safeUrl(action.href, snapshot.url);
    if (!target) return deny("invalid link target");

    if (routes.stayOnOrigin) {
      const current = new URL(snapshot.url);
      if (target.origin !== current.origin) return deny("external origin blocked");
    }

    if ((routes.allowlist || []).length > 0 && !matchesAny(target, routes.allowlist)) {
      return deny("route not in allowlist");
    }

    if (matchesAny(target, routes.denylist || [])) {
      return deny("route matched denylist");
    }
  }

  return { allowed: true, reason: "allowed" };
}

function safeUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
}

function matchesAny(url, rules) {
  return rules.some(rule => {
    const value = String(rule);
    return url.href.includes(value) || url.pathname.includes(value);
  });
}

function deny(reason) {
  return { allowed: false, reason };
}

module.exports = { applyActionPolicy, evaluateAction };
