class BugDetector {
  constructor() {
    this.consoleErrors = [];
    this.networkFailures = [];
    this.flowFailures = [];
  }

  attach(page) {
    page.on("console", message => {
      if (message.type() === "error") {
        this.consoleErrors.push({
          type: "console",
          severity: "high",
          message: message.text(),
          timestamp: new Date().toISOString()
        });
      }
    });

    page.on("response", response => {
      const status = response.status();
      if (status >= 400) {
        this.networkFailures.push({
          type: "network",
          severity: status >= 500 ? "critical" : "medium",
          status,
          url: response.url(),
          method: response.request().method(),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  recordFlowFailure(failure) {
    this.flowFailures.push({
      type: "flow",
      severity: "high",
      timestamp: new Date().toISOString(),
      ...failure
    });
  }

  summarize() {
    const all = [...this.networkFailures, ...this.consoleErrors, ...this.flowFailures];
    return dedupeBugs(all).map((bug, index) => ({
      id: `bug-${index + 1}`,
      title: titleForBug(bug),
      expected: expectedForBug(bug),
      actual: actualForBug(bug),
      rootCauseGuess: rootCauseGuess(bug),
      confidence: bug.type === "network" && bug.status >= 500 ? 0.84 : 0.72,
      ...bug
    }));
  }
}

function dedupeBugs(bugs) {
  const seen = new Set();
  return bugs.filter(bug => {
    const key = `${bug.type}:${bug.status || ""}:${bug.url || ""}:${bug.message || ""}:${bug.action || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleForBug(bug) {
  if (bug.type === "network") return `${bug.method} ${new URL(bug.url).pathname} returned ${bug.status}`;
  if (bug.type === "console") return "Console error detected during exploration";
  return `${bug.action || "User action"} did not complete as expected`;
}

function expectedForBug(bug) {
  if (bug.type === "network") return "The request should complete successfully.";
  if (bug.type === "console") return "The page should run without browser console errors.";
  return "The action should change page state, navigate, or show a success confirmation.";
}

function actualForBug(bug) {
  if (bug.type === "network") return `${bug.method} ${bug.url} returned HTTP ${bug.status}.`;
  if (bug.type === "console") return bug.message;
  return bug.reason || "No meaningful page change was observed.";
}

function rootCauseGuess(bug) {
  if (bug.type === "network") {
    const path = new URL(bug.url).pathname;
    return `${path} is likely failing in its server-side handler or downstream service.`;
  }
  if (bug.type === "console") return "A client-side runtime exception is likely breaking the current interaction.";
  return "The clicked control may be unhandled, disabled by state, or missing a success path.";
}

module.exports = { BugDetector };
