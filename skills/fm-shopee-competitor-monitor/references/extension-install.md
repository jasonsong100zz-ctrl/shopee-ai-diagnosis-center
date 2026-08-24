# Extension Installation and Adjustment

## Install for a business user

1. Obtain the latest Skill package, or use its bundled `assets/chrome-extension/` directory. The repository may also provide `SHOPEE竞品监控-扩展包.zip` as a separate convenience package.
2. Run `scripts/install-chrome-extension.ps1` from the installed Skill. It copies the bundled extension to a stable user-writable directory and opens `chrome://extensions`.
3. Enable Developer mode, choose “Load unpacked”, and select the prepared extension directory printed by the script.
4. Reload the extension after an update. Existing Chrome login state remains in the current Chrome profile; the extension must not read or export passwords or cookies.
5. Confirm the extension named `FM 竞品监控` is visible and enabled before starting a run. If it is not visible, installation is not complete.
6. Open the extension popup, paste the user's Google Sheet link, choose offline CSV or a personal sync endpoint, and start a manually initiated run.

When a Shopee login, CAPTCHA, or traffic verification page appears, stop and let the user handle it in the visible browser. Continue only after the user confirms the page is ready.

Do not use the in-app browser or a headless browser as a fallback when the task depends on the user's cached Chrome login. If the Chrome extension cannot be installed, report the exact one-time manual step that remains instead of switching browsers silently.

## Extension files

- `manifest.json`: permissions, markets, page injection, and optional sync host permission.
- `content.js`: visible page fields, embedded model data, observed PDP response data, SKU normalization, and snapshot construction.
- `inject.js`: page-context observer for normal `fetch`/XHR PDP responses; it must not replay requests.
- `background.js`: watchlist loading, queue control, CSV export, optional cloud upload, and state/badge updates.
- `popup.html`, `popup.js`, `popup.css`: per-user configuration and progress UI.

## Safe customization checklist

- Add a new market in both the URL normalization map and manifest match patterns.
- Add output fields in the snapshot, CSV header, row builder, and any cloud schema together.
- Preserve `capture_status`, `error_message`, `model_price_capture_status`, and source identity fields.
- Keep sync secrets in local extension storage or the user's server-side secret store; never put shared secrets in the package.
- Rebuild the ZIP from the complete extension directory so `manifest.json` stays at the archive root and icons remain under `icons/`.
- Run `node --check` for all JavaScript files, validate manifest JSON, run repository validation, and inspect ZIP entries before delivery.
