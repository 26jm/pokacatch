# Poka-Catch (포카캐치)

K-POP 굿즈 공동구매와 포토카드 분철을 위한 안전 거래 플랫폼입니다. 슬롯 선점부터 가상계좌 입금, 영수증 검증, 지망 배정, 배송, 수령 및 정산까지의 흐름을 하나의 서비스에서 관리합니다.

## 기술 스택

- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Node.js 20, Vercel Serverless Functions
- Database: Supabase PostgreSQL, RLS, `pg_cron`
- Authentication: 자체 서명 JWT, Supabase OAuth, Naver OAuth
- Document AI: Upstage Document Parse 및 Solar
- Email: Resend

## 현재 구현

### 인증 및 계정 보안

- 아이디/이메일 로그인과 회원가입, 소셜 로그인
- 12시간 서명 JWT와 DB 역할 기반 관리자 게이트
- 이메일 비밀번호 재설정: 해시 토큰 저장, 30분 만료, 일회성 사용, 발급 제한
- 환급 계좌 AES-256-GCM 암호화 및 마지막 4자리 마스킹
- 회원 탈퇴 후 30일 내 복구

### 신청 및 결제

- 서버 계산 기반 자리 금액과 배송비 검증
- 슬롯·주문·주문항목·결제의 단일 PostgreSQL 트랜잭션 생성
- `Idempotency-Key` 기반 중복 주문 방지
- 5분 미입금 시 결제·주문 만료 및 슬롯 자동 해제
- HMAC 서명 가상계좌 Webhook과 이벤트 멱등성
- 만료 후 입금 거부

### 공구 안전 거래

- 모집 예정 금액 10% 보증금, 납부 전 `DEPOSIT_PENDING`
- 보증금 몰수 및 참여자 위약 보상금 균등 배분
- 배송지 기본 마스킹, 전원 입금 후 `PACKING` 단계 전용 취합표
- 분쟁 접수 시 자동 정산 보류
- 발송 D+7 자동 수령 확정 및 에스크로 정산
- 정산금·수수료·보증금 반환 원장

### 문서 AI와 배정

- Upstage 영수증 및 송장 OCR 구조화
- 주문번호 유일성, 판매처, 주문일시, 수량의 영수증 4대 검증
- 검증 실패 시 48시간 소명 요청, 관리자 승인·반려, 만료 Cron
- 송장 행 단위 추출 및 참여자 자동 매칭
- 개봉 수량 기반 1·2·3지망 자동 배정
- UPDATE/DELETE가 차단된 불변 배정 로그
- 미배정 주문 전액 자동 환불 원장

### 후기와 총대 신뢰도

- 본인 주문, 수령 완료, 결제 검증, 실제 배정 성공을 모두 확인한 구매자만 후기 작성 가능
- 주문당 검증 후기 1회 제한
- 총대별 검증 후기 평균에 기준 3.5점·가중치 5건의 베이지안 보정 적용
- 신뢰도를 0~100점으로 환산하여 공구 상세에 노출

## 로컬 실행

```powershell
cd backend
npm install
npm start
```

프런트엔드는 `frontend/index.html`을 정적 서버로 열 수 있습니다. 로컬 API 주소는 `frontend/supabase-config.js`의 `window.__API_BASE_URL__`에서 설정합니다.

## 환경 변수

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AUTH_JWT_SECRET=at-least-32-random-characters
PAYMENT_WEBHOOK_SECRET=a-different-32-character-secret
ACCOUNT_ENCRYPTION_KEY=base64-encoded-32-byte-key
UPSTAGE_API_KEY=your-upstage-api-key
UPSTAGE_MODEL=solar-pro2
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Poka-Catch <no-reply@your-verified-domain.example>
BACKEND_URL=https://your-api.example
FRONTEND_URL=https://your-app.example
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
OAUTH_STATE_SECRET=
```

`ACCOUNT_ENCRYPTION_KEY` 생성:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

서비스 역할 키, JWT 키, Webhook 키, 계좌 암호화 키, Upstage 및 Resend 키는 프런트엔드에 노출하면 안 됩니다.

## Supabase 적용

DB 변경 후 Supabase SQL Editor에서 `backend/supabase-schema.sql` 전체를 실행합니다. 스키마는 재실행 가능한 형태이며 다음 Cron 작업을 등록합니다.

- `release-expired-project-slots`: 1분마다 미입금 슬롯 정리
- `release-matured-escrow`: 15분마다 D+7 자동 수령 및 정산
- `expire-receipt-explanations`: 15분마다 48시간 소명 만료 처리

## 2026-09-15 완료 내역

- JWT 인증 및 관리자 접근 제어
- 원자적 참여·결제 생성과 5분 슬롯 만료
- 가상계좌 Webhook 서명·멱등성
- D+7 자동 수령·정산·보증금 반환
- 계좌 암호화와 배송지 단계별 마스킹
- 영수증 4대 검증과 48시간 소명
- 지망 자동 배정, 불변 로그, 미배정 자동 환불
- 이메일 비밀번호 재설정
- 후기 작성 자격 검증 및 총대 신뢰도 점수

## 다음 작업

### P0 운영 결제 전환

- 실제 PG 가상계좌 발급 API 및 공식 Webhook SDK 연결
- `MOCK_REFUND`를 실제 PG 환불 API로 교체
- `project_settlements.status=READY`를 실제 송금 어댑터와 연결
- Webhook·환불·송금 장애 재시도와 운영 알림

### P1 개인정보 및 문서 보안

- 배송지 암호화 저장과 키 회전 절차
- Upstage 좌표 기반 영수증·송장 개인정보 마스킹
- 증빙 원본 비공개 저장소와 서명 URL
- 관리자 감사 로그와 민감정보 접근 이력

### P1 제품 완성도

- React/Next.js 이관 및 프런트 상태 관리 정리
- X OAuth 및 소셜 계정 연결 관리
- 실제 후기 목록·신뢰도 상세 화면
- 자동 배정 알고리즘 시뮬레이션과 운영자 재현 도구
- 상호 교환 시스템 데이터 모델 및 화면 기획

## 검증 현황

- `node --check backend/server.js`
- `node --check frontend/app.js`
- VS Code HTML/JavaScript/SQL 진단
- `git diff --check`
- 인증, Webhook, 분쟁, 계좌, OCR, 배정, 비밀번호 재설정, 후기 API의 HTTP 경계 테스트

로컬 환경에 PostgreSQL, Supabase CLI 및 Docker가 없어 DB 함수의 통합 실행 테스트는 Supabase SQL Editor 적용으로 대체했습니다. 실제 PG, 이메일, Upstage 외부 연동은 각 운영 키가 설정된 배포 환경에서 별도 확인해야 합니다.
