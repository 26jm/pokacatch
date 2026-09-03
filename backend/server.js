import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// 1. 환경 변수 매칭 (SUPABASE_ANON_KEY로 수정 완료)
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL과 SUPABASE_ANON_KEY 환경 변수가 필요합니다.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper 함수
const send = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Demo-Role, X-Demo-User",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  });
  res.end(JSON.stringify(body));
};

const body = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
  });

const identity = (req) => ({
  role: req.headers["x-demo-role"] || "CUSTOMER",
  userId: req.headers["x-demo-user"] || "customer-1",
});

function role(req, res, allowed) {
  const user = identity(req);
  if (!allowed.includes(user.role)) {
    send(res, 403, { error: "FORBIDDEN" });
    return null;
  }
  return user;
}

function paging(items, url) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 12)));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: items.length,
  };
}

async function projectView(project) {
  const { data, error } = await supabase
    .from("project_slots")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at");
  if (error) throw error;
  const slots = data || [];
  return {
    ...project,
    slots,
    total_slots: slots.length,
    available_slots: slots.filter((slot) => !slot.is_occupied).length,
  };
}

function parseTwitter(url, text = "") {
  const parsed = new URL(url);
  if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(parsed.hostname))
    throw new Error("INVALID_TWITTER_URL");
  const handle = parsed.pathname.split("/").filter(Boolean)[0];
  return {
    source_url: parsed.toString(),
    twitter_handle: handle ? `@${handle}` : null,
    raw_text: text,
    parsed_fields: { group_name: null, goods_type: null, store_name: null },
  };
}

function recommendPrices(total, weights) {
  const entries = Object.entries(weights || {});
  const average =
    entries.reduce((sum, [, value]) => sum + Number(value), 0) / entries.length;
  if (!entries.length || !Number.isFinite(total) || total < 0 || average <= 0)
    throw new Error("INVALID_PRICING_INPUT");
  const prices = Object.fromEntries(
    entries.map(([member, value]) => [
      member,
      Math.round(((total / entries.length) * Number(value)) / average / 100) * 100,
    ])
  );
  const highest = entries.sort(([, a], [, b]) => b - a)[0][0];
  prices[highest] += total - Object.values(prices).reduce((sum, value) => sum + value, 0);
  return prices;
}

