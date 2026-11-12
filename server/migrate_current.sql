-- Compatibilidade para instalações existentes do Brisoft Shop.
-- Execute uma vez no SQL Editor do Supabase antes de publicar esta versão.

alter table if exists public.departments
  add column if not exists allow_device_message_mutations boolean not null default false;

alter table if exists public.contacts
  add column if not exists avatar_url text;

alter table if exists public.users
  add column if not exists credentials_changed_at timestamptz;

alter table if exists public.messages
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists remote_message_id text,
  add column if not exists whatsapp_account_id text,
  add column if not exists file_name text,
  add column if not exists sender_type text,
  add column if not exists sender_name text,
  add column if not exists message_context text,
  add column if not exists reply_to_message_id text,
  add column if not exists reply_to_remote_message_id text,
  add column if not exists reply_preview text,
  add column if not exists reply_sender text,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists messages_user_id_idx on public.messages(user_id);

alter table if exists public.tickets
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists assumed_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists sla_minutes_target integer not null default 15,
  add column if not exists sla_met boolean not null default true,
  add column if not exists closed_at timestamptz,
  add column if not exists awaiting_rating boolean not null default false,
  add column if not exists handled_via text not null default 'pending',
  add column if not exists direct_whatsapp_messages integer not null default 0,
  add column if not exists platform_messages integer not null default 0;

alter table if exists public.tickets
  add column if not exists is_group boolean not null default false,
  add column if not exists group_jid text,
  add column if not exists avatar_url text;

alter table if exists public.messages
  add column if not exists participant_jid text;

create unique index if not exists tickets_whatsapp_group_idx
  on public.tickets(channel, group_jid)
  where is_group = true and group_jid is not null;

alter table if exists public.tickets
  add column if not exists queued_at timestamptz;

update public.tickets
   set queued_at = coalesce(
     queued_at,
     (
       select max(message.created_at)
         from public.messages message
        where message.ticket_id = tickets.id
          and message.sender = 'system'
          and (
            message.text ilike '[Chatbot] Cliente escolheu:%'
            or message.text ilike '%Atendimento transferido de%para%'
          )
     ),
     created_at
   )
 where status = 'aguardando'
   and queued_at is null;

create or replace function public.set_ticket_queued_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'aguardando' then
    if tg_op = 'INSERT' then
      new.queued_at := coalesce(new.queued_at, now());
    elsif old.status is distinct from 'aguardando' then
      new.queued_at := now();
    elsif new.queued_at is null then
      new.queued_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_set_queued_at on public.tickets;
create trigger tickets_set_queued_at
before insert or update of status on public.tickets
for each row execute function public.set_ticket_queued_at();

-- O projeto legado usa tickets.id como TEXT, enquanto instalações novas usam UUID.
-- Descobre o tipo existente e cria a FK com exatamente o mesmo tipo.
do $$
declare
  ticket_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into ticket_id_type
    from pg_attribute attribute
    join pg_class relation on relation.oid = attribute.attrelid
    join pg_namespace schema on schema.oid = relation.relnamespace
   where schema.nspname = 'public'
     and relation.relname = 'tickets'
     and attribute.attname = 'id'
     and attribute.attnum > 0
     and not attribute.attisdropped;

  if ticket_id_type is null then
    raise exception 'A tabela public.tickets ou a coluna tickets.id não foi encontrada.';
  end if;

  execute format(
    'create table if not exists public.ratings (
       id uuid primary key default gen_random_uuid(),
       ticket_id %s not null references public.tickets(id) on delete cascade,
       agent_name text,
       score integer not null check (score between 1 and 5),
       phone text,
       jid text,
       created_at timestamptz not null default now()
     )',
    ticket_id_type
  );
end $$;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Supervisores podem acompanhar um ou mais departamentos. O departamento
-- principal permanece em users.department_id para compatibilidade.
create table if not exists public.supervisor_departments (
  user_id uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, department_id)
);

create index if not exists supervisor_departments_department_idx
  on public.supervisor_departments(department_id, user_id);

alter table public.supervisor_departments enable row level security;

create index if not exists tickets_department_status_idx
  on public.tickets(department_id, status);
create index if not exists tickets_user_status_idx
  on public.tickets(user_id, status);
create index if not exists tickets_channel_phone_status_idx
  on public.tickets(channel, phone, status, created_at desc);
create index if not exists tickets_channel_jid_status_idx
  on public.tickets(channel, jid, status, created_at desc);
create index if not exists messages_ticket_created_idx
  on public.messages(ticket_id, created_at);
create unique index if not exists messages_whatsapp_remote_unique_idx
  on public.messages(whatsapp_account_id, remote_message_id)
  where whatsapp_account_id is not null and remote_message_id is not null;

-- Fechamentos consolidados mantêm o histórico dos indicadores mensais mesmo
-- que a política de retenção dos atendimentos seja alterada futuramente.
create table if not exists public.performance_monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  scope_type text not null check (scope_type in ('company', 'department', 'agent')),
  scope_id text not null,
  scope_name text,
  department_id uuid references public.departments(id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_start, scope_type, scope_id)
);

create index if not exists tickets_created_at_idx on public.tickets(created_at);
create index if not exists tickets_closed_at_idx on public.tickets(closed_at) where closed_at is not null;
create index if not exists ratings_created_at_idx on public.ratings(created_at);
create index if not exists performance_monthly_scope_idx
  on public.performance_monthly_snapshots(month_start desc, scope_type, scope_id);

alter table public.performance_monthly_snapshots enable row level security;

-- Buckets privados usados no Render, cujo disco local é temporário.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-sessions', 'whatsapp-sessions', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

do $$
begin
  if to_regclass('public.avaliacoes') is not null then
    insert into public.ratings (ticket_id, agent_name, score, phone, jid, created_at)
    select ticket_id, agent_name, rating, phone, jid, created_at
      from public.avaliacoes a
     where not exists (
       select 1 from public.ratings r
        where r.ticket_id = a.ticket_id and r.created_at = a.created_at
     );
  end if;
end $$;

-- Tabela de contatos (clientes capturados pelo bot ou cadastrados manualmente)
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  cnpj text,
  channel text default 'WhatsApp',
  status text default 'Ativo',
  notes text,
  is_employee boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_phone_idx on public.contacts(phone);

alter table if exists public.contacts
  add column if not exists is_employee boolean not null default false;

-- Adiciona coluna contact_id na tabela tickets se não existir
alter table if exists public.tickets
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

alter table if exists public.tickets
  add column if not exists is_employee boolean not null default false;

-- Solicita ao PostgREST/Supabase que atualize imediatamente o cache do schema.
create table if not exists public.ticket_collaborators (
  ticket_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
alter table public.ticket_collaborators drop constraint if exists ticket_collaborators_ticket_id_fkey;
alter table public.ticket_collaborators alter column ticket_id type text using ticket_id::text;
create index if not exists ticket_collaborators_user_idx on public.ticket_collaborators(user_id, created_at desc);
alter table public.ticket_collaborators enable row level security;

notify pgrst, 'reload schema';
