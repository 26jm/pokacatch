const API_BASE_URL = window.__API_BASE_URL__ || (window.location.protocol === "file:" ? "http://localhost:3000" : "");
const PAGE_SIZE = 6;
const ALIAS_MAP = {
  "에스파": ["aespa", "에스파"],
  aespa: ["aespa", "에스파"],
  "카리나": ["karina", "카리나"],
  karina: ["karina", "카리나"],
  "윈터": ["winter", "윈터"],
  winter: ["winter", "윈터"],
  "아이브": ["ive", "아이브"],
  ive: ["ive", "아이브"],
  "뉴진스": ["newjeans", "뉴진스"],
  newjeans: ["newjeans", "뉴진스"]
};
const products = [
  { id: "p1", title: "SEVENTEEN 5집 포토카드 세트", category: "포토카드", tags: ["SEVENTEEN", "랜덤"], members: ["민규", "원우", "호시", "도겸"], price: 12500, participants: 42, min: 50, deadline: 3, popularity: 93, recency: 0.8, member_limit: 15, demo: true },
  { id: "p2", title: "aespa 공식 응원봉 공동구매", category: "응원봉", tags: ["aespa", "에스파", "공식"], price: 39800, participants: 76, min: 70, deadline: 1, popularity: 98, recency: 0.9, demo: true },
  { id: "p3", title: "BTS 앨범 럭키드로우", category: "앨범", tags: ["BTS", "앨범"], members: ["RM", "진", "슈가", "제이홉", "지민", "뷔", "정국"], price: 21900, participants: 18, min: 40, deadline: 6, popularity: 88, recency: 0.6, member_limit: 3, demo: true },
  { id: "p4", title: "IVE 미니돌 키링", category: "인형", tags: ["IVE", "아이브", "키링"], members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"], price: 18300, participants: 35, min: 35, deadline: 2, popularity: 91, recency: 0.7, member_limit: 10, demo: true },
  { id: "p5", title: "TXT 투어 티셔츠", category: "의류", tags: ["TXT", "투어"], members: ["수빈", "연준", "범규", "태현", "휴닝카이"], price: 28700, participants: 14, min: 30, deadline: 5, popularity: 72, recency: 0.5, member_limit: 8, demo: true },
  { id: "p6", title: "BLACKPINK 데코 스티커", category: "액세서리", tags: ["BLACKPINK", "한정"], members: ["지수", "제니", "로제", "리사"], price: 6900, participants: 61, min: 60, deadline: 4, popularity: 84, recency: 0.85, demo: true },
  { id: "p7", title: "에스파 카리나 포토카드 분철", category: "포토카드", tags: ["에스파", "aespa", "카리나", "karina"], members: ["카리나", "윈터", "지젤", "닝닝"], price: 15000, participants: 28, min: 40, deadline: 2, popularity: 95, recency: 0.9, member_limit: 12, demo: true },
  { id: "p8", title: "뉴진스 앨범 공동구매", category: "앨범", tags: ["뉴진스", "newjeans"], members: ["민지", "하니", "다니엘", "해린", "혜인"], price: 20500, participants: 22, min: 30, deadline: 4, popularity: 89, recency: 0.75, member_limit: 10, demo: true },
  { id: "p9", title: "아이브 장원영 포카 세트", category: "포토카드", tags: ["아이브", "ive", "장원영"], members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"], price: 9900, participants: 19, min: 25, deadline: 3, popularity: 86, recency: 0.7, member_limit: 8, demo: true },
  { id: "p10", title: "윈터 포토북 분철", category: "굿즈", tags: ["윈터", "winter", "aespa"], price: 24000, participants: 11, min: 20, deadline: 7, popularity: 77, recency: 0.55, demo: true },
  { id: "p11", title: "NewJeans 키링 공동구매", category: "액세서리", tags: ["newjeans", "뉴진스", "키링"], price: 8900, participants: 44, min: 50, deadline: 1, popularity: 90, recency: 0.88, demo: true },
  { id: "p12", title: "Karina 아크릴 스탠드", category: "굿즈", tags: ["karina", "카리나", "에스파"], price: 16500, participants: 9, min: 15, deadline: 5, popularity: 80, recency: 0.6, demo: true }
];
const state = { cart: [], role: "CUSTOMER", language: "ko", userId: null };
const DEMO_ACCOUNT = { id: "pokacatch1", email: "pokacatch1", password: "pokacatch1", role: "CUSTOMER" };
const DEMO_ADMIN_ACCOUNT = { id: "adminpokacatch", email: "adminpokacatch", password: "adminpokacatch", role: "ADMIN" };
const catalog = { page: 1, items: [], total: 0, loading: false, done: false };
const money = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const byId = (id) => document.getElementById(id);

function expandSearchTerms(keyword) {
  if (!keyword) return [];
  const lower = keyword.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (key.toLowerCase() === lower) return aliases;
  }
  return [keyword.trim()];
}

function getFilteredProducts() {
  const keyword = byId("keyword").value.trim();
  const terms = expandSearchTerms(keyword).map((term) => term.toLowerCase());
  return products.filter((product) => {
    if (!keyword) return true;
    const hay = [product.title, product.category, ...(product.tags || []), ...(product.members || [])].join(" ").toLowerCase();
    return terms.some((term) => hay.includes(term));
  });
}

async function loadMemberCounts(productId, memberSelects) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/members/${productId}`, { headers: identityHeaders() });
    updateMemberOptions(productId, memberSelects, await response.json());
  } catch (error) {
    console.warn("멤버 선택 현황 로드 실패:", error);
  }
}

function updateMemberOptions(productId, memberSelects, memberCounts) {
  if (!memberCounts) return;
  memberSelects.forEach((select, rankIndex) => {
    [...select.options].slice(1).forEach((option) => {
      const member = option.value;
      const isSelected = option.value === select.value;
      if (rankIndex === 0) {
        const count = memberCounts[member]?.rank1 || 0;
        const limit = memberCounts[member]?.limit || 20;
        option.disabled = count >= limit && !isSelected;
        option.textContent = count >= limit && !isSelected ? `${member} (제한 인원 도달)` : member;
      } else {
        option.disabled = false;
        option.textContent = member;
      }
    });
  });
}

function productCard(product) {
  const node = byId("product-template").content.cloneNode(true);
  const ratio = Math.min(100, Math.round(product.participants / product.min * 100));
  node.querySelector("h3").textContent = product.title;
  node.querySelector(".category-badge").textContent = t(product.category);
  node.querySelector(".deadline").textContent = deadlineText(product.deadline);
  node.querySelector(".tags").textContent = product.tags.map((tag) => `#${tag}`).join(" ");
  node.querySelector(".price").textContent = money.format(product.price);
  node.querySelector(".progress-copy").textContent = progressText(product.participants, product.min);
  node.querySelector(".progress-track span").style.width = `${ratio}%`;
  node.querySelector(".join-button").dataset.productId = product.id;
  const demoBadge = node.querySelector(".demo-badge");
  if (demoBadge) demoBadge.hidden = !product.demo;
  if (product.members?.length) {
    const memberSelects = node.querySelectorAll(".member-select");
    memberSelects.forEach((select) => product.members.forEach((member) => select.append(new Option(member, member))));
    loadMemberCounts(product.id, memberSelects);
    memberSelects.forEach((select) => select.addEventListener("change", () => updatePickOptions(memberSelects)));
  } else {
    const fieldset = node.querySelector(".member-picker");
    if (fieldset) fieldset.style.display = "none";
  }
  return node;
}

