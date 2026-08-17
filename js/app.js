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

  /* ---- SVG 라인 아이콘 (기호 대신 진짜 아이콘) ---- */
  const IC = {
    mark: '<path d="M12 3.5 19.5 12 12 20.5 4.5 12z"/><circle cx="12" cy="12" r="2.4"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.6V19h12V9.6"/>',
    wallet: '<rect x="3.2" y="6" width="17.6" height="13" rx="3"/><path d="M3.2 10h17.6"/><circle cx="16.4" cy="13.4" r="1.15" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.1 2"/>',
    receipt: '<path d="M6 3.6h12v16.8l-2.2-1.4-2 1.4-1.8-1.4-1.8 1.4-2-1.4L6 20.4z"/><path d="M9.2 8.4h5.6M9.2 12h5.6"/>',
    sliders: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9"/><circle cx="15" cy="7.5" r="2.3"/><circle cx="8" cy="16.5" r="2.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    inflow: '<path d="M16 8 8 16"/><path d="M8 10.5V16h5.5"/>',
    outflow: '<path d="M8 16 16 8"/><path d="M10.5 8H16v5.5"/>',
    star: '<path d="M12 4.2l1.8 4.7 4.9.3-3.8 3.1 1.3 4.8L12 14.7 7.6 17.1l1.3-4.8L5.1 9.2l4.9-.3z"/>',
    coin: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5v9M14.2 9.4c-.5-.7-1.3-1-2.2-1-1.3 0-2.2.7-2.2 1.7 0 2.3 4.6 1.2 4.6 3.6 0 1-1 1.8-2.4 1.8-1 0-1.9-.4-2.4-1.1"/>',
  };
  function icon(name, size) { return `<svg class="ic-svg" width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[name] || ""}</svg>`; }

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
    // 저장된 버킷의 색/라벨은 항상 최신 코드 팔레트로 갱신 (percent 만 사용자 값 유지)
    S.profile.buckets = S.profile.buckets.map((b) => {
      const d = A.BUCKET_MAP[b.key];
      return d ? { ...b, color: d.color, label: d.label } : b;
    });
  }

  function profileState() {
    const funded = totalBucket("emergency") >= (Number(S.profile?.emergency_target) || 0) && (Number(S.profile?.emergency_target) || 0) > 0;
    return { hasHighInterestDebt: !!S.profile?.has_high_interest_debt, emergencyFunded: funded, savingForHome: !!S.profile?.saving_for_home };
  }

  // 온보딩 답변(실제 금액)으로 맞춤 배분 비율 계산
  function computeSetupBuckets(su) {
    const M = Number(su.monthlyIncome) || 0;
    if (M <= 0) return A.makeBuckets(profileState());
    const rent = Number(su.rent) || 0;
    const living = Number(su.living) || 0;
    const carRun = su.hasCar ? (Number(su.carCost) || 0) : 0;
    const D = Math.max(0, M - (rent + living + carRun)); // 재량 소득
    const funded = (Number(su.emergencyCurrent) || 0) >= (Number(su.emergencyTarget) || 0) && (Number(su.emergencyTarget) || 0) > 0;
    const hiDebt = !!(su.hasDebt && su.debtHighInterest);
    const w = { debt: 0, emergency: 0, invest: 0, car: 0, fun: 0 };
    if (hiDebt) w.debt = 0.42;
    if (!funded) w.emergency = hiDebt ? 0.15 : 0.25;
    w.car = su.savingForCar ? 0.15 : 0;
    w.fun = 0.15;
    w.invest = Math.max(0.10, 1 - (w.debt + w.emergency + w.car + w.fun));
    const wt = w.debt + w.emergency + w.invest + w.car + w.fun;
    Object.keys(w).forEach((k) => (w[k] = w[k] / wt));
    const amt = { rent, food: living + carRun, debt: D * w.debt, emergency: D * w.emergency, invest: D * w.invest, car: D * w.car, fun: D * w.fun };
    const pct = {};
    ["rent", "food", "debt", "emergency", "invest", "car", "fun"].forEach((k) => (pct[k] = (amt[k] / M) * 100));
    return A.makeBuckets(null, A.normalizePercents(pct));
  }

  async function saveProfile(patch) {
    Object.assign(S.profile, patch);
    const row = {
      id: S.user.id, display_name: S.profile.display_name, hourly_wage: S.profile.hourly_wage,
      currency: S.profile.currency, province: S.profile.province, has_high_interest_debt: S.profile.has_high_interest_debt,
      emergency_target: S.profile.emergency_target, saving_for_home: S.profile.saving_for_home,
      buckets: S.profile.buckets, onboarded: S.profile.onboarded, setup: S.profile.setup,
      updated_at: new Date().toISOString(),
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
        <div class="logo-lg">${icon("mark", 34)}</div>
        <h1>VAULT</h1>
        <div class="tag">스마트 자산 관리 · BC Canada</div>
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

  /* ================= ONBOARDING ================= */
  let obStep = 0, ob = null;
  const OB_STEPS = ["기본 정보", "수입", "고정 지출", "자동차", "부채", "비상금", "목표"];

  function startOnboarding() {
    const p = S.profile, s = p.setup || {};
    ob = {
      name: p.display_name || "", currency: p.currency || "CAD", province: p.province || "BC",
      payType: s.payType || "hourly", wage: (p.hourly_wage != null ? p.hourly_wage : "") || (s.wage || ""),
      otEnabled: s.ot ? s.ot.enabled !== false : true, otMult: s.ot ? (s.ot.otMult || 1.5) : 1.5, otDouble: s.ot ? !!s.ot.double : false,
      monthlyIncome: s.monthlyIncome || "", rent: s.rent || "", living: s.living || "",
      hasCar: !!s.hasCar, carCost: s.carCost || "", savingForCar: !!s.savingForCar, carGoal: s.carGoal || "",
      hasDebt: s.hasDebt != null ? !!s.hasDebt : !!p.has_high_interest_debt, debtBalance: s.debtBalance || "", debtHighInterest: s.debtHighInterest != null ? !!s.debtHighInterest : true,
      emergencyCurrent: s.emergencyCurrent || "", emergencyTarget: (p.emergency_target || s.emergencyTarget || ""),
      savingForHome: s.savingForHome != null ? !!s.savingForHome : !!p.saving_for_home,
    };
    obStep = 0; renderOnboarding();
  }

  function collectStep() {
    const g = (id) => { const e = $("#" + id); return e ? e.value : undefined; };
    const map = { ob_name: "name", ob_prov: "province", ob_wage: "wage", ob_income: "monthlyIncome", ob_rent: "rent", ob_living: "living", ob_carCost: "carCost", ob_carGoal: "carGoal", ob_debtBal: "debtBalance", ob_emCur: "emergencyCurrent", ob_emTgt: "emergencyTarget" };
    Object.entries(map).forEach(([id, key]) => { const v = g(id); if (v !== undefined) ob[key] = v; });
    const cur = $("#ob_cur"); if (cur) ob.currency = cur.value;
  }

  function renderOnboarding() {
    tabbar.classList.add("hidden");
    const total = OB_STEPS.length, pct = Math.round(((obStep + 1) / total) * 100);
    const cur = ob.currency;
    let body = "";
    if (obStep === 0) {
      body = `<h1>환영합니다 👋</h1><p class="sub">몇 가지만 알려주시면 <b>딱 맞는 돈 배분</b>을 자동으로 짜드릴게요. 1분이면 됩니다.</p>
        <div class="card">
          <div class="field"><label>이름</label><input id="ob_name" class="input" value="${esc(ob.name)}" placeholder="준서"></div>
          <div class="row2">
            <div class="field"><label>통화</label><select id="ob_cur" class="input">${["CAD", "USD", "KRW"].map((c) => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("")}</select></div>
            <div class="field"><label>지역</label><input id="ob_prov" class="input" value="${esc(ob.province)}" placeholder="BC"></div>
          </div>
        </div>`;
    } else if (obStep === 1) {
      body = `<h1>수입</h1><p class="sub">예산의 기준이 됩니다.</p>
        <div class="card">
          <div class="field"><label>어떻게 버세요?</label>
            <div class="chips" id="ob_payType">
              <div class="chip ${ob.payType === "hourly" ? "on" : ""}" data-v="hourly">시급제</div>
              <div class="chip ${ob.payType === "salary" ? "on" : ""}" data-v="salary">월급제</div>
            </div>
          </div>
          ${ob.payType === "hourly" ? `
          <div class="field"><label>시급 (${cur})</label><input id="ob_wage" class="input" type="number" inputmode="decimal" value="${ob.wage}" placeholder="24"></div>
          <label class="switch"><div><div class="sl">오버타임 받아요?</div><div class="sd">하루 8시간 초과분</div></div><div id="ob_otEn" class="tog ${ob.otEnabled ? "on" : ""}"></div></label>
          ${ob.otEnabled ? `
          <div class="field" style="margin-top:10px"><label>초과분 배수</label>
            <div class="chips" id="ob_otMult">
              <div class="chip ${Number(ob.otMult) === 1.5 ? "on" : ""}" data-v="1.5">1.5배</div>
              <div class="chip ${Number(ob.otMult) === 2 ? "on" : ""}" data-v="2">2배</div>
            </div></div>
          <label class="switch"><div><div class="sl">12시간 초과는 2배</div><div class="sd">해당 없으면 꺼두세요</div></div><div id="ob_otDbl" class="tog ${ob.otDouble ? "on" : ""}"></div></label>` : ""}` : ""}
          <div class="field" style="margin-top:12px"><label>보통 한 달 실수령 (대략, ${cur})</label><input id="ob_income" class="input" type="number" inputmode="decimal" value="${ob.monthlyIncome}" placeholder="예: 3000"><div class="hint">변동이 크면 평균으로 적어주세요.</div></div>
        </div>`;
    } else if (obStep === 2) {
      body = `<h1>고정 지출</h1><p class="sub">매달 거의 정해진 돈이에요.</p>
        <div class="card">
          <div class="field"><label>렌트 / 모기지 (월, ${cur})</label><input id="ob_rent" class="input" type="number" inputmode="decimal" value="${ob.rent}" placeholder="예: 900"></div>
          <div class="field"><label>기타 생활비 (월) — 식비·공과금·통신·교통</label><input id="ob_living" class="input" type="number" inputmode="decimal" value="${ob.living}" placeholder="예: 700"></div>
        </div>`;
    } else if (obStep === 3) {
      body = `<h1>자동차 🚗</h1>
        <div class="card">
          <label class="switch"><div><div class="sl">차가 있어요</div><div class="sd">기름값·보험 등 유지비가 나가요</div></div><div id="ob_hasCar" class="tog ${ob.hasCar ? "on" : ""}"></div></label>
          ${ob.hasCar ? `<div class="field" style="margin-top:10px"><label>차 유지비 (월) — 기름값+보험</label><input id="ob_carCost" class="input" type="number" inputmode="decimal" value="${ob.carCost}" placeholder="예: 300"><div class="hint">고정 지출에 포함해 계산합니다.</div></div>` : `
          <label class="switch"><div><div class="sl">차 살 계획이 있어요</div><div class="sd">차 살 돈을 매달 모아요</div></div><div id="ob_buyCar" class="tog ${ob.savingForCar ? "on" : ""}"></div></label>
          ${ob.savingForCar ? `<div class="field" style="margin-top:10px"><label>목표 금액 (${cur})</label><input id="ob_carGoal" class="input" type="number" inputmode="decimal" value="${ob.carGoal}" placeholder="예: 10000"></div>` : ""}`}
        </div>`;
    } else if (obStep === 4) {
      body = `<h1>부채</h1>
        <div class="card">
          <label class="switch"><div><div class="sl">갚아야 할 빚이 있어요</div><div class="sd">학자금·차 대출·신용카드 등</div></div><div id="ob_hasDebt" class="tog ${ob.hasDebt ? "on" : ""}"></div></label>
          ${ob.hasDebt ? `
          <div class="field" style="margin-top:10px"><label>남은 잔액 (${cur})</label><input id="ob_debtBal" class="input" type="number" inputmode="decimal" value="${ob.debtBalance}" placeholder="예: 5000"></div>
          <label class="switch"><div><div class="sl">고금리인가요? (이자 10%+)</div><div class="sd">신용카드 등 — 있으면 최우선으로 갚아요</div></div><div id="ob_hiInt" class="tog ${ob.debtHighInterest ? "on" : ""}"></div></label>` : ""}
        </div>`;
    } else if (obStep === 5) {
      const suggest = Math.round(((Number(ob.rent) || 0) + (Number(ob.living) || 0)) * 3) || "";
      body = `<h1>비상금</h1><p class="sub">예상 못한 일(실직·수리 등)에 대비하는 돈이에요.</p>
        <div class="card">
          <div class="field"><label>지금 모아둔 비상금 (${cur})</label><input id="ob_emCur" class="input" type="number" inputmode="decimal" value="${ob.emergencyCurrent}" placeholder="예: 1000"></div>
          <div class="field"><label>목표 금액 (${cur})</label><input id="ob_emTgt" class="input" type="number" inputmode="decimal" value="${ob.emergencyTarget}" placeholder="${suggest ? "추천 " + suggest : "예: 5000"}"><div class="hint">보통 생활비 3~6개월치${suggest ? ` (3개월 ≈ ${money0(suggest)})` : ""}.</div></div>
        </div>`;
    } else {
      collectStep();
      const M = Number(ob.monthlyIncome) || 0;
      const ess = (Number(ob.rent) || 0) + (Number(ob.living) || 0) + (ob.hasCar ? (Number(ob.carCost) || 0) : 0);
      const D = Math.round((M - ess) * 100) / 100;
      const bks = computeSetupBuckets(ob);
      const preview = bks.filter((b) => b.percent > 0).map((b) => `
        <div class="bucket"><span class="dot" style="background:${b.color}"></span><span class="nm">${esc(b.label)}</span><span class="pc">${b.percent}%</span><span class="am">${M ? money0(M * b.percent / 100) : ""}</span></div>`).join("");
      const warn = M <= 0 ? `<div class="note">수입을 입력하면 맞춤 배분이 계산돼요.</div>`
        : D < 0 ? `<div class="err">고정 지출(${money0(ess)})이 수입(${money0(M)})보다 많아요. 지출을 줄이거나 수입을 확인해 주세요.</div>`
        : `<div class="hint">월 수입 ${money0(M)} · 고정비 ${money0(ess)} · 남는 돈 ${money0(D)}을 목표별로 나눴어요.</div>`;
      body = `<h1>목표 & 요약</h1>
        <div class="card">
          <label class="switch" style="border:none;padding:6px 0"><div><div class="sl">집(첫 주택) 살 계획</div><div class="sd">캐나다 FHSA 우선 — 투자 방향 조정</div></div><div id="ob_home" class="tog ${ob.savingForHome ? "on" : ""}"></div></label>
        </div>
        <div class="card">
          <div class="card-h"><h2>추천 배분 미리보기</h2></div>
          ${preview || `<div class="empty">수입·고정비를 입력하면 배분이 보여요.</div>`}
          ${warn}
        </div>`;
    }

    app.innerHTML = `<div class="screen fadein">
      <div style="margin:8px 0 20px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px"><b style="color:var(--brand)">${OB_STEPS[obStep]}</b><span style="color:var(--ink-3)">${obStep + 1} / ${total}</span></div>
        <div class="bar" style="height:6px"><i style="width:${pct}%;background:var(--brand)"></i></div>
      </div>
      ${body}
      <div class="row2" style="margin-top:8px">
        ${obStep > 0 ? `<button id="obBack" class="btn ghost">뒤로</button>` : `<button id="obSkip" class="btn ghost">건너뛰기</button>`}
        <button id="obNext" class="btn">${obStep === total - 1 ? "완료하고 시작" : "다음"}</button>
      </div>
    </div>`;

    wireOnboarding();
    $("#obNext").onclick = () => { collectStep(); if (obStep < total - 1) { obStep++; renderOnboarding(); } else finishOnboarding(); };
    const back = $("#obBack"); if (back) back.onclick = () => { collectStep(); obStep--; renderOnboarding(); };
    const skip = $("#obSkip"); if (skip) skip.onclick = skipOnboarding;
  }

  function wireOnboarding() {
    const tog = (id, fn, rerender) => { const e = $("#" + id); if (!e) return; e.onclick = () => { collectStep(); fn(); if (rerender) renderOnboarding(); else e.classList.toggle("on"); }; };
    const pt = $("#ob_payType"); if (pt) pt.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { collectStep(); ob.payType = c.dataset.v; renderOnboarding(); }));
    const om = $("#ob_otMult"); if (om) om.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { ob.otMult = Number(c.dataset.v); om.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    tog("ob_otEn", () => (ob.otEnabled = !ob.otEnabled), true);
    tog("ob_otDbl", () => (ob.otDouble = !ob.otDouble), false);
    tog("ob_hasCar", () => (ob.hasCar = !ob.hasCar), true);
    tog("ob_buyCar", () => (ob.savingForCar = !ob.savingForCar), true);
    tog("ob_hasDebt", () => (ob.hasDebt = !ob.hasDebt), true);
    tog("ob_hiInt", () => (ob.debtHighInterest = !ob.debtHighInterest), false);
    tog("ob_home", () => (ob.savingForHome = !ob.savingForHome), false);
  }

  async function skipOnboarding() { await saveProfile({ onboarded: true }); toast("나중에 설정 탭에서 할 수 있어요"); nav("dashboard"); }

  async function finishOnboarding() {
    collectStep();
    const buckets = computeSetupBuckets(ob);
    const setup = { payType: ob.payType, wage: Number(ob.wage) || 0, monthlyIncome: Number(ob.monthlyIncome) || 0,
      rent: Number(ob.rent) || 0, living: Number(ob.living) || 0,
      hasCar: ob.hasCar, carCost: Number(ob.carCost) || 0, savingForCar: ob.savingForCar, carGoal: Number(ob.carGoal) || 0,
      hasDebt: ob.hasDebt, debtBalance: Number(ob.debtBalance) || 0, debtHighInterest: ob.debtHighInterest,
      emergencyCurrent: Number(ob.emergencyCurrent) || 0, emergencyTarget: Number(ob.emergencyTarget) || 0, savingForHome: ob.savingForHome,
      ot: { enabled: ob.otEnabled, dailyOT: 8, otMult: Number(ob.otMult) || 1.5, double: ob.otDouble, doubleThresh: 12, dtMult: 2 } };
    const btn = $("#obNext"); if (btn) btn.disabled = true;
    await saveProfile({
      display_name: ob.name || S.profile.display_name, currency: ob.currency || "CAD", province: ob.province || "BC",
      hourly_wage: Number(ob.wage) || S.profile.hourly_wage || 0,
      has_high_interest_debt: !!(ob.hasDebt && ob.debtHighInterest), emergency_target: Number(ob.emergencyTarget) || 0,
      saving_for_home: !!ob.savingForHome, setup, buckets, onboarded: true,
    });
    toast("맞춤 설정 완료 ✓"); nav("dashboard");
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
    const nm = S.profile?.display_name || "준서";
    return `<div class="topbar">
      <div class="brand"><span class="logo">${icon("mark", 19)}</span><span>VAULT</span></div>
      <div class="hello">안녕하세요<br><b>${esc(nm)}</b></div></div>`;
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    const bal = vaultBalance(), mi = monthIncome(), me = monthExpense();
    const buckets = S.profile.buckets || [];
    const bRows = buckets.map((b) => ({ ...b, bal: totalBucket(b.key) }));
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <div class="card hero">
          <div class="label">총 자산</div>
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
        <div class="ic ${it.t === "inc" ? "in" : "out"}">${icon(it.t === "inc" ? "inflow" : "outflow", 20)}</div>
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
      data: { labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => Math.max(0, r.bal)), backgroundColor: rows.map((r) => r.color), borderColor: "#ffffff", borderWidth: 3, hoverOffset: 4 }] },
      options: { cutout: "70%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.raw)}` } } } },
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
          <label class="switch" style="border:none;padding:8px 0"><div><div class="sl">배분 안 함 (정산·환급)</div><div class="sd">기름값·자재비처럼 돌려받은 돈. 버킷에 안 나누고 잔액에만 더함</div></div><div id="inNoAlloc" class="tog"></div></label>
          <div id="allocPreview"></div>
          <button id="saveInc" class="btn gold" style="margin-top:8px">${icon("coin", 18)} <span id="saveIncTxt">배분하고 저장</span></button>
          <div class="hint">비율은 <b>설정 탭</b>에서 언제든 바꿀 수 있어요.</div>
        </div>
        <div class="card">
          <h2>수입 내역</h2>
          <div id="incList">${incomeList()}</div>
        </div>
      </div>`;
    const amtEl = $("#inAmt");
    let noAlloc = false;
    const upd = () => {
      if (noAlloc) { $("#allocPreview").innerHTML = `<div class="hint" style="padding:8px 0">정산·환급으로 처리됩니다 — 버킷에 나누지 않고 총 잔액에만 더해집니다.</div>`; }
      else { $("#allocPreview").innerHTML = allocPreviewHTML(Number(amtEl.value) || 0, buckets); }
    };
    amtEl.oninput = upd; upd();
    $("#inNoAlloc").onclick = (e) => { noAlloc = !noAlloc; e.currentTarget.classList.toggle("on", noAlloc); $("#saveIncTxt").textContent = noAlloc ? "정산 저장" : "배분하고 저장"; upd(); };
    $("#saveInc").onclick = () => saveIncome(() => noAlloc);
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
        <div class="ic in">${icon("inflow", 20)}</div>
        <div class="mid"><div class="t1">${esc(i.source || "수입")}</div><div class="t2">${fmtDate(i.income_date)}</div></div>
        <div class="amt pos">+${money(i.amount)}</div>
        <button class="del" data-del="${i.id}">${icon("close", 16)}</button>
      </div>`).join("");
  }
  async function saveIncome(getNoAlloc) {
    const amt = Number($("#inAmt").value); const src = $("#inSrc").value.trim(); const date = $("#inDate").value || todayStr();
    if (!amt || amt <= 0) return toast("금액을 입력하세요.", true);
    const noAlloc = getNoAlloc && getNoAlloc();
    let alloc = [];
    if (!noAlloc) {
      const { rows } = A.allocate(amt, S.profile.buckets || []);
      alloc = rows.map((r) => ({ key: r.key, label: r.label, percent: r.percent, amount: r.amount }));
    }
    const btn = $("#saveInc"); btn.disabled = true;
    const { data, error } = await sb.from("incomes").insert({ user_id: S.user.id, income_date: date, amount: amt, source: src || (noAlloc ? "정산·환급" : "수입"), allocation: alloc }).select().single();
    btn.disabled = false;
    if (error) return toast("저장 실패: " + error.message, true);
    S.incomes.unshift(data); toast(noAlloc ? "정산 저장 ✓" : "배분 완료 ✓"); nav("dashboard");
  }

  /* ================= WORK ================= */
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const fmtH = (n) => { const v = round(n); return (Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")).toString(); };

  // 오버타임 규칙 — 사용자별(온보딩/설정). 기본: 8h 초과 1.5배, 12h 2배는 꺼짐.
  function otCfg() {
    const d = (S.profile && S.profile.setup && S.profile.setup.ot) || {};
    return {
      enabled: d.enabled !== false,
      dailyOT: Number(d.dailyOT) || 8,
      otMult: Number(d.otMult) || 1.5,
      double: !!d.double,
      doubleThresh: Number(d.doubleThresh) || 12,
      dtMult: Number(d.dtMult) || 2,
    };
  }
  function otRuleText() {
    const c = otCfg();
    if (!c.enabled) return "오버타임 없음 (모든 시간 시급 그대로)";
    let t = `하루 ${fmtH(c.dailyOT)}시간 초과는 <b>${c.otMult}배</b>`;
    if (c.double) t += `, ${fmtH(c.doubleThresh)}시간 초과는 <b>${c.dtMult}배</b>`;
    return t + " 자동 계산";
  }
  function computeWorkPay(hours, wage) {
    const h = Number(hours) || 0, w = Number(wage) || 0;
    const c = otCfg();
    if (!c.enabled) return { reg: round(h), otH: 0, dtH: 0, otTotal: 0, pay: round(h * w) };
    const cap = c.double ? c.doubleThresh : Infinity;
    const reg = Math.min(h, c.dailyOT);
    const otH = Math.max(0, Math.min(h, cap) - c.dailyOT);
    const dtH = c.double ? Math.max(0, h - c.doubleThresh) : 0;
    const pay = (reg + otH * c.otMult + dtH * c.dtMult) * w;
    return { reg: round(reg), otH: round(otH), dtH: round(dtH), otTotal: round(otH + dtH), pay: round(pay) };
  }

  // 여러 줄 텍스트 파싱: "8/4 08:00 18:30 10hrs 리치몬드" → {date,hours,note}
  function parseWorkLines(text) {
    const rows = [], errors = [];
    const year = new Date().getFullYear();
    (text || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trim(); if (!line) return;
      const dm = line.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
      if (!dm) { errors.push(line); return; }
      const month = +dm[1], day = +dm[2];
      const hm = line.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|시간|h)\b/i);
      const times = [...line.matchAll(/(\d{1,2}):(\d{2})/g)].map((t) => (+t[1]) + (+t[2]) / 60);
      let hours = null;
      if (hm) hours = parseFloat(hm[1]);
      else if (times.length >= 2) { let d = times[1] - times[0]; if (d < 0) d += 24; hours = round(d); }
      if (hours == null || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) { errors.push(line); return; }
      const note = line
        .replace(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})/, " ")
        .replace(/\d{1,2}:\d{2}/g, " ")
        .replace(/(\d+(?:\.\d+)?)\s*(?:hrs?|시간|h)\b/gi, " ")
        .replace(/[~–—]/g, " ").trim().replace(/\s+/g, " ");
      rows.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, hours, note });
    });
    return { rows, errors };
  }

  let wMode = "single";
  function renderWork() {
    const wage = Number(S.profile.hourly_wage) || 0;
    const wk = weekStats(), mo = monthWorkStats();
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>근무 기록</h1>
        <p class="sub">시급 <b>${money(wage)}</b> 기준 · ${otRuleText()}.</p>
        <div class="grid2">
          <div class="mini"><div class="k">이번 주</div><div class="v">${fmtH(wk.hours)}h</div><div class="k" style="margin-top:4px;color:var(--pos)">${money0(wk.earned)}</div></div>
          <div class="mini"><div class="k">이번 달</div><div class="v">${fmtH(mo.hours)}h</div><div class="k" style="margin-top:4px;color:var(--pos)">${money0(mo.earned)}</div></div>
        </div>
        <div class="seg" id="wMode">
          <button data-m="single" class="${wMode === "single" ? "on" : ""}">한 개씩</button>
          <button data-m="bulk" class="${wMode === "bulk" ? "on" : ""}">여러 개 붙여넣기</button>
        </div>

        <div id="wSingle" class="${wMode === "single" ? "" : "hidden"}">
          <div class="card">
            ${wage <= 0 ? `<div class="note">먼저 <b>설정 탭</b>에서 시급을 입력하면 급여가 자동 계산됩니다.</div>` : ""}
            <div class="row2">
              <div class="field"><label>날짜</label><input id="wDate" class="input" type="date" value="${todayStr()}"></div>
              <div class="field"><label>일한 시간</label><input id="wHours" class="input" type="number" inputmode="decimal" placeholder="8"></div>
            </div>
            <div class="field"><label>장소 / 메모 (선택)</label><input id="wNote" class="input" placeholder="리치몬드 / website"></div>
            <div class="field"><label>시급 (이 기록에만 적용)</label><input id="wWage" class="input" type="number" inputmode="decimal" value="${wage || ""}" placeholder="24"></div>
            <div id="wCalc" class="hint"></div>
            <label class="switch" style="border:none;padding:10px 0"><div><div class="sl">수입에도 자동 추가</div><div class="sd">급여를 버킷으로 바로 배분합니다</div></div><div id="wAsInc" class="tog"></div></label>
            <button id="saveWork" class="btn">${icon("clock", 18)} 근무 저장</button>
          </div>
        </div>

        <div id="wBulk" class="${wMode === "bulk" ? "" : "hidden"}">
          <div class="card">
            <div class="field"><label>근무 여러 줄 붙여넣기 (한 줄에 하루)</label>
              <textarea id="wkText" class="input" style="min-height:150px;resize:vertical;line-height:1.6" placeholder="8/2 17:00 19:00 2hrs website&#10;8/4 08:00 18:30 10hrs 리치몬드&#10;8/13 08:00 22:00 13hrs 리치몬드"></textarea>
              <div class="hint">날짜·시간·"10hrs"·장소를 자유롭게 — 알아서 인식합니다. (적어둔 시간을 우선 사용해 휴식시간 반영)</div>
            </div>
            <div class="field"><label>시급</label><input id="wkWage" class="input" type="number" inputmode="decimal" value="${wage || ""}" placeholder="24"></div>
            <button id="wkParse" class="btn ghost sm" style="width:100%">${icon("sliders", 17)} 분석하기</button>
            <div id="wkPreview"></div>
          </div>
        </div>

        <div class="card">
          <h2>기록</h2>
          <div id="wList">${workList()}</div>
        </div>
      </div>`;

    $("#wMode").querySelectorAll("button").forEach((b) => (b.onclick = () => { wMode = b.dataset.m; renderWork(); }));

    if (wMode === "single") {
      const h = $("#wHours"), w = $("#wWage");
      const calc = () => {
        const p = computeWorkPay(Number(h.value) || 0, Number(w.value) || 0);
        if (!p.pay) { $("#wCalc").innerHTML = ""; return; }
        const ot = p.otTotal ? ` <span style="color:var(--amber)">(OT ${fmtH(p.otTotal)}h 포함)</span>` : "";
        $("#wCalc").innerHTML = `예상 급여: <b style="color:var(--pos)">${money(p.pay)}</b>${ot}`;
      };
      h.oninput = calc; w.oninput = calc; calc();
      let asInc = false; $("#wAsInc").onclick = (e) => { asInc = !asInc; e.currentTarget.classList.toggle("on", asInc); };
      $("#saveWork").onclick = () => saveWork(() => asInc);
    } else {
      $("#wkParse").onclick = () => {
        const { rows, errors } = parseWorkLines($("#wkText").value);
        const wg = Number($("#wkWage").value) || 0;
        if (!rows.length) { $("#wkPreview").innerHTML = `<div class="err" style="margin-top:12px">인식된 줄이 없습니다. 예: 8/4 08:00 18:30 10hrs 리치몬드</div>`; return; }
        if (!wg) { toast("시급을 입력하세요.", true); }
        $("#wkPreview").innerHTML = bulkPreviewHTML(rows, wg, errors);
        let asInc = false;
        const tg = $("#wkAsInc"); if (tg) tg.onclick = (e) => { asInc = !asInc; e.currentTarget.classList.toggle("on", asInc); };
        $("#wkSave").onclick = () => saveWorkBulk(rows, wg, () => asInc);
      };
    }
    bindDeletes("#wList", "work_logs", () => S.work);
  }

  function bulkPreviewHTML(rows, wage, errors) {
    let totH = 0, totPay = 0, totOT = 0;
    const items = rows.map((r) => {
      const p = computeWorkPay(r.hours, wage); totH += r.hours; totPay += p.pay; totOT += p.otTotal;
      const otTag = p.otTotal ? `<span style="color:var(--amber)"> · OT ${fmtH(p.otTotal)}h</span>` : "";
      return `<div class="item">
        <div class="ic">${icon("clock", 20)}</div>
        <div class="mid"><div class="t1">${fmtDate(r.date)}${r.note ? " · " + esc(r.note) : ""}</div><div class="t2">${fmtH(r.hours)}시간${otTag}</div></div>
        <div class="amt pos">${money(p.pay)}</div>
      </div>`;
    }).join("");
    const errHtml = errors && errors.length ? `<div class="err" style="margin-top:10px">인식 못한 줄 ${errors.length}개: ${esc(errors.slice(0, 3).join(" / "))}</div>` : "";
    return `<div style="margin-top:14px">${items}</div>${errHtml}
      <div class="switch"><div><div class="sl">수입에도 자동 추가</div><div class="sd">총 급여 ${money(round(totPay))}를 버킷으로 배분</div></div><div id="wkAsInc" class="tog"></div></div>
      <div class="card-h" style="margin:14px 0 10px"><h2 style="margin:0">합계</h2><span class="total-pill ok">${fmtH(totH)}시간${totOT ? " · OT " + fmtH(totOT) + "h" : ""} · ${money(round(totPay))}</span></div>
      <button id="wkSave" class="btn">${icon("clock", 18)} ${rows.length}개 근무 저장</button>`;
  }

  function workList() {
    if (!S.work.length) return `<div class="empty">근무 기록이 없습니다.</div>`;
    return S.work.slice(0, 60).map((r) => {
      const p = computeWorkPay(r.hours, r.hourly_wage);
      const otTag = p.otTotal ? `<span style="color:var(--amber)"> · OT ${fmtH(p.otTotal)}h</span>` : "";
      return `<div class="item">
        <div class="ic">${icon("clock", 20)}</div>
        <div class="mid"><div class="t1">${fmtDate(r.work_date)}${r.note ? " · " + esc(r.note) : ""}</div><div class="t2">${fmtH(r.hours)}시간${otTag} · 시급 ${money(r.hourly_wage)}</div></div>
        <div class="amt pos">${money(p.pay)}</div>
        <button class="del" data-del="${r.id}">${icon("close", 16)}</button>
      </div>`;
    }).join("");
  }
  function workEarned(rows) { return round(sum(rows, (r) => computeWorkPay(r.hours, r.hourly_wage).pay)); }
  function weekStats() {
    const now = new Date(); const day = (now.getDay() + 6) % 7; // 월요일 시작
    const monday = new Date(now); monday.setDate(now.getDate() - day);
    const mk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const rows = S.work.filter((r) => r.work_date >= mk);
    return { hours: round(sum(rows, (r) => r.hours)), earned: workEarned(rows) };
  }
  function monthWorkStats() {
    const rows = S.work.filter((r) => monthKey(r.work_date) === nowMonth());
    return { hours: round(sum(rows, (r) => r.hours)), earned: workEarned(rows) };
  }

  function sortWork() { S.work.sort((a, b) => (b.work_date + (b.created_at || "")).localeCompare(a.work_date + (a.created_at || ""))); }

  async function saveWork(getAsInc) {
    const date = $("#wDate").value || todayStr(); const hours = Number($("#wHours").value); const wage = Number($("#wWage").value) || 0;
    const note = $("#wNote").value.trim() || null;
    if (!hours || hours <= 0) return toast("일한 시간을 입력하세요.", true);
    const btn = $("#saveWork"); btn.disabled = true;
    const { data, error } = await sb.from("work_logs").insert({ user_id: S.user.id, work_date: date, hours, hourly_wage: wage, note }).select().single();
    if (error) { btn.disabled = false; return toast("저장 실패: " + error.message, true); }
    S.work.unshift(data); sortWork();
    if (wage && wage !== Number(S.profile.hourly_wage)) await saveProfile({ hourly_wage: wage });
    if (getAsInc() && wage > 0) {
      const amt = computeWorkPay(hours, wage).pay;
      const { rows } = A.allocate(amt, S.profile.buckets || []);
      const alloc = rows.map((r) => ({ key: r.key, label: r.label, percent: r.percent, amount: r.amount }));
      const { data: inc } = await sb.from("incomes").insert({ user_id: S.user.id, income_date: date, amount: amt, source: "근무 급여", allocation: alloc }).select().single();
      if (inc) S.incomes.unshift(inc);
    }
    btn.disabled = false; toast("근무 저장 ✓"); nav("work");
  }

  async function saveWorkBulk(rows, wage, getAsInc) {
    if (!wage) return toast("시급을 입력하세요.", true);
    const btn = $("#wkSave"); btn.disabled = true;
    const payload = rows.map((r) => ({ user_id: S.user.id, work_date: r.date, hours: r.hours, hourly_wage: wage, note: r.note || null }));
    const { data, error } = await sb.from("work_logs").insert(payload).select();
    if (error) { btn.disabled = false; return toast("저장 실패: " + error.message, true); }
    S.work = (data || []).concat(S.work); sortWork();
    if (wage !== Number(S.profile.hourly_wage)) await saveProfile({ hourly_wage: wage });
    if (getAsInc()) {
      const totPay = round(rows.reduce((s, r) => s + computeWorkPay(r.hours, wage).pay, 0));
      const { rows: alloc } = A.allocate(totPay, S.profile.buckets || []);
      const allocation = alloc.map((r) => ({ key: r.key, label: r.label, percent: r.percent, amount: r.amount }));
      const { data: inc } = await sb.from("incomes").insert({ user_id: S.user.id, income_date: todayStr(), amount: totPay, source: "근무 급여(정산)", allocation }).select().single();
      if (inc) S.incomes.unshift(inc);
    }
    btn.disabled = false; toast(rows.length + "개 근무 저장 ✓"); nav("work");
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
          <button id="saveExp" class="btn">${icon("plus", 18)} 지출 저장</button>
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
        <div class="ic out">${icon("outflow", 20)}</div>
        <div class="mid"><div class="t1">${esc(e.category || "지출")}${b ? ` · ${esc(b.label)}` : ""}</div><div class="t2">${fmtDate(e.expense_date)}</div></div>
        <div class="amt neg">-${money(e.amount)}</div>
        <button class="del" data-del="${e.id}">${icon("close", 16)}</button>
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
          <button id="applyReco" class="btn gold sm" style="width:100%">${icon("star", 17)} 이 상황 기준 추천 비율 적용</button>
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
          <button id="reOnboard" class="btn ghost sm" style="width:100%">${icon("star", 16)} 맞춤 설정 다시 하기 (온보딩)</button>
        </div>

        <div class="card tight">
          <div class="item" style="border:none">
            <div class="ic in">${icon("mark", 20)}</div>
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
    $("#reOnboard").onclick = () => startOnboarding();
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
    try { await loadAll(); if (!S.profile.onboarded) startOnboarding(); else nav("dashboard"); }
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
