const defaults = { sheetUrl: "https://docs.google.com/spreadsheets/d/1sQfu_8VCBhH3WnKp67It3RwiB8vQRLjBzSWY9ndWI8w/export?format=csv&gid=0", bridgeUrl: "http://127.0.0.1:8787", workspaceId: "d67e57a2-b486-41e3-9321-bdf8b30ae6c6", mode: "offline" };
const elements = Object.fromEntries(["sheetUrl", "mode", "bridgeUrl", "workspaceId", "status", "progress", "downloadPath", "failures", "check", "start", "resume", "retry", "stop", "download"].map((id) => [id, document.getElementById(id)]));
function send(message) { return chrome.runtime.sendMessage(message); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
async function render() {
  const state = await send({ type: "GET_STATE" });
  const settings = { ...defaults, ...(state.settings || {}) };
  elements.sheetUrl.value = settings.sheetUrl;
  elements.mode.value = settings.mode || "offline";
  elements.bridgeUrl.value = settings.bridgeUrl;
  elements.workspaceId.value = settings.workspaceId;
  const cloudMode = elements.mode.value === "cloud";
  elements.bridgeUrl.disabled = !cloudMode;
  elements.workspaceId.disabled = !cloudMode;
  elements.check.disabled = !cloudMode;
  elements.status.textContent = state.status || "未开始";
  elements.progress.textContent = state.queue?.length ? `进度：${Math.min(state.index, state.queue.length)}/${state.queue.length} · 成功 ${state.results?.length || 0} · 失败 ${state.failed?.length || 0}` : "尚未读取清单";
  elements.resume.disabled = !state.paused;
  elements.retry.disabled = state.running || !state.failed?.length;
  elements.start.disabled = state.running;
  const reportReady = !state.running && state.status?.startsWith("监控完成") && (state.reportRows?.length || state.failed?.length);
  elements.download.disabled = !reportReady;
  elements.downloadPath.hidden = !state.downloadPath;
  elements.downloadPath.textContent = state.downloadPath ? `下载位置：${state.downloadPath}` : "";
  elements.failures.hidden = !state.failed?.length;
  elements.failures.innerHTML = state.failed?.length ? `<strong>失败链接</strong><ul>${state.failed.map((item) => `<li>第 ${escapeHtml(item.source_row || "?")} 行：${escapeHtml(item.product_name || item.product_url)}<br><span>${escapeHtml(item.error)}</span></li>`).join("")}</ul>` : "";
}
function settings() { return { sheetUrl: elements.sheetUrl.value.trim(), mode: elements.mode.value, bridgeUrl: elements.bridgeUrl.value.trim(), workspaceId: elements.workspaceId.value.trim() }; }
elements.start.addEventListener("click", async () => { await send({ type: "START", settings: settings() }); await render(); });
elements.check.addEventListener("click", async () => { const response = await send({ type: "CHECK_BRIDGE" }); if (!response?.ok) elements.status.textContent = `桥接检查失败：${response?.error || "未知错误"}`; await render(); });
elements.mode.addEventListener("change", async () => { await send({ type: "SAVE_SETTINGS", settings: settings() }); await render(); });
elements.resume.addEventListener("click", async () => { await send({ type: "RESUME" }); await render(); });
elements.retry.addEventListener("click", async () => { await send({ type: "RETRY_FAILED" }); await render(); });
elements.stop.addEventListener("click", async () => { await send({ type: "STOP" }); await render(); });
elements.download.addEventListener("click", async () => { const response = await send({ type: "DOWNLOAD_REPORT" }); if (!response?.ok) elements.status.textContent = `下载失败：${response?.error || "未知错误"}`; await render(); });
chrome.runtime.onMessage.addListener((message) => { if (message.type === "STATE") render(); });
render();
