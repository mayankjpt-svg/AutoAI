class StateGraph {
  constructor() {
    this.states = new Map();
    this.edges = [];
  }

  addState(snapshot) {
    const key = snapshot.url.replace(/[?#].*$/, "");
    if (!this.states.has(key)) {
      this.states.set(key, {
        id: `state-${this.states.size + 1}`,
        key,
        title: snapshot.title || "Untitled",
        url: snapshot.url,
        screenshot: snapshot.screenshot,
        actions: snapshot.actions || [],
        visits: 0
      });
    }
    const state = this.states.get(key);
    state.visits += 1;
    state.actions = mergeActions(state.actions, snapshot.actions || []);
    state.screenshot = snapshot.screenshot || state.screenshot;
    state.title = snapshot.title || state.title;
    return state;
  }

  addEdge(fromUrl, toUrl, action) {
    const from = this.findByUrl(fromUrl);
    const to = this.findByUrl(toUrl);
    this.edges.push({
      from: from ? from.id : "external",
      to: to ? to.id : "unknown",
      action: action.description,
      type: action.type,
      success: action.success
    });
  }

  findByUrl(url) {
    const key = url.replace(/[?#].*$/, "");
    return this.states.get(key);
  }

  coverageScore() {
    const states = Array.from(this.states.values());
    const totalActions = states.reduce((sum, state) => sum + state.actions.length, 0);
    const traversed = this.edges.filter(edge => edge.success).length;
    if (totalActions === 0) return 0;
    return Math.min(100, Math.round((traversed / totalActions) * 100));
  }

  toJSON() {
    return {
      states: Array.from(this.states.values()),
      edges: this.edges,
      coverage: this.coverageScore()
    };
  }
}

function mergeActions(existing, incoming) {
  const byKey = new Map();
  for (const action of [...existing, ...incoming]) {
    byKey.set(`${action.type}:${action.label}:${action.selector}`, action);
  }
  return Array.from(byKey.values());
}

module.exports = { StateGraph };
