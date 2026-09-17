// 정적 서버(예: Live Server)로 프런트만 열었을 때도 백엔드(3000)로 요청이 가도록 폴백
const API_BASE_URL = window.__API_BASE_URL__ || ((window.location.protocol === "file:" || (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "3000")) ? "http://localhost:3000" : "");
const SUPABASE_URL = window.__SUPABASE_URL__ || "";
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || "";
// 구글·카카오 로그인은 Supabase Auth가 처리(네이버는 Supabase 미지원이라 백엔드 자체 OAuth 사용)
const supabaseClient = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const PAGE_SIZE = 6;
const ALIAS_MAP = {
  "에스파": ["aespa", "에스파", "애스파", "이스파"],
  "애스파": ["aespa", "에스파", "애스파", "이스파"],
  "이스파": ["aespa", "에스파", "애스파", "이스파"],
  aespa: ["aespa", "에스파", "애스파", "이스파"],
  "세븐틴": ["seventeen", "세븐틴"],
  seventeen: ["seventeen", "세븐틴"],
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
const SESSION_KEY = "poka-catch-session";
const LANGUAGE_KEY = "poka-catch-language";
const state = { cart: [], role: "CUSTOMER", language: localStorage.getItem(LANGUAGE_KEY) || "ko", userId: null, token: null, pendingProject: null, checkoutKey: null, disputeOrderId: null, passwordResetToken: null, oauthProfilePending: false };
const managementState = { orders: [], hostingOrders: [], projects: [], selectedProjectId: null, historyTab: "participated", hostingTab: "deposits" };
const catalog = { page: 1, items: [], total: 0, demoTotal: 0, loading: false, done: false };
const money = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const byId = (id) => document.getElementById(id);

function expandSearchTerms(keyword) {
  if (!keyword) return [];
  const lower = keyword.trim().toLowerCase().replace(/\s+/g, "");
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (key.toLowerCase().replace(/\s+/g, "") === lower) return aliases;
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
  node.querySelector(".product-card").dataset.productId = product.id;
  const ratio = Math.min(100, Math.round(product.participants / product.min * 100));
  node.querySelector("h3").textContent = product.title;
  node.querySelector(".category-badge").textContent = t(product.category);
  node.querySelector(".deadline").textContent = deadlineText(product.deadline);
  node.querySelector(".tags").textContent = product.tags.map((tag) => `#${translateDynamicText(tag)}`).join(" ");
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
function openProductDetail(product) {
  const endAt = new Date(Date.now() + product.deadline * 86400000);
  byId("detail-category").textContent = t(product.category);
  byId("detail-deadline").textContent = deadlineText(product.deadline);
  byId("product-detail-title-text").textContent = translateDynamicText(product.title);
  byId("detail-tags").textContent = product.tags.map((tag) => `#${translateDynamicText(tag)}`).join(" ");
  byId("detail-price").textContent = money.format(product.price);
  byId("detail-progress").textContent = progressText(product.participants, product.min);
  byId("detail-source").textContent = product.source || "공식 온라인 스토어 (예정)";
  byId("detail-end-at").textContent = `${endAt.toLocaleDateString("ko-KR")} ${endAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  byId("detail-leader").textContent = product.leaderTrustScore == null
    ? product.leader || "Poka-Catch 인증 총대"
    : `${product.leader || "인증 총대"} · 신뢰도 ${product.leaderTrustScore.toFixed(1)}점 · 검증 후기 ${product.leaderReviewCount}건`;
  byId("detail-photo-info").textContent = product.photoInfo || "총대 등록 상품 사진 · 원본 확인 필요";
  byId("detail-description-text").textContent = translateDynamicText(product.description || `${product.title} 공동구매 안내입니다. 상품 구성과 배송 일정은 총대의 공지를 확인해 주세요.`);
  const detailPicker = byId("detail-member-picker");
  const detailSelects = [...detailPicker.querySelectorAll(".member-select")];
  detailSelects.forEach((select) => {
    select.replaceChildren(new Option("선택", ""));
    (product.members || []).forEach((member) => select.append(new Option(member, member)));
    select.value = "";
    select.onchange = () => updatePickOptions(detailSelects);
  });
  detailPicker.hidden = !product.members?.length;
  byId("detail-join-button").dataset.productId = product.id;
  const photo = byId("detail-photo");
  photo.textContent = t(product.category);
  photo.setAttribute("aria-label", `${translateDynamicText(product.title)} 상품 사진 정보`);
  byId("product-detail-dialog").showModal();
}
function addProductToCart(product, picks) {
  if (!requireLogin()) return;
  if (product.members?.length && (picks.some((pick) => !pick) || new Set(picks).size !== picks.length)) {
    toast("1~3지망 멤버를 서로 다르게 모두 선택해 주세요.");
    return;
  }
  if (product.project_id) {
    state.pendingProject = { projectId: product.project_id, preferences: picks };
    state.checkoutKey = crypto.randomUUID();
    byId("shipping-total").textContent = "공구 참여 금액은 선택 자리와 배송비를 기준으로 서버에서 계산합니다.";
    byId("shipping-dialog").showModal();
    return;
  }
  if (state.cart.some((entry) => (typeof entry === "string" ? entry : entry.productId) === product.id)) {
    toast("이미 장바구니에 있습니다.");
    return;
  }
  state.cart.push({ productId: product.id, projectId: product.project_id || null, picks, heldUntil: Date.now() + 5 * 60 * 1000 });
  addToCartViaAPI(product.id, picks, product.project_id || null);
  saveActivity({ type: "participation", title: product.title, message: "5분 선점 · 신청 정보와 입금 대기" });
  renderCart();
  renderActivities();
  toast("5분 동안 자리를 선점했습니다.");
}
function activateUser(user, token) {
  state.userId = user.id;
  state.role = user.role;
  state.token = token || null;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: state.userId, role: state.role, token: state.token }));
  byId("login-button").textContent = "로그아웃";
  applyRoleVisibility();
}
function decodeAuthToken(token) {
  const encoded = String(token || "").split(".")[1];
  if (!encoded) throw new Error("INVALID_AUTH_TOKEN");
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return JSON.parse(atob(normalized));
}
function restoreSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.userId || !session?.role || !session.token) return;
    const payload = decodeAuthToken(session.token);
    if (payload.sub !== session.userId || payload.role !== session.role || payload.exp * 1000 <= Date.now()) throw new Error("EXPIRED_AUTH_SESSION");
    state.userId = session.userId;
    state.role = session.role;
    state.token = session.token || null;
    byId("login-button").textContent = "로그아웃";
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
}
function clearSession() {
  state.userId = null;
  state.role = "CUSTOMER";
  state.token = null;
  localStorage.removeItem(SESSION_KEY);
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

function projectToProduct(project) {
  const slots = project.slots || [];
  const occupied = slots.filter((slot) => slot.is_occupied).length;
  const deadline = project.shipping_policy?.deadline ? Math.max(1, Math.ceil((new Date(project.shipping_policy.deadline).getTime() - Date.now()) / 86400000)) : 7;
  return {
    id: project.id,
    project_id: project.id,
    title: project.title,
    category: project.goods_type,
    tags: [project.group_name],
    members: slots.map((slot) => slot.member_name),
    price: slots.length ? Math.min(...slots.map((slot) => slot.price)) : 0,
    participants: occupied,
    min: slots.length,
    deadline,
    popularity: 0,
    recency: 1,
    demo: false,
    source: project.source_url,
    description: project.product_metadata?.description,
    leader: project.leader_id,
    leaderTrustScore: project.leader_trust_score,
    leaderReviewCount: project.leader_verified_review_count || 0,
    photoInfo: project.product_metadata?.image_url || "총대 등록 상품 사진",
    projectSlots: slots
  };
}

function resetCatalog() {
  catalog.page = 1;
  catalog.items = [];
  catalog.done = false;
  catalog.demoTotal = 0;
  byId("product-grid").replaceChildren();
  loadNextPage();
}

async function loadNextPage() {
  if (document.body.dataset.view !== "home") return;
  if (catalog.loading || catalog.done) return;
  catalog.loading = true;
  byId("load-status").hidden = catalog.page === 1;
  try {
    const params = new URLSearchParams({ page: String(catalog.page), limit: String(PAGE_SIZE) });
    const keyword = byId("keyword").value.trim();
    if (keyword) params.set("keyword", keyword);
    const response = await fetch(`${API_BASE_URL}/api/projects?${params}`);
    if (!response.ok) throw new Error("PROJECT_API_UNAVAILABLE");
    const result = await response.json();
    const realItems = (result.items || []).map(projectToProduct);
    const examples = catalog.page === 1 ? getFilteredProducts() : [];
    if (catalog.page === 1) catalog.demoTotal = examples.length;
    const next = [...realItems, ...examples];
    catalog.total = (result.total || 0) + catalog.demoTotal;
    catalog.items.push(...next);
    byId("product-grid").append(...next.map(productCard));
    catalog.done = catalog.items.length >= catalog.total || realItems.length < PAGE_SIZE;
    catalog.page += 1;
  } catch (error) {
    const filtered = getFilteredProducts();
    catalog.total = filtered.length;
    const start = (catalog.page - 1) * PAGE_SIZE;
    const next = filtered.slice(start, start + PAGE_SIZE);
    catalog.items.push(...next);
    byId("product-grid").append(...next.map(productCard));
    catalog.done = catalog.items.length >= filtered.length;
    catalog.page += 1;
  } finally {
    catalog.loading = false;
    byId("load-status").hidden = true;
    byId("result-summary").textContent = summaryText(catalog.total);
    translateDocument(state.language);
  }
}

function renderCart() {
  const items = state.cart
    .map((entry) => ({ product: products.find((item) => item.id === (typeof entry === "string" ? entry : entry.productId)), picks: typeof entry === "string" ? [] : entry.picks }))
    .filter((entry) => entry.product);
  const total = items.reduce((sum, { product }) => sum + product.price, 0);
  byId("cart-count").textContent = items.length;
  byId("cart-total").textContent = money.format(total);
  byId("cart-items").replaceChildren(...(items.length ? items.map(({ product, picks }) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    const picksText = product.members && picks.length ? `1지망 ${picks[0]} · 2지망 ${picks[1]} · 3지망 ${picks[2]}` : product.category;
    row.innerHTML = `<p><strong>${product.title}</strong><br><span class="muted">${picksText}</span></p><strong>${money.format(product.price)}</strong>`;
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
  area.innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.reduce((sum, p) => sum + p.participants, 0)}개</strong><span>누적 참여 수</span></div><div class="metric"><strong>${active.length}건</strong><span>진행 중 공동구매</span></div><div class="metric"><strong>${money.format(0)}</strong><span>체험 결제 실청구액</span></div></div><div class="table-wrap"><table class="seller-table"><thead><tr><th>상품</th><th>참여 현황</th><th>목표 달성률</th><th>상태</th></tr></thead><tbody>${products.map((p) => `<tr><td>${p.title}${p.demo ? " (체험용)" : ""}</td><td>${p.participants} / ${p.min}명</td><td>${Math.round(p.participants / p.min * 100)}%</td><td>${p.participants >= p.min ? "목표 달성" : "모집 중"}</td></tr>`).join("")}</tbody></table></div><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">ORDERS</p><h3>주문 취합표</h3></div></div><div id="seller-order-list" class="activity-list"><p class="muted">주문을 불러오는 중...</p></div></section><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">PAYMENTS</p><h3>내 공구 입금 확인</h3></div></div><div id="seller-payment-list" class="activity-list"><p class="muted">입금 대기 건을 불러오는 중...</p></div></section>`;
  area.insertAdjacentHTML("afterbegin", '<section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">SHIPMENT</p><h3>송장 등록</h3></div></div><form id="seller-shipment-form" class="quick-login-form"><label>공구<select name="project_id" id="seller-project-select" required><option value="">공구를 불러오는 중...</option></select></label><label>택배사<input name="carrier" required placeholder="CJ대한통운"></label><label>송장번호<input name="tracking_number" required></label><button class="button" type="submit">발송 처리</button></form></section>');
  area.insertAdjacentHTML("afterbegin", '<section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">ALLOCATION</p><h3>개봉 결과 자동 배정</h3></div></div><form id="seller-allocation-form" class="quick-login-form"><label>멤버별 개봉 수량<input name="inventory" required placeholder="카리나:2, 윈터:1, 지젤:1"></label><label>개봉 인증 이미지 URL<input name="evidence_url" type="url" required placeholder="https://..."></label><button class="button" type="submit">1·2·3지망 자동 배정</button></form><div id="seller-allocation-result" class="activity-list"></div></section>');
  area.insertAdjacentHTML("afterbegin", '<button id="seller-packing-button" class="button" type="button">전원 입금 확인 · 포장 취합표 열기</button>');
  area.insertAdjacentHTML("afterbegin", '<button id="seller-settle-button" class="button button-secondary" type="button">선택 공구 정산 실행</button>');
  loadSellerProjects();
  loadSellerOrders();
  loadSellerPayments();
}
async function loadSellerProjects() {
  const select = byId("seller-project-select");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/projects`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "공구 조회 실패");
    select.replaceChildren(new Option("공구를 선택하세요", ""), ...(result.items || []).map((project) => new Option(`${project.title} · ${project.status}`, project.id)));
  } catch (error) {
    select.replaceChildren(new Option(`공구 조회 실패: ${error.message}`, ""));
  }
}
async function submitSellerShipment(event) {
  if (event.target.id !== "seller-shipment-form") return;
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.target));
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/shipments`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "발송 처리 실패");
    toast("송장을 등록하고 참여자 배송 상태를 발송으로 변경했습니다.");
    renderSeller();
  } catch (error) {
    toast(error.message);
  }
}
function parseOpeningInventory(value) {
  const inventory = {};
  for (const entry of String(value || "").split(",")) {
    const [member, rawCount] = entry.split(":").map((part) => part.trim());
    const count = Number(rawCount);
    if (!member || !Number.isInteger(count) || count < 0 || Object.hasOwn(inventory, member)) return null;
    inventory[member] = count;
  }
  return Object.keys(inventory).length ? inventory : null;
}
async function submitSellerAllocation(event) {
  if (event.target.id !== "seller-allocation-form") return;
  event.preventDefault();
  const projectId = byId("seller-project-select")?.value;
  if (!projectId) return toast("배정할 공구를 선택해 주세요.");
  const input = Object.fromEntries(new FormData(event.target));
  const inventory = parseOpeningInventory(input.inventory);
  if (!inventory) return toast("개봉 수량을 멤버:개수 형식으로 입력해 주세요.");
  if (!window.confirm("입력한 개봉 수량으로 배정을 확정합니까? 배정 로그는 수정할 수 없습니다.")) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/projects/${projectId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ inventory, evidence_url: input.evidence_url })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "자동 배정 실패");
    const list = byId("seller-allocation-result");
    const summary = Object.assign(document.createElement("p"), { className: "activity-item", textContent: `배정 ${result.assigned_count}건 · 자동 환불 ${result.refunded_count}건` });
    const rows = (result.items || []).map((allocation) => Object.assign(document.createElement("p"), {
      className: "activity-item",
      textContent: allocation.outcome === "ASSIGNED"
        ? `${allocation.participant_id} · ${allocation.assigned_member} · ${allocation.preference_rank}지망 배정`
        : `${allocation.participant_id} · 미배정 · ${money.format(allocation.refund_amount)} 자동 환불`
    }));
    list.replaceChildren(summary, ...rows);
    toast("지망 배정과 미배정 환불을 확정했습니다.");
    loadSellerProjects();
  } catch (error) {
    toast(error.message);
  }
}
async function settleSellerProject() {
  const projectId = byId("seller-project-select")?.value;
  if (!projectId) return toast("정산할 공구를 선택해 주세요.");
  if (!window.confirm("모든 참여자의 수령 확인이 완료되었습니까? 정산 후 되돌릴 수 없습니다.")) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/projects/${projectId}/settle`, { method: "POST", headers: { ...identityHeaders() } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "정산 실행 실패");
    toast("정산을 실행하고 공구를 완료 처리했습니다.");
    renderSeller();
  } catch (error) {
    toast(error.message);
  }
}
async function startSellerPacking() {
  const projectId = byId("seller-project-select")?.value;
  if (!projectId) return toast("포장할 공구를 선택해 주세요.");
  if (!window.confirm("전원 입금 완료 여부를 확인하고 배송지 원문 취합표를 엽니까?")) return;
  try {
    const startResponse = await fetch(`${API_BASE_URL}/api/v1/seller/projects/${projectId}/start-packing`, { method: "POST", headers: identityHeaders() });
    const startResult = await startResponse.json();
    if (!startResponse.ok) throw new Error(startResult.error || "포장 단계를 시작할 수 없습니다.");
    const listResponse = await fetch(`${API_BASE_URL}/api/v1/seller/projects/${projectId}/packing-list`, { headers: identityHeaders() });
    const result = await listResponse.json();
    if (!listResponse.ok) throw new Error(result.error || "포장 취합표를 불러오지 못했습니다.");
    const list = byId("seller-order-list");
    list.replaceChildren(...result.items.map((order) => {
      const item = order.order_items?.[0] || {};
      const shipping = order.shipping_info || {};
      const node = document.createElement("article");
      node.className = "report-item";
      node.innerHTML = `<div><strong>${result.project.title} · ${item.assigned_member || item.member_name || "멤버 미배정"}</strong><p>${shipping.recipient_name} · ${shipping.phone} · (${shipping.postal_code}) ${shipping.address} ${shipping.address_detail}</p><span class="muted">포장 단계에서만 공개되는 배송지 · ${money.format(order.total)}</span></div>`;
      return node;
    }));
    toast("포장 단계를 시작하고 배송지 취합표를 열었습니다.");
    loadSellerProjects();
  } catch (error) {
    toast(error.message);
  }
}
async function loadSellerOrders() {
  const list = byId("seller-order-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/orders`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "주문 조회 실패");
    list.replaceChildren(...(result.items.length ? result.items.map((order) => {
      const item = order.order_items?.[0] || {};
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const shipping = order.shipping_info || {};
      const node = document.createElement("article");
      node.className = "report-item";
      node.innerHTML = `<div><strong>${order.project_title} · ${item.member_name || "멤버 미배정"}</strong><p>${shipping.recipient_name || "받는 분 미입력"} · ${shipping.phone || "연락처 미입력"} · ${shipping.address || "주소 미입력"} ${shipping.address_detail || ""}</p><span class="muted">배송지 보호됨 · ${money.format(order.total)} · ${payment?.status || order.status} · ${new Date(order.created_at).toLocaleString("ko-KR")}</span></div>`;
      return node;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "취합할 주문이 없습니다." })]));
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: `주문을 불러오지 못했습니다: ${error.message}` }));
  }
}
async function loadSellerPayments() {
  const list = byId("seller-payment-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/payments?status=PENDING`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "입금 조회 실패");
    list.replaceChildren(...(result.items.length ? result.items.map((payment) => {
      const node = document.createElement("article");
      node.className = "report-item";
      node.innerHTML = `<div><strong>${payment.project_title} · ${money.format(payment.amount)}</strong><p>가상계좌 ${payment.virtual_account || "미발급"} · 사용자 ${payment.user_id}</p><span class="muted">${new Date(payment.created_at).toLocaleString("ko-KR")} · Webhook 자동 확인 대기</span></div>`;
      return node;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "내 공구의 입금 확인 대기 건이 없습니다." })]));
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: `입금 내역을 불러오지 못했습니다: ${error.message}` }));
  }
}

