class OpenAIClient {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = "gpt-4.1-mini" } = {}) {
    this.apiKey = apiKey;
    this.model = model;
  }

  available() {
    return Boolean(this.apiKey);
  }

  async chooseAction({ persona, snapshot, actions }) {
    if (!this.available()) return null;
    const prompt = [
      "You are an autonomous QA planner.",
      "Choose exactly one next action from the provided safe action list.",
      "Do not invent actions. Do not choose destructive, billing, invite, send, purchase, publish, or logout actions.",
      "Return compact JSON only: {\"selector\":\"...\",\"reason\":\"...\"}.",
      "",
      `Persona: ${JSON.stringify(persona)}`,
      `Page: ${snapshot.title} ${snapshot.url}`,
      `Actions: ${JSON.stringify(actions.map(action => ({
        type: action.type,
        label: action.label,
        selector: action.selector,
        href: action.href || null
      })))}`
    ].join("\n");

    const output = await this.responsesText(prompt);
    const parsed = parseJsonObject(output);
    if (!parsed || !parsed.selector) return null;
    const action = actions.find(item => item.selector === parsed.selector);
    return action ? { ...action, reason: parsed.reason || "OpenAI planner selected this action." } : null;
  }

  async analyzeVision({ persona, snapshot, screenshotBase64, mimeType }) {
    if (!this.available() || !screenshotBase64) return null;
    const body = {
      model: this.model,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "You are reviewing a SaaS page screenshot for QA exploration.",
              "Summarize visible user tasks, forms, navigation, and possible defects.",
              `Persona: ${JSON.stringify(persona)}`,
              `URL: ${snapshot.url}`
            ].join("\n")
          },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${screenshotBase64}`
          }
        ]
      }]
    };

    return this.requestResponses(body);
  }

  async responsesText(prompt) {
    const body = {
      model: this.model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }]
    };
    return this.requestResponses(body);
  }

  async requestResponses(body) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenAI request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    return extractOutputText(data);
  }
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function parseJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

module.exports = { OpenAIClient };
