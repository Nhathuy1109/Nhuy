create table if not exists submissions (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  subject_id text not null references subjects (id) on delete cascade,
  section text not null check (section in ('theory', 'quizfile', 'practice')),
  name text not null,
  mime text not null default '',
  body text not null,
  bytes integer not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  document_id text,
  notify_pending boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists submissions_user_idx on submissions (user_id, status);
create index if not exists submissions_status_idx on submissions (status, created_at);

create table if not exists comments (
  id text primary key,
  document_id text not null references documents (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_document_idx on comments (document_id, created_at);

create table if not exists activity (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('download', 'attempt')),
  document_id text,
  subject_name text not null,
  document_name text not null,
  section text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_user_idx on activity (user_id, kind);