function renderAdmin() {
  const admin = state.role === "ADMIN";
  byId("admin-access").textContent = admin ? "ADMIN 권한으로 열람 중" : "ADMIN 권한 필요";
  byId("admin-access").className = `status${admin ? "" : " denied"}`;
  if (!admin) {
    byId("admin-content").innerHTML = '<div class="admin-gate"><p class="muted">관리자 계정으로 로그인한 뒤에만 분석 데이터와 정산 관리를 볼 수 있습니다. 직접 URL 접근 시 API는 403을 반환합니다.</p></div>';
    return;
  }
  byId("admin-content").innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.length}건</strong><span>전체 공고</span></div><div class="metric"><strong>${money.format(products.reduce((sum, p) => sum + p.price * p.participants, 0))}</strong><span>표시 거래액</span></div><div class="metric"><strong id="report-count">-</strong><span>접수된 신고</span></div></div><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">DEPOSIT</p><h3>총대 보증금 제재</h3></div></div><form id="admin-forfeit-form" class="quick-login-form"><label>보관 중 보증금<select name="project_id" id="admin-deposit-select" required><option value="">보증금을 불러오는 중...</option></select></label><label>몰수 사유<input name="reason" required placeholder="영수증 미제출 또는 거래 미이행"></label><button class="button button-danger" type="submit">몰수 및 보상 배분</button></form></section><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">PAYMENTS</p><h3>Webhook 입금 모니터링</h3></div></div><div id="payment-list" class="activity-list"><p class="muted">입금 대기 건을 불러오는 중...</p></div></section><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">RECEIPTS</p><h3>영수증 소명 심사</h3></div></div><div id="receipt-review-list" class="activity-list"><p class="muted">소명 내역을 불러오는 중...</p></div></section><section class="admin-reports"><div class="section-heading"><div><p class="eyebrow">REPORTS</p><h3>오류·사기 신고 처리</h3></div></div><div id="report-list" class="activity-list"><p class="muted">신고를 불러오는 중...</p></div></section>`;
  loadAdminDeposits();
  loadAdminPayments();
  loadReceiptReviews();
  loadAdminReports();
}
async function loadAdminDeposits() {
  const select = byId("admin-deposit-select");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/deposits?status=HELD`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "보증금 조회 실패");
    select.replaceChildren(new Option("보증금을 선택하세요", ""), ...(result.items || []).map((deposit) => new Option(`${deposit.project_title} · ${money.format(deposit.amount)}`, deposit.project_id)));
  } catch (error) {
    select.replaceChildren(new Option(`보증금 조회 실패: ${error.message}`, ""));
  }
}
async function forfeitProjectDeposit(event) {
  if (event.target.id !== "admin-forfeit-form") return;
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.target));
  if (!window.confirm("보증금을 몰수하고 결제 완료 참여자에게 전액 배분합니까? 이 작업은 되돌릴 수 없습니다.")) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/projects/${input.project_id}/forfeit-deposit`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ reason: input.reason }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "보증금 몰수 실패");
    const total = (result.compensations || []).reduce((sum, item) => sum + item.amount, 0);
    toast(`${result.compensations.length}명에게 ${money.format(total)} 보상금을 배분했습니다.`);
    event.target.reset();
    loadAdminDeposits();
  } catch (error) {
    toast(error.message);
  }
}
async function loadAdminPayments() {
  const list = byId("payment-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/payments?status=PENDING`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "입금 조회 실패");
    list.replaceChildren(...(result.items.length ? result.items.map((payment) => {
      const node = document.createElement("article");
      node.className = "report-item";
      node.innerHTML = `<div><strong>${money.format(payment.amount)} · ${payment.virtual_account || "가상계좌 미발급"}</strong><p>주문 ${payment.order_id} · 사용자 ${payment.user_id}</p><span class="muted">${new Date(payment.created_at).toLocaleString("ko-KR")} · Webhook 자동 확인 대기</span></div>`;
      return node;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "입금 확인 대기 건이 없습니다." })]));
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: `입금 내역을 불러오지 못했습니다: ${error.message}` }));
  }
}
async function loadReceiptReviews() {
  const list = byId("receipt-review-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/receipt-verifications`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "영수증 소명 조회 실패");
    const pending = (result.items || []).filter((item) => ["EXPLANATION_SUBMITTED", "EXPLANATION_EXPIRED"].includes(item.status));
    list.replaceChildren(...(pending.length ? pending.map((verification) => {
      const node = document.createElement("article");
      node.className = "report-item";
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${verification.store_name || "판매처 미확인"} · 주문 ${verification.order_number || "미확인"}`;
      const explanation = document.createElement("p");
      explanation.textContent = verification.explanation || "48시간 내 소명이 제출되지 않았습니다.";
      const meta = document.createElement("span");
      meta.className = "muted";
      meta.textContent = `${verification.status} · 수량 ${verification.quantity ?? "미확인"} · ${new Date(verification.created_at).toLocaleString("ko-KR")}`;
      detail.append(title, explanation, meta);
      const actions = document.createElement("div");
      const approve = Object.assign(document.createElement("button"), { className: "button button-secondary", type: "button", textContent: "승인" });
      approve.dataset.reviewReceipt = verification.id;
      approve.dataset.decision = "APPROVED";
      const reject = Object.assign(document.createElement("button"), { className: "button button-danger", type: "button", textContent: "반려" });
      reject.dataset.reviewReceipt = verification.id;
      reject.dataset.decision = "REJECTED";
      actions.append(approve, reject);
      node.append(detail, actions);
      return node;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "검토할 영수증 소명이 없습니다." })]));
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: error.message }));
  }
}
async function reviewReceiptVerification(button) {
  const note = window.prompt(button.dataset.decision === "APPROVED" ? "승인 메모를 입력해 주세요." : "반려 사유를 입력해 주세요.", "") ?? null;
  if (note === null) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/receipt-verifications/${button.dataset.reviewReceipt}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ decision: button.dataset.decision, note })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "영수증 심사 실패");
    toast(button.dataset.decision === "APPROVED" ? "영수증 소명을 승인했습니다." : "영수증 소명을 반려했습니다.");
    loadReceiptReviews();
  } catch (error) {
    toast(error.message);
  }
}
async function loadAdminReports() {
  const list = byId("report-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/reports`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "신고 조회 실패");
    byId("report-count").textContent = `${result.items.length}건`;
    list.replaceChildren(...(result.items.length ? result.items.map((report) => {
      const node = document.createElement("article");
      node.className = "report-item";
      node.innerHTML = `<div><strong>${report.reason}</strong><p>${report.details || "상세 내용 없음"}</p><span class="muted">${new Date(report.created_at).toLocaleString("ko-KR")} · ${report.status}</span></div><select data-report-id="${report.id}"><option value="OPEN">접수</option><option value="REVIEWING">검토 중</option><option value="RESOLVED">처리 완료</option><option value="REJECTED">반려</option></select>`;
      node.querySelector("select").value = report.status;
      return node;
    }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "접수된 오류 또는 사기 신고가 없습니다." })]));
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: `신고를 불러오지 못했습니다: ${error.message}` }));
  }
}
async function updateReportStatus(select) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/reports/${select.dataset.reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ status: select.value }) });
    if (!response.ok) throw new Error("상태 변경 실패");
    toast("신고 처리 상태를 저장했습니다.");
  } catch (error) {
    toast(error.message);
    loadAdminReports();
  }
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
  if (name === "workbench") loadHostingManagement();
  if (name === "seller") renderSeller();
  if (name === "admin") renderAdmin();
  if (name === "mypage") { renderActivities(); loadProfile(); loadManagementOrders(); loadSavedAddresses(); }
}

