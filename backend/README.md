# 공동구매 Backend API (Node.js)

Supabase PostgreSQL에 데이터를 저장하는 Node.js API입니다. 실행에는 Node.js 20 이상이 필요합니다.

```powershell
cd backend
npm install
npm start
```

## Supabase 설정

1. Supabase Dashboard의 `SQL Editor`에서 `supabase-schema.sql` 전체를 실행합니다.
2. 먼저 `users`에 판매자와 고객을 넣거나 API의 회원가입을 호출합니다. 로그인 또는 회원가입 응답의 JWT를 이후 요청의 `Authorization: Bearer <token>` 헤더로 전달합니다.
3. 서버는 공개하면 안 되는 `SUPABASE_SERVICE_ROLE_KEY`로 Supabase에 접근합니다. 이 키는 백엔드 환경 변수에만 저장합니다.

로컬에서는 `.env.example`을 `.env`로 복사하고 실제 값을 입력합니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UPSTAGE_API_KEY=your-upstage-api-key
UPSTAGE_MODEL=solar-pro2
PORT=3000
AUTH_JWT_SECRET=replace-with-at-least-32-random-characters
PAYMENT_WEBHOOK_SECRET=replace-with-a-different-32-character-secret
ACCOUNT_ENCRYPTION_KEY=replace-with-base64-encoded-32-byte-key
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Poka-Catch <no-reply@your-verified-domain.example>
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

