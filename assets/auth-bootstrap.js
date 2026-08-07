import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./cloud-config.js";

const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const authRoot = document.createElement("div");
authRoot.id = "authRoot";
authRoot.innerHTML = `
  <main class="auth-screen" aria-labelledby="authTitle">
    <section class="auth-card">
      <div class="auth-brand"><span>S</span><div><strong>Shopee AI</strong><small>Glad2Glow Indonesia · 团队工作台</small></div></div>
      <div class="auth-copy"><span>SECURE TEAM ACCESS</span><h1 id="authTitle">登录诊断中心</h1><p>仅受邀团队成员可以访问。管理员负责账号、数据发布与审批，员工处理获授权的店铺和板块。</p></div>
      <form id="loginForm" class="auth-form">
        <label><span>工作邮箱</span><input id="loginEmail" type="email" autocomplete="email" required placeholder="name@company.com" /></label>
        <label><span>密码</span><input id="loginPassword" type="password" autocomplete="current-password" required minlength="8" placeholder="至少 8 位" /></label>
        <button type="submit" class="auth-primary">登录</button>
        <button type="button" id="magicLinkButton" class="auth-secondary">发送邮箱登录链接</button>
        <button type="button" id="adminSignupButton" class="auth-admin-signup">员工 / 管理员注册</button>
      </form>
      ${isLocal ? '<button type="button" id="localDemoButton" class="auth-demo">本机演示（不连接团队数据）</button>' : ""}
      <p class="auth-message" id="authMessage">员工可自行注册；注册后默认无业务权限，需管理员配置店铺和板块。</p>
    </section>
  </main>`;
document.body.prepend(authRoot);

function authMessage(message, error = false) {
  const node = document.querySelector("#authMessage");
  node.textContent = message;
  node.classList.toggle("error", error);
}

async function loadProfile(user) {
  const { data, error } = await supabase.from("profiles").select("id,email,display_name,role,active").eq("id", user.id).single();
  if (error) throw error;
  if (!data.active) throw new Error("此账号已停用，请联系管理员。");
  return data;
}

async function loadCloudDatasets() {
  const { data, error } = await supabase.from("app_snapshots").select("key,payload,source_version,updated_at").in("key", ["dashboard", "module1", "definitions"]);
  if (error) throw error;
  const records = Object.fromEntries((data || []).map(row => [row.key, row]));
  if (records.dashboard && records.module1 && records.definitions) {
    return { dashboard: records.dashboard.payload, module1: records.module1.payload, definitions: records.definitions.payload, sourceMode: "cloud", snapshots: records };
  }
  if (!isLocal) throw new Error("云端数据尚未发布，请管理员先在本机进入 07 数据源 & 定义并发布当前数据。");
  return null;
}

async function loadTaskStatuses() {
  const { data, error } = await supabase.from("tasks").select("generated_key,status").not("generated_key", "is", null);
  if (error) throw error;
  return new Set((data || []).filter(row => row.status === "done").map(row => row.generated_key));
}

async function saveGeneratedTask(item, completed) {
  const generatedKey = `link-${item.id}`;
  const payload = {
    generated_key: generatedKey,
    module_key: "listing",
    shop_name: item.shop || null,
    product_id: String(item.productId || ""),
    title: item.name,
    detail: item.action,
    priority: item.tier === "T1" ? "P0" : item.tier === "T2" ? "P1" : item.tier === "T3" ? "P2" : "P3",
    status: completed ? "done" : "todo",
    metadata: { tier: item.tier, matrix: item.matrix, lifecycle: item.lifecycle }
  };
  const { error } = await supabase.from("tasks").upsert(payload, { onConflict: "generated_key" });
  if (error) throw error;
}

