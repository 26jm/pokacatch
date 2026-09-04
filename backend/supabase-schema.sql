create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key, email text not null unique, password_hash text not null,
  role text not null check (role in ('CUSTOMER', 'SELLER', 'ADMIN')),
  twitter_handle text, full_name text not null, phone text not null, created_at timestamptz not null default now()
);
alter table users add column if not exists full_name text;
alter table users add column if not exists phone text;
create table if not exists products (
  id text primary key, seller_id text not null references users(id), title text not null,
  category text not null, description text not null, tags jsonb not null default '[]', members jsonb not null default '[]',
  price integer not null check (price > 0), stock integer not null check (stock >= 0), shipping_days integer not null default 0,
  current_participants integer not null default 0, min_participants integer not null check (min_participants > 0),
  deadline date, popularity numeric not null default 0, member_limit integer, status text not null default 'ACTIVE', created_at timestamptz not null default now()
);
create table if not exists projects (
  id uuid primary key default gen_random_uuid(), leader_id text not null references users(id), group_name text not null,
  goods_type text not null, title text not null, source_url text, status text not null default 'RECRUITING', shipping_policy jsonb, created_at timestamptz not null default now()
);
create table if not exists project_slots (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  member_name text not null, price integer not null check (price >= 0), participant_id text references users(id),
  is_occupied boolean not null default false, occupied_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists cart_items (
  customer_id text not null references users(id) on delete cascade, product_id text not null references products(id),
  picks jsonb not null default '[]', created_at timestamptz not null default now(), primary key (customer_id, product_id)
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(), customer_id text not null references users(id), status text not null,
  total integer not null check (total >= 0), created_at timestamptz not null default now()
);
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id text not null references products(id), title text not null, price integer not null, picks jsonb not null default '[]'
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(), order_id uuid references orders(id), project_id uuid references projects(id),
  slot_id uuid references project_slots(id), user_id text not null references users(id), amount integer not null check (amount >= 0),
  currency text not null default 'KRW', provider text not null, provider_payment_id text unique, status text not null,
  created_at timestamptz not null default now(), released_at timestamptz
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

create or replace function apply_project_slot(target_slot_id uuid, target_user_id text)
returns project_slots language plpgsql security definer as $$
declare updated_slot project_slots;
begin
  update project_slots set participant_id = target_user_id, is_occupied = true, occupied_at = now()
  where id = target_slot_id and is_occupied = false returning * into updated_slot;
  if updated_slot.id is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  return updated_slot;
end; $$;

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
