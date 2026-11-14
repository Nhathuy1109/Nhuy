create table if not exists profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  username text not null,
  username_key text not null unique,
  display_name text not null,
  role text not null check (role in ('owner', 'user')),
  preview_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists blocks (
  username text primary key,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key,
  subject_id text not null references subjects (id) on delete cascade,
  section text not null check (section in ('theory', 'quizfile', 'practice')),
  name text not null,
  mime text not null default '',
  body text not null,
  bytes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists documents_subject_idx on documents (subject_id, section);

create table if not exists settings (
  key text primary key,
  value text not null
);

insert into settings (key, value) values ('legacy_owner', 'on')
on conflict (key) do nothing;