async function publishSnapshots(snapshot) {
  const rows = [
    { key: "dashboard", payload: snapshot.dashboard, source_version: snapshot.version },
    { key: "module1", payload: snapshot.module1, source_version: snapshot.version },
    { key: "definitions", payload: snapshot.definitions, source_version: snapshot.version }
  ];
  const { error } = await supabase.from("app_snapshots").upsert(rows, { onConflict: "key" });
  if (error) throw error;
}

window.ShopeeCloud = {
  client: supabase,
  isLocal,
  sourceMode: "local",
  profile: null,
  session: null,
  loadCloudDatasets,
  loadTaskStatuses,
  saveGeneratedTask,
  publishSnapshots
};

async function decorateApp() {
  const profile = window.ShopeeCloud.profile;
  const actions = document.querySelector(".top-actions");
  actions?.insertAdjacentHTML("beforeend", `<div class="account-menu"><span class="account-role">${profile.role === "admin" ? "管理员" : profile.role === "viewer" ? "只读" : "员工"}</span><div><strong>${profile.display_name || profile.email}</strong><small>${profile.email}</small></div><button id="signOutButton" type="button">退出</button></div>`);
  document.querySelector("#signOutButton")?.addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });

  if (profile.role !== "admin") {
    document.querySelector('a[href="#data-governance"]')?.remove();
    document.querySelectorAll("#data-governance input, #data-governance button").forEach(el => el.disabled = true);
    return;
  }
  const section = document.querySelector("#data-governance .section-heading");
  section?.insertAdjacentHTML("afterend", `<div class="cloud-admin-bar"><div><span>ADMIN CLOUD CONTROL</span><strong>团队云端数据</strong><small>发布后，所有已登录成员读取同一版本；历史动作写入审计日志。</small></div><button id="publishCloudButton" class="primary-button" type="button">发布当前数据到云端</button></div>`);
  document.querySelector("#publishCloudButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true; button.textContent = "发布中…";
    try { await publishSnapshots(window.ShopeeDashboard.getSnapshot()); button.textContent = "已发布"; }
    catch (error) { button.textContent = "发布失败"; alert(error.message); }
    finally { setTimeout(() => { button.disabled = false; button.textContent = "发布当前数据到云端"; }, 1600); }
  });
  await renderTeamAccess();
}