function toast(message) {
  const target = byId("toast");
  target.textContent = message;
  target.classList.add("show");
  setTimeout(() => target.classList.remove("show"), 2200);
}

const languageMessages = { ko: "언어가 변경되었습니다.", en: "Language changed.", ar: "تم تغيير اللغة.", ja: "言語を変更しました。", zh: "语言已切换。", ms: "Bahasa telah ditukar." };
const translations = {
  en: { "언어 선택": "Language", "고객": "Customer", "판매자": "Seller", "관리자": "Admin", "한국어": "Korean", "둘러보기": "Explore", "공구 관리": "Group Buy", "마이페이지": "My Page", "알림": "Notifications", "장바구니": "Cart", "진행 중인 공고": "Active listings", "검색어": "Search", "에스파, aespa, 카리나 등 한/영 검색": "Search aespa, Karina, Korean or English", "검색": "Search", "공구 작업실": "Group Buy Workspace", "대기 중": "Waiting", "계정·환급 계좌": "Account and payout account", "이메일": "Email", "비밀번호": "Password", "역할": "Role", "참여자": "Participant", "총대": "Organizer", "회원가입": "Sign up", "로그인": "Log in", "환급 계좌": "Payout account", "계좌 저장": "Save account", "공구 개설": "Create group buy", "아이돌": "Artist", "그룹명": "Group name", "굿즈": "Goods", "포토카드": "Photocard", "트위터 핸들": "Twitter handle", "1차 판매처": "Primary retailer", "마감일": "Deadline", "자리와 가격": "Slots and prices", "필요 앨범 수량": "Album quantity", "보증금 안내 후 공구 오픈": "Open after deposit instructions", "문서 AI 처리": "AI document processing", "문서 종류": "Document type", "영수증": "Receipt", "송장": "Waybill", "트위터/X 공고": "X listing", "캡처 텍스트": "Captured text", "Upstage로 구조화": "Structure with Upstage", "아직 처리된 문서가 없습니다.": "No document has been processed yet.", "내 활동": "My Activity", "로그아웃 상태": "Logged out", "내 참여": "My participation", "정산·환불": "Payouts and refunds", "알림·분쟁": "Alerts and disputes", "자리 알림 대기 등록": "Notify me when a slot opens", "현재 주문 분쟁 신고": "Report a dispute", "닫기": "Close", "합계": "Total", "0원 체험 결제": "0 KRW demo pay", "멤버 지망 선택": "Choose member preferences", "선택": "Select", "지망 선택 후 담기": "Choose preferences and add", "SELLER 권한 필요": "SELLER access required", "(체험용)": "(Demo)" },
  ar: { "언어 선택": "اللغة", "고객": "عميل", "판매자": "بائع", "관리자": "مسؤول", "둘러보기": "استكشاف", "공구 관리": "الشراء الجماعي", "마이페이지": "صفحتي", "장바구니": "السلة", "진행 중인 공고": "الإعلانات النشطة", "검색": "بحث", "0원 체험 결제": "دفع تجريبي 0", "(체험용)": "(تجريبي)" },
  ja: { "언어 선택": "言語", "고객": "購入者", "판매자": "販売者", "관리자": "管理者", "둘러보기": "見つける", "공구 관리": "共同購入管理", "마이페이지": "マイページ", "장바구니": "カート", "진행 중인 공고": "受付中の告知", "검색": "検索", "0원 체험 결제": "0円の体験決済", "(체험용)": "(体験用)" },
  zh: { "언어 선택": "语言", "고객": "客户", "판매자": "卖家", "관리자": "管理员", "둘러보기": "浏览", "공구 관리": "团购管理", "마이페이지": "我的页面", "장바구니": "购物车", "진행 중인 공고": "进行中的公告", "검색": "搜索", "0원 체험 결제": "0元体验支付", "(체험용)": "(体验)" },
  ms: { "언어 선택": "Bahasa", "고객": "Pelanggan", "판매자": "Penjual", "관리자": "Pentadbir", "둘러보기": "Terokai", "공구 관리": "Urus pembelian berkumpulan", "마이페이지": "Profil saya", "장바구니": "Troli", "진행 중인 공고": "Penyenaraian aktif", "검색어": "Carian", "검색": "Cari", "회원가입": "Daftar", "로그인": "Log masuk", "장바구니가 비어 있습니다.": "Troli anda kosong.", "0원 체험 결제": "Bayaran demo RM0", "멤버 지망 선택": "Pilih keutamaan ahli", "선택": "Pilih", "지망 선택 후 담기": "Pilih keutamaan dan tambah", "(체험용)": "(Demo)", "포토카드": "Kad foto", "앨범": "Album", "럭키드로우": "Cabutan bertuah", "응원봉": "Kayu lampu", "인형": "Anak patung", "의류": "Pakaian", "액세서리": "Aksesori", "굿즈": "Barangan", "공동구매": "Pembelian berkumpulan" }
};
Object.assign(translations.en, { "1지망": "1st choice", "2지망": "2nd choice", "3지망": "3rd choice", "장바구니가 비어 있습니다.": "Your cart is empty.", "누적 참여 수": "Total participants", "진행 중 공동구매": "Active group buys", "상품": "Product", "참여 현황": "Participation", "목표 달성률": "Goal progress", "상태": "Status", "목표 달성": "Goal reached", "모집 중": "Recruiting" });
Object.assign(translations.ms, { "1지망": "Pilihan pertama", "2지망": "Pilihan kedua", "3지망": "Pilihan ketiga", "누적 참여 수": "Jumlah peserta", "진행 중 공동구매": "Pembelian berkumpulan aktif", "상품": "Produk", "참여 현황": "Penyertaan", "목표 달성률": "Kemajuan sasaran", "상태": "Status", "목표 달성": "Sasaran tercapai", "모집 중": "Sedang dibuka", "언어 변경": "Bahasa", "계정 세션": "Sesi akaun", "계좌 등록됨": "Akaun pembayaran didaftarkan", "공구 작업실": "Ruang kerja pembelian berkumpulan", "대기 중": "Menunggu", "계정·환급 계좌": "Akaun dan akaun bayaran balik", "이메일": "E-mel", "비밀번호": "Kata laluan", "참여자": "Peserta", "총대": "Penganjur", "환급 계좌": "Akaun bayaran balik", "계좌 저장": "Simpan akaun", "공구 개설": "Buka pembelian berkumpulan", "아이돌": "Artis", "그룹명": "Nama kumpulan", "굿즈": "Barangan", "트위터 핸들": "Nama pengguna Twitter", "1차 판매처": "Kedai asal", "마감일": "Tarikh tutup", "자리와 가격": "Slot dan harga", "필요 앨범 수량": "Kuantiti album", "보증금 안내 후 공구 오픈": "Buka selepas arahan deposit", "문서 AI 처리": "Pemprosesan dokumen AI", "문서 종류": "Jenis dokumen", "캡처 텍스트": "Teks ditangkap", "내 활동": "Aktiviti saya", "로그아웃 상태": "Telah log keluar", "내 참여": "Penyertaan saya", "정산·환불": "Bayaran dan bayaran balik", "알림·분쟁": "Makluman dan pertikaian", "자리 알림 대기 등록": "Daftar makluman slot", "현재 주문 분쟁 신고": "Laporkan pertikaian pesanan", "닫기": "Tutup", "합계": "Jumlah", "종료 날짜 및 시각": "Tarikh dan masa tamat", "구입(예정)처": "Kedai pembelian", "총대 정보": "Maklumat penganjur", "사진 정보": "Maklumat foto", "총대 설명": "Penerangan penganjur" });
const dynamicTranslations = {
  en: { "포토카드": "Photocard", "앨범": "Album", "럭키드로우": "Lucky draw", "응원봉": "Light stick", "인형": "Doll", "의류": "Clothing", "액세서리": "Accessories", "굿즈": "Merchandise", "공동구매": "Group buy", "공식": "Official", "랜덤": "Random", "세트": "Set", "분철": "Splitting", "키링": "Keyring", "투어": "Tour", "스티커": "Stickers" },
  ms: { "포토카드": "Kad foto", "앨범": "Album", "럭키드로우": "Cabutan bertuah", "응원봉": "Kayu lampu", "인형": "Anak patung", "의류": "Pakaian", "액세서리": "Aksesori", "굿즈": "Barangan", "공동구매": "Pembelian berkumpulan", "공식": "Rasmi", "랜덤": "Rawak", "세트": "Set", "분철": "Pembahagian", "키링": "Cincin kunci", "투어": "Jelajah", "스티커": "Pelekat" },
  ja: { "포토카드": "フォトカード", "앨범": "アルバム", "럭키드로우": "ラッキードロー", "응원봉": "ペンライト", "인형": "ぬいぐるみ", "의류": "衣類", "액세서리": "アクセサリー", "굿즈": "グッズ", "공동구매": "共同購入" },
  zh: { "포토카드": "小卡", "앨범": "专辑", "럭키드로우": "幸运抽奖", "응원봉": "应援棒", "인형": "玩偶", "의류": "服装", "액세서리": "配饰", "굿즈": "周边", "공동구매": "团购" },
  ar: { "포토카드": "بطاقة صور", "앨범": "ألبوم", "럭키드로우": "سحب محظوظ", "응원봉": "عصا إضاءة", "인형": "دمية", "의류": "ملابس", "액세서리": "إكسسوارات", "굿즈": "منتجات", "공동구매": "شراء جماعي" }
};
const sourceText = new WeakMap();
const sourceAttributes = new WeakMap();
function t(value) { return translations[state.language]?.[value] || value; }
function translateDynamicText(value) {
  return Object.entries(dynamicTranslations[state.language] || {}).reduce((text, [source, target]) => text.split(source).join(target), value);
}
function deadlineText(days) {
  if (state.language === "en") return days === 1 ? "Ends today" : `${days} days left`;
  if (state.language === "ar") return days === 1 ? "ينتهي اليوم" : `متبقٍ ${days} أيام`;
  if (state.language === "ja") return days === 1 ? "本日締切" : `あと${days}日`;
  if (state.language === "zh") return days === 1 ? "今日截止" : `剩余${days}天`;
  if (state.language === "ms") return days === 1 ? "Tamat hari ini" : `${days} hari lagi`;
  return days === 1 ? "오늘 마감" : `${days}일 남음`;
}
function progressText(participants, minimum) {
  if (state.language === "en") return `${participants} joined · goal ${minimum}`;
  if (state.language === "ar") return `${participants} مشارك · الهدف ${minimum}`;
  if (state.language === "ja") return `${participants}人参加 · 目標${minimum}人`;
  if (state.language === "zh") return `已参加${participants}人 · 目标${minimum}人`;
  if (state.language === "ms") return `${participants} peserta · sasaran ${minimum}`;
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
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

document.addEventListener("click", (event) => {
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    event.preventDefault();
    showView(viewLink.dataset.viewLink);
    if (viewLink.classList.contains("brand")) {
      byId("keyword").value = "";
      resetCatalog();
    }
    return;
  }
  const button = event.target.closest(".join-button");
  if (button) {
    const card = button.closest(".product-card");
    const picks = [...card.querySelectorAll(".member-select")].map((select) => select.value);
    const id = button.dataset.productId;
    const product = products.find((item) => item.id === id);
    if (product) addProductToCart(product, product.members ? picks : []);
  }
  const detailButton = event.target.closest("#detail-join-button");
  if (detailButton) {
    const product = products.find((item) => item.id === detailButton.dataset.productId);
    const picks = [...byId("detail-member-picker").querySelectorAll(".member-select")].map((select) => select.value);
    if (product) {
      addProductToCart(product, product.members ? picks : []);
      if (isAuthenticated()) byId("product-detail-dialog").close();
    }
  }
  const card = event.target.closest(".product-card");
  if (card && !event.target.closest("button, select, fieldset, input, label")) {
    const product = products.find((item) => item.id === card.dataset.productId);
    if (product) openProductDetail(product);
  }
  if (event.target.closest("[data-social-login]")) {
    const provider = event.target.closest("[data-social-login]").dataset.socialLogin;
    if (provider === "naver") {
      window.location.href = `${API_BASE_URL}/api/v1/auth/oauth/naver`;
    } else if (supabaseClient) {
      supabaseClient.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } });
    } else {
      toast("Supabase 설정이 필요합니다.");
    }
  }
  if (event.target.closest("[data-close-dialog]")) {
    const dialog = event.target.closest("dialog");
    if (dialog?.open) dialog.close();
    if (dialog?.id === "shipping-dialog") {
      state.pendingProject = null;
      state.checkoutKey = null;
    }
  }
});