구글·카카오 로그인은 Supabase Auth Dashboard(`Authentication > Providers`)에 Client ID/Secret을 등록하면 프런트의 `supabase.auth.signInWithOAuth()`가 처리합니다(백엔드 설정 불필요). Supabase가 지원하지 않는 네이버만 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`으로 백엔드가 직접 OAuth를 처리하며, 네이버 개발자센터 Redirect URI는 `{BACKEND_URL}/api/v1/auth/oauth/naver/callback`으로 등록해야 합니다. `.env`는 `.gitignore`에 등록되어 있어 GitHub에 올라가지 않습니다.

프런트엔드는 `frontend/supabase-config.js`에서 `SUPABASE_URL`과 공개용 `anon key`를 읽어 Supabase 클라이언트를 만듭니다. Supabase Dashboard의 `Authentication > URL Configuration`에 프런트 접속 주소(Site URL, Redirect URLs)를 등록해야 로그인 후 정상적으로 되돌아옵니다.

Vercel에서는 프로젝트의 `Settings > Environment Variables`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `ACCOUNT_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `UPSTAGE_API_KEY`, `UPSTAGE_MODEL`을 등록하고 `Production`, `Preview`, `Development` 환경을 필요한 범위로 선택한 뒤 재배포합니다. 서비스 역할 키와 비밀키는 프런트엔드 변수(`NEXT_PUBLIC_` 또는 `VITE_`)로 만들지 않습니다. 계좌 암호화 키는 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`로 생성할 수 있습니다.

현재 서버의 모든 고객, 판매자, 상품, 프로젝트, 슬롯, 장바구니, 주문, 결제, 구매이력, 후기, 배송, 환급계좌, 활동·알림·분쟁 데이터는 Supabase 테이블을 사용합니다. 스키마를 변경한 뒤에는 `supabase-schema.sql` 전체를 다시 실행해야 합니다. 실제 결제 성공을 자동 확정하는 단계는 아직 `STRIPE_ADAPTER` 데모이므로 운영에서는 결제사 웹훅과 DB 트랜잭션을 추가해야 합니다.

## 도메인 정의

- `Customer`: 상품 검색/추천, 멤버 지망 선택, 장바구니, 결제, 구매 이력, 후기 작성
- `Seller`: 가격, 카테고리/설명, 재고, 배송 예상 일수, 최소 참여자 수를 포함한 상품 등록과 판매/정산/후기 조회
- `Admin`: JWT와 DB 역할을 모두 검증한 뒤 신고, 결제, 보증금 제재 기능에 접근
- `Product`: 판매자가 올린 상품. `status=ACTIVE`인 상품만 검색 엔진에 노출되며 `current_participants`로 공동구매 참여자 수를 표시
- `PurchaseLog`: 주문 상품별 고객 구매 사실과 카테고리를 저장하는 내부 추천용 기록
- `PurchaseHistory`: 고객에게 주문, 결제, 상품, 금액, 지망 정보를 보여주는 조회 모듈. 구매 기록 저장 모듈과 분리됨

## 검색과 추천

검색 엔진은 `ACTIVE` 상품을 대상으로 `keyword`를 제목/카테고리/태그에 대해 부분 일치시키고, 카테고리로 추가 필터링합니다. `popular`, `price`, `deadline` 정렬과 페이지네이션을 지원합니다.

추천은 고객의 `PurchaseLog` 카테고리에 가중치를 주고 상품 인기도와 마감 임박도를 더하는 결정적 heuristic입니다. 구매 기록이 없는 고객도 인기도 기반 추천을 받으며, 운영 환경에서는 이 계산을 별도 추천 서비스로 분리할 수 있습니다.

## 결제 엔진 설계

현재 데모는 서명된 `MOCK_VIRTUAL_ACCOUNT` Webhook으로 입금을 확정합니다. 운영 구현은 실제 결제 제공자의 가상계좌 API와 공식 Webhook SDK를 기준으로 다음 순서를 따릅니다.

1. 서버가 장바구니와 재고를 재조회하고 금액을 서버에서 계산합니다.
2. Stripe PaymentIntent를 `amount`, `currency=krw`, 고객 주문 ID와 함께 생성합니다.
3. 클라이언트는 Stripe 결제 UI로 인증하고, 서버는 클라이언트의 성공 응답을 결제 완료로 신뢰하지 않습니다.
4. Stripe 서명 웹훅 `payment_intent.succeeded`를 검증한 뒤 트랜잭션으로 주문을 `PAID` 처리하고 재고, 참여자 수, `PurchaseLog`를 기록합니다.
5. `Idempotency-Key`와 Stripe 이벤트 ID를 저장해 중복 결제/중복 웹훅으로 주문이 두 번 생성되지 않게 합니다. 실패, 취소, 환불은 별도 상태로 보존합니다.

## API

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- `POST /api/v1/auth/password-reset/request`, `POST /api/v1/auth/password-reset/confirm`
- `GET /api/v1/auth/check-username?username=` (아이디 중복 확인)
- `GET /api/v1/auth/oauth/naver` (네이버 소셜 로그인 시작), `GET /api/v1/auth/oauth/naver/callback` (네이버 콜백)
- `POST /api/v1/auth/oauth/supabase-sync` (`{ access_token }`, Supabase Auth로 로그인한 구글/카카오 세션을 앱 계정과 동기화)
- `POST /api/v1/webhooks/payments/mock` (PG 가상계좌 입금 Webhook, HMAC 서명 필수)
- `POST /api/v1/twitter/parse` (트위터/X 원문 URL 정규화 및 파싱 어댑터)
- `POST /api/v1/documents/parse` (`{ image: "data:<mime>;base64,..." }`를 받아 Upstage Document Digitization으로 OCR 후 구조화)
- `POST /api/v1/seller/receipt-verifications/:id/explanation` (총대, 48시간 내 영수증 소명 제출)
- `GET /api/v1/admin/receipt-verifications`, `PATCH /api/v1/admin/receipt-verifications/:id` (ADMIN, 소명 승인·반려)
- `GET /api/v1/search?keyword=&category=&sort_by=popular|price|deadline&page=&limit=`
- `GET /api/v1/recommendations` (CUSTOMER)
- `POST /api/v1/seller/products` (SELLER)
- `GET /api/v1/seller/orders` (SELLER, 배송지 마스킹 목록)
- `POST /api/v1/seller/projects/:id/start-packing` (SELLER, 전원 입금 검증 후 `PACKING` 전환)
- `POST /api/v1/seller/projects/:id/allocate` (SELLER, 개봉 수량 기반 1·2·3지망 자동 배정)
- `GET /api/v1/seller/projects/:id/packing-list` (SELLER, `PACKING` 단계 전용 배송지 취합표)
- `GET /api/projects?group=&member=&goods_type=&available=true`, `GET /api/projects/:id`
- `POST /api/projects` (SELLER)
- `POST /api/projects/:id/participate` (CUSTOMER, `Idempotency-Key` 필수, 슬롯·주문·결제 원자 생성)
- `POST /api/projects/:id/deposit` (총대, 모집액 10% 보증금 납부 후 공구 공개)
- `POST /api/projects/pricing/recommend` (`total_cost`, `members_weights` 입력)
- `POST /api/projects/:id/shipment` (SELLER)
- `POST /api/v1/cart/items`, `GET /api/v1/cart` (CUSTOMER)
- `GET /api/v1/account`, `POST /api/v1/account` (암호화 계좌 저장 및 마스킹 표시)
- `GET /api/v1/members/:productId` (상품별 멤버 참여 현황)
- `POST /api/v1/checkout` (CUSTOMER, 장바구니 상품만 결제 가능)
- `GET /api/v1/customer/purchase-history`, `GET /api/v1/customer/payment-history` (CUSTOMER)
- `POST /api/v1/customer/orders/:id/confirm-receipt` (CUSTOMER, 수령 확인 및 전원 확인 시 정산 트리거)
- `POST /api/v1/reports` (CUSTOMER/SELLER, `subject_type`과 `subject_id` 기준 정산 보류)
- `PATCH /api/v1/admin/reports/:id` (ADMIN, 활성 분쟁 종료 후 정산 보류 재계산)
- `GET /api/v1/customer/compensations` (CUSTOMER, 보증금 몰수 위약 보상금 조회)
- `GET /api/v1/customer/allocations` (CUSTOMER, 본인 배정 또는 자동 환불 결과 조회)
- `GET /api/v1/admin/deposits?status=HELD` (ADMIN, 보관 중 보증금 조회)
- `POST /api/v1/admin/projects/:id/forfeit-deposit` (ADMIN, `{ reason }` 필수)
- `POST /api/v1/reviews` (CUSTOMER)
- `GET /api/v1/seller/analytics/sales`, `/seller/payouts/monthly`, `/seller/reviews` (SELLER/ADMIN)

로그인·회원가입·소셜 로그인 동기화 응답의 앱 JWT를 `Authorization: Bearer <token>` 헤더로 전달합니다. 관리자 API는 JWT 검증 후 DB의 현재 `ADMIN` 역할과 탈퇴 상태를 다시 확인합니다. 운영 환경에서는 `AUTH_JWT_SECRET`을 32자 이상의 무작위 값으로 설정하고 주기적으로 교체해야 합니다.

`supabase-schema.sql`은 `pg_cron`의 `release-expired-project-slots` 작업을 1분 주기로 등록합니다. 공구 참여 결제 기한은 선점 시각부터 5분이며, 만료 작업은 결제를 `EXPIRED`, 주문을 `EXPIRED`로 전환한 뒤 슬롯을 다시 엽니다. 같은 `Idempotency-Key`로 참여 요청을 재전송하면 새 주문을 만들지 않고 최초 결과를 반환합니다.

`release-matured-escrow` 작업은 15분마다 실행됩니다. 발송 후 7일이 지난 미확인 주문을 `AUTO_RECEIVED`로 전환하고, 활성 분쟁이 없는 공구만 참여자 결제 `RELEASED`, 주문·공구 `SETTLED`, 보증금 `REFUNDED`로 원자 전환합니다. 정산금과 보증금 반환액은 `project_settlements`에 `READY` 상태로 기록되며 실제 은행 이체 어댑터가 처리할 수 있습니다.

원자 참여·만료·정산 RPC는 공개 `anon`/`authenticated` 역할의 직접 실행을 차단하고 백엔드 `service_role`에만 허용합니다. 따라서 운영 및 로컬 백엔드는 `SUPABASE_SERVICE_ROLE_KEY`를 사용해야 합니다.

모의 PG Webhook은 `X-Payment-Timestamp`와 `X-Payment-Signature` 헤더를 사용합니다. 서명값은 `HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<timestamp>.<raw-json-body>")`의 16진수 문자열입니다. 이벤트 본문은 `{ "id", "type": "virtual_account.paid", "data": { "payment_id", "provider_payment_id", "amount", "paid_at" } }` 형식입니다. 운영 PG 도입 시 해당 PG의 공식 SDK로 서명을 검증하되 `process_payment_webhook` 원자 처리 함수는 그대로 사용할 수 있습니다.

