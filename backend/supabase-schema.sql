 create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists users (
  id text primary key, email text not null unique, password_hash text not null,
  role text not null check (role in ('CUSTOMER', 'SELLER', 'ADMIN')),
  twitter_handle text, full_name text not null, phone text not null, created_at timestamptz not null default now()
);
alter table users add column if not exists full_name text;
alter table users add column if not exists phone text;
alter table users add column if not exists birth_date date;
alter table users add column if not exists postal_code text;
alter table users add column if not exists address text;
alter table users add column if not exists address_detail text;
alter table users add column if not exists privacy_consented_at timestamptz;
alter table users add column if not exists deletion_requested_at timestamptz;
alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists password_changed_at timestamptz;
alter table users add column if not exists trust_score numeric(5,2) not null default 70;
alter table users add column if not exists verified_review_count integer not null default 0;
alter table users add column if not exists trust_updated_at timestamptz;
-- 회원가입 개편: 아이디(username), 마케팅 수신 동의, 소셜 로그인 연동 컬럼
alter table users add column if not exists username text;
create unique index if not exists users_username_unique on users(username) where username is not null;
alter table users add column if not exists marketing_consent boolean not null default false;
alter table users add column if not exists oauth_provider text;
alter table users add column if not exists oauth_id text;
create unique index if not exists users_oauth_unique on users(oauth_provider, oauth_id) where oauth_provider is not null;
-- 소셜 로그인 최초 가입 시 비밀번호/전화번호/이름이 없을 수 있으므로 NOT NULL 제약 완화
alter table users alter column password_hash drop not null;
alter table users alter column phone drop not null;
alter table users alter column full_name drop not null;
create table if not exists products (
  id text primary key, seller_id text not null references users(id), title text not null,
  category text not null, description text not null, tags jsonb not null default '[]', members jsonb not null default '[]',
  price integer not null check (price > 0), stock integer not null check (stock >= 0), shipping_days integer not null default 0,
  current_participants integer not null default 0, min_participants integer not null check (min_participants > 0),
  deadline date, popularity numeric not null default 0, member_limit integer, status text not null default 'ACTIVE', created_at timestamptz not null default now()
);
create table if not exists projects (
  id uuid primary key default gen_random_uuid(), leader_id text not null references users(id), group_name text not null,
  goods_type text not null, title text not null, source_url text, status text not null default 'RECRUITING', shipping_policy jsonb, product_metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table projects add column if not exists product_metadata jsonb not null default '{}';
alter table projects add column if not exists settlement_hold boolean not null default false;
alter table projects add column if not exists settled_at timestamptz;
create table if not exists project_slots (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  member_name text not null, price integer not null check (price >= 0), participant_id text references users(id),
  is_occupied boolean not null default false, occupied_at timestamptz, locked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table project_slots add column if not exists locked_at timestamptz;
create table if not exists cart_items (
  customer_id text not null references users(id) on delete cascade, product_id text not null references products(id), project_id uuid references projects(id),
  picks jsonb not null default '[]', created_at timestamptz not null default now(), primary key (customer_id, product_id)
);
alter table cart_items add column if not exists project_id uuid references projects(id);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(), customer_id text not null references users(id), project_id uuid references projects(id), status text not null,
  total integer not null check (total >= 0), shipping_info jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table orders add column if not exists project_id uuid references projects(id);
alter table orders add column if not exists shipping_info jsonb not null default '{}';
alter table orders add column if not exists settlement_hold boolean not null default false;
alter table orders add column if not exists receipt_confirmed_at timestamptz;
alter table orders add column if not exists auto_received_at timestamptz;
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id text not null references products(id), title text not null, price integer not null, picks jsonb not null default '[]'
);
alter table order_items alter column product_id drop not null;
alter table order_items add column if not exists project_id uuid references projects(id);
alter table order_items add column if not exists slot_id uuid references project_slots(id);
alter table order_items add column if not exists member_name text;
alter table order_items add column if not exists assigned_member text;
alter table order_items add column if not exists allocation_status text;
create table if not exists payments (
  id uuid primary key default gen_random_uuid(), order_id uuid references orders(id), project_id uuid references projects(id),
  slot_id uuid references project_slots(id), user_id text not null references users(id), amount integer not null check (amount >= 0),
  currency text not null default 'KRW', provider text not null, provider_payment_id text unique, status text not null,
  virtual_account_bank text, virtual_account text, payment_due_at timestamptz,
  created_at timestamptz not null default now(), released_at timestamptz, escrow_due_at timestamptz
);
alter table payments add column if not exists escrow_due_at timestamptz;
alter table payments add column if not exists virtual_account_bank text;
alter table payments add column if not exists virtual_account text;
alter table payments add column if not exists payment_due_at timestamptz;
alter table payments add column if not exists idempotency_key text;
alter table payments add column if not exists paid_at timestamptz;
create unique index if not exists payments_user_idempotency_unique
  on payments(user_id, idempotency_key) where idempotency_key is not null;
create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, event_id text not null,
  event_type text not null, payment_id uuid, provider_payment_id text,
  amount integer, payload_hash text not null, status text not null default 'PROCESSING'
    check (status in ('PROCESSING', 'PROCESSED', 'REJECTED')),
  result jsonb not null default '{}', received_at timestamptz not null default now(), processed_at timestamptz,
  unique (provider, event_id)
);
alter table payment_webhook_events drop constraint if exists payment_webhook_events_payment_id_fkey;
create table if not exists project_deposits (
  id uuid primary key default gen_random_uuid(), project_id uuid not null unique references projects(id) on delete cascade,
  leader_id text not null references users(id), amount integer not null check (amount > 0), status text not null default 'PENDING'
    check (status in ('PENDING', 'HELD', 'FORFEITED', 'REFUNDED')), payment_id uuid references payments(id),
  created_at timestamptz not null default now(), resolved_at timestamptz, resolution_reason text
);
alter table project_deposits add column if not exists resolution_reason text;
create table if not exists project_compensations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  deposit_id uuid not null references project_deposits(id) on delete cascade, recipient_id text not null references users(id),
  amount integer not null check (amount > 0), status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'CANCELLED')),
  reason text not null, created_at timestamptz not null default now(), paid_at timestamptz,
  unique (deposit_id, recipient_id)
);
create table if not exists project_settlements (
  id uuid primary key default gen_random_uuid(), project_id uuid not null unique references projects(id) on delete cascade,
  leader_id text not null references users(id), gross_amount integer not null check (gross_amount >= 0),
  platform_fee integer not null check (platform_fee >= 0), payout_amount integer not null check (payout_amount >= 0),
  deposit_return_amount integer not null default 0 check (deposit_return_amount >= 0),
  status text not null default 'READY' check (status in ('READY', 'PROCESSING', 'PAID', 'FAILED')),
  created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists project_openings (
  id uuid primary key default gen_random_uuid(), project_id uuid not null unique references projects(id) on delete cascade,
  leader_id text not null references users(id), inventory jsonb not null, remaining_inventory jsonb not null,
  evidence_url text not null, algorithm_version text not null default 'preference-v1',
  status text not null default 'FINALIZED' check (status in ('FINALIZED')),
  created_at timestamptz not null default now()
);
create table if not exists allocation_logs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  opening_id uuid not null references project_openings(id), order_id uuid not null unique references orders(id),
  participant_id text not null references users(id), assigned_member text, preference_rank integer check (preference_rank between 1 and 3),
  outcome text not null check (outcome in ('ASSIGNED', 'REFUNDED')), refund_amount integer not null default 0 check (refund_amount >= 0),
  algorithm_version text not null, created_at timestamptz not null default now()
);
create table if not exists refunds (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  order_id uuid not null unique references orders(id), payment_id uuid not null unique references payments(id),
  user_id text not null references users(id), amount integer not null check (amount > 0), reason text not null,
  provider text not null default 'MOCK_REFUND', status text not null default 'COMPLETED'
    check (status in ('READY', 'PROCESSING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists shipment_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  participant_id text references users(id), participant_name text not null, tracking_number text not null,
  carrier text, confidence numeric, source text not null default 'OCR', created_at timestamptz not null default now(),
  unique (project_id, participant_id, tracking_number)
);
create table if not exists purchase_logs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), customer_id text not null references users(id),
  product_id text not null references products(id), category text not null, recorded_at timestamptz not null default now()
);
create table if not exists member_selections (
  product_id text not null references products(id) on delete cascade, member_name text not null, count integer not null default 0,
  primary key (product_id, member_name)
);
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(), product_id text not null references products(id), customer_id text not null references users(id),
  rating integer not null check (rating between 1 and 5), body text not null, created_at timestamptz not null default now()
);
alter table reviews alter column product_id drop not null;
alter table reviews add column if not exists project_id uuid references projects(id) on delete cascade;
alter table reviews add column if not exists order_id uuid references orders(id) on delete cascade;
alter table reviews add column if not exists leader_id text references users(id);
alter table reviews add column if not exists verified_purchase boolean not null default false;
create unique index if not exists reviews_order_unique on reviews(order_id) where order_id is not null;
create table if not exists shipments (
  project_id uuid primary key references projects(id) on delete cascade, carrier text not null, tracking_number text not null,
  shipped_at timestamptz not null default now()
);
create table if not exists payout_accounts (
  user_id text primary key references users(id) on delete cascade, account text not null,
  updated_at timestamptz not null default now()
);
alter table payout_accounts alter column account drop not null;
alter table payout_accounts add column if not exists account_ciphertext text;
alter table payout_accounts add column if not exists account_iv text;
alter table payout_accounts add column if not exists account_auth_tag text;
alter table payout_accounts add column if not exists account_last4 text;
alter table payout_accounts add column if not exists bank_name text;
create table if not exists user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  phone text not null,
  postal_code text not null,
  address text not null,
  address_detail text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists user_addresses_one_default_idx
  on user_addresses(user_id) where is_default = true;
