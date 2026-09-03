# Vanilla storefront prototype

의존성 없이 실행되는 HTML/CSS/JavaScript 화면 프로토타입입니다. `index.html`을 브라우저에서 열면 검색, 정렬, 추천, 장바구니 및 역할별 판매자 대시보드를 확인할 수 있습니다. API 서버는 상위 `backend/` 폴더에 분리되어 있습니다.

장바구니, 계좌, 참여·정산 활동, 알림·분쟁 기록은 백엔드 API를 통해 Supabase에 저장됩니다. 역할과 언어는 현재 화면 세션 상태이며, 인증은 백엔드가 발급·검증해야 합니다.

- `GET /api/v1/search`
- `GET /api/v1/recommendations`
- `POST /api/v1/cart/items`, `POST /api/v1/checkout`
- `GET /api/v1/seller/analytics/sales`, `/api/v1/seller/payouts/monthly`, `/api/v1/seller/reviews`

HTML/CSS는 표현 계층이므로 JWT, RBAC, 결제, PostgreSQL 스키마, 구매 로그 보존 같은 백엔드 요구사항을 대체하지 않습니다. 이 저장소의 Medusa 백엔드를 유지하거나 Node.js API 서버로 별도 구현해야 합니다.

언어 선택에서 العربية를 고르면 문서의 `lang`이 `ar`, 방향이 `rtl`로 전환됩니다. RTL 전용 규칙은 `rtl.css`에 분리되어 있습니다.