async function addToCartViaAPI(productId, picks, projectId) {
  try {
    await fetch(`${API_BASE_URL}/api/v1/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ product_id: productId, project_id: projectId, picks })
    });
  } catch (error) {
    console.warn("장바구니 API 추가 실패:", error);
  }
}

byId("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  resetCatalog();
});
byId("search-reset").addEventListener("click", () => {
  byId("keyword").value = "";
  resetCatalog();
});
byId("login-button").addEventListener("click", () => {
  if (isAuthenticated()) {
    clearSession();
    state.cart = [];
    renderCart();
    byId("login-button").textContent = "로그인";
    toast("로그아웃했습니다.");
    return;
  }
  byId("login-dialog").showModal();
});
byId("register-button").addEventListener("click", () => byId("register-dialog").showModal());
byId("open-register-from-login").addEventListener("click", () => {
  byId("login-dialog").close();
  byId("register-dialog").showModal();
});
byId("open-forgot-password").addEventListener("click", () => {
  byId("login-dialog").close();
  byId("forgot-password-dialog").showModal();
});
byId("cart-button").addEventListener("click", () => {
  if (!requireLogin()) return;
  renderCart();
  byId("cart-dialog").showModal();
});
byId("menu-button").addEventListener("click", () => byId("primary-nav").classList.toggle("is-open"));

async function checkout() {
  if (!state.cart.length) return toast("장바구니가 비어 있습니다.");
  byId("shipping-total").textContent = `입금 예정 금액: ${byId("cart-total").textContent} · 서버에서 최종 금액을 다시 확인합니다.`;
  byId("shipping-dialog").showModal();
}
async function submitCheckout(event) {
  event.preventDefault();
  const productIds = state.cart.map((entry) => typeof entry === "string" ? entry : entry.productId);
  const shipping = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const projectRequest = state.pendingProject ? {
      url: `${API_BASE_URL}/api/projects/${state.pendingProject.projectId}/participate`,
      body: { preferences: state.pendingProject.preferences, shipping }
    } : {
      url: `${API_BASE_URL}/api/v1/checkout-with-shipping`,
      body: { product_ids: productIds, shipping }
    };
    const response = await fetch(projectRequest.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(state.pendingProject ? { "Idempotency-Key": state.checkoutKey || (state.checkoutKey = crypto.randomUUID()) } : {}), ...identityHeaders() },
      body: JSON.stringify(projectRequest.body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "결제에 실패했습니다.");
    await saveActivity({ type: "settlement", title: "입금 대기 신청", message: `${state.pendingProject ? "공구 자리 신청" : `${productIds.length}건`} · 배송 완료 D+7 자동 확정 대기` });
    state.cart = state.pendingProject ? state.cart : [];
    state.pendingProject = null;
    state.checkoutKey = null;
    renderCart();
    renderActivities();
    byId("shipping-dialog").close();
    byId("cart-dialog").close();
    const payment = result.payment;
    renderPaymentResult(payment);
    byId("payment-dialog").showModal();
  } catch (error) {
    toast(`결제 실패: ${error.message}`);
  }
}
function renderPaymentResult(payment) {
  const completed = ["PAID", "HELD", "RELEASED"].includes(payment.status);
  byId("payment-result").innerHTML = `<p><strong>${completed ? "입금이 확인되었습니다." : "신청이 완료되었습니다."}</strong></p><p>입금 상태: ${completed ? "입금 완료" : "입금 대기"}</p><p>입금 금액: ${money.format(payment.amount)}</p><p>은행: ${payment.virtual_account_bank}</p><p>가상계좌: <strong>${payment.virtual_account}</strong></p><p class="muted">${completed ? "자리가 확정되었습니다." : "입금 확인 후 자리가 확정됩니다. 입금자명은 일치하지 않아도 됩니다."}</p>`;
  byId("refresh-payment-button").hidden = completed;
  byId("refresh-payment-button").dataset.paymentId = payment.id;
}
async function refreshPaymentStatus() {
  const paymentId = byId("refresh-payment-button").dataset.paymentId;
  if (!paymentId) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/payments/${paymentId}`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "입금 상태를 확인하지 못했습니다.");
    renderPaymentResult(result.payment);
    toast(result.payment.status === "PENDING" ? "아직 입금 대기 중입니다." : "입금 상태를 갱신했습니다.");
  } catch (error) {
    toast(error.message);
  }
}
async function confirmReceipt(button) {
  if (!window.confirm("상품을 수령했습니까? 수령 확인 후 총대 정산이 가능해집니다.")) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/customer/orders/${button.dataset.confirmReceipt}/confirm-receipt`, { method: "POST", headers: { ...identityHeaders() } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "수령 확인 실패");
    toast("수령 확인이 완료되었습니다.");
    renderActivities();
  } catch (error) {
    toast(error.message);
  }
}
function openReviewDialog(button) {
  const form = byId("review-form");
  form.reset();
  form.elements.order_id.value = button.dataset.reviewOrder;
  byId("review-status").textContent = "";
  byId("review-dialog").showModal();
}
async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  const status = byId("review-status");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ order_id: input.order_id, rating: Number(input.rating), body: input.body })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === "REVIEW_ALREADY_EXISTS" ? "이미 후기를 작성한 주문입니다." : result.error || "후기 등록 실패");
    byId("review-dialog").close();
    toast(`후기가 등록되어 총대 신뢰도가 ${Number(result.leader_trust_score).toFixed(1)}점으로 갱신됐습니다.`);
    renderActivities();
  } catch (error) {
    status.textContent = error.message;
  }
}
byId("checkout-button").addEventListener("click", checkout);
byId("shipping-form").addEventListener("submit", submitCheckout);
byId("refresh-payment-button").addEventListener("click", refreshPaymentStatus);
byId("language-select").addEventListener("change", (event) => {
  state.language = event.target.value;
  localStorage.setItem(LANGUAGE_KEY, state.language);
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
async function loadPurchaseHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/customer/purchase-history`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "참여 내역 조회 실패");
    const list = byId("participation-list");
    const timeline = byId("participation-timeline");
    state.disputeOrderId = (result.items || []).find((order) => !["EXPIRED", "CANCELLED", "SETTLED"].includes(order.status))?.id || null;
    const items = (result.items || []).map((order) => {
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const status = payment?.status === "PENDING" ? "입금 대기" : ["PAID", "HELD"].includes(payment?.status) ? "입금 완료" : payment?.status === "RELEASED" ? "정산 완료" : order.status;
      const title = order.order_items?.[0]?.title || "공구 신청";
      return `${title} · ${status} · ${money.format(order.total)} · ${new Date(order.created_at).toLocaleString("ko-KR")}`;
    });
    list.replaceChildren(...(items.length
      ? items.map((item) => Object.assign(document.createElement("p"), { className: "activity-item", textContent: item }))
      : [Object.assign(document.createElement("p"), { className: "muted", textContent: "참여한 공구가 없습니다." })]));
    const stages = ["모집", "입금", "구매", "개봉·배정", "발송", "수령", "정산"];
    timeline.replaceChildren(...(result.items || []).map((order) => {
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const paymentComplete = ["PAID", "HELD", "RELEASED"].includes(payment?.status);
      const statusIndex = order.status === "PAYMENT_PENDING" && !paymentComplete ? 1 : order.status === "PAYMENT_CONFIRMED" ? 2 : order.status === "SHIPPED" ? 4 : order.status === "RECEIVED" ? 5 : order.status === "SETTLED" ? 6 : 1;
      const card = document.createElement("article");
      card.className = "report-item";
      const title = order.order_items?.[0]?.title || "공구 신청";
      const steps = stages.map((stage, index) => `<span class="status${index < statusIndex ? "" : index === statusIndex ? " active" : " pending"}">${stage}</span>`).join(" → ");
      const canReview = ["RECEIVED", "SETTLED"].includes(order.status) && !order.reviews?.length;
      card.innerHTML = `<strong>${title}</strong><p class="timeline-steps">${steps}</p><span class="muted">현재 상태: ${order.status === "RECEIVED" ? "수령 확인" : order.status === "SETTLED" ? "정산 완료" : paymentComplete ? "입금 완료" : "입금 대기"}</span>${order.status === "SHIPPED" ? `<button class="button" data-confirm-receipt="${order.id}" type="button">수령 확인</button>` : ""}${canReview ? `<button class="button button-secondary" data-review-order="${order.id}" type="button">후기 작성</button>` : order.reviews?.length ? '<span class="muted">후기 작성 완료</span>' : ""}`;
      return card;
    }));
    const allocationResponse = await fetch(`${API_BASE_URL}/api/v1/customer/allocations`, { headers: identityHeaders() });
    const allocationResult = await allocationResponse.json();
    if (allocationResponse.ok) {
      (allocationResult.items || []).forEach((allocation) => {
        list.append(Object.assign(document.createElement("p"), {
          className: "activity-item",
          textContent: allocation.outcome === "ASSIGNED"
            ? `${allocation.project_title} · ${allocation.assigned_member} · ${allocation.preference_rank}지망 배정`
            : `${allocation.project_title} · 미배정 · ${money.format(allocation.refund_amount)} 자동 환불`
        }));
      });
    }
  } catch (error) {
    console.warn("구매·참여 내역 조회 실패:", error);
  }
}
async function loadCompensations() {
  if (state.role !== "CUSTOMER") return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/customer/compensations`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "보상금 조회 실패");
    if (!result.items?.length) return;
    const list = byId("settlement-list");
    if (list.querySelector(".muted")) list.replaceChildren();
    result.items.forEach((compensation) => {
      const status = compensation.status === "PAID" ? "지급 완료" : "지급 대기";
      list.append(Object.assign(document.createElement("p"), {
        className: "activity-item",
        textContent: `위약 보상금 ${money.format(compensation.amount)} · ${status} · ${compensation.reason}`
      }));
    });
  } catch (error) {
    console.warn("보상금 내역 조회 실패:", error);
  }
}
async function loadSavedAddresses() {
  const list = byId("saved-address-list");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/account/addresses`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "배송지 조회 실패");
    renderSavedAddresses(result.items || []);
  } catch (error) {
    list.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: `배송지를 불러오지 못했습니다: ${error.message}` }));
  }
}
function orderProjectStatus(order) { return order.project?.status || order.projects?.status || order.status; }
function orderStage(order) {
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const status = orderProjectStatus(order);
  if (status === "SHIPPED" || order.status === "SHIPPED") return 3;
  if (["SETTLED", "COMPLETED", "DONE"].includes(status) || ["RECEIVED", "SETTLED"].includes(order.status)) return 4;
  if (["PACKING", "배송준비"].includes(status)) return 2;
  if (["PAYMENT_CONFIRMED", "ALLOCATED"].includes(order.status) || ["HELD", "RELEASED"].includes(payment?.status)) return 1;
  return 0;
}
function orderStageName(order) { return ["입금 확인중", "구매 완료", "배송 준비중", "배송 중", "거래 완료"][orderStage(order)]; }
function renderProgressSteps(order) {
  const current = orderStage(order);
  const labels = ["입금 확인중", "구매 완료", "배송 준비중", "배송 중", "거래 완료"];
  return `<div class="progress-steps">${labels.map((label, index) => `<span class="progress-step${index <= current ? " is-active" : ""}" title="${label}"></span>`).join("")}</div><div class="progress-labels">${labels.map((label, index) => `<span class="${index <= current ? "is-active" : ""}">${label}</span>`).join("")}</div>`;
}
function orderTitle(order) { return order.order_items?.[0]?.title || order.project_title || "공구 참여"; }
function renderParticipatingOrders() {
  const list = byId("participating-list");
  const active = managementState.orders.filter((order) => !["EXPIRED", "CANCELLED", "SETTLED", "REFUNDED"].includes(order.status));
  byId("participating-summary").textContent = `${active.length}건 진행 중`;
  list.replaceChildren(...(active.length ? active.map((order) => {
    const card = document.createElement("article");
    card.className = "management-card";
    card.dataset.orderDetail = order.id;
    card.innerHTML = `<h3>${orderTitle(order)}</h3><p>${money.format(order.total)} · ${orderStageName(order)}</p>${renderProgressSteps(order)}<p class="muted">${new Date(order.created_at).toLocaleDateString("ko-KR")} 신청</p>`;
    return card;
  }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "현재 참여 중인 공구가 없습니다." })]));
}
function renderHistoryOrders() {
  const list = byId("history-list");
  const isHosted = managementState.historyTab === "hosted";
  const items = isHosted ? managementState.projects.filter((project) => ["SETTLED", "CANCELLED", "COMPLETED"].includes(project.status)) : managementState.orders.filter((order) => ["SETTLED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status));
  list.replaceChildren(...(items.length ? items.map((item) => {
    const card = document.createElement("article");
    card.className = "management-card";
    const title = isHosted ? item.title : orderTitle(item);
    const completedAt = item.updated_at || item.created_at;
    card.innerHTML = `<h3>${title}</h3><p><span class="status">${isHosted ? "총대" : "참여자"}</span> · ${item.status}</p><p class="muted">${new Date(completedAt).toLocaleDateString("ko-KR")}</p>${!isHosted && item.status === "SETTLED" ? `<button class="button button-secondary" data-review-order="${item.id}" type="button">총대 매너 평가</button>` : ""}`;
    return card;
  }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "해당 내역이 없습니다." })]));
}
function openOrderDetail(orderId) {
  const order = managementState.orders.find((item) => item.id === orderId);
  if (!order) return;
  const shipping = order.shipping_info || {};
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const shipment = order.shipment || {};
  const addressChange = shipping.address_change_status;
  const canChange = !["SHIPPED", "SETTLED", "배송중", "완료"].includes(orderProjectStatus(order)) && orderStage(order) < 3;
  const content = byId("order-detail-content");
  content.innerHTML = `<h3>${orderTitle(order)}</h3>${renderProgressSteps(order)}<dl class="detail-summary-grid"><div><dt>주문 옵션</dt><dd>${order.order_items?.[0]?.member_name || "기본 옵션"}</dd></div><div><dt>총 입금액</dt><dd>${money.format(order.total)}</dd></div><div><dt>입금 상태</dt><dd>${payment?.status || order.status}</dd></div><div><dt>환불 상태</dt><dd>${order.status === "REFUNDED" ? `환불 완료 ${money.format(payment?.amount || order.total)}` : "환불 없음"}</dd></div></dl><section><h4>배송지</h4><p>${shipping.recipient_name || "받는 분 미입력"} · ${shipping.phone || "연락처 미입력"}</p><p>${shipping.postal_code || ""} ${shipping.address || "주소 미입력"} ${shipping.address_detail || ""}</p><p class="muted">${addressChange ? `주소 변경 ${addressChange}` : "주소 변경 요청 없음"}</p><button class="button button-secondary" data-request-address="${order.id}" type="button" ${canChange ? "" : "disabled"}>배송지 변경 신청</button>${canChange ? "" : "<span class=\"field-hint\">배송이 시작되어 주소 변경이 불가합니다.</span>"}</section><section><h4>배송 추적</h4><p>${shipment.tracking_number || "운송장 등록 전"}</p>${shipment.tracking_number ? `<a class="tracking-link" href="https://tracker.delivery/#/${shipment.carrier || ""}/${shipment.tracking_number}" target="_blank" rel="noopener">배송 추적</a>` : ""}</section><section><h4>비밀 Q&A</h4><p class="muted">주문 관련 문의는 분쟁 신고 또는 고객센터를 이용해 주세요.</p></section>`;
  byId("order-detail-dialog").showModal();
}
async function loadManagementOrders() {
  if (!isAuthenticated()) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/customer/purchase-history`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "공구 내역 조회 실패");
    managementState.orders = result.items || [];
    renderParticipatingOrders();
    renderHistoryOrders();
  } catch (error) { byId("participating-list").replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: error.message })); }
}
function renderSavedAddresses(addresses) {
  const list = byId("saved-address-list");
  list.replaceChildren(...(addresses.length ? addresses.map((address) => {
    const card = document.createElement("article"); card.className = "address-card";
    card.innerHTML = `<h3>${address.label} ${address.is_default ? '<span class="status badge-success">기본</span>' : ""}</h3><p>${address.recipient_name} · ${address.phone}</p><p>${address.postal_code} ${address.address} ${address.address_detail || ""}</p><div class="address-actions"><button class="button button-secondary" data-default-address="${address.id}" type="button" ${address.is_default ? "disabled" : ""}>기본 배송지로 설정</button><button class="button button-danger" data-delete-address="${address.id}" type="button" ${address.is_default ? "disabled" : ""}>삭제</button></div>`;
    return card;
  }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "저장된 배송지가 없습니다. 새 배송지를 추가해 주세요." })]));
}
async function setDefaultAddress(addressId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/account/addresses/${addressId}/default`, { method: "PATCH", headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "기본 배송지 설정 실패");
    await loadSavedAddresses();
    toast("기본 배송지를 변경했습니다.");
  } catch (error) { toast(error.message); }
}
async function deleteSavedAddress(addressId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/account/addresses/${addressId}`, { method: "DELETE", headers: identityHeaders() });
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || "배송지 삭제 실패"); }
    await loadSavedAddresses();
    toast("배송지를 삭제했습니다.");
  } catch (error) { toast(error.message); }
}
function maskPhone(phone) { const value = String(phone || ""); return value.length >= 8 ? `${value.slice(0, 3)}-****-${value.slice(-4)}` : "연락처 보호됨"; }
function renderHostingProjects() {
  const list = byId("hosting-project-list");
  list.replaceChildren(...(managementState.projects.length ? managementState.projects.map((project) => {
    const orders = managementState.hostingOrders.filter((order) => order.project_id === project.id);
    const pendingDeposits = orders.filter((order) => (Array.isArray(order.payments) ? order.payments[0]?.status : order.payments?.status) === "PENDING").length;
    const pendingAddresses = orders.filter((order) => order.shipping_info?.address_change_status === "요청중").length;
    const card = document.createElement("article"); card.className = "management-card"; card.dataset.hostingProject = project.id;
    card.innerHTML = `<h3>${project.title}</h3><p>${project.status} · 참여자 ${orders.length}명</p><div class="hosting-metrics"><span class="status badge-danger">미승인 입금 ${pendingDeposits}</span><span class="status badge-warning">주소 변경 ${pendingAddresses}</span></div>`;
    return card;
  }) : [Object.assign(document.createElement("p"), { className: "muted", textContent: "등록한 공구가 없습니다." })]));
}
function renderHostingDetail() {
  const project = managementState.projects.find((item) => item.id === managementState.selectedProjectId);
  if (!project) return;
  const orders = managementState.hostingOrders.filter((order) => order.project_id === project.id);
  byId("hosting-detail-title").textContent = `${project.title} 관리`;
  const pending = orders.filter((order) => (Array.isArray(order.payments) ? order.payments[0]?.status : order.payments?.status) === "PENDING");
  byId("hosting-deposits-panel").innerHTML = `<div class="management-table-wrap"><table class="management-table"><thead><tr><th>참여자</th><th>입금액</th><th>연락처</th><th>주소</th><th>상태</th><th>액션</th></tr></thead><tbody>${(pending.length ? pending : orders).map((order) => { const shipping = order.shipping_info || {}; const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments; return `<tr><td>${order.customer_id}</td><td>${money.format(order.total)}</td><td>${maskPhone(shipping.phone)}</td><td>배송지 보호됨</td><td>${payment?.status || order.status}</td><td>${payment?.status === "PENDING" ? `<button class="button" data-hosting-payment="${order.id}" type="button">입금 승인</button>` : "확인됨"}</td></tr>`; }).join("")}</tbody></table></div>`;
  const addressRequests = orders.filter((order) => order.shipping_info?.address_change_status === "요청중");
  byId("hosting-addresses-panel").innerHTML = addressRequests.length ? addressRequests.map((order) => `<article class="report-item"><div><strong>${order.customer_id}</strong><p>기존: ${order.shipping_info.address || "미입력"}</p><p>신규: ${order.shipping_info.new_address || "요청 주소 미입력"}</p></div><button class="button button-secondary" data-address-approve="${order.id}" type="button">승인</button></article>`).join("") : '<p class="muted">처리할 주소 변경 요청이 없습니다.</p>';
  byId("hosting-shipment-form").hidden = false;
}
async function loadHostingManagement() {
  if (!isAuthenticated() || !["SELLER", "ADMIN"].includes(state.role)) return;
  try {
    const [projectsResponse, ordersResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/seller/projects`, { headers: identityHeaders() }),
      fetch(`${API_BASE_URL}/api/v1/seller/orders`, { headers: identityHeaders() })
    ]);
    const projectsResult = await projectsResponse.json(); const ordersResult = await ordersResponse.json();
    if (!projectsResponse.ok) throw new Error(projectsResult.error || "총대 공구 조회 실패");
    if (!ordersResponse.ok) throw new Error(ordersResult.error || "참여자 조회 실패");
    managementState.projects = projectsResult.items || [];
    managementState.hostingOrders = ordersResult.items || [];
    renderHostingProjects();
  } catch (error) { byId("hosting-project-list").replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: error.message })); }
}
async function submitHostingShipment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  if (!managementState.selectedProjectId) return toast("공구를 먼저 선택해 주세요.");
  const hasPendingAddress = managementState.hostingOrders.some((order) => order.project_id === managementState.selectedProjectId && order.shipping_info?.address_change_status === "요청중");
  if (hasPendingAddress) return toast("미처리된 주소 변경 요청이 있어 배송 시작을 차단했습니다.");
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/shipments`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ ...input, project_id: managementState.selectedProjectId }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "운송장 등록 실패");
    toast("운송장을 등록하고 배송을 시작했습니다."); loadHostingManagement();
  } catch (error) { toast(error.message); }
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
    loadPurchaseHistory();
    loadCompensations();
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
    activateUser(result.user, result.token);
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
    if (!response.ok && result.error === "ACCOUNT_DELETED_RECOVERABLE") {
      if (!window.confirm("탈퇴한 계정입니다. 한 달 이내라 복구할 수 있습니다. 계정을 복구하시겠습니까?")) return;
      const restoreResponse = await fetch(`${API_BASE_URL}/api/v1/auth/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const restored = await restoreResponse.json();
      if (!restoreResponse.ok) throw new Error(restored.error || "계정 복구에 실패했습니다.");
      activateUser(restored.user, restored.token);
      byId("login-dialog").close();
      toast("계정이 복구되었습니다.");
      loadCart();
      renderActivities();
      return;
    }
    if (!response.ok) throw new Error(result.error || "인증에 실패했습니다.");
    activateUser(result.user, result.token);
    byId("login-dialog").close();
    toast("로그인했습니다.");
    loadCart();
    renderActivities();
  } catch (error) {
    toast(`로그인 실패: ${error.message}`);
  }
}
async function requestPasswordReset(event) {
  event.preventDefault();
  const email = event.currentTarget.elements.email.value.trim();
  const status = byId("forgot-password-status");
  status.textContent = "재설정 링크를 요청하는 중입니다.";
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "재설정 요청 실패");
    status.textContent = result.message;
  } catch (error) {
    status.textContent = error.message;
  }
}
function validPasswordForReset(password) {
  const categories = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  return password.length >= 8 && password.length <= 16 && categories >= 2;
}
async function confirmPasswordReset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  const status = byId("reset-password-status");
  if (password !== form.elements.password_confirm.value) return status.textContent = "비밀번호 확인이 일치하지 않습니다.";
  if (!validPasswordForReset(password)) return status.textContent = "8~16자로 영문·숫자·특수문자 중 2가지 이상을 조합해 주세요.";
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.passwordResetToken, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === "INVALID_OR_EXPIRED_RESET_TOKEN" ? "재설정 링크가 만료됐거나 이미 사용되었습니다." : result.error || "비밀번호 변경 실패");
    state.passwordResetToken = null;
    form.reset();
    byId("reset-password-dialog").close();
    byId("login-dialog").showModal();
    toast("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.");
  } catch (error) {
    status.textContent = error.message;
  }
}
function handlePasswordResetLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset_token");
  if (!token) return;
  state.passwordResetToken = token;
  params.delete("reset_token");
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  byId("reset-password-dialog").showModal();
}
async function submitQuickRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.postal_code ||= "배송지 미등록";
  data.address ||= "배송지 미등록";
  const account = data.account;
  delete data.account;
  const errors = validateRegisterForm(form, data);
  if (errors.length) return toast(errors[0]);
  delete data.password_confirm;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, privacy_consent: Boolean(data.privacy_consent), marketing_consent: Boolean(data.marketing_consent), role: "CUSTOMER" }) });
    const result = await response.json();
    if (!response.ok) throw new Error(REGISTER_ERROR_MESSAGES[result.error] || result.error || "회원가입에 실패했습니다.");
    activateUser(result.user, result.token);
    if (account) {
      const accountResponse = await fetch(`${API_BASE_URL}/api/v1/account`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ account }) });
      if (!accountResponse.ok) throw new Error("환불계좌 저장에 실패했습니다.");
    }
    byId("register-dialog").close();
    form.reset();
    toast("회원가입과 환불계좌 등록이 완료되었습니다.");
    loadCart();
    renderActivities();
  } catch (error) {
    toast(`회원가입 실패: ${error.message}`);
  }
}
const REGISTER_ERROR_MESSAGES = {
  INVALID_USERNAME_FORMAT: "아이디는 영문 소문자와 숫자 조합 4~20자로 입력해 주세요.",
  WEAK_PASSWORD: "비밀번호는 영문·숫자·특수문자 중 2가지 이상을 조합해 8~16자로 입력해 주세요.",
  USERNAME_ALREADY_EXISTS: "이미 사용 중인 아이디입니다.",
  EMAIL_UNAVAILABLE: "이미 사용 중인 이메일입니다.",
  PHONE_UNAVAILABLE: "이미 사용 중인 휴대폰 번호입니다.",
  EMAIL_ALREADY_EXISTS: "이미 사용 중인 이메일입니다.",
  INVALID_REGISTRATION: "입력 값을 다시 확인해 주세요."
};
function passwordStrengthScore(password) {
  if (!password) return 0;
  const categories = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < 8 || password.length > 16 || categories < 2) return 1;
  return categories >= 3 && password.length >= 12 ? 3 : 2;
}
function validateRegisterForm(form, data) {
  const errors = [];
  const username = String(data.username || "").trim().toLowerCase();
  if (!/^[a-z0-9]{4,20}$/.test(username)) errors.push("아이디는 영문 소문자와 숫자 조합 4~20자로 입력해 주세요.");
  else if (form.dataset.usernameChecked !== username) errors.push("아이디 중복 확인을 먼저 진행해 주세요.");
  if (passwordStrengthScore(data.password) < 2) errors.push("비밀번호는 영문·숫자·특수문자 중 2가지 이상을 조합해 8~16자로 입력해 주세요.");
  if (data.password !== data.password_confirm) errors.push("비밀번호 확인이 일치하지 않습니다.");
  if (!/^[가-힣a-zA-Z0-9]{2,10}$/.test(String(data.full_name || ""))) errors.push("닉네임은 한글·영문·숫자만 사용해 2~10자로 입력해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email || ""))) errors.push("올바른 이메일 형식을 입력해 주세요.");
  if (!/^[0-9]{9,11}$/.test(String(data.phone || ""))) errors.push("휴대폰 번호는 숫자만 9~11자리로 입력해 주세요.");
  if (!data.privacy_consent) errors.push("서비스 이용약관 및 개인정보 수집·이용에 동의해 주세요.");
  return errors;
}
async function checkUsernameAvailability() {
  const form = byId("quick-register-form");
  const input = form.elements.username;
  const hint = byId("username-hint");
  const username = input.value.trim().toLowerCase();
  if (!/^[a-z0-9]{4,20}$/.test(username)) {
    hint.textContent = "아이디는 영문 소문자와 숫자 조합 4~20자로 입력해 주세요.";
    hint.className = "field-hint field-hint-error";
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/check-username?username=${encodeURIComponent(username)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "중복 확인에 실패했습니다.");
    if (result.available) {
      form.dataset.usernameChecked = username;
      hint.textContent = "사용할 수 있는 아이디입니다.";
      hint.className = "field-hint field-hint-ok";
    } else {
      delete form.dataset.usernameChecked;
      hint.textContent = "이미 사용 중인 아이디입니다.";
      hint.className = "field-hint field-hint-error";
    }
  } catch (error) {
    hint.textContent = error.message;
    hint.className = "field-hint field-hint-error";
  }
}
function setupRegisterFormValidation() {
  const form = byId("quick-register-form");
  if (!form) return;
  const usernameInput = form.elements.username;
  usernameInput.addEventListener("input", () => {
    delete form.dataset.usernameChecked;
    const username = usernameInput.value.trim().toLowerCase();
    const hint = byId("username-hint");
    if (!username) hint.textContent = "영문 소문자와 숫자 조합 4~20자로 입력해 주세요.";
    else if (!/^[a-z0-9]{4,20}$/.test(username)) {
      hint.textContent = "영문 소문자와 숫자 조합 4~20자로 입력해 주세요.";
      hint.className = "field-hint field-hint-error";
    } else {
      hint.textContent = "형식이 올바릅니다. 중복 확인을 진행해 주세요.";
      hint.className = "field-hint";
    }
  });
  byId("check-username-button").addEventListener("click", checkUsernameAvailability);
  const passwordInput = form.elements.password;
  const strengthLabels = ["", "약함", "보통", "강함"];
  passwordInput.addEventListener("input", () => {
    const score = passwordStrengthScore(passwordInput.value);
    const node = byId("password-strength");
    node.textContent = passwordInput.value ? `비밀번호 강도: ${strengthLabels[score] || "약함"}` : "";
    node.className = `password-strength strength-${score}`;
  });
  const confirmInput = form.elements.password_confirm;
  const updateConfirmHint = () => {
    byId("password-confirm-hint").textContent = confirmInput.value && confirmInput.value !== passwordInput.value ? "비밀번호가 일치하지 않습니다." : "";
  };
  confirmInput.addEventListener("input", updateConfirmHint);
  passwordInput.addEventListener("input", updateConfirmHint);
  form.elements.email.addEventListener("input", (event) => {
    const hint = byId("email-hint");
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.target.value);
    hint.textContent = !event.target.value ? "이메일을 입력해 주세요." : valid ? "사용 가능한 이메일 형식입니다." : "올바른 이메일 형식이 아닙니다.";
    hint.className = `field-hint${event.target.value && valid ? " field-hint-ok" : event.target.value ? " field-hint-error" : ""}`;
  });
  form.elements.phone.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^0-9]/g, "");
    const hint = byId("phone-hint");
    hint.textContent = /^[0-9]{9,11}$/.test(event.target.value) ? "입력 형식이 올바릅니다." : "'-' 없이 숫자 9~11자리를 입력해 주세요.";
    hint.className = `field-hint${/^[0-9]{9,11}$/.test(event.target.value) ? " field-hint-ok" : " field-hint-error"}`;
  });
  form.elements.full_name.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/[^가-힣a-zA-Z0-9]/g, "");
  });
  const consentAll = byId("consent-all");
  const consentChecks = [...form.querySelectorAll(".consent-required, .consent-optional")];
  consentAll.addEventListener("change", () => consentChecks.forEach((checkbox) => { checkbox.checked = consentAll.checked; }));
  consentChecks.forEach((checkbox) => checkbox.addEventListener("change", () => {
    consentAll.checked = consentChecks.every((item) => item.checked);
  }));
}
setupRegisterFormValidation();
byId("search-postcode-button")?.addEventListener("click", () => {
  if (!window.daum?.Postcode) return toast("우편번호 검색 서비스를 불러오지 못했습니다. 주소를 직접 입력해 주세요.");
  new window.daum.Postcode({ oncomplete: (data) => {
    const form = byId("quick-register-form");
    form.elements.postal_code.value = data.zonecode;
    form.elements.address.value = data.roadAddress || data.jibunAddress;
    form.elements.address_detail.focus();
  } }).open();
});
function handleOauthRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  const oauthToken = params.get("oauth_token");
  const oauthError = params.get("oauth_error");
  if (!oauthToken && !oauthError) return;
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  if (oauthError) return toast("소셜 로그인에 실패했습니다. 다시 시도해 주세요.");
  let payload;
  try {
    payload = decodeAuthToken(oauthToken);
  } catch {
    return toast("소셜 로그인 토큰이 올바르지 않습니다. 다시 시도해 주세요.");
  }
  activateUser({ id: payload.sub, role: payload.role }, oauthToken);
  state.oauthProfilePending = true;
  byId("login-dialog")?.close();
  byId("register-dialog")?.close();
  toast("소셜 로그인이 완료되었습니다.");
  loadCart();
  renderActivities();
}
handleOauthRedirectResult();
handlePasswordResetLink();

