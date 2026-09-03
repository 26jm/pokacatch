/*
 * API adapter points when connecting a real backend:
 * GET  /api/v1/search?keyword=&category=&sort_by=&page=&limit=
 * GET  /api/v1/recommendations
 * POST /api/v1/cart/items, POST /api/v1/checkout
 * GET  /api/v1/seller/analytics/sales, /seller/payouts/monthly, /seller/reviews
 */
const API_BASE_URL = window.__API_BASE_URL__ || (window.location.protocol === "file:" ? "http://localhost:3000" : "");
const products = [
  { id: "p1", title: "SEVENTEEN 5집 포토카드 세트", category: "포토카드", tags: ["SEVENTEEN", "랜덤"], members: ["민규", "원우", "호시", "도겸"], price: 12500, participants: 42, min: 50, deadline: 3, popularity: 93, recency: 0.8, member_limit: 15 },
  { id: "p2", title: "aespa 공식 응원봉 공동구매", category: "응원봉", tags: ["aespa", "공식"], price: 39800, participants: 76, min: 70, deadline: 1, popularity: 98, recency: 0.9 },
  { id: "p3", title: "BTS 앨범 럭키드로우", category: "앨범", tags: ["BTS", "앨범"], members: ["RM", "진", "슈가", "제이홉", "지민", "뷔", "정국"], price: 21900, participants: 18, min: 40, deadline: 6, popularity: 88, recency: 0.6, member_limit: 3 },
  { id: "p4", title: "IVE 미니돌 키링", category: "인형", tags: ["IVE", "키링"], members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"], price: 18300, participants: 35, min: 35, deadline: 2, popularity: 91, recency: 0.7, member_limit: 10 },
  { id: "p5", title: "TXT 투어 티셔츠", category: "의류", tags: ["TXT", "투어"], members: ["수빈", "연준", "범규", "태현", "휴닝카이"], price: 28700, participants: 14, min: 30, deadline: 5, popularity: 72, recency: 0.5, member_limit: 8 },
  { id: "p6", title: "BLACKPINK 데코 스티커", category: "액세서리", tags: ["BLACKPINK", "한정"], members: ["지수", "제니", "로제", "리사"], price: 6900, participants: 61, min: 60, deadline: 4, popularity: 84, recency: 0.85, member_limit: 12 }
];
const state = { cart: [], role: "CUSTOMER", language: "ko", userId: "customer-1" };
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
    const response = await fetch(`${API_BASE_URL}/api/v1/members/${productId}`, { headers: identityHeaders() });
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
  node.querySelector("h3").textContent = product.title; node.querySelector(".category-badge").textContent = t(product.category); node.querySelector(".deadline").textContent = deadlineText(product.deadline); node.querySelector(".tags").textContent = product.tags.map((tag) => `#${tag}`).join(" "); node.querySelector(".price").textContent = money.format(product.price); node.querySelector(".progress-copy").textContent = progressText(product.participants, product.min); node.querySelector(".progress-track span").style.width = `${ratio}%`;
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
function renderProducts() { const result = getFilteredProducts(); const grid = byId("product-grid"); grid.replaceChildren(...result.map(productCard)); byId("result-summary").textContent = state.language === "en" ? `${result.length} group buys` : state.language === "ar" ? `${result.length} عمليات شراء` : state.language === "ja" ? `${result.length}件の共同購入` : state.language === "zh" ? `${result.length}个团购` : `${result.length}개 공동구매`; }
function renderRecommendations() { const grid = byId("recommendation-grid"); grid.replaceChildren(...[...products].sort((a,b) => score(b)-score(a)).slice(0,3).map(productCard)); }
function renderCart() { const items = state.cart.map((entry) => ({ product: products.find((item) => item.id === (typeof entry === "string" ? entry : entry.productId)), picks: typeof entry === "string" ? [] : entry.picks })).filter((entry) => entry.product); byId("cart-count").textContent = items.length; byId("cart-total").textContent = money.format(items.reduce((sum, item) => sum + item.product.price, 0)); byId("cart-items").replaceChildren(...(items.length ? items.map(({ product, picks }) => { const row = document.createElement("div"); row.className = "cart-row"; const picksText = product.members && picks.length ? `1지망 ${picks[0]} · 2지망 ${picks[1]} · 3지망 ${picks[2]}` : product.category; row.innerHTML = `<p><strong>${product.title}</strong><br><span class="muted">${picksText}</span></p><strong>${money.format(product.price)}</strong>`; return row; }) : [Object.assign(document.createElement("p"), { textContent: "장바구니가 비어 있습니다.", className: "muted" })])); }
function renderSeller() { const seller = state.role === "SELLER" || state.role === "ADMIN"; const badge = byId("seller-access"); const area = byId("seller-content"); badge.textContent = seller ? `${state.role} 권한으로 열람 중` : "SELLER 권한 필요"; badge.className = `status${seller ? "" : " denied"}`; if (!seller) { area.innerHTML = '<p class="muted">상단 역할 선택에서 판매자로 변경하면 판매 현황, 월 정산 예정액, 후기 목록을 확인할 수 있습니다.</p>'; return; } const active = products.filter((p) => p.participants < p.min); const expected = products.reduce((sum,p) => sum + p.participants * p.price * .9, 0); area.innerHTML = `<div class="seller-dashboard"><div class="metric"><strong>${products.reduce((sum,p)=>sum+p.participants,0)}개</strong><span>누적 참여 수</span></div><div class="metric"><strong>${active.length}건</strong><span>진행 중 공동구매</span></div><div class="metric"><strong>${money.format(expected)}</strong><span>이번 달 정산 예상액 (수수료 10% 제외)</span></div></div><div class="table-wrap"><table class="seller-table"><thead><tr><th>상품</th><th>참여 현황</th><th>목표 달성률</th><th>상태</th></tr></thead><tbody>${products.map(p=>`<tr><td>${p.title}</td><td>${p.participants} / ${p.min}명</td><td>${Math.round(p.participants/p.min*100)}%</td><td>${p.participants >= p.min ? "목표 달성" : "모집 중"}</td></tr>`).join("")}</tbody></table></div>`; }
function toast(message) { const target = byId("toast"); target.textContent = message; target.classList.add("show"); setTimeout(() => target.classList.remove("show"), 2200); }
const languageMessages = { ko: "언어가 변경되었습니다.", en: "Language changed.", ar: "تم تغيير اللغة.", ja: "言語を変更しました。", zh: "语言已切换。" };
const translations = {
  en: { "언어 선택": "Language", "고객": "Customer", "판매자": "Seller", "관리자": "Admin", "한국어": "Korean", "العربية": "Arabic", "日本語": "Japanese", "简体中文": "Chinese", "둘러보기": "Explore", "공구 관리": "Group Buy", "마이페이지": "My Page", "판매자": "Seller", "알림": "Notifications", "장바구니": "Cart", "함께 모여 더 좋은 가격으로.": "Better prices, together.", "안전하게 인증된 공구를 찾아, 최애 멤버 1~3지망을 선택하고 함께 참여하세요.": "Find verified group buys, choose your top three members, and join together.", "진행 중인 공동구매": "Active Group Buys", "검색어": "Search", "아티스트명, 앨범명, 멤버 이름 검색": "Search artist, album, or member", "전체": "All", "인기순": "Most popular", "마감 임박순": "Ending soon", "낮은 가격순": "Lowest price", "검색": "Search", "맞춤 추천": "Recommended for you", "카테고리 선호도 · 인기 · 마감 임박도를 반영합니다.": "Based on category preferences, popularity, and deadline.", "판매자 대시보드": "Seller Dashboard", "공구 작업실": "Group Buy Workspace", "대기 중": "Waiting", "계정·환급 계좌": "Account and payout account", "이메일": "Email", "비밀번호": "Password", "역할": "Role", "참여자": "Participant", "총대": "Organizer", "회원가입": "Sign up", "로그인": "Log in", "환급 계좌": "Payout account", "계좌 저장": "Save account", "공구 개설": "Create group buy", "아이돌": "Artist", "그룹명": "Group name", "굿즈": "Goods", "포토카드": "Photocard", "1차 판매처": "Primary retailer", "마감일": "Deadline", "자리와 가격": "Slots and prices", "필요 앨범 수량": "Album quantity", "보증금 안내 후 공구 오픈": "Open after deposit instructions", "문서 AI 처리": "AI document processing", "문서 종류": "Document type", "영수증": "Receipt", "송장": "Waybill", "캡처 텍스트": "Captured text", "이미지에서 읽은 영수증 또는 송장 내용을 붙여 넣으세요.": "Paste the receipt or waybill text read from the image.", "Upstage로 구조화": "Structure with Upstage", "아직 처리된 문서가 없습니다.": "No document has been processed yet.", "내 활동": "My Activity", "로그아웃 상태": "Logged out", "내 참여": "My participation", "정산·환불": "Payouts and refunds", "알림·분쟁": "Alerts and disputes", "자리 알림 대기 등록": "Notify me when a slot opens", "현재 주문 분쟁 신고": "Report a dispute", "닫기": "Close", "합계": "Total", "결제 진행": "Proceed to payment", "멤버 지망 선택": "Choose member preferences", "선택": "Select", "지망 선택 후 담기": "Choose preferences and add", "SELLER 권한 필요": "SELLER access required", "언어가 변경되었습니다.": "Language changed." },
  ar: { "언어 선택": "اللغة", "고객": "عميل", "판매자": "بائع", "관리자": "مسؤول", "한국어": "الكورية", "English": "الإنجليزية", "日本語": "اليابانية", "简体中文": "الصينية المبسطة", "둘러보기": "استكشاف", "공구 관리": "الشراء الجماعي", "마이페이지": "صفحتي", "알림": "الإشعارات", "장바구니": "السلة", "함께 모여 더 좋은 가격으로.": "معًا نحصل على سعر أفضل.", "안전하게 인증된 공구를 찾아, 최애 멤버 1~3지망을 선택하고 함께 참여하세요.": "اعثر على شراء جماعي موثوق، واختر أعضاءك الثلاثة المفضلين وانضم.", "진행 중인 공동구매": "عمليات الشراء الجماعي النشطة", "검색어": "بحث", "아티스트명, 앨범명, 멤버 이름 검색": "ابحث عن فنان أو ألبوم أو عضو", "전체": "الكل", "인기순": "الأكثر شعبية", "마감 임박순": "ينتهي قريبًا", "낮은 가격순": "الأقل سعرًا", "검색": "بحث", "맞춤 추천": "موصى به لك", "판매자 대시보드": "لوحة البائع", "공구 작업실": "مساحة الشراء الجماعي", "대기 중": "قيد الانتظار", "계정·환급 계좌": "الحساب وحساب الدفع", "이메일": "البريد الإلكتروني", "비밀번호": "كلمة المرور", "역할": "الدور", "참여자": "مشارك", "총대": "منظم", "회원가입": "إنشاء حساب", "로그인": "تسجيل الدخول", "환급 계좌": "حساب الدفع", "계좌 저장": "حفظ الحساب", "공구 개설": "إنشاء شراء جماعي", "아이돌": "الفنان", "그룹명": "اسم المجموعة", "굿즈": "المنتج", "마감일": "الموعد النهائي", "자리와 가격": "المقاعد والأسعار", "필요 앨범 수량": "كمية الألبومات", "문서 AI 처리": "معالجة المستند بالذكاء الاصطناعي", "문서 종류": "نوع المستند", "영수증": "إيصال", "송장": "بوليصة شحن", "캡처 텍스트": "النص الملتقط", "Upstage로 구조화": "تنظيم باستخدام Upstage", "내 활동": "نشاطي", "로그아웃 상태": "تم تسجيل الخروج", "내 참여": "مشاركاتي", "정산·환불": "المدفوعات والمبالغ المستردة", "알림·분쟁": "التنبيهات والنزاعات", "자리 알림 대기 등록": "التنبيه عند توفر مقعد", "현재 주문 분쟁 신고": "الإبلاغ عن نزاع", "닫기": "إغلاق", "합계": "المجموع", "결제 진행": "متابعة الدفع", "멤버 지망 선택": "اختر تفضيلات الأعضاء", "선택": "اختيار", "지망 선택 후 담기": "اختر التفضيلات وأضف", "SELLER 권한 필요": "يلزم وصول البائع", "언어가 변경되었습니다.": "تم تغيير اللغة." },
  ja: { "언어 선택": "言語", "고객": "購入者", "판매자": "販売者", "관리자": "管理者", "한국어": "韓国語", "English": "英語", "العربية": "アラビア語", "简体中文": "中国語", "둘러보기": "見つける", "공구 관리": "共同購入管理", "마이페이지": "マイページ", "알림": "通知", "장바구니": "カート", "함께 모여 더 좋은 가격으로.": "みんなで集まって、もっとお得に。", "안전하게 인증된 공구를 찾아, 최애 멤버 1~3지망을 선택하고 함께 참여하세요.": "認証済みの共同購入を探し、好きなメンバーを第3希望まで選んで参加しましょう。", "진행 중인 공동구매": "受付中の共同購入", "검색어": "検索語", "아티스트명, 앨범명, 멤버 이름 검색": "アーティスト、アルバム、メンバーを検索", "전체": "すべて", "인기순": "人気順", "마감 임박순": "締切が近い順", "낮은 가격순": "価格が安い順", "검색": "検索", "맞춤 추천": "おすすめ", "판매자 대시보드": "販売者ダッシュボード", "공구 작업실": "共同購入ワークスペース", "대기 중": "待機中", "계정·환급 계좌": "アカウント・振込口座", "이메일": "メール", "비밀번호": "パスワード", "역할": "役割", "참여자": "参加者", "총대": "主催者", "회원가입": "会員登録", "로그인": "ログイン", "환급 계좌": "振込口座", "계좌 저장": "口座を保存", "공구 개설": "共同購入を開設", "아이돌": "アイドル", "그룹명": "グループ名", "굿즈": "グッズ", "포토카드": "フォトカード", "1차 판매처": "一次販売店", "마감일": "締切日", "자리와 가격": "枠と価格", "필요 앨범 수량": "必要なアルバム数", "보증금 안내 후 공구 오픈": "デポジット案内後に開設", "문서 AI 처리": "AI書類処理", "문서 종류": "書類の種類", "영수증": "領収書", "송장": "送り状", "캡처 텍스트": "キャプチャテキスト", "Upstage로 구조화": "Upstageで構造化", "내 활동": "マイアクティビティ", "로그아웃 상태": "ログアウト中", "내 참여": "参加履歴", "정산·환불": "精算・返金", "알림·분쟁": "通知・紛争", "자리 알림 대기 등록": "空き枠通知を登録", "현재 주문 분쟁 신고": "注文の紛争を報告", "닫기": "閉じる", "합계": "合計", "결제 진행": "支払いへ進む", "멤버 지망 선택": "メンバー希望を選択", "선택": "選択", "지망 선택 후 담기": "希望を選んで追加", "SELLER 권한 필요": "販売者権限が必要", "언어가 변경되었습니다.": "言語を変更しました。" },
  zh: { "언어 선택": "语言", "고객": "客户", "판매자": "卖家", "관리자": "管理员", "한국어": "韩语", "English": "英语", "العربية": "阿拉伯语", "日本語": "日语", "둘러보기": "浏览", "공구 관리": "团购管理", "마이페이지": "我的页面", "알림": "通知", "장바구니": "购物车", "함께 모여 더 좋은 가격으로.": "一起购买，享受更优惠的价格。", "안전하게 인증된 공구를 찾아, 최애 멤버 1~3지망을 선택하고 함께 참여하세요.": "寻找经过认证的团购，选择最喜欢的成员志愿并一起参与。", "진행 중인 공동구매": "进行中的团购", "검색어": "搜索词", "아티스트명, 앨범명, 멤버 이름 검색": "搜索艺人、专辑或成员", "전체": "全部", "인기순": "热门排序", "마감 임박순": "即将结束", "낮은 가격순": "价格最低", "검색": "搜索", "맞춤 추천": "为你推荐", "판매자 대시보드": "卖家仪表盘", "공구 작업실": "团购工作区", "대기 중": "等待中", "계정·환급 계좌": "账户与收款账户", "이메일": "邮箱", "비밀번호": "密码", "역할": "角色", "참여자": "参与者", "총대": "组织者", "회원가입": "注册", "로그인": "登录", "환급 계좌": "收款账户", "계좌 저장": "保存账户", "공구 개설": "创建团购", "아이돌": "艺人", "그룹명": "组合名", "굿즈": "周边", "포토카드": "小卡", "1차 판매처": "首发商店", "마감일": "截止日期", "자리와 가격": "名额与价格", "필요 앨범 수량": "所需专辑数量", "보증금 안내 후 공구 오픈": "查看保证金说明后创建", "문서 AI 처리": "AI文档处理", "문서 종류": "文档类型", "영수증": "收据", "송장": "运单", "캡처 텍스트": "截图文字", "Upstage로 구조화": "使用 Upstage 结构化", "내 활동": "我的活动", "로그아웃 상태": "已退出", "내 참여": "我的参与", "정산·환불": "结算与退款", "알림·분쟁": "通知与争议", "자리 알림 대기 등록": "登记空位提醒", "현재 주문 분쟁 신고": "举报当前订单争议", "닫기": "关闭", "합계": "合计", "결제 진행": "去支付", "멤버 지망 선택": "选择成员志愿", "선택": "选择", "지망 선택 후 담기": "选择志愿后加入", "SELLER 권한 필요": "需要卖家权限", "언어가 변경되었습니다.": "语言已切换。" }
};
const sourceText = new WeakMap();
const sourceAttributes = new WeakMap();
Object.assign(translations.en, { "1지망": "1st choice", "2지망": "2nd choice", "3지망": "3rd choice", "장바구니가 비어 있습니다.": "Your cart is empty.", "누적 참여 수": "Total participants", "진행 중 공동구매": "Active group buys", "이번 달 정산 예상액 (수수료 10% 제외)": "Estimated payout this month (after 10% fee)", "상품": "Product", "참여 현황": "Participation", "목표 달성률": "Goal progress", "상태": "Status", "목표 달성": "Goal reached", "모집 중": "Recruiting" });
Object.assign(translations.ar, { "1지망": "الخيار الأول", "2지망": "الخيار الثاني", "3지망": "الخيار الثالث", "장바구니가 비어 있습니다.": "السلة فارغة.", "누적 참여 수": "إجمالي المشاركين", "진행 중 공동구매": "عمليات الشراء النشطة", "상품": "المنتج", "참여 현황": "المشاركة", "상태": "الحالة", "목표 달성": "تم تحقيق الهدف", "모집 중": "جارٍ التجميع" });
Object.assign(translations.ja, { "1지망": "第1希望", "2지망": "第2希望", "3지망": "第3希望", "장바구니가 비어 있습니다.": "カートは空です。", "누적 참여 수": "累計参加者数", "진행 중 공동구매": "受付中の共同購入", "상품": "商品", "참여 현황": "参加状況", "상태": "ステータス", "목표 달성": "目標達成", "모집 중": "募集中" });
Object.assign(translations.zh, { "1지망": "第1志愿", "2지망": "第2志愿", "3지망": "第3志愿", "장바구니가 비어 있습니다.": "购物车为空。", "누적 참여 수": "累计参与人数", "진행 중 공동구매": "进行中的团购", "상품": "商品", "참여 현황": "参与情况", "상태": "状态", "목표 달성": "已达成目标", "모집 중": "招募中" });
function t(value) { return translations[state.language]?.[value] || value; }
function deadlineText(days) { if (state.language === "en") return days === 1 ? "Ends today" : `${days} days left`; if (state.language === "ar") return days === 1 ? "ينتهي اليوم" : `متبقٍ ${days} أيام`; if (state.language === "ja") return days === 1 ? "本日締切" : `あと${days}日`; if (state.language === "zh") return days === 1 ? "今日截止" : `剩余${days}天`; return days === 1 ? "오늘 마감" : `${days}일 남음`; }
function progressText(participants, minimum) { if (state.language === "en") return `${participants} joined · goal ${minimum}`; if (state.language === "ar") return `${participants} مشارك · الهدف ${minimum}`; if (state.language === "ja") return `${participants}人参加 · 目標${minimum}人`; if (state.language === "zh") return `已参加${participants}人 · 目标${minimum}人`; return `${participants}명 참여 · 목표 ${minimum}명`; }
function translateNode(node, language) { if (node.nodeType === Node.TEXT_NODE) { const original = sourceText.get(node) || node.nodeValue; if (node.nodeValue.trim()) { sourceText.set(node, original); const leading = original.match(/^\s*/)[0]; const trailing = original.match(/\s*$/)[0]; const value = original.trim(); node.nodeValue = `${leading}${translations[language]?.[value] || value}${trailing}`; } } else { if (node.nodeType === Node.ELEMENT_NODE) ["placeholder", "aria-label"].forEach((attribute) => { const value = node.getAttribute(attribute); if (!value) return; const attributes = sourceAttributes.get(node) || {}; const original = attributes[attribute] || value; attributes[attribute] = original; sourceAttributes.set(node, attributes); node.setAttribute(attribute, translations[language]?.[original] || original); }); [...node.childNodes].forEach((child) => translateNode(child, language)); } }
function translateDocument(language) { translateNode(document.body, language); translateNode(byId("product-template").content, language); }
function setDocumentLanguage(language) { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; translateDocument(language); }
function initializeCategories() { [...new Set(products.map((p) => p.category))].forEach((category) => byId("category").append(new Option(category, category))); byId("role-select").value = state.role; byId("language-select").value = state.language; setDocumentLanguage(state.language); }
document.addEventListener("click", (event) => { const button = event.target.closest(".join-button"); if (button) { const card = button.closest(".product-card"); const picks = [...card.querySelectorAll(".member-select")].map((select) => select.value); const id = button.dataset.productId; const product = products.find(p => p.id === id);
      // members가 있는 경우만 picks 검증
      if (product.members && product.members.length > 0) {
        if (picks.some((pick) => !pick)) { toast("1~3지망 멤버를 모두 선택해 주세요."); return; }
        if (new Set(picks).size !== picks.length) { toast("각 지망은 서로 다른 멤버로 선택해 주세요."); return; }
      }
      if (!state.cart.some((entry) => (typeof entry === "string" ? entry : entry.productId) === id)) { const hold = Date.now() + 5 * 60 * 1000; state.cart.push(product.members ? { productId: id, picks, heldUntil: hold } : { productId: id, picks: [], heldUntil: hold }); addToCartViaAPI(id, product.members ? picks : []); saveActivity({ type: "participation", title: product.title, message: "5분 선점 · 신청 정보와 입금 대기" }); renderCart(); renderActivities(); toast(`5분 동안 자리를 선점했습니다.`); } else toast("이미 장바구니에 있습니다."); } if (event.target.closest("[data-close-dialog]")) byId("cart-dialog").close(); });
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
byId("search-form").addEventListener("submit", (event) => { event.preventDefault(); renderProducts(); });
byId("cart-button").addEventListener("click", () => { renderCart(); byId("cart-dialog").showModal(); });
async function checkout() {
  const productIds = state.cart.map((entry) => typeof entry === "string" ? entry : entry.productId); if (!productIds.length) return toast("장바구니가 비어 있습니다.");
  try { const response = await fetch(`${API_BASE_URL}/api/v1/checkout`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ product_ids: productIds }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "결제에 실패했습니다."); await saveActivity({ type: "settlement", title: "결제 완료", message: `${productIds.length}건 · 가상계좌 입금 확인` }); state.cart = []; renderCart(); renderActivities(); toast("신청이 완료되었습니다. 플랫폼 계좌에 보관됩니다."); } catch (error) { await saveActivity({ type: "settlement", title: "결제 대기", message: `${productIds.length}건 · 전용 가상계좌 발급 대기` }); renderActivities(); toast(`결제 상태를 기록했습니다: ${error.message}`); }
}
byId("checkout-button").addEventListener("click", checkout);
byId("role-select").addEventListener("change", (event) => { state.role = event.target.value; renderSeller(); renderActivities(); toast(`${state.role} 역할로 전환했습니다.`); });
byId("language-select").addEventListener("change", (event) => { state.language = event.target.value; setDocumentLanguage(state.language); renderProducts(); renderRecommendations(); renderCart(); renderSeller(); translateDocument(state.language); toast(languageMessages[state.language] || languageMessages.ko); });
initializeCategories(); renderProducts(); renderRecommendations(); renderCart(); renderSeller();
translateDocument(state.language);