function updatePickOptions(memberSelects) {
  const selected = new Set([...memberSelects].map((select) => select.value).filter(Boolean));
  memberSelects.forEach((select) => [...select.options].forEach((option) => {
    option.disabled = Boolean(option.value && selected.has(option.value) && option.value !== select.value);
  }));
}

function isAuthenticated() { return Boolean(state.userId); }
function activateUser(user) {
  state.userId = user.id;
  state.role = user.role;
  byId("login-button").textContent = "로그아웃";
  applyRoleVisibility();
}
function requireLogin() {
  if (isAuthenticated()) return true;
  toast("로그인이 필요합니다.");
  byId("login-dialog").showModal();
  return false;
}

function summaryText(count) {
  if (state.language === "en") return `${count} group buys`;
  if (state.language === "ar") return `${count} عمليات شراء`;
  if (state.language === "ja") return `${count}件の共同購入`;
  if (state.language === "zh") return `${count}个团购`;
  return `${count}개 공동구매`;
}

function resetCatalog() {
  catalog.page = 1;
  catalog.items = [];
  catalog.done = false;
  byId("product-grid").replaceChildren();
  loadNextPage();
}

function loadNextPage() {
  if (document.body.dataset.view !== "home") return;
  if (catalog.loading || catalog.done) return;
  catalog.loading = true;
  byId("load-status").hidden = catalog.page === 1;
  const filtered = getFilteredProducts();
  catalog.total = filtered.length;
  const start = (catalog.page - 1) * PAGE_SIZE;
  const next = filtered.slice(start, start + PAGE_SIZE);
  catalog.items.push(...next);
  byId("product-grid").append(...next.map(productCard));
  catalog.done = catalog.items.length >= filtered.length;
  catalog.page += 1;
  catalog.loading = false;
  byId("load-status").hidden = true;
  byId("result-summary").textContent = summaryText(catalog.total);
  translateDocument(state.language);
}

