// [수정 1] Vercel 서버리스 환경과의 모듈 호환성을 위해 require 방식으로 통일
require("dotenv").config();
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPERBASE_ANNON_KEY, UPSTAGE_API_KEY, UPSTAGE_MODEL = "solar-pro2",
  OAUTH_STATE_SECRET = "insecure-dev-secret-change-me", FRONTEND_URL = "http://localhost:5500",
  KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI,
  NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REDIRECT_URI,
  TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_REDIRECT_URI
} = process.env;
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || SUPERBASE_ANNON_KEY;
if (!SUPABASE_URL || !supabaseKey) throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY 환경 변수가 필요합니다.");
const supabase = createClient(SUPABASE_URL, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });


function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}
function verifyPassword(password, storedHash) {
  const [algorithm, salt, expected] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

const ALIAS_MAP = {
  "에스파": ["aespa", "에스파"], aespa: ["aespa", "에스파"],
  "카리나": ["karina", "카리나"], karina: ["karina", "카리나"],
  "윈터": ["winter", "윈터"], winter: ["winter", "윈터"],
  "아이브": ["ive", "아이브"], ive: ["ive", "아이브"],
  "뉴진스": ["newjeans", "뉴진스"], newjeans: ["newjeans", "뉴진스"]
};
function expandSearchTerms(keyword) {
  if (!keyword) return [];
  const lower = keyword.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (key.toLowerCase() === lower) return aliases;
  }
  return [keyword.trim()];
}
function escapeIlike(value) { return String(value).replace(/[%_,]/g, " ").trim(); }

