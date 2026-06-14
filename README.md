# AutoAI
Have to complete task by next 1 hour - Project:Autonomous QA Tester for Web Apps
Problem: E2E coverage is always incomplete because writing tests is slow. Build an agent that explores a web app like a real user and writes its own regression suite.
Build:
• Playwright control layer
• Vision + DOM dual-mode page understanding
• Persona-driven exploration agent (admin, paid user, free user, anonymous)
• Bug detector (visual regressions, console errors, broken flows, 4xx/5xx spikes)
• Test generator that emits durable Playwright code
• Issue filer with reproducible steps and a video clip
Scope to one app type (SaaS dashboard or e-commerce checkout) and Playwright only.
Stretch: Continuous mode that runs on every deploy and self-updates tests when the UI changes.