환급·정산 계좌는 AES-256-GCM으로 암호화되며 API에는 은행명과 마지막 4자리만 반환됩니다. 기존 평문 계좌는 사용자가 계정 활동 또는 계좌 조회 API를 호출할 때 같은 암호문 형식으로 이전됩니다. 배송지는 일반 총대 주문 목록에서 항상 마스킹되고, 모든 활성 주문의 입금이 완료되어 공구가 `PACKING`으로 전환된 동안에만 전용 취합표에서 원문이 제공됩니다.

영수증 OCR은 판매처, 주문일시, 수량, 주문번호를 구조화한 뒤 `receipt_verifications`에 문서 해시와 검증 결과를 저장합니다. 주문번호는 정규화 후 advisory lock으로 동시 중복 등록을 막고, 하나라도 실패하면 공구 정산을 보류한 채 `EXPLANATION_REQUIRED`와 48시간 마감 시각을 설정합니다. `expire-receipt-explanations` Cron은 15분마다 무응답 건을 `EXPLANATION_EXPIRED`로 전환합니다. 승인 시 다른 검증 실패나 분쟁이 없을 때만 정산 보류가 해제되며, 반려·기한초과 건은 관리자 보증금 몰수 절차로 이어질 수 있습니다.

개봉 배정은 검증 통과 영수증이 있는 `PACKING` 공구에서만 한 번 실행됩니다. 결제 완료 주문을 참여 시각과 주문 ID 순서로 정렬한 뒤 각 주문의 1·2·3지망 중 남은 재고가 있는 첫 멤버를 배정합니다. 결과는 `allocation_logs`에 기록되며 DB 트리거가 UPDATE와 DELETE를 차단합니다. 세 지망 모두 품절인 주문은 결제와 주문을 `REFUNDED`로 전환하고 `refunds` 원장과 사용자 활동에 전액 자동 환불을 기록합니다. 현재 환불 제공자는 `MOCK_REFUND`이므로 운영에서는 실제 PG 환불 API 호출 결과로 `refunds.status`를 관리해야 합니다.

비밀번호 재설정은 32바이트 임의 토큰의 SHA-256 해시만 `password_reset_tokens`에 저장합니다. 링크는 30분 동안 한 번만 사용할 수 있고, 계정별 1분 1회·시간당 5회로 발급이 제한됩니다. 요청 API는 계정 존재 여부와 메일 발송 성공 여부에 관계없이 같은 응답을 반환합니다. 메일 발송에는 Resend의 검증된 발신 도메인과 `RESEND_API_KEY`, `EMAIL_FROM` 설정이 필요합니다.
