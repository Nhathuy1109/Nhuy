create table if not exists password_requests (
  username_key text primary key,
  username text not null,
  created_at timestamptz not null default now()
);