// 서버가 상태를 저장하지 않으므로 CSRF state값을 HMAC으로 서명해 왜을 담아 왕복시키고 검증한다.
function base64url(buffer) { return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function signState(payload) {
  const json = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(createHmac("sha256", OAUTH_STATE_SECRET).update(json).digest());
  return `${json}.${sig}`;
}
function verifyState(state) {
  const [json, sig] = String(state || "").split(".");
  if (!json || !sig) throw new Error("INVALID_STATE");
  const expected = base64url(createHmac("sha256", OAUTH_STATE_SECRET).update(json).digest());
  if (sig !== expected) throw new Error("INVALID_STATE");
  return JSON.parse(Buffer.from(json.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
}
const OAUTH_PROVIDERS = {
  kakao: {
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me",
    clientId: KAKAO_CLIENT_ID, clientSecret: KAKAO_CLIENT_SECRET, redirectUri: KAKAO_REDIRECT_URI,
    scope: "account_email profile_nickname",
    mapProfile: (data) => ({ providerId: data.id != null ? String(data.id) : null, email: data.kakao_account?.email || null, name: data.kakao_account?.profile?.nickname || "카카오 사용자" })
  },
  naver: {
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    clientId: NAVER_CLIENT_ID, clientSecret: NAVER_CLIENT_SECRET, redirectUri: NAVER_REDIRECT_URI,
    scope: "email name",
    mapProfile: (data) => ({ providerId: data.response?.id || null, email: data.response?.email || null, name: data.response?.name || "네이버 사용자" })
  },
  twitter: {
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me?user.fields=username",
    clientId: TWITTER_CLIENT_ID, clientSecret: TWITTER_CLIENT_SECRET, redirectUri: TWITTER_REDIRECT_URI,
    scope: "tweet.read users.read offline.access",
    usesPkce: true,
    mapProfile: (data) => ({ providerId: data.data?.id || null, email: null, name: data.data?.username ? `@${data.data.username}` : "X 사용자" })
  }
};
function redirectTo(res, location) { res.writeHead(302, { Location: location }); res.end(); }
function redirectWithOAuthError(res, message) { redirectTo(res, `${FRONTEND_URL}/#home?login=error&reason=${encodeURIComponent(message)}`); }
async function startOAuth(req, res, providerKey, url) {
  const provider = OAUTH_PROVIDERS[providerKey];
  if (!provider.clientId || !provider.redirectUri) return send(res, 500, { error: "OAUTH_NOT_CONFIGURED" });
  const requestedRole = url.searchParams.get("role");
  const role = ["CUSTOMER", "SELLER"].includes(requestedRole) ? requestedRole : "CUSTOMER";
  const statePayload = { nonce: randomUUID(), role, provider: providerKey };
  const params = new URLSearchParams({ client_id: provider.clientId, redirect_uri: provider.redirectUri, response_type: "code", scope: provider.scope });
  if (provider.usesPkce) {
    const codeVerifier = base64url(randomBytes(32));
    statePayload.codeVerifier = codeVerifier;
    params.set("code_challenge", base64url(createHash("sha256").update(codeVerifier).digest()));
    params.set("code_challenge_method", "S256");
  }
  params.set("state", signState(statePayload));
  return redirectTo(res, `${provider.authorizeUrl}?${params.toString()}`);
}
async function completeOAuth(req, res, providerKey, url) {
  const provider = OAUTH_PROVIDERS[providerKey];
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return redirectWithOAuthError(res, "OAUTH_MISSING_CODE");
  let state;
  try { state = verifyState(stateRaw); } catch { return redirectWithOAuthError(res, "OAUTH_INVALID_STATE"); }
  if (state.provider !== providerKey) return redirectWithOAuthError(res, "OAUTH_PROVIDER_MISMATCH");
  try {
    const tokenParams = new URLSearchParams({ grant_type: "authorization_code", client_id: provider.clientId, redirect_uri: provider.redirectUri, code });
    if (provider.clientSecret) tokenParams.set("client_secret", provider.clientSecret);
    if (state.codeVerifier) tokenParams.set("code_verifier", state.codeVerifier);
    const tokenHeaders = { "Content-Type": "application/x-www-form-urlencoded" };
    if (providerKey === "twitter") tokenHeaders.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`;
    const tokenResponse = await fetch(provider.tokenUrl, { method: "POST", headers: tokenHeaders, body: tokenParams.toString() });
    if (!tokenResponse.ok) throw new Error(`OAUTH_TOKEN_ERROR_${tokenResponse.status}`);
    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch(provider.profileUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    if (!profileResponse.ok) throw new Error(`OAUTH_PROFILE_ERROR_${profileResponse.status}`);
    const profileData = await profileResponse.json();
    const { providerId, email, name } = provider.mapProfile(profileData);
    if (!providerId) throw new Error("OAUTH_PROFILE_MISSING_ID");
    const { data: existing, error: findError } = await supabase.from("users").select("*").eq("provider", providerKey).eq("provider_id", providerId).maybeSingle();
    if (findError) throw findError;
    let user = existing;
    if (!user) {
      const newUser = { id: `${state.role.toLowerCase()}-${randomUUID()}`, email: email || `${providerKey}-${providerId}@poka-catch.local`, password_hash: null, role: state.role, provider: providerKey, provider_id: providerId, full_name: name, phone: null };
      const { data: created, error: insertError } = await supabase.from("users").insert(newUser).select().single();
      if (insertError) throw insertError;
      user = created;
    }
    return redirectTo(res, `${FRONTEND_URL}/#home?login=success&user_id=${encodeURIComponent(user.id)}&role=${user.role}&token=demo-token-${user.id}`);
  } catch (error) {
    return redirectWithOAuthError(res, error.message);
  }
}

const send = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Demo-Role, X-Demo-User", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((resolve, reject) => { let data = ""; req.on("data", (chunk) => data += chunk); req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("INVALID_JSON")); } }); });
const rawBody = (req) => new Promise((resolve, reject) => { const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); });
const identity = (req) => ({ role: req.headers["x-demo-role"] || "CUSTOMER", userId: req.headers["x-demo-user"] || "customer-1" });
function role(req, res, allowed) { const user = identity(req); if (!allowed.includes(user.role)) { send(res, 403, { error: "FORBIDDEN" }); return null; } return user; }
function paging(items, url) { const page = Math.max(1, Number(url.searchParams.get("page") || 1)); const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 6))); return { items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length }; }
async function projectView(project) { const { data, error } = await supabase.from("project_slots").select("*").eq("project_id", project.id).order("created_at"); if (error) throw error; const slots = data || []; return { ...project, slots, total_slots: slots.length, available_slots: slots.filter((slot) => !slot.is_occupied).length }; }
async function releaseExpiredSlots() {
  const { error } = await supabase.rpc("release_expired_project_slots");
  if (error) console.warn("만료 슬롯 해제 실패:", error.message);
}
async function releaseMaturedEscrow() {
  const { error } = await supabase.rpc("release_matured_escrow");
  if (error) console.warn("에스크로 자동 정산 실패:", error.message);
}
function parseTwitter(url, text = "") {
  let twitter_handle = null;
  let source_url = url || null;
  if (url) {
    try {
      const parsed = new URL(url);
      source_url = parsed.toString();
      if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(parsed.hostname)) {
        const handle = parsed.pathname.split("/").filter(Boolean)[0];
        twitter_handle = handle ? `@${handle}` : null;
      }
    } catch { /* keep text-based parse */ }
  }
  const handleMatch = String(text).match(/@([A-Za-z0-9_]+)/);
  if (handleMatch) twitter_handle = `@${handleMatch[1]}`;
  let group_name = null;
  if (/에스파|aespa/i.test(text)) group_name = "에스파";
  else if (/아이브|ive/i.test(text)) group_name = "아이브";
  else if (/뉴진스|newjeans/i.test(text)) group_name = "뉴진스";
  let goods_type = null;
  if (/포카|포토카드/i.test(text)) goods_type = "포토카드";
  else if (/앨범/i.test(text)) goods_type = "앨범";
  else if (/응원봉/i.test(text)) goods_type = "응원봉";
  return { source_url, twitter_handle, raw_text: text, parsed_fields: { group_name, goods_type, store_name: null } };
}
async function parseUpstageDocument(fileBuffer, contentType) {
  if (!UPSTAGE_API_KEY) throw new Error("UPSTAGE_API_KEY 미설정");
  const form = new FormData();
  form.append("document", new Blob([fileBuffer], { type: contentType || "image/png" }), "upload.png");
  const response = await fetch("https://api.upstage.ai/v1/document-ai/document-parse", {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTAGE_API_KEY}` },
    body: form
  });
  if (!response.ok) throw new Error(`UPSTAGE_ERROR: ${response.status}`);
  const result = await response.json();
  return result.text || result.content || (result.elements ? result.elements.map((item) => item.content?.text || item.content || item.text || "").join("\n") : "") || (result.pages || []).map((page) => page.text || "").join("\n");
}
async function parseWithUpstage(url, text) {
  if (!UPSTAGE_API_KEY) return parseTwitter(url, text);
  const response = await fetch("https://api.upstage.ai/v1/solar/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${UPSTAGE_API_KEY}` },
    body: JSON.stringify({
      model: UPSTAGE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "Extract group-buying information from the supplied store page or X post. Return only valid JSON with keys group_name, goods_type, store_name, title, price, members, shipping_policy, release_date, image_url, description. Use null or [] when unknown." },
        { role: "user", content: JSON.stringify({ source_url: url, post_text: text }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`UPSTAGE_API_ERROR_${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("UPSTAGE_EMPTY_RESPONSE");
  const parsedContent = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim());
  return { ...parseTwitter(url, text), parsed_fields: parsedContent };
}
async function parseReceiptFields(text) {
  if (!UPSTAGE_API_KEY) return { store_name: null, order_datetime: null, quantity: null, order_number: null };
  const response = await fetch("https://api.upstage.ai/v1/solar/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${UPSTAGE_API_KEY}` },
    body: JSON.stringify({
      model: UPSTAGE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "Extract purchase receipt information from OCR text of a K-POP goods store receipt. Return only valid JSON with keys store_name, order_datetime (ISO 8601 if possible, otherwise the raw text), quantity (integer, null if unknown), order_number. Use null when a field is unknown." },
        { role: "user", content: text }
      ]
    })
  });
  if (!response.ok) throw new Error(`UPSTAGE_API_ERROR_${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("UPSTAGE_EMPTY_RESPONSE");
  return JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim());
}
// 영수증 패수품(판매처/수량/주문번호)을 등록된 공구 정보와 대조해 자동 검증한다.
function verifyReceipt(receipt, project) {
  const reasons = [];
  let storeMatch = null;
  if (project?.source_url && receipt.store_name) {
    try {
      const hostname = new URL(project.source_url).hostname.replace(/^www\./, "").toLowerCase();
      const store = String(receipt.store_name).toLowerCase().replace(/\s+/g, "");
      storeMatch = hostname.includes(store) || store.includes(hostname.split(".")[0]);
      if (!storeMatch) reasons.push("판매처가 공구 등록 URL과 일치하지 않습니다.");
    } catch { storeMatch = null; }
  }
  let quantityMatch = null;
  const requiredQuantity = project?.shipping_policy?.quantity;
  if (Number.isFinite(requiredQuantity) && Number.isFinite(Number(receipt.quantity))) {
    quantityMatch = Number(receipt.quantity) >= requiredQuantity;
    if (!quantityMatch) reasons.push(`영수증 수량(${receipt.quantity})이 필요 수량(${requiredQuantity})보다 적습니다.`);
  }
  const hasOrderNumber = Boolean(receipt.order_number);
  if (!hasOrderNumber) reasons.push("주문번호를 확인할 수 없습니다.");
  const verified = [storeMatch, quantityMatch, hasOrderNumber].every((value) => value === true);
  return { verified, store_match: storeMatch, quantity_match: quantityMatch, has_order_number: hasOrderNumber, reasons };
}
async function extractDocumentText(file) {
  if (!UPSTAGE_API_KEY) throw new Error("UPSTAGE_API_KEY_MISSING");
  const match = String(file || "").match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("INVALID_DOCUMENT_IMAGE");
  const [, contentType, encoded] = match;
  const text = await parseUpstageDocument(Buffer.from(encoded, "base64"), contentType);
  if (!text) throw new Error("UPSTAGE_DOCUMENT_EMPTY");
  return text;
}
function recommendPrices(total, weights) { const entries = Object.entries(weights || {}); const average = entries.reduce((sum, [, value]) => sum + Number(value), 0) / entries.length; if (!entries.length || !Number.isFinite(total) || total < 0 || average <= 0) throw new Error("INVALID_PRICING_INPUT"); const prices = Object.fromEntries(entries.map(([member, value]) => [member, Math.round(total / entries.length * Number(value) / average / 100) * 100])); const highest = entries.sort(([, a], [, b]) => b - a)[0][0]; prices[highest] += total - Object.values(prices).reduce((sum, value) => sum + value, 0); return prices; }
async function getOne(table, id) { const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; }

const handler = async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, "http://localhost:3000");

  try {
    if (req.method === "GET" && url.pathname === "/health") { const { error } = await supabase.from("users").select("id", { head: true }); if (error) throw error; return send(res, 200, { ok: true, database: "supabase" }); }
    if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/auth\/(kakao|naver|twitter)\/start$/)) return startOAuth(req, res, url.pathname.split("/")[4], url);
    if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/auth\/(kakao|naver|twitter)\/callback$/)) return completeOAuth(req, res, url.pathname.split("/")[4], url);
    if (req.method === "POST" && url.pathname === "/api/v1/auth/register") { const input = await body(req); if (!input.email || !input.password || !input.full_name || !input.phone || !input.birth_date || !input.postal_code || !input.address || !input.privacy_consent || !["CUSTOMER", "SELLER"].includes(input.role || "CUSTOMER")) return send(res, 400, { error: "INVALID_REGISTRATION" }); const user = { id: `${(input.role || "CUSTOMER").toLowerCase()}-${randomUUID()}`, email: input.email, password_hash: hashPassword(input.password), role: input.role || "CUSTOMER", twitter_handle: input.twitter_handle || null, full_name: input.full_name, phone: input.phone, birth_date: input.birth_date, postal_code: input.postal_code, address: input.address, address_detail: input.address_detail || null, privacy_consented_at: new Date().toISOString() }; const { data, error } = await supabase.from("users").insert(user).select("id,email,role,twitter_handle,full_name,phone").single(); if (error) return send(res, error.code === "23505" ? 409 : 400, { error: error.code === "23505" ? "EMAIL_ALREADY_EXISTS" : "INVALID_REGISTRATION" }); return send(res, 201, { user: data, token: `demo-token-${data.id}` }); }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") { const input = await body(req); const { data, error } = await supabase.from("users").select("id,email,role,twitter_handle,password_hash").eq("email", input.email).maybeSingle(); if (error) throw error; if (!data || !verifyPassword(input.password, data.password_hash)) return send(res, 401, { error: "INVALID_CREDENTIALS" }); const { password_hash, ...user } = data; return send(res, 200, { user, token: `demo-token-${user.id}` }); }
    if (url.pathname.startsWith("/api/v1/admin")) { if (!role(req, res, ["ADMIN"])) return; }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/reports") { const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "PATCH" && url.pathname.match(/^\/api\/v1\/admin\/reports\/[^/]+$/)) { const input = await body(req); if (!["OPEN", "REVIEWING", "RESOLVED", "REJECTED"].includes(input.status)) return send(res, 400, { error: "INVALID_REPORT_STATUS" }); const { data, error } = await supabase.from("reports").update({ status: input.status, resolved_at: ["RESOLVED", "REJECTED"].includes(input.status) ? new Date().toISOString() : null }).eq("id", url.pathname.split("/").pop()).select().single(); if (error) throw error; return send(res, 200, { report: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/ocr/parse") {
      const contentType = req.headers["content-type"] || "";
      let rawText = "";
      let kind, projectId;
      if (contentType.includes("application/json")) {
        const input = await body(req);
        if (!input.image_base64) return send(res, 400, { error: "IMAGE_REQUIRED" });
        rawText = await parseUpstageDocument(Buffer.from(input.image_base64, "base64"), "image/png");
        kind = input.kind; projectId = input.project_id;
      } else {
        const fileBuffer = await rawBody(req);
        rawText = await parseUpstageDocument(fileBuffer, contentType);
      }
      if (kind === "receipt") {
        const receipt_fields = await parseReceiptFields(rawText);
        let verification = null;
        if (projectId) { const project = await getOne("projects", projectId); if (project) verification = verifyReceipt(receipt_fields, await projectView(project)); }
        return send(res, 200, { extracted_text: rawText, kind, receipt_fields, verification });
      }
      return send(res, 200, { extracted_text: rawText, ...parseTwitter(null, rawText) });
    }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/analytics") {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return send(res, 200, { items: data || [], charged_amount: 0 });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/twitter/parse") { const input = await body(req); return send(res, 200, await parseWithUpstage(input.url || "https://x.com/document-upload", input.text || "")); }
    if (req.method === "POST" && url.pathname === "/api/v1/documents/parse") {
      const input = await body(req);
      if (!input.image) return send(res, 400, { error: "DOCUMENT_IMAGE_REQUIRED" });
      const text = await extractDocumentText(input.image);
      if (input.kind === "receipt") {
        const receipt_fields = await parseReceiptFields(text);
        let verification = null;
        if (input.project_id) { const project = await getOne("projects", input.project_id); if (project) verification = verifyReceipt(receipt_fields, await projectView(project)); }
        return send(res, 200, { extracted_text: text, kind: input.kind, receipt_fields, verification });
      }
      const parsed = await parseWithUpstage("https://x.com/document-upload", text);
      return send(res, 200, { ...parsed, extracted_text: text });
    }
    if (req.method === "POST" && url.pathname === "/api/projects/pricing/recommend") { const input = await body(req); return send(res, 200, { total_cost: input.total_cost, prices: recommendPrices(input.total_cost, input.members_weights) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/search") { let query = supabase.from("products").select("*").eq("status", "ACTIVE"); const keyword = url.searchParams.get("keyword"); const category = url.searchParams.get("category"); if (category) query = query.eq("category", category); if (keyword) { const filters = expandSearchTerms(keyword).flatMap((term) => { const safe = escapeIlike(term); return [`title.ilike.%${safe}%`, `category.ilike.%${safe}%`, `description.ilike.%${safe}%`]; }); query = query.or(filters.join(",")); } const sort = url.searchParams.get("sort_by") || "popular"; query = sort === "price" ? query.order("price") : sort === "deadline" ? query.order("deadline", { ascending: true, nullsFirst: false }) : query.order("popularity", { ascending: false }); const { data, error } = await query; if (error) throw error; return send(res, 200, paging(data || [], url)); }
    if (req.method === "GET" && url.pathname === "/api/v1/recommendations") { const user = role(req, res, ["CUSTOMER"]); if (!user) return; const { data: logs, error: logError } = await supabase.from("purchase_logs").select("category").eq("customer_id", user.userId); if (logError) throw logError; const categories = new Set((logs || []).map((log) => log.category)); const { data, error } = await supabase.from("products").select("*").eq("status", "ACTIVE").order("popularity", { ascending: false }); if (error) throw error; return send(res, 200, { items: (data || []).map((item) => ({ ...item, recommendation_score: item.popularity * .35 + (categories.has(item.category) ? 45 : 0) })).sort((a, b) => b.recommendation_score - a.recommendation_score).slice(0, 6) }); }
    if (req.method === "GET" && url.pathname === "/api/projects") { await releaseExpiredSlots(); let query = supabase.from("projects").select("*").order("created_at", { ascending: false }); const group = url.searchParams.get("group") || url.searchParams.get("keyword"); const goods = url.searchParams.get("goods_type"); if (group) { const groupTerms = expandSearchTerms(group); query = groupTerms.length > 1 ? query.in("group_name", groupTerms) : query.eq("group_name", group); } if (goods) query = query.eq("goods_type", goods); const { data, error } = await query; if (error) throw error; const views = await Promise.all((data || []).map(projectView)); const member = url.searchParams.get("member"); const available = url.searchParams.get("available") === "true"; return send(res, 200, paging(views.filter((project) => (!available || project.available_slots > 0) && (!member || project.slots.some((slot) => slot.member_name === member && (!available || !slot.is_occupied)))), url)); }
    if (req.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+$/)) { await releaseExpiredSlots(); const project = await getOne("projects", url.pathname.split("/")[3]); if (!project) return send(res, 404, { error: "PROJECT_NOT_FOUND" }); return send(res, 200, await projectView(project)); }
    if (req.method === "POST" && url.pathname === "/api/projects") { const leader = role(req, res, ["CUSTOMER", "SELLER", "ADMIN"]); if (!leader) return; const input = await body(req); if (!input.group_name || !input.goods_type || !input.title || !Array.isArray(input.slots) || !input.slots.length || input.slots.some((slot) => !slot.member_name || !Number.isFinite(slot.price))) return send(res, 400, { error: "INVALID_PROJECT" }); const { data: project, error } = await supabase.from("projects").insert({ id: randomUUID(), leader_id: leader.userId, group_name: input.group_name, goods_type: input.goods_type, title: input.title, source_url: input.source_url || null, shipping_policy: input.shipping_policy || null, product_metadata: input.product_metadata || {} }).select().single(); if (error) throw error; const { error: slotError } = await supabase.from("project_slots").insert(input.slots.map((slot) => ({ id: randomUUID(), project_id: project.id, member_name: slot.member_name, price: slot.price }))); if (slotError) throw slotError; return send(res, 201, { project: await projectView(project) }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/slots\/[^/]+\/apply$/)) { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; await releaseExpiredSlots(); const parts = url.pathname.split("/"); const { data, error } = await supabase.rpc("apply_project_slot", { target_slot_id: parts[5], target_user_id: customer.userId }); if (error) return send(res, 409, { error: error.message }); const project = await getOne("projects", parts[3]); return send(res, 201, { project: await projectView(project), slot: data }); }
    if (req.method === "POST" && url.pathname === "/api/payments/charge") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); const payment = { id: randomUUID(), project_id: input.project_id || null, slot_id: input.slot_id || null, user_id: customer.userId, amount: 0, currency: "KRW", provider: "MOCK_ESCROW", status: "HELD" }; const { data, error: paymentError } = await supabase.from("payments").insert(payment).select().single(); if (paymentError) return send(res, 201, { payment, is_demo: true }); return send(res, 201, { payment: data, is_demo: true }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/shipment$/)) { const leader = role(req, res, ["SELLER"]); if (!leader) return; const project = await getOne("projects", url.pathname.split("/")[3]); const input = await body(req); if (!project || project.leader_id !== leader.userId || !input.carrier || !input.tracking_number) return send(res, 400, { error: "INVALID_SHIPMENT" }); const { error } = await supabase.from("shipments").upsert({ project_id: project.id, carrier: input.carrier, tracking_number: input.tracking_number }); if (error) throw error; const { data, error: updateError } = await supabase.from("projects").update({ status: "SHIPPED" }).eq("id", project.id).select().single(); if (updateError) throw updateError; return send(res, 200, { project: await projectView(data) }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/confirm$/)) { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("payments").update({ status: "RELEASED", released_at: new Date().toISOString() }).eq("project_id", url.pathname.split("/")[3]).eq("user_id", customer.userId).eq("status", "HELD").select(); if (error) throw error; if (!data?.length) return send(res, 404, { error: "PAYMENT_NOT_FOUND" }); return send(res, 200, { payments: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/seller/products") { const seller = role(req, res, ["SELLER"]); if (!seller) return; const input = await body(req); const required = !input.title || !input.category || !input.description || !Number.isFinite(input.price) || !Number.isInteger(input.stock) || !Number.isInteger(input.shipping_days) || !Number.isInteger(input.min_participants); if (required) return send(res, 400, { error: "INVALID_PRODUCT" }); const { data, error } = await supabase.from("products").insert({ ...input, id: randomUUID(), seller_id: seller.userId, current_participants: 0, popularity: 0, status: "ACTIVE" }).select().single(); if (error) throw error; return send(res, 201, { product: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/cart/items") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); const { data: product, error } = await supabase.from("products").select("*").eq("id", input.product_id).eq("status", "ACTIVE").maybeSingle(); if (error) throw error; if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" }); const picks = Array.isArray(input.picks) ? input.picks : []; if (product.members?.length && (picks.length !== 3 || picks.some((pick) => !product.members.includes(pick)) || new Set(picks).size !== 3)) return send(res, 400, { error: "INVALID_PICKS" }); const { error: insertError } = await supabase.from("cart_items").upsert({ customer_id: customer.userId, product_id: product.id, picks }, { onConflict: "customer_id,product_id" }); if (insertError) throw insertError; return send(res, 201, { cart_id: customer.userId, product_id: product.id }); }
    if (req.method === "GET" && url.pathname === "/api/v1/cart") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("cart_items").select("*, products(*)").eq("customer_id", customer.userId); if (error) throw error; const items = (data || []).map((item) => ({ product: item.products, picks: item.picks })); return send(res, 200, { items, total: items.reduce((sum, item) => sum + item.product.price, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/purchase-history") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("orders").select("*, order_items(*), payments(*)").eq("customer_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/payment-history") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; await releaseMaturedEscrow(); const { data, error } = await supabase.from("payments").select("*").eq("user_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "POST" && url.pathname === "/api/v1/account") { const user = identity(req); const input = await body(req); if (!input.account) return send(res, 400, { error: "INVALID_ACCOUNT" }); const { data, error } = await supabase.from("payout_accounts").upsert({ user_id: user.userId, account: input.account, updated_at: new Date().toISOString() }).select().single(); if (error) throw error; return send(res, 200, { account: data }); }
    if (req.method === "GET" && url.pathname === "/api/v1/activity") { const user = identity(req); const [{ data: items, error }, { data: account, error: accountError }] = await Promise.all([supabase.from("activities").select("*").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(50), supabase.from("payout_accounts").select("user_id").eq("user_id", user.userId).maybeSingle()]); if (error || accountError) throw error || accountError; return send(res, 200, { items: items || [], account: account || null }); }
    if (req.method === "POST" && url.pathname === "/api/v1/activity") { const user = identity(req); const input = await body(req); if (!["participation", "settlement", "notification", "dispute"].includes(input.type) || !input.message) return send(res, 400, { error: "INVALID_ACTIVITY" }); const { data, error } = await supabase.from("activities").insert({ user_id: user.userId, type: input.type, title: input.title || null, message: input.message }).select().single(); if (error) throw error; return send(res, 201, { activity: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/reports") { const user = role(req, res, ["CUSTOMER", "SELLER", "ADMIN"]); if (!user) return; const input = await body(req); if (!input.reason) return send(res, 400, { error: "INVALID_REPORT" }); const { data, error } = await supabase.from("reports").insert({ reporter_id: user.userId, subject_type: input.subject_type || "ORDER", subject_id: input.subject_id || null, reason: input.reason, details: input.details || null }).select().single(); if (error) throw error; return send(res, 201, { report: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/reviews") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); if (!input.product_id || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || !input.body) return send(res, 400, { error: "INVALID_REVIEW" }); const { data, error } = await supabase.from("reviews").insert({ product_id: input.product_id, customer_id: customer.userId, rating: input.rating, body: input.body }).select().single(); if (error) throw error; return send(res, 201, { review: data }); }
    if (req.method === "GET" && url.pathname.startsWith("/api/v1/members/")) { const productId = url.pathname.split("/").pop(); const { data: product, error } = await supabase.from("products").select("members,member_limit").eq("id", productId).maybeSingle(); if (error) throw error; if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" }); const { data: counts, error: countError } = await supabase.from("member_selections").select("member_name,count").eq("product_id", productId); if (countError) throw countError; return send(res, 200, Object.fromEntries((product.members || []).map((member) => [member, { rank1: counts?.find((item) => item.member_name === member)?.count || 0, limit: product.member_limit || 20 }]))); }
    if (req.method === "POST" && url.pathname === "/api/v1/checkout") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); const { data: cart, error } = await supabase.from("cart_items").select("*, products(*)").eq("customer_id", customer.userId); if (error) throw error; const selected = input.product_ids ? (cart || []).filter((item) => input.product_ids.includes(item.product_id)) : cart || []; if (!selected.length) return send(res, 400, { error: "EMPTY_CART" }); if (selected.some((item) => item.products.stock < 1)) return send(res, 409, { error: "OUT_OF_STOCK" }); const total = selected.reduce((sum, item) => sum + item.products.price, 0); const { data: order, error: orderError } = await supabase.from("orders").insert({ customer_id: customer.userId, status: "PAID", total: 0 }).select().single(); if (orderError) throw orderError; const { error: itemError } = await supabase.from("order_items").insert(selected.map((item) => ({ order_id: order.id, product_id: item.product_id, title: item.products.title, price: item.products.price, picks: item.picks }))); if (itemError) throw itemError; const { data: payment, error: paymentError } = await supabase.from("payments").insert({ order_id: order.id, user_id: customer.userId, amount: 0, currency: "KRW", provider: "MOCK_ESCROW", status: "SUCCEEDED" }).select().single(); if (paymentError) throw paymentError; for (const item of selected) { const { error: updateError } = await supabase.from("products").update({ stock: item.products.stock - 1, current_participants: item.products.current_participants + 1 }).eq("id", item.product_id); if (updateError) throw updateError; const firstPick = item.picks?.[0]; if (firstPick) { const { data: current } = await supabase.from("member_selections").select("count").eq("product_id", item.product_id).eq("member_name", firstPick).maybeSingle(); const { error: countError } = await supabase.from("member_selections").upsert({ product_id: item.product_id, member_name: firstPick, count: (current?.count || 0) + 1 }); if (countError) throw countError; } const { error: logError } = await supabase.from("purchase_logs").insert({ order_id: order.id, customer_id: customer.userId, product_id: item.product_id, category: item.products.category }); if (logError) throw logError; } await supabase.from("cart_items").delete().eq("customer_id", customer.userId); return send(res, 201, { order: { ...order, payment_id: payment.id } }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/analytics/sales") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; let query = supabase.from("products").select("*"); if (seller.role !== "ADMIN") query = query.eq("seller_id", seller.userId); const { data, error } = await query; if (error) throw error; return send(res, 200, { items: data || [], total_units: (data || []).reduce((sum, item) => sum + item.current_participants, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/payouts/monthly") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; await releaseMaturedEscrow(); let query = supabase.from("payments").select("amount,project_id").eq("status", "RELEASED"); if (seller.role !== "ADMIN") { const { data: projects, error: projectError } = await supabase.from("projects").select("id").eq("leader_id", seller.userId); if (projectError) throw projectError; const projectIds = (projects || []).map((project) => project.id); if (!projectIds.length) return send(res, 200, { month: new Date().toISOString().slice(0, 7), gross: 0, platform_fee: 0, estimated_payout: 0 }); query = query.in("project_id", projectIds); } const { data, error } = await query; if (error) throw error; const gross = (data || []).reduce((sum, item) => sum + item.amount, 0); return send(res, 200, { month: new Date().toISOString().slice(0, 7), gross, platform_fee: Math.round(gross * .1), estimated_payout: Math.round(gross * .9) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/reviews") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; let query = supabase.from("reviews").select("*"); if (seller.role !== "ADMIN") { const { data: products, error: productError } = await supabase.from("products").select("id").eq("seller_id", seller.userId); if (productError) throw productError; const productIds = (products || []).map((product) => product.id); if (!productIds.length) return send(res, 200, { items: [] }); query = query.in("product_id", productIds); } const { data, error } = await query; if (error) throw error; return send(res, 200, { items: data || [] }); }
    return send(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    return send(
      res,
      error.message === "INVALID_JSON" || error.message?.startsWith("INVALID_") ? 400 : 500,
      { error: error.message || "INTERNAL_ERROR" }
    );
  }
};

module.exports = handler;

if (require.main === module) {
  const { createServer } = require("node:http");
  createServer(handler).listen(process.env.PORT || 3000, () =>
    console.log("Group-buying API listening on http://localhost:3000")
  );
}
