// [수정 1] Vercel 서버리스 환경과의 모듈 호환성을 위해 require 방식으로 통일
require("dotenv").config();
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac, createHash, createCipheriv } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPSTAGE_API_KEY, UPSTAGE_MODEL = "solar-pro2",
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET,
  OAUTH_STATE_SECRET, AUTH_JWT_SECRET, PAYMENT_WEBHOOK_SECRET, ACCOUNT_ENCRYPTION_KEY,
  RESEND_API_KEY, EMAIL_FROM, BACKEND_URL = "http://localhost:3000", FRONTEND_URL = "http://localhost:3000"
} = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.");
const authJwtSecret = AUTH_JWT_SECRET || OAUTH_STATE_SECRET || SUPABASE_SERVICE_ROLE_KEY;
if (!authJwtSecret || authJwtSecret.length < 32) throw new Error("AUTH_JWT_SECRET은 32자 이상으로 설정해야 합니다.");
if (!PAYMENT_WEBHOOK_SECRET || PAYMENT_WEBHOOK_SECRET.length < 32) throw new Error("PAYMENT_WEBHOOK_SECRET은 32자 이상으로 설정해야 합니다.");
const accountEncryptionKey = Buffer.from(ACCOUNT_ENCRYPTION_KEY || "", "base64");
if (accountEncryptionKey.length !== 32) throw new Error("ACCOUNT_ENCRYPTION_KEY는 Base64로 인코딩한 32바이트 키여야 합니다.");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });


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
function validPassword(password) {
  const value = String(password || "");
  const categories = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  return value.length >= 8 && value.length <= 16 && categories >= 2;
}
async function sendPasswordResetEmail(email, token) {
  if (!RESEND_API_KEY || !EMAIL_FROM) throw new Error("PASSWORD_RESET_EMAIL_NOT_CONFIGURED");
  const resetUrl = new URL(FRONTEND_URL);
  resetUrl.searchParams.set("reset_token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Poka-Catch 비밀번호 재설정",
      html: `<p>비밀번호 재설정을 요청하셨습니다.</p><p><a href="${resetUrl.toString()}">30분 이내에 비밀번호 재설정하기</a></p><p>요청하지 않았다면 이 메일을 무시해 주세요.</p>`
    })
  });
  if (!response.ok) throw new Error(`PASSWORD_RESET_EMAIL_FAILED_${response.status}`);
}
function encryptedAccountValues(account, bankName = null) {
  const plaintext = String(account || "").trim();
  const digits = plaintext.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 30) throw Object.assign(new Error("INVALID_ACCOUNT"), { status: 400 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accountEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    account: null,
    account_ciphertext: ciphertext.toString("base64"),
    account_iv: iv.toString("base64"),
    account_auth_tag: cipher.getAuthTag().toString("base64"),
    account_last4: digits.slice(-4),
    bank_name: String(bankName || "").trim() || null,
    updated_at: new Date().toISOString()
  };
}
function maskedAccount(account) {
  if (!account?.account_last4) return null;
  return { bank_name: account.bank_name || null, display_name: `${account.bank_name || "환급 계좌"} · ****${account.account_last4}` };
}
async function migrateLegacyPayoutAccount(account) {
  if (!account || account.account_ciphertext || !account.account) return account;
  const encrypted = encryptedAccountValues(account.account, account.bank_name);
  const { data, error } = await supabase.from("payout_accounts").update(encrypted).eq("user_id", account.user_id).select("user_id,account_ciphertext,account_last4,bank_name").single();
  if (error) throw error;
  return data;
}
function maskedShippingInfo(shipping = {}) {
  const name = String(shipping.recipient_name || "");
  const phone = String(shipping.phone || "").replace(/\D/g, "");
  return {
    recipient_name: name ? `${Array.from(name)[0]}**` : "",
    phone: phone ? `***-****-${phone.slice(-4)}` : "",
    postal_code: "*****",
    address: "포장 단계에서 공개",
    address_detail: "***"
  };
}
function issueAuthToken(user) {
  return jwt.sign({ role: user.role }, authJwtSecret, { subject: user.id, audience: "poka-catch-web", issuer: "poka-catch-api", expiresIn: "12h" });
}
function identity(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("AUTH_TOKEN_REQUIRED"), { status: 401 });
  try {
    const payload = jwt.verify(match[1], authJwtSecret, { audience: "poka-catch-web", issuer: "poka-catch-api" });
    if (!payload.sub || !["CUSTOMER", "SELLER", "ADMIN"].includes(payload.role)) throw new Error("INVALID_CLAIMS");
    return { userId: payload.sub, role: payload.role };
  } catch {
    throw Object.assign(new Error("INVALID_OR_EXPIRED_TOKEN"), { status: 401 });
  }
}

