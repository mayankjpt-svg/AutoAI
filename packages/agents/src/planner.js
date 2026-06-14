class PlannerAgent {
  constructor(persona, options = {}) {
    this.persona = persona;
    this.options = options;
    this.completedGoals = new Set();
  }

  chooseNextAction(snapshot, history) {
    const actions = snapshot.actions || [];
    const completedSelectors = new Set(history.map(item => item.selector));
    const projectModalActions = actions.some(action => action.selector === "[data-testid=\"submit-project\"]");
    if (projectModalActions) {
      for (const selector of [
        "[data-testid=\"project-name\"]",
        "[data-testid=\"owner-email\"]",
        "[data-testid=\"submit-project\"]"
      ]) {
        const action = actions.find(item => item.selector === selector);
        if (action && !completedSelectors.has(selector)) {
          return { ...action, reason: reasonFor(action, this.persona) };
        }
      }
    }

    const candidates = actions.filter(action => !completedSelectors.has(action.selector));
    const ranked = candidates
      .map(action => ({ action, score: this.score(action, snapshot) }))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) return null;
    const selected = ranked[0].action;
    return {
      ...selected,
      reason: reasonFor(selected, this.persona)
    };
  }

  score(action, snapshot) {
    const text = `${action.label} ${action.selector} ${action.href || ""} ${snapshot.url}`.toLowerCase();
    let score = 1;
    for (const goal of this.persona.goals) {
      for (const token of goal.toLowerCase().split(/\s+/)) {
        if (token.length > 2 && text.includes(token)) score += 8;
      }
    }
    if (action.type === "fill") score += 2;
    if (text.includes("create")) score += 12;
    if (text.includes("dashboard")) score += 16;
    if (text.includes("new")) score += 8;
    if (text.includes("add")) score += 8;
    if (text.includes("save")) score += 5;
    if (text.includes("submit")) score += 6;
    if (text.includes("settings")) score += 4;
    if (action.policy && action.policy.reason) score -= 1;
    return score;
  }
}

const personas = [
  {
    role: "anonymous_founder",
    goals: ["open dashboard", "start trial", "review pricing"]
  },
  {
    role: "project_manager",
    goals: ["create project", "edit project", "visit settings", "invite teammate"]
  }
];

function reasonFor(action, persona) {
  return `${persona.role} is pursuing a realistic user goal and "${action.label}" is the strongest available next step.`;
}

module.exports = { PlannerAgent, personas };
