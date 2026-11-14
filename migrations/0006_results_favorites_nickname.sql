-- Kết quả làm đề (điểm), tài liệu yêu thích và biệt danh bình luận.
create table if not exists quiz_results (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  document_id text not null references documents (id) on delete cascade,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists quiz_results_user_doc_idx on quiz_results (user_id, document_id);
create index if not exists quiz_results_doc_idx on quiz_results (document_id);

create table if not exists favorites (
  user_id text not null references "user" ("id") on delete cascade,
  document_id text not null references documents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

alter table profiles
  add column if not exists nickname text;

create unique index if not exists profiles_nickname_key
  on profiles (lower(nickname)) where nickname is not null;