function renderCart() {
  const items = state.cart
    .map((entry) => ({ product: products.find((item) => item.id === (typeof entry === "string" ? entry : entry.productId)), picks: typeof entry === "string" ? [] : entry.picks }))
    .filter((entry) => entry.product);
  byId("cart-count").textContent = items.length;
  byId("cart-total").textContent = money.format(0);
  byId("cart-items").replaceChildren(...(items.length ? items.map(({ product, picks }) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    const picksText = product.members && picks.length ? `1지망 ${picks[0]} · 2지망 ${picks[1]} · 3지망 ${picks[2]}` : product.category;
    row.innerHTML = `<p><strong>${product.title}</strong><br><span class="muted">${picksText}</span><br><span class="muted">${money.format(product.price)} 표시 · 실결제 0원</span></p><strong>${money.format(0)}</strong>`;
    return row;
  }) : [Object.assign(document.createElement("p"), { textContent: "장바구니가 비어 있습니다.", className: "muted" })]));
}

function renderSeller() {
  const seller = state.role === "SELLER" || state.role === "ADMIN";
  const badge = byId("seller-access");
  const area = byId("seller-content");
  badge.textContent = seller ? `${state.role} 권한으로 열람 중` : "SELLER 권한 필요";
  badge.className = `status${seller ? "" : " denied"}`;
  if (!seller) {
    area.innerHTML = '<p class="muted">판매자 또는 관리자로 전환하면 판매 현황을 확인할 수 있습니다.</p>';
    return;
  }
  const active = products.filter((p) => p.participants < p.min);
  area.innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.reduce((sum, p) => sum + p.participants, 0)}개</strong><span>누적 참여 수</span></div><div class="metric"><strong>${active.length}건</strong><span>진행 중 공동구매</span></div><div class="metric"><strong>${money.format(0)}</strong><span>체험 결제 실청구액</span></div></div><div class="table-wrap"><table class="seller-table"><thead><tr><th>상품</th><th>참여 현황</th><th>목표 달성률</th><th>상태</th></tr></thead><tbody>${products.map((p) => `<tr><td>${p.title}${p.demo ? " (체험용)" : ""}</td><td>${p.participants} / ${p.min}명</td><td>${Math.round(p.participants / p.min * 100)}%</td><td>${p.participants >= p.min ? "목표 달성" : "모집 중"}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderAdmin() {
  const admin = state.role === "ADMIN";
  byId("admin-access").textContent = admin ? "ADMIN 권한으로 열람 중" : "ADMIN 권한 필요";
  byId("admin-access").className = `status${admin ? "" : " denied"}`;
  if (!admin) {
    byId("admin-content").innerHTML = '<div class="admin-gate"><p class="muted">관리자 계정으로 로그인한 뒤에만 분석 데이터와 정산 관리를 볼 수 있습니다. 직접 URL 접근 시 API는 403을 반환합니다.</p></div>';
    return;
  }
  byId("admin-content").innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.length}건</strong><span>전체 공고</span></div><div class="metric"><strong>${money.format(products.reduce((sum, p) => sum + p.price * p.participants, 0))}</strong><span>표시 거래액</span></div><div class="metric"><strong>${money.format(0)}</strong><span>실 정산 청구액</span></div></div>`;
}

function applyRoleVisibility() {
  document.querySelectorAll("[data-role-nav]").forEach((link) => {
    const required = link.dataset.roleNav;
    link.hidden = required === "ADMIN" ? state.role !== "ADMIN" : !(state.role === "SELLER" || state.role === "ADMIN");
  });
}

function showView(name) {
  if (["workbench", "mypage"].includes(name) && !requireLogin()) {
    name = "home";
  }
  if (name === "admin" && state.role !== "ADMIN") {
    toast("관리자만 접근할 수 있습니다.");
    name = "home";
  }
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== name;
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.viewLink === name);
  });
  document.body.dataset.view = name;
  history.replaceState(null, "", `#${name}`);
  byId("primary-nav").classList.remove("is-open");
  if (name === "seller") renderSeller();
  if (name === "admin") renderAdmin();
  if (name === "mypage") renderActivities();
}

