 create extension if not exists pgcrypto;

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
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id text not null references products(id), title text not null, price integer not null, picks jsonb not null default '[]'
);
alter table order_items alter column product_id drop not null;
alter table order_items add column if not exists project_id uuid references projects(id);
alter table order_items add column if not exists slot_id uuid references project_slots(id);
alter table order_items add column if not exists member_name text;
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
create table if not exists project_deposits (
  id uuid primary key default gen_random_uuid(), project_id uuid not null unique references projects(id) on delete cascade,
  leader_id text not null references users(id), amount integer not null check (amount > 0), status text not null default 'PENDING'
    check (status in ('PENDING', 'HELD', 'FORFEITED', 'REFUNDED')), payment_id uuid references payments(id),
  created_at timestamptz not null default now(), resolved_at timestamptz
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
create table if not exists shipments (
  project_id uuid primary key references projects(id) on delete cascade, carrier text not null, tracking_number text not null,
  shipped_at timestamptz not null default now()
);
create table if not exists payout_accounts (
  user_id text primary key references users(id) on delete cascade, account text not null,
  updated_at timestamptz not null default now()
);
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

create or replace function apply_project_slot(target_slot_id uuid, target_user_id text)
returns project_slots language plpgsql security definer as $$
declare updated_slot project_slots;
begin
  update project_slots set participant_id = target_user_id, is_occupied = true, occupied_at = now(), locked_at = now()
  where id = target_slot_id and is_occupied = false returning * into updated_slot;
  if updated_slot.id is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  return updated_slot;
end; $$;

-- 5분간 결제가 완료되지 않은 선점 슬롯을 자동 해제한다.
create or replace function release_expired_project_slots()
returns void language plpgsql security definer as $$
begin
  update project_slots set is_occupied = false, participant_id = null, occupied_at = null, locked_at = null
  where is_occupied = true
    and coalesce(locked_at, occupied_at) < now() - interval '5 minutes'
    and not exists (
      select 1 from payments
      where payments.slot_id = project_slots.id and payments.status in ('PAID', 'HELD', 'RELEASED')
    );
end; $$;

-- 배송 완료(D+7) 후에도 구매자가 수령 확정을 하지 않은 에스크로 대금을 자동으로 정산 확정한다.
create or replace function release_matured_escrow()
returns void language plpgsql security definer as $$
begin
  update payments set status = 'RELEASED', released_at = now()
  where status = 'HELD'
    and coalesce(escrow_due_at, created_at + interval '7 days') <= now()
    and project_id in (select project_id from shipments where shipped_at < now() - interval '7 days');
end; $$;

  -- Supabase SQL Editor에서 pg_cron 확장이 허용된 프로젝트에 한해 1분 주기로 실행한다.
  -- select cron.schedule('release-expired-slots', '* * * * *', $$select release_expired_project_slots()$$);
  -- select cron.schedule('release-matured-escrow', '*/15 * * * *', $$select release_matured_escrow()$$);

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
alter table purchase_logs enable row level security;
alter table member_selections enable row level security;
alter table reviews enable row level security;
alter table shipments enable row level security;
alter table payout_accounts enable row level security;
alter table activities enable row level security;
alter table reports enable row level security;
