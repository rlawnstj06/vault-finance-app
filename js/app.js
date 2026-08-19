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
  const EN_MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(s) { if (!s) return ""; const [y, m, d] = s.split("-"); return VLANG === "en" ? `${EN_MON[+m]} ${+d}` : `${Number(m)}월 ${Number(d)}일`; }

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
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.9 5.6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3 3.6M6.3 7.8A15 15 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.6-.7"/><path d="M9.8 10a3 3 0 0 0 4.2 4.2"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    trend: '<path d="M4 16l5-5 3 3 7-8"/><path d="M15 6h5v5"/>',
    scale: '<path d="M12 4v16M7 20h10"/><path d="M4 9l3-4 3 4a3 3 0 0 1-6 0zM14 9l3-4 3 4a3 3 0 0 1-6 0z"/>',
  };
  function icon(name, size) { return `<svg class="ic-svg" width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[name] || ""}</svg>`; }

  /* ================= 언어 (한/영) — 런타임 번역 ================= */
  function getLang() { try { const s = localStorage.getItem("vault-lang"); if (s === "ko" || s === "en") return s; } catch (e) {} return (navigator.language || "").toLowerCase().indexOf("ko") === 0 ? "ko" : "en"; }
  let VLANG = getLang();
  function setLang(l) { try { localStorage.setItem("vault-lang", l); } catch (e) {} VLANG = l; document.documentElement.setAttribute("lang", l); }
  const T = {
    // 내비·화면 제목
    "홈": "Home", "수입 배분": "Income", "근무 기록": "Work", "지출": "Spending", "설정": "Settings", "순자산": "Net Worth", "저축 목표": "Savings Goals", "목표": "Goals",
    // 인증
    "스마트 자산 관리 · BC Canada": "Smart money, on autopilot · BC Canada", "스마트 자산 관리": "Smart money, on autopilot", "이름 (표시용)": "Name (display)", "이메일": "Email", "비밀번호": "Password", "가입하고 시작": "Sign up & start", "로그인": "Log in",
    "이미 계정이 있나요? <a id='swap'>로그인</a>": "Have an account? <a id='swap'>Log in</a>", "처음이신가요? <a id='swap'>새 계정 만들기</a>": "New here? <a id='swap'>Create account</a>",
    "비밀번호를 잊으셨나요?": "Forgot password?", "비밀번호 재설정": "Reset password", "재설정 링크 보내기": "Send reset link", "로그인으로 돌아가기": "Back to log in", "새 비밀번호": "New password", "새로 쓸 비밀번호를 정해주세요": "Choose a new password", "비밀번호 변경": "Change password", "6자 이상": "6+ characters",
    "처음이신가요?": "New here?", "새 계정 만들기": "Create account", "이미 계정이 있나요?": "Have an account?", "대시보드": "Dashboard", "근무": "Work",
    // 대시보드
    "총 자산": "Total balance", "순자산 관리": "Manage net worth", "저축·투자 누적": "Saved & invested", "비상금 · 투자 · 차": "Emergency · Invest · Car", "이번 달 저축률": "Savings rate", "이번 달 남은 예산": "Left to spend this month", "배분 건강 (50·30·20)": "Budget health (50·30·20)", "필수": "Needs", "여유": "Wants", "저축·투자": "Save · Invest", "이번 달 리뷰": "This month's review", "✨ AI 재무 코치": "✨ AI money coach", "코치에게 물어보기": "Ask the coach", "다시 받기": "Ask again", "저축률 추이": "Savings rate trend", "목표 진행률": "Goal progress", "+ 목표": "+ Goal", "버킷별 잔액": "Bucket balances", "+ 수입 배분": "+ Add income", "최근 활동": "Recent activity", "시작하기 👋": "Get started 👋", "저축률": "Savings rate", "훌륭해요": "great", "보통": "ok", "낮아요": "low", "예산 초과": "Over budget", "기록이 없습니다.": "No records yet.",
    // 버킷 기본명
    "주거 · 고정비": "Housing · Fixed", "식비": "Food", "빚 갚기": "Debt payoff", "비상금": "Emergency", "투자 · 주식": "Invest · Stocks", "차 저축": "Car fund", "For fun": "For fun",
    // 수입
    "번 돈을 입력하면 설정한 비율대로 자동으로 나눠 담습니다.": "Enter what you earned and it's split automatically by your plan.", "금액": "Amount", "출처": "Source", "날짜": "Date", "배분 안 함 (정산·환급)": "Don't allocate (reimbursement)", "배분하고 저장": "Allocate & save", "정산 저장": "Save reimbursement", "수입 내역": "Income history",
    // 근무
    "근무 추가": "Add work", "✕ 닫기": "✕ Close", "한 개씩": "One at a time", "여러 개 붙여넣기": "Paste multiple", "이번 주": "This week", "이번 달": "This month", "일한 시간": "Hours worked", "장소 / 메모 (선택)": "Place / note (optional)", "시급 (이 기록에만 적용)": "Hourly rate (this entry)", "수입에도 자동 추가": "Also add as income", "급여를 버킷으로 바로 배분합니다": "Splits pay into buckets right away", "근무 저장": "Save work", "분석하기": "Analyze", "시급": "Hourly rate", "근무 편집": "Edit work", "시간": "Hours", "장소": "Place",
    // 지출
    "지출 추가": "Add expense", "지출 저장": "Save expense", "분류": "Category", "어느 버킷에서 나갔나요? (선택)": "From which bucket? (optional)", "지정 안 함": "None", "월별 지출 추이": "Monthly spending trend", "지출 편집": "Edit expense", "이 달 지출 기록이 없어요.": "No spending this month.", "정기": "auto",
    "식비": "Food", "렌트": "Rent", "교통": "Transport", "쇼핑": "Shopping", "구독": "Subscriptions", "의료": "Medical", "여가": "Leisure", "기타": "Other",
    // 설정
    "프로필": "Profile", "이름": "Name", "통화": "Currency", "월급날 (매달 며칠, 선택)": "Payday (day of month, optional)", "프로필 저장": "Save profile", "모양": "Appearance", "☀ 라이트": "☀ Light", "☾ 다크": "☾ Dark", "알림 (푸시)": "Notifications (push)", "푸시 알림 받기": "Get push notifications", "🔔 테스트 알림 보내기": "🔔 Send test notification", "내 재무 상황": "My financial situation", "고정 지출 (자동 반영)": "Recurring expenses (auto)", "데이터 내보내기 (CSV)": "Export data (CSV)", "앱 잠금 (PIN)": "App lock (PIN)", "PIN 설정": "Set PIN", "PIN 변경": "Change PIN", "잠금 끄기": "Turn off", "배분 항목 편집": "Edit allocation", "정기 지출 추가": "Add recurring", "고정 지출 추가": "Add fixed cost", "순자산 · 계좌 관리": "Net worth · accounts", "언어": "Language", "다른 계정으로 전환 (로그아웃)": "Switch account (log out)",
    // 순자산·목표
    "내 계좌 · 자산 / 부채": "My accounts · assets / debts", "자산": "Assets", "부채": "Debts", "추가": "Add", "순자산 추이": "Net worth trend", "새 목표 추가": "Add a goal", "목표 이름": "Goal name", "목표 금액": "Target amount", "월 적립 (선택)": "Monthly (optional)", "목표 추가": "Add goal", "적립하기": "Add funds", "이모지": "Emoji", "이름": "Name",
    // 온보딩
    "환영합니다 👋": "Welcome 👋", "다음": "Next", "뒤로": "Back", "건너뛰기": "Skip", "완료하고 시작": "Finish & start", "수입": "Income", "고정 지출": "Fixed costs", "자동차 🚗": "Car 🚗", "부채": "Debt", "목표 & 요약": "Goals & summary", "어떻게 버세요?": "How do you get paid?", "시급제": "Hourly", "월급제": "Salary", "오버타임 받아요?": "Get overtime?", "차가 있어요": "I have a car", "차 살 계획이 있어요": "Planning to buy a car", "갚아야 할 빚이 있어요": "I have debt to pay", "집(첫 주택) 살 계획": "Plan to buy a home", "지금 모아둔 비상금": "Emergency fund now", "목표 금액": "Target amount", "렌트 / 모기지 (월)": "Rent / mortgage (mo)", "식비 (월)": "Food (mo)",
    // 공통 토스트/버튼
    "저장": "Save", "취소": "Cancel", "삭제됐어요": "Deleted", "복구됨 ✓": "Restored ✓", "수정됨 ✓": "Updated ✓", "저장됨": "Saved", "배분 완료 ✓": "Allocated ✓", "정산 저장 ✓": "Saved ✓", "근무 저장 ✓": "Work saved ✓", "지출 저장 ✓": "Expense saved ✓", "목표 추가 ✓": "Goal added ✓", "CSV 내보냈어요 ✓": "CSV exported ✓", "PIN 설정됨 ✓": "PIN set ✓", "알림 켜짐 ✓": "Notifications on ✓", "PIN 입력": "Enter PIN", "앱 잠금 해제": "Unlock", "새 PIN": "New PIN", "PIN 확인": "Confirm PIN", "4자리 숫자": "4 digits", "한 번 더 입력": "Enter again",
    // 월
    "1월": "Jan", "2월": "Feb", "3월": "Mar", "4월": "Apr", "5월": "May", "6월": "Jun", "7월": "Jul", "8월": "Aug", "9월": "Sep", "10월": "Oct", "11월": "Nov", "12월": "Dec",
    // placeholder
    "예: 1500": "e.g. 1500", "월급 / 알바 / 보너스": "Salary / part-time / bonus", "예: 42.50": "e.g. 42.50", "예: 일본 여행": "e.g. Japan trip", "you@email.com": "you@email.com",
    // 온보딩
    "기본 정보": "Basics", "자동차": "Car", "지역": "Region", "환영합니다 👋": "Welcome 👋", "예산의 기준이 됩니다.": "This sets your budget baseline.", "매달 거의 정해진 돈이에요.": "Roughly fixed each month.", "세부 항목은 나중에 <b>설정 → 배분 항목 편집</b>에서 자유롭게 추가할 수 있어요.": "You can add details later in Settings → Edit allocation.",
    "초과분 배수": "OT multiplier", "1.5배": "1.5×", "2배": "2×", "하루 8시간 초과분": "Hours over 8/day", "12시간 초과는 2배": "Over 12h at 2×", "해당 없으면 꺼두세요": "Leave off if N/A", "변동이 크면 평균으로 적어주세요.": "Use an average if it varies.",
    "장보기·외식 등 먹는 데 쓰는 돈.": "Money spent on food — groceries & eating out.", "기름값·보험 등 유지비가 나가요": "Gas, insurance & upkeep", "고정 지출에 포함해 계산합니다.": "Counted as a fixed cost.", "차 살 돈을 매달 모아요": "Save monthly toward a car", "학자금·차 대출·신용카드 등": "Student loan, car loan, credit card, etc.", "고금리인가요? (이자 10%+)": "High interest? (10%+)", "신용카드 등 — 있으면 최우선으로 갚아요": "Credit cards — pay these first",
    "예상 못한 일(실직·수리 등)에 대비하는 돈이에요.": "Money for the unexpected (job loss, repairs).", "FHSA 우선 · 투자 방향 조정": "FHSA first · adjusts investing", "캐나다 FHSA 우선 — 투자 방향 조정": "Canada FHSA first — adjusts investing", "내 배분 (50·30·20)": "My split (50·30·20)", "추천 배분 미리보기": "Recommended split preview",
    // 설정 설명/버킷 편집/정기지출/계좌
    "이 정보로 <b>추천 배분 비율</b>이 자동 계산됩니다.": "Your recommended split is calculated from this.", "고금리 빚이 있음": "I have high-interest debt", "신용카드 등 이자 10%+ · 있으면 빚부터 우선": "Credit cards 10%+ · pay debt first", "집(첫 주택) 살 계획": "Plan to buy a home", "비상금 목표 (CAD)": "Emergency target (CAD)", "보통 생활비 3~6개월치. 채워지면 투자 비중이 자동으로 커집니다.": "Usually 3–6 months of costs. Once full, investing grows automatically.",
    "항목을 추가·삭제하고, 이름과 비율을 직접 정하세요. 합계 100%가 되면 저장됩니다.": "Add, remove, rename items and set the %. Save when it totals 100%.", "새 항목 이름": "New item name", "비율 %": "%", "항목 추가": "Add item", "배분 저장": "Save allocation",
    "핸드폰·넷플릭스·유튜브·보험처럼 매달 자동으로 빠지는 지출. 등록하면 매달 그 날짜에 <b>지출로 자동 기록</b>됩니다.": "Phone, Netflix, insurance — recurring monthly costs. Auto-logged as spending on that day.", "넷플릭스·핸드폰처럼 매달 같은 날 빠지는 걸 넣으면<br>자동으로 지출에 기록돼요.": "Add things like Netflix or your phone bill<br>and they're auto-logged each month.", "매달 며칠": "Day of month",
    "엑셀·구글시트에서 열 수 있어요. 세금·기록용으로 좋습니다.": "Opens in Excel or Google Sheets. Great for taxes & records.", "앱을 열 때 4자리 PIN을 입력하게 해요. 잔액을 남이 못 보게.": "Require a 4-digit PIN to open the app. Keep balances private.", "월급날·예산 알림을 폰으로. iPhone은 <b>홈 화면에 설치 후</b> 켜세요.": "Payday & budget alerts on your phone. On iPhone, install to Home Screen first.",
    "체킹·저축·투자 잔액과 빚을 넣으면 <b>순자산</b>이 계산됩니다.": "Add checking, savings, investments & debts to compute net worth.", "계좌를 추가하면 매달 순자산이 자동 기록되어 우상향 그래프가 그려집니다.": "Add accounts and your net worth is tracked monthly into a rising chart.", "없음": "None",
    "여행·첫 차·비상금처럼 모으고 싶은 걸 추가하세요.": "Add things you're saving for — a trip, a car, an emergency fund.", "아직 목표가 없어요.": "No goals yet.", "🎉 목표 달성!": "🎉 Goal reached!", "월 적립액을 정하면 예측돼요": "Set a monthly amount to see a forecast",
    // 근무/지출/수입 잔여
    "날짜·시간·\"10hrs\"·장소를 자유롭게 — 알아서 인식합니다.": "Date, time, \"10hrs\", place — freely typed, auto-detected.", "근무 여러 줄 붙여넣기 (한 줄에 하루)": "Paste work rows (one day per line)", "아직 근무 기록이 없어요.": "No work logged yet.", "위 <b>근무 추가</b>로 기록하세요.": "Use Add work above.", "이 달 지출 기록이 없습니다.": "No spending this month.", "아직 수입 기록이 없습니다.": "No income yet.", "비율은 <b>설정 탭</b>에서 언제든 바꿀 수 있어요.": "Change the split anytime in Settings.", "정산·환급으로 처리됩니다 — 버킷에 나누지 않고 총 잔액에만 더해집니다.": "Handled as reimbursement — added to balance, not split into buckets.", "기름값·자재비처럼 돌려받은 돈. 버킷에 안 나누고 잔액에만 더함": "Money you got back (gas, supplies). Adds to balance, not buckets.",
    "먼저 <b>설정 탭</b>에서 시급을 입력하면 급여가 자동 계산됩니다.": "Add your hourly rate in Settings and pay is calculated automatically.", "적어둔 시간을 우선 사용해 휴식시간 반영": "Uses the hours you wrote (breaks included).", "합계": "Total", "인식된 줄이 없습니다. 예: 8/4 08:00 18:30 10hrs 리치몬드": "No rows detected. e.g. 8/4 08:00 18:30 10hrs Richmond",
    "이름과 금액을 입력하세요.": "Enter a name and amount.", "이름과 잔액을 입력하세요.": "Enter a name and balance.", "이름과 목표 금액을 입력하세요.": "Enter a name and target.", "금액을 입력하세요.": "Enter an amount.", "일한 시간을 입력하세요.": "Enter hours worked.", "시간을 입력하세요.": "Enter hours.", "시급을 입력하세요.": "Enter hourly rate.", "항목 이름을 입력하세요.": "Enter an item name.",
    "맞춤 설정 다시 하기 (온보딩)": "Redo setup (onboarding)", "로그인 유지됨 · 이 기기에서 계속 로그인 상태": "Stays logged in on this device", "합계가 100%가 되도록 맞춰주세요.": "Make it total 100%.", "이름과 월 금액을 입력하세요.": "Enter a name and monthly amount.",
    "저축률이 오를수록 경제적 자유가 빨라져요. 관리할수록 이 선이 올라갑니다.": "A higher savings rate means faster financial freedom — this line rises as you manage.", "저축 · 투자": "Save · Invest", "필수 지출": "Needs", "여유 · For fun": "Wants · For fun", "정기 지출 (자동 반영)": "Recurring (auto-logged)", "FHSA 우선 · 투자 비중 조정": "FHSA first · adjusts investing", "이 상황 기준 추천 비율 적용": "Apply recommended split", "저축": "Save", "맞춤 조언": "personalized advice", "일 근무": "days", "번 돈을 넣고 배분하면 저축이 자동으로 시작돼요.": "Add what you earned and saving starts automatically.", "💰 월급날이에요!": "💰 It's payday!", "배분하기": "Allocate",
    "· 정기": "· auto", "잔액": "Balance", "현금·체킹": "Cash · Checking", "저축": "Savings", "투자·주식": "Invest · Stocks", "TFSA/RRSP": "TFSA/RRSP", "부동산": "Real estate", "차": "Car", "신용카드": "Credit card", "대출": "Loan",
  };
  const PAT = [
    [/^안녕하세요$/, () => "Hello"],
    [/^(\d{4})년 (\d{1,2})월$/, (m) => `${EN_MON[+m[2]]} ${m[1]}`],
    [/^(\d{4})년 (\d{1,2})월 내역$/, (m) => `${EN_MON[+m[2]]} ${m[1]} history`],
    [/^(\d{1,2})월 (\d{1,2})일$/, (m) => `${EN_MON[+m[1]]} ${+m[2]}`],
    [/^(.+) · 눌러서 편집$/, (m) => `${m[1]} · tap to edit`],
    [/^합계 ([\d.]+)%$/, (m) => `Total ${m[1]}%`],
    [/^순증 (.+)$/, (m) => `Net ${m[1]}`],
    [/^하루 (.+)$/, (m) => `${m[1]}/day`],
    [/^저축률 ([\d.]+)% · (.+)$/, (m) => `Savings ${m[1]}% · ${trEn(m[2]) || m[2]}`],
    [/^이번 달 ([\d.]+)%$/, (m) => `This month ${m[1]}%`],
    [/^월 합계$/, () => "Monthly total"],
    [/^([\d.]+)시간 · OT ([\d.]+)h · (\d+)일 근무$/, (m) => `${m[1]}h · OT ${m[2]}h · ${m[3]} days`],
    [/^([\d.]+)시간 · (\d+)일 근무$/, (m) => `${m[1]}h · ${m[2]} days`],
    [/^([\d.]+)시간 · OT ([\d.]+)h · 시급 (.+)$/, (m) => `${m[1]}h · OT ${m[2]}h · ${m[3]}/h`],
    [/^([\d.]+)시간 · 시급 (.+)$/, (m) => `${m[1]}h · ${m[2]}/h`],
    [/^(\d+)개 근무 저장$/, (m) => `Save ${m[1]} entries`],
    [/^매달 (\d+)일 · (.+)$/, (m) => `Day ${m[1]} monthly · ${trEn(m[2]) || m[2]}`],
    [/^시급 (.+) 기준 · (.+)$/, (m) => `Rate ${m[1]} · ${m[2]}`],
    [/^시급 \((\w+)\)$/, (m) => `Hourly rate (${m[1]})`],
    [/^· 연 (.+)$/, (m) => `· ${m[1]}/yr`],
    [/^(.+) · 연 (.+)$/, (m) => `${trEn(m[1]) || m[1]} · ${m[2]}/yr`],
    [/^자산 (.+) − 부채 (.+)$/, (m) => `Assets ${m[1]} − Debts ${m[2]}`],
    [/^월 (.+) · 약 (\d+)개월 뒤\((.+)\)$/, (m) => `${m[1]}/mo · ~${m[2]} months (${m[3]})`],
    [/^(\d+)개 근무 저장$/, (m) => `Save ${m[1]} entries`],
    [/^([\d.]+)시간$/, (m) => `${m[1]}h`],
    [/^예: (.+)$/, (m) => `e.g. ${m[1]}`],
  ];
  function trEn(k) { if (T[k] !== undefined) return T[k]; for (const [re, fn] of PAT) { const m = k.match(re); if (m) return fn(m); } return null; }
  function translateDOM(root) {
    if (VLANG !== "en" || !root) return;
    if (root.nodeType === 3) { const k = (root.nodeValue || "").trim(); const en = trEn(k); if (en != null && en !== k) root.nodeValue = root.nodeValue.replace(k, en); return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const arr = []; let n; while ((n = w.nextNode())) arr.push(n);
    arr.forEach((tn) => { const k = (tn.nodeValue || "").trim(); if (!k) return; const en = trEn(k); if (en != null && en !== k) tn.nodeValue = tn.nodeValue.replace(k, en); });
    root.querySelectorAll("[placeholder]").forEach((el) => { const en = trEn(el.getAttribute("placeholder")); if (en != null) el.setAttribute("placeholder", en); });
  }
  function startI18n() {
    document.documentElement.setAttribute("lang", VLANG);
    const mo = new MutationObserver((muts) => { if (VLANG !== "en") return; for (const m of muts) m.addedNodes.forEach((nd) => translateDOM(nd)); });
    mo.observe(document.body, { childList: true, subtree: true });
    translateDOM(document.body);
  }

  /* ---- 테마 (라이트/다크) ---- */
  function getTheme() { try { return localStorage.getItem("vault-theme") || "light"; } catch (e) { return "light"; } }
  function setTheme(t) {
    try { localStorage.setItem("vault-theme", t); } catch (e) {}
    document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute("content", t === "dark" ? "#0c0c0e" : "#eff0f2");
  }
  /* ---- 잔액 숨기기 ---- */
  function balanceHidden() { try { return localStorage.getItem("vault-hide-bal") === "1"; } catch (e) { return false; } }
  function toggleBalanceHidden() { try { localStorage.setItem("vault-hide-bal", balanceHidden() ? "0" : "1"); } catch (e) {} }
  const hideMoney = (n) => (balanceHidden() ? "••••" : money(n));

  /* ---- 웹 푸시 알림 ---- */
  function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function urlB64ToUint8(b64) { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(s); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
  async function currentPushSub() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; } }
  async function enablePush() {
    if (!pushSupported()) return { error: "이 기기는 푸시를 지원하지 않아요. (iPhone은 홈 화면에 설치한 앱에서만 가능)" };
    let perm = Notification.permission; if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return { error: "알림 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요." };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(window.VAULT_CONFIG.VAPID_PUBLIC_KEY) });
    const { error } = await sb.from("push_subscriptions").upsert({ user_id: S.user.id, subscription: sub.toJSON() }, { onConflict: "user_id,endpoint" });
    if (error) return { error: "저장 실패: " + error.message };
    return { ok: true };
  }
  async function disablePush() { const sub = await currentPushSub(); if (sub) { try { await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} } return { ok: true }; }
  async function sendTestPush() {
    try {
      const { data: { session } } = await sb.auth.getSession(); if (!session) return { error: "로그인이 필요해요." };
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, { method: "POST", headers: { "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "test" }) });
      return await r.json();
    } catch (e) { return { error: String((e && e.message) || e) }; }
  }

  let toastT;
  function toast(msg, isErr) {
    if (VLANG === "en") { const en = trEn(String(msg).trim()); if (en != null) msg = en; }
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
      // 기본 항목은 그룹만 코드 기준으로 보정, 이름·색은 사용자가 바꿨을 수 있으니 유지
      return d ? { ...b, group: b.group || d.group } : b;
    });
    // 정기 지출 이번 달분 자동 반영
    try { await applyRecurringExpenses(); } catch (e) {}
  }

  function profileState() {
    const funded = totalBucket("emergency") >= (Number(S.profile?.emergency_target) || 0) && (Number(S.profile?.emergency_target) || 0) > 0;
    return { hasHighInterestDebt: !!S.profile?.has_high_interest_debt, emergencyFunded: funded, savingForHome: !!S.profile?.saving_for_home };
  }

  // 고정 지출 항목 합계 (구독·통신 등)
  function recurringTotal(su) { return round(sum((su && su.recurring) || [], (x) => x.amount)); }

  // 저축률 → 경제적 자유까지 걸리는 대략 연수 (연 5% 실질수익, 25배 룰 기준)
  function yearsToFI(savePct) {
    const s = (Number(savePct) || 0) / 100;
    if (s <= 0) return null; if (s >= 1) return 0;
    const target = 25 * (1 - s); let nw = 0, y = 0;
    while (nw < target && y < 100) { nw = nw * 1.05 + s; y++; }
    return y >= 100 ? null : y;
  }

  // 온보딩 답변으로 "건강한" 맞춤 배분 계산 (50/30/20 + 재무 우선순위)
  function computeSetupBuckets(su) {
    const M = Number(su.monthlyIncome) || 0;
    if (M <= 0) return A.makeBuckets(profileState());
    const rent = Number(su.rent) || 0;                          // 주거 / 렌트
    const living = Number(su.food != null ? su.food : su.living) || 0; // 식비
    const carRun = su.hasCar ? (Number(su.carCost) || 0) : 0;
    const needs = rent + living + carRun;            // 필수 지출 (실제 고정비)
    const remaining = Math.max(0, M - needs);
    const hiDebt = !!(su.hasDebt && su.debtHighInterest);
    const funded = (Number(su.emergencyCurrent) || 0) >= (Number(su.emergencyTarget) || 0) && (Number(su.emergencyTarget) || 0) > 0;

    // 남는 돈을 저축·투자 vs 여유(하고싶은거)로 분배. 저축 최소 20% 확보, 빚 있으면 여유 축소.
    const saveFloor = 0.20 * M;
    const wantsCap = hiDebt ? 0.15 * M : 0.30 * M;
    let savings = 0, wants = 0;
    if (remaining > 0) {
      if (remaining >= saveFloor + 0.05 * M) {
        savings = saveFloor;
        const extra = remaining - saveFloor;
        wants = Math.min(extra, wantsCap);
        savings += extra - wants;                    // 남는 건 저축으로 (부의 축적)
      } else {                                       // 빠듯하면 저축 우선(60%)
        savings = remaining * 0.6; wants = remaining * 0.4;
      }
    }

    // 저축 내부 우선순위 (스타터 비상금 → 고금리 빚 → 투자 → 차)
    const sw = { debt: 0, emergency: 0, invest: 0, car: 0 };
    if (hiDebt && !funded) { sw.debt = 0.5; sw.emergency = 0.2; sw.invest = 0.3; }
    else if (hiDebt) { sw.debt = 0.6; sw.invest = 0.4; }
    else if (!funded) { sw.emergency = 0.45; sw.invest = 0.55; }
    else { sw.invest = 0.9; sw.emergency = 0.1; }
    if (su.savingForCar) { sw.car = 0.2; }
    const swt = (sw.debt + sw.emergency + sw.invest + sw.car) || 1;
    Object.keys(sw).forEach((k) => (sw[k] = sw[k] / swt));

    const amt = { rent, food: living + carRun, fun: wants,
      debt: savings * sw.debt, emergency: savings * sw.emergency, invest: savings * sw.invest, car: savings * sw.car };
    const pct = {};
    ["rent", "food", "debt", "emergency", "invest", "car", "fun"].forEach((k) => (pct[k] = (amt[k] / M) * 100));
    return A.makeBuckets(null, A.normalizePercents(pct));
  }

  // 버킷을 필수/여유/저축으로 묶은 % 합계
  function groupPct(buckets) {
    const g = { needs: 0, wants: 0, save: 0 };
    (buckets || []).forEach((b) => { g[bucketGroup(b)] += Number(b.percent) || 0; });
    return { needs: Math.round(g.needs * 10) / 10, wants: Math.round(g.wants * 10) / 10, save: Math.round(g.save * 10) / 10 };
  }
  function saveVerdict(save) {
    if (save >= 20) return { txt: "훌륭해요", cls: "ok", color: "var(--pos)" };
    if (save >= 10) return { txt: "보통", cls: "", color: "var(--amber)" };
    return { txt: "낮아요", cls: "bad", color: "var(--neg)" };
  }
  function bucketGroup(b) { return b.group || (A.BUCKET_MAP[b.key] || {}).group || "save"; }

  /* ---- 배분 항목 편집기 (추가·삭제·이름·비율) ---- */
  const BE_COLORS = ["#e08a5b", "#e6b54a", "#b0555f", "#6fa8a0", "#5e7cb0", "#9887c7", "#db8cab", "#7ba05b", "#c77c48", "#4c8c7d", "#b08bb0", "#5a8fb0"];
  const BE_GROUPS = [["needs", "필수"], ["wants", "여유"], ["save", "저축"]];
  const beTotal = (arr) => Math.round(arr.reduce((s, b) => s + (Number(b.percent) || 0), 0) * 10) / 10;
  function renderBucketEditor(mountId) {
    const el = document.getElementById(mountId); if (!el) return;
    const arr = S._editBuckets; const tot = beTotal(arr);
    const gLabel = { needs: "필수", wants: "여유", save: "저축" };
    el.innerHTML = `
      <div class="card-h"><h2>배분 항목 편집</h2><span id="beTot" class="total-pill ${tot === 100 ? "ok" : "bad"}">합계 ${tot}%</span></div>
      <p class="sub" style="margin:0 0 14px">항목을 추가·삭제하고, 이름과 비율을 직접 정하세요. 합계 100%가 되면 저장됩니다.</p>
      <div id="beList">
        ${arr.map((b, i) => `
          <div class="be-item">
            <div class="be-top">
              <span class="dot" style="background:${b.color}"></span>
              <input class="be-name" data-bename="${i}" value="${esc(b.label)}" placeholder="항목 이름">
              <span class="be-grp">${gLabel[bucketGroup(b)]}</span>
              <span class="val" data-bev="${i}">${b.percent}%</span>
              <button class="del" data-bedel="${i}">${icon("close", 15)}</button>
            </div>
            <input type="range" min="0" max="100" step="1" value="${b.percent}" data-be="${i}" style="width:100%">
          </div>`).join("")}
      </div>
      <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--line)">
        <div class="row2" style="align-items:flex-end">
          <div class="field" style="margin-bottom:8px"><label>새 항목 이름</label><input id="beName" class="input" placeholder="예: 여행 저축"></div>
          <div class="field" style="margin-bottom:8px;max-width:88px"><label>비율 %</label><input id="bePct" class="input" type="number" inputmode="decimal" placeholder="0"></div>
        </div>
        <div class="field" style="margin-bottom:8px"><label>분류</label><div class="chips" id="beGroup">${BE_GROUPS.map((g, i) => `<div class="chip ${i === 2 ? "on" : ""}" data-g="${g[0]}">${g[1]}</div>`).join("")}</div></div>
        <button id="beAdd" class="btn ghost sm" style="width:100%">${icon("plus", 16)} 항목 추가</button>
      </div>
      <button id="beSave" class="btn" style="margin-top:14px">배분 저장</button>`;

    el.querySelectorAll("input[data-be]").forEach((s) => (s.oninput = () => {
      const i = +s.dataset.be; arr[i].percent = Number(s.value);
      el.querySelector(`[data-bev="${i}"]`).textContent = s.value + "%";
      const t = beTotal(arr), p = el.querySelector("#beTot"); p.textContent = "합계 " + t + "%"; p.className = "total-pill " + (t === 100 ? "ok" : "bad");
    }));
    el.querySelectorAll("[data-bename]").forEach((n) => (n.oninput = () => { arr[+n.dataset.bename].label = n.value; }));
    el.querySelectorAll("[data-bedel]").forEach((b) => (b.onclick = () => { arr.splice(+b.dataset.bedel, 1); renderBucketEditor(mountId); }));
    let grp = "save";
    el.querySelectorAll("#beGroup .chip").forEach((c) => (c.onclick = () => { grp = c.dataset.g; el.querySelectorAll("#beGroup .chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    el.querySelector("#beAdd").onclick = () => {
      const name = el.querySelector("#beName").value.trim(); const pct = Number(el.querySelector("#bePct").value) || 0;
      if (!name) return toast("항목 이름을 입력하세요.", true);
      arr.push({ key: "c" + Date.now(), label: name, color: BE_COLORS[arr.length % BE_COLORS.length], percent: pct, group: grp });
      renderBucketEditor(mountId);
    };
    el.querySelector("#beSave").onclick = async () => {
      const t = beTotal(arr);
      if (t !== 100) return toast(`합계가 100%여야 해요 (현재 ${t}%)`, true);
      if (!arr.length) return toast("항목이 최소 하나는 있어야 해요.", true);
      await saveProfile({ buckets: arr.map((b) => ({ ...b, percent: Number(b.percent) || 0 })) });
      toast("배분 저장 ✓"); renderSettings();
    };
  }

  /* ---- 고정 지출(구독·통신 등) 관리 컴포넌트 ---- */
  const RECUR_CATS = ["구독", "통신", "보험", "교통", "공과금", "멤버십", "기타"];
  function recurringListHTML(arr) {
    if (!arr.length) return `<div class="empty" style="padding:14px 0">아직 없어요. 핸드폰·넷플릭스·유튜브처럼<br>매달 자동으로 나가는 걸 하나씩 추가하세요.</div>`;
    const monthly = round(sum(arr, (x) => x.amount));
    return arr.map((x) => `<div class="item">
        <div class="ic">${icon("receipt", 18)}</div>
        <div class="mid"><div class="t1">${esc(x.name)}</div><div class="t2">${esc(x.cat || "고정")} · 연 ${money0((Number(x.amount) || 0) * 12)}</div></div>
        <div class="amt">${money(x.amount)}</div>
        <button class="del" data-rid="${x.id}">${icon("close", 16)}</button>
      </div>`).join("") +
      `<div class="bgroup" style="margin-top:8px"><span class="gt">월 합계</span><span style="color:var(--ink)">${money(monthly)} <span style="color:var(--ink-3);font-weight:600">· 연 ${money0(monthly * 12)}</span></span></div>`;
  }
  function renderRecurringManager(mountId, arr, onChange) {
    const el = document.getElementById(mountId); if (!el) return;
    let cat = RECUR_CATS[0];
    el.innerHTML = `
      <div class="row2" style="align-items:flex-end">
        <div class="field" style="margin-bottom:8px"><label>이름</label><input id="rcName" class="input" placeholder="예: 넷플릭스"></div>
        <div class="field" style="margin-bottom:8px;max-width:130px"><label>월 금액</label><input id="rcAmt" class="input" type="number" inputmode="decimal" placeholder="15.99"></div>
      </div>
      <div class="chips" id="rcCats" style="margin-bottom:10px">${RECUR_CATS.map((c, i) => `<div class="chip ${i === 0 ? "on" : ""}" data-c="${c}">${c}</div>`).join("")}</div>
      <button id="rcAdd" class="btn ghost sm" style="width:100%">${icon("plus", 16)} 고정 지출 추가</button>
      <div id="rcList" style="margin-top:6px">${recurringListHTML(arr)}</div>`;
    el.querySelectorAll("#rcCats .chip").forEach((c) => (c.onclick = () => { cat = c.dataset.c; el.querySelectorAll("#rcCats .chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    el.querySelector("#rcAdd").onclick = () => {
      const name = el.querySelector("#rcName").value.trim(); const amt = Number(el.querySelector("#rcAmt").value);
      if (!name || !amt || amt <= 0) return toast("이름과 월 금액을 입력하세요.", true);
      arr.push({ id: "r" + Date.now(), name, amount: round(amt), cat });
      if (onChange) onChange();
      renderRecurringManager(mountId, arr, onChange);
    };
    el.querySelectorAll("[data-rid]").forEach((b) => (b.onclick = () => {
      const i = arr.findIndex((x) => x.id === b.dataset.rid); if (i >= 0) arr.splice(i, 1);
      if (onChange) onChange();
      renderRecurringManager(mountId, arr, onChange);
    }));
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
    const isReset = authMode === "reset";
    app.innerHTML = `
      <div class="auth fadein">
        <div class="logo-lg">${icon("mark", 34)}</div>
        <h1>VAULT</h1>
        <div class="tag">${isReset ? "비밀번호 재설정" : "스마트 자산 관리 · BC Canada"}</div>
        <div id="authErr"></div>
        ${authMode === "signup" ? `<div class="field"><label>이름 (표시용)</label><input id="dn" class="input" placeholder="${VLANG==="en"?"e.g. Alex":"준서"}" autocomplete="name"></div>` : ""}
        <div class="field"><label>이메일</label><input id="em" class="input" type="email" placeholder="you@email.com" autocomplete="email" inputmode="email"></div>
        ${isReset ? "" : `<div class="field"><label>비밀번호</label><input id="pw" class="input" type="password" placeholder="6자 이상" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}"></div>`}
        <button id="authBtn" class="btn">${isReset ? "재설정 링크 보내기" : (authMode === "signup" ? "가입하고 시작" : "로그인")}</button>
        ${isReset
          ? `<div class="linkline"><a id="backLogin">로그인으로 돌아가기</a></div>`
          : `<div class="swap">${authMode === "signup" ? "이미 계정이 있나요? <a id='swap'>로그인</a>" : "처음이신가요? <a id='swap'>새 계정 만들기</a>"}</div>
             ${authMode === "login" ? `<div class="linkline"><a id="forgot">비밀번호를 잊으셨나요?</a></div>` : ""}`}
      </div>`;
    const swap = $("#swap"); if (swap) swap.onclick = () => { authMode = authMode === "login" ? "signup" : "login"; renderAuth(); };
    const forgot = $("#forgot"); if (forgot) forgot.onclick = () => { authMode = "reset"; renderAuth(); };
    const back = $("#backLogin"); if (back) back.onclick = () => { authMode = "login"; renderAuth(); };
    $("#authBtn").onclick = isReset ? doReset : doAuth;
    [$("#em"), $("#pw"), $("#dn")].forEach((el) => el && (el.onkeydown = (e) => { if (e.key === "Enter") $("#authBtn").click(); }));
  }
  function authErr(msg) { const e = $("#authErr"); if (e) e.innerHTML = msg ? `<div class="err">${esc(msg)}</div>` : ""; }

  async function doReset() {
    const email = $("#em").value.trim(); authErr("");
    if (!email) return authErr("이메일을 입력하세요.");
    const btn = $("#authBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    const redirect = location.origin + location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    btn.disabled = false; btn.textContent = "재설정 링크 보내기";
    if (error) return authErr(translateAuthErr(error.message));
    $("#authErr").innerHTML = `<div class="note">${esc(email)} 로 재설정 링크를 보냈어요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있습니다.</div>`;
  }

  function renderNewPassword() {
    tabbar.classList.add("hidden");
    app.innerHTML = `
      <div class="auth fadein">
        <div class="logo-lg">${icon("mark", 34)}</div>
        <h1>새 비밀번호</h1>
        <div class="tag">새로 쓸 비밀번호를 정해주세요</div>
        <div id="authErr"></div>
        <div class="field"><label>새 비밀번호</label><input id="np" class="input" type="password" placeholder="6자 이상" autocomplete="new-password"></div>
        <button id="npBtn" class="btn">비밀번호 변경</button>
      </div>`;
    $("#npBtn").onclick = async () => {
      const p = $("#np").value; authErr("");
      if (!p || p.length < 6) return authErr("비밀번호는 6자 이상이어야 해요.");
      const btn = $("#npBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) { btn.disabled = false; btn.textContent = "비밀번호 변경"; return authErr(translateAuthErr(error.message)); }
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      const { data: { session } } = await sb.auth.getSession();
      toast("비밀번호가 바뀌었어요 ✓");
      if (session) await enter(session.user); else renderAuth();
    };
    $("#np").onkeydown = (e) => { if (e.key === "Enter") $("#npBtn").click(); };
  }

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
          const { data: d2, error: e2 } = await sb.auth.signInWithPassword({ email, password: pw });
          if (e2 || !d2.session) {
            // 확인 메일 필요 → 친절한 안내
            authMode = "login"; renderAuth();
            $("#authErr").innerHTML = `<div class="note">✅ 가입 완료! <b>${esc(email)}</b> 로 확인 메일을 보냈어요.<br>메일의 링크를 누르면 로그인됩니다. (스팸함도 확인해 주세요)</div>`;
            const em = $("#em"); if (em) em.value = email;
            return;
          }
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

  /* ================= 순자산 (자산 − 부채) ================= */
  function accountsList() { return (S.profile.setup && Array.isArray(S.profile.setup.accounts)) ? S.profile.setup.accounts : []; }
  function hasAccounts() { return accountsList().length > 0; }
  function netWorth() {
    const a = accountsList();
    const assets = sum(a.filter((x) => x.type !== "debt"), (x) => x.balance);
    const debts = sum(a.filter((x) => x.type === "debt"), (x) => x.balance);
    return { assets: round(assets), debts: round(debts), net: round(assets - debts) };
  }
  // 이번 달 순자산 스냅샷 기록 (바뀌었을 때만 저장)
  function recordNwSnapshot() {
    if (!hasAccounts()) return;
    const su = S.profile.setup; if (!Array.isArray(su.nwHistory)) su.nwHistory = [];
    const mk = nowMonth(), nv = netWorth().net; const ex = su.nwHistory.find((h) => h.m === mk);
    if (ex) { if (ex.v !== nv) { ex.v = nv; saveProfile({ setup: su }); } }
    else { su.nwHistory.push({ m: mk, v: nv }); su.nwHistory = su.nwHistory.slice(-24); saveProfile({ setup: su }); }
  }

  // 목표 도달 예측: 남은 금액 / 월 적립액 → 개월 수, 도달 월
  function plannedMonthly(bucketKey) {
    const b = (S.profile.buckets || []).find((x) => x.key === bucketKey);
    const M = Number((S.profile.setup || {}).monthlyIncome) || 0;
    if (!b || M <= 0) return 0;
    return round((Number(b.percent) || 0) / 100 * M);
  }
  function projectMonths(remaining, monthly) { if (monthly <= 0 || remaining <= 0) return null; return Math.ceil(remaining / monthly); }
  function futureMonthLabel(n) { const d = new Date(); const t = new Date(d.getFullYear(), d.getMonth() + n, 1); return VLANG === "en" ? `${EN_MON[t.getMonth() + 1]} ${t.getFullYear()}` : `${t.getFullYear()}년 ${t.getMonth() + 1}월`; }

  const ACC_TYPES = [["asset", "자산"], ["debt", "부채"]];
  const ACC_CATS = ["현금·체킹", "저축", "투자·주식", "TFSA/RRSP", "부동산", "차", "신용카드", "대출", "기타"];
  function renderAccountsManager(mountId, onChange) {
    const el = document.getElementById(mountId); if (!el) return;
    const arr = (S.profile.setup.accounts = accountsList());
    let type = "asset", cat = ACC_CATS[0];
    const assets = arr.filter((x) => x.type !== "debt"), debts = arr.filter((x) => x.type === "debt");
    const rowsHtml = (list, isDebt) => list.length ? list.map((x) => `
      <div class="item">
        <div class="ic ${isDebt ? "out" : "in"}">${icon(isDebt ? "outflow" : "coin", 18)}</div>
        <div class="mid"><div class="t1">${esc(x.name)}</div><div class="t2">${esc(x.cat || (isDebt ? "부채" : "자산"))}</div></div>
        <div class="amt ${isDebt ? "neg" : ""}">${isDebt ? "-" : ""}${money(x.balance)}</div>
        <button class="del" data-adel="${x.id}">${icon("close", 16)}</button>
      </div>`).join("") : `<div class="empty" style="padding:12px 0">없음</div>`;
    el.innerHTML = `
      <div class="bgroup"><span class="gt">자산</span><span style="color:var(--pos)">${money(netWorth().assets)}</span></div>
      ${rowsHtml(assets, false)}
      <div class="bgroup"><span class="gt">부채</span><span style="color:var(--neg)">${money(netWorth().debts)}</span></div>
      ${rowsHtml(debts, true)}
      <div style="margin-top:14px;padding-top:16px;border-top:1px solid var(--line)">
        <div class="chips" id="acType" style="margin-bottom:10px">${ACC_TYPES.map((t, i) => `<div class="chip ${i === 0 ? "on" : ""}" data-t="${t[0]}">${t[1]}</div>`).join("")}</div>
        <div class="row2" style="align-items:flex-end">
          <div class="field" style="margin-bottom:8px"><label>이름</label><input id="acName" class="input" placeholder="예: 체킹 계좌"></div>
          <div class="field" style="margin-bottom:8px;max-width:130px"><label>잔액</label><input id="acBal" class="input" type="number" inputmode="decimal" placeholder="0"></div>
        </div>
        <div class="field" style="margin-bottom:8px"><label>분류</label><select id="acCat" class="input">${ACC_CATS.map((c) => `<option>${c}</option>`).join("")}</select></div>
        <button id="acAdd" class="btn ghost sm" style="width:100%">${icon("plus", 16)} 추가</button>
      </div>`;
    el.querySelectorAll("#acType .chip").forEach((c) => (c.onclick = () => { type = c.dataset.t; el.querySelectorAll("#acType .chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    el.querySelector("#acCat").onchange = (e) => (cat = e.target.value);
    el.querySelector("#acAdd").onclick = () => {
      const name = el.querySelector("#acName").value.trim(); const bal = Number(el.querySelector("#acBal").value);
      if (!name || !bal || bal <= 0) return toast("이름과 잔액을 입력하세요.", true);
      arr.push({ id: "a" + Date.now(), name, type, cat: el.querySelector("#acCat").value, balance: round(bal) });
      if (onChange) onChange(); else renderAccountsManager(mountId, onChange);
    };
    el.querySelectorAll("[data-adel]").forEach((b) => (b.onclick = () => {
      const i = arr.findIndex((x) => x.id === b.dataset.adel); if (i >= 0) arr.splice(i, 1);
      if (onChange) onChange(); else renderAccountsManager(mountId, onChange);
    }));
  }

  /* ---- 정기 지출 자동 반영 ---- */
  async function applyRecurringExpenses() {
    const recs = (S.profile.setup && Array.isArray(S.profile.setup.recurringExpenses)) ? S.profile.setup.recurringExpenses : [];
    if (!recs.length || !S.user) return;
    const mk = nowMonth(), today = new Date().getDate();
    const toInsert = [];
    for (const r of recs) {
      const day = Math.min(28, Math.max(1, Number(r.day) || 1));
      if (today < day) continue;
      const tag = `[정기]#${r.id}`;
      if (S.expenses.some((e) => monthKey(e.expense_date) === mk && (e.note || "").indexOf(tag) !== -1)) continue;
      toInsert.push({ user_id: S.user.id, expense_date: `${mk}-${String(day).padStart(2, "0")}`, amount: round(r.amount), category: r.name, note: tag });
    }
    if (!toInsert.length) return;
    const { data, error } = await sb.from("expenses").insert(toInsert).select();
    if (!error && data) { S.expenses = data.concat(S.expenses); }
  }
  function renderRecurringExpManager(mountId, onChange) {
    const el = document.getElementById(mountId); if (!el) return;
    if (!S.profile.setup) S.profile.setup = {};
    if (!Array.isArray(S.profile.setup.recurringExpenses)) S.profile.setup.recurringExpenses = [];
    const arr = S.profile.setup.recurringExpenses, monthly = round(sum(arr, (x) => x.amount));
    el.innerHTML = `
      ${arr.length ? arr.map((x) => `<div class="item"><div class="ic out">${icon("receipt", 18)}</div><div class="mid"><div class="t1">${esc(x.name)}</div><div class="t2">매달 ${x.day}일 · ${esc(x.category || "")}</div></div><div class="amt">${money(x.amount)}</div><button class="del" data-redel="${x.id}">${icon("close", 16)}</button></div>`).join("") : `<div class="empty" style="padding:12px 0">넷플릭스·핸드폰처럼 매달 같은 날 빠지는 걸 넣으면<br>자동으로 지출에 기록돼요.</div>`}
      ${arr.length ? `<div class="bgroup" style="margin-top:8px"><span class="gt">월 합계</span><span style="color:var(--ink)">${money(monthly)} <span style="color:var(--ink-3);font-weight:600">· 연 ${money0(monthly * 12)}</span></span></div>` : ""}
      <div style="margin-top:12px;padding-top:14px;border-top:1px solid var(--line)">
        <div class="row2" style="align-items:flex-end">
          <div class="field" style="margin-bottom:8px"><label>이름</label><input id="reName" class="input" placeholder="예: 넷플릭스"></div>
          <div class="field" style="margin-bottom:8px;max-width:96px"><label>금액</label><input id="reAmt" class="input" type="number" inputmode="decimal" placeholder="16.99"></div>
        </div>
        <div class="row2" style="align-items:flex-end">
          <div class="field" style="margin-bottom:8px;max-width:120px"><label>매달 며칠</label><input id="reDay" class="input" type="number" inputmode="numeric" placeholder="1"></div>
          <div class="field" style="margin-bottom:8px"><label>분류</label><select id="reCat" class="input">${EXP_CATS.map((c) => `<option>${c}</option>`).join("")}</select></div>
        </div>
        <button id="reAdd" class="btn ghost sm" style="width:100%">${icon("plus", 16)} 정기 지출 추가</button>
      </div>`;
    el.querySelector("#reAdd").onclick = async () => {
      const name = el.querySelector("#reName").value.trim(), amt = Number(el.querySelector("#reAmt").value);
      const day = Math.min(28, Math.max(1, Number(el.querySelector("#reDay").value) || 1));
      if (!name || !amt || amt <= 0) return toast("이름과 금액을 입력하세요.", true);
      arr.push({ id: "re" + Date.now(), name, amount: round(amt), day, category: el.querySelector("#reCat").value });
      await saveProfile({ setup: S.profile.setup }); await applyRecurringExpenses();
      toast("정기 지출 추가 ✓ (오늘 날짜 지났으면 이번 달 지출에 기록됨)");
      if (onChange) onChange(); renderRecurringExpManager(mountId, onChange);
    };
    el.querySelectorAll("[data-redel]").forEach((b) => (b.onclick = async () => {
      const i = arr.findIndex((x) => x.id === b.dataset.redel); if (i >= 0) arr.splice(i, 1);
      await saveProfile({ setup: S.profile.setup }); renderRecurringExpManager(mountId, onChange);
    }));
  }

  function renderNetWorth() {
    tabbar.classList.remove("hidden");
    if (!S.profile.setup) S.profile.setup = {};
    const nw = netWorth();
    app.innerHTML = `
      <div class="screen fadein">
        <div class="apphead">
          <button class="hbtn" id="nwBack">${icon("chevR", 20)}</button>
          <div class="htitle">순자산</div>
          <div style="width:40px"></div>
        </div>
        <div class="nw">
          <div class="nw-big">${hideMoney(nw.net)} <span class="nw-eye" id="nwEye">${icon(balanceHidden() ? "eyeoff" : "eye")}</span></div>
          <div class="nw-sub">자산 ${money0(nw.assets)} − 부채 ${money0(nw.debts)}</div>
        </div>
        ${(() => { const h = (S.profile.setup.nwHistory || []); return h.length >= 2 ? `<div class="card"><div class="card-h"><h2>순자산 추이</h2></div><div class="chart-wrap" style="height:150px"><canvas id="nwChart"></canvas></div></div>` : `<div class="card"><div class="hint" style="margin:0">계좌를 추가하면 매달 순자산이 자동 기록되어 우상향 그래프가 그려집니다.</div></div>`; })()}
        <div class="card">
          <div class="card-h"><h2>내 계좌 · 자산 / 부채</h2></div>
          <p class="sub" style="margin:0 0 14px">${VLANG === "en" ? "Add checking, savings & investment balances and debts to compute <b>net worth</b>." : "체킹·저축·투자 잔액과 빚을 넣으면 <b>순자산</b>이 계산됩니다."}</p>
          <div id="accMgr"></div>
        </div>
      </div>`;
    $("#nwBack").onclick = () => nav("dashboard");
    $("#nwEye").onclick = () => { toggleBalanceHidden(); renderNetWorth(); };
    renderAccountsManager("accMgr", async () => { recordNwSnapshot(); await saveProfile({ setup: S.profile.setup }); renderNetWorth(); });
    drawNwChart();
  }
  function drawNwChart() {
    const el = document.getElementById("nwChart"); if (!el || !window.Chart) return;
    if (S.nwChart) { S.nwChart.destroy(); S.nwChart = null; }
    const h = (S.profile.setup.nwHistory || []);
    if (h.length < 2) return;
    S.nwChart = new Chart(el, {
      type: "line",
      data: { labels: h.map((x) => Number(x.m.slice(5)) + "월"), datasets: [{ data: h.map((x) => x.v), borderColor: "#12a15f", backgroundColor: "rgba(18,161,95,.10)", borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: "#12a15f" }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw) } } }, scales: { y: { ticks: { callback: (v) => "$" + v, font: { size: 10 } }, grid: { color: "rgba(125,125,125,.12)" } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } },
    });
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
      monthlyIncome: s.monthlyIncome || "", rent: s.rent || "", food: (s.food != null ? s.food : s.living) || "",
      recurring: Array.isArray(s.recurring) ? s.recurring.map((x) => ({ ...x })) : [],
      hasCar: !!s.hasCar, carCost: s.carCost || "", savingForCar: !!s.savingForCar, carGoal: s.carGoal || "",
      hasDebt: s.hasDebt != null ? !!s.hasDebt : !!p.has_high_interest_debt, debtBalance: s.debtBalance || "", debtHighInterest: s.debtHighInterest != null ? !!s.debtHighInterest : true,
      emergencyCurrent: s.emergencyCurrent || "", emergencyTarget: (p.emergency_target || s.emergencyTarget || ""),
      savingForHome: s.savingForHome != null ? !!s.savingForHome : !!p.saving_for_home,
    };
    obStep = 0; renderOnboarding();
  }

  function collectStep() {
    const g = (id) => { const e = $("#" + id); return e ? e.value : undefined; };
    const map = { ob_name: "name", ob_prov: "province", ob_wage: "wage", ob_income: "monthlyIncome", ob_rent: "rent", ob_food: "food", ob_carCost: "carCost", ob_carGoal: "carGoal", ob_debtBal: "debtBalance", ob_emCur: "emergencyCurrent", ob_emTgt: "emergencyTarget" };
    Object.entries(map).forEach(([id, key]) => { const v = g(id); if (v !== undefined) ob[key] = v; });
    const cur = $("#ob_cur"); if (cur) ob.currency = cur.value;
  }

  function renderOnboarding() {
    tabbar.classList.add("hidden");
    const total = OB_STEPS.length, pct = Math.round(((obStep + 1) / total) * 100);
    const cur = ob.currency;
    let body = "";
    if (obStep === 0) {
      body = `<h1>환영합니다 👋</h1><p class="sub">${VLANG==="en"?`Just a few questions and we'll build <b>a budget that fits you</b> automatically — takes about a minute.`:`몇 가지만 알려주시면 <b>딱 맞는 돈 배분</b>을 자동으로 짜드릴게요. 1분이면 됩니다.`}</p>
        <div class="card">
          <div class="field"><label>이름</label><input id="ob_name" class="input" value="${esc(ob.name)}" placeholder="${VLANG==="en"?"e.g. Alex":"준서"}"></div>
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
          <div class="field" style="margin-top:12px"><label>${VLANG==="en"?`Usual monthly take-home (approx, ${cur})`:`보통 한 달 실수령 (대략, ${cur})`}</label><input id="ob_income" class="input" type="number" inputmode="decimal" value="${ob.monthlyIncome}" placeholder="예: 3000"><div class="hint">변동이 크면 평균으로 적어주세요.</div></div>
        </div>`;
    } else if (obStep === 2) {
      body = `<h1>고정 지출</h1><p class="sub">${VLANG==="en"?`Roughly fixed each month. You can add details later in <b>Settings → Edit allocation</b>.`:`매달 거의 정해진 돈이에요. 세부 항목은 나중에 <b>설정 → 배분 항목 편집</b>에서 자유롭게 추가할 수 있어요.`}</p>
        <div class="card">
          <div class="field"><label>${VLANG==="en"?`Rent / mortgage (monthly, ${cur})`:`렌트 / 모기지 (월, ${cur})`}</label><input id="ob_rent" class="input" type="number" inputmode="decimal" value="${ob.rent}" placeholder="${VLANG==="en"?"0 if living with family":"가족과 살면 0"}"></div>
          <div class="field"><label>${VLANG==="en"?`Food (monthly, ${cur})`:`식비 (월, ${cur})`}</label><input id="ob_food" class="input" type="number" inputmode="decimal" value="${ob.food}" placeholder="예: 400"><div class="hint">장보기·외식 등 먹는 데 쓰는 돈.</div></div>
        </div>`;
    } else if (obStep === 3) {
      body = `<h1>자동차 🚗</h1>
        <div class="card">
          <label class="switch"><div><div class="sl">차가 있어요</div><div class="sd">기름값·보험 등 유지비가 나가요</div></div><div id="ob_hasCar" class="tog ${ob.hasCar ? "on" : ""}"></div></label>
          ${ob.hasCar ? `<div class="field" style="margin-top:10px"><label>${VLANG==="en"?"Car upkeep (monthly) — gas + insurance":"차 유지비 (월) — 기름값+보험"}</label><input id="ob_carCost" class="input" type="number" inputmode="decimal" value="${ob.carCost}" placeholder="예: 300"><div class="hint">고정 지출에 포함해 계산합니다.</div></div>` : `
          <label class="switch"><div><div class="sl">차 살 계획이 있어요</div><div class="sd">차 살 돈을 매달 모아요</div></div><div id="ob_buyCar" class="tog ${ob.savingForCar ? "on" : ""}"></div></label>
          ${ob.savingForCar ? `<div class="field" style="margin-top:10px"><label>${VLANG==="en"?`Target amount (${cur})`:`목표 금액 (${cur})`}</label><input id="ob_carGoal" class="input" type="number" inputmode="decimal" value="${ob.carGoal}" placeholder="예: 10000"></div>` : ""}`}
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
          <div class="field"><label>${VLANG==="en"?`Emergency fund saved so far (${cur})`:`지금 모아둔 비상금 (${cur})`}</label><input id="ob_emCur" class="input" type="number" inputmode="decimal" value="${ob.emergencyCurrent}" placeholder="예: 1000"></div>
          <div class="field"><label>${VLANG==="en"?`Target amount (${cur})`:`목표 금액 (${cur})`}</label><input id="ob_emTgt" class="input" type="number" inputmode="decimal" value="${ob.emergencyTarget}" placeholder="${suggest ? (VLANG==="en"?"Suggested "+suggest:"추천 "+suggest) : (VLANG==="en"?"e.g. 5000":"예: 5000")}"><div class="hint">${VLANG==="en"?`Usually 3–6 months of living costs${suggest ? ` (3 months ≈ ${money0(suggest)})` : ""}.`:`보통 생활비 3~6개월치${suggest ? ` (3개월 ≈ ${money0(suggest)})` : ""}.`}</div></div>
        </div>`;
    } else {
      collectStep();
      const M = Number(ob.monthlyIncome) || 0;
      const fixed = Number(ob.rent) || 0;
      const ess = fixed + (Number(ob.food) || 0) + (ob.hasCar ? (Number(ob.carCost) || 0) : 0);
      const D = Math.round((M - ess) * 100) / 100;
      const bks = computeSetupBuckets(ob);
      const gp = groupPct(bks), sv = saveVerdict(gp.save);
      const preview = bks.filter((b) => b.percent > 0).map((b) => `
        <div class="bucket"><span class="dot" style="background:${b.color}"></span><span class="nm">${esc(b.label)}</span><span class="pc">${b.percent}%</span><span class="am">${M ? money0(M * b.percent / 100) : ""}</span></div>`).join("");
      // 벤치마크 경고
      const en = VLANG === "en";
      const flags = [];
      if (M > 0) {
        const fixedP = fixed / M * 100, foodP = (Number(ob.food) || 0) / M * 100;
        if (fixedP > 35) flags.push(en ? `Fixed costs are ${Math.round(fixedP)}% of income (aim ≤35%). Review subscriptions.` : `고정비가 수입의 ${Math.round(fixedP)}%예요 (권장 35% 이하). 구독을 점검해 보세요.`);
        if (foodP > 15) flags.push(en ? `Food is ${Math.round(foodP)}% of income (aim 10–15%).` : `식비가 수입의 ${Math.round(foodP)}%예요 (권장 10~15%).`);
        if (gp.needs > 60) flags.push(en ? `Needs are ${gp.needs}% — high. Less room to save.` : `필수 지출이 ${gp.needs}%로 높아요. 저축 여력이 줄어듭니다.`);
      }
      const summary = M <= 0 ? `<div class="note">${en ? "Enter income to see your split." : "수입을 입력하면 맞춤 배분이 계산돼요."}</div>`
        : D < 0 ? `<div class="err">${en ? `Fixed costs (${money0(ess)}) exceed income (${money0(M)}). Trim costs or check your income.` : `고정 지출(${money0(ess)})이 수입(${money0(M)})보다 많아요. 지출을 줄이거나 수입을 확인해 주세요.`}</div>`
        : `<div class="split-bar"><i style="width:${gp.needs}%;background:var(--ink-3)"></i><i style="width:${gp.wants}%;background:#db8cab"></i><i style="width:${gp.save}%;background:var(--brand)"></i></div>
           <div class="split-legend"><div class="lg"><div class="n" style="--c:var(--ink-3)">${en ? "Needs" : "필수"}</div><div class="p">${gp.needs}%</div></div><div class="lg"><div class="n" style="--c:#db8cab">${en ? "Wants" : "여유"}</div><div class="p">${gp.wants}%</div></div><div class="lg"><div class="n" style="--c:var(--brand)">${en ? "Save" : "저축·투자"}</div><div class="p" style="color:var(--brand-d)">${gp.save}%</div></div></div>
           <div class="hint" style="margin-top:8px">${en ? `Of ${money0(M)}/mo, <b style="color:${sv.color}">${gp.save}% to save/invest</b> — ${trEn(sv.txt) || sv.txt}. (aim 20%+)` : `월 수입 ${money0(M)} 중 <b style="color:${sv.color}">${gp.save}%를 저축·투자</b> — ${sv.txt}. (권장 20%↑)`}</div>
           ${flags.map((f) => `<div class="note" style="margin-top:8px">💡 ${f}</div>`).join("")}`;
      body = `<h1>목표 & 요약</h1>
        <div class="card">
          <label class="switch" style="border:none;padding:6px 0"><div><div class="sl">집(첫 주택) 살 계획</div><div class="sd">캐나다 FHSA 우선 — 투자 방향 조정</div></div><div id="ob_home" class="tog ${ob.savingForHome ? "on" : ""}"></div></label>
        </div>
        <div class="card">
          <div class="card-h"><h2>내 배분 (50·30·20)</h2></div>
          ${summary}
          <div style="margin-top:12px">${preview}</div>
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
      rent: Number(ob.rent) || 0, food: Number(ob.food) || 0, recurring: ob.recurring || [],
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
  // 공용 헤더 버튼 위임 (테마/설정/순자산)
  app.addEventListener("click", (e) => {
    const ed = e.target.closest && e.target.closest("[data-edit]");
    if (ed) { const [type, id] = ed.dataset.edit.split(":"); openEdit(type, id); return; }
    const t = e.target.closest && e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "theme") { setTheme(getTheme() === "dark" ? "light" : "dark"); render(); }
    else if (a === "settings") nav("settings");
    else if (a === "networth") nav("networth");
    else if (["income", "goals", "work", "expenses", "dashboard"].includes(a)) nav(a);
  });

  function render() {
    if (!S.user || !S.profile) { renderAuth(); return; }
    tabbar.classList.remove("hidden");
    const v = S.view;
    if (v === "dashboard") renderDashboard();
    else if (v === "networth") renderNetWorth();
    else if (v === "goals") renderGoals();
    else if (v === "income") renderIncome();
    else if (v === "work") renderWork();
    else if (v === "expenses") renderExpenses();
    else if (v === "paystubs") renderPaystubs();
    else if (v === "settings") renderSettings();
  }

  function topbar() {
    const nm = S.profile?.display_name || "준서";
    return `<div class="apphead">
      <button class="hbtn" data-act="theme">${icon(getTheme() === "dark" ? "sun" : "moon", 20)}</button>
      <div class="htitle">VAULT</div>
      <button class="hbtn avatar" data-act="settings">${esc(nm.slice(0, 1))}</button></div>`;
  }

  /* ================= DASHBOARD ================= */
  /* ---- 대시보드 지표 헬퍼 ---- */
  function keyGroup(key) { const b = (S.profile.buckets || []).find((x) => x.key === key); return b ? bucketGroup(b) : (A.BUCKET_MAP[key] || {}).group; }
  const isSaveKey = (k) => keyGroup(k) === "save";
  function monthSaveAllocated(mk) {
    let s = 0;
    S.incomes.forEach((i) => { if (monthKey(i.income_date) === mk) (i.allocation || []).forEach((r) => { if (isSaveKey(r.key)) s += Number(r.amount) || 0; }); });
    return round(s);
  }
  function monthBudgetedIncome(mk) { return round(sum(S.incomes.filter((i) => monthKey(i.income_date) === mk && (i.allocation || []).length > 0), (i) => i.amount)); }
  function monthSavingsRate(mk) { const base = monthBudgetedIncome(mk); return base > 0 ? Math.round(monthSaveAllocated(mk) / base * 1000) / 10 : null; }
  function lastMonths(n) { const arr = [], d = new Date(); for (let k = n - 1; k >= 0; k--) { const dt = new Date(d.getFullYear(), d.getMonth() - k, 1); arr.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`); } return arr; }
  function daysLeftInMonth() { const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return Math.max(1, last - d.getDate() + 1); }
  function monthRemaining(mk = nowMonth()) {
    const inc = monthIncome(mk), saved = monthSaveAllocated(mk), spent = monthExpense(mk);
    const spendable = round(inc - saved);
    return { spendable, saved: round(saved), spent: round(spent), remaining: round(spendable - spent) };
  }
  function prevMonthKey() { const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`; }
  function biggestExpenseCat(mk) {
    const m = {}; S.expenses.filter((e) => monthKey(e.expense_date) === mk).forEach((e) => { const k = e.category || "기타"; m[k] = (m[k] || 0) + (Number(e.amount) || 0); });
    let best = null; Object.keys(m).forEach((k) => { if (!best || m[k] > best.amt) best = { name: k, amt: round(m[k]) }; });
    return best;
  }
  function nwChangeThisMonth() {
    const h = (S.profile.setup && S.profile.setup.nwHistory) || []; if (h.length < 2) return null;
    const cur = h[h.length - 1], prev = h[h.length - 2]; return round(cur.v - prev.v);
  }
  // 자동 월간 리뷰 인사이트
  function monthlyInsights() {
    const out = [], mk = nowMonth(), pk = prevMonthKey(), en = VLANG === "en";
    const inc = monthIncome(mk), exp = monthExpense(mk), expP = monthExpense(pk);
    const sr = monthSavingsRate(mk), srP = monthSavingsRate(pk), saved = monthSaveAllocated(mk);
    if (sr != null && srP != null) {
      const d = Math.round((sr - srP) * 10) / 10;
      if (d > 0) out.push({ t: "good", x: en ? `Savings rate rose <b>+${d}pts</b> vs last month (${srP}% → ${sr}%). Nice work!` : `저축률이 지난달보다 <b>+${d}%p</b> 올랐어요 (${srP}% → ${sr}%). 잘하고 있어요!` });
      else if (d < 0) out.push({ t: "warn", x: en ? `Savings rate fell <b>${d}pts</b> vs last month (${srP}% → ${sr}%).` : `저축률이 지난달보다 <b>${d}%p</b> 내렸어요 (${srP}% → ${sr}%).` });
      else out.push({ t: "info", x: en ? `Savings rate is same as last month (${sr}%).` : `저축률이 지난달과 같아요 (${sr}%).` });
    } else if (sr != null) out.push({ t: sr >= 20 ? "good" : "info", x: en ? `Savings rate <b>${sr}%</b>${sr >= 20 ? " — great!" : ""}` : `이번 달 저축률 <b>${sr}%</b>${sr >= 20 ? " — 훌륭해요!" : ""}` });
    if (exp > 0 && expP > 0) {
      const pct = Math.round((exp - expP) / expP * 100);
      if (pct > 10) out.push({ t: "warn", x: en ? `Spending up <b>${pct}%</b> vs last month (${money0(expP)} → ${money0(exp)}).` : `지출이 지난달보다 <b>${pct}%</b> 늘었어요 (${money0(expP)} → ${money0(exp)}).` });
      else if (pct < -10) out.push({ t: "good", x: en ? `Spending down <b>${Math.abs(pct)}%</b> vs last month! (${money0(expP)} → ${money0(exp)})` : `지출을 지난달보다 <b>${Math.abs(pct)}%</b> 줄였어요! (${money0(expP)} → ${money0(exp)})` });
    }
    const cat = biggestExpenseCat(mk); if (cat && cat.amt > 0) out.push({ t: "info", x: en ? `Biggest category this month: <b>${esc(cat.name)}</b> ${money0(cat.amt)}` : `이번 달 가장 많이 쓴 곳: <b>${esc(cat.name)}</b> ${money0(cat.amt)}` });
    const rem = monthRemaining(mk);
    if (rem.spendable > 0) {
      if (rem.remaining < 0) out.push({ t: "warn", x: en ? `You're <b>${money0(-rem.remaining)}</b> over budget this month.` : `이번 달 예산을 <b>${money0(-rem.remaining)}</b> 초과했어요.` });
      else if (rem.remaining < rem.spendable * 0.15) out.push({ t: "warn", x: en ? `Only ${money0(rem.remaining)} left. Go easy for the last ${daysLeftInMonth()} days.` : `남은 예산이 ${money0(rem.remaining)}뿐이에요. 남은 ${daysLeftInMonth()}일 아껴 쓰세요.` });
    }
    const nwd = nwChangeThisMonth(); if (nwd != null && nwd !== 0) out.push({ t: nwd > 0 ? "good" : "warn", x: en ? `Net worth ${nwd > 0 ? "up" : "down"} <b>${nwd > 0 ? "+" : ""}${money0(nwd)}</b> this month${nwd > 0 ? " 📈" : ""}` : `순자산이 이번 달 <b>${nwd > 0 ? "+" : ""}${money0(nwd)}</b> ${nwd > 0 ? "늘었어요 📈" : "줄었어요"}` });
    if (inc <= 0) out.push({ t: "info", x: en ? `No income yet this month. Add income to see your budget & savings rate.` : `이번 달 수입이 아직 없어요. 수입을 넣으면 배분·저축률이 계산됩니다.` });
    if (saved > 0) out.push({ t: "good", x: en ? `You set aside <b>${money0(saved)}</b> to save/invest this month. A gift to future you.` : `이번 달 <b>${money0(saved)}</b>를 저축·투자로 떼어놨어요. 미래의 나에게 주는 선물이에요.` });
    if (!out.length) out.push({ t: "info", x: en ? `Log income & spending and we'll build a monthly review automatically.` : `수입·지출을 기록하면 매달 자동으로 리뷰를 만들어드려요.` });
    return out.slice(0, 5);
  }
  function insightsHTML() {
    const ic = { good: ["✓", "var(--pos)"], warn: ["!", "var(--amber)"], info: ["·", "var(--ink-3)"] };
    return monthlyInsights().map((i) => {
      const [mark, col] = ic[i.t] || ic.info;
      return `<div style="display:flex;gap:11px;padding:11px 0;border-bottom:1px solid var(--line)">
        <span style="flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;background:${col}">${mark}</span>
        <div style="font-size:13.5px;line-height:1.5;color:var(--ink)">${i.x}</div>
      </div>`;
    }).join("");
  }
  function goalsHTML() {
    const su = S.profile.setup || {};
    const col = (k) => (A.BUCKET_MAP[k] || {}).color;
    const goals = [];
    const emgTgt = Number(su.emergencyTarget) || 0;
    if (emgTgt > 0) goals.push({ label: "비상금", key: "emergency", cur: (Number(su.emergencyCurrent) || 0) + totalBucket("emergency"), tgt: emgTgt });
    if (su.hasDebt && Number(su.debtBalance) > 0) goals.push({ label: "빚 갚기", key: "debt", cur: totalBucket("debt"), tgt: Number(su.debtBalance), payoff: true });
    if (su.savingForCar && Number(su.carGoal) > 0) goals.push({ label: "차 저축", key: "car", cur: totalBucket("car"), tgt: Number(su.carGoal) });
    const investNow = totalBucket("invest");
    let html = goals.map((g) => {
      const pv = g.tgt > 0 ? Math.min(100, Math.round(g.cur / g.tgt * 100)) : 0;
      const done = pv >= 100 ? ` <span style="color:var(--pos)">✓ 달성</span>` : "";
      let proj = "";
      if (pv < 100) {
        const monthly = plannedMonthly(g.key), mo = projectMonths(g.tgt - g.cur, monthly);
        if (mo) proj = `<div class="hint" style="margin-top:6px">${VLANG === "en" ? `At this pace (${money0(monthly)}/mo), done in about <b style="color:var(--ink-2)">${mo} months · ${futureMonthLabel(mo)}</b>` : `이 속도(월 ${money0(monthly)})면 약 <b style="color:var(--ink-2)">${mo}개월 뒤 · ${futureMonthLabel(mo)}</b> 완료`}</div>`;
        else proj = `<div class="hint" style="margin-top:6px">${VLANG === "en" ? "Set a % for this bucket in Settings to see the target date" : "설정에서 이 항목 비율을 올리면 도달 시점이 예측돼요"}</div>`;
      }
      return `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
          <span style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px"><span class="dot" style="background:${col(g.key)}"></span>${VLANG === "en" ? (trEn(g.label) || g.label) : g.label}${g.payoff ? (VLANG === "en" ? " (paid)" : " (갚은 금액)") : ""}</span>
          <span style="font-size:13px"><b>${money0(g.cur)}</b> <span style="color:var(--ink-3)">/ ${money0(g.tgt)} · ${pv}%${done}</span></span>
        </div>
        <div class="bar" style="height:10px"><i style="width:${pv}%;background:${col(g.key)}"></i></div>
        ${proj}
      </div>`;
    }).join("");
    // 커스텀 저축 목표
    const cgoals = goalsList();
    html += cgoals.map((g) => {
      const tgt = Number(g.target) || 0, cur = Number(g.saved) || 0, monthly = Number(g.monthly) || 0;
      const pv = tgt > 0 ? Math.min(100, Math.round(cur / tgt * 100)) : 0;
      const done = pv >= 100 ? ` <span style="color:var(--pos)">✓ 달성</span>` : "";
      let proj = ""; if (pv < 100 && monthly > 0) { const mo = projectMonths(tgt - cur, monthly); if (mo) proj = `<div class="hint" style="margin-top:6px">${VLANG === "en" ? `${money0(monthly)}/mo → about <b style="color:var(--ink-2)">${mo} months · ${futureMonthLabel(mo)}</b>` : `월 ${money0(monthly)}면 약 <b style="color:var(--ink-2)">${mo}개월 뒤 · ${futureMonthLabel(mo)}</b>`}</div>`; }
      return `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
          <span style="font-weight:600;font-size:14px">${g.emoji || "🎯"} ${esc(g.name)}</span>
          <span style="font-size:13px"><b>${money0(cur)}</b> <span style="color:var(--ink-3)">/ ${money0(tgt)} · ${pv}%${done}</span></span>
        </div>
        <div class="bar" style="height:10px"><i style="width:${pv}%;background:var(--brand)"></i></div>
        ${proj}
      </div>`;
    }).join("");
    if (investNow > 0) html += `<div class="item" style="border:none;padding-top:4px"><div class="ic in">${icon("coin", 18)}</div><div class="mid"><div class="t1">${VLANG === "en" ? "Invest · Stocks (total)" : "투자 · 주식 누적"}</div><div class="t2">${VLANG === "en" ? "Compounds as it keeps growing" : "계속 쌓을수록 복리로 불어나요"}</div></div><div class="amt pos">${money(investNow)}</div></div>`;
    if (!goals.length && !cgoals.length && investNow <= 0) return `<div class="empty">${VLANG === "en" ? `Add a goal and progress fills in here.<br>Tap "+ Goal".` : `목표를 추가하면 여기에 진행률이 채워져요.<br>"+ 목표"를 눌러보세요.`}</div>`;
    return html;
  }
  function goalsList() { return (S.profile.setup && Array.isArray(S.profile.setup.goals)) ? S.profile.setup.goals : []; }
  function hasAnyGoal() { const su = S.profile.setup || {}; return goalsList().length > 0 || Number(su.emergencyTarget) > 0 || Number(su.carGoal) > 0; }
  function firstRunDone() { return S.incomes.length > 0 && hasAnyGoal() && (S.work.length > 0 || S.expenses.length > 0); }
  function firstRunHTML() {
    const total = S.incomes.length + S.expenses.length + S.work.length;
    if (firstRunDone() || total >= 3) return "";
    const step = (done, label, act) => `<button class="fr-step" data-act="${act}"><span class="fr-check ${done ? "on" : ""}">${done ? "✓" : ""}</span><span style="${done ? "color:var(--ink-3);text-decoration:line-through" : ""}">${label}</span><span style="margin-left:auto;color:var(--ink-3);display:inline-flex">${icon("chevR", 16)}</span></button>`;
    return `<div class="card">
      <div class="card-h"><h2>시작하기 👋</h2></div>
      <p class="sub" style="margin:0 0 8px">${VLANG === "en" ? "Do these three and VAULT starts managing your money." : "세 가지만 하면 VAULT가 돈 관리를 시작해요."}</p>
      ${step(S.incomes.length > 0, VLANG === "en" ? "① Add your first income" : "① 첫 수입 넣기", "income")}
      ${step(hasAnyGoal(), VLANG === "en" ? "② Set a savings goal" : "② 저축 목표 정하기", "goals")}
      ${step(S.work.length > 0 || S.expenses.length > 0, VLANG === "en" ? "③ Log work or spending" : "③ 근무·지출 기록하기", "work")}
    </div>`;
  }
  const GOAL_EMOJIS = ["🎯", "✈️", "🚗", "🏠", "💻", "🎓", "💍", "🏖️", "🎮", "📱", "🛡️", "💰"];
  function renderGoals() {
    tabbar.classList.remove("hidden");
    if (!S.profile.setup) S.profile.setup = {};
    if (!Array.isArray(S.profile.setup.goals)) S.profile.setup.goals = [];
    const arr = S.profile.setup.goals;
    app.innerHTML = `
      <div class="screen fadein">
        <div class="apphead">
          <button class="hbtn" id="gBack"><span style="transform:rotate(180deg);display:inline-flex">${icon("chevR", 20)}</span></button>
          <div class="htitle">저축 목표</div>
          <div style="width:40px"></div>
        </div>
        <div id="gList">${arr.length ? arr.map((g) => {
          const tgt = Number(g.target) || 0, cur = Number(g.saved) || 0, monthly = Number(g.monthly) || 0;
          const pv = tgt > 0 ? Math.min(100, Math.round(cur / tgt * 100)) : 0;
          const mo = pv < 100 && monthly > 0 ? projectMonths(tgt - cur, monthly) : null;
          return `<div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div><div style="font-size:17px;font-weight:680">${g.emoji || "🎯"} ${esc(g.name)}</div><div style="font-size:12.5px;color:var(--ink-3);margin-top:3px">${mo ? `월 ${money0(monthly)} · 약 ${mo}개월 뒤(${futureMonthLabel(mo)})` : (pv >= 100 ? "🎉 목표 달성!" : "월 적립액을 정하면 예측돼요")}</div></div>
              <button class="del" data-gdel="${g.id}">${icon("close", 16)}</button>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px"><b>${money0(cur)}</b><span style="color:var(--ink-3)">/ ${money0(tgt)} · ${pv}%</span></div>
            <div class="bar" style="height:12px"><i style="width:${pv}%;background:var(--brand)"></i></div>
            <button class="btn ghost sm" data-gadd="${g.id}" style="width:100%;margin-top:14px">${icon("plus", 15)} 적립하기</button>
          </div>`;
        }).join("") : `<div class="card"><div class="empty">아직 목표가 없어요.<br>여행·첫 차·비상금처럼 모으고 싶은 걸 추가하세요.</div></div>`}</div>
        <div class="card">
          <div class="card-h"><h2>새 목표 추가</h2></div>
          <div class="field"><label>이모지</label><div class="chips" id="gEmoji">${GOAL_EMOJIS.map((e, i) => `<div class="chip ${i === 0 ? "on" : ""}" data-e="${e}" style="font-size:16px">${e}</div>`).join("")}</div></div>
          <div class="field"><label>목표 이름</label><input id="gName" class="input" placeholder="예: 일본 여행"></div>
          <div class="row2">
            <div class="field"><label>목표 금액</label><input id="gTarget" class="input" type="number" inputmode="decimal" placeholder="3000"></div>
            <div class="field"><label>월 적립 (선택)</label><input id="gMonthly" class="input" type="number" inputmode="decimal" placeholder="300"></div>
          </div>
          <button id="gAdd" class="btn">${icon("plus", 18)} 목표 추가</button>
        </div>
      </div>`;
    $("#gBack").onclick = () => nav("dashboard");
    let emoji = GOAL_EMOJIS[0];
    $("#gEmoji").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { emoji = c.dataset.e; $("#gEmoji").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }));
    $("#gAdd").onclick = async () => {
      const name = $("#gName").value.trim(), target = Number($("#gTarget").value), monthly = Number($("#gMonthly").value) || 0;
      if (!name || !target || target <= 0) return toast("이름과 목표 금액을 입력하세요.", true);
      arr.push({ id: "g" + Date.now(), emoji, name, target: round(target), monthly: round(monthly), saved: 0 });
      await saveProfile({ setup: S.profile.setup }); toast("목표 추가 ✓"); renderGoals();
    };
    $("#gList").querySelectorAll("[data-gdel]").forEach((b) => (b.onclick = async () => {
      if (!confirm("이 목표를 삭제할까요?")) return;
      const i = arr.findIndex((x) => x.id === b.dataset.gdel); if (i >= 0) arr.splice(i, 1);
      await saveProfile({ setup: S.profile.setup }); renderGoals();
    }));
    $("#gList").querySelectorAll("[data-gadd]").forEach((b) => (b.onclick = async () => {
      const g = arr.find((x) => x.id === b.dataset.gadd); if (!g) return;
      const v = prompt(`"${g.name}"에 얼마 적립할까요?`, "");
      const amt = Number(v); if (!amt || amt <= 0) return;
      g.saved = round((Number(g.saved) || 0) + amt);
      await saveProfile({ setup: S.profile.setup }); toast(`${money0(amt)} 적립 ✓`); renderGoals();
    }));
  }
  function drawSavingsChart() {
    const el = document.getElementById("srChart"); if (!el || !window.Chart) return;
    if (S.srChart) { S.srChart.destroy(); S.srChart = null; }
    const mks = lastMonths(6);
    const data = mks.map((mk) => monthSavingsRate(mk));
    const labels = mks.map((mk) => Number(mk.slice(5)) + "월");
    S.srChart = new Chart(el, {
      type: "line",
      data: { labels, datasets: [{ data: data.map((v) => (v == null ? null : v)), borderColor: "#1a6b4f", backgroundColor: "rgba(26,107,79,.10)", borderWidth: 2.5, fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: "#1a6b4f", spanGaps: true }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `저축률 ${c.raw}%` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "%", font: { size: 10 } }, grid: { color: "rgba(0,0,0,.05)" } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } },
    });
  }

  /* ---- AI 재무 코치 ---- */
  function getAiSummary() {
    const su = S.profile.setup || {}, mk = nowMonth();
    const nw = hasAccounts() ? netWorth() : null;
    const gp = groupPct(S.profile.buckets || []);
    const bd = categoryBreakdown(mk);
    const topCats = bd.rows.slice(0, 4).map((r) => `${r.name} ${money0(r.amt)}(${r.pct}%)`).join(", ");
    const lines = [
      `월 예상수입: ${money0(su.monthlyIncome || monthIncome(mk))}`,
      `이번 달 수입 ${money0(monthIncome(mk))} / 지출 ${money0(monthExpense(mk))} / 저축률 ${monthSavingsRate(mk) ?? "-"}%`,
      `배분 목표: 필수 ${gp.needs}% · 여유 ${gp.wants}% · 저축/투자 ${gp.save}%`,
      nw ? `순자산 ${money0(nw.net)} (자산 ${money0(nw.assets)} - 부채 ${money0(nw.debts)})` : `총 잔액 ${money0(vaultBalance())}`,
      `이번 달 지출 상위: ${topCats || "없음"}`,
      su.hasDebt ? `고금리 빚 있음, 잔액 ${money0(su.debtBalance || 0)}` : `고금리 빚 없음`,
      `비상금 목표 ${money0(su.emergencyTarget || 0)} / 현재 ${money0((su.emergencyCurrent || 0) + totalBucket("emergency"))}`,
      su.savingForCar ? `차 저축 목표 ${money0(su.carGoal || 0)} / 현재 ${money0(totalBucket("car"))}` : "",
      (su.recurringExpenses && su.recurringExpenses.length) ? `정기 지출: ${su.recurringExpenses.map((x) => `${x.name} ${money0(x.amount)}`).join(", ")}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }
  async function callAiCoach() {
    const once = async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { error: "로그인이 필요해요." };
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ summary: getAiSummary(), lang: VLANG }),
      });
      return await r.json();
    };
    try { return await once(); }
    catch (_) { await new Promise((r) => setTimeout(r, 1500)); try { return await once(); } catch (e) { return { error: "연결에 실패했어요. 잠시 후 다시 시도하세요." }; } }
  }
  const aiAdviceHTML = (text) => `<div style="font-size:14px;line-height:1.75;color:var(--ink);white-space:pre-wrap;margin-bottom:14px">${esc(text)}</div>`;

  /* ---- CSV 내보내기 ---- */
  function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function toCsv(headers, rows) { return "﻿" + headers.map(csvCell).join(",") + "\n" + rows.map((r) => r.map(csvCell).join(",")).join("\n"); }
  function downloadFile(filename, content, mime) {
    try { const blob = new Blob([content], { type: mime || "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200); }
    catch (e) { toast("내보내기 실패: " + (e.message || e), true); }
  }
  function exportCsv(type) {
    const stamp = todayStr();
    if (type === "incomes") {
      if (!S.incomes.length) return toast("수입 기록이 없어요.", true);
      const rows = S.incomes.slice().sort((a, b) => a.income_date.localeCompare(b.income_date)).map((i) => [i.income_date, i.amount, i.source || "", (i.allocation || []).length ? "배분" : "정산"]);
      downloadFile(`vault_수입_${stamp}.csv`, toCsv(["날짜", "금액", "출처", "종류"], rows));
    } else if (type === "expenses") {
      if (!S.expenses.length) return toast("지출 기록이 없어요.", true);
      const rows = S.expenses.slice().sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map((e) => { const b = (S.profile.buckets || []).find((x) => x.key === e.bucket_key); return [e.expense_date, e.amount, e.category || "", b ? b.label : "", (e.note || "").indexOf("[정기]") !== -1 ? "정기" : ""]; });
      downloadFile(`vault_지출_${stamp}.csv`, toCsv(["날짜", "금액", "분류", "버킷", "메모"], rows));
    } else if (type === "work") {
      if (!S.work.length) return toast("근무 기록이 없어요.", true);
      const rows = S.work.slice().sort((a, b) => a.work_date.localeCompare(b.work_date)).map((r) => { const p = computeWorkPay(r.hours, r.hourly_wage); return [r.work_date, r.hours, r.hourly_wage, p.otTotal, p.pay, r.note || ""]; });
      downloadFile(`vault_근무_${stamp}.csv`, toCsv(["날짜", "시간", "시급", "OT시간", "급여", "장소"], rows));
    }
    toast("CSV 내보냈어요 ✓");
  }

  /* ---- 앱 잠금 (PIN) ---- */
  async function sha256hex(str) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  function pinSet() { try { return !!localStorage.getItem("vault-pin"); } catch (e) { return false; } }
  async function setPin(p) { const h = await sha256hex("vault:" + p); try { localStorage.setItem("vault-pin", h); } catch (e) {} }
  function clearPin() { try { localStorage.removeItem("vault-pin"); } catch (e) {} }
  async function verifyPin(p) { const h = await sha256hex("vault:" + p); try { return localStorage.getItem("vault-pin") === h; } catch (e) { return false; } }
  let pinBuf = "";
  function renderPin(cfg) {
    pinBuf = ""; tabbar.classList.add("hidden");
    app.innerHTML = `<div class="auth fadein" style="justify-content:flex-start;padding-top:calc(64px + var(--safe-t))">
      <div class="logo-lg">${icon("mark", 34)}</div>
      <h1 style="font-size:23px">${esc(cfg.title)}</h1>
      <div class="tag" id="pinSub">${esc(cfg.sub || "")}</div>
      <div id="pinDots" style="display:flex;gap:16px;justify-content:center;margin:6px 0 32px"></div>
      <div id="pinPad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:270px;margin:0 auto;width:100%">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="pinkey" data-n="${n}">${n}</button>`).join("")}
        <div></div><button class="pinkey" data-n="0">0</button><button class="pinkey" data-del="1">⌫</button>
      </div>
      ${cfg.onCancel ? `<div class="linkline" style="margin-top:26px"><a id="pinCancel">취소</a></div>` : ""}
    </div>`;
    const draw = () => { $("#pinDots").innerHTML = [0, 1, 2, 3].map((i) => `<span style="width:14px;height:14px;border-radius:50%;display:inline-block;background:${i < pinBuf.length ? "var(--ink)" : "var(--surface-2)"}"></span>`).join(""); };
    draw();
    $("#pinPad").querySelectorAll(".pinkey").forEach((b) => (b.onclick = () => {
      if (b.dataset.del) { pinBuf = pinBuf.slice(0, -1); draw(); return; }
      if (pinBuf.length < 4) { pinBuf += b.dataset.n; draw(); if (pinBuf.length === 4) { const p = pinBuf; setTimeout(() => cfg.onDone(p), 130); } }
    }));
    const c = $("#pinCancel"); if (c) c.onclick = cfg.onCancel;
  }
  function askUnlock(next) {
    const en = VLANG === "en";
    renderPin({ title: en ? "Enter PIN" : "PIN 입력", sub: en ? "Unlock the app" : "앱 잠금 해제", onDone: async (p) => { if (await verifyPin(p)) { S.unlocked = true; next(); } else { toast(en ? "Wrong PIN" : "PIN이 틀려요", true); askUnlock(next); } } });
  }
  function setupPinFlow(afterView) {
    const back = () => { S.unlocked = true; nav(afterView || "settings"); };
    renderPin({ title: "새 PIN", sub: "4자리 숫자", onCancel: back, onDone: (p1) => {
      renderPin({ title: "PIN 확인", sub: "한 번 더 입력", onCancel: back, onDone: async (p2) => {
        if (p1 === p2) { await setPin(p1); S.unlocked = true; toast("PIN 설정됨 ✓"); nav("settings"); }
        else { toast("일치하지 않아요. 다시", true); setupPinFlow(afterView); }
      } });
    } });
  }

  function renderDashboard() {
    const bal = vaultBalance(), mi = monthIncome(), me = monthExpense();
    const rem = monthRemaining(), dLeft = daysLeftInMonth(), curRate = monthSavingsRate(nowMonth());
    const hasTrend = lastMonths(6).some((mk) => monthSavingsRate(mk) != null);
    const nwVal = hasAccounts() ? netWorth().net : bal;
    const nwLabel = hasAccounts() ? "순자산" : "총 자산";
    const saveAccum = round(totalBucket("emergency") + totalBucket("invest") + totalBucket("car"));
    const nm = S.profile.display_name || "준서";
    const payday = Number((S.profile.setup || {}).payday) || 0;
    const showPayday = payday >= 1 && payday <= 31 && new Date().getDate() >= payday && monthIncome(nowMonth()) <= 0;
    recordNwSnapshot();
    const buckets = S.profile.buckets || [];
    const bRows = buckets.map((b) => ({ ...b, bal: totalBucket(b.key) }));
    const gp = groupPct(buckets), sv = saveVerdict(gp.save);
    const groups = [["save", "저축 · 투자", "이 돈이 자산을 불려요"], ["needs", "필수 지출", "매달 꼭 나가는 돈"], ["wants", "여유 · For fun", "하고 싶은 데 쓰는 돈"]];
    const groupHtml = groups.map(([grp, label]) => {
      const rows = bRows.filter((b) => bucketGroup(b) === grp && b.percent > 0);
      if (!rows.length) return "";
      const gsum = Math.round(rows.reduce((s, b) => s + (Number(b.percent) || 0), 0) * 10) / 10;
      return `<div class="bgroup"><span class="gt">${label}</span><span>${gsum}%</span></div>` + rows.map((b) => bucketRow(b, bRows)).join("");
    }).join("");
    app.innerHTML = `
      <div class="screen fadein">
        <div class="apphead">
          <button class="hbtn" id="themeBtn">${icon(getTheme() === "dark" ? "sun" : "moon", 20)}</button>
          <div class="htitle">홈</div>
          <button class="hbtn avatar" id="goSettings">${esc(nm.slice(0, 1))}</button>
        </div>
        <div class="nw">
          <div class="nw-label">${nwLabel}</div>
          <div class="nw-big">${hideMoney(nwVal)} <span class="nw-eye" id="balEye">${icon(balanceHidden() ? "eyeoff" : "eye")}</span></div>
          <a class="nw-link" id="goNw">순자산 관리 ${icon("chevR", 15)}</a>
        </div>
        <div class="twocard">
          <div class="tc"><div class="k">저축·투자 누적</div><div class="v pos">${hideMoney(saveAccum)}</div><div class="foot">비상금 · 투자 · 차</div></div>
          <div class="tc"><div class="k">이번 달 저축률</div><div class="v">${curRate != null ? curRate + "%" : "—"}</div><div class="foot">순증 ${money0(mi - me)}</div></div>
        </div>

        ${firstRunHTML()}

        ${showPayday ? `<div class="card" style="background:var(--brand);border:none">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="color:#04110b"><div style="font-weight:720;font-size:16px">💰 월급날이에요!</div><div style="font-size:13px;opacity:.82;margin-top:3px">번 돈을 넣고 배분하면 저축이 자동으로 시작돼요.</div></div>
            <button id="payAlloc" class="btn" style="width:auto;background:#04110b;color:var(--brand);padding:12px 18px;flex:none">배분하기</button>
          </div>
        </div>` : ""}

        ${(() => {
          if (mi <= 0 && me <= 0) return `<div class="card"><div class="card-h"><h2>이번 달 남은 예산</h2></div><div class="empty" style="padding:8px 0">수입을 추가하면 이번 달 쓸 수 있는 돈이 계산돼요.</div></div>`;
          const sp = rem.spendable, spentPct = sp > 0 ? Math.min(100, Math.round(rem.spent / sp * 100)) : (rem.spent > 0 ? 100 : 0), over = rem.remaining < 0;
          return `<div class="card">
            <div class="card-h"><h2>이번 달 남은 예산</h2><span class="total-pill ${over ? "bad" : "ok"}">${over ? "예산 초과" : "하루 " + money0(rem.remaining / dLeft)}</span></div>
            <div class="big" style="font-size:30px;${over ? "color:var(--neg)" : "color:var(--ink)"}">${money(rem.remaining)}</div>
            <div class="bar" style="height:9px;margin:10px 0 8px"><i style="width:${spentPct}%;background:${over ? "var(--neg)" : "var(--brand)"}"></i></div>
            <div class="hint">${VLANG === "en" ? `Spendable ${money0(rem.spendable)}, spent <b>${money0(rem.spent)}</b>. Save/invest ${money0(rem.saved)} already set aside.${over ? "" : ` ${dLeft} days left · ${money0(rem.remaining / dLeft)}/day`}` : `쓸 수 있는 돈 ${money0(rem.spendable)} 중 <b>${money0(rem.spent)}</b> 썼어요. 저축·투자 ${money0(rem.saved)}은 이미 따로 빼놨습니다.${over ? "" : ` 남은 ${dLeft}일 · 하루 ${money0(rem.remaining / dLeft)}`}`}</div>
          </div>`;
        })()}

        <div class="card">
          <div class="card-h"><h2>배분 건강 (50·30·20)</h2><span class="total-pill ${sv.cls}">저축률 ${gp.save}% · ${sv.txt}</span></div>
          <div class="split-bar">
            <i style="width:${gp.needs}%;background:var(--ink-3)"></i>
            <i style="width:${gp.wants}%;background:#db8cab"></i>
            <i style="width:${gp.save}%;background:var(--brand)"></i>
          </div>
          <div class="split-legend">
            <div class="lg"><div class="n" style="--c:var(--ink-3)">필수</div><div class="p">${gp.needs}%</div></div>
            <div class="lg"><div class="n" style="--c:#db8cab">여유</div><div class="p">${gp.wants}%</div></div>
            <div class="lg"><div class="n" style="--c:var(--brand)">저축·투자</div><div class="p" style="color:var(--brand-d)">${gp.save}%</div></div>
          </div>
          <div class="hint">${VLANG === "en" ? `Target: Needs 50% · Wants 30% · <b>Save 20%+</b>. The higher your savings rate, the faster wealth grows.` : `권장: 필수 50% · 여유 30% · <b>저축·투자 20%↑</b>. 저축률이 높을수록 자산이 빨리 불어나요.`}</div>
          ${(() => { const fy = yearsToFI(gp.save); if (!fy) return ""; const txt = VLANG === "en" ? `💡 Keep this savings rate and you reach financial independence in <b>about ${fy} years</b> (when your money covers living costs). This is where you pull ahead of those who don't manage.` : `💡 이 저축률을 유지하면 <b>약 ${fy}년 뒤</b> 경제적 자유(일 안 해도 생활비가 나오는 상태)에 도달해요. 관리 안 하는 사람과 여기서 갈립니다.`; return `<div class="hint" style="margin-top:7px;color:var(--brand-d);background:var(--brand-tint);padding:10px 12px;border-radius:10px">${txt}</div>`; })()}
        </div>

        <div class="card">
          <div class="card-h"><h2>이번 달 리뷰</h2></div>
          ${insightsHTML()}
        </div>

        <div class="card">
          <div class="card-h"><h2>✨ AI 재무 코치</h2></div>
          <div id="aiBox">${S.aiAdvice ? aiAdviceHTML(S.aiAdvice) : `<div class="hint" style="margin:0 0 14px">${VLANG === "en" ? "Claude looks at your data and gives <b>personalized advice</b> — where to cut and where to add." : "Claude가 준서님 데이터를 보고 <b>맞춤 조언</b>을 드려요. 어디를 아끼고 어디에 더 넣을지."}</div>`}</div>
          <button id="aiBtn" class="btn">${icon("star", 18)} ${S.aiAdvice ? "다시 받기" : "코치에게 물어보기"}</button>
        </div>

        ${hasTrend ? `<div class="card">
          <div class="card-h"><h2>저축률 추이</h2>${curRate != null ? `<span class="total-pill ${curRate >= 20 ? "ok" : curRate >= 10 ? "" : "bad"}">이번 달 ${curRate}%</span>` : ""}</div>
          <div class="chart-wrap" style="height:150px"><canvas id="srChart"></canvas></div>
          <div class="hint">저축률이 오를수록 경제적 자유가 빨라져요. 관리할수록 이 선이 올라갑니다.</div>
        </div>` : ""}

        <div class="card">
          <div class="card-h"><h2>목표 진행률</h2><a class="link" id="goGoals" style="font-size:13px">+ 목표</a></div>
          ${goalsHTML()}
        </div>

        <div class="card">
          <div class="card-h"><h2>버킷별 잔액</h2><a class="link" id="goInc" style="font-size:13px">+ 수입 배분</a></div>
          ${bRows.some((b) => b.bal !== 0) ? `<div class="chart-wrap"><canvas id="donut"></canvas></div>` : `<div class="empty">아직 배분된 돈이 없어요.<br>수입을 추가하면 여기에 나눠 담깁니다.</div>`}
          ${groupHtml}
        </div>

        <div class="card">
          <h2>최근 활동</h2>
          ${recentActivity()}
        </div>
      </div>`;
    $("#goInc").onclick = () => nav("income");
    { const pa = $("#payAlloc"); if (pa) pa.onclick = () => nav("income"); }
    $("#themeBtn").onclick = () => { setTheme(getTheme() === "dark" ? "light" : "dark"); renderDashboard(); };
    $("#goSettings").onclick = () => nav("settings");
    $("#goNw").onclick = () => nav("networth");
    { const gg = $("#goGoals"); if (gg) gg.onclick = () => nav("goals"); }
    $("#balEye").onclick = () => { toggleBalanceHidden(); renderDashboard(); };
    $("#aiBtn").onclick = async () => {
      const btn = $("#aiBtn"), box = $("#aiBox"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      box.innerHTML = `<div class="hint" style="margin:0 0 14px"><span class="spinner" style="width:15px;height:15px;display:inline-block;vertical-align:middle;margin-right:8px"></span>코치가 준서님 데이터를 꼼꼼히 보는 중이에요… (10~30초)</div>`;
      const res = await callAiCoach();
      if (res && res.text) { S.aiAdvice = res.text; box.innerHTML = aiAdviceHTML(res.text); }
      else { box.innerHTML = `<div class="err" style="margin-bottom:14px">${esc((res && res.error) || "오류가 났어요.")}</div>`; }
      btn.disabled = false; btn.innerHTML = `${icon("star", 18)} 다시 받기`;
    };
    drawDonut(bRows.filter((b) => b.bal > 0));
    drawSavingsChart();
  }
  function bucketRow(b, bRows) {
    return `<div class="bucket">
      <span class="dot" style="background:${b.color}"></span>
      <div style="flex:1">
        <div class="nm">${esc(b.label)} <span class="pc">${b.percent}%</span></div>
        <div class="bar"><i style="width:${pctOfMax(b.bal, bRows)}%;background:${b.color}"></i></div>
      </div>
      <span class="am">${money(b.bal)}</span>
    </div>`;
  }
  function pctOfMax(v, rows) { const mx = Math.max(1, ...rows.map((r) => Math.abs(r.bal))); return Math.max(0, (Math.abs(v) / mx) * 100); }

  function recentActivity() {
    const items = [];
    S.incomes.forEach((i) => items.push({ t: "income", id: i.id, date: i.income_date, created: i.created_at, label: i.source || "수입", amt: Number(i.amount) }));
    S.expenses.forEach((e) => items.push({ t: "expense", id: e.id, date: e.expense_date, created: e.created_at, label: e.category || "지출", amt: -Number(e.amount) }));
    items.sort((a, b) => (b.date + (b.created || "")).localeCompare(a.date + (a.created || "")));
    const top = items.slice(0, 6);
    if (!top.length) return `<div class="empty">기록이 없습니다.</div>`;
    return top.map((it) => `
      <div class="item">
        <div class="ic ${it.t === "income" ? "in" : "out"}">${icon(it.t === "income" ? "inflow" : "outflow", 20)}</div>
        <div class="mid" data-edit="${it.t}:${it.id}"><div class="t1">${esc(it.label)}</div><div class="t2">${fmtDate(it.date)}</div></div>
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
          <div class="hint">${VLANG === "en" ? "Change the split anytime in <b>Settings</b>." : "비율은 <b>설정 탭</b>에서 언제든 바꿀 수 있어요."}</div>
        </div>
        <div class="card tight">
          <button id="goPaystubs" class="btn ghost sm" style="width:100%">📄 ${VLANG === "en" ? "Paystub & pay-slip photos" : "페이스텁 · 급여명세 사진 보관"}</button>
        </div>
        <div class="card">
          <h2>${VLANG === "en" ? "Income history" : "수입 내역"}</h2>
          <div id="incList">${incomeList()}</div>
        </div>
      </div>`;
      $("#goPaystubs").onclick = () => nav("paystubs");
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
  /* ================= PAYSTUB 사진 보관 ================= */
  function ymNow() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function ymLabel(ym) { const [y, m] = ym.split("-"); return VLANG === "en" ? `${EN_MON[+m]} ${y}` : `${y}년 ${+m}월`; }
  async function compressImage(file, max = 1600, q = 0.72) {
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
      return blob || file;
    } catch (e) { return file; }
  }
  async function loadPaystubs() {
    const { data, error } = await sb.from("paystubs").select("*").order("month", { ascending: false }).order("created_at", { ascending: false });
    return error ? [] : (data || []);
  }
  async function uploadPaystub(file, month, kind, note) {
    const blob = (file.type || "").startsWith("image/") ? await compressImage(file) : file;
    const uid = S.user.id;
    const ext = (file.type || "").startsWith("image/") ? "jpg" : ((file.name || "file").split(".").pop() || "bin");
    const path = `${uid}/${month}/${Date.now()}.${ext}`;
    const up = await sb.storage.from("paystubs").upload(path, blob, { contentType: (file.type || "").startsWith("image/") ? "image/jpeg" : (file.type || "application/octet-stream"), upsert: false });
    if (up.error) throw up.error;
    const ins = await sb.from("paystubs").insert({ user_id: uid, month, path, kind: kind || "paystub", note: note || null });
    if (ins.error) throw ins.error;
  }
  async function paystubUrl(path) { try { const { data } = await sb.storage.from("paystubs").createSignedUrl(path, 3600); return data ? data.signedUrl : null; } catch (e) { return null; } }
  async function removePaystub(row) { try { await sb.storage.from("paystubs").remove([row.path]); } catch (e) {} await sb.from("paystubs").delete().eq("id", row.id); }

  async function renderPaystubs() {
    tabbar.classList.add("hidden");
    const en = VLANG === "en";
    app.innerHTML = `
      <div class="screen fadein">
        <div class="apphead">
          <button class="hbtn" id="psBack">${icon("chevR", 20)}</button>
          <div class="htitle">${en ? "Paystubs" : "페이스텁"}</div>
          <div style="width:40px"></div>
        </div>
        <p class="sub">${en ? "Keep photos of paystubs, pay-slips or cheques, filed by month." : "급여명세·페이스텁·체크 사진을 달별로 보관하세요."}</p>
        <div class="card">
          <div class="field"><label>${en ? "Month" : "해당 월"}</label><input id="psMonth" class="input" type="month" value="${ymNow()}"></div>
          <div class="field"><label>${en ? "Pay period / label" : "기간 · 라벨"}</label><input id="psNote" class="input" placeholder="${en ? "e.g. Aug 1–15" : "예: 8월 1일~15일"}"><div class="hint">${en ? "Written under each photo so it's easy to find." : "사진마다 밑에 표시돼서 찾기 쉬워요."}</div></div>
          <input id="psFile" type="file" accept="image/*" style="display:none">
          <button id="psPick" class="btn gold" style="width:100%">${en ? "📷 Add photo (camera or gallery)" : "📷 사진 추가 (촬영 · 갤러리)"}</button>
          <div id="psStatus" class="hint" style="text-align:center;margin-top:8px"></div>
        </div>
        <div id="psList"></div>
      </div>`;
    $("#psBack").onclick = () => nav("income");
    $("#psPick").onclick = () => $("#psFile").click();
    $("#psFile").onchange = async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const month = $("#psMonth").value || ymNow(); const note = $("#psNote").value.trim();
      const st = $("#psStatus"); st.textContent = en ? "Uploading…" : "올리는 중…";
      try { await uploadPaystub(file, month, "paystub", note); toast(en ? "Saved ✓" : "저장됨 ✓"); $("#psNote").value = ""; renderPaystubs(); }
      catch (err) { st.textContent = ""; toast((en ? "Upload failed: " : "업로드 실패: ") + (err.message || err), true); }
      finally { e.target.value = ""; }
    };
    const rows = await loadPaystubs();
    const listEl = $("#psList"); if (!listEl) return;
    if (!rows.length) { listEl.innerHTML = `<div class="card"><div class="hint" style="margin:0">${en ? "No photos yet. Add your first paystub above." : "아직 사진이 없어요. 위에서 첫 페이스텁을 추가하세요."}</div></div>`; return; }
    const byMonth = {}; rows.forEach((r) => { (byMonth[r.month] = byMonth[r.month] || []).push(r); });
    listEl.innerHTML = Object.keys(byMonth).sort().reverse().map((m) => `
      <div class="card">
        <div class="card-h"><h2>${ymLabel(m)}</h2><span class="sub">${byMonth[m].length}${en ? "" : "장"}</span></div>
        <div class="ps-grid">${byMonth[m].map((r) => `
          <div class="ps-item">
            <div class="ps-thumb" data-full="${r.id}"><div class="ps-ph" id="ps-${r.id}"></div><button class="ps-del" data-del="${r.id}" title="delete">✕</button></div>
            <div class="ps-cap">${r.note ? esc(r.note) : `<span class="dim">${en ? "(no label)" : "(라벨 없음)"}</span>`}</div>
          </div>`).join("")}</div>
      </div>`).join("");
    // 서명 URL 채우기
    rows.forEach(async (r) => { const url = await paystubUrl(r.path); const el = document.getElementById("ps-" + r.id); if (el && url) el.style.backgroundImage = `url("${url}")`; });
    // 크게 보기
    listEl.querySelectorAll("[data-full]").forEach((el) => (el.onclick = async (e) => {
      if (e.target.closest("[data-del]")) return;
      const r = rows.find((x) => x.id === el.dataset.full); if (!r) return;
      const url = await paystubUrl(r.path); if (url) showPhoto(url);
    }));
    // 삭제 (사용자 확인 후)
    listEl.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      const r = rows.find((x) => x.id === b.dataset.del); if (!r) return;
      if (!confirm(en ? "Delete this photo?" : "이 사진을 삭제할까요?")) return;
      await removePaystub(r); toast(en ? "Deleted" : "삭제됨"); renderPaystubs();
    }));
  }
  function showPhoto(url) {
    const ov = document.createElement("div"); ov.className = "photo-ov";
    ov.innerHTML = `<img src="${url}" alt=""><button class="photo-x">✕</button>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
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
        <div class="mid" data-edit="income:${i.id}"><div class="t1">${esc(i.source || "수입")}</div><div class="t2">${fmtDate(i.income_date)} · 눌러서 편집</div></div>
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
    if (VLANG === "en") {
      if (!c.enabled) return "No overtime (all hours at base rate)";
      let t = `Over ${fmtH(c.dailyOT)}h/day at <b>${c.otMult}×</b>`;
      if (c.double) t += `, over ${fmtH(c.doubleThresh)}h at <b>${c.dtMult}×</b>`;
      return t + ", auto";
    }
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

  let wMode = "single", wAddOpen = false, wOpenMonth;
  function groupWorkByMonth() {
    const map = {};
    S.work.forEach((r) => { const mk = monthKey(r.work_date); (map[mk] = map[mk] || []).push(r); });
    return Object.keys(map).sort().reverse().map((mk) => {
      const rows = map[mk].slice().sort((a, b) => (b.work_date + (b.created_at || "")).localeCompare(a.work_date + (a.created_at || "")));
      const hours = round(sum(rows, (r) => r.hours));
      const pay = round(sum(rows, (r) => computeWorkPay(r.hours, r.hourly_wage).pay));
      const ot = round(sum(rows, (r) => computeWorkPay(r.hours, r.hourly_wage).otTotal));
      const [y, m] = mk.split("-");
      return { mk, label: `${y}년 ${Number(m)}월`, hours, pay, ot, rows };
    });
  }
  function workDayRow(r) {
    const p = computeWorkPay(r.hours, r.hourly_wage);
    const otTag = p.otTotal ? `<span style="color:var(--amber)"> · OT ${fmtH(p.otTotal)}h</span>` : "";
    return `<div class="item">
      <div class="ic">${icon("clock", 20)}</div>
      <div class="mid" data-edit="work:${r.id}"><div class="t1">${fmtDate(r.work_date)}${r.note ? " · " + esc(r.note) : ""}</div><div class="t2">${fmtH(r.hours)}시간${otTag} · 시급 ${money(r.hourly_wage)}</div></div>
      <div class="amt pos">${money(p.pay)}</div>
      <button class="del" data-del="${r.id}">${icon("close", 16)}</button>
    </div>`;
  }
  function renderWork() {
    const wage = Number(S.profile.hourly_wage) || 0;
    const wk = weekStats(), mo = monthWorkStats();
    const months = groupWorkByMonth();
    if (wOpenMonth === undefined && months.length) wOpenMonth = months[0].mk;
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>근무 기록</h1>
        <p class="sub">시급 <b>${money(wage)}</b> · ${otRuleText()}.</p>
        <div class="grid2">
          <div class="mini"><div class="k">이번 주</div><div class="v">${fmtH(wk.hours)}h</div><div class="k" style="margin-top:4px;color:var(--pos)">${money0(wk.earned)}</div></div>
          <div class="mini"><div class="k">이번 달</div><div class="v">${fmtH(mo.hours)}h</div><div class="k" style="margin-top:4px;color:var(--pos)">${money0(mo.earned)}</div></div>
        </div>

        <button id="wAddToggle" class="btn ${wAddOpen ? "ghost" : ""}" style="margin-bottom:16px">${wAddOpen ? "✕ 닫기" : icon("plus", 18) + " 근무 추가"}</button>

        <div id="wAddWrap" class="${wAddOpen ? "" : "hidden"}">
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
                <div class="hint">날짜·시간·"10hrs"·장소를 자유롭게 — 알아서 인식합니다.</div>
              </div>
              <div class="field"><label>시급</label><input id="wkWage" class="input" type="number" inputmode="decimal" value="${wage || ""}" placeholder="24"></div>
              <button id="wkParse" class="btn ghost sm" style="width:100%">${icon("sliders", 17)} 분석하기</button>
              <div id="wkPreview"></div>
            </div>
          </div>
        </div>

        <div id="wList">
          ${months.length ? months.map((m) => {
            const open = m.mk === wOpenMonth;
            return `<div class="card tight" style="margin-bottom:12px">
              <button class="monthrow" data-mk="${m.mk}" style="display:flex;width:100%;align-items:center;justify-content:space-between;text-align:left;padding:4px 0">
                <div><div style="font-weight:680;font-size:16px;color:var(--ink)">${m.label}</div><div style="font-size:12.5px;color:var(--ink-3);margin-top:3px">${fmtH(m.hours)}시간${m.ot ? " · OT " + fmtH(m.ot) + "h" : ""} · ${m.rows.length}일 근무</div></div>
                <div style="display:flex;align-items:center;gap:11px"><span class="pos" style="font-weight:700;font-size:17px">${money0(m.pay)}</span><span style="color:var(--ink-3);display:inline-flex;transition:transform .2s;transform:rotate(${open ? 90 : 0}deg)">${icon("chevR", 18)}</span></div>
              </button>
              ${open ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:2px">${m.rows.map(workDayRow).join("")}</div>` : ""}
            </div>`;
          }).join("") : `<div class="card"><div class="empty">아직 근무 기록이 없어요.<br>위 <b>근무 추가</b>로 기록하세요.</div></div>`}
        </div>
      </div>`;

    $("#wAddToggle").onclick = () => { wAddOpen = !wAddOpen; renderWork(); };
    $("#wList").querySelectorAll(".monthrow").forEach((b) => (b.onclick = () => { wOpenMonth = wOpenMonth === b.dataset.mk ? null : b.dataset.mk; renderWork(); }));

    if (wAddOpen) {
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
    btn.disabled = false; wAddOpen = false; wOpenMonth = monthKey(date); toast("근무 저장 ✓"); nav("work");
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
    btn.disabled = false; wAddOpen = false; toast(rows.length + "개 근무 저장 ✓"); nav("work");
  }

  /* ================= EXPENSES ================= */
  const EXP_CATS = ["식비", "렌트", "교통", "쇼핑", "구독", "의료", "여가", "기타"];
  const EXP_COLORS = ["#e08a5b", "#e6b54a", "#6fa8a0", "#5e7cb0", "#9887c7", "#db8cab", "#b0555f", "#7ba05b", "#c77c48", "#4c8c7d"];
  function shiftMonth(mk, delta) { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  function categoryBreakdown(mk) {
    const m = {}; S.expenses.filter((e) => monthKey(e.expense_date) === mk).forEach((e) => { const k = e.category || "기타"; m[k] = (m[k] || 0) + (Number(e.amount) || 0); });
    const total = round(Object.values(m).reduce((a, b) => a + b, 0));
    const rows = Object.keys(m).map((k) => ({ name: k, amt: round(m[k]) })).sort((a, b) => b.amt - a.amt)
      .map((r, i) => ({ ...r, color: EXP_COLORS[i % EXP_COLORS.length], pct: total > 0 ? Math.round(r.amt / total * 100) : 0 }));
    return { total, rows };
  }
  let eMonth, eAddOpen = false;
  function renderExpenses() {
    if (!eMonth) eMonth = nowMonth();
    const buckets = S.profile.buckets || [];
    const bd = categoryBreakdown(eMonth);
    const [ey, em] = eMonth.split("-"); const mLabel = `${ey}년 ${Number(em)}월`;
    const isCurrent = eMonth >= nowMonth();
    const trend = lastMonths(6).map((mk) => ({ mk, total: round(monthExpense(mk)) }));
    app.innerHTML = `
      <div class="screen fadein">
        ${topbar()}
        <h1>지출</h1>
        <div class="card">
          <div class="card-h" style="margin-bottom:16px">
            <button id="ePrev" class="hbtn" style="width:36px;height:36px"><span style="transform:rotate(180deg);display:inline-flex">${icon("chevR", 16)}</span></button>
            <div style="text-align:center"><div style="font-weight:640;font-size:14px;color:var(--ink-2)">${mLabel}</div><div style="font-size:26px;font-weight:730;margin-top:2px;letter-spacing:-.03em" class="neg">${money(bd.total)}</div></div>
            <button id="eNext" class="hbtn" style="width:36px;height:36px;${isCurrent ? "visibility:hidden" : ""}">${icon("chevR", 16)}</button>
          </div>
          ${bd.rows.length ? `<div class="chart-wrap" style="height:168px"><canvas id="eCat"></canvas></div>
            <div style="margin-top:12px">${bd.rows.map((r) => `<div class="bucket"><span class="dot" style="background:${r.color}"></span><span class="nm">${esc(r.name)}</span><span class="pc">${r.pct}%</span><span class="am neg">${money(r.amt)}</span></div>`).join("")}</div>`
            : `<div class="empty">이 달 지출 기록이 없어요.</div>`}
        </div>
        ${trend.some((t) => t.total > 0) ? `<div class="card"><div class="card-h"><h2>월별 지출 추이</h2></div><div class="chart-wrap" style="height:150px"><canvas id="eTrend"></canvas></div></div>` : ""}
        <button id="eAddToggle" class="btn ${eAddOpen ? "ghost" : ""}" style="margin-bottom:16px">${eAddOpen ? "✕ 닫기" : icon("plus", 18) + " 지출 추가"}</button>
        <div id="eAddWrap" class="${eAddOpen ? "" : "hidden"}">
          <div class="card">
            <div class="row2">
              <div class="field"><label>금액</label><input id="eAmt" class="input" type="number" inputmode="decimal" placeholder="예: 42.50"></div>
              <div class="field"><label>날짜</label><input id="eDate" class="input" type="date" value="${todayStr()}"></div>
            </div>
            <div class="field"><label>분류</label><div class="chips" id="eCats">${EXP_CATS.map((c, i) => `<div class="chip ${i === 0 ? "on" : ""}" data-cat="${c}">${c}</div>`).join("")}</div></div>
            <div class="field"><label>어느 버킷에서 나갔나요? (선택)</label>
              <select id="eBucket" class="input"><option value="">지정 안 함</option>${buckets.map((b) => `<option value="${b.key}">${esc(b.label)}</option>`).join("")}</select>
            </div>
            <button id="saveExp" class="btn">${icon("plus", 18)} 지출 저장</button>
          </div>
        </div>
        <div class="card">
          <h2>${mLabel} 내역</h2>
          <div id="eList">${expenseListForMonth(eMonth)}</div>
        </div>
      </div>`;
    $("#ePrev").onclick = () => { eMonth = shiftMonth(eMonth, -1); renderExpenses(); };
    $("#eNext").onclick = () => { if (!isCurrent) { eMonth = shiftMonth(eMonth, 1); renderExpenses(); } };
    $("#eAddToggle").onclick = () => { eAddOpen = !eAddOpen; renderExpenses(); };
    if (eAddOpen) {
      let cat = EXP_CATS[0];
      $("#eCats").querySelectorAll(".chip").forEach((c) => (c.onclick = () => { cat = c.dataset.cat; $("#eCats").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }));
      $("#saveExp").onclick = () => saveExpense(() => cat);
    }
    bindDeletes("#eList", "expenses", () => S.expenses);
    drawExpCharts(bd, trend);
  }
  function drawExpCharts(bd, trend) {
    const c1 = document.getElementById("eCat");
    if (c1 && window.Chart && bd.rows.length) {
      if (S.eCatChart) S.eCatChart.destroy();
      S.eCatChart = new Chart(c1, { type: "doughnut",
        data: { labels: bd.rows.map((r) => r.name), datasets: [{ data: bd.rows.map((r) => r.amt), backgroundColor: bd.rows.map((r) => r.color), borderColor: getCssVar("--surface"), borderWidth: 3, hoverOffset: 4 }] },
        options: { cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.label}: ${money(x.raw)}` } } } } });
    }
    const c2 = document.getElementById("eTrend");
    if (c2 && window.Chart) {
      if (S.eTrendChart) S.eTrendChart.destroy();
      S.eTrendChart = new Chart(c2, { type: "bar",
        data: { labels: trend.map((t) => Number(t.mk.slice(5)) + "월"), datasets: [{ data: trend.map((t) => t.total), backgroundColor: "#d3563b", borderRadius: 6, maxBarThickness: 34 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => money(x.raw) } } }, scales: { y: { ticks: { callback: (v) => "$" + v, font: { size: 10 } }, grid: { color: "rgba(125,125,125,.12)" } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } } });
    }
  }
  function getCssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#fff"; }
  function expenseListForMonth(mk) {
    const list = S.expenses.filter((e) => monthKey(e.expense_date) === mk).sort((a, b) => (b.expense_date + (b.created_at || "")).localeCompare(a.expense_date + (a.created_at || "")));
    if (!list.length) return `<div class="empty">이 달 지출 기록이 없습니다.</div>`;
    return list.map((e) => {
      const b = (S.profile.buckets || []).find((x) => x.key === e.bucket_key);
      const isAuto = (e.note || "").indexOf("[정기]") !== -1;
      return `<div class="item">
        <div class="ic out">${icon("outflow", 20)}</div>
        <div class="mid" data-edit="expense:${e.id}"><div class="t1">${esc(e.category || "지출")}${b ? ` · ${esc(b.label)}` : ""}${isAuto ? ` <span style="color:var(--ink-3);font-weight:500;font-size:11px">· 정기</span>` : ""}</div><div class="t2">${fmtDate(e.expense_date)} · 눌러서 편집</div></div>
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
    S.expenses.unshift(data); eAddOpen = false; eMonth = monthKey(date); toast("지출 저장 ✓"); nav("expenses");
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
          <div class="field"><label>월급날 (매달 며칠, 선택)</label><input id="sPayday" class="input" type="number" inputmode="numeric" value="${(p.setup && p.setup.payday) || ""}" placeholder="${VLANG === "en" ? "e.g. 15" : "예: 15"}"><div class="hint">${VLANG === "en" ? "On that day, the dashboard reminds you to add & allocate income." : "그 날짜가 되면 대시보드에 \"수입 넣고 배분하세요\" 알림이 떠요."}</div></div>
          <button id="saveProf" class="btn ghost sm" style="width:100%">프로필 저장</button>
        </div>

        <div class="card">
          <h2>모양</h2>
          <div class="theme-row" id="themeRow">
            <div class="opt ${getTheme() !== "dark" ? "on" : ""}" data-th="light">☀ 라이트</div>
            <div class="opt ${getTheme() === "dark" ? "on" : ""}" data-th="dark">☾ 다크</div>
          </div>
          <div style="height:10px"></div>
          <label style="font-size:12.5px;color:var(--ink-2);font-weight:540;display:block;margin-bottom:8px">언어</label>
          <div class="theme-row" id="langRow">
            <div class="opt ${getLang() === "ko" ? "on" : ""}" data-lang="ko">한국어</div>
            <div class="opt ${getLang() === "en" ? "on" : ""}" data-lang="en">English</div>
          </div>
        </div>

        <div class="card">
          <div class="card-h"><h2>알림 (푸시)</h2></div>
          <label class="switch" style="border:none;padding:6px 0"><div><div class="sl">${VLANG === "en" ? "Get push notifications" : "푸시 알림 받기"}</div><div class="sd">${VLANG === "en" ? "Payday & budget alerts on your phone. On iPhone, <b>install to Home Screen</b> first." : "월급날·예산 알림을 폰으로. iPhone은 <b>홈 화면에 설치 후</b> 켜세요."}</div></div><div id="pushTog" class="tog"></div></label>
          <button id="pushTest" class="btn ghost sm" style="width:100%;margin-top:10px">🔔 테스트 알림 보내기</button>
        </div>

        <div class="card tight">
          <button id="goNwSet" class="btn ghost sm" style="width:100%">${icon("scale", 16)} 순자산 · 계좌 관리</button>
        </div>

        <div class="card">
          <div class="card-h"><h2>정기 지출 (자동 반영)</h2></div>
          <p class="sub" style="margin:0 0 12px">${VLANG === "en" ? "Recurring monthly costs like Netflix, phone, insurance. Once added, they're <b>auto-logged as spending</b> on that day each month." : "넷플릭스·핸드폰·보험처럼 매달 자동으로 빠지는 지출. 등록하면 매달 그 날짜에 <b>지출로 자동 기록</b>됩니다."}</p>
          <div id="recurExp"></div>
        </div>

        <div class="card">
          <div class="card-h"><h2>데이터 내보내기 (CSV)</h2></div>
          <p class="sub" style="margin:0 0 12px">엑셀·구글시트에서 열 수 있어요. 세금·기록용으로 좋습니다.</p>
          <div class="row2"><button class="btn ghost sm" data-csv="incomes" style="flex:1;width:auto">수입</button><button class="btn ghost sm" data-csv="expenses" style="flex:1;width:auto">지출</button><button class="btn ghost sm" data-csv="work" style="flex:1;width:auto">근무</button></div>
        </div>

        <div class="card">
          <div class="card-h"><h2>앱 잠금 (PIN)</h2></div>
          <p class="sub" style="margin:0 0 12px">앱을 열 때 4자리 PIN을 입력하게 해요. 잔액을 남이 못 보게.</p>
          ${pinSet() ? `<div class="row2"><button id="pinChange" class="btn ghost sm" style="flex:1;width:auto">PIN 변경</button><button id="pinOff" class="btn ghost sm" style="flex:1;width:auto">잠금 끄기</button></div>` : `<button id="pinOn" class="btn ghost sm" style="width:100%">PIN 설정</button>`}
        </div>

        <div class="card">
          <h2>내 재무 상황</h2>
          <p class="hint" style="margin:0 0 8px">${VLANG === "en" ? "Your <b>recommended split</b> is calculated from this." : "이 정보로 <b>추천 배분 비율</b>이 자동 계산됩니다."}</p>
          <label class="switch"><div><div class="sl">고금리 빚이 있음</div><div class="sd">신용카드 등 이자 10%+ · 있으면 빚부터 우선</div></div><div id="tDebt" class="tog ${p.has_high_interest_debt ? "on" : ""}"></div></label>
          <label class="switch"><div><div class="sl">집(첫 주택) 살 계획</div><div class="sd">FHSA 우선 · 투자 비중 조정</div></div><div id="tHome" class="tog ${p.saving_for_home ? "on" : ""}"></div></label>
          <div class="field" style="margin-top:12px"><label>비상금 목표 (${p.currency})</label><input id="sEmg" class="input" type="number" inputmode="decimal" value="${p.emergency_target || ""}" placeholder="예: 5000"><div class="hint">보통 생활비 3~6개월치. 채워지면 투자 비중이 자동으로 커집니다.</div></div>
          <button id="applyReco" class="btn gold sm" style="width:100%">${icon("star", 17)} 이 상황 기준 추천 비율 적용</button>
        </div>

        <div class="card" id="bucketEditor"></div>

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
      if (!S.profile.setup) S.profile.setup = {};
      S.profile.setup.payday = Math.min(31, Math.max(0, Number($("#sPayday").value) || 0));
      await saveProfile({ display_name: $("#sName").value.trim(), hourly_wage: Number($("#sWage").value) || 0, currency: $("#sCur").value, setup: S.profile.setup });
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

    $("#reOnboard").onclick = () => startOnboarding();
    $("#goNwSet").onclick = () => nav("networth");
    $("#themeRow").querySelectorAll(".opt").forEach((o) => (o.onclick = () => { setTheme(o.dataset.th); renderSettings(); }));
    $("#langRow").querySelectorAll(".opt").forEach((o) => (o.onclick = () => { if (o.dataset.lang !== getLang()) { setLang(o.dataset.lang); location.reload(); } }));
    (async () => { const tog = $("#pushTog"); if (tog && pushSupported()) { const sub = await currentPushSub(); if (sub && Notification.permission === "granted") tog.classList.add("on"); } })();
    $("#pushTog").onclick = async (e) => {
      const el = e.currentTarget;
      if (el.classList.contains("on")) { await disablePush(); el.classList.remove("on"); toast("알림 껐어요"); }
      else { const r = await enablePush(); if (r.ok) { el.classList.add("on"); toast("알림 켜짐 ✓"); } else toast(r.error || "실패", true); }
    };
    $("#pushTest").onclick = async () => { toast("보내는 중…"); const r = await sendTestPush(); toast(r && r.ok ? `${r.sent}개 기기로 보냈어요 🔔` : ((r && r.error) || "실패"), !(r && r.ok)); };
    document.querySelectorAll("[data-csv]").forEach((b) => (b.onclick = () => exportCsv(b.dataset.csv)));
    { const on = $("#pinOn"); if (on) on.onclick = () => setupPinFlow(); }
    { const ch = $("#pinChange"); if (ch) ch.onclick = () => setupPinFlow(); }
    { const off = $("#pinOff"); if (off) off.onclick = () => { clearPin(); toast(VLANG === "en" ? "App lock off" : "앱 잠금 껐어요"); renderSettings(); }; }
    renderRecurringExpManager("recurExp", null);

    // 배분 항목 편집기 (추가·삭제·이름·비율)
    S._editBuckets = (S.profile.buckets || []).map((b) => ({ ...b }));
    renderBucketEditor("bucketEditor");

    $("#logout").onclick = async () => { if (confirm("로그아웃하시겠습니까? 이 기기에서 로그아웃됩니다.")) { await sb.auth.signOut(); location.reload(); } };
  }

  /* ---------- shared: delete ---------- */
  function bindDeletes(sel, table, getArr) {
    const c = $(sel); if (!c) return;
    c.querySelectorAll("[data-del]").forEach((btn) => (btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.del; const arr = getArr(); const i = arr.findIndex((x) => x.id === id); if (i < 0) return;
      const rec = arr[i];
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) return toast("삭제 실패: " + error.message, true);
      arr.splice(i, 1); render();
      undoToast("삭제됐어요", async () => {
        const { data, error: e2 } = await sb.from(table).insert(rec).select().single();
        if (e2 || !data) return toast("복구 실패", true);
        arr.unshift(data); if (table === "work_logs") sortWork();
        render(); toast("복구됨 ✓");
      });
    }));
  }

  /* ---- 삭제 실행취소 토스트 ---- */
  let undoTimer;
  function undoToast(msg, onUndo) {
    clearTimeout(toastT); clearTimeout(undoTimer);
    toastEl.className = "toast show";
    toastEl.innerHTML = `${esc(msg)} <a id="undoBtn" style="color:var(--brand);font-weight:700;margin-left:12px;text-decoration:underline">실행취소</a>`;
    const b = toastEl.querySelector("#undoBtn");
    b.onclick = async () => { clearTimeout(undoTimer); toastEl.className = "toast"; toastEl.textContent = ""; await onUndo(); };
    undoTimer = setTimeout(() => { toastEl.className = "toast"; toastEl.textContent = ""; }, 5000);
  }

  /* ---- 기록 편집 바텀시트 ---- */
  function showSheet(innerHTML) {
    const ov = document.createElement("div"); ov.className = "sheet-ov";
    ov.innerHTML = `<div class="sheet">${innerHTML}</div>`;
    document.body.appendChild(ov);
    const close = () => { ov.classList.remove("show"); setTimeout(() => ov.remove(), 220); };
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    requestAnimationFrame(() => ov.classList.add("show"));
    return { ov, close };
  }
  function openEdit(type, id) {
    if (type === "income") {
      const r = S.incomes.find((x) => x.id === id); if (!r) return;
      const { ov, close } = showSheet(`
        <div class="sheet-h"><h2>수입 편집</h2><button class="del" id="shClose">${icon("close", 18)}</button></div>
        <div class="field"><label>금액</label><input id="shAmt" class="input" type="number" inputmode="decimal" value="${r.amount}"></div>
        <div class="row2"><div class="field"><label>출처</label><input id="shSrc" class="input" value="${esc(r.source || "")}"></div>
          <div class="field"><label>날짜</label><input id="shDate" class="input" type="date" value="${r.income_date}"></div></div>
        <button id="shSave" class="btn">저장</button>`);
      ov.querySelector("#shClose").onclick = close;
      ov.querySelector("#shSave").onclick = async () => {
        const amt = Number(ov.querySelector("#shAmt").value); if (!amt || amt <= 0) return toast("금액을 입력하세요.", true);
        const src = ov.querySelector("#shSrc").value.trim(); const date = ov.querySelector("#shDate").value || r.income_date;
        let alloc = r.allocation || [];
        if (alloc.length) { alloc = alloc.map((a) => ({ ...a, amount: round((Number(a.percent) || 0) * amt / 100) })); const s = alloc.reduce((x, y) => x + y.amount, 0); const d = round(amt - s); if (d && alloc.length) { const big = alloc.reduce((x, y) => (y.amount > x.amount ? y : x), alloc[0]); big.amount = round(big.amount + d); } }
        const { data, error } = await sb.from("incomes").update({ amount: amt, source: src, income_date: date, allocation: alloc }).eq("id", id).select().single();
        if (error) return toast("저장 실패: " + error.message, true);
        Object.assign(r, data); close(); render(); toast("수정됨 ✓");
      };
    } else if (type === "expense") {
      const r = S.expenses.find((x) => x.id === id); if (!r) return;
      const buckets = S.profile.buckets || [];
      const { ov, close } = showSheet(`
        <div class="sheet-h"><h2>지출 편집</h2><button class="del" id="shClose">${icon("close", 18)}</button></div>
        <div class="row2"><div class="field"><label>금액</label><input id="shAmt" class="input" type="number" inputmode="decimal" value="${r.amount}"></div>
          <div class="field"><label>날짜</label><input id="shDate" class="input" type="date" value="${r.expense_date}"></div></div>
        <div class="field"><label>분류</label><div class="chips" id="shCats">${EXP_CATS.map((c) => `<div class="chip ${c === r.category ? "on" : ""}" data-cat="${c}">${c}</div>`).join("")}</div></div>
        <div class="field"><label>버킷 (선택)</label><select id="shBucket" class="input"><option value="">지정 안 함</option>${buckets.map((b) => `<option value="${b.key}" ${b.key === r.bucket_key ? "selected" : ""}>${esc(b.label)}</option>`).join("")}</select></div>
        <button id="shSave" class="btn">저장</button>`);
      let cat = r.category || EXP_CATS[0];
      ov.querySelector("#shClose").onclick = close;
      ov.querySelectorAll("#shCats .chip").forEach((c) => (c.onclick = () => { cat = c.dataset.cat; ov.querySelectorAll("#shCats .chip").forEach((x) => x.classList.toggle("on", x === c)); }));
      ov.querySelector("#shSave").onclick = async () => {
        const amt = Number(ov.querySelector("#shAmt").value); if (!amt || amt <= 0) return toast("금액을 입력하세요.", true);
        const date = ov.querySelector("#shDate").value || r.expense_date; const bucket = ov.querySelector("#shBucket").value || null;
        const { data, error } = await sb.from("expenses").update({ amount: amt, expense_date: date, category: cat, bucket_key: bucket }).eq("id", id).select().single();
        if (error) return toast("저장 실패: " + error.message, true);
        Object.assign(r, data); close(); render(); toast("수정됨 ✓");
      };
    } else if (type === "work") {
      const r = S.work.find((x) => x.id === id); if (!r) return;
      const { ov, close } = showSheet(`
        <div class="sheet-h"><h2>근무 편집</h2><button class="del" id="shClose">${icon("close", 18)}</button></div>
        <div class="row2"><div class="field"><label>날짜</label><input id="shDate" class="input" type="date" value="${r.work_date}"></div>
          <div class="field"><label>시간</label><input id="shHours" class="input" type="number" inputmode="decimal" value="${r.hours}"></div></div>
        <div class="row2"><div class="field"><label>시급</label><input id="shWage" class="input" type="number" inputmode="decimal" value="${r.hourly_wage}"></div>
          <div class="field"><label>장소</label><input id="shNote" class="input" value="${esc(r.note || "")}"></div></div>
        <button id="shSave" class="btn">저장</button>`);
      ov.querySelector("#shClose").onclick = close;
      ov.querySelector("#shSave").onclick = async () => {
        const hours = Number(ov.querySelector("#shHours").value); if (!hours || hours <= 0) return toast("시간을 입력하세요.", true);
        const wage = Number(ov.querySelector("#shWage").value) || 0; const date = ov.querySelector("#shDate").value || r.work_date; const note = ov.querySelector("#shNote").value.trim() || null;
        const { data, error } = await sb.from("work_logs").update({ work_date: date, hours, hourly_wage: wage, note }).eq("id", id).select().single();
        if (error) return toast("저장 실패: " + error.message, true);
        Object.assign(r, data); sortWork(); close(); render(); toast("수정됨 ✓");
      };
    }
  }

  /* ================= BOOT ================= */
  function showLoading() {
    tabbar.classList.add("hidden");
    // 이미 스플래시가 떠 있으면 다시 그리지 않음 (애니메이션 재생 중복 방지)
    if (app.querySelector(".splash")) return;
    app.innerHTML = `<div class="splash"><div class="splash-in">
      <div class="splash-mark">${icon("mark", 36)}</div>
      <div class="splash-name">VAULT</div>
      <div class="splash-sub">${VLANG === "en" ? "Smart money, on autopilot" : "스마트 자산 관리"}</div>
    </div></div>`;
  }

  // 세션 확보 후 데이터 로드 + 대시보드. (onAuthStateChange 콜백 밖에서만 호출 → 교착 방지)
  async function enter(user) {
    S.user = user; showLoading();
    try {
      await loadAll();
      const go = () => { if (!S.profile.onboarded) startOnboarding(); else nav("dashboard"); };
      if (pinSet() && !S.unlocked) askUnlock(go); else go();
    } catch (e) { toast("불러오기 오류: " + (e.message || e), true); renderAuth(); }
  }

  /* ---- 당겨서 새로고침 (pull-to-refresh) ---- */
  function initPullRefresh() {
    const ind = document.createElement("div");
    ind.id = "ptr";
    ind.innerHTML = `<div class="ptr-c"><div class="spinner"></div></div>`;
    document.body.appendChild(ind);
    const scroller = () => document.scrollingElement || document.documentElement;
    const canPull = () => S.user && S.profile && !S.refreshing && !document.querySelector(".auth, .photo-ov, .sheet-ov") && scroller().scrollTop <= 0;
    const TH = 72;
    let startY = 0, pulling = false, dist = 0;
    window.addEventListener("touchstart", (e) => { if (!canPull()) { pulling = false; return; } startY = e.touches[0].clientY; pulling = true; dist = 0; }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (!pulling) return;
      if (scroller().scrollTop > 0) { pulling = false; ind.classList.remove("show", "ready"); ind.style.transform = "translateY(-46px)"; return; }
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) { ind.classList.remove("show", "ready"); ind.style.transform = "translateY(-46px)"; return; }
      e.preventDefault();
      const d = Math.min(dist * 0.5, 96);
      ind.style.transition = "none";
      ind.style.transform = `translateY(${d - 46}px)`;
      ind.style.setProperty("--ptr-rot", Math.min(dist * 2.4, 360) + "deg");
      ind.classList.add("show");
      ind.classList.toggle("ready", dist > TH);
    }, { passive: false });
    window.addEventListener("touchend", async () => {
      if (!pulling) return;
      pulling = false;
      ind.style.transition = "transform .25s";
      if (dist > TH) {
        S.refreshing = true;
        ind.classList.add("load");
        ind.style.transform = "translateY(14px)";
        try { await loadAll(); render(); } catch (e) { toast(VLANG === "en" ? "Refresh failed" : "새로고침 실패", true); }
        ind.classList.remove("load");
        S.refreshing = false;
      }
      ind.classList.remove("show", "ready");
      ind.style.transform = "translateY(-46px)";
      dist = 0;
    }, { passive: true });
  }

  async function boot() {
    setTheme(getTheme());
    startI18n();
    initPullRefresh();
    showLoading();
    const splashStart = Date.now();
    // 비밀번호 재설정 링크로 들어온 경우 → 새 비밀번호 화면
    if (location.hash && location.hash.indexOf("type=recovery") !== -1) { renderNewPassword(); return; }
    let session = null;
    try { const { data } = await sb.auth.getSession(); session = data?.session || null; } catch (_) {}
    // 스플래시가 최소 1.2초는 보이도록 (너무 빨라서 안 보이는 문제)
    await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - splashStart))));
    if (session) await enter(session.user);
    else renderAuth();
  }

  // 콜백 안에서는 절대 다른 supabase 호출을 await 하지 않는다 (교착 방지).
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") renderNewPassword();
    else if (event === "SIGNED_OUT") { S.user = null; renderAuth(); }
  });

  boot();
})();