function toast(message) {
  const target = byId("toast");
  target.textContent = message;
  target.classList.add("show");
  setTimeout(() => target.classList.remove("show"), 2200);
}

const languageMessages = { ko: "언어가 변경되었습니다.", en: "Language changed.", ar: "تم تغيير اللغة.", ja: "言語を変更しました。", zh: "语言已切换。" };
const translations = {
  en: { "언어 선택": "Language", "고객": "Customer", "판매자": "Seller", "관리자": "Admin", "한국어": "Korean", "둘러보기": "Explore", "공구 관리": "Group Buy", "마이페이지": "My Page", "알림": "Notifications", "장바구니": "Cart", "진행 중인 공고": "Active listings", "검색어": "Search", "에스파, aespa, 카리나 등 한/영 검색": "Search aespa, Karina, Korean or English", "검색": "Search", "공구 작업실": "Group Buy Workspace", "대기 중": "Waiting", "계정·환급 계좌": "Account and payout account", "이메일": "Email", "비밀번호": "Password", "역할": "Role", "참여자": "Participant", "총대": "Organizer", "회원가입": "Sign up", "로그인": "Log in", "환급 계좌": "Payout account", "계좌 저장": "Save account", "공구 개설": "Create group buy", "아이돌": "Artist", "그룹명": "Group name", "굿즈": "Goods", "포토카드": "Photocard", "트위터 핸들": "Twitter handle", "1차 판매처": "Primary retailer", "마감일": "Deadline", "자리와 가격": "Slots and prices", "필요 앨범 수량": "Album quantity", "보증금 안내 후 공구 오픈": "Open after deposit instructions", "문서 AI 처리": "AI document processing", "문서 종류": "Document type", "영수증": "Receipt", "송장": "Waybill", "트위터/X 공고": "X listing", "캡처 텍스트": "Captured text", "Upstage로 구조화": "Structure with Upstage", "아직 처리된 문서가 없습니다.": "No document has been processed yet.", "내 활동": "My Activity", "로그아웃 상태": "Logged out", "내 참여": "My participation", "정산·환불": "Payouts and refunds", "알림·분쟁": "Alerts and disputes", "자리 알림 대기 등록": "Notify me when a slot opens", "현재 주문 분쟁 신고": "Report a dispute", "닫기": "Close", "합계": "Total", "0원 체험 결제": "0 KRW demo pay", "멤버 지망 선택": "Choose member preferences", "선택": "Select", "지망 선택 후 담기": "Choose preferences and add", "SELLER 권한 필요": "SELLER access required", "(체험용)": "(Demo)" },
  ar: { "언어 선택": "اللغة", "고객": "عميل", "판매자": "بائع", "관리자": "مسؤول", "둘러보기": "استكشاف", "공구 관리": "الشراء الجماعي", "마이페이지": "صفحتي", "장바구니": "السلة", "진행 중인 공고": "الإعلانات النشطة", "검색": "بحث", "0원 체험 결제": "دفع تجريبي 0", "(체험용)": "(تجريبي)" },
  ja: { "언어 선택": "言語", "고객": "購入者", "판매자": "販売者", "관리자": "管理者", "둘러보기": "見つける", "공구 관리": "共同購入管理", "마이페이지": "マイページ", "장바구니": "カート", "진행 중인 공고": "受付中の告知", "검색": "検索", "0원 체험 결제": "0円の体験決済", "(체험용)": "(体験用)" },
  zh: { "언어 선택": "语言", "고객": "客户", "판매자": "卖家", "관리자": "管理员", "둘러보기": "浏览", "공구 관리": "团购管理", "마이페이지": "我的页面", "장바구니": "购物车", "진행 중인 공고": "进行中的公告", "검색": "搜索", "0원 체험 결제": "0元体验支付", "(체험용)": "(体验)" }
};
Object.assign(translations.en, { "1지망": "1st choice", "2지망": "2nd choice", "3지망": "3rd choice", "장바구니가 비어 있습니다.": "Your cart is empty.", "누적 참여 수": "Total participants", "진행 중 공동구매": "Active group buys", "상품": "Product", "참여 현황": "Participation", "목표 달성률": "Goal progress", "상태": "Status", "목표 달성": "Goal reached", "모집 중": "Recruiting" });
const sourceText = new WeakMap();
const sourceAttributes = new WeakMap();
function t(value) { return translations[state.language]?.[value] || value; }
function deadlineText(days) {
  if (state.language === "en") return days === 1 ? "Ends today" : `${days} days left`;
  if (state.language === "ar") return days === 1 ? "ينتهي اليوم" : `متبقٍ ${days} أيام`;
  if (state.language === "ja") return days === 1 ? "本日締切" : `あと${days}日`;
  if (state.language === "zh") return days === 1 ? "今日截止" : `剩余${days}天`;
  return days === 1 ? "오늘 마감" : `${days}일 남음`;
}
function progressText(participants, minimum) {
  if (state.language === "en") return `${participants} joined · goal ${minimum}`;
  if (state.language === "ar") return `${participants} مشارك · الهدف ${minimum}`;
  if (state.language === "ja") return `${participants}人参加 · 目標${minimum}人`;
  if (state.language === "zh") return `已参加${participants}人 · 目标${minimum}人`;
  return `${participants}명 참여 · 목표 ${minimum}명`;
}
function translateNode(node, language) {
  if (node.nodeType === Node.TEXT_NODE) {
    const original = sourceText.get(node) || node.nodeValue;
    if (node.nodeValue.trim()) {
      sourceText.set(node, original);
      const leading = original.match(/^\s*/)[0];
      const trailing = original.match(/\s*$/)[0];
      node.nodeValue = `${leading}${translations[language]?.[original.trim()] || original.trim()}${trailing}`;
    }
  } else {
    if (node.nodeType === Node.ELEMENT_NODE) ["placeholder", "aria-label"].forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (!value) return;
      const attributes = sourceAttributes.get(node) || {};
      const original = attributes[attribute] || value;
      attributes[attribute] = original;
      sourceAttributes.set(node, attributes);
      node.setAttribute(attribute, translations[language]?.[original] || original);
    });
    [...node.childNodes].forEach((child) => translateNode(child, language));
  }
}
function translateDocument(language) {
  translateNode(document.body, language);
  translateNode(byId("product-template").content, language);
}
function setDocumentLanguage(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  translateDocument(language);
}

