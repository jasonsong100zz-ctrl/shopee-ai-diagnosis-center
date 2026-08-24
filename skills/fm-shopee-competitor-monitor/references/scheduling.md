# Daily Scheduling

Codex can schedule a recurring task that invokes this Skill, but scheduling the prompt is not the same as guaranteeing an unattended Shopee browser run.

## Choose the execution surface

### Team server or cloud collector

Use a Codex recurring task, Cloud Scheduler, GitHub Actions, or another approved scheduler when the collector can use an authorized data source without a personal browser. The scheduled prompt should state the watchlist source, markets, output destination, expected run window, and failure notification path. The job should publish structured SKU rows through the per-user or team-owned sync endpoint.

### User-owned Chrome session

Use a local scheduled task only when the user's computer is on, the dedicated Chrome profile is available, the user remains authorized, and the browser connection can be reached. The current FM extension is manual-start by design. A timer may notify or trigger a supporting local collector, but it must pause when login, CAPTCHA, traffic verification, or a redirect occurs.

Do not store or export passwords or cookies to make the timer unattended. Do not add logic that drags a slider, solves CAPTCHA, rotates identities, or evades rate limits.

## Recommended team rollout

1. Start with a daily Codex automation that checks the watchlist and asks the owner to start or verify the browser run.
2. After the authorized page/data source is stable, move the repeatable collection and cloud upload to a server-side scheduler.
3. Keep the FM extension as the manual recovery and inspection tool for pages that need a signed-in browser.
4. Configure one sync endpoint and token per user or per approved workspace; record `run_id`, user, capture time, success count, and failure count.

## Automation prompt content

When creating a recurring task, include:

- the fixed Google Sheet or CSV watchlist URL;
- the intended market and capture window;
- the exact output destination and user's sync endpoint reference;
- the rule to preserve one row per SKU and null incomplete prices;
- the rule to stop on login/CAPTCHA/traffic verification;
- the expected success/failure summary and notification recipient.

Do not put a secret token in the automation prompt. Store it in the user's local extension configuration or the server-side secret manager.