async function renderTeamAccess() {
  const target = document.querySelector("#data-governance .metric-definition-panel");
  if (!target) return;
  target.insertAdjacentHTML("afterend", `<section class="team-access-panel"><div class="panel-heading"><div><span>TEAM ACCESS</span><h3>账号与权限</h3></div><small>成员需先由管理员在 Supabase Authentication 邀请</small></div><div id="teamAccessRows" class="team-access-rows"><p>正在读取成员…</p></div></section>`);
  const [{ data: profiles, error }, { data: shops }, { data: modules }] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,role,active").order("created_at"),
    supabase.from("user_shop_access").select("user_id,shop_name"),
    supabase.from("user_module_access").select("user_id,module_key,can_write")
  ]);
  if (error) { document.querySelector("#teamAccessRows").innerHTML = `<p>${error.message}</p>`; return; }
  const rows = document.querySelector("#teamAccessRows");
  const validModules = ["overview", "listing", "ads", "funnel", "customer", "control", "subsidy", "data"];
  rows.innerHTML = profiles.length ? profiles.map(user => {
    const userShops = (shops || []).filter(x => x.user_id === user.id).map(x => x.shop_name).join(", ");
    const writes = (modules || []).filter(x => x.user_id === user.id && x.can_write).map(x => x.module_key).join(", ");
    return `<article data-user-id="${user.id}"><div><strong>${user.display_name || user.email}</strong><small>${user.email}</small></div><label class="access-field"><span>授权店铺</span><input data-access-shops value="${userShops}" placeholder="多个店铺用逗号分隔" /></label><label class="access-field"><span>可写板块</span><input data-access-modules value="${writes}" placeholder="listing, ads, subsidy" /></label><select aria-label="角色"><option value="employee" ${user.role === "employee" ? "selected" : ""}>员工</option><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>只读</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option></select><label><input type="checkbox" ${user.active ? "checked" : ""}/> 启用</label><button type="button">保存</button></article>`;
  }).join("") : "<p>尚无成员。请先邀请首位管理员账号。</p>";
  rows.querySelectorAll("article button").forEach(button => button.addEventListener("click", async () => {
    const row = button.closest("article");
    const role = row.querySelector("select").value;
    const active = row.querySelector('input[type="checkbox"]').checked;
    const shopNames = row.querySelector("[data-access-shops]").value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
    const moduleKeys = row.querySelector("[data-access-modules]").value.split(/[,，]/).map(x => x.trim()).filter(x => validModules.includes(x));
    button.disabled = true;
    const { error: updateError } = await supabase.from("profiles").update({ role, active }).eq("id", row.dataset.userId);
    let accessError = updateError;
    if (!accessError) {
      const { error: shopDeleteError } = await supabase.from("user_shop_access").delete().eq("user_id", row.dataset.userId);
      accessError = shopDeleteError;
    }
    if (!accessError && shopNames.length) {
      const { error: shopInsertError } = await supabase.from("user_shop_access").insert(shopNames.map(shop_name => ({ user_id: row.dataset.userId, shop_name })));
      accessError = shopInsertError;
    }
    if (!accessError) {
      const { error: moduleDeleteError } = await supabase.from("user_module_access").delete().eq("user_id", row.dataset.userId);
      accessError = moduleDeleteError;
    }
    if (!accessError && moduleKeys.length) {
      const { error: moduleInsertError } = await supabase.from("user_module_access").insert(moduleKeys.map(module_key => ({ user_id: row.dataset.userId, module_key, can_write: true })));
      accessError = moduleInsertError;
    }
    button.textContent = accessError ? "失败" : "已保存";
    if (accessError) alert(accessError.message);
    setTimeout(() => { button.disabled = false; button.textContent = "保存"; }, 1200);
  }));
}

async function startApp(session, demo = false) {
  if (!demo) {
    window.ShopeeCloud.session = session;
    window.ShopeeCloud.profile = await loadProfile(session.user);
    window.ShopeeCloud.sourceMode = "cloud";
  } else {
    window.ShopeeCloud.profile = { id: "local-demo", email: "local-demo", display_name: "本机演示", role: "admin", active: true };
    window.ShopeeCloud.sourceMode = "local";
  }
  authRoot.hidden = true;
  document.body.classList.remove("auth-pending");
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./assets/dashboard-runtime.js?v=20260812";
    script.onload = resolve;
    script.onerror = () => reject(new Error("看板核心脚本加载失败，请刷新后重试。"));
    document.head.appendChild(script);
  });
  await decorateApp();
}

document.querySelector("#loginForm").addEventListener("submit", async event => {
  event.preventDefault(); authMessage("正在验证账号…");
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return authMessage(error.message, true);
  try { await startApp(data.session); } catch (startError) { authMessage(startError.message, true); }
});

document.querySelector("#magicLinkButton").addEventListener("click", async () => {
  const email = document.querySelector("#loginEmail").value.trim();
  if (!email) return authMessage("请先填写工作邮箱。", true);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
  authMessage(error ? error.message : "登录链接已发送，请检查邮箱。", Boolean(error));
});

document.querySelector("#adminSignupButton").addEventListener("click", async () => {
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;
  if (!email || password.length < 8) return authMessage("请填写管理员邮箱，并设置至少 8 位密码。", true);
  authMessage("正在创建账号…");
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  authMessage(error ? error.message : "注册请求已提交，请检查邮箱完成验证。管理员白名单邮箱会自动获得管理员角色，其他账号默认为员工。", Boolean(error));
});

document.querySelector("#localDemoButton")?.addEventListener("click", () => startApp(null, true));

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  try { await startApp(session); } catch (error) { await supabase.auth.signOut(); authMessage(error.message, true); }
}

