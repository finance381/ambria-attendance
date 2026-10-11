-- 20261007060000_training_docs.sql
-- Company Training Docs (Config → Company Training Docs tab).
-- Admins upload PDF/Word files targeted at a department and a role.
-- department_id NULL = all departments, role NULL = all roles.
-- Files live in the private `training-docs` bucket; the app opens them
-- through short-lived signed URLs.

create table if not exists public.training_docs (
  id            bigint generated always as identity primary key,
  title         text not null check (length(trim(title)) > 0),
  department_id integer references public.departments(id) on delete set null,
  role          text check (role in ('staff', 'supervisor', 'manager', 'admin')),
  file_path     text not null unique,
  file_name     text not null,
  file_type     text not null check (file_type in ('pdf', 'doc', 'docx')),
  uploaded_by   uuid references public.employees(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists training_docs_department_idx on public.training_docs (department_id);

alter table public.training_docs enable row level security;

-- Admins: full access.
drop policy if exists training_docs_admin_all on public.training_docs;
create policy training_docs_admin_all on public.training_docs
  for all to authenticated
  using (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- Everyone else: read only the docs aimed at their department + role.
drop policy if exists training_docs_read_own on public.training_docs;
create policy training_docs_read_own on public.training_docs
  for select to authenticated
  using (exists (
    select 1 from public.employees e
    where e.id = auth.uid() and e.active
      and (training_docs.department_id is null or training_docs.department_id = e.department_id)
      and (training_docs.role is null or training_docs.role = e.role)
  ));

-- Private bucket, 20 MB cap, PDF + Word only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-docs', 'training-docs', false, 20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins upload / delete files.
drop policy if exists training_docs_files_admin_all on storage.objects;
create policy training_docs_files_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'training-docs'
    and exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active))
  with check (bucket_id = 'training-docs'
    and exists (select 1 from public.employees e where e.id = auth.uid() and e.role = 'admin' and e.active));

-- Others can open a file only if they can see its training_docs row.
drop policy if exists training_docs_files_read_own on storage.objects;
create policy training_docs_files_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'training-docs'
    and exists (select 1 from public.training_docs d where d.file_path = storage.objects.name));