function identityHeaders() {
  return { "X-Demo-Role": state.role, "X-Demo-User": state.userId };
}

document.addEventListener("click", (event) => {
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    event.preventDefault();
    showView(viewLink.dataset.viewLink);
    return;
  }
  const button = event.target.closest(".join-button");
  if (button) {
    if (!requireLogin()) return;
    const card = button.closest(".product-card");
    const picks = [...card.querySelectorAll(".member-select")].map((select) => select.value);
    const id = button.dataset.productId;
    const product = products.find((item) => item.id === id);
    if (product.members?.length) {
      if (picks.some((pick) => !pick)) { toast("1~3지망 멤버를 모두 선택해 주세요."); return; }
      if (new Set(picks).size !== picks.length) { toast("각 지망은 서로 다른 멤버로 선택해 주세요."); return; }
    }
    if (!state.cart.some((entry) => (typeof entry === "string" ? entry : entry.productId) === id)) {
      state.cart.push({ productId: id, picks: product.members ? picks : [], heldUntil: Date.now() + 5 * 60 * 1000 });
      addToCartViaAPI(id, product.members ? picks : []);
      saveActivity({ type: "participation", title: product.title, message: "5분 선점 · 신청 정보와 입금 대기" });
      renderCart();
      renderActivities();
      toast("5분 동안 자리를 선점했습니다.");
    } else toast("이미 장바구니에 있습니다.");
  }
  if (event.target.closest("[data-social-login]")) {
    toast("소셜 로그인은 OAuth 제공자 설정 후 사용할 수 있습니다.");
  }
  if (event.target.closest("[data-close-dialog]")) byId("cart-dialog").close();
  if (event.target.closest("[data-close-dialog]")) byId("login-dialog").close();
});