async function handleSupabaseAuthSession(session) {
  if (!session?.access_token) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/oauth/supabase-sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: session.access_token }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "소셜 로그인 동기화에 실패했습니다.");
    activateUser(result.user, result.token);
    state.oauthProfilePending = true;
    byId("login-dialog")?.close();
    byId("register-dialog")?.close();
    toast("소셜 로그인이 완료되었습니다.");
    loadCart();
    renderActivities();
  } catch (error) {
    toast(error.message);
  } finally {
    // 앱 자체 세션(localStorage)만 사용하므로 Supabase 로컬 세션은 재동기화되지 않도록 정리
    supabaseClient.auth.signOut();
  }
}
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) handleSupabaseAuthSession(session);
  });
  supabaseClient.auth.getSession().then(({ data }) => { if (data.session) handleSupabaseAuthSession(data.session); });
}

async function loadProfile() {
  if (!isAuthenticated()) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/account/profile`, { headers: identityHeaders() });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "회원정보를 불러오지 못했습니다.");
    const form = byId("profile-form");
    Object.entries(result.user).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ""; });
    const missingOauthProfile = state.oauthProfilePending && ["phone", "birth_date"].some((key) => !result.user[key]);
    if (missingOauthProfile) {
      byId("profile-form").elements.current_password.required = false;
      setProfileLocked(false);
      showView("mypage");
      toast("외부 로그인 계정입니다. 휴대폰 번호와 생년월일을 추가로 입력해 주세요.");
    } else setProfileLocked(true);
  } catch (error) {
    byId("profile-status").textContent = error.message;
  }
}
function setProfileLocked(locked) {
  const form = byId("profile-form");
  if (!form) return;
  [...form.elements].filter((element) => !["current_password", "email"].includes(element.name) && element.id !== "delete-account-button").forEach((element) => { element.disabled = locked; });
}
async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const profilePath = state.oauthProfilePending ? "/api/v1/account/oauth-profile" : "/api/v1/account/profile";
    const response = await fetch(`${API_BASE_URL}${profilePath}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "회원정보 수정에 실패했습니다.");
    form.elements.current_password.value = "";
    form.elements.new_password.value = "";
    const missingOauthProfile = state.oauthProfilePending && ["phone", "birth_date"].some((key) => !result.user[key]);
    if (missingOauthProfile) {
      byId("profile-form").elements.current_password.required = false;
      setProfileLocked(false);
      showView("mypage");
      toast("외부 로그인 계정입니다. 휴대폰 번호와 생년월일을 추가로 입력해 주세요.");
    } else setProfileLocked(true);
    byId("profile-status").textContent = "회원정보가 저장되었습니다.";
    state.oauthProfilePending = false;
    toast("회원정보를 수정했습니다.");
  } catch (error) {
    byId("profile-status").textContent = error.message;
  }
}
async function deleteAccount() {
  if (!requireLogin()) return;
  const password = byId("profile-form").elements.current_password.value;
  if (!password) return byId("profile-status").textContent = "탈퇴하려면 현재 비밀번호를 입력해 주세요.";
  if (!window.confirm("계정을 탈퇴하시겠습니까? 한 달 이내에는 로그인하여 복구할 수 있습니다.")) return;
  const response = await fetch(`${API_BASE_URL}/api/v1/account`, { method: "DELETE", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ password }) });
  const result = await response.json();
  if (!response.ok) return byId("profile-status").textContent = result.error || "회원 탈퇴에 실패했습니다.";
  clearSession();
  byId("login-button").textContent = "로그인";
  showView("home");
  toast("탈퇴 처리가 완료되었습니다. 한 달 이내 로그인하면 계정을 복구할 수 있습니다.");
}
async function openProject(event) {
  event.preventDefault();
  if (!requireLogin()) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const slots = parseSlots(data.slots);
  if (!slots.length) return setWorkflowStatus("자리를 member:가격 형식으로 입력해 주세요.", true);
  const project = {
    group_name: data.group_name,
    goods_type: data.goods_type,
    source_url: data.source_url || null,
    twitter_handle: data.twitter_handle || null,
    slots,
    title: data.title,
    shipping_policy: { fixed_fee: 3000, deadline: data.deadline, quantity: Number(data.quantity) },
    product_metadata: { release_date: data.release_date || null, image_url: data.image_url || null, description: data.description }
  };
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(project) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "공구 개설에 실패했습니다.");
    const depositAmount = Math.ceil(slots.reduce((sum, slot) => sum + slot.price, 0) * 0.1);
    const depositResponse = await fetch(`${API_BASE_URL}/api/projects/${result.project.id}/deposit`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ amount: depositAmount }) });
    const depositResult = await depositResponse.json();
    if (!depositResponse.ok) throw new Error(depositResult.error || "보증금 입금에 실패했습니다.");
    await saveActivity({ type: "participation", title: `공구 개설: ${project.title}`, message: `보증금 ${money.format(depositAmount)} 에스크로 보관` });
    setWorkflowStatus(`공구 등록과 보증금 ${money.format(depositAmount)} 입금이 완료되었습니다.`);
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
  if (fields.title) projectForm.elements.title.value = fields.title;
  if (fields.release_date) projectForm.elements.release_date.value = fields.release_date;
  if (fields.image_url) projectForm.elements.image_url.value = fields.image_url;
  if (fields.description) projectForm.elements.description.value = fields.description;
  if (result.twitter_handle) projectForm.elements.twitter_handle.value = result.twitter_handle;
  if (result.extracted_text) form.elements.text.value = result.extracted_text;
}
async function importProductInfo() {
  const projectForm = byId("open-project-form");
  const sourceUrl = projectForm.elements.source_url.value.trim();
  if (!sourceUrl) return setWorkflowStatus("원구매처 URL을 먼저 입력해 주세요.", true);
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/twitter/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl, text: "" }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "판매처 정보 조회 실패");
    applyOcrFields(result, byId("document-form"));
    setWorkflowStatus("확인된 판매처 정보를 공구 폼에 반영했습니다. 이미지나 상세 설명은 문서 AI 처리로 보완할 수 있습니다.");
  } catch (error) {
    setWorkflowStatus(`판매처 정보를 불러오지 못했습니다: ${error.message}`, true);
  }
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
    if (data.kind === "receipt" && !data.project_id.trim()) throw new Error("영수증을 검증할 공구 ID를 입력해 주세요.");
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
        headers: { "Content-Type": "application/json", ...identityHeaders() },
        body: JSON.stringify({ image_base64, kind: data.kind, project_id: data.project_id || null })
      });
      result = await response.json();
      if (!response.ok) {
        const fallback = await fetch(`${API_BASE_URL}/api/v1/documents/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...identityHeaders() },
          body: JSON.stringify({ kind: data.kind, image, project_id: data.project_id || null })
        });
        result = await fallback.json();
        if (!fallback.ok) throw new Error(result.error || "문서 분석 실패");
      }
    } else if (["receipt", "waybill"].includes(data.kind)) {
      const response = await fetch(`${API_BASE_URL}/api/v1/documents/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...identityHeaders() },
        body: JSON.stringify({ kind: data.kind, text: data.text, project_id: data.project_id || null })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "문서 분석 실패");
    } else {
      const response = await fetch(`${API_BASE_URL}/api/v1/twitter/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://x.com/document-upload", text: data.text })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "문서 분석 실패");
    }
    if (result.kind === "receipt") {
      resultNode.textContent = JSON.stringify({ kind: "receipt", ...result.receipt_fields, verification: result.verification || "검증할 공구 ID를 입력하면 자동 대조됩니다." }, null, 2);
      const explanationForm = byId("receipt-explanation-form");
      const needsExplanation = result.verification?.status === "EXPLANATION_REQUIRED";
      explanationForm.hidden = !needsExplanation;
      if (needsExplanation) {
        explanationForm.elements.receipt_id.value = result.verification.receipt_id;
        explanationForm.elements.explanation.value = "";
        byId("receipt-explanation-deadline").textContent = `제출 기한: ${new Date(result.verification.explanation_due_at).toLocaleString("ko-KR")}`;
        byId("receipt-explanation-status").textContent = result.verification.reasons.join(" ");
      }
      await saveActivity({ type: "notification", message: result.verification ? (result.verification.verified ? "영수증 자동 검증 통과" : "영수증 검증 실패 · 확인 필요") : "영수증 구조화 완료" });
      renderActivities();
      setWorkflowStatus(result.verification?.verified === false ? "영수증 검증에 실패했습니다. 내용을 확인해 주세요." : "영수증 구조화가 완료되었습니다.");
      return;
    }
    if (result.kind === "waybill") {
      resultNode.textContent = JSON.stringify(result, null, 2);
      await saveActivity({ type: "notification", message: result.matching?.matched?.length ? `송장 ${result.matching.matched.length}건 자동 매칭 완료` : "송장 구조화 완료 · 공구 ID를 입력하면 자동 매칭됩니다." });
      renderActivities();
      setWorkflowStatus(result.matching?.unmatched?.length ? "일부 송장을 확인 큐에 남겼습니다." : "송장 구조화와 자동 매칭이 완료되었습니다.");
      return;
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
async function submitReceiptExplanation(event) {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/seller/receipt-verifications/${input.receipt_id}/explanation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...identityHeaders() },
      body: JSON.stringify({ explanation: input.explanation })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "소명 제출 실패");
    byId("receipt-explanation-status").textContent = "소명이 제출되었습니다. 관리자 검토를 기다려 주세요.";
    event.currentTarget.querySelector("button").disabled = true;
    toast("영수증 검증 소명을 제출했습니다.");
  } catch (error) {
    byId("receipt-explanation-status").textContent = error.message;
  }
}

document.querySelector("#auth-form")?.addEventListener("submit", submitAuth);
document.querySelector("#quick-login-form")?.addEventListener("submit", submitQuickLogin);
document.querySelector("#forgot-password-form")?.addEventListener("submit", requestPasswordReset);
document.querySelector("#reset-password-form")?.addEventListener("submit", confirmPasswordReset);
document.querySelector("#review-form")?.addEventListener("submit", submitReview);
document.querySelector("#quick-register-form")?.addEventListener("submit", submitQuickRegister);
document.querySelector("#profile-form")?.addEventListener("submit", updateProfile);
document.querySelector("#delete-account-button")?.addEventListener("click", deleteAccount);
document.querySelector("#profile-form input[name='current_password']")?.addEventListener("input", (event) => setProfileLocked(event.target.value.length < 6));
document.querySelector("#open-project-form")?.addEventListener("submit", openProject);
document.querySelector("#document-form")?.addEventListener("submit", processDocument);
document.querySelector("#receipt-explanation-form")?.addEventListener("submit", submitReceiptExplanation);
document.querySelector("#hosting-shipment-form")?.addEventListener("submit", submitHostingShipment);
document.querySelector("#address-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/account/addresses`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ ...input, is_default: input.is_default === "on" }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "배송지 저장 실패");
    event.currentTarget.reset(); byId("address-dialog").close(); await loadSavedAddresses(); toast("배송지를 Supabase에 저장했습니다.");
  } catch (error) { toast(error.message); }
});
byId("address-postcode-button")?.addEventListener("click", () => {
  if (!window.daum?.Postcode) return toast("주소 검색 서비스를 불러오지 못했습니다.");
  new window.daum.Postcode({ oncomplete: (data) => { const form = byId("address-form"); form.elements.postal_code.value = data.zonecode; form.elements.address.value = data.roadAddress || data.jibunAddress; form.elements.address_detail.focus(); } }).open();
});
document.addEventListener("submit", submitSellerShipment);
document.addEventListener("submit", submitSellerAllocation);
document.addEventListener("submit", forfeitProjectDeposit);
document.querySelector("[data-action='import-product']")?.addEventListener("click", importProductInfo);
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
  if (!requireLogin()) return;
  if (!state.disputeOrderId) return setWorkflowStatus("분쟁을 신고할 진행 중 주문이 없습니다.", true);
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/reports`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ subject_type: "ORDER", subject_id: state.disputeOrderId, reason: "주문 분쟁 신고", details: "사용자가 현재 진행 중인 주문에 대한 검토를 요청했습니다." }) });
    if (!response.ok) throw new Error("신고 접수 실패");
  } catch (error) {
    return setWorkflowStatus(error.message, true);
  }
  await saveActivity({ type: "dispute", message: "분쟁 신고 접수 · 정산 보류 상태" });
  setWorkflowStatus("분쟁 신고를 접수하고 정산을 보류했습니다.");
  renderActivities();
});
document.addEventListener("change", (event) => {
  if (event.target.matches("select[data-report-id]")) updateReportStatus(event.target);
});
document.addEventListener("click", (event) => {
  const receiptButton = event.target.closest("[data-confirm-receipt]");
  if (receiptButton) confirmReceipt(receiptButton);
  if (event.target.closest("#seller-packing-button")) startSellerPacking();
  if (event.target.closest("#seller-settle-button")) settleSellerProject();
  const receiptReviewButton = event.target.closest("[data-review-receipt]");
  if (receiptReviewButton) reviewReceiptVerification(receiptReviewButton);
  const reviewButton = event.target.closest("[data-review-order]");
  if (reviewButton) openReviewDialog(reviewButton);
  const orderCard = event.target.closest("[data-order-detail]");
  if (orderCard) openOrderDetail(orderCard.dataset.orderDetail);
  const historyTab = event.target.closest("[data-history-tab]");
  if (historyTab) { managementState.historyTab = historyTab.dataset.historyTab; document.querySelectorAll("[data-history-tab]").forEach((button) => button.classList.toggle("is-active", button === historyTab)); renderHistoryOrders(); }
  const hostingCard = event.target.closest("[data-hosting-project]");
  if (hostingCard) { managementState.selectedProjectId = hostingCard.dataset.hostingProject; byId("hosting-detail").hidden = false; renderHostingDetail(); }
  const hostingTab = event.target.closest("[data-hosting-tab]");
  if (hostingTab) { managementState.hostingTab = hostingTab.dataset.hostingTab; document.querySelectorAll("[data-hosting-tab]").forEach((button) => button.classList.toggle("is-active", button === hostingTab)); byId("hosting-deposits-panel").hidden = managementState.hostingTab !== "deposits"; byId("hosting-addresses-panel").hidden = managementState.hostingTab !== "addresses"; byId("hosting-shipment-form").hidden = managementState.hostingTab !== "shipments"; }
  const approvePayment = event.target.closest("[data-hosting-payment]");
  if (approvePayment) approveHostingPayment(approvePayment.dataset.hostingPayment);
  const approveAddress = event.target.closest("[data-address-approve]");
  if (approveAddress) approveHostingAddress(approveAddress.dataset.addressApprove);
  const defaultAddress = event.target.closest("[data-default-address]");
  if (defaultAddress) setDefaultAddress(defaultAddress.dataset.defaultAddress);
  const deleteAddress = event.target.closest("[data-delete-address]");
  if (deleteAddress) deleteSavedAddress(deleteAddress.dataset.deleteAddress);
  if (event.target.closest("#add-address-button")) byId("address-dialog").showModal();
  if (event.target.closest("#close-hosting-detail")) byId("hosting-detail").hidden = true;
  const addressRequest = event.target.closest("[data-request-address]");
  if (addressRequest) requestOrderAddress(addressRequest.dataset.requestAddress);
});
async function requestOrderAddress(orderId) {
  if (!window.daum?.Postcode) return toast("주소 검색 서비스를 불러오지 못했습니다.");
  new window.daum.Postcode({ oncomplete: async (data) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/customer/orders/${orderId}/address-request`, { method: "PATCH", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ postal_code: data.zonecode, address: data.roadAddress || data.jibunAddress, address_detail: "" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "주소 변경 신청 실패");
      toast("배송지 변경 신청을 접수했습니다."); byId("order-detail-dialog").close(); loadManagementOrders();
    } catch (error) { toast(error.message); }
  } }).open();
}
async function approveHostingPayment(orderId) {
  try { const response = await fetch(`${API_BASE_URL}/api/v1/seller/orders/${orderId}/approve-deposit`, { method: "POST", headers: identityHeaders() }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "입금 승인 실패"); toast("입금을 승인했습니다."); loadHostingManagement(); } catch (error) { toast(error.message); }
}
async function approveHostingAddress(orderId) {
  try { const response = await fetch(`${API_BASE_URL}/api/v1/seller/orders/${orderId}/address-approve`, { method: "PATCH", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ approve: true }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "주소 승인 실패"); toast("주소 변경을 승인했습니다."); loadHostingManagement(); } catch (error) { toast(error.message); }
}
async function loadCart() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/cart`, { headers: identityHeaders() });
    const result = await response.json();
    if (response.ok) {
      state.cart = (result.items || []).map((item) => ({ productId: item.product.id, projectId: item.project_id || null, picks: item.picks || [] }));
      renderCart();
    }
  } catch (error) {
    console.warn("Supabase 장바구니 조회 실패:", error);
  }
}

new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
}, { rootMargin: "240px" }).observe(byId("scroll-sentinel"));

restoreSession();
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
