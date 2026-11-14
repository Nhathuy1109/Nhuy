alter table profiles
  add column if not exists hide_from_leaderboard boolean not null default false;
