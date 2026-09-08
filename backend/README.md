# 공동구매 Backend API (Node.js)

Supabase PostgreSQL에 데이터를 저장하는 Node.js API입니다. 실행에는 Node.js 20 이상이 필요합니다.

```powershell
cd backend
npm install
npm start
```

## Supabase 설정

1. Supabase Dashboard의 `SQL Editor`에서 `supabase-schema.sql` 전체를 실행합니다.
2. 먼저 `users`에 판매자와 고객을 넣거나 API의 회원가입을 호출합니다. 현재 데모 인증은 `X-Demo-Role`, `X-Demo-User` 헤더를 사용합니다.
3. 서버는 `SUPABASE_ANON_KEY`로 Supabase에 접근합니다. Supabase에서 필요한 테이블에 anon 역할용 RLS 정책을 추가해야 합니다.

로컬에서는 `.env.example`을 `.env`로 복사하고 실제 값을 입력합니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
UPSTAGE_API_KEY=your-upstage-api-key
UPSTAGE_MODEL=solar-pro2
PORT=3000
```

Vercel에서는 프로젝트의 `Settings > Environment Variables`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `UPSTAGE_API_KEY`, `UPSTAGE_MODEL`을 등록하고 `Production`, `Preview`, `Development` 환경을 필요한 범위로 선택한 뒤 재배포합니다. Supabase와 Upstage 키는 프런트엔드 변수(`NEXT_PUBLIC_` 또는 `VITE_`)로 만들지 않습니다.

현재 서버의 모든 고객, 판매자, 상품, 프로젝트, 슬롯, 장바구니, 주문, 결제, 구매이력, 후기, 배송, 환급계좌, 활동·알림·분쟁 데이터는 Supabase 테이블을 사용합니다. 스키마를 변경한 뒤에는 `supabase-schema.sql` 전체를 다시 실행해야 합니다. 실제 결제 성공을 자동 확정하는 단계는 아직 `STRIPE_ADAPTER` 데모이므로 운영에서는 결제사 웹훅과 DB 트랜잭션을 추가해야 합니다.

## 도메인 정의

- `Customer`: 상품 검색/추천, 멤버 지망 선택, 장바구니, 결제, 구매 이력, 후기 작성
- `Seller`: 가격, 카테고리/설명, 재고, 배송 예상 일수, 최소 참여자 수를 포함한 상품 등록과 판매/정산/후기 조회
- `Admin`: 판매자 조회 API에 한해 조회 권한만 데모로 제공하며 관리자 사이트는 보류
- `Product`: 판매자가 올린 상품. `status=ACTIVE`인 상품만 검색 엔진에 노출되며 `current_participants`로 공동구매 참여자 수를 표시
- `PurchaseLog`: 주문 상품별 고객 구매 사실과 카테고리를 저장하는 내부 추천용 기록
- `PurchaseHistory`: 고객에게 주문, 결제, 상품, 금액, 지망 정보를 보여주는 조회 모듈. 구매 기록 저장 모듈과 분리됨

## 검색과 추천

검색 엔진은 `ACTIVE` 상품을 대상으로 `keyword`를 제목/카테고리/태그에 대해 부분 일치시키고, 카테고리로 추가 필터링합니다. `popular`, `price`, `deadline` 정렬과 페이지네이션을 지원합니다.

추천은 고객의 `PurchaseLog` 카테고리에 가중치를 주고 상품 인기도와 마감 임박도를 더하는 결정적 heuristic입니다. 구매 기록이 없는 고객도 인기도 기반 추천을 받으며, 운영 환경에서는 이 계산을 별도 추천 서비스로 분리할 수 있습니다.

## 결제 엔진 설계

현재 데모는 외부 의존성 없이 `STRIPE_ADAPTER`라는 결제 제공자 어댑터를 사용하고 결제를 성공 처리합니다. 운영 구현은 Stripe PaymentIntent를 기준으로 다음 순서를 따릅니다.

1. 서버가 장바구니와 재고를 재조회하고 금액을 서버에서 계산합니다.
2. Stripe PaymentIntent를 `amount`, `currency=krw`, 고객 주문 ID와 함께 생성합니다.
3. 클라이언트는 Stripe 결제 UI로 인증하고, 서버는 클라이언트의 성공 응답을 결제 완료로 신뢰하지 않습니다.
4. Stripe 서명 웹훅 `payment_intent.succeeded`를 검증한 뒤 트랜잭션으로 주문을 `PAID` 처리하고 재고, 참여자 수, `PurchaseLog`를 기록합니다.
5. `Idempotency-Key`와 Stripe 이벤트 ID를 저장해 중복 결제/중복 웹훅으로 주문이 두 번 생성되지 않게 합니다. 실패, 취소, 환불은 별도 상태로 보존합니다.

## API

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- `POST /api/v1/twitter/parse` (트위터/X 원문 URL 정규화 및 파싱 어댑터)
- `POST /api/v1/documents/parse` (`{ image: "data:<mime>;base64,..." }`를 받아 Upstage Document Digitization으로 OCR 후 구조화)
- `GET /api/v1/search?keyword=&category=&sort_by=popular|price|deadline&page=&limit=`
- `GET /api/v1/recommendations` (CUSTOMER)
- `POST /api/v1/seller/products` (SELLER)
- `GET /api/projects?group=&member=&goods_type=&available=true`, `GET /api/projects/:id`
- `POST /api/projects` (SELLER), `POST /api/projects/:id/slots/:slotId/apply` (CUSTOMER)
- `POST /api/projects/pricing/recommend` (`total_cost`, `members_weights` 입력)
- `POST /api/payments/charge` (CUSTOMER), `POST /api/projects/:id/shipment` (SELLER), `POST /api/projects/:id/confirm` (CUSTOMER)
- `POST /api/v1/cart/items`, `GET /api/v1/cart` (CUSTOMER)
- `GET /api/v1/members/:productId` (상품별 멤버 참여 현황)
- `POST /api/v1/checkout` (CUSTOMER, 장바구니 상품만 결제 가능)
- `GET /api/v1/customer/purchase-history`, `GET /api/v1/customer/payment-history` (CUSTOMER)
- `POST /api/v1/reviews` (CUSTOMER)
- `GET /api/v1/seller/analytics/sales`, `/seller/payouts/monthly`, `/seller/reviews` (SELLER/ADMIN)

테스트용 권한은 `X-Demo-Role: CUSTOMER | SELLER | ADMIN`, 사용자 식별자는 `X-Demo-User` 헤더로 전달합니다. 이는 데모용이며 운영 환경에서는 JWT 서명 검증, PostgreSQL 영속화, 결제사 웹훅 검증, 트랜잭션 및 서버 측 배정 알고리즘으로 교체해야 합니다.