// 소셜 로그인(OAuth). 구글·카카오는 Supabase Auth(signInWithOAuth)가 처리하므로
// 여기서는 Supabase가 기본 지원하지 않는 네이버만 직접 연동한다. 트위터는 연동 보류.
const OAUTH_PROVIDERS = {
  naver: {
    clientId: NAVER_CLIENT_ID, clientSecret: NAVER_CLIENT_SECRET, scope: "",
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize", tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    tokenBody: (code, redirectUri, state) => new URLSearchParams({ code, client_id: NAVER_CLIENT_ID, client_secret: NAVER_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code", state }),
    mapProfile: (profile) => ({ oauthId: profile.response?.id, email: profile.response?.email || null, nickname: profile.response?.nickname || profile.response?.name || "naver-user" })
  }
};
const oauthStateSecret = OAUTH_STATE_SECRET || NAVER_CLIENT_SECRET || SUPABASE_SERVICE_ROLE_KEY;
// 서버 재시작/서버리스 콜드스타트에도 살아남도록 state를 메모리 대신 서명된 토큰으로 검증한다.
function createOauthState(provider) {
  const payload = Buffer.from(JSON.stringify({ provider, nonce: randomBytes(8).toString("hex"), exp: Date.now() + 5 * 60000 })).toString("base64url");
  const signature = createHmac("sha256", oauthStateSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function consumeOauthState(state, provider) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return false;
  const expectedSignature = createHmac("sha256", oauthStateSecret).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.provider === provider && data.exp > Date.now();
  } catch {
    return false;
  }
}
function redirect(res, location) { res.writeHead(302, { Location: location }); res.end(); }
async function findOrCreateOauthUser(provider, profile) {
  const { oauthId, email, nickname } = profile;
  if (!oauthId) throw new Error("OAUTH_PROFILE_MISSING_ID");
  const { data: existing, error: existingError } = await supabase.from("users").select("id,email,role").eq("oauth_provider", provider).eq("oauth_id", oauthId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  if (email) {
    const { data: byEmail, error: byEmailError } = await supabase.from("users").select("id,email,role").eq("email", email).maybeSingle();
    if (byEmailError) throw byEmailError;
    if (byEmail) {
      const { data: linked, error: linkError } = await supabase.from("users").update({ oauth_provider: provider, oauth_id: oauthId }).eq("id", byEmail.id).select("id,email,role").single();
      if (linkError) throw linkError;
      return linked;
    }
  }
  const user = { id: `customer-${randomUUID()}`, email: email || `${provider}-${oauthId}@oauth.local`, role: "CUSTOMER", full_name: nickname, oauth_provider: provider, oauth_id: oauthId };
  const { data: created, error: createError } = await supabase.from("users").insert(user).select("id,email,role").single();
  if (createError) throw createError;
  return created;
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

const send = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, X-Payment-Timestamp, X-Payment-Signature", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((resolve, reject) => { let data = ""; req.on("data", (chunk) => data += chunk); req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("INVALID_JSON")); } }); });
const rawBody = (req) => new Promise((resolve, reject) => { const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); });
function verifyPaymentWebhookSignature(req, payload) {
  const timestamp = String(req.headers["x-payment-timestamp"] || "");
  const supplied = String(req.headers["x-payment-signature"] || "").replace(/^sha256=/, "");
  if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", PAYMENT_WEBHOOK_SECRET).update(`${timestamp}.`).update(payload).digest("hex");
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
function role(req, res, allowed) { const user = identity(req); if (!allowed.includes(user.role)) { send(res, 403, { error: "FORBIDDEN" }); return null; } return user; }
function paging(items, url) { const page = Math.max(1, Number(url.searchParams.get("page") || 1)); const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 6))); return { items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length }; }
async function projectView(project) {
  const [{ data: slots, error }, { data: leader, error: leaderError }] = await Promise.all([
    supabase.from("project_slots").select("*").eq("project_id", project.id).order("created_at"),
    supabase.from("users").select("trust_score,verified_review_count").eq("id", project.leader_id).maybeSingle()
  ]);
  if (error || leaderError) throw error || leaderError;
  const items = slots || [];
  return { ...project, leader_trust_score: Number(leader?.trust_score ?? 70), leader_verified_review_count: leader?.verified_review_count || 0, slots: items, total_slots: items.length, available_slots: items.filter((slot) => !slot.is_occupied).length };
}
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
async function parseWaybillFields(text) {
  if (!UPSTAGE_API_KEY) return { rows: [] };
  const response = await fetch("https://api.upstage.ai/v1/solar/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${UPSTAGE_API_KEY}` },
    body: JSON.stringify({
      model: UPSTAGE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "Extract every shipment row from OCR text. Return only valid JSON in the form {rows:[{recipient_name,tracking_number,carrier}]} with one row per recipient. Use null for unknown values." },
        { role: "user", content: text }
      ]
    })
  });
  if (!response.ok) throw new Error(`UPSTAGE_API_ERROR_${response.status}`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("UPSTAGE_EMPTY_RESPONSE");
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "").trim());
  return { rows: Array.isArray(parsed.rows) ? parsed.rows.filter((row) => row.recipient_name && row.tracking_number) : [] };
}
async function matchWaybillRows(projectId, rows) {
  const project = await getOne("projects", projectId);
  if (!project) return { matched: [], unmatched: rows };
  const { data: slots, error } = await supabase.from("project_slots").select("participant_id,member_name").eq("project_id", projectId);
  if (error) throw error;
  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const name = String(row.recipient_name).trim().toLowerCase();
    const slot = (slots || []).find((item) => item.member_name.trim().toLowerCase() === name);
    if (!slot) { unmatched.push(row); continue; }
    const assignment = { project_id: projectId, participant_id: slot.participant_id, participant_name: slot.member_name, tracking_number: String(row.tracking_number), carrier: row.carrier || null, confidence: 1, source: "OCR" };
    const { data, error: assignmentError } = await supabase.from("shipment_assignments").upsert(assignment, { onConflict: "project_id,participant_id,tracking_number" }).select().single();
    if (assignmentError) throw assignmentError;
    matched.push(data);
  }
  return { matched, unmatched };
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
  const parsedOrderDatetime = new Date(receipt.order_datetime);
  const orderDatetimeValid = receipt.order_datetime && !Number.isNaN(parsedOrderDatetime.getTime())
    && parsedOrderDatetime.getTime() >= new Date(project.created_at).getTime() - 86400000
    && parsedOrderDatetime.getTime() <= Date.now() + 300000;
  if (!orderDatetimeValid) reasons.push("주문일시를 확인할 수 없거나 공구 등록 기간과 맞지 않습니다.");
  const verified = [storeMatch, quantityMatch, hasOrderNumber, orderDatetimeValid].every((value) => value === true);
  return { verified, store_match: storeMatch, quantity_match: quantityMatch, has_order_number: hasOrderNumber, order_datetime_valid: orderDatetimeValid, parsed_order_datetime: orderDatetimeValid ? parsedOrderDatetime.toISOString() : null, reasons };
}
async function recordReceiptVerification(projectId, uploaderId, receipt, rawText) {
  const project = await getOne("projects", projectId);
  if (!project) throw Object.assign(new Error("PROJECT_NOT_FOUND"), { status: 404 });
  const preliminary = verifyReceipt(receipt, await projectView(project));
  const { data, error } = await supabase.rpc("record_receipt_verification", {
    target_project_id: projectId,
    target_uploader_id: uploaderId,
    target_store_name: receipt.store_name || "",
    target_store_match: preliminary.store_match === true,
    target_order_datetime: preliminary.parsed_order_datetime,
    target_order_datetime_raw: String(receipt.order_datetime || ""),
    target_quantity: Number.isInteger(Number(receipt.quantity)) ? Number(receipt.quantity) : null,
    target_order_number: String(receipt.order_number || ""),
    target_document_hash: createHash("sha256").update(rawText).digest("hex")
  });
  if (error) throw error;
  const checks = data.checks || {};
  const reasons = [];
  if (!checks.unique_order_number) reasons.push("이미 등록된 주문번호이거나 주문번호를 확인할 수 없습니다.");
  if (!checks.store_match) reasons.push("판매처가 공구 등록 URL과 일치하지 않습니다.");
  if (!checks.order_datetime_valid) reasons.push("주문일시를 확인할 수 없거나 공구 등록 기간과 맞지 않습니다.");
  if (!checks.quantity_match) reasons.push(`영수증 수량이 필요 수량(${checks.required_quantity || 0})보다 적습니다.`);
  return { receipt_id: data.id, verified: data.status === "VERIFIED", status: data.status, checks, reasons, explanation_due_at: data.explanation_due_at };
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
    if (req.method === "POST" && url.pathname === "/api/v1/webhooks/payments/mock") {
      if (Number(req.headers["content-length"] || 0) > 65536) return send(res, 413, { error: "WEBHOOK_PAYLOAD_TOO_LARGE" });
      const payload = await rawBody(req);
      if (payload.length > 65536) return send(res, 413, { error: "WEBHOOK_PAYLOAD_TOO_LARGE" });
      if (!verifyPaymentWebhookSignature(req, payload)) return send(res, 401, { error: "INVALID_WEBHOOK_SIGNATURE" });
      let event;
      try { event = JSON.parse(payload.toString("utf8")); } catch { return send(res, 400, { error: "INVALID_WEBHOOK_JSON" }); }
      const payment = event.data || {};
      const amount = Number(payment.amount);
      const paidAt = new Date(payment.paid_at);
      if (!event.id || !event.type || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payment.payment_id || "") || !payment.provider_payment_id || !Number.isInteger(amount) || amount < 0 || Number.isNaN(paidAt.getTime())) return send(res, 400, { error: "INVALID_WEBHOOK_EVENT" });
      const { data, error } = await supabase.rpc("process_payment_webhook", {
        target_provider: "MOCK_VIRTUAL_ACCOUNT",
        target_event_id: String(event.id),
        target_event_type: String(event.type),
        target_payment_id: payment.payment_id,
        target_provider_payment_id: String(payment.provider_payment_id),
        target_amount: amount,
        target_paid_at: paidAt.toISOString(),
        target_payload_hash: createHash("sha256").update(payload).digest("hex")
      });
      if (error) throw error;
      return send(res, 200, data);
    }
    if (req.method === "GET" && url.pathname === "/api/v1/auth/check-username") {
      const username = (url.searchParams.get("username") || "").trim().toLowerCase();
      if (!/^[a-z0-9]{4,20}$/.test(username)) return send(res, 400, { error: "INVALID_USERNAME_FORMAT" });
      const { data, error } = await supabase.from("users").select("id").eq("username", username).maybeSingle();
      if (error) throw error;
      return send(res, 200, { available: !data });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/password-reset/request") {
      const input = await body(req);
      const email = String(input.email || "").trim().toLowerCase();
      const genericResponse = { accepted: true, message: "계정이 존재하면 비밀번호 재설정 메일을 전송했습니다." };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 202, genericResponse);
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const { data: created, error } = await supabase.rpc("create_password_reset_request", { target_email: email, target_token_hash: tokenHash });
      if (error) throw error;
      if (created) {
        try {
          await sendPasswordResetEmail(email, token);
        } catch (error) {
          await supabase.from("password_reset_tokens").delete().eq("token_hash", tokenHash);
          console.warn("비밀번호 재설정 메일 발송 실패:", error.message);
        }
      }
      return send(res, 202, genericResponse);
    }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/password-reset/confirm") {
      const input = await body(req);
      const token = String(input.token || "");
      if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !validPassword(input.password)) return send(res, 400, { error: "INVALID_PASSWORD_RESET" });
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const { data: consumed, error } = await supabase.rpc("consume_password_reset_token", { target_token_hash: tokenHash, target_password_hash: hashPassword(input.password) });
      if (error) throw error;
      if (!consumed) return send(res, 400, { error: "INVALID_OR_EXPIRED_RESET_TOKEN" });
      return send(res, 200, { reset: true });
    }
    if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/auth\/oauth\/[^/]+$/)) {
      const provider = url.pathname.split("/").pop();
      const config = OAUTH_PROVIDERS[provider];
      if (!config || !config.clientId || !config.clientSecret) return send(res, 400, { error: "OAUTH_PROVIDER_NOT_CONFIGURED" });
      const state = createOauthState(provider);
      const redirectUri = `${BACKEND_URL}/api/v1/auth/oauth/${provider}/callback`;
      const authorize = new URL(config.authorizeUrl);
      authorize.searchParams.set("client_id", config.clientId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("state", state);
      if (config.scope) authorize.searchParams.set("scope", config.scope);
      return redirect(res, authorize.toString());
    }
    if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/auth\/oauth\/[^/]+\/callback$/)) {
      const provider = url.pathname.split("/")[5];
      const config = OAUTH_PROVIDERS[provider];
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!config || !code || !state || !consumeOauthState(state, provider)) return redirect(res, `${FRONTEND_URL}/?oauth_error=OAUTH_STATE_INVALID`);
      try {
        const redirectUri = `${BACKEND_URL}/api/v1/auth/oauth/${provider}/callback`;
        const tokenResponse = await fetch(config.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: config.tokenBody(code, redirectUri, state) });
        const tokenResult = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenResult.access_token) throw new Error("OAUTH_TOKEN_EXCHANGE_FAILED");
        const profileResponse = await fetch(config.profileUrl, { headers: { Authorization: `Bearer ${tokenResult.access_token}` } });
        const profile = await profileResponse.json();
        if (!profileResponse.ok) throw new Error("OAUTH_PROFILE_FETCH_FAILED");
        const user = await findOrCreateOauthUser(provider, config.mapProfile(profile));
        return redirect(res, `${FRONTEND_URL}/?oauth_token=${encodeURIComponent(issueAuthToken(user))}`);
      } catch (error) {
        console.warn(`${provider} OAuth login failed:`, error.message);
        return redirect(res, `${FRONTEND_URL}/?oauth_error=OAUTH_LOGIN_FAILED`);
      }
    }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/oauth/supabase-sync") {
      const input = await body(req);
      if (!input.access_token) return send(res, 400, { error: "ACCESS_TOKEN_REQUIRED" });
      const { data: authResult, error: authError } = await supabase.auth.getUser(input.access_token);
      if (authError || !authResult?.user) return send(res, 401, { error: "INVALID_SUPABASE_SESSION" });
      const supabaseUser = authResult.user;
      const provider = supabaseUser.app_metadata?.provider || "supabase";
      const profile = {
        oauthId: supabaseUser.id,
        email: supabaseUser.email || null,
        nickname: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split("@")[0] || `${provider}-user`
      };
      const user = await findOrCreateOauthUser(provider, profile);
      return send(res, 200, { user, token: issueAuthToken(user) });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/register") { const input = await body(req); const username = String(input.username || "").trim().toLowerCase(); if (!username || !/^[a-z0-9]{4,20}$/.test(username)) return send(res, 400, { error: "INVALID_USERNAME_FORMAT" }); const categories = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(input.password || "")).length; if (!input.password || input.password.length < 8 || input.password.length > 16 || categories < 2) return send(res, 400, { error: "WEAK_PASSWORD" }); if (!input.email || !input.full_name || !input.phone || !input.birth_date || !input.postal_code || !input.address || !input.privacy_consent || !["CUSTOMER", "SELLER"].includes(input.role || "CUSTOMER")) return send(res, 400, { error: "INVALID_REGISTRATION" }); const { data: sameUsername, error: usernameError } = await supabase.from("users").select("id").eq("username", username).maybeSingle(); if (usernameError) throw usernameError; if (sameUsername) return send(res, 409, { error: "USERNAME_ALREADY_EXISTS" }); const { data: sameEmail, error: emailError } = await supabase.from("users").select("id,deleted_at").eq("email", input.email).maybeSingle(); if (emailError) throw emailError; if (sameEmail) { const deletedAt = sameEmail.deleted_at ? new Date(sameEmail.deleted_at).getTime() : null; if (!deletedAt || Date.now() - deletedAt < 30 * 86400000) return send(res, 409, { error: "EMAIL_UNAVAILABLE" }); await supabase.from("users").update({ email: `withdrawn-${sameEmail.id}@invalid.local` }).eq("id", sameEmail.id); } const { data: samePhone, error: phoneError } = await supabase.from("users").select("id,deleted_at").eq("phone", input.phone).maybeSingle(); if (phoneError) throw phoneError; if (samePhone && (!samePhone.deleted_at || Date.now() - new Date(samePhone.deleted_at).getTime() < 7 * 86400000)) return send(res, 409, { error: "PHONE_UNAVAILABLE" }); const user = { id: `${(input.role || "CUSTOMER").toLowerCase()}-${randomUUID()}`, username, email: input.email, password_hash: hashPassword(input.password), role: input.role || "CUSTOMER", twitter_handle: input.twitter_handle || null, full_name: input.full_name, phone: input.phone, birth_date: input.birth_date, postal_code: input.postal_code, address: input.address, address_detail: input.address_detail || null, marketing_consent: Boolean(input.marketing_consent), privacy_consented_at: new Date().toISOString() }; const { data, error } = await supabase.from("users").insert(user).select("id,username,email,role,twitter_handle,full_name,phone,birth_date,postal_code,address,address_detail,marketing_consent").single(); if (error) return send(res, error.code === "23505" ? 409 : 400, { error: error.code === "23505" ? "EMAIL_ALREADY_EXISTS" : "INVALID_REGISTRATION" }); return send(res, 201, { user: data, token: issueAuthToken(data) }); }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") { const input = await body(req); const identifier = String(input.identifier || input.email || "").trim(); const isEmail = identifier.includes("@"); const { data, error } = await supabase.from("users").select("id,email,role,twitter_handle,full_name,phone,birth_date,postal_code,address,address_detail,password_hash,deleted_at").eq(isEmail ? "email" : "username", isEmail ? identifier : identifier.toLowerCase()).maybeSingle(); if (error) throw error; if (!data || !verifyPassword(input.password, data.password_hash)) return send(res, 401, { error: "INVALID_CREDENTIALS" }); if (data.deleted_at) { const recoverable = Date.now() - new Date(data.deleted_at).getTime() < 30 * 86400000; return send(res, 409, { error: recoverable ? "ACCOUNT_DELETED_RECOVERABLE" : "ACCOUNT_DELETED", recoverable, user_id: data.id }); } const { password_hash, deleted_at, ...user } = data; return send(res, 200, { user, token: issueAuthToken(user) }); }
    if (req.method === "POST" && url.pathname === "/api/v1/auth/restore") { const input = await body(req); const { data, error } = await supabase.from("users").select("id,email,role,twitter_handle,full_name,phone,birth_date,postal_code,address,address_detail,password_hash,deleted_at").eq("email", input.email).maybeSingle(); if (error) throw error; if (!data || !verifyPassword(input.password, data.password_hash) || !data.deleted_at || Date.now() - new Date(data.deleted_at).getTime() >= 30 * 86400000) return send(res, 400, { error: "ACCOUNT_NOT_RECOVERABLE" }); const { password_hash, deleted_at, ...user } = data; const { error: restoreError } = await supabase.from("users").update({ deleted_at: null, deletion_requested_at: null }).eq("id", data.id); if (restoreError) throw restoreError; return send(res, 200, { user, token: issueAuthToken(user), restored: true }); }
    if (req.method === "GET" && url.pathname === "/api/v1/account/profile") { const user = identity(req); const { data, error } = await supabase.from("users").select("id,email,role,twitter_handle,full_name,phone,birth_date,postal_code,address,address_detail").eq("id", user.userId).is("deleted_at", null).maybeSingle(); if (error) throw error; if (!data) return send(res, 404, { error: "ACCOUNT_NOT_FOUND" }); return send(res, 200, { user: data }); }
    if (req.method === "PATCH" && url.pathname === "/api/v1/account/profile") { const user = identity(req); const input = await body(req); const { data: current, error: currentError } = await supabase.from("users").select("password_hash").eq("id", user.userId).is("deleted_at", null).maybeSingle(); if (currentError) throw currentError; if (!current || !verifyPassword(input.current_password, current.password_hash)) return send(res, 403, { error: "PASSWORD_REQUIRED" }); const allowed = ["full_name", "phone", "birth_date", "postal_code", "address", "address_detail", "twitter_handle"]; const updates = Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key] || null])); if (input.new_password) updates.password_hash = hashPassword(input.new_password); if (!Object.keys(updates).length) return send(res, 400, { error: "NO_PROFILE_CHANGES" }); const { data, error } = await supabase.from("users").update(updates).eq("id", user.userId).select("id,email,role,twitter_handle,full_name,phone,birth_date,postal_code,address,address_detail").single(); if (error) return send(res, error.code === "23505" ? 409 : 400, { error: error.code === "23505" ? "PHONE_ALREADY_EXISTS" : "PROFILE_UPDATE_FAILED" }); return send(res, 200, { user: data }); }
    if (req.method === "DELETE" && url.pathname === "/api/v1/account") { const user = identity(req); const input = await body(req); const { data: current, error: currentError } = await supabase.from("users").select("password_hash").eq("id", user.userId).is("deleted_at", null).maybeSingle(); if (currentError) throw currentError; if (!current || !verifyPassword(input.password, current.password_hash)) return send(res, 403, { error: "PASSWORD_REQUIRED" }); const now = new Date().toISOString(); const { error } = await supabase.from("users").update({ deletion_requested_at: now, deleted_at: now }).eq("id", user.userId); if (error) throw error; return send(res, 200, { deleted_at: now, recoverable_until: new Date(Date.now() + 30 * 86400000).toISOString(), email_reusable_after: new Date(Date.now() + 30 * 86400000).toISOString(), phone_reusable_after: new Date(Date.now() + 7 * 86400000).toISOString() }); }
    if (url.pathname.startsWith("/api/v1/admin")) { const admin = role(req, res, ["ADMIN"]); if (!admin) return; const { data: currentAdmin, error: adminError } = await supabase.from("users").select("id").eq("id", admin.userId).eq("role", "ADMIN").is("deleted_at", null).maybeSingle(); if (adminError) throw adminError; if (!currentAdmin) return send(res, 403, { error: "ADMIN_ACCESS_REVOKED" }); }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/reports") { const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/receipt-verifications") { let query = supabase.from("receipt_verifications").select("id,project_id,uploader_id,store_name,order_datetime,quantity,order_number,checks,status,explanation_due_at,explanation,explanation_submitted_at,reviewed_at,review_note,created_at").order("created_at", { ascending: false }); const status = url.searchParams.get("status"); if (status) query = query.eq("status", status); const { data, error } = await query; if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "PATCH" && url.pathname.match(/^\/api\/v1\/admin\/receipt-verifications\/[^/]+$/)) { const admin = identity(req); const input = await body(req); if (!["APPROVED", "REJECTED"].includes(input.decision)) return send(res, 400, { error: "INVALID_REVIEW_DECISION" }); const { data, error } = await supabase.rpc("review_receipt_explanation", { target_receipt_id: url.pathname.split("/").pop(), target_reviewer_id: admin.userId, target_decision: input.decision, target_note: input.note || "" }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, { verification: data }); }
    if (req.method === "PATCH" && url.pathname.match(/^\/api\/v1\/admin\/reports\/[^/]+$/)) { const input = await body(req); if (!["OPEN", "REVIEWING", "RESOLVED", "REJECTED"].includes(input.status)) return send(res, 400, { error: "INVALID_REPORT_STATUS" }); const { data, error } = await supabase.rpc("resolve_settlement_report", { target_report_id: url.pathname.split("/").pop(), target_status: input.status }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, { report: data }); }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/payments") { await releaseExpiredSlots(); let query = supabase.from("payments").select("id,order_id,user_id,amount,status,virtual_account,created_at").order("created_at", { ascending: false }); const status = url.searchParams.get("status"); if (status) query = query.eq("status", status); const { data, error } = await query; if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "GET" && url.pathname === "/api/v1/admin/deposits") { let query = supabase.from("project_deposits").select("id,project_id,leader_id,amount,status,created_at").order("created_at", { ascending: false }); const status = url.searchParams.get("status"); if (status) query = query.eq("status", status); const { data: deposits, error } = await query; if (error) throw error; const projectIds = [...new Set((deposits || []).map((deposit) => deposit.project_id))]; const { data: projects, error: projectError } = projectIds.length ? await supabase.from("projects").select("id,title").in("id", projectIds) : { data: [], error: null }; if (projectError) throw projectError; const titles = Object.fromEntries((projects || []).map((project) => [project.id, project.title])); return send(res, 200, { items: (deposits || []).map((deposit) => ({ ...deposit, project_title: titles[deposit.project_id] || "공구" })) }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/admin\/payments\/[^/]+\/confirm$/)) { return send(res, 410, { error: "PAYMENT_CONFIRMATION_REQUIRES_WEBHOOK" }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/payments") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; await releaseExpiredSlots(); const { data: projects, error: projectError } = await supabase.from("projects").select("id,title").eq("leader_id", seller.userId); if (projectError) throw projectError; const projectIds = (projects || []).map((project) => project.id); if (!projectIds.length) return send(res, 200, { items: [] }); let query = supabase.from("payments").select("id,project_id,order_id,user_id,amount,status,virtual_account,created_at").in("project_id", projectIds).order("created_at", { ascending: false }); const status = url.searchParams.get("status"); if (status) query = query.eq("status", status); const { data, error } = await query; if (error) throw error; const titles = Object.fromEntries((projects || []).map((project) => [project.id, project.title])); return send(res, 200, { items: (data || []).map((payment) => ({ ...payment, project_title: titles[payment.project_id] || "공구" })) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/orders") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; const { data: projects, error: projectError } = await supabase.from("projects").select("id,title").eq("leader_id", seller.userId); if (projectError) throw projectError; const projectIds = (projects || []).map((project) => project.id); if (!projectIds.length) return send(res, 200, { items: [] }); const { data: orders, error } = await supabase.from("orders").select("id,project_id,customer_id,status,total,shipping_info,created_at,order_items(*),payments(*)").in("project_id", projectIds).order("created_at", { ascending: false }); if (error) throw error; const titles = Object.fromEntries((projects || []).map((project) => [project.id, project.title])); return send(res, 200, { items: (orders || []).map((order) => ({ ...order, shipping_info: maskedShippingInfo(order.shipping_info), shipping_masked: true, project_title: titles[order.project_id] || "공구" })) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/projects") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; const { data, error } = await supabase.from("projects").select("id,title,status").eq("leader_id", seller.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/seller\/receipt-verifications\/[^/]+\/explanation$/)) { const seller = role(req, res, ["CUSTOMER", "SELLER"]); if (!seller) return; const input = await body(req); const { data, error } = await supabase.rpc("submit_receipt_explanation", { target_receipt_id: url.pathname.split("/")[5], target_uploader_id: seller.userId, target_explanation: input.explanation || "" }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, { verification: data }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/seller\/projects\/[^/]+\/start-packing$/)) { const seller = role(req, res, ["SELLER"]); if (!seller) return; const { data, error } = await supabase.rpc("start_project_packing", { target_project_id: url.pathname.split("/")[5], target_leader_id: seller.userId }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, { project: data }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/seller\/projects\/[^/]+\/allocate$/)) { const seller = role(req, res, ["SELLER"]); if (!seller) return; const projectId = url.pathname.split("/")[5]; const input = await body(req); if (!input.inventory || typeof input.inventory !== "object" || Array.isArray(input.inventory) || !input.evidence_url) return send(res, 400, { error: "INVALID_ALLOCATION_INPUT" }); const { data, error } = await supabase.rpc("allocate_project_preferences", { target_project_id: projectId, target_leader_id: seller.userId, target_inventory: input.inventory, target_evidence_url: input.evidence_url }); if (error) return send(res, 409, { error: error.message }); const { data: logs, error: logError } = await supabase.from("allocation_logs").select("order_id,participant_id,assigned_member,preference_rank,outcome,refund_amount,created_at").eq("project_id", projectId).order("created_at"); if (logError) throw logError; return send(res, data.replayed ? 200 : 201, { ...data, items: logs || [] }); }
    if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/seller\/projects\/[^/]+\/packing-list$/)) { const seller = role(req, res, ["SELLER"]); if (!seller) return; const projectId = url.pathname.split("/")[5]; const project = await getOne("projects", projectId); if (!project || project.leader_id !== seller.userId) return send(res, 403, { error: "PROJECT_ACCESS_FORBIDDEN" }); if (!["PACKING", "ALLOCATED"].includes(project.status)) return send(res, 409, { error: "PACKING_LIST_LOCKED" }); const { data, error } = await supabase.from("orders").select("id,customer_id,total,shipping_info,order_items(member_name,assigned_member,title)").eq("project_id", projectId).in("status", ["PAYMENT_CONFIRMED", "ALLOCATED"]).order("created_at"); if (error) throw error; return send(res, 200, { project: { id: project.id, title: project.title, status: project.status }, items: data || [] }); }
    if (req.method === "POST" && url.pathname === "/api/v1/seller/shipments") { const seller = role(req, res, ["SELLER"]); if (!seller) return; const input = await body(req); if (!input.project_id || !input.carrier || !input.tracking_number) return send(res, 400, { error: "INVALID_SHIPMENT" }); const project = await getOne("projects", input.project_id); if (!project || project.leader_id !== seller.userId) return send(res, 403, { error: "PROJECT_ACCESS_FORBIDDEN" }); if (project.status !== "ALLOCATED") return send(res, 409, { error: "PROJECT_NOT_ALLOCATED" }); const { data: shipment, error } = await supabase.from("shipments").upsert({ project_id: project.id, carrier: input.carrier.trim(), tracking_number: input.tracking_number.trim(), shipped_at: new Date().toISOString() }).select().single(); if (error) throw error; const { error: projectError } = await supabase.from("projects").update({ status: "SHIPPED" }).eq("id", project.id).eq("status", "ALLOCATED"); if (projectError) throw projectError; const { error: orderError } = await supabase.from("orders").update({ status: "SHIPPED" }).eq("project_id", project.id).eq("status", "ALLOCATED"); if (orderError) throw orderError; return send(res, 200, { shipment }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/customer\/orders\/[^/]+\/confirm-receipt$/)) { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.rpc("confirm_order_receipt", { target_order_id: url.pathname.split("/")[5], target_customer_id: customer.userId }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, data); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/seller\/projects\/[^/]+\/settle$/)) { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; const projectId = url.pathname.split("/")[5]; const project = await getOne("projects", projectId); if (!project || project.leader_id !== seller.userId) return send(res, 403, { error: "PROJECT_ACCESS_FORBIDDEN" }); const { data, error } = await supabase.rpc("finalize_project_settlement", { target_project_id: projectId }); if (error) throw error; return send(res, data.settled ? 200 : 409, data); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/payments\/[^/]+\/confirm$/)) { return send(res, 410, { error: "PAYMENT_CONFIRMATION_REQUIRES_WEBHOOK" }); }
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
        if (projectId) { const uploader = role(req, res, ["CUSTOMER", "SELLER"]); if (!uploader) return; verification = await recordReceiptVerification(projectId, uploader.userId, receipt_fields, rawText); }
        return send(res, 200, { extracted_text: rawText, kind, receipt_fields, verification });
      }
      if (kind === "waybill") {
        const waybill_fields = await parseWaybillFields(rawText);
        const matching = projectId ? await matchWaybillRows(projectId, waybill_fields.rows) : null;
        return send(res, 200, { extracted_text: rawText, kind, waybill_fields, matching });
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
      if (!input.image && !String(input.text || "").trim()) return send(res, 400, { error: "DOCUMENT_CONTENT_REQUIRED" });
      const text = input.image ? await extractDocumentText(input.image) : String(input.text).trim();
      if (input.kind === "receipt") {
        const receipt_fields = await parseReceiptFields(text);
        let verification = null;
        if (input.project_id) { const uploader = role(req, res, ["CUSTOMER", "SELLER"]); if (!uploader) return; verification = await recordReceiptVerification(input.project_id, uploader.userId, receipt_fields, text); }
        return send(res, 200, { extracted_text: text, kind: input.kind, receipt_fields, verification });
      }
      if (input.kind === "waybill") {
        const waybill_fields = await parseWaybillFields(text);
        const matching = input.project_id ? await matchWaybillRows(input.project_id, waybill_fields.rows) : null;
        return send(res, 200, { extracted_text: text, kind: input.kind, waybill_fields, matching });
      }
      const parsed = await parseWithUpstage("https://x.com/document-upload", text);
      return send(res, 200, { ...parsed, extracted_text: text });
    }
    if (req.method === "POST" && url.pathname === "/api/projects/pricing/recommend") { const input = await body(req); return send(res, 200, { total_cost: input.total_cost, prices: recommendPrices(input.total_cost, input.members_weights) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/search") { let query = supabase.from("products").select("*").eq("status", "ACTIVE"); const keyword = url.searchParams.get("keyword"); const category = url.searchParams.get("category"); if (category) query = query.eq("category", category); if (keyword) { const filters = expandSearchTerms(keyword).flatMap((term) => { const safe = escapeIlike(term); return [`title.ilike.%${safe}%`, `category.ilike.%${safe}%`, `description.ilike.%${safe}%`]; }); query = query.or(filters.join(",")); } const sort = url.searchParams.get("sort_by") || "popular"; query = sort === "price" ? query.order("price") : sort === "deadline" ? query.order("deadline", { ascending: true, nullsFirst: false }) : query.order("popularity", { ascending: false }); const { data, error } = await query; if (error) throw error; return send(res, 200, paging(data || [], url)); }
    if (req.method === "GET" && url.pathname === "/api/v1/recommendations") { const user = role(req, res, ["CUSTOMER"]); if (!user) return; const { data: logs, error: logError } = await supabase.from("purchase_logs").select("category").eq("customer_id", user.userId); if (logError) throw logError; const categories = new Set((logs || []).map((log) => log.category)); const { data, error } = await supabase.from("products").select("*").eq("status", "ACTIVE").order("popularity", { ascending: false }); if (error) throw error; return send(res, 200, { items: (data || []).map((item) => ({ ...item, recommendation_score: item.popularity * .35 + (categories.has(item.category) ? 45 : 0) })).sort((a, b) => b.recommendation_score - a.recommendation_score).slice(0, 6) }); }
    if (req.method === "GET" && url.pathname === "/api/projects") { await releaseExpiredSlots(); let query = supabase.from("projects").select("*").eq("status", "RECRUITING").order("created_at", { ascending: false }); const group = url.searchParams.get("group") || url.searchParams.get("keyword"); const goods = url.searchParams.get("goods_type"); if (group) { const groupTerms = expandSearchTerms(group); query = groupTerms.length > 1 ? query.in("group_name", groupTerms) : query.eq("group_name", group); } if (goods) query = query.eq("goods_type", goods); const { data, error } = await query; if (error) throw error; const views = await Promise.all((data || []).map(projectView)); const member = url.searchParams.get("member"); const available = url.searchParams.get("available") === "true"; return send(res, 200, paging(views.filter((project) => (!available || project.available_slots > 0) && (!member || project.slots.some((slot) => slot.member_name === member && (!available || !slot.is_occupied)))), url)); }
    if (req.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+$/)) { await releaseExpiredSlots(); const project = await getOne("projects", url.pathname.split("/")[3]); if (!project) return send(res, 404, { error: "PROJECT_NOT_FOUND" }); return send(res, 200, await projectView(project)); }
    if (req.method === "POST" && url.pathname === "/api/projects") { const leader = role(req, res, ["CUSTOMER", "SELLER", "ADMIN"]); if (!leader) return; const input = await body(req); if (!input.group_name || !input.goods_type || !input.title || !Array.isArray(input.slots) || !input.slots.length || input.slots.some((slot) => !slot.member_name || !Number.isFinite(slot.price))) return send(res, 400, { error: "INVALID_PROJECT" }); const { data: project, error } = await supabase.from("projects").insert({ id: randomUUID(), leader_id: leader.userId, group_name: input.group_name, goods_type: input.goods_type, title: input.title, source_url: input.source_url || null, status: "DEPOSIT_PENDING", shipping_policy: input.shipping_policy || null, product_metadata: input.product_metadata || {} }).select().single(); if (error) throw error; const { error: slotError } = await supabase.from("project_slots").insert(input.slots.map((slot) => ({ id: randomUUID(), project_id: project.id, member_name: slot.member_name, price: slot.price }))); if (slotError) throw slotError; return send(res, 201, { project: await projectView(project) }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/slots\/[^/]+\/apply$/)) { return send(res, 410, { error: "USE_ATOMIC_PARTICIPATION_ENDPOINT" }); }
    if (req.method === "POST" && url.pathname === "/api/payments/charge") { return send(res, 410, { error: "USE_SERVER_CALCULATED_CHECKOUT" }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/shipment$/)) { return send(res, 410, { error: "USE_PACKING_SHIPMENT_ENDPOINT" }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/confirm$/)) { return send(res, 410, { error: "USE_ORDER_RECEIPT_ENDPOINT" }); }
    if (req.method === "POST" && url.pathname === "/api/v1/seller/products") { const seller = role(req, res, ["SELLER"]); if (!seller) return; const input = await body(req); const required = !input.title || !input.category || !input.description || !Number.isFinite(input.price) || !Number.isInteger(input.stock) || !Number.isInteger(input.shipping_days) || !Number.isInteger(input.min_participants); if (required) return send(res, 400, { error: "INVALID_PRODUCT" }); const { data, error } = await supabase.from("products").insert({ ...input, id: randomUUID(), seller_id: seller.userId, current_participants: 0, popularity: 0, status: "ACTIVE" }).select().single(); if (error) throw error; return send(res, 201, { product: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/cart/items") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); const { data: product, error } = await supabase.from("products").select("*").eq("id", input.product_id).eq("status", "ACTIVE").maybeSingle(); if (error) throw error; if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" }); if (input.project_id && !await getOne("projects", input.project_id)) return send(res, 404, { error: "PROJECT_NOT_FOUND" }); const picks = Array.isArray(input.picks) ? input.picks : []; if (product.members?.length && (picks.length !== 3 || picks.some((pick) => !product.members.includes(pick)) || new Set(picks).size !== 3)) return send(res, 400, { error: "INVALID_PICKS" }); const { error: insertError } = await supabase.from("cart_items").upsert({ customer_id: customer.userId, product_id: product.id, project_id: input.project_id || null, picks }, { onConflict: "customer_id,product_id" }); if (insertError) throw insertError; return send(res, 201, { cart_id: customer.userId, product_id: product.id, project_id: input.project_id || null }); }
    if (req.method === "GET" && url.pathname === "/api/v1/cart") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("cart_items").select("*, products(*)").eq("customer_id", customer.userId); if (error) throw error; const items = (data || []).map((item) => ({ product: item.products, project_id: item.project_id, picks: item.picks })); return send(res, 200, { items, total: items.reduce((sum, item) => sum + item.product.price, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/purchase-history") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("orders").select("*, order_items(*), payments(*), reviews(id,rating)").eq("customer_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/payment-history") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; await releaseMaturedEscrow(); const { data, error } = await supabase.from("payments").select("*").eq("user_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [] }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/compensations") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("project_compensations").select("id,project_id,amount,status,reason,created_at,paid_at").eq("recipient_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: data || [], total_pending: (data || []).filter((item) => item.status === "PENDING").reduce((sum, item) => sum + item.amount, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/customer/allocations") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const { data, error } = await supabase.from("allocation_logs").select("project_id,assigned_member,preference_rank,outcome,refund_amount,created_at,projects(title)").eq("participant_id", customer.userId).order("created_at", { ascending: false }); if (error) throw error; return send(res, 200, { items: (data || []).map((item) => ({ ...item, project_title: item.projects?.title || "공구", projects: undefined })) }); }
    if (req.method === "POST" && url.pathname === "/api/v1/account") { const user = identity(req); const input = await body(req); const encrypted = encryptedAccountValues(input.account, input.bank_name); const { data, error } = await supabase.from("payout_accounts").upsert({ user_id: user.userId, ...encrypted }).select("user_id,account_last4,bank_name").single(); if (error) throw error; return send(res, 200, { account: maskedAccount(data) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/account") { const user = identity(req); const { data, error } = await supabase.from("payout_accounts").select("user_id,account,account_ciphertext,account_last4,bank_name").eq("user_id", user.userId).maybeSingle(); if (error) throw error; const secured = await migrateLegacyPayoutAccount(data); return send(res, 200, { account: maskedAccount(secured) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/activity") { const user = identity(req); const [{ data: items, error }, { data: account, error: accountError }] = await Promise.all([supabase.from("activities").select("*").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(50), supabase.from("payout_accounts").select("user_id,account,account_ciphertext,account_last4,bank_name").eq("user_id", user.userId).maybeSingle()]); if (error || accountError) throw error || accountError; const securedAccount = await migrateLegacyPayoutAccount(account); return send(res, 200, { items: items || [], account: maskedAccount(securedAccount) }); }
    if (req.method === "POST" && url.pathname === "/api/v1/activity") { const user = identity(req); const input = await body(req); if (!["participation", "settlement", "notification", "dispute"].includes(input.type) || !input.message) return send(res, 400, { error: "INVALID_ACTIVITY" }); const { data, error } = await supabase.from("activities").insert({ user_id: user.userId, type: input.type, title: input.title || null, message: input.message }).select().single(); if (error) throw error; return send(res, 201, { activity: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/reports") { const user = role(req, res, ["CUSTOMER", "SELLER"]); if (!user) return; const input = await body(req); if (!["ORDER", "PROJECT"].includes(input.subject_type) || !input.subject_id || !input.reason) return send(res, 400, { error: "INVALID_REPORT" }); const { data, error } = await supabase.rpc("create_settlement_report", { target_reporter_id: user.userId, target_subject_type: input.subject_type, target_subject_id: input.subject_id, target_reason: input.reason, target_details: input.details || "" }); if (error) return send(res, 403, { error: error.message }); return send(res, 201, { report: data }); }
    if (req.method === "POST" && url.pathname === "/api/v1/reviews") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); if (!input.order_id || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || String(input.body || "").trim().length < 10) return send(res, 400, { error: "INVALID_REVIEW" }); const { data, error } = await supabase.rpc("create_verified_project_review", { target_customer_id: customer.userId, target_order_id: input.order_id, target_rating: input.rating, target_body: input.body }); if (error) return send(res, 409, { error: error.message }); return send(res, 201, data); }
    if (req.method === "GET" && url.pathname.startsWith("/api/v1/members/")) { const productId = url.pathname.split("/").pop(); const { data: product, error } = await supabase.from("products").select("members,member_limit").eq("id", productId).maybeSingle(); if (error) throw error; if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" }); const { data: counts, error: countError } = await supabase.from("member_selections").select("member_name,count").eq("product_id", productId); if (countError) throw countError; return send(res, 200, Object.fromEntries((product.members || []).map((member) => [member, { rank1: counts?.find((item) => item.member_name === member)?.count || 0, limit: product.member_limit || 20 }]))); }
    if (req.method === "POST" && url.pathname === "/api/v1/checkout") { const customer = role(req, res, ["CUSTOMER"]); if (!customer) return; const input = await body(req); const { data: cart, error } = await supabase.from("cart_items").select("*, products(*)").eq("customer_id", customer.userId); if (error) throw error; const selected = input.product_ids ? (cart || []).filter((item) => input.product_ids.includes(item.product_id)) : cart || []; if (!selected.length) return send(res, 400, { error: "EMPTY_CART" }); if (selected.some((item) => item.products.stock < 1)) return send(res, 409, { error: "OUT_OF_STOCK" }); const total = selected.reduce((sum, item) => sum + item.products.price, 0); const { data: order, error: orderError } = await supabase.from("orders").insert({ customer_id: customer.userId, status: "PAYMENT_HELD", total }).select().single(); if (orderError) throw orderError; const { error: itemError } = await supabase.from("order_items").insert(selected.map((item) => ({ order_id: order.id, product_id: item.product_id, title: item.products.title, price: item.products.price, picks: item.picks }))); if (itemError) throw itemError; const { data: payment, error: paymentError } = await supabase.from("payments").insert({ order_id: order.id, user_id: customer.userId, amount: total, currency: "KRW", provider: "MOCK_ESCROW", status: "HELD", escrow_due_at: new Date(Date.now() + 7 * 86400000).toISOString() }).select().single(); if (paymentError) throw paymentError; await supabase.from("cart_items").delete().eq("customer_id", customer.userId); return send(res, 201, { order, payment, is_demo: true }); }
      if (req.method === "POST" && url.pathname === "/api/v1/checkout-with-shipping") {
        const customer = role(req, res, ["CUSTOMER"]);
        if (!customer) return;
        const input = await body(req);
        const shipping = input.shipping || {};
        const requiredShipping = ["recipient_name", "phone", "postal_code", "address", "address_detail"];
        if (requiredShipping.some((field) => !String(shipping[field] || "").trim())) return send(res, 400, { error: "SHIPPING_INFO_REQUIRED" });
        const { data: cart, error } = await supabase.from("cart_items").select("*, products(*)").eq("customer_id", customer.userId);
        if (error) throw error;
        const selected = input.product_ids ? (cart || []).filter((item) => input.product_ids.includes(item.product_id)) : cart || [];
        if (!selected.length) return send(res, 400, { error: "EMPTY_CART" });
        if (selected.some((item) => item.products.stock < 1)) return send(res, 409, { error: "OUT_OF_STOCK" });
        const projectIds = [...new Set(selected.map((item) => item.project_id).filter(Boolean))];
        if (projectIds.length > 1) return send(res, 400, { error: "MULTIPLE_PROJECTS_NOT_SUPPORTED" });
        const projectId = projectIds[0] || null;
        const total = selected.reduce((sum, item) => sum + item.products.price, 0);
        const { data: order, error: orderError } = await supabase.from("orders").insert({ customer_id: customer.userId, project_id: projectId, status: "PAYMENT_PENDING", total, shipping_info: shipping }).select().single();
        if (orderError) throw orderError;
        const { error: itemError } = await supabase.from("order_items").insert(selected.map((item) => ({ order_id: order.id, product_id: item.product_id, title: item.products.title, price: item.products.price, picks: item.picks })));
        if (itemError) throw itemError;
        const paymentDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const virtualAccount = `3333-${order.id.replaceAll("-", "").slice(0, 10)}`;
        const { data: payment, error: paymentError } = await supabase.from("payments").insert({ order_id: order.id, project_id: projectId, user_id: customer.userId, amount: total, currency: "KRW", provider: "MOCK_VIRTUAL_ACCOUNT", status: "PENDING", virtual_account_bank: "국민은행", virtual_account: virtualAccount, payment_due_at: paymentDueAt, escrow_due_at: new Date(Date.now() + 7 * 86400000).toISOString() }).select().single();
        if (paymentError) throw paymentError;
        await supabase.from("cart_items").delete().eq("customer_id", customer.userId).in("product_id", selected.map((item) => item.product_id));
        return send(res, 201, { order, payment, is_demo: true });
      }
      if (req.method === "GET" && url.pathname.match(/^\/api\/v1\/payments\/[^/]+$/)) {
        const customer = role(req, res, ["CUSTOMER"]);
        if (!customer) return;
        await releaseExpiredSlots();
        const paymentId = url.pathname.split("/").pop();
        const { data: payment, error } = await supabase.from("payments").select("id,order_id,amount,status,virtual_account_bank,virtual_account,payment_due_at,created_at").eq("id", paymentId).eq("user_id", customer.userId).maybeSingle();
        if (error) throw error;
        if (!payment) return send(res, 404, { error: "PAYMENT_NOT_FOUND" });
        return send(res, 200, { payment });
      }
      if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/deposit$/)) { const leader = role(req, res, ["CUSTOMER", "SELLER", "ADMIN"]); if (!leader) return; const project = await getOne("projects", url.pathname.split("/")[3]); if (!project || project.leader_id !== leader.userId) return send(res, 404, { error: "PROJECT_NOT_FOUND" }); if (project.status !== "DEPOSIT_PENDING") return send(res, 409, { error: "PROJECT_NOT_AWAITING_DEPOSIT" }); const input = await body(req); const { data: slots, error: slotError } = await supabase.from("project_slots").select("price").eq("project_id", project.id); if (slotError) throw slotError; const expected = Math.ceil((slots || []).reduce((sum, slot) => sum + slot.price, 0) * 0.1); if (Number(input.amount) !== expected) return send(res, 400, { error: "INVALID_DEPOSIT_AMOUNT", expected_amount: expected }); const { data: payment, error: paymentError } = await supabase.from("payments").insert({ project_id: project.id, user_id: leader.userId, amount: expected, currency: "KRW", provider: "MOCK_ESCROW_DEPOSIT", status: "HELD" }).select().single(); if (paymentError) throw paymentError; const { data: deposit, error: depositError } = await supabase.from("project_deposits").upsert({ project_id: project.id, leader_id: leader.userId, amount: expected, status: "HELD", payment_id: payment.id }).select().single(); if (depositError) throw depositError; const { data: openedProject, error: projectError } = await supabase.from("projects").update({ status: "RECRUITING" }).eq("id", project.id).eq("status", "DEPOSIT_PENDING").select().single(); if (projectError) throw projectError; return send(res, 201, { deposit, payment, project: openedProject, is_demo: true }); }
      if (req.method === "POST" && url.pathname.match(/^\/api\/v1\/admin\/projects\/[^/]+\/forfeit-deposit$/)) { if (!role(req, res, ["ADMIN"])) return; const projectId = url.pathname.split("/")[5]; const input = await body(req); if (!String(input.reason || "").trim()) return send(res, 400, { error: "FORFEIT_REASON_REQUIRED" }); const { data, error } = await supabase.rpc("forfeit_project_deposit", { target_project_id: projectId, target_reason: input.reason.trim() }); if (error) return send(res, 409, { error: error.message }); return send(res, 200, { project_id: projectId, compensations: data || [], forfeited: true }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/analytics/sales") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; let query = supabase.from("products").select("*"); if (seller.role !== "ADMIN") query = query.eq("seller_id", seller.userId); const { data, error } = await query; if (error) throw error; return send(res, 200, { items: data || [], total_units: (data || []).reduce((sum, item) => sum + item.current_participants, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/payouts/monthly") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; await releaseMaturedEscrow(); let query = supabase.from("project_settlements").select("gross_amount,platform_fee,payout_amount,deposit_return_amount,created_at").gte("created_at", `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`); if (seller.role !== "ADMIN") query = query.eq("leader_id", seller.userId); const { data, error } = await query; if (error) throw error; return send(res, 200, { month: new Date().toISOString().slice(0, 7), gross: (data || []).reduce((sum, item) => sum + item.gross_amount, 0), platform_fee: (data || []).reduce((sum, item) => sum + item.platform_fee, 0), estimated_payout: (data || []).reduce((sum, item) => sum + item.payout_amount, 0), deposit_return: (data || []).reduce((sum, item) => sum + item.deposit_return_amount, 0) }); }
    if (req.method === "GET" && url.pathname === "/api/v1/seller/reviews") { const seller = role(req, res, ["SELLER", "ADMIN"]); if (!seller) return; let query = supabase.from("reviews").select("id,project_id,order_id,leader_id,customer_id,rating,body,verified_purchase,created_at").eq("verified_purchase", true).order("created_at", { ascending: false }); if (seller.role !== "ADMIN") query = query.eq("leader_id", seller.userId); const { data, error } = await query; if (error) throw error; const { data: reputation, error: reputationError } = seller.role === "ADMIN" ? { data: null, error: null } : await supabase.from("users").select("trust_score,verified_review_count").eq("id", seller.userId).maybeSingle(); if (reputationError) throw reputationError; return send(res, 200, { items: data || [], reputation }); }
    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/participate$/)) {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const projectId = url.pathname.split("/")[3];
      const input = await body(req);
      const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) return send(res, 400, { error: "INVALID_IDEMPOTENCY_KEY" });
      const shipping = input.shipping || {};
      const requiredShipping = ["recipient_name", "phone", "postal_code", "address", "address_detail"];
      if (requiredShipping.some((field) => !String(shipping[field] || "").trim())) return send(res, 400, { error: "SHIPPING_INFO_REQUIRED" });
      const preferences = Array.isArray(input.preferences) ? input.preferences : [];
      const { data, error } = await supabase.rpc("create_project_participation", {
        target_project_id: projectId,
        target_user_id: customer.userId,
        target_preferences: preferences,
        target_shipping: shipping,
        target_idempotency_key: idempotencyKey
      });
      if (error) return send(res, error.message.includes("NO_AVAILABLE_SLOT") || error.message.includes("PROJECT_NOT_RECRUITING") ? 409 : 400, { error: error.message });
      return send(res, data.replayed ? 200 : 201, { ...data, is_demo: true });
    }
    return send(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    return send(
      res,
      error.status || (error.message === "INVALID_JSON" || error.message?.startsWith("INVALID_") ? 400 : 500),
      { error: error.message || "INTERNAL_ERROR" }
    );
  }
};

module.exports = handler;

if (require.main === module) {
  const { createServer } = require("node:http");
  const port = process.env.PORT || 3000;
  createServer(handler).listen(port, () =>
    console.log(`Group-buying API listening on http://localhost:${port}`)
  );
}
