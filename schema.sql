-- Запусти этот SQL в Supabase Dashboard → SQL Editor

-- Пользователи
create table if not exists users (
  id text primary key,
  name text not null,
  initials text not null,
  color text not null default 'teal',
  online boolean default false,
  last_seen timestamptz default now(),
  invite_code text unique,
  approved boolean default false,
  created_at timestamptz default now()
);

-- Сообщения
create table if not exists messages (
  id bigserial primary key,
  chat_id text not null,
  from_id text not null,
  text text,
  file_url text,
  file_type text,
  file_name text,
  created_at timestamptz default now()
);

-- Индекс для быстрой загрузки сообщений по чату
create index if not exists messages_chat_idx on messages(chat_id, created_at);

-- Разрешить чтение/запись (test mode)
alter table users enable row level security;
alter table messages enable row level security;

create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all messages" on messages for all using (true) with check (true);

-- Realtime для сообщений
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table users;
