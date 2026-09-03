/*
 * API adapter points when connecting a real backend:
 * GET  /api/v1/search?keyword=&category=&sort_by=&page=&limit=
 * GET  /api/v1/recommendations
 * POST /api/v1/cart/items, POST /api/v1/checkout
 * GET  /api/v1/seller/analytics/sales, /seller/payouts/monthly, /seller/reviews
 */
const API_BASE_URL = "http://localhost:3000";
const products = [
  { id: "p1", title: "SEVENTEEN 5집 포토카드 세트", category: "포토카드", tags: ["SEVENTEEN", "랜덤"], members: ["민규", "원우", "호시", "도겸"], price: 12500, participants: 42, min: 50, deadline: 3, popularity: 93, recency: 0.8, member_limit: 15 },
  { id: "p2", title: "aespa 공식 응원봉 공동구매", category: "응원봉", tags: ["aespa", "공식"], price: 39800, participants: 76, min: 70, deadline: 1, popularity: 98, recency: 0.9 },
  { id: "p3", title: "BTS 앨범 럭키드로우", category: "앨범", tags: ["BTS", "앨범"], members: ["RM", "진", "슈가", "제이홉", "지민", "뷔", "정국"], price: 21900, participants: 18, min: 40, deadline: 6, popularity: 88, recency: 0.6, member_limit: 3 },
  { id: "p4", title: "IVE 미니돌 키링", category: "인형", tags: ["IVE", "키링"], members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"], price: 18300, participants: 35, min: 35, deadline: 2, popularity: 91, recency: 0.7, member_limit: 10 },
  { id: "p5", title: "TXT 투어 티셔츠", category: "의류", tags: ["TXT", "투어"], members: ["수빈", "연준", "범규", "태현", "휴닝카이"], price: 28700, participants: 14, min: 30, deadline: 5, popularity: 72, recency: 0.5, member_limit: 8 },
  { id: "p6", title: "BLACKPINK 데코 스티커", category: "액세서리", tags: ["BLACKPINK", "한정"], members: ["지수", "제니", "로제", "리사"], price: 6900, participants: 61, min: 60, deadline: 4, popularity: 84, recency: 0.85, member_limit: 12 }
];
const state = { cart: JSON.parse(localStorage.getItem("pokacatch-cart") || "[]"), role: localStorage.getItem("pokacatch-role") || "CUSTOMER", language: localStorage.getItem("pokacatch-language") || "ko" };
const money = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const byId = (id) => document.getElementById(id);

function score(item) { const preferred = ["포토카드", "앨범"]; return (preferred.includes(item.category) ? 45 : 0) + item.popularity * .35 + item.recency * 25; }
function getFilteredProducts() {
  const keyword = byId("keyword").value.trim().toLowerCase(); const category = byId("category").value; const sortBy = byId("sort-by").value;
  const result = products.filter((p) => (!keyword || [p.title, p.category, ...p.tags].join(" ").toLowerCase().includes(keyword)) && (category === "ALL" || p.category === category));
  return result.sort((a, b) => sortBy === "price" ? a.price - b.price : sortBy === "deadline" ? a.deadline - b.deadline : b.popularity - a.popularity);
}
async function loadMemberCounts(productId, memberSelects) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/members/${productId}`);
    const memberCounts = await response.json();
    updateMemberOptions(productId, memberSelects, memberCounts);
  } catch (error) {
    console.warn("멤버 선택 현황 로드 실패:", error);
  }
}
function updateMemberOptions(productId, memberSelects, memberCounts) {
  if (!memberCounts) return; // API 미사용 시 모든 옵션 활성화
  const selectedMembers = [...memberSelects].map(select => select.value).filter(v => v);
  memberSelects.forEach((select, rankIndex) => {
    const rank = rankIndex + 1;
    [...select.options].slice(1).forEach((option) => {
      const member = option.value;
      const isSelected = option.value === select.value;
      
      // 1지망만 제한 적용, 2지망, 3지망은 항상 활성화
      if (rank === 1) {
        const count = memberCounts[member] ? memberCounts[member].rank1 : 0;
        const limit = memberCounts[member] ? memberCounts[member].limit : 20;
        if (count >= limit && !isSelected) {
          option.disabled = true;
          option.textContent = `${member} (제한 인원 도달)`;
        } else {
          option.disabled = false;
          option.textContent = member;
        }
      } else {
        // 2지망, 3지망은 항상 활성화
        option.disabled = false;
        option.textContent = member;
      }
    });
  });
}

function productCard(product) {
  const node = byId("product-template").content.cloneNode(true); const ratio = Math.min(100, Math.round(product.participants / product.min * 100));
  node.querySelector("h3").textContent = product.title; node.querySelector(".category-badge").textContent = product.category; node.querySelector(".deadline").textContent = product.deadline === 1 ? "오늘 마감" : `${product.deadline}일 남음`; node.querySelector(".tags").textContent = product.tags.map((tag) => `#${tag}`).join(" "); node.querySelector(".price").textContent = money.format(product.price); node.querySelector(".progress-copy").textContent = `${product.participants}명 참여 · 목표 ${product.min}명`; node.querySelector(".progress-track span").style.width = `${ratio}%`;
  node.querySelector(".join-button").dataset.productId = product.id;
  // members가 있는 경우만 멤버 선택 UI 표시
  if (product.members && product.members.length > 0) {
    const memberSelects = node.querySelectorAll(".member-select");
    memberSelects.forEach((select) => {
      product.members.forEach((member) => select.append(new Option(member, member)));
    });
    // 멤버별 선택 제한 정보 로드 및 드롭다운 업데이트 (1지망만)
    loadMemberCounts(product.id, memberSelects);
    // 드롭다운 변경 시 실시간 업데이트
    memberSelects.forEach((select) => {
      select.addEventListener("change", () => updateMemberOptions(product.id, memberSelects));
    });
  } else {
    // members가 없는 경우 fieldset 자체를 숨김
    const fieldset = node.querySelector(".member-picker");
    if (fieldset) fieldset.style.display = "none";
  }
  return node;
}
function renderProducts() { const result = getFilteredProducts(); const grid = byId("product-grid"); grid.replaceChildren(...result.map(productCard)); byId("result-summary").textContent = `${result.length}개 공동구매`; }
function renderRecommendations() { const grid = byId("recommendation-grid"); grid.replaceChildren(...[...products].sort((a,b) => score(b)-score(a)).slice(0,3).map(productCard)); }
function renderCart() { const items = state.cart.map((entry) => ({ product: products.find((item) => item.id === (typeof entry === "string" ? entry : entry.productId)), picks: typeof entry === "string" ? [] : entry.picks })).filter((entry) => entry.product); byId("cart-count").textContent = items.length; byId("cart-total").textContent = money.format(items.reduce((sum, item) => sum + item.product.price, 0)); byId("cart-items").replaceChildren(...(items.length ? items.map(({ product, picks }) => { const row = document.createElement("div"); row.className = "cart-row"; const picksText = product.members && picks.length ? `1지망 ${picks[0]} · 2지망 ${picks[1]} · 3지망 ${picks[2]}` : product.category; row.innerHTML = `<p><strong>${product.title}</strong><br><span class="muted">${picksText}</span></p><strong>${money.format(product.price)}</strong>`; return row; }) : [Object.assign(document.createElement("p"), { textContent: "장바구니가 비어 있습니다.", className: "muted" })])); }
function renderSeller() { const seller = state.role === "SELLER" || state.role === "ADMIN"; const badge = byId("seller-access"); const area = byId("seller-content"); badge.textContent = seller ? `${state.role} 권한으로 열람 중` : "SELLER 권한 필요"; badge.className = `status${seller ? "" : " denied"}`; if (!seller) { area.innerHTML = '<p class="muted">상단 역할 선택에서 판매자로 변경하면 판매 현황, 월 정산 예정액, 후기 목록을 확인할 수 있습니다.</p>'; return; } const active = products.filter((p) => p.participants < p.min); const expected = products.reduce((sum,p) => sum + p.participants * p.price * .9, 0); area.innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.reduce((sum,p)=>sum+p.participants,0)}개</strong><span>누적 참여 수</span></div><div class="metric"><strong>${active.length}건</strong><span>진행 중 공동구매</span></div><div class="metric"><strong>${money.format(expected)}</strong><span>이번 달 정산 예상액 (수수료 10% 제외)</span></div></div><div class="table-wrap"><table class="seller-table"><thead><tr><th>상품</th><th>참여 현황</th><th>목표 달성률</th><th>상태</th></tr></thead><tbody>${products.map(p=>`<tr><td>${p.title}</td><td>${p.participants} / ${p.min}명</td><td>${Math.round(p.participants/p.min*100)}%</td><td>${p.participants >= p.min ? "목표 달성" : "모집 중"}</td></tr>`).join("")}</tbody></table></div>`; }
function toast(message) { const target = byId("toast"); target.textContent = message; target.classList.add("show"); setTimeout(() => target.classList.remove("show"), 2200); }
function setDocumentLanguage(language) { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; }
function initializeCategories() { [...new Set(products.map((p) => p.category))].forEach((category) => byId("category").append(new Option(category, category))); byId("role-select").value = state.role; byId("language-select").value = state.language; setDocumentLanguage(state.language); }
document.addEventListener("click", (event) => { const button = event.target.closest(".join-button"); if (button) { const card = button.closest(".product-card"); const picks = [...card.querySelectorAll(".member-select")].map((select) => select.value); const id = button.dataset.productId; const product = products.find(p => p.id === id);
      // members가 있는 경우만 picks 검증
      if (product.members && product.members.length > 0) {
        if (picks.some((pick) => !pick)) { toast("1~3지망 멤버를 모두 선택해 주세요."); return; }
        if (new Set(picks).size !== picks.length) { toast("각 지망은 서로 다른 멤버로 선택해 주세요."); return; }
      }
      if (!state.cart.some((entry) => (typeof entry === "string" ? entry : entry.productId) === id)) { state.cart.push(product.members ? { productId: id, picks } : { productId: id, picks: [] }); localStorage.setItem("pokacatch-cart", JSON.stringify(state.cart)); addToCartViaAPI(id, product.members ? picks : []); renderCart(); toast(`장바구니에 담았습니다.`); } else toast("이미 장바구니에 있습니다."); } if (event.target.closest("[data-close-dialog]")) byId("cart-dialog").close(); });
async function addToCartViaAPI(productId, picks) {
  try {
    await fetch(`${API_BASE_URL}/api/v1/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, picks })
    });
  } catch (error) {
    console.warn("장바구니 API 추가 실패:", error);
  }
}
byId("search-form").addEventListener("submit", (event) => { event.preventDefault(); renderProducts(); });
byId("cart-button").addEventListener("click", () => { renderCart(); byId("cart-dialog").showModal(); });
byId("checkout-button").addEventListener("click", () => toast("데모입니다. 실제 결제는 POST /api/v1/checkout에 연결하세요."));
byId("role-select").addEventListener("change", (event) => { state.role = event.target.value; localStorage.setItem("pokacatch-role", state.role); renderSeller(); toast(`${state.role} 역할로 전환했습니다.`); });
byId("language-select").addEventListener("change", (event) => { state.language = event.target.value; localStorage.setItem("pokacatch-language", state.language); setDocumentLanguage(state.language); toast(state.language === "ar" ? "تم تفعيل اللغة العربية." : "언어가 변경되었습니다."); });
initializeCategories(); renderProducts(); renderRecommendations(); renderCart(); renderSeller();