function identityHeaders() {
  return { "X-Demo-Role": state.role, "X-Demo-User": state.userId };
}
async function saveActivity(value) {
  try { await fetch(`${API_BASE_URL}/api/v1/activity`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(value) }); } catch (error) { console.warn("Supabase 활동 기록 실패:", error); }
}
async function renderActivities() {
  try { const response = await fetch(`${API_BASE_URL}/api/v1/activity`, { headers: identityHeaders() }); const result = await response.json(); const render = (id, values, empty) => byId(id).replaceChildren(...(values.length ? values.map((item) => Object.assign(document.createElement("p"), { className: "activity-item", textContent: `${item.title || item.message} · ${new Date(item.created_at).toLocaleString("ko-KR")}` })) : [Object.assign(document.createElement("p"), { className: "muted", textContent: empty })])); render("participation-list", result.items.filter((item) => item.type === "participation"), "참여한 공구가 없습니다."); render("settlement-list", result.items.filter((item) => item.type === "settlement"), "정산·환불 내역이 없습니다."); render("notification-list", result.items.filter((item) => item.type === "notification" || item.type === "dispute"), "새 알림이 없습니다."); byId("identity-status").textContent = result.account ? `계좌 등록됨 · ${state.role}` : `계정 세션 · ${state.role}`; } catch (error) { console.warn("Supabase 활동 조회 실패:", error); }
}
function setWorkflowStatus(message, danger = false) { const status = byId("workflow-status"); status.textContent = message; status.className = `status${danger ? " denied" : ""}`; toast(message); }
function parseSlots(value) { return value.split(",").map((entry) => { const [member_name, price] = entry.split(":").map((part) => part.trim()); return { member_name, price: Number(price) }; }).filter((slot) => slot.member_name && Number.isFinite(slot.price)); }
async function submitAuth(event) {
  event.preventDefault(); const form = event.currentTarget; const action = event.submitter?.dataset.action; const data = Object.fromEntries(new FormData(form));
  if (action === "save-account") { return; }
  if (!data.email || !data.password) return;
  try { const response = await fetch(`${API_BASE_URL}/api/v1/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "인증에 실패했습니다."); state.userId = result.user.id; state.role = result.user.role; setWorkflowStatus(action === "register" ? "회원가입이 완료되었습니다." : "로그인했습니다."); renderSeller(); renderActivities(); loadCart(); } catch (error) { setWorkflowStatus(`인증 실패: ${error.message}`, true); }
}
async function openProject(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const slots = parseSlots(data.slots); if (!slots.length) return setWorkflowStatus("자리를 member:가격 형식으로 입력해 주세요.", true);
  const project = { group_name: data.group_name, goods_type: data.goods_type, source_url: data.source_url || null, slots, title: `${data.group_name} ${data.goods_type} 공동구매`, shipping_policy: { fixed_fee: 3000, deadline: data.deadline, quantity: Number(data.quantity) } };
  try { const response = await fetch(`${API_BASE_URL}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify(project) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "공구 개설에 실패했습니다."); await saveActivity({ type: "participation", title: `공구 개설: ${project.title}`, message: "보증금 입금 대기" }); setWorkflowStatus("보증금 안내를 생성하고 공구를 등록했습니다."); renderActivities(); } catch (error) { setWorkflowStatus(`공구를 저장하지 못했습니다: ${error.message}`, true); }
}
async function processDocument(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const file = form.elements.image.files[0]; const resultNode = byId("document-result"); resultNode.textContent = "AI가 문서를 분석하는 중...";
  try { if (!file && !data.text.trim()) throw new Error("이미지 또는 텍스트를 입력해 주세요."); let result; if (file) { if (file.size > 3 * 1024 * 1024) throw new Error("이미지는 3MB 이하만 업로드할 수 있습니다."); const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); const response = await fetch(`${API_BASE_URL}/api/v1/documents/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: data.kind, image }) }); result = await response.json(); if (!response.ok) throw new Error(result.error || "문서 분석 실패"); form.elements.text.value = result.extracted_text; } else { const response = await fetch(`${API_BASE_URL}/api/v1/twitter/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://x.com/document-upload", text: data.text }) }); result = await response.json(); if (!response.ok) throw new Error(result.error || "문서 분석 실패"); } resultNode.textContent = JSON.stringify({ kind: data.kind, ...result.parsed_fields, confidence: "검토 필요" }, null, 2); await saveActivity({ type: "notification", message: `${data.kind === "receipt" ? "영수증" : "송장"} 구조화 완료 · 민감정보 마스킹 검토 필요` }); renderActivities(); setWorkflowStatus("문서 구조화가 완료되었습니다."); } catch (error) { resultNode.textContent = JSON.stringify({ kind: data.kind, status: "확인 큐", error: error.message }, null, 2); setWorkflowStatus("AI 결과를 확인 큐에 등록했습니다."); }
}
document.querySelector("#auth-form")?.addEventListener("submit", submitAuth);
document.querySelector("#open-project-form")?.addEventListener("submit", openProject);
document.querySelector("#document-form")?.addEventListener("submit", processDocument);
document.querySelector("[data-action='save-account']")?.addEventListener("click", async () => { const form = byId("auth-form"); const account = form.elements.account.value.trim(); if (!account) return; const response = await fetch(`${API_BASE_URL}/api/v1/account`, { method: "POST", headers: { "Content-Type": "application/json", ...identityHeaders() }, body: JSON.stringify({ account }) }); if (!response.ok) return setWorkflowStatus("계좌 저장에 실패했습니다.", true); setWorkflowStatus("환급·정산 계좌를 저장했습니다."); renderActivities(); });
document.querySelector("[data-action='notify']")?.addEventListener("click", async () => { await saveActivity({ type: "notification", message: "빈자리 알림 대기 등록 · 자리가 열리면 알림" }); setWorkflowStatus("자리 알림을 등록했습니다."); renderActivities(); });
document.querySelector("[data-action='dispute']")?.addEventListener("click", async () => { await saveActivity({ type: "dispute", message: "분쟁 신고 접수 · 정산 보류 상태" }); setWorkflowStatus("분쟁 신고를 접수하고 정산을 보류했습니다."); renderActivities(); });
async function loadCart() { try { const response = await fetch(`${API_BASE_URL}/api/v1/cart`, { headers: identityHeaders() }); const result = await response.json(); if (response.ok) { state.cart = (result.items || []).map((item) => ({ productId: item.product.id, picks: item.picks || [] })); renderCart(); } } catch (error) { console.warn("Supabase 장바구니 조회 실패:", error); } }
loadCart();
renderActivities();
