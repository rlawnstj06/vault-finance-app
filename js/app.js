/* ================= VAULT — 메인 앱 ================= */
(function () {
  "use strict";
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.VAULT_CONFIG;
  const A = window.VAULT_ALLOC;

  // 세션 영구 유지 → 한 번 로그인하면 계속 로그인 상태.
  // 통과형 lock: iOS 웹뷰/임베디드 브라우저에서 navigator.locks 로 인한 getSession 멈춤 방지 (단일 탭 PWA라 안전).
  const passThroughLock = (_name, _timeout, fn) => fn();
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, lock: passThroughLock },
  });

  const app = document.getElementById("app");
  const tabbar = document.getElementById("tabbar");
  const toastEl = document.getElementById("toast");

  const S = { user: null, profile: null, incomes: [], work: [], expenses: [], view: "dashboard", chart: null };

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const money = (n) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: S.profile?.currency || "CAD", maximumFractionDigits: 2 }).format(Number(n) || 0);
  const money0 = (n) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: S.profile?.currency || "CAD", maximumFractionDigits: 0 }).format(Number(n) || 0);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  const monthKey = (s) => (s || "").slice(0, 7);
  const nowMonth = () => todayStr().slice(0, 7);
  function fmtDate(s) { if (!s) return ""; const [y, m, d] = s.split("-"); return `${Number(m)}월 ${Number(d)}일`; }

  let toastT;
  function toast(msg, isErr) {
    toastEl.textContent = msg; toastEl.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (toastEl.className = "toast"), 2600);
  }

  /* ---------- data ---------- */
  async function loadAll() {
    const uid = S.user.id;
    const [p, inc, wk, ex] = await Promise.all([
      sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
      sb.from("incomes").select("*").eq("user_id", uid).order("income_date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("work_logs").select("*").eq("user_id", uid).order("work_date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("expenses").select("*").eq("user_id", uid).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    S.profile = p.data || { id: uid, display_name: "", hourly_wage: 0, currency: "CAD", province: "BC", has_high_interest_debt: false, emergency_target: 0, saving_for_home: false, buckets: null };
    S.incomes = inc.data || [];
    S.work = wk.data || [];
    S.expenses = ex.data || [];
    // 버킷이 없으면 추천값으로 초기화 후 저장
    if (!S.profile.buckets || !S.profile.buckets.length) {
      S.profile.buckets = A.makeBuckets(profileState());
      await saveProfile({ buckets: S.profile.buckets });
    }
  }

  function profileState() {
    const funded = totalBucket("emergency") >= (Number(S.profile?.emergency_target) || 0) && (Number(S.profile?.emergency_target) || 0) > 0;
    return { hasHighInterestDebt: !!S.profile?.has_high_interest_debt, emergencyFunded: funded, savingForHome: !!S.profile?.saving_for_home };
  }

  async function saveProfile(patch) {
    Object.assign(S.profile, patch);
    const row = {
      id: S.user.id, display_name: S.profile.display_name, hourly_wage: S.profile.hourly_wage,
      currency: S.profile.currency, province: S.profile.province, has_high_interest_debt: S.profile.has_high_interest_debt,
      emergency_target: S.profile.emergency_target, saving_for_home: S.profile.saving_for_home,
      buckets: S.profile.buckets, updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("profiles").upsert(row);
    if (error) toast("저장 실패: " + error.message, true);
    return !error;
  }

  /* ---------- aggregates ---------- */
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  function totalBucket(key) {
    let t = 0;
    for (const inc of S.incomes) for (const r of inc.allocation || []) if (r.key === key) t += Number(r.amount) || 0;
    for (const e of S.expenses) if (e.bucket_key === key) t -= Number(e.amount) || 0;
    return Math.round(t * 100) / 100;
  }
  const totalIncome = () => sum(S.incomes, (i) => i.amount);
  const totalExpense = () => sum(S.expenses, (e) => e.amount);
  const vaultBalance = () => Math.round((totalIncome() - totalExpense()) * 100) / 100;
  const monthIncome = (mk = nowMonth()) => sum(S.incomes.filter((i) => monthKey(i.income_date) === mk), (i) => i.amount);
  const monthExpense = (mk = nowMonth()) => sum(S.expenses.filter((e) => monthKey(e.expense_date) === mk), (e) => e.amount);

  /* ================= AUTH ================= */
  let authMode = "login";
  function renderAuth() {
    tabbar.classList.add("hidden");
    app.innerHTML = `
      <div class="auth fadein">
        <div class="logo-lg">◈</div>
        <h1>VAULT</h1>
        <div class="tag">당신의 자산 금고 · BC Canada</div>
        <div id="authErr"></div>
        ${authMode === "signup" ? `
        <div class="field"><label>이름 (표시용)</label><input id="dn" class="input" placeholder="준서" autocomplete="name"></div>` : ""}
        <div class="field"><label>이메일</label><input id="em" class="input" type="email" placeholder="you@email.com" autocomplete="email" inputmode="email"></div>
        <div class="field"><label>비밀번호</label><input id="pw" class="input" type="password" placeholder="6자 이상" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}"></div>
        <button id="authBtn" class="btn">${authMode === "signup" ? "가입하고 시작" : "로그인"}</button>
        <div class="swap">${authMode === "signup" ? "이미 계정이 있나요? <a id='swap'>로그인</a>" : "처음이신가요? <a id='swap'>새 계정 만들기</a>"}</div>
      </div>`;
    $("#swap").onclick = () => { authMode = authMode === "login" ? "signup" : "login"; renderAuth(); };
    $("#authBtn").onclick = doAuth;
    [$("#em"), $("#pw"), $("#dn")].forEach((el) => el && (el.onkeydown = (e) => { if (e.key === "Enter") doAuth(); }));
  }
  function authErr(msg) { $("#authErr").innerHTML = msg ? `<div class="err">${esc(msg)}</div>` : ""; }

  async function doAuth() {
    const email = $("#em").value.trim(), pw = $("#pw").value, dn = $("#dn")?.value.trim();
    authErr("");
    if (!email || !pw) return authErr("이메일과 비밀번호를 입력하세요.");
    const btn = $("#authBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (authMode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { display_name: dn || email.split("@")[0] } } });
        if (error) throw error;
        if (!data.session) {
          // 이메일 확인이 켜져 있으면 바로 로그인 시도
          const { error: e2 } = await sb.auth.signInWithPassword({ email, password: pw });
          if (e2) { authErr("가입됐습니다. 이메일 확인이 필요하면 메일함을 확인하세요."); btn.disabled = false; btn.textContent = "로그인"; authMode = "login"; return; }
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
      // 로그인 성공 → 콜백에 의존하지 않고 직접 진입 (교착 방지)
      const { data: { session } } = await sb.auth.getSession();
      if (session) await enter(session.user);
      else { authErr("세션 생성에 실패했습니다. 다시 시도하세요."); btn.disabled = false; btn.textContent = "로그인"; }
    } catch (e) {
      authErr(translateAuthErr(e.message)); btn.disabled = false; btn.textContent = authMode === "signup" ? "가입하고 시작" : "로그인";
    }
  }
  function translateAuthErr(m) {
    if (/Invalid login/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/already registered/i.test(m)) return "이미 가입된 이메일입니다. 로그인하세요.";
    if (/Password should be/i.test(m)) return "비밀번호는 6자 이상이어야 합니다.";
    if (/rate limit|too many/i.test(m)) return "잠시 후 다시 시도하세요.";
    return m;
  }

  /* ================= ROUTER ================= */
  function nav(view) {
    S.view = view;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === view));
    render();
  }
  tabbar.querySelectorAll(".tab").forEach((t) => (t.onclick = () => nav(t.dataset.nav)));

  function render() {
    tabbar.classList.remove("hidden");
    const v = S.view;
    if (v === "dashboard") renderDashboard();
    else if (v === "income") renderIncome();
    else if (v === "work") renderWork();
    else if (v === "expenses") renderExpenses();
    else if (v === "settings") renderSettings();
  }

  function topbar() {
    const nm = S.profile?.display_name || "준서님";
    return `<div class="topbar"><div class="brand"><span class="logo">◈</span><span>VAULT<br><small>ASSET&nbsp;GATE</small></span></div>
      <div class="hello">안녕하세요,<br><b>${esc(nm)}</b></div></div>`;
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    const bal = vaultBalance(), mi = monthIncome(), me = monthExpense();
    const buckets = S.profile.buckets || [];
    const bRows = buckets.map((b) => ({ ...b, bal: totalBucket(b.key) }));
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <div class="card hero hud">
          <div class="label">◈ 총 금고 잔액</div>
          <div class="big">${money(bal)}</div>
          <div class="row">
            <div class="stat"><div class="k">이번 달 수입</div><div class="v pos">${money0(mi)}</div></div>
            <div class="stat"><div class="k">이번 달 지출</div><div class="v neg">${money0(me)}</div></div>
            <div class="stat"><div class="k">이번 달 순증</div><div class="v ${mi - me >= 0 ? "pos" : "neg"}">${money0(mi - me)}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-h"><h2>버킷별 잔액</h2><a class="link" id="goInc" style="font-size:13px">+ 수입 배분</a></div>
          ${bRows.some((b) => b.bal !== 0) ? `<div class="chart-wrap"><canvas id="donut"></canvas></div>` : `<div class="empty">아직 배분된 돈이 없어요.<br>수입을 추가하면 여기에 나눠 담깁니다.</div>`}
          <div style="margin-top:14px">
            ${bRows.map((b) => `
              <div class="bucket">
                <span class="dot" style="color:${b.color};background:${b.color}"></span>
                <div style="flex:1">
                  <div class="nm">${esc(b.label)} <span class="pc">${b.percent}%</span></div>
                  <div class="bar"><i style="width:${pctOfMax(b.bal, bRows)}%;background:${b.color}"></i></div>
                </div>
                <span class="am">${money(b.bal)}</span>
              </div>`).join("")}
          </div>
        </div>

        <div class="card">
          <h2>최근 활동</h2>
          ${recentActivity()}
        </div>
      </div>`;
    $("#goInc").onclick = () => nav("income");
    drawDonut(bRows.filter((b) => b.bal > 0));
  }
  function pctOfMax(v, rows) { const mx = Math.max(1, ...rows.map((r) => Math.abs(r.bal))); return Math.max(0, (Math.abs(v) / mx) * 100); }

  function recentActivity() {
    const items = [];
    S.incomes.forEach((i) => items.push({ t: "inc", date: i.income_date, created: i.created_at, label: i.source || "수입", amt: Number(i.amount) }));
    S.expenses.forEach((e) => items.push({ t: "exp", date: e.expense_date, created: e.created_at, label: e.category || "지출", amt: -Number(e.amount) }));
    items.sort((a, b) => (b.date + (b.created || "")).localeCompare(a.date + (a.created || "")));
    const top = items.slice(0, 6);
    if (!top.length) return `<div class="empty">기록이 없습니다.</div>`;
    return top.map((it) => `
      <div class="item">
        <div class="ic">${it.t === "inc" ? "＄" : "▽"}</div>
        <div class="mid"><div class="t1">${esc(it.label)}</div><div class="t2">${fmtDate(it.date)}</div></div>
        <div class="amt ${it.amt >= 0 ? "pos" : "neg"}">${it.amt >= 0 ? "+" : ""}${money(Math.abs(it.amt))}</div>
      </div>`).join("");
  }

  function drawDonut(rows) {
    const el = document.getElementById("donut"); if (!el || !window.Chart) return;
    if (S.chart) { S.chart.destroy(); S.chart = null; }
    if (!rows.length) return;
    S.chart = new Chart(el, {
      type: "doughnut",
      data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => Math.max(0, r.bal)), backgroundColor: rows.map((r) => r.color), borderColor: "#0a0e17", borderWidth: 3 }] },
      options: { cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.raw)}` } } } },
    });
  }

  /* ================= INCOME ================= */
  function renderIncome() {
    const buckets = S.profile.buckets || [];
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>수입 배분</h1>
        <p class="sub">번 돈을 입력하면 설정한 비율대로 자동으로 나눠 담습니다.</p>
        <div class="card">
          <div class="field"><label>금액</label><input id="inAmt" class="input" type="number" inputmode="decimal" placeholder="예: 1500"></div>
          <div class="row2">
            <div class="field"><label>출처</label><input id="inSrc" class="input" placeholder="월급 / 알바 / 보너스"></div>
            <div class="field"><label>날짜</label><input id="inDate" class="input" type="date" value="${todayStr()}"></div>
          </div>
          <div id="allocPreview"></div>
          <button id="saveInc" class="btn gold" style="margin-top:8px">＄ 배분하고 저장</button>
          <div class="hint">비율은 <b>설정 탭</b>에서 언제든 바꿀 수 있어요.</div>
        </div>
        <div class="card">
          <h2>수입 내역</h2>
          <div id="incList">${incomeList()}</div>
        </div>
      </div>`;
    const amtEl = $("#inAmt");
    const upd = () => { $("#allocPreview").innerHTML = allocPreviewHTML(Number(amtEl.value) || 0, buckets); };
    amtEl.oninput = upd; upd();
    $("#saveInc").onclick = saveIncome;
    bindDeletes("#incList", "incomes", () => S.incomes);
  }
  function allocPreviewHTML(amt, buckets) {
    const { rows } = A.allocate(amt, buckets);
    return `<div style="margin:6px 0 4px">${rows.map((r) => `
      <div class="bucket">
        <span class="dot" style="color:${r.color};background:${r.color}"></span>
        <span class="nm">${esc(r.label)}</span>
        <span class="pc">${r.percent}%</span>
        <span class="am">${money(r.amount)}</span>
      </div>`).join("")}</div>`;
  }
  function incomeList() {
    if (!S.incomes.length) return `<div class="empty">아직 수입 기록이 없습니다.</div>`;
    return S.incomes.slice(0, 40).map((i) => `
      <div class="item">
        <div class="ic">＄</div>
        <div class="mid"><div class="t1">${esc(i.source || "수입")}</div><div class="t2">${fmtDate(i.income_date)}</div></div>
        <div class="amt pos">+${money(i.amount)}</div>
        <button class="del" data-del="${i.id}">✕</button>
      </div>`).join("");
  }
  async function saveIncome() {
    const amt = Number($("#inAmt").value); const src = $("#inSrc").value.trim(); const date = $("#inDate").value || todayStr();
    if (!amt || amt <= 0) return toast("금액을 입력하세요.", true);
    const { rows } = A.allocate(amt, S.profile.buckets || []);
    const alloc = rows.map((r) => ({ key: r.key, label: r.label, percent: r.percent, amount: r.amount }));
    const btn = $("#saveInc"); btn.disabled = true;
    const { data, error } = await sb.from("incomes").insert({ user_id: S.user.id, income_date: date, amount: amt, source: src, allocation: alloc }).select().single();
    btn.disabled = false;
    if (error) return toast("저장 실패: " + error.message, true);
    S.incomes.unshift(data); toast("배분 완료 ✓"); nav("dashboard");
  }

  /* ================= WORK ================= */
  function renderWork() {
    const wage = Number(S.profile.hourly_wage) || 0;
    const wk = weekStats(), mo = monthWorkStats();
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>근무 기록</h1>
        <p class="sub">시급 <b>${money(wage)}</b> 기준. 일한 시간을 찍으면 급여가 자동 계산됩니다.</p>
        <div class="grid2" style="margin-bottom:14px">
          <div class="mini"><div class="k">이번 주 시간</div><div class="v">${wk.hours}h</div><div class="k" style="margin-top:4px;color:var(--green)">${money0(wk.earned)}</div></div>
          <div class="mini"><div class="k">이번 달 시간</div><div class="v">${mo.hours}h</div><div class="k" style="margin-top:4px;color:var(--green)">${money0(mo.earned)}</div></div>
        </div>
        <div class="card">
          ${wage <= 0 ? `<div class="note">먼저 <b>설정 탭</b>에서 시급을 입력하면 급여가 자동 계산됩니다.</div>` : ""}
          <div class="row2">
            <div class="field"><label>날짜</label><input id="wDate" class="input" type="date" value="${todayStr()}"></div>
            <div class="field"><label>일한 시간</label><input id="wHours" class="input" type="number" inputmode="decimal" placeholder="8"></div>
          </div>
          <div class="field"><label>시급 (이 기록에만 적용)</label><input id="wWage" class="input" type="number" inputmode="decimal" value="${wage || ""}" placeholder="17.85"></div>
          <div id="wCalc" class="hint"></div>
          <label class="switch" style="border:none;padding:10px 0"><div><div class="sl">수입에도 자동 추가</div><div class="sd">급여를 버킷으로 바로 배분합니다</div></div><div id="wAsInc" class="tog"></div></label>
          <button id="saveWork" class="btn">◷ 근무 저장</button>
        </div>
        <div class="card">
          <h2>기록</h2>
          <div id="wList">${workList()}</div>
        </div>
      </div>`;
    const h = $("#wHours"), w = $("#wWage");
    const calc = () => { const e = (Number(h.value) || 0) * (Number(w.value) || 0); $("#wCalc").innerHTML = e ? `예상 급여: <b style="color:var(--green)">${money(e)}</b>` : ""; };
    h.oninput = calc; w.oninput = calc; calc();
    let asInc = false; $("#wAsInc").onclick = (e) => { asInc = !asInc; e.currentTarget.classList.toggle("on", asInc); };
    $("#saveWork").onclick = () => saveWork(() => asInc);
    bindDeletes("#wList", "work_logs", () => S.work);
  }
  function workList() {
    if (!S.work.length) return `<div class="empty">근무 기록이 없습니다.</div>`;
    return S.work.slice(0, 40).map((r) => {
      const earned = (Number(r.hours) || 0) * (Number(r.hourly_wage) || 0);
      return `<div class="item">
        <div class="ic">◷</div>
        <div class="mid"><div class="t1">${fmtDate(r.work_date)} · ${r.hours}시간</div><div class="t2">시급 ${money(r.hourly_wage)}</div></div>
        <div class="amt pos">${money(earned)}</div>
        <button class="del" data-del="${r.id}">✕</button>
      </div>`;
    }).join("");
  }
  function weekStats() {
    const now = new Date(); const day = (now.getDay() + 6) % 7; // 월요일 시작
    const monday = new Date(now); monday.setDate(now.getDate() - day);
    const mk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const rows = S.work.filter((r) => r.work_date >= mk);
    return { hours: round(sum(rows, (r) => r.hours)), earned: sum(rows, (r) => (Number(r.hours) || 0) * (Number(r.hourly_wage) || 0)) };
  }
  function monthWorkStats() {
    const rows = S.work.filter((r) => monthKey(r.work_date) === nowMonth());
    return { hours: round(sum(rows, (r) => r.hours)), earned: sum(rows, (r) => (Number(r.hours) || 0) * (Number(r.hourly_wage) || 0)) };
  }
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

  async function saveWork(getAsInc) {
    const date = $("#wDate").value || todayStr(); const hours = Number($("#wHours").value); const wage = Number($("#wWage").value) || 0;
    if (!hours || hours <= 0) return toast("일한 시간을 입력하세요.", true);
    const btn = $("#saveWork"); btn.disabled = true;
    const { data, error } = await sb.from("work_logs").insert({ user_id: S.user.id, work_date: date, hours, hourly_wage: wage }).select().single();
    if (error) { btn.disabled = false; return toast("저장 실패: " + error.message, true); }
    S.work.unshift(data);
    // 시급이 프로필과 다르면 최신값으로 갱신
    if (wage && wage !== Number(S.profile.hourly_wage)) await saveProfile({ hourly_wage: wage });
    if (getAsInc() && wage > 0) {
      const amt = round(hours * wage);
      const { rows } = A.allocate(amt, S.profile.buckets || []);
      const alloc = rows.map((r) => ({ key: r.key, label: r.label, percent: r.percent, amount: r.amount }));
      const { data: inc } = await sb.from("incomes").insert({ user_id: S.user.id, income_date: date, amount: amt, source: "근무 급여", allocation: alloc }).select().single();
      if (inc) S.incomes.unshift(inc);
    }
    btn.disabled = false; toast("근무 저장 ✓"); nav("work");
  }

  /* ================= EXPENSES ================= */
  const EXP_CATS = ["식비", "렌트", "교통", "쇼핑", "구독", "의료", "여가", "기타"];
  function renderExpenses() {
    const buckets = S.profile.buckets || [];
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>지출</h1>
        <p class="sub">이번 달 지출 <b class="neg">${money(monthExpense())}</b></p>
        <div class="card">
          <div class="row2">
            <div class="field"><label>금액</label><input id="eAmt" class="input" type="number" inputmode="decimal" placeholder="예: 42.50"></div>
            <div class="field"><label>날짜</label><input id="eDate" class="input" type="date" value="${todayStr()}"></div>
          </div>
          <div class="field"><label>분류</label><div class="chips" id="eCats">${EXP_CATS.map((c, i) => `<div class="chip ${i === 0 ? "on" : ""}" data-cat="${c}">${c}</div>`).join("")}</div></div>
          <div class="field"><label>어느 버킷에서 나갔나요? (선택)</label>
            <select id="eBucket" class="input"><option value="">지정 안 함</option>${buckets.map((b) => `<option value="${b.key}">${esc(b.label)}</option>`).join("")}</select>
            <div class="hint">버킷을 고르면 해당 잔액이 줄어듭니다.</div>
          </div>
          <button id="saveExp" class="btn">▽ 지출 저장</button>
        </div>
        <div class="card">
          <h2>지출 내역</h2>
          <div id="eList">${expenseList()}</div>
        </div>
      </div>`;
    let cat = EXP_CATS[0];
    $("#eCats").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { cat = c.dataset.cat; $("#eCats").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    $("#saveExp").onclick = () => saveExpense(() => cat);
    bindDeletes("#eList", "expenses", () => S.expenses);
  }
  function expenseList() {
    if (!S.expenses.length) return `<div class="empty">지출 기록이 없습니다.</div>`;
    return S.expenses.slice(0, 40).map((e) => {
      const b = (S.profile.buckets || []).find((x) => x.key === e.bucket_key);
      return `<div class="item">
        <div class="ic">▽</div>
        <div class="mid"><div class="t1">${esc(e.category || "지출")}${b ? ` · ${esc(b.label)}` : ""}</div><div class="t2">${fmtDate(e.expense_date)}</div></div>
        <div class="amt neg">-${money(e.amount)}</div>
        <button class="del" data-del="${e.id}">✕</button>
      </div>`;
    }).join("");
  }
  async function saveExpense(getCat) {
    const amt = Number($("#eAmt").value); const date = $("#eDate").value || todayStr(); const bucket = $("#eBucket").value || null;
    if (!amt || amt <= 0) return toast("금액을 입력하세요.", true);
    const btn = $("#saveExp"); btn.disabled = true;
    const { data, error } = await sb.from("expenses").insert({ user_id: S.user.id, expense_date: date, amount: amt, category: getCat(), bucket_key: bucket }).select().single();
    btn.disabled = false;
    if (error) return toast("저장 실패: " + error.message, true);
    S.expenses.unshift(data); toast("지출 저장 ✓"); nav("dashboard");
  }

  /* ================= SETTINGS ================= */
  function renderSettings() {
    const p = S.profile; const buckets = p.buckets || [];
    const tot = A.sumPercents(buckets);
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>설정</h1>
        <div class="card">
          <h2>프로필</h2>
          <div class="field"><label>이름</label><input id="sName" class="input" value="${esc(p.display_name || "")}"></div>
          <div class="row2">
            <div class="field"><label>시급 (${p.currency})</label><input id="sWage" class="input" type="number" inputmode="decimal" value="${p.hourly_wage || ""}" placeholder="17.85"></div>
            <div class="field"><label>통화</label><select id="sCur" class="input">${["CAD", "USD", "KRW"].map((c) => `<option ${c === p.currency ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          </div>
          <button id="saveProf" class="btn ghost sm" style="width:100%">프로필 저장</button>
        </div>

        <div class="card">
          <h2>내 재무 상황</h2>
          <p class="hint" style="margin:0 0 8px">이 정보로 <b>추천 배분 비율</b>이 자동 계산됩니다.</p>
          <label class="switch"><div><div class="sl">고금리 빚이 있음</div><div class="sd">신용카드 등 이자 10%+ · 있으면 빚부터 우선</div></div><div id="tDebt" class="tog ${p.has_high_interest_debt ? "on" : ""}"></div></label>
          <label class="switch"><div><div class="sl">집(첫 주택) 살 계획</div><div class="sd">FHSA 우선 · 투자 비중 조정</div></div><div id="tHome" class="tog ${p.saving_for_home ? "on" : ""}"></div></label>
          <div class="field" style="margin-top:12px"><label>비상금 목표 (${p.currency})</label><input id="sEmg" class="input" type="number" inputmode="decimal" value="${p.emergency_target || ""}" placeholder="예: 5000"><div class="hint">보통 생활비 3~6개월치. 채워지면 투자 비중이 자동으로 커집니다.</div></div>
          <button id="applyReco" class="btn gold sm" style="width:100%">✨ 이 상황 기준 추천 비율 적용</button>
        </div>

        <div class="card">
          <div class="card-h"><h2>배분 비율 직접 조정</h2><span id="totPill" class="total-pill ${tot === 100 ? "ok" : "bad"}">합계 ${tot}%</span></div>
          <div id="sliders">
            ${buckets.map((b) => `
              <div class="slider-row">
                <div class="lab"><span class="dot" style="color:${b.color};background:${b.color}"></span>${esc(b.label)}</div>
                <input type="range" min="0" max="100" step="1" value="${b.percent}" data-bk="${b.key}">
                <div class="val" data-val="${b.key}">${b.percent}%</div>
              </div>`).join("")}
          </div>
          <div class="hint">합계가 100%가 되도록 맞춰주세요.</div>
          <button id="saveBuckets" class="btn" style="margin-top:12px">비율 저장</button>
        </div>

        <div class="card tight">
          <div class="item" style="border:none">
            <div class="ic">◈</div>
            <div class="mid"><div class="t1">${esc(S.user.email || "")}</div><div class="t2">로그인 유지됨 · 이 기기에서 계속 로그인 상태</div></div>
          </div>
          <a class="link" id="logout" style="font-size:12px;color:var(--dim);display:block;text-align:center;margin-top:6px">다른 계정으로 전환 (로그아웃)</a>
        </div>
      </div>`;

    $("#saveProf").onclick = async () => {
      await saveProfile({ display_name: $("#sName").value.trim(), hourly_wage: Number($("#sWage").value) || 0, currency: $("#sCur").value });
      toast("프로필 저장 ✓"); renderSettings();
    };
    $("#tDebt").onclick = (e) => e.currentTarget.classList.toggle("on");
    $("#tHome").onclick = (e) => e.currentTarget.classList.toggle("on");
    $("#applyReco").onclick = async () => {
      await saveProfile({
        has_high_interest_debt: $("#tDebt").classList.contains("on"),
        saving_for_home: $("#tHome").classList.contains("on"),
        emergency_target: Number($("#sEmg").value) || 0,
      });
      const reco = A.makeBuckets(profileState());
      await saveProfile({ buckets: reco });
      toast("추천 비율 적용 ✓"); renderSettings();
    };

    // 슬라이더 라이브 업데이트
    const sliderEls = () => Array.from($("#sliders").querySelectorAll("input[type=range]"));
    function refreshTot() {
      const t = Math.round(sliderEls().reduce((s, el) => s + Number(el.value), 0) * 10) / 10;
      const pill = $("#totPill"); pill.textContent = "합계 " + t + "%"; pill.className = "total-pill " + (t === 100 ? "ok" : "bad");
    }
    sliderEls().forEach((el) => (el.oninput = () => { $(`[data-val="${el.dataset.bk}"]`).textContent = el.value + "%"; refreshTot(); }));
    $("#saveBuckets").onclick = async () => {
      const t = Math.round(sliderEls().reduce((s, el) => s + Number(el.value), 0) * 10) / 10;
      if (t !== 100) return toast(`합계가 100%여야 합니다 (현재 ${t}%)`, true);
      const nb = buckets.map((b) => ({ ...b, percent: Number($(`[data-bk="${b.key}"]`).value) }));
      await saveProfile({ buckets: nb }); toast("비율 저장 ✓"); renderSettings();
    };
    $("#logout").onclick = async () => { if (confirm("로그아웃하시겠습니까? 이 기기에서 로그아웃됩니다.")) { await sb.auth.signOut(); location.reload(); } };
  }

  /* ---------- shared: delete ---------- */
  function bindDeletes(sel, table, getArr) {
    const c = $(sel); if (!c) return;
    c.querySelectorAll("[data-del]").forEach((btn) => (btn.onclick = async () => {
      if (!confirm("이 기록을 삭제할까요?")) return;
      const id = btn.dataset.del;
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) return toast("삭제 실패: " + error.message, true);
      const arr = getArr(); const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1);
      toast("삭제됨"); render();
    }));
  }

  /* ================= BOOT ================= */
  function showLoading() { app.innerHTML = `<div class="center-load"><div class="spinner"></div></div>`; tabbar.classList.add("hidden"); }

  // 세션 확보 후 데이터 로드 + 대시보드. (onAuthStateChange 콜백 밖에서만 호출 → 교착 방지)
  async function enter(user) {
    S.user = user; showLoading();
    try { await loadAll(); nav("dashboard"); }
    catch (e) { toast("불러오기 오류: " + (e.message || e), true); renderAuth(); }
  }

  async function boot() {
    showLoading();
    let session = null;
    try { const { data } = await sb.auth.getSession(); session = data?.session || null; } catch (_) {}
    if (session) await enter(session.user);
    else renderAuth();
  }

  // 콜백 안에서는 절대 다른 supabase 호출을 await 하지 않는다 (교착 방지). 로그아웃만 반영.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") { S.user = null; renderAuth(); }
  });

  boot();
})();
