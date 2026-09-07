

# 🍇 Poka-Catch (포카캐치)

> **K-POP 굿즈 및 포토카드 분철/공동구매 자동화 & 에스크로 기반 안전 거래 플랫폼**

포카캐치는 K-POP 팬덤의 비공식 공동구매 및 포토카드 분철 과정에서 발생하는 먹튀, 관리 복잡성, 수동 인증의 번거로움을 해결하기 위해 개발된 커머스 플랫폼입니다. Upstage Document AI 기반의 OCR 파이프라인과 안전 거래 시스템을 제공합니다.

---

## 📌 주요 기능 (Key Features)

### 1. 🔍 스마트 검색 및 한/영 동의어 자동 확장

* 한글/영문 검색어를 자동으로 매핑하여 통합 검색을 수행합니다 (예: `에스파` $\leftrightarrow$ `aespa`, `카리나` $\leftrightarrow$ `karina`).



### 2. 📷 Upstage Document AI 기반 자동 파싱 (OCR)

* 트위터/X 공고 이미지 및 영수증 캡처를 Upstage Document Parse API로 분석하여 그룹명, 굿즈 종류, 트위터 핸들 등의 정보를 폼에 자동으로 추출해 적용합니다.



### 3. 🔒 5분 선점 락 (Hold Lock) & 안전 결제

* 동시 신청으로 인한 중복 구매를 방지하기 위해 5분간 슬롯 선점 락을 제공합니다.


* 체험용 모의 결제 시스템을 구축하여 실제 카드 청구 없이 안전 거래 흐름을 테스트할 수 있습니다 (0원 자동 변환).



### 4. 🎨 Market Kurly 스타일의 모바일 최적화 UI

* 연보라 Point Color (`#A383E6`)와 Pretendard 폰트를 활용한 깔끔하고 단정한 커머스 인터페이스를 제공합니다.

---

## 🛠 기술 스택 (Tech Stack)

* **Frontend:** HTML5, CSS3, JavaScript (ES6+), Pretendard Variable Font
* **Backend:** Node.js (Vercel Serverless Functions)


* **Database & Auth:** Supabase (PostgreSQL, Row Level Security)


* **AI & Document Parse:** Upstage Document AI API


* **Deployment:** Vercel

---

## 🏗 시스템 아키텍처 및 파이프라인

```text
[사용자/구매자] ───> [5분 선점 락 & 모의 결제] ───> [에스크로 대금 보관]
                                                         │
[총대/판매자] ───> [Upstage AI OCR 영수증/송장 인증] ───> [배송 & D+7 자동 정산]

```

---

## 🚀 시작하기 (Quick Start)

### 1. 환경 변수 설정

`.env` 파일을 생성하고 아래 항목을 설정합니다.

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
UPSTAGE_API_KEY=your_upstage_api_key

```

### 2. 백엔드 실행 및 로컬 테스트

```bash
# 패키지 설치
npm install

# 로컬 개발 서버 실행
npm start

```

---

## 🗺 개발 로드맵 (Roadmap)

* [x] 한/영 동의어 검색어 확장 처리


* [x] Upstage Document Parse 기본 연동


* [x] 슬롯 선점 및 모의 결제 파이프라인


* [ ] 5분 미입금 타임아웃 자동 해제 스케줄러 구축


* [ ] 에스크로 D+7 자동 수령 확정 및 정산 스케줄러


* [ ] Upstage OCR 영수증/송장 4대 항목 자동 검증 파이프라인


* [ ] React 기반 프론트엔드 리팩토링 및 소셜 로그인 (카카오, 네이버) 추가
