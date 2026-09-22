create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid not null default gen_random_uuid() unique,
  email text not null,
  full_name text not null default '',
  company_name text not null default '',
  phone text not null default '',
  role text not null default 'client' check (role in ('admin','client')),
  package_name text not null default 'Essential',
  hours_per_week numeric(6,2) not null default 3,
  status text not null default 'Active' check (status in ('Active','Paused','Closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.profiles(client_id) on delete cascade,
  title text not null, description text not null default '',
  priority text not null default 'Normal' check (priority in ('Urgent','High','Normal','Low')),
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Completed')),
  due_date date, actual_hours numeric(8,2) not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.profiles(client_id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade, body text not null, created_at timestamptz not null default now()
);
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.profiles(client_id) on delete cascade,
  name text not null, path text not null unique, content_type text not null default 'application/octet-stream', size_bytes bigint not null default 0,
  uploaded_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.profiles(client_id) on delete cascade,
  invoice_number text not null, description text not null default '', amount numeric(12,2) not null default 0,
  issue_date date not null default current_date, due_date date,
  status text not null default 'Outstanding' check (status in ('Draft','Outstanding','Paid','Overdue')), pdf_url text, created_at timestamptz not null default now()
);
create index if not exists tasks_client_id_idx on public.tasks(client_id);
create index if not exists messages_client_id_idx on public.messages(client_id);
create index if not exists files_client_id_idx on public.files(client_id);
create index if not exists invoices_client_id_idx on public.invoices(client_id);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;
create or replace function public.my_client_id() returns uuid language sql stable security definer set search_path=public as $$ select client_id from public.profiles where id=auth.uid() limit 1; $$;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_client_id() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.invoices enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;
drop policy if exists files_select on public.files;
drop policy if exists files_insert on public.files;
drop policy if exists files_delete on public.files;
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_delete on public.invoices;

create policy profiles_select on public.profiles for select to authenticated using (public.is_admin() or id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (public.is_admin() or id=auth.uid()) with check (public.is_admin() or id=auth.uid());
create policy tasks_select on public.tasks for select to authenticated using (public.is_admin() or client_id=public.my_client_id());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_admin() or client_id=public.my_client_id());
create policy tasks_update on public.tasks for update to authenticated using (public.is_admin() or client_id=public.my_client_id()) with check (public.is_admin() or client_id=public.my_client_id());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin() or client_id=public.my_client_id());
create policy messages_select on public.messages for select to authenticated using (public.is_admin() or client_id=public.my_client_id());
create policy messages_insert on public.messages for insert to authenticated with check (public.is_admin() or (client_id=public.my_client_id() and sender_id=auth.uid()));
create policy messages_update on public.messages for update to authenticated using (public.is_admin() or sender_id=auth.uid()) with check (public.is_admin() or sender_id=auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (public.is_admin() or sender_id=auth.uid());
create policy files_select on public.files for select to authenticated using (public.is_admin() or client_id=public.my_client_id());
create policy files_insert on public.files for insert to authenticated with check (public.is_admin() or (client_id=public.my_client_id() and uploaded_by=auth.uid()));
create policy files_delete on public.files for delete to authenticated using (public.is_admin() or uploaded_by=auth.uid());
create policy invoices_select on public.invoices for select to authenticated using (public.is_admin() or client_id=public.my_client_id());
create policy invoices_insert on public.invoices for insert to authenticated with check (public.is_admin());
create policy invoices_update on public.invoices for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy invoices_delete on public.invoices for delete to authenticated using (public.is_admin());

insert into storage.buckets (id,name,public) values ('client-files','client-files',false) on conflict (id) do update set public=false;
drop policy if exists client_files_select on storage.objects;
drop policy if exists client_files_insert on storage.objects;
drop policy if exists client_files_delete on storage.objects;
create policy client_files_select on storage.objects for select to authenticated using (bucket_id='client-files' and (public.is_admin() or (storage.foldername(name))[1]=public.my_client_id()::text));
create policy client_files_insert on storage.objects for insert to authenticated with check (bucket_id='client-files' and (public.is_admin() or (storage.foldername(name))[1]=public.my_client_id()::text));
create policy client_files_delete on storage.objects for delete to authenticated using (bucket_id='client-files' and (public.is_admin() or (storage.foldername(name))[1]=public.my_client_id()::text));

-- After first login, set your own row to admin in Table Editor:
-- update public.profiles set role='admin' where email='YOUR_ADMIN_EMAIL';
