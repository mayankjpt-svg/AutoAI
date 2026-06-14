function generatePlaywrightTest(run) {
  const lines = [
    "const { test, expect } = require('@playwright/test');",
    "",
    "test('autonomous regression from latest run', async ({ page }) => {",
    `  await page.goto(process.env.BASE_URL || ${JSON.stringify(run.baseUrl)});`
  ];

  const replayable = run.actions.filter(action => action.success && ["click", "fill"].includes(action.type));
  for (const action of replayable) {
    if (action.type === "click") {
      lines.push(`  await page.locator(${JSON.stringify(action.selector)}).click();`);
    }
    if (action.type === "fill") {
      lines.push(`  await page.locator(${JSON.stringify(action.selector)}).fill(${JSON.stringify(action.value)});`);
    }
  }

  if (run.bugs.some(bug => bug.type === "network" && bug.status >= 500)) {
    lines.push("  // Regression assertion: project creation should stop returning a server error.");
    lines.push("  await expect(page.locator('[data-testid=\"toast\"]')).not.toContainText('500');");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function generateIssueMarkdown(run) {
  if (run.bugs.length === 0) {
    return "# Autonomous QA Report\n\nNo bugs were detected in the latest run.\n";
  }

  return run.bugs.map(bug => {
    const steps = run.actions
      .filter(action => action.timestamp <= bug.timestamp)
      .map((action, index) => `${index + 1}. ${action.type} ${action.label}`)
      .join("\n");

    return [
      `# ${bug.title}`,
      "",
      `Severity: ${bug.severity}`,
      `Confidence: ${Math.round((bug.confidence || 0.7) * 100)}%`,
      "",
      "## Steps",
      steps || "1. Start autonomous exploration.",
      "",
      "## Expected",
      bug.expected,
      "",
      "## Actual",
      bug.actual,
      "",
      "## Root Cause Guess",
      bug.rootCauseGuess,
      "",
      "## Evidence",
      `- Screenshot: ${run.evidence.finalScreenshot || "not captured"}`,
      `- Video: ${run.evidence.video || "not captured"}`,
      ""
    ].join("\n");
  }).join("\n---\n\n");
}

module.exports = { generatePlaywrightTest, generateIssueMarkdown };