create index if not exists user_addresses_user_created_idx
  on user_addresses(user_id, is_default desc, created_at desc);
create table if not exists activities (
  id uuid primary key default gen_random_uuid(), user_id text not null references users(id) on delete cascade,
  type text not null check (type in ('participation', 'settlement', 'notification', 'dispute')),
  title text, message text not null, created_at timestamptz not null default now()
);
create table if not exists reports (
  id uuid primary key default gen_random_uuid(), reporter_id text not null references users(id),
  subject_type text not null check (subject_type in ('ORDER', 'PROJECT', 'USER')),
  subject_id text, reason text not null, details text, status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists receipt_verifications (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  uploader_id text not null references users(id), store_name text, order_datetime timestamptz, order_datetime_raw text,
  quantity integer, order_number text, order_number_normalized text, document_hash text not null,
  checks jsonb not null default '{}', status text not null
    check (status in ('VERIFIED', 'EXPLANATION_REQUIRED', 'EXPLANATION_SUBMITTED', 'APPROVED', 'REJECTED', 'EXPLANATION_EXPIRED')),
  explanation_due_at timestamptz, explanation text, explanation_submitted_at timestamptz,
  reviewed_by text references users(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);
create index if not exists receipt_order_number_idx on receipt_verifications(order_number_normalized);
create index if not exists receipt_explanation_due_idx on receipt_verifications(status, explanation_due_at);
create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(), user_id text not null references users(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_user_created_idx on password_reset_tokens(user_id, created_at desc);

create or replace function create_password_reset_request(target_email text, target_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_user users;
begin
  select * into target_user from users
  where lower(email) = lower(trim(target_email)) and deleted_at is null and password_hash is not null
  for update;
  if target_user.id is null then return false; end if;
  if exists (
    select 1 from password_reset_tokens where user_id = target_user.id and created_at > now() - interval '1 minute'
  ) then return false; end if;
  if (select count(*) from password_reset_tokens where user_id = target_user.id and created_at > now() - interval '1 hour') >= 5 then return false; end if;

  update password_reset_tokens set used_at = now()
  where user_id = target_user.id and used_at is null;
  insert into password_reset_tokens (user_id, token_hash, expires_at)
  values (target_user.id, target_token_hash, now() + interval '30 minutes');
  return true;
end; $$;

-- 수령한 배정 주문에 한해 주문당 한 번 후기를 만들고 총대 신뢰도를 갱신한다.
create or replace function create_verified_project_review(
  target_customer_id text,
  target_order_id uuid,
  target_rating integer,
  target_body text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_order orders;
  target_project projects;
  created_review reviews;
  review_average numeric;
  review_count integer;
  updated_trust numeric(5,2);
begin
  if target_rating not between 1 and 5 then raise exception 'INVALID_REVIEW_RATING'; end if;
  if length(trim(coalesce(target_body, ''))) < 10 or length(trim(target_body)) > 1000 then raise exception 'INVALID_REVIEW_BODY'; end if;

  select * into target_order from orders
  where id = target_order_id and customer_id = target_customer_id and status in ('RECEIVED', 'SETTLED')
  for update;
  if target_order.id is null then raise exception 'REVIEW_NOT_ELIGIBLE'; end if;
  if exists (select 1 from reviews where order_id = target_order_id) then raise exception 'REVIEW_ALREADY_EXISTS'; end if;
  if not exists (
    select 1 from payments where order_id = target_order_id and status in ('HELD', 'RELEASED')
  ) then raise exception 'REVIEW_PAYMENT_NOT_VERIFIED'; end if;
  if not exists (
    select 1 from allocation_logs where order_id = target_order_id and participant_id = target_customer_id and outcome = 'ASSIGNED'
  ) then raise exception 'REVIEW_ALLOCATION_NOT_VERIFIED'; end if;

  select * into target_project from projects where id = target_order.project_id;
  if target_project.id is null then raise exception 'REVIEW_PROJECT_NOT_FOUND'; end if;
  insert into reviews (product_id, project_id, order_id, leader_id, customer_id, rating, body, verified_purchase)
  values (null, target_project.id, target_order.id, target_project.leader_id, target_customer_id, target_rating, trim(target_body), true)
  returning * into created_review;

  select avg(rating), count(*) into review_average, review_count from reviews
  where leader_id = target_project.leader_id and verified_purchase = true;
  updated_trust := round((((review_average * review_count) + (3.5 * 5)) / (review_count + 5) * 20)::numeric, 2);
  update users set trust_score = updated_trust, verified_review_count = review_count, trust_updated_at = now()
  where id = target_project.leader_id;

  return jsonb_build_object('review', to_jsonb(created_review), 'leader_trust_score', updated_trust, 'verified_review_count', review_count);
end; $$;

create or replace function consume_password_reset_token(target_token_hash text, target_password_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare reset_token password_reset_tokens;
begin
  select * into reset_token from password_reset_tokens
  where token_hash = target_token_hash and used_at is null and expires_at > now()
  for update;
  if reset_token.id is null then return false; end if;

  update users set password_hash = target_password_hash, password_changed_at = now()
  where id = reset_token.user_id and deleted_at is null;
  if not found then return false; end if;
  update password_reset_tokens set used_at = now()
  where user_id = reset_token.user_id and used_at is null;
  return true;
end; $$;

create or replace function apply_project_slot(target_slot_id uuid, target_user_id text)
returns project_slots language plpgsql security definer as $$
declare updated_slot project_slots;
begin
  update project_slots set participant_id = target_user_id, is_occupied = true, occupied_at = now(), locked_at = now()
  where id = target_slot_id and is_occupied = false
    and exists (
      select 1 from projects where projects.id = project_slots.project_id and projects.status = 'RECRUITING'
    )
  returning * into updated_slot;
  if updated_slot.id is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  return updated_slot;
end; $$;

-- 슬롯 선점, 주문, 주문항목, 가상계좌 결제를 한 트랜잭션으로 생성한다.
create or replace function create_project_participation(
  target_project_id uuid,
  target_user_id text,
  target_preferences jsonb,
  target_shipping jsonb,
  target_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_project projects;
  selected_slot project_slots;
  created_order orders;
  created_payment payments;
  existing_payment payments;
  shipping_fee integer;
  payment_total integer;
begin
  if nullif(trim(target_idempotency_key), '') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id || ':' || target_idempotency_key, 0));

  select * into existing_payment from payments
  where user_id = target_user_id and idempotency_key = target_idempotency_key;
  if existing_payment.id is not null then
    select * into created_order from orders where id = existing_payment.order_id;
    select * into selected_slot from project_slots where id = existing_payment.slot_id;
    return jsonb_build_object('order', to_jsonb(created_order), 'payment', to_jsonb(existing_payment), 'slot', to_jsonb(selected_slot), 'replayed', true);
  end if;

  select * into target_project from projects
  where id = target_project_id and status = 'RECRUITING';
  if target_project.id is null then raise exception 'PROJECT_NOT_RECRUITING'; end if;

  select slot.* into selected_slot
  from project_slots slot
  where slot.project_id = target_project_id and slot.is_occupied = false
  order by coalesce((
    select min(preference.ordinality)
    from jsonb_array_elements_text(coalesce(target_preferences, '[]'::jsonb)) with ordinality preference(member_name, ordinality)
    where preference.member_name = slot.member_name
  ), 2147483647), slot.created_at
  for update skip locked
  limit 1;
  if selected_slot.id is null then raise exception 'NO_AVAILABLE_SLOT'; end if;

  update project_slots set participant_id = target_user_id, is_occupied = true, occupied_at = now(), locked_at = now()
  where id = selected_slot.id returning * into selected_slot;

  shipping_fee := greatest(coalesce((target_project.shipping_policy->>'fixed_fee')::integer, 0), 0);
  payment_total := selected_slot.price + shipping_fee;

  insert into orders (customer_id, project_id, status, total, shipping_info)
  values (target_user_id, target_project_id, 'PAYMENT_PENDING', payment_total, coalesce(target_shipping, '{}'::jsonb))
  returning * into created_order;

  insert into order_items (order_id, product_id, project_id, slot_id, member_name, title, price, picks)
  values (created_order.id, null, target_project_id, selected_slot.id, selected_slot.member_name, target_project.title, selected_slot.price, coalesce(target_preferences, '[]'::jsonb));

  insert into payments (
    order_id, project_id, slot_id, user_id, amount, currency, provider, status,
    virtual_account_bank, virtual_account, payment_due_at, escrow_due_at, idempotency_key
  ) values (
    created_order.id, target_project_id, selected_slot.id, target_user_id, payment_total, 'KRW', 'MOCK_VIRTUAL_ACCOUNT', 'PENDING',
    '국민은행', '3333-' || left(replace(created_order.id::text, '-', ''), 10), now() + interval '5 minutes',
    now() + interval '7 days', target_idempotency_key
  ) returning * into created_payment;

  return jsonb_build_object('order', to_jsonb(created_order), 'payment', to_jsonb(created_payment), 'slot', to_jsonb(selected_slot), 'replayed', false);
end; $$;

-- 5분간 결제가 완료되지 않은 결제와 주문을 만료시키고 선점 슬롯을 자동 해제한다.
create or replace function release_expired_project_slots()
returns void language plpgsql security definer set search_path = public as $$
begin
  update payments set status = 'EXPIRED'
  where status = 'PENDING' and slot_id is not null
    and payment_due_at <= now();

  update orders set status = 'EXPIRED'
  where status = 'PAYMENT_PENDING'
    and id in (select order_id from payments where status = 'EXPIRED' and order_id is not null);

  update project_slots set is_occupied = false, participant_id = null, occupied_at = null, locked_at = null
  where is_occupied = true
    and coalesce(locked_at, occupied_at) < now() - interval '5 minutes'
    and not exists (
      select 1 from payments
      where payments.slot_id = project_slots.id and payments.status in ('PAID', 'HELD', 'RELEASED')
    );
end; $$;

do $scheduler$
begin
  if not exists (select 1 from cron.job where jobname = 'release-expired-project-slots') then
    perform cron.schedule(
      'release-expired-project-slots',
      '* * * * *',
      $job$select public.release_expired_project_slots();$job$
    );
  end if;
end;
$scheduler$;

-- 주문 또는 공구 분쟁을 접수하면서 관련 정산을 즉시 보류한다.
create or replace function create_settlement_report(
  target_reporter_id text,
  target_subject_type text,
  target_subject_id text,
  target_reason text,
  target_details text
)
returns reports language plpgsql security definer set search_path = public as $$
declare
  created_report reports;
  affected_project_id uuid;
begin
  if target_subject_type = 'ORDER' then
    select target_order.project_id into affected_project_id from orders target_order
    left join projects project on project.id = target_order.project_id
    where target_order.id::text = target_subject_id
      and (target_order.customer_id = target_reporter_id or project.leader_id = target_reporter_id);
  elsif target_subject_type = 'PROJECT' then
    select project.id into affected_project_id from projects project
    where project.id::text = target_subject_id and (
      project.leader_id = target_reporter_id
      or exists (select 1 from orders where project_id = project.id and customer_id = target_reporter_id)
    );
  else
    raise exception 'INVALID_SETTLEMENT_REPORT_SUBJECT';
  end if;
  if affected_project_id is null then raise exception 'REPORT_SUBJECT_ACCESS_FORBIDDEN'; end if;
  perform 1 from projects where id = affected_project_id and status not in ('SETTLED', 'CANCELLED') for update;
  if not found then raise exception 'REPORT_NOT_ALLOWED_FOR_CLOSED_PROJECT'; end if;

  insert into reports (reporter_id, subject_type, subject_id, reason, details)
  values (target_reporter_id, target_subject_type, target_subject_id, trim(target_reason), nullif(trim(target_details), ''))
  returning * into created_report;
  update projects set settlement_hold = true where id = affected_project_id;
  update orders set settlement_hold = true where project_id = affected_project_id and status not in ('EXPIRED', 'CANCELLED', 'SETTLED');
  return created_report;
end; $$;

-- 관리자가 분쟁을 종결하면 같은 공구의 활성 분쟁이 없을 때만 정산 보류를 해제한다.
create or replace function resolve_settlement_report(target_report_id uuid, target_status text)
returns reports language plpgsql security definer set search_path = public as $$
declare
  updated_report reports;
  affected_project_id uuid;
begin
  if target_status not in ('OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED') then raise exception 'INVALID_REPORT_STATUS'; end if;
  update reports set status = target_status,
    resolved_at = case when target_status in ('RESOLVED', 'REJECTED') then now() else null end
  where id = target_report_id returning * into updated_report;
  if updated_report.id is null then raise exception 'REPORT_NOT_FOUND'; end if;

  if updated_report.subject_type = 'ORDER' then
    select project_id into affected_project_id from orders where id::text = updated_report.subject_id;
  elsif updated_report.subject_type = 'PROJECT' then
    select id into affected_project_id from projects where id::text = updated_report.subject_id;
  end if;

  if affected_project_id is not null then
    perform 1 from projects where id = affected_project_id for update;
  end if;
  if affected_project_id is not null and target_status in ('OPEN', 'REVIEWING') then
    update projects set settlement_hold = true where id = affected_project_id;
    update orders set settlement_hold = true where project_id = affected_project_id and status not in ('EXPIRED', 'CANCELLED', 'SETTLED');
  elsif affected_project_id is not null and not exists (
    select 1 from reports report where report.status in ('OPEN', 'REVIEWING') and (
      (report.subject_type = 'PROJECT' and report.subject_id = affected_project_id::text)
      or (report.subject_type = 'ORDER' and report.subject_id in (select id::text from orders where project_id = affected_project_id))
    )
  ) then
    update projects set settlement_hold = false where id = affected_project_id;
    update orders set settlement_hold = false where project_id = affected_project_id and status not in ('EXPIRED', 'CANCELLED', 'SETTLED');
  end if;
  return updated_report;
end; $$;

-- 구매자 수령 확인을 기록하고 전원 확인이 끝났으면 즉시 정산을 시도한다.
create or replace function confirm_order_receipt(target_order_id uuid, target_customer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  received_order orders;
  settlement_result jsonb;
begin
  update orders set status = 'RECEIVED', receipt_confirmed_at = now()
  where id = target_order_id and customer_id = target_customer_id and status = 'SHIPPED'
  returning * into received_order;
  if received_order.id is null then raise exception 'ORDER_NOT_READY_FOR_RECEIPT'; end if;
  settlement_result := finalize_project_settlement(received_order.project_id);
  return jsonb_build_object('order', to_jsonb(received_order), 'settlement', settlement_result);
end; $$;

-- 총대 본인 공구의 모든 활성 주문이 입금 완료된 경우에만 배송지 원문 사용 단계를 연다.
create or replace function start_project_packing(target_project_id uuid, target_leader_id text)
returns projects language plpgsql security definer set search_path = public as $$
declare
  target_project projects;
begin
  select * into target_project from projects where id = target_project_id for update;
  if target_project.id is null or target_project.leader_id <> target_leader_id then raise exception 'PROJECT_ACCESS_FORBIDDEN'; end if;
  if target_project.status = 'ALLOCATED' then return target_project; end if;
  if target_project.status not in ('RECRUITING', 'PACKING') then raise exception 'PROJECT_NOT_READY_FOR_PACKING'; end if;
  if not exists (
    select 1 from orders where project_id = target_project_id and status not in ('EXPIRED', 'CANCELLED')
  ) then raise exception 'NO_ACTIVE_ORDERS'; end if;
  if exists (
    select 1 from orders where project_id = target_project_id
      and status not in ('EXPIRED', 'CANCELLED', 'PAYMENT_CONFIRMED')
  ) then raise exception 'ALL_PAYMENTS_REQUIRED'; end if;
  if exists (
    select 1 from payments payment join orders target_order on target_order.id = payment.order_id
    where payment.project_id = target_project_id and target_order.status not in ('EXPIRED', 'CANCELLED') and payment.status <> 'HELD'
  ) then raise exception 'ALL_PAYMENTS_REQUIRED'; end if;

  update projects set status = 'PACKING' where id = target_project_id returning * into target_project;
  return target_project;
end; $$;

-- OCR 영수증의 주문번호 유일성, 판매처, 주문일시, 수량을 원자적으로 검증한다.
create or replace function record_receipt_verification(
  target_project_id uuid,
  target_uploader_id text,
  target_store_name text,
  target_store_match boolean,
  target_order_datetime timestamptz,
  target_order_datetime_raw text,
  target_quantity integer,
  target_order_number text,
  target_document_hash text
)
returns receipt_verifications language plpgsql security definer set search_path = public as $$
declare
  target_project projects;
  created_verification receipt_verifications;
  normalized_order_number text;
  unique_order_number boolean;
  valid_order_datetime boolean;
  valid_quantity boolean;
  required_quantity integer;
  verification_checks jsonb;
  verification_status text;
begin
  select * into target_project from projects where id = target_project_id for update;
  if target_project.id is null or target_project.leader_id <> target_uploader_id then raise exception 'PROJECT_ACCESS_FORBIDDEN'; end if;
  if target_project.status in ('CANCELLED', 'SETTLED') then raise exception 'PROJECT_CLOSED'; end if;

  normalized_order_number := upper(regexp_replace(coalesce(target_order_number, ''), '[^A-Za-z0-9]', '', 'g'));
  if normalized_order_number <> '' then
    perform pg_advisory_xact_lock(hashtextextended('receipt:' || normalized_order_number, 0));
  end if;
  unique_order_number := normalized_order_number <> '' and not exists (
    select 1 from receipt_verifications
    where order_number_normalized = normalized_order_number and status <> 'REJECTED'
  );
  valid_order_datetime := target_order_datetime is not null
    and target_order_datetime >= target_project.created_at - interval '1 day'
    and target_order_datetime <= now() + interval '5 minutes';
  required_quantity := greatest(coalesce((target_project.shipping_policy->>'quantity')::integer, 0), 0);
  valid_quantity := target_quantity is not null and target_quantity >= required_quantity and target_quantity > 0;
  verification_checks := jsonb_build_object(
    'unique_order_number', unique_order_number,
    'store_match', coalesce(target_store_match, false),
    'order_datetime_valid', valid_order_datetime,
    'quantity_match', valid_quantity,
    'required_quantity', required_quantity
  );
  verification_status := case
    when unique_order_number and coalesce(target_store_match, false) and valid_order_datetime and valid_quantity then 'VERIFIED'
    else 'EXPLANATION_REQUIRED'
  end;

  insert into receipt_verifications (
    project_id, uploader_id, store_name, order_datetime, order_datetime_raw, quantity,
    order_number, order_number_normalized, document_hash, checks, status, explanation_due_at
  ) values (
    target_project_id, target_uploader_id, nullif(trim(target_store_name), ''), target_order_datetime,
    nullif(trim(target_order_datetime_raw), ''), target_quantity, nullif(trim(target_order_number), ''),
    nullif(normalized_order_number, ''), target_document_hash, verification_checks, verification_status,
    case when verification_status = 'EXPLANATION_REQUIRED' then now() + interval '48 hours' else null end
  ) returning * into created_verification;

  if verification_status = 'EXPLANATION_REQUIRED' then
    update projects set settlement_hold = true where id = target_project_id;
    update orders set settlement_hold = true where project_id = target_project_id and status not in ('EXPIRED', 'CANCELLED', 'SETTLED');
  end if;
  return created_verification;
end; $$;

create or replace function prevent_allocation_log_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'ALLOCATION_LOG_IMMUTABLE';
end; $$;

drop trigger if exists allocation_logs_immutable on allocation_logs;
create trigger allocation_logs_immutable
before update or delete on allocation_logs
for each row execute function prevent_allocation_log_mutation();

-- 참여 순서대로 각 주문의 1·2·3지망을 적용하고 미배정자는 전액 자동 환불한다.
create or replace function allocate_project_preferences(
  target_project_id uuid,
  target_leader_id text,
  target_inventory jsonb,
  target_evidence_url text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_project projects;
  opening project_openings;
  candidate record;
  remaining_counts jsonb;
  chosen_member text;
  chosen_rank integer;
  assigned_count integer := 0;
  refunded_count integer := 0;
begin
  select * into target_project from projects where id = target_project_id for update;
  if target_project.id is null or target_project.leader_id <> target_leader_id then raise exception 'PROJECT_ACCESS_FORBIDDEN'; end if;
  select * into opening from project_openings where project_id = target_project_id;
  if opening.id is not null then
    return jsonb_build_object('opening', to_jsonb(opening), 'assigned_count', (select count(*) from allocation_logs where opening_id = opening.id and outcome = 'ASSIGNED'), 'refunded_count', (select count(*) from allocation_logs where opening_id = opening.id and outcome = 'REFUNDED'), 'replayed', true);
  end if;
  if target_project.status <> 'PACKING' then raise exception 'PROJECT_NOT_READY_FOR_ALLOCATION'; end if;
  if target_project.settlement_hold then raise exception 'PROJECT_ON_HOLD'; end if;
  if jsonb_typeof(target_inventory) <> 'object' or target_inventory = '{}'::jsonb then raise exception 'INVALID_OPENING_INVENTORY'; end if;
  if exists (
    select 1 from jsonb_each_text(target_inventory) item
    where trim(item.key) = '' or item.value !~ '^\d+$'
  ) then raise exception 'INVALID_OPENING_INVENTORY'; end if;
  if exists (
    select 1 from jsonb_each_text(target_inventory) item
    where item.value::numeric > 10000
      or not exists (select 1 from project_slots where project_id = target_project_id and member_name = item.key)
  ) then raise exception 'INVALID_OPENING_INVENTORY'; end if;
  if (select coalesce(sum(item.value::numeric), 0) from jsonb_each_text(target_inventory) item) <= 0 then raise exception 'INVALID_OPENING_INVENTORY'; end if;
  if nullif(trim(target_evidence_url), '') is null then raise exception 'OPENING_EVIDENCE_REQUIRED'; end if;
  if not exists (
    select 1 from receipt_verifications where project_id = target_project_id and status in ('VERIFIED', 'APPROVED')
  ) then raise exception 'VERIFIED_RECEIPT_REQUIRED'; end if;

  remaining_counts := target_inventory;
  insert into project_openings (project_id, leader_id, inventory, remaining_inventory, evidence_url)
  values (target_project_id, target_leader_id, target_inventory, remaining_counts, trim(target_evidence_url))
  returning * into opening;

  for candidate in
    select target_order.id as order_id, target_order.customer_id, target_order.created_at,
      order_item.id as order_item_id, order_item.slot_id, order_item.picks,
      payment.id as payment_id, payment.amount
    from orders target_order
    join order_items order_item on order_item.order_id = target_order.id
    join payments payment on payment.order_id = target_order.id
    where target_order.project_id = target_project_id and target_order.status = 'PAYMENT_CONFIRMED'
      and payment.status = 'HELD'
    order by target_order.created_at, target_order.id
  loop
    chosen_member := null;
    chosen_rank := null;
    select preference.member_name, preference.ordinality::integer into chosen_member, chosen_rank
    from jsonb_array_elements_text(coalesce(candidate.picks, '[]'::jsonb)) with ordinality preference(member_name, ordinality)
    where preference.ordinality <= 3 and coalesce((remaining_counts->>preference.member_name)::integer, 0) > 0
    order by preference.ordinality
    limit 1;

    if chosen_member is not null then
      remaining_counts := jsonb_set(remaining_counts, array[chosen_member], to_jsonb((remaining_counts->>chosen_member)::integer - 1));
      insert into allocation_logs (project_id, opening_id, order_id, participant_id, assigned_member, preference_rank, outcome, algorithm_version)
      values (target_project_id, opening.id, candidate.order_id, candidate.customer_id, chosen_member, chosen_rank, 'ASSIGNED', opening.algorithm_version);
      update order_items set assigned_member = chosen_member, allocation_status = 'ASSIGNED' where id = candidate.order_item_id;
      update orders set status = 'ALLOCATED' where id = candidate.order_id;
      assigned_count := assigned_count + 1;
    else
      insert into refunds (project_id, order_id, payment_id, user_id, amount, reason, status, completed_at)
      values (target_project_id, candidate.order_id, candidate.payment_id, candidate.customer_id, candidate.amount, 'OPENING_ALLOCATION_SHORTAGE', 'COMPLETED', now());
      insert into allocation_logs (project_id, opening_id, order_id, participant_id, outcome, refund_amount, algorithm_version)
      values (target_project_id, opening.id, candidate.order_id, candidate.customer_id, 'REFUNDED', candidate.amount, opening.algorithm_version);
      update order_items set assigned_member = null, allocation_status = 'REFUNDED' where id = candidate.order_item_id;
      update payments set status = 'REFUNDED', released_at = null where id = candidate.payment_id;
      update orders set status = 'REFUNDED' where id = candidate.order_id;
      update project_slots set is_occupied = false, participant_id = null, occupied_at = null, locked_at = null where id = candidate.slot_id;
      insert into activities (user_id, type, title, message)
      values (candidate.customer_id, 'settlement', '미배정 자동 환불', '개봉 수량 부족으로 결제금 ' || candidate.amount::text || '원이 자동 환불되었습니다.');
      refunded_count := refunded_count + 1;
    end if;
  end loop;

  if assigned_count + refunded_count = 0 then raise exception 'NO_ORDERS_TO_ALLOCATE'; end if;
  update project_openings set remaining_inventory = remaining_counts where id = opening.id returning * into opening;
  update projects set status = case when assigned_count > 0 then 'ALLOCATED' else 'ALLOCATION_FAILED' end where id = target_project_id;
  return jsonb_build_object('opening', to_jsonb(opening), 'assigned_count', assigned_count, 'refunded_count', refunded_count, 'replayed', false);
end; $$;

create or replace function submit_receipt_explanation(target_receipt_id uuid, target_uploader_id text, target_explanation text)
returns receipt_verifications language plpgsql security definer set search_path = public as $$
declare updated_verification receipt_verifications;
begin
  if length(trim(coalesce(target_explanation, ''))) < 10 then raise exception 'EXPLANATION_TOO_SHORT'; end if;
  update receipt_verifications set status = 'EXPLANATION_SUBMITTED', explanation = trim(target_explanation), explanation_submitted_at = now()
  where id = target_receipt_id and uploader_id = target_uploader_id and status = 'EXPLANATION_REQUIRED'
    and explanation_due_at > now()
  returning * into updated_verification;
  if updated_verification.id is null then raise exception 'EXPLANATION_NOT_AVAILABLE'; end if;
  return updated_verification;
end; $$;

create or replace function review_receipt_explanation(target_receipt_id uuid, target_reviewer_id text, target_decision text, target_note text)
returns receipt_verifications language plpgsql security definer set search_path = public as $$
declare
  updated_verification receipt_verifications;
  affected_project_id uuid;
begin
  if target_decision not in ('APPROVED', 'REJECTED') then raise exception 'INVALID_REVIEW_DECISION'; end if;
  update receipt_verifications set status = target_decision, reviewed_by = target_reviewer_id,
    reviewed_at = now(), review_note = nullif(trim(target_note), '')
  where id = target_receipt_id and status in ('EXPLANATION_SUBMITTED', 'EXPLANATION_EXPIRED')
  returning * into updated_verification;
  if updated_verification.id is null then raise exception 'RECEIPT_NOT_REVIEWABLE'; end if;
  affected_project_id := updated_verification.project_id;

  if target_decision = 'APPROVED' and not exists (
    select 1 from receipt_verifications where project_id = affected_project_id
      and status in ('EXPLANATION_REQUIRED', 'EXPLANATION_SUBMITTED', 'EXPLANATION_EXPIRED', 'REJECTED')
  ) and not exists (
    select 1 from reports report where report.status in ('OPEN', 'REVIEWING') and (
      (report.subject_type = 'PROJECT' and report.subject_id = affected_project_id::text)
      or (report.subject_type = 'ORDER' and report.subject_id in (select id::text from orders where project_id = affected_project_id))
    )
  ) then
    update projects set settlement_hold = false where id = affected_project_id;
    update orders set settlement_hold = false where project_id = affected_project_id and status not in ('EXPIRED', 'CANCELLED', 'SETTLED');
  end if;
  return updated_verification;
end; $$;

create or replace function expire_receipt_explanations()
returns void language plpgsql security definer set search_path = public as $$
begin
  update receipt_verifications set status = 'EXPLANATION_EXPIRED'
  where status = 'EXPLANATION_REQUIRED' and explanation_due_at <= now();
end; $$;

do $scheduler$
begin
  if not exists (select 1 from cron.job where jobname = 'expire-receipt-explanations') then
    perform cron.schedule(
      'expire-receipt-explanations',
      '*/15 * * * *',
      $job$select public.expire_receipt_explanations();$job$
    );
  end if;
end;
$scheduler$;

-- 서명 검증을 통과한 PG 이벤트를 중복 없이 처리하고 결제와 주문을 함께 확정한다.
create or replace function process_payment_webhook(
  target_provider text,
  target_event_id text,
  target_event_type text,
  target_payment_id uuid,
  target_provider_payment_id text,
  target_amount integer,
  target_paid_at timestamptz,
  target_payload_hash text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  webhook_event payment_webhook_events;
  target_payment payments;
  outcome jsonb;
begin
  if nullif(trim(target_event_id), '') is null then raise exception 'WEBHOOK_EVENT_ID_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_provider || ':' || target_event_id, 0));

  select * into webhook_event from payment_webhook_events
  where provider = target_provider and event_id = target_event_id;
  if webhook_event.id is not null then
    if webhook_event.payload_hash <> target_payload_hash then
      return jsonb_build_object('accepted', false, 'reason', 'WEBHOOK_EVENT_PAYLOAD_MISMATCH', 'replayed', true);
    end if;
    return webhook_event.result || jsonb_build_object('replayed', true);
  end if;

  insert into payment_webhook_events (
    provider, event_id, event_type, payment_id, provider_payment_id, amount, payload_hash
  ) values (
    target_provider, target_event_id, target_event_type, target_payment_id, target_provider_payment_id, target_amount, target_payload_hash
  ) returning * into webhook_event;

  select * into target_payment from payments where id = target_payment_id for update;
  if target_payment.id is null then
    outcome := jsonb_build_object('accepted', false, 'reason', 'PAYMENT_NOT_FOUND', 'replayed', false);
  elsif target_event_type <> 'virtual_account.paid' then
    outcome := jsonb_build_object('accepted', false, 'reason', 'UNSUPPORTED_EVENT_TYPE', 'replayed', false);
  elsif target_payment.provider <> target_provider then
    outcome := jsonb_build_object('accepted', false, 'reason', 'PAYMENT_PROVIDER_MISMATCH', 'replayed', false);
  elsif target_amount is null or target_amount <> target_payment.amount then
    outcome := jsonb_build_object('accepted', false, 'reason', 'PAYMENT_AMOUNT_MISMATCH', 'replayed', false);
  elsif target_paid_at is null or target_paid_at > now() + interval '5 minutes' then
    outcome := jsonb_build_object('accepted', false, 'reason', 'INVALID_PAID_AT', 'replayed', false);
  elsif exists (select 1 from payments where provider_payment_id = target_provider_payment_id and id <> target_payment.id) then
    outcome := jsonb_build_object('accepted', false, 'reason', 'PROVIDER_PAYMENT_ID_CONFLICT', 'replayed', false);
  elsif target_payment.status in ('HELD', 'RELEASED') then
    outcome := jsonb_build_object('accepted', true, 'reason', 'PAYMENT_ALREADY_CONFIRMED', 'payment_id', target_payment.id, 'replayed', false);
  elsif target_payment.status <> 'PENDING' or target_payment.payment_due_at is null or target_paid_at > target_payment.payment_due_at then
    update payments set status = 'EXPIRED' where id = target_payment.id and status = 'PENDING';
    update orders set status = 'EXPIRED' where id = target_payment.order_id and status = 'PAYMENT_PENDING';
    update project_slots set is_occupied = false, participant_id = null, occupied_at = null, locked_at = null
    where id = target_payment.slot_id and participant_id = target_payment.user_id
      and not exists (select 1 from payments confirmed where confirmed.slot_id = target_payment.slot_id and confirmed.status in ('HELD', 'RELEASED'));
    outcome := jsonb_build_object('accepted', false, 'reason', 'PAYMENT_EXPIRED', 'payment_id', target_payment.id, 'replayed', false);
  else
    update payments set status = 'HELD', paid_at = target_paid_at, provider_payment_id = target_provider_payment_id
    where id = target_payment.id returning * into target_payment;
    update orders set status = 'PAYMENT_CONFIRMED'
    where id = target_payment.order_id and status = 'PAYMENT_PENDING';
    outcome := jsonb_build_object('accepted', true, 'reason', 'PAYMENT_CONFIRMED', 'payment_id', target_payment.id, 'order_id', target_payment.order_id, 'replayed', false);
  end if;

  update payment_webhook_events set
    status = case when (outcome->>'accepted')::boolean then 'PROCESSED' else 'REJECTED' end,
    result = outcome,
    processed_at = now()
  where id = webhook_event.id;
  return outcome;
end; $$;

-- 수령이 끝난 공구의 참여자 에스크로와 보증금을 해제하고 정산 원장을 생성한다.
create or replace function finalize_project_settlement(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_project projects;
  settlement project_settlements;
  active_order_count integer;
  gross integer;
  fee integer;
  deposit_return integer;
begin
  select * into target_project from projects where id = target_project_id for update;
  if target_project.id is null then return jsonb_build_object('settled', false, 'reason', 'PROJECT_NOT_FOUND'); end if;

  select * into settlement from project_settlements where project_id = target_project_id;
  if target_project.status = 'SETTLED' and settlement.id is not null then
    return jsonb_build_object('settled', true, 'reason', 'ALREADY_SETTLED', 'settlement', to_jsonb(settlement));
  end if;

  if target_project.settlement_hold or exists (
    select 1 from reports report
    where report.status in ('OPEN', 'REVIEWING') and (
      (report.subject_type = 'PROJECT' and report.subject_id = target_project_id::text)
      or (report.subject_type = 'ORDER' and report.subject_id in (select id::text from orders where project_id = target_project_id))
    )
  ) then return jsonb_build_object('settled', false, 'reason', 'SETTLEMENT_ON_HOLD'); end if;

  select count(*) into active_order_count from orders
  where project_id = target_project_id and status not in ('EXPIRED', 'CANCELLED', 'REFUNDED');
  if active_order_count = 0 then return jsonb_build_object('settled', false, 'reason', 'NO_ACTIVE_ORDERS'); end if;
  if exists (
    select 1 from orders where project_id = target_project_id
      and status not in ('EXPIRED', 'CANCELLED', 'REFUNDED', 'RECEIVED', 'AUTO_RECEIVED', 'SETTLED')
  ) then return jsonb_build_object('settled', false, 'reason', 'RECEIPTS_PENDING'); end if;
  if exists (
    select 1 from orders where project_id = target_project_id
      and status in ('RECEIVED', 'AUTO_RECEIVED') and settlement_hold = true
  ) then return jsonb_build_object('settled', false, 'reason', 'SETTLEMENT_ON_HOLD'); end if;

  select coalesce(sum(amount), 0)::integer into gross from payments
  where project_id = target_project_id and order_id is not null
    and provider <> 'MOCK_ESCROW_DEPOSIT' and status in ('HELD', 'RELEASED');
  fee := round(gross * 0.1);
  select coalesce(amount, 0) into deposit_return from project_deposits
  where project_id = target_project_id and status = 'HELD';
  deposit_return := coalesce(deposit_return, 0);

  insert into project_settlements (
    project_id, leader_id, gross_amount, platform_fee, payout_amount, deposit_return_amount, status
  ) values (
    target_project_id, target_project.leader_id, gross, fee, gross - fee, deposit_return, 'READY'
  ) returning * into settlement;

  update payments set status = 'RELEASED', released_at = now()
  where project_id = target_project_id and order_id is not null
    and provider <> 'MOCK_ESCROW_DEPOSIT' and status = 'HELD';
  update project_deposits set status = 'REFUNDED', resolved_at = now(), resolution_reason = 'PROJECT_SETTLED'
  where project_id = target_project_id and status = 'HELD';
  update payments set status = 'RELEASED', released_at = now()
  where id in (select payment_id from project_deposits where project_id = target_project_id and status = 'REFUNDED')
    and status = 'HELD';
  update orders set status = 'SETTLED'
  where project_id = target_project_id and status in ('RECEIVED', 'AUTO_RECEIVED');
  update projects set status = 'SETTLED', settled_at = now(), settlement_hold = false
  where id = target_project_id;

  insert into activities (user_id, type, title, message)
  values (target_project.leader_id, 'settlement', '공구 정산 준비 완료',
    '정산금 ' || (gross - fee)::text || '원 · 보증금 반환 ' || deposit_return::text || '원');
  insert into activities (user_id, type, title, message)
  select distinct customer_id, 'settlement', '공구 자동 정산 완료', '수령 확정 및 에스크로 정산이 완료되었습니다.'
  from orders where project_id = target_project_id and status = 'SETTLED';

  return jsonb_build_object('settled', true, 'reason', 'SETTLEMENT_READY', 'settlement', to_jsonb(settlement));
end; $$;

-- 발송 D+7이 지나고 분쟁이 없는 주문을 자동 수령 처리한 뒤 공구를 정산한다.
create or replace function release_matured_escrow()
returns void language plpgsql security definer set search_path = public as $$
declare
  ready_project_id uuid;
begin
  update orders target_order set status = 'AUTO_RECEIVED', auto_received_at = now(), receipt_confirmed_at = now()
  from shipments shipment, projects project
  where target_order.project_id = shipment.project_id
    and project.id = target_order.project_id
    and project.status = 'SHIPPED'
    and shipment.shipped_at <= now() - interval '7 days'
    and target_order.status = 'SHIPPED'
    and target_order.settlement_hold = false
    and project.settlement_hold = false
    and not exists (
      select 1 from reports report where report.status in ('OPEN', 'REVIEWING') and (
        (report.subject_type = 'PROJECT' and report.subject_id = project.id::text)
        or (report.subject_type = 'ORDER' and report.subject_id = target_order.id::text)
      )
    );

  for ready_project_id in
    select project.id from projects project
    join shipments shipment on shipment.project_id = project.id
    where project.status = 'SHIPPED'
      and shipment.shipped_at <= now() - interval '7 days'
      and project.settlement_hold = false
      and exists (select 1 from orders where project_id = project.id and status not in ('EXPIRED', 'CANCELLED', 'REFUNDED'))
      and not exists (
        select 1 from orders where project_id = project.id
          and status not in ('EXPIRED', 'CANCELLED', 'REFUNDED', 'RECEIVED', 'AUTO_RECEIVED', 'SETTLED')
      )
  loop
    perform finalize_project_settlement(ready_project_id);
  end loop;
end; $$;

do $scheduler$
begin
  if not exists (select 1 from cron.job where jobname = 'release-matured-escrow') then
    perform cron.schedule(
      'release-matured-escrow',
      '*/15 * * * *',
      $job$select public.release_matured_escrow();$job$
    );
  end if;
end;
$scheduler$;

-- 총대 귀책 시 보증금을 몰수하고 결제 완료 참여자에게 균등한 위약 보상금을 생성한다.
create or replace function forfeit_project_deposit(target_project_id uuid, target_reason text)
returns setof project_compensations language plpgsql security definer as $$
declare
  target_deposit project_deposits;
  recipient_count integer;
begin
  if nullif(trim(target_reason), '') is null then raise exception 'FORFEIT_REASON_REQUIRED'; end if;

  select * into target_deposit from project_deposits
  where project_id = target_project_id for update;
  if target_deposit.id is null then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if target_deposit.status <> 'HELD' then raise exception 'DEPOSIT_NOT_HELD'; end if;

  select count(distinct user_id) into recipient_count from payments
  where project_id = target_project_id and status in ('PAID', 'HELD', 'RELEASED')
    and user_id <> target_deposit.leader_id;
  if recipient_count = 0 then raise exception 'NO_ELIGIBLE_PARTICIPANTS'; end if;

  insert into project_compensations (project_id, deposit_id, recipient_id, amount, reason)
  select target_project_id, target_deposit.id, recipient.user_id,
    target_deposit.amount / recipient_count
      + case when recipient.row_number <= target_deposit.amount % recipient_count then 1 else 0 end,
    trim(target_reason)
  from (
    select user_id, row_number() over (order by user_id) as row_number
    from (
      select distinct user_id from payments
      where project_id = target_project_id and status in ('PAID', 'HELD', 'RELEASED')
        and user_id <> target_deposit.leader_id
    ) eligible_recipients
  ) recipient
  where target_deposit.amount / recipient_count
    + case when recipient.row_number <= target_deposit.amount % recipient_count then 1 else 0 end > 0;

  update project_deposits set status = 'FORFEITED', resolved_at = now(), resolution_reason = trim(target_reason)
  where id = target_deposit.id;
  update payments set status = 'FORFEITED'
  where id = target_deposit.payment_id and status = 'HELD';
  update projects set status = 'CANCELLED' where id = target_project_id;

  return query select * from project_compensations where deposit_id = target_deposit.id order by recipient_id;
end; $$;

revoke all on function apply_project_slot(uuid, text) from public, anon, authenticated;
revoke all on function create_project_participation(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function release_expired_project_slots() from public, anon, authenticated;
revoke all on function release_matured_escrow() from public, anon, authenticated;
revoke all on function forfeit_project_deposit(uuid, text) from public, anon, authenticated;
revoke all on function process_payment_webhook(text, text, text, uuid, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function finalize_project_settlement(uuid) from public, anon, authenticated;
revoke all on function create_settlement_report(text, text, text, text, text) from public, anon, authenticated;
revoke all on function resolve_settlement_report(uuid, text) from public, anon, authenticated;
revoke all on function confirm_order_receipt(uuid, text) from public, anon, authenticated;
revoke all on function start_project_packing(uuid, text) from public, anon, authenticated;
revoke all on function record_receipt_verification(uuid, text, text, boolean, timestamptz, text, integer, text, text) from public, anon, authenticated;
revoke all on function submit_receipt_explanation(uuid, text, text) from public, anon, authenticated;
revoke all on function review_receipt_explanation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function expire_receipt_explanations() from public, anon, authenticated;
revoke all on function allocate_project_preferences(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function create_password_reset_request(text, text) from public, anon, authenticated;
revoke all on function consume_password_reset_token(text, text) from public, anon, authenticated;
revoke all on function create_verified_project_review(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function apply_project_slot(uuid, text) to service_role;
grant execute on function create_project_participation(uuid, text, jsonb, jsonb, text) to service_role;
grant execute on function release_expired_project_slots() to service_role;
grant execute on function release_matured_escrow() to service_role;
grant execute on function forfeit_project_deposit(uuid, text) to service_role;
grant execute on function process_payment_webhook(text, text, text, uuid, text, integer, timestamptz, text) to service_role;
grant execute on function finalize_project_settlement(uuid) to service_role;
grant execute on function create_settlement_report(text, text, text, text, text) to service_role;
grant execute on function resolve_settlement_report(uuid, text) to service_role;
grant execute on function confirm_order_receipt(uuid, text) to service_role;
grant execute on function start_project_packing(uuid, text) to service_role;
grant execute on function record_receipt_verification(uuid, text, text, boolean, timestamptz, text, integer, text, text) to service_role;
grant execute on function submit_receipt_explanation(uuid, text, text) to service_role;
grant execute on function review_receipt_explanation(uuid, text, text, text) to service_role;
grant execute on function expire_receipt_explanations() to service_role;
grant execute on function allocate_project_preferences(uuid, text, jsonb, text) to service_role;
grant execute on function create_password_reset_request(text, text) to service_role;
grant execute on function consume_password_reset_token(text, text) to service_role;
grant execute on function create_verified_project_review(text, uuid, integer, text) to service_role;

create index if not exists products_search_idx on products (status, category, popularity desc);
create index if not exists projects_filter_idx on projects (group_name, goods_type, status);

alter table users enable row level security;
alter table products enable row level security;
alter table projects enable row level security;
alter table project_slots enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table payment_webhook_events enable row level security;
alter table project_deposits enable row level security;
alter table project_compensations enable row level security;
alter table project_settlements enable row level security;
alter table project_openings enable row level security;
alter table allocation_logs enable row level security;
alter table refunds enable row level security;
alter table shipment_assignments enable row level security;
alter table purchase_logs enable row level security;
alter table member_selections enable row level security;
alter table reviews enable row level security;
alter table shipments enable row level security;
alter table payout_accounts enable row level security;
alter table user_addresses enable row level security;
alter table activities enable row level security;
alter table reports enable row level security;
alter table receipt_verifications enable row level security;
alter table password_reset_tokens enable row level security;
