// Supabase 프로젝트 공개 설정. anon key는 공개용 키이므로 프런트에 두어도 안전합니다.
window.__SUPABASE_URL__ = "https://elposnnmqretgeupvltd.supabase.co";
window.__SUPABASE_ANON_KEY__ = "sb_publishable_WeInsPQlM73rv5zadURcBA_JxYar9BD";
// 로컬 미리보기 서버로 프런트를 열 때도 백엔드(backend/server.js, 3000번 포트)로 요청이 가도록 고정.
// 프런트와 백엔드가 같은 도메인에서 서비스되는 배포 환경(예: Vercel)에서는 아래 줄을 빈 문자열("")로 바꾸세요.
window.__API_BASE_URL__ = "http://localhost:3001";