async function addToCartViaAPI(productId, picks) {
  try {
    await fetch(`${API_BASE_URL}/api/v1/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ product_id: productId, picks })
    });
  } catch (error) {
    console.warn("장바구니 API 추가 실패:", error);
  }
}

byId("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  resetCatalog();
});
byId("login-button").addEventListener("click", () => {
  if (isAuthenticated()) {
    state.userId = null;
    state.role = "CUSTOMER";
    applyRoleVisibility();
    state.cart = [];
    renderCart();
    byId("login-button").textContent = "로그인";
    toast("로그아웃했습니다.");
    return;
  }
  byId("login-dialog").showModal();
});
byId("cart-button").addEventListener("click", () => {
  if (!requireLogin()) return;
  renderCart();
  byId("cart-dialog").showModal();
});
byId("menu-button").addEventListener("click", () => byId("primary-nav").classList.toggle("is-open"));

async function checkout() {
  const productIds = state.cart.map((entry) => typeof entry === "string" ? entry : entry.productId);
  if (!productIds.length) return toast("장바구니가 비어 있습니다.");
  try {
    const charge = await fetch(`${API_BASE_URL}/api/payments/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ project_id: productIds[0], slot_id: productIds[0], amount: 0 })
    });
    const charged = await charge.json();
    if (charge.ok && charged.payment?.amount !== 0) throw new Error("실결제 금액이 0원이 아닙니다.");
    const response = await fetch(`${API_BASE_URL}/api/v1/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ product_ids: productIds, charge_amount: 0 })
    });
    const result = await response.json();
    if (!response.ok && !charge.ok) throw new Error(result.error || charged.error || "결제에 실패했습니다.");
    await saveActivity({ type: "settlement", title: "0원 체험 결제 완료", message: `${productIds.length}건 · 실청구 0원` });
    state.cart = [];
    renderCart();
    renderActivities();
    toast("체험 결제가 완료되었습니다. 카드 청구는 0원입니다.");
    byId("cart-dialog").close();
  } catch (error) {
    await saveActivity({ type: "settlement", title: "0원 체험 결제", message: `${productIds.length}건 · 실청구 0원으로 기록` });
    state.cart = [];
    renderCart();
    renderActivities();
    toast(`체험 결제(0원)로 기록했습니다: ${error.message}`);
    byId("cart-dialog").close();
  }
}
byId("checkout-button").addEventListener("click", checkout);
byId("language-select").addEventListener("change", (event) => {
  state.language = event.target.value;
  setDocumentLanguage(state.language);
  resetCatalog();
  renderCart();
  renderSeller();
  renderAdmin();
  toast(languageMessages[state.language] || languageMessages.ko);
});

async function saveActivity(value) {
  try {
    await fetch(`${API_BASE_URL}/api/v1/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify(value)
    });
  } catch (error) {
    console.warn("Supabase 활동 기록 실패:", error);
  }
}
async function renderActivities() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/activity`, { headers: identityHeaders() });
    const result = await response.json();
    const render = (id, values, empty) => byId(id).replaceChildren(...(values.length
      ? values.map((item) => Object.assign(document.createElement("p"), { className: "activity-item", textContent: `${item.title || item.message} · ${new Date(item.created_at).toLocaleString("ko-KR")}` }))
      : [Object.assign(document.createElement("p"), { className: "muted", textContent: empty })]));
    render("participation-list", result.items.filter((item) => item.type === "participation"), "참여한 공구가 없습니다.");
    render("settlement-list", result.items.filter((item) => item.type === "settlement"), "정산·환불 내역이 없습니다.");
    render("notification-list", result.items.filter((item) => item.type === "notification" || item.type === "dispute"), "새 알림이 없습니다.");
    byId("identity-status").textContent = result.account ? `계좌 등록됨 · ${state.role}` : `계정 세션 · ${state.role}`;
  } catch (error) {
    console.warn("Supabase 활동 조회 실패:", error);
  }
}
function setWorkflowStatus(message, danger = false) {
  const status = byId("workflow-status");
  status.textContent = message;
  status.className = `status${danger ? " denied" : ""}`;
  toast(message);
}
function parseSlots(value) {
  return value.split(",").map((entry) => {
    const [member_name, price] = entry.split(":").map((part) => part.trim());
    return { member_name, price: Number(price) };
  }).filter((slot) => slot.member_name && Number.isFinite(slot.price));
}
async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const action = event.submitter?.dataset.action;
  const data = Object.fromEntries(new FormData(form));
  if (action === "save-account" || !data.email || !data.password) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "인증에 실패했습니다.");
    state.userId = result.user.id;
    state.role = result.user.role;
    byId("login-button").textContent = "로그아웃";
    applyRoleVisibility();
    setWorkflowStatus(action === "register" ? "회원가입이 완료되었습니다." : "로그인했습니다.");
    renderSeller();
    renderAdmin();
    renderActivities();
    loadCart();
  } catch (error) {
    setWorkflowStatus(`인증 실패: ${error.message}`, true);
  }
}

async function submitQuickLogin(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "인증에 실패했습니다.");
    activateUser(result.user);
    byId("login-dialog").close();
    toast("로그인했습니다.");
    loadCart();
    renderActivities();
  } catch (error) {
    const demoAccount = [DEMO_ACCOUNT, DEMO_ADMIN_ACCOUNT].find((account) => account.email === data.email && account.password === data.password);
    if (demoAccount) {
      activateUser(demoAccount);
      byId("login-dialog").close();
      toast("데모 계정으로 로그인했습니다.");
      return;
    }
    toast(`로그인 실패: ${error.message}`);
  }
}
async function openProject(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const slots = parseSlots(data.slots);
  if (!slots.length) return setWorkflowStatus("자리를 member:가격 형식으로 입력해 주세요.", true);
  const project = {
    group_name: data.group_name,
    goods_type: data.goods_type,
    source_url: data.source_url || null,
    twitter_handle: data.twitter_handle || null,
    slots,
    title: `${data.group_name} ${data.goods_type} 공동구매`,
    shipping_policy: { fixed_fee: 3000, deadline: data.deadline, quantity: Number(data.quantity) }
  };
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(project) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "공구 개설에 실패했습니다.");
    await saveActivity({ type: "participation", title: `공구 개설: ${project.title}`, message: "보증금 입금 대기" });
    setWorkflowStatus("보증금 안내를 생성하고 공구를 등록했습니다.");
    renderActivities();
  } catch (error) {
    setWorkflowStatus(`공구를 저장하지 못했습니다: ${error.message}`, true);
  }
}
function applyOcrFields(result, form) {
  const fields = result.parsed_fields || {};
  const projectForm = byId("open-project-form");
  if (fields.group_name) projectForm.elements.group_name.value = fields.group_name;
  if (fields.goods_type) projectForm.elements.goods_type.value = fields.goods_type;
  if (result.twitter_handle) projectForm.elements.twitter_handle.value = result.twitter_handle;
  if (result.extracted_text) form.elements.text.value = result.extracted_text;
}
async function processDocument(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.elements.image.files[0];
  const resultNode = byId("document-result");
  resultNode.textContent = "AI가 문서를 분석하는 중...";
  try {
    if (!file && !data.text.trim()) throw new Error("이미지 또는 텍스트를 입력해 주세요.");
    let result;
    if (file) {
      if (file.size > 3 * 1024 * 1024) throw new Error("이미지는 3MB 이하만 업로드할 수 있습니다.");
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image_base64 = String(image).split(",")[1];
      const response = await fetch(`${API_BASE_URL}/api/v1/ocr/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64, kind: data.kind })
      });
      result = await response.json();
      if (!response.ok) {
        const fallback = await fetch(`${API_BASE_URL}/api/v1/documents/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: data.kind, image })
        });
        result = await fallback.json();
        if (!fallback.ok) throw new Error(result.error || "문서 분석 실패");
      }
    } else {
      const response = await fetch(`${API_BASE_URL}/api/v1/twitter/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://x.com/document-upload", text: data.text })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "문서 분석 실패");
    }
    applyOcrFields(result, form);
    resultNode.textContent = JSON.stringify({ kind: data.kind, twitter_handle: result.twitter_handle, ...result.parsed_fields, confidence: "검토 필요" }, null, 2);
    await saveActivity({ type: "notification", message: "OCR 구조화 완료 · 그룹/굿즈/핸들을 폼에 반영" });
    renderActivities();
    setWorkflowStatus("문서 구조화가 완료되었습니다.");
  } catch (error) {
    resultNode.textContent = JSON.stringify({ kind: data.kind, status: "확인 큐", error: error.message }, null, 2);
    setWorkflowStatus("AI 결과를 확인 큐에 등록했습니다.");
  }
}