async function getOne(table, id) {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// 2. 서버 핸들러 정의
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, "http://localhost:3000");

  try {
    // [핵심 해결 1] 404 방지용 기본 메인 루트 핸들러
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, { message: "Poka-Catch Backend API is running!" });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const { error } = await supabase.from("users").select("id", { head: true });
      if (error) throw error;
      return send(res, 200, { ok: true, database: "supabase" });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/auth/register") {
      const input = await body(req);
      if (
        !input.email ||
        !input.password ||
        !["CUSTOMER", "SELLER"].includes(input.role || "CUSTOMER")
      )
        return send(res, 400, { error: "INVALID_REGISTRATION" });
      const user = {
        id: `${(input.role || "CUSTOMER").toLowerCase()}-${randomUUID()}`,
        email: input.email,
        password_hash: input.password,
        role: input.role || "CUSTOMER",
        twitter_handle: input.twitter_handle || null,
      };
      const { data, error } = await supabase
        .from("users")
        .insert(user)
        .select("id,email,role,twitter_handle")
        .single();
      if (error)
        return send(
          res,
          error.code === "23505" ? 409 : 400,
          { error: error.code === "23505" ? "EMAIL_ALREADY_EXISTS" : "INVALID_REGISTRATION" }
        );
      return send(res, 201, { user: data, token: `demo-token-${data.id}` });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      const input = await body(req);
      const { data, error } = await supabase
        .from("users")
        .select("id,email,role,twitter_handle")
        .eq("email", input.email)
        .eq("password_hash", input.password)
        .maybeSingle();
      if (error) throw error;
      if (!data) return send(res, 401, { error: "INVALID_CREDENTIALS" });
      return send(res, 200, { user: data, token: `demo-token-${data.id}` });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/twitter/parse") {
      const input = await body(req);
      return send(res, 200, parseTwitter(input.url, input.text));
    }

    if (req.method === "POST" && url.pathname === "/api/projects/pricing/recommend") {
      const input = await body(req);
      return send(
        res,
        200,
        { total_cost: input.total_cost, prices: recommendPrices(input.total_cost, input.members_weights) }
      );
    }

    if (req.method === "GET" && url.pathname === "/api/v1/search") {
      let query = supabase.from("products").select("*").eq("status", "ACTIVE");
      const keyword = url.searchParams.get("keyword");
      const category = url.searchParams.get("category");
      if (category) query = query.eq("category", category);
      if (keyword)
        query = query.or(
          `title.ilike.%${keyword}%,category.ilike.%${keyword}%,description.ilike.%${keyword}%`
        );
      const sort = url.searchParams.get("sort_by") || "popular";
      query =
        sort === "price"
          ? query.order("price")
          : sort === "deadline"
          ? query.order("deadline", { ascending: true, nullsFirst: false })
          : query.order("popularity", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return send(res, 200, paging(data || [], url));
    }

    if (req.method === "GET" && url.pathname === "/api/v1/recommendations") {
      const user = role(req, res, ["CUSTOMER"]);
      if (!user) return;
      const { data: logs, error: logError } = await supabase
        .from("purchase_logs")
        .select("category")
        .eq("customer_id", user.userId);
      if (logError) throw logError;
      const categories = new Set((logs || []).map((log) => log.category));
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("status", "ACTIVE")
        .order("popularity", { ascending: false });
      if (error) throw error;
      return send(res, 200, {
        items: (data || [])
          .map((item) => ({
            ...item,
            recommendation_score:
              item.popularity * 0.35 + (categories.has(item.category) ? 45 : 0),
          }))
          .sort((a, b) => b.recommendation_score - a.recommendation_score)
          .slice(0, 6),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
      const group = url.searchParams.get("group");
      const goods = url.searchParams.get("goods_type");
      if (group) query = query.eq("group_name", group);
      if (goods) query = query.eq("goods_type", goods);
      const { data, error } = await query;
      if (error) throw error;
      const views = await Promise.all((data || []).map(projectView));
      const member = url.searchParams.get("member");
      const available = url.searchParams.get("available") === "true";
      return send(
        res,
        200,
        paging(
          views.filter(
            (project) =>
              (!available || project.available_slots > 0) &&
              (!member ||
                project.slots.some(
                  (slot) => slot.member_name === member && (!available || !slot.is_occupied)
                ))
          ),
          url
        )
      );
    }

    if (req.method === "GET" && url.pathname.match(/^\/api\/projects\/[^/]+$/)) {
      const project = await getOne("projects", url.pathname.split("/")[3]);
      if (!project) return send(res, 404, { error: "PROJECT_NOT_FOUND" });
      return send(res, 200, await projectView(project));
    }

    if (req.method === "POST" && url.pathname === "/api/projects") {
      const leader = role(req, res, ["SELLER"]);
      if (!leader) return;
      const input = await body(req);
      if (
        !input.group_name ||
        !input.goods_type ||
        !Array.isArray(input.slots) ||
        !input.slots.length ||
        input.slots.some((slot) => !slot.member_name || !Number.isFinite(slot.price))
      )
        return send(res, 400, { error: "INVALID_PROJECT" });
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          id: randomUUID(),
          leader_id: leader.userId,
          group_name: input.group_name,
          goods_type: input.goods_type,
          title: input.title || `${input.group_name} ${input.goods_type} 분철`,
          source_url: input.source_url || null,
          shipping_policy: input.shipping_policy || null,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: slotError } = await supabase.from("project_slots").insert(
        input.slots.map((slot) => ({
          id: randomUUID(),
          project_id: project.id,
          member_name: slot.member_name,
          price: slot.price,
        }))
      );
      if (slotError) throw slotError;
      return send(res, 201, { project: await projectView(project) });
    }

    if (
      req.method === "POST" &&
      url.pathname.match(/^\/api\/projects\/[^/]+\/slots\/[^/]+\/apply$/)
    ) {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const parts = url.pathname.split("/");
      const { data, error } = await supabase.rpc("apply_project_slot", {
        target_slot_id: parts[5],
        target_user_id: customer.userId,
      });
      if (error) return send(res, 409, { error: error.message });
      const project = await getOne("projects", parts[3]);
      return send(res, 201, { project: await projectView(project), slot: data });
    }

    if (req.method === "POST" && url.pathname === "/api/payments/charge") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const input = await body(req);
      const { data: slot, error } = await supabase
        .from("project_slots")
        .select("*")
        .eq("id", input.slot_id)
        .eq("project_id", input.project_id)
        .eq("participant_id", customer.userId)
        .maybeSingle();
      if (error) throw error;
      if (!slot) return send(res, 404, { error: "APPLICATION_NOT_FOUND" });
      const { data, error: paymentError } = await supabase
        .from("payments")
        .insert({
          id: randomUUID(),
          project_id: input.project_id,
          slot_id: slot.id,
          user_id: customer.userId,
          amount: slot.price,
          currency: "KRW",
          provider: "ESCROW_ADAPTER",
          status: "PAID",
        })
        .select()
        .single();
      if (paymentError) throw paymentError;
      return send(res, 201, { payment: data });
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/shipment$/)) {
      const leader = role(req, res, ["SELLER"]);
      if (!leader) return;
      const project = await getOne("projects", url.pathname.split("/")[3]);
      const input = await body(req);
      if (!project || project.leader_id !== leader.userId || !input.carrier || !input.tracking_number)
        return send(res, 400, { error: "INVALID_SHIPMENT" });
      const { error } = await supabase
        .from("shipments")
        .upsert({ project_id: project.id, carrier: input.carrier, tracking_number: input.tracking_number });
      if (error) throw error;
      const { data, error: updateError } = await supabase
        .from("projects")
        .update({ status: "SHIPPED" })
        .eq("id", project.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return send(res, 200, { project: await projectView(data) });
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/projects\/[^/]+\/confirm$/)) {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const { data, error } = await supabase
        .from("payments")
        .update({ status: "RELEASED", released_at: new Date().toISOString() })
        .eq("project_id", url.pathname.split("/")[3])
        .eq("user_id", customer.userId)
        .eq("status", "PAID")
        .select();
      if (error) throw error;
      if (!data?.length) return send(res, 404, { error: "PAYMENT_NOT_FOUND" });
      return send(res, 200, { payments: data });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/seller/products") {
      const seller = role(req, res, ["SELLER"]);
      if (!seller) return;
      const input = await body(req);
      const required =
        !input.title ||
        !input.category ||
        !input.description ||
        !Number.isFinite(input.price) ||
        !Number.isInteger(input.stock) ||
        !Number.isInteger(input.shipping_days) ||
        !Number.isInteger(input.min_participants);
      if (required) return send(res, 400, { error: "INVALID_PRODUCT" });
      const { data, error } = await supabase
        .from("products")
        .insert({
          ...input,
          id: randomUUID(),
          seller_id: seller.userId,
          current_participants: 0,
          popularity: 0,
          status: "ACTIVE",
        })
        .select()
        .single();
      if (error) throw error;
      return send(res, 201, { product: data });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/cart/items") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const input = await body(req);
      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", input.product_id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (error) throw error;
      if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" });
      const picks = Array.isArray(input.picks) ? input.picks : [];
      if (
        product.members?.length &&
        (picks.length !== 3 ||
          picks.some((pick) => !product.members.includes(pick)) ||
          new Set(picks).size !== 3)
      )
        return send(res, 400, { error: "INVALID_PICKS" });
      const { error: insertError } = await supabase.from("cart_items").upsert(
        { customer_id: customer.userId, product_id: product.id, picks },
        { onConflict: "customer_id,product_id" }
      );
      if (insertError) throw insertError;
      return send(res, 201, { cart_id: customer.userId, product_id: product.id });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/cart") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const { data, error } = await supabase
        .from("cart_items")
        .select("*, products(*)")
        .eq("customer_id", customer.userId);
      if (error) throw error;
      const items = (data || []).map((item) => ({ product: item.products, picks: item.picks }));
      return send(res, 200, { items, total: items.reduce((sum, item) => sum + item.product.price, 0) });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/customer/purchase-history") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*), payments(*)")
        .eq("customer_id", customer.userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return send(res, 200, { items: data || [] });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/customer/payment-history") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", customer.userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return send(res, 200, { items: data || [] });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/reviews") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const input = await body(req);
      if (
        !input.product_id ||
        !Number.isInteger(input.rating) ||
        input.rating < 1 ||
        input.rating > 5 ||
        !input.body
      )
        return send(res, 400, { error: "INVALID_REVIEW" });
      const { data, error } = await supabase
        .from("reviews")
        .insert({
          product_id: input.product_id,
          customer_id: customer.userId,
          rating: input.rating,
          body: input.body,
        })
        .select()
        .single();
      if (error) throw error;
      return send(res, 201, { review: data });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/v1/members/")) {
      const productId = url.pathname.split("/").pop();
      const { data: product, error } = await supabase
        .from("products")
        .select("members,member_limit")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      if (!product) return send(res, 404, { error: "PRODUCT_NOT_FOUND" });
      const { data: counts, error: countError } = await supabase
        .from("member_selections")
        .select("member_name,count")
        .eq("product_id", productId);
      if (countError) throw countError;
      return send(
        res,
        200,
        Object.fromEntries(
          (product.members || []).map((member) => [
            member,
            {
              rank1: counts?.find((item) => item.member_name === member)?.count || 0,
              limit: product.member_limit || 20,
            },
          ])
        )
      );
    }

    if (req.method === "POST" && url.pathname === "/api/v1/checkout") {
      const customer = role(req, res, ["CUSTOMER"]);
      if (!customer) return;
      const input = await body(req);
      const { data: cart, error } = await supabase
        .from("cart_items")
        .select("*, products(*)")
        .eq("customer_id", customer.userId);
      if (error) throw error;
      const selected = input.product_ids
        ? (cart || []).filter((item) => input.product_ids.includes(item.product_id))
        : cart || [];
      if (!selected.length) return send(res, 400, { error: "EMPTY_CART" });
      if (selected.some((item) => item.products.stock < 1))
        return send(res, 409, { error: "OUT_OF_STOCK" });
      const total = selected.reduce((sum, item) => sum + item.products.price, 0);
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({ customer_id: customer.userId, status: "PAID", total })
        .select()
        .single();
      if (orderError) throw orderError;
      const { error: itemError } = await supabase.from("order_items").insert(
        selected.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          title: item.products.title,
          price: item.products.price,
          picks: item.picks,
        }))
      );
      if (itemError) throw itemError;
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          order_id: order.id,
          user_id: customer.userId,
          amount: total,
          currency: "KRW",
          provider: "STRIPE_ADAPTER",
          status: "SUCCEEDED",
        })
        .select()
        .single();
      if (paymentError) throw paymentError;
      for (const item of selected) {
        const { error: updateError } = await supabase
          .from("products")
          .update({
            stock: item.products.stock - 1,
            current_participants: item.products.current_participants + 1,
          })
          .eq("id", item.product_id);
        if (updateError) throw updateError;
        const firstPick = item.picks?.[0];
        if (firstPick) {
          const { data: current } = await supabase
            .from("member_selections")
            .select("count")
            .eq("product_id", item.product_id)
            .eq("member_name", firstPick)
            .maybeSingle();
          const { error: countError } = await supabase.from("member_selections").upsert({
            product_id: item.product_id,
            member_name: firstPick,
            count: (current?.count || 0) + 1,
          });
          if (countError) throw countError;
        }
        const { error: logError } = await supabase.from("purchase_logs").insert({
          order_id: order.id,
          customer_id: customer.userId,
          product_id: item.product_id,
          category: item.products.category,
        });
        if (logError) throw logError;
      }
      await supabase.from("cart_items").delete().eq("customer_id", customer.userId);
      return send(res, 201, { order: { ...order, payment_id: payment.id } });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/seller/analytics/sales") {
      const seller = role(req, res, ["SELLER", "ADMIN"]);
      if (!seller) return;
      let query = supabase.from("products").select("*");
      if (seller.role !== "ADMIN") query = query.eq("seller_id", seller.userId);
      const { data, error } = await query;
      if (error) throw error;
      return send(res, 200, {
        items: data || [],
        total_units: (data || []).reduce((sum, item) => sum + item.current_participants, 0),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/seller/payouts/monthly") {
      const seller = role(req, res, ["SELLER", "ADMIN"]);
      if (!seller) return;
      const { data, error } = await supabase
        .from("payments")
        .select("amount,products!inner(seller_id)")
        .eq("status", "RELEASED");
      if (error) throw error;
      const rows =
        seller.role === "ADMIN"
          ? data || []
          : (data || []).filter((item) => item.products.seller_id === seller.userId);
      const gross = rows.reduce((sum, item) => sum + item.amount, 0);
      return send(res, 200, {
        month: new Date().toISOString().slice(0, 7),
        gross,
        platform_fee: Math.round(gross * 0.1),
        estimated_payout: Math.round(gross * 0.9),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/seller/reviews") {
      const seller = role(req, res, ["SELLER", "ADMIN"]);
      if (!seller) return;
      const { data, error } = await supabase.from("reviews").select("*, products!inner(seller_id)");
      if (error) throw error;
      return send(res, 200, {
        items:
          seller.role === "ADMIN"
            ? data || []
            : (data || []).filter((review) => review.products.seller_id === seller.userId),
      });
    }

    return send(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    return send(
      res,
      error.message === "INVALID_JSON" || error.message?.startsWith("INVALID_") ? 400 : 500,
      { error: error.message || "INTERNAL_ERROR" }
    );
  }
});

// [핵심 해결 2] Vercel 서버리스 배포용 내보내기
export default server;

if (process.env.NODE_ENV !== "production") {
  server.listen(process.env.PORT || 3000, () =>
    console.log("Group-buying API listening on http://localhost:3000")
  );
}