document.querySelector("#auth-form")?.addEventListener("submit", submitAuth);
document.querySelector("#quick-login-form")?.addEventListener("submit", submitQuickLogin);
document.querySelector("#open-project-form")?.addEventListener("submit", openProject);
document.querySelector("#document-form")?.addEventListener("submit", processDocument);
document.querySelector("[data-action='save-account']")?.addEventListener("click", async () => {
  const account = byId("auth-form").elements.account.value.trim();
  if (!account) return;
  const response = await fetch(`${API_BASE_URL}/api/v1/account`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ account }) });
  if (!response.ok) return setWorkflowStatus("계좌 저장에 실패했습니다.", true);
  setWorkflowStatus("환급·정산 계좌를 저장했습니다.");
  renderActivities();
});
document.querySelector("[data-action='notify']")?.addEventListener("click", async () => {
  await saveActivity({ type: "notification", message: "빈자리 알림 대기 등록 · 자리가 열리면 알림" });
  setWorkflowStatus("자리 알림을 등록했습니다.");
  renderActivities();
});
document.querySelector("[data-action='dispute']")?.addEventListener("click", async () => {
  await saveActivity({ type: "dispute", message: "분쟁 신고 접수 · 정산 보류 상태" });
  setWorkflowStatus("분쟁 신고를 접수하고 정산을 보류했습니다.");
  renderActivities();
});
async function loadCart() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/cart`, { headers: identityHeaders() });
    const result = await response.json();
    if (response.ok) {
      state.cart = (result.items || []).map((item) => ({ productId: item.product.id, picks: item.picks || [] }));
      renderCart();
    }
  } catch (error) {
    console.warn("Supabase 장바구니 조회 실패:", error);
  }
}

new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
}, { rootMargin: "240px" }).observe(byId("scroll-sentinel"));

byId("language-select").value = state.language;
setDocumentLanguage(state.language);
applyRoleVisibility();
showView((location.hash || "#home").slice(1) || "home");
resetCatalog();
renderCart();
renderSeller();
renderAdmin();
if (isAuthenticated()) {
  loadCart();
  renderActivities();
}
