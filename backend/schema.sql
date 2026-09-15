-- Northwoods customer portal. Run as the database owner in Supabase SQL Editor.
-- Fresh-install schema: intentionally fails on conflicting table names instead of
-- silently trusting an existing, potentially incompatible authorization model.
-- Private helpers must remain outside the Data API's exposed schemas.
-- No service_role key belongs in the browser. Admin membership is SQL-owner managed.
begin;

create schema if not exists portal_private;
revoke all on schema portal_private from public, anon, authenticated;
grant usage on schema portal_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Customer' check (char_length(btrim(full_name)) between 1 and 120),
  email text not null default '' check (char_length(email) <= 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  service_type text not null check (service_type in ('vault-room','vault-door','gun-safe')),
  zip_code text not null check (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  description text not null default '' check (char_length(description) <= 10000),
  stage text not null default 'requested' check (stage in ('requested','planning','ordered','scheduled','installing','complete')),
  installation_date date check (installation_date between date '2000-01-01' and date '2200-12-31'),
  date_note text not null default '' check (char_length(date_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id)
);
create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text not null default '' check (char_length(btrim(author_name)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  customer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  summary text not null check (char_length(btrim(summary)) between 1 and 160),
  details text not null default '' check (char_length(details) <= 10000),
  status text not null default 'pending' check (status in ('pending','in_review','approved','declined')),
  response text not null default '' check (char_length(response) <= 10000),
  created_at timestamptz not null default now(),
  foreign key (project_id, customer_id) references public.projects(id, customer_id) on delete cascade
);
create table public.project_checklist (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 300),
  completed boolean not null default false,
  sort_order bigint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = project_id::text),
  check (storage_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(-[^/]{1,200}|[.](pdf|jpg|jpeg|png))$'),
  check (storage_path !~ '[[:cntrl:]]')
);

create index projects_customer_created_idx on public.projects(customer_id, created_at desc);
create index projects_created_idx on public.projects(created_at desc);
create index messages_project_created_idx on public.project_messages(project_id, created_at);
create index messages_author_idx on public.project_messages(author_id);
create index changes_project_created_idx on public.change_requests(project_id, created_at);
create index changes_project_customer_idx on public.change_requests(project_id, customer_id);
create index changes_customer_idx on public.change_requests(customer_id);
create index checklist_project_order_idx on public.project_checklist(project_id, sort_order);
create index updates_project_created_idx on public.project_updates(project_id, created_at);
create index documents_project_created_idx on public.project_documents(project_id, created_at);

-- Privileged operations live in a non-exposed schema and independently authorize
-- each request. Only three harmlessly constrained public RPC wrappers are exposed.
create function portal_private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;
create function public.is_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$ select portal_private.is_admin(); $$;

create function portal_private.can_access_project(project_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.projects p where p.id = can_access_project.project_id
    and (p.customer_id = auth.uid() or portal_private.is_admin())
  );
$$;
create function public.can_access_project(project_id uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$ select portal_private.can_access_project(project_id); $$;

-- Profiles reflect confirmed Auth identities; user metadata is display-only.
-- Auth metadata never assigns any permission or administrator status.
create function portal_private.sync_auth_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name, email)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 120), ''), 'Customer'),
    coalesce(new.email, '')
  )
  on conflict (id) do update set full_name = excluded.full_name,
    email = excluded.email, updated_at = now();
  return new;
end;
$$;
create trigger nw_sync_auth_profile after insert or update of email, raw_user_meta_data
on auth.users for each row execute function portal_private.sync_auth_profile();
insert into public.profiles(id, full_name, email)
select id, coalesce(nullif(left(btrim(raw_user_meta_data ->> 'full_name'), 120), ''), 'Customer'),
  coalesce(email, '') from auth.users;

-- Defense in depth for identity, ownership and provenance: even an accidental
-- future broad UPDATE grant cannot move records to another account or project.
create function portal_private.keep_record_identity() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare field_name text;
begin
  foreach field_name in array tg_argv loop
    if (to_jsonb(new) -> field_name) is distinct from (to_jsonb(old) -> field_name) then
      raise exception 'Record identity and original submission fields cannot be changed'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
create trigger nw_profiles_identity before update on public.profiles for each row
execute function portal_private.keep_record_identity('id','created_at');
create trigger nw_projects_identity before update on public.projects for each row
execute function portal_private.keep_record_identity('id','customer_id','created_at','service_type','zip_code','description');
create trigger nw_messages_identity before update on public.project_messages for each row
execute function portal_private.keep_record_identity('id','project_id','author_id','author_name','created_at','body');
create trigger nw_changes_identity before update on public.change_requests for each row
execute function portal_private.keep_record_identity('id','project_id','customer_id','summary','details','created_at');
create trigger nw_checklist_identity before update on public.project_checklist for each row
execute function portal_private.keep_record_identity('id','project_id','created_at');
create trigger nw_updates_identity before update on public.project_updates for each row
execute function portal_private.keep_record_identity('id','project_id','body','created_at');
create trigger nw_documents_identity before update on public.project_documents for each row
execute function portal_private.keep_record_identity('id','project_id','storage_path','created_at');

create function portal_private.stamp_message_author() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    raise exception 'A message must be authored by the signed-in account' using errcode = '42501';
  end if;
  select full_name into new.author_name from public.profiles where id = auth.uid();
  if new.author_name is null then
    raise exception 'Author profile is unavailable' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger nw_message_author before insert on public.project_messages
for each row execute function portal_private.stamp_message_author();

create function portal_private.stamp_project_updated() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger nw_project_updated before update on public.projects
for each row execute function portal_private.stamp_project_updated();

-- Customer-facing activity entries are created in the same transaction as edits.
create function portal_private.record_project_progress() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare activity text[] := array[]::text[];
begin
  if new.stage is distinct from old.stage then
    activity := array_append(activity, 'Project stage changed to ' || case new.stage
      when 'requested' then 'Request received'
      when 'planning' then 'Site review & planning'
      when 'ordered' then 'Equipment & preparation'
      when 'scheduled' then 'Installation scheduled'
      when 'installing' then 'Installation in progress'
      when 'complete' then 'Project complete' end || '.');
  end if;
  if new.installation_date is distinct from old.installation_date then
    activity := array_append(activity, case when new.installation_date is null
      then 'Installation date cleared; the team will confirm a new date.'
      else 'Installation date set to ' || to_char(new.installation_date, 'YYYY-MM-DD') || '.' end);
  end if;
  if new.date_note is distinct from old.date_note then
    activity := array_append(activity, case when new.date_note = '' then 'Scheduling note cleared.'
      else 'Scheduling note: ' || new.date_note end);
  end if;
  if cardinality(activity) > 0 then
    insert into public.project_updates(project_id, body) values (new.id, array_to_string(activity, ' '));
  end if;
  return new;
end;
$$;
create trigger nw_project_progress after update on public.projects
for each row execute function portal_private.record_project_progress();

create function portal_private.set_checklist_completed(item_id uuid, is_completed boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or is_completed is null then
    raise exception 'Sign in and supply a completion value' using errcode = '42501';
  end if;
  update public.project_checklist c set completed = is_completed
  where c.id = item_id and portal_private.can_access_project(c.project_id);
  if not found then
    raise exception 'Checklist item is unavailable for this account' using errcode = '42501';
  end if;
end;
$$;
create function public.set_checklist_completed(item_id uuid, is_completed boolean) returns void
language sql security invoker set search_path = ''
as $$ select portal_private.set_checklist_completed(item_id, is_completed); $$;

-- All application relations have RLS. No client can write profiles or roles.
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.projects enable row level security;
alter table public.project_messages enable row level security;
alter table public.change_requests enable row level security;
alter table public.project_checklist enable row level security;
alter table public.project_updates enable row level security;
alter table public.project_documents enable row level security;
revoke all on public.profiles, public.admin_users, public.projects, public.project_messages,
  public.change_requests, public.project_checklist, public.project_updates, public.project_documents
from public, anon, authenticated;
revoke all on public.admin_users from service_role;
grant usage on schema public to authenticated;
grant select on public.profiles, public.projects, public.project_messages, public.change_requests,
  public.project_checklist, public.project_updates, public.project_documents to authenticated;
grant insert (customer_id,title,service_type,zip_code,description,stage,installation_date,date_note)
  on public.projects to authenticated;
grant update (title,stage,installation_date,date_note) on public.projects to authenticated;
grant delete on public.projects to authenticated;
grant insert (project_id,author_id,author_name,body) on public.project_messages to authenticated;
grant insert (project_id,customer_id,summary,details,status,response) on public.change_requests to authenticated;
grant update (status,response) on public.change_requests to authenticated;
grant delete on public.change_requests to authenticated;
grant insert (project_id,label,completed,sort_order) on public.project_checklist to authenticated;
grant update (label,completed,sort_order) on public.project_checklist to authenticated;
grant delete on public.project_checklist to authenticated;
grant insert (project_id,body) on public.project_updates to authenticated;
grant insert (project_id,label,storage_path) on public.project_documents to authenticated;
grant update (label) on public.project_documents to authenticated;
grant delete on public.project_documents to authenticated;

create policy nw_profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select portal_private.is_admin()));
create policy nw_projects_read on public.projects for select to authenticated
using (customer_id = (select auth.uid()) or (select portal_private.is_admin()));
create policy nw_projects_insert on public.projects for insert to authenticated
with check ((select auth.uid()) is not null and (
  (select portal_private.is_admin()) or
  (customer_id = (select auth.uid()) and stage = 'requested' and installation_date is null and date_note = '')
));
create policy nw_projects_update on public.projects for update to authenticated
using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy nw_projects_delete on public.projects for delete to authenticated
using ((select portal_private.is_admin()));
create policy nw_messages_read on public.project_messages for select to authenticated
using (portal_private.can_access_project(project_id));
create policy nw_messages_insert on public.project_messages for insert to authenticated
with check (author_id = (select auth.uid()) and portal_private.can_access_project(project_id));
create policy nw_changes_read on public.change_requests for select to authenticated
using (portal_private.can_access_project(project_id));
create policy nw_changes_insert on public.change_requests for insert to authenticated
with check ((select auth.uid()) is not null and portal_private.can_access_project(project_id) and (
  (select portal_private.is_admin()) or
  (customer_id = (select auth.uid()) and status = 'pending' and response = '')
));
create policy nw_changes_update on public.change_requests for update to authenticated
using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy nw_changes_delete on public.change_requests for delete to authenticated
using ((select portal_private.is_admin()));
create policy nw_checklist_read on public.project_checklist for select to authenticated
using (portal_private.can_access_project(project_id));
create policy nw_checklist_insert on public.project_checklist for insert to authenticated
with check ((select portal_private.is_admin()));
create policy nw_checklist_update on public.project_checklist for update to authenticated
using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy nw_checklist_delete on public.project_checklist for delete to authenticated
using ((select portal_private.is_admin()));
create policy nw_updates_read on public.project_updates for select to authenticated
using (portal_private.can_access_project(project_id));
create policy nw_updates_insert on public.project_updates for insert to authenticated
with check ((select portal_private.is_admin()));
create policy nw_documents_read on public.project_documents for select to authenticated
using (portal_private.can_access_project(project_id));
create policy nw_documents_insert on public.project_documents for insert to authenticated
with check ((select portal_private.is_admin()));
create policy nw_documents_update on public.project_documents for update to authenticated
using ((select portal_private.is_admin())) with check ((select portal_private.is_admin()));
create policy nw_documents_delete on public.project_documents for delete to authenticated
using ((select portal_private.is_admin()));

-- Parse only canonical project/UUID-filename paths, never blindly cast user input.
create function portal_private.document_project_id(object_name text) returns uuid
language sql immutable security invoker set search_path = ''
as $$
  select case when object_name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(-[^/]{1,200}|[.](pdf|jpg|jpeg|png))$'
    and object_name !~ '[[:cntrl:]]'
    then split_part(object_name, '/', 1)::uuid else null end;
$$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-documents','project-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Keep bucket privacy and upload limits owner-managed, even when other Storage
-- bucket policies exist. Browser administrators manage documents, not security.
create policy nw_document_bucket_insert_guard on storage.buckets as restrictive for insert to anon, authenticated
with check (id <> 'project-documents');
create policy nw_document_bucket_update_guard on storage.buckets as restrictive for update to anon, authenticated
using (id <> 'project-documents') with check (id <> 'project-documents');
create policy nw_document_bucket_delete_guard on storage.buckets as restrictive for delete to anon, authenticated
using (id <> 'project-documents');

-- Storage API signed URL creation requires SELECT; these same row predicates
-- restrict which object's URL can be signed. Signed links are bearer URLs until
-- expiry; the frontend requests 60 seconds. Storage grants remain platform-owned.
create policy nw_document_storage_read on storage.objects for select to authenticated
using (bucket_id = 'project-documents' and portal_private.can_access_project(portal_private.document_project_id(name)));
create policy nw_document_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-documents' and (select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name)));
create policy nw_document_storage_update on storage.objects for update to authenticated
using (bucket_id = 'project-documents' and (select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name)))
with check (bucket_id = 'project-documents' and (select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name)));
create policy nw_document_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-documents' and (select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name)));

-- Restrictive guards prevent an unrelated broad Storage policy from granting
-- access to this bucket. Other buckets retain their existing behavior.
create policy nw_document_storage_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'project-documents') with check (bucket_id <> 'project-documents');
create policy nw_document_storage_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'project-documents' or portal_private.can_access_project(portal_private.document_project_id(name)));
create policy nw_document_storage_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'project-documents' or ((select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name))));
create policy nw_document_storage_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'project-documents' or ((select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name))))
with check (bucket_id <> 'project-documents' or ((select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name))));
create policy nw_document_storage_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'project-documents' or ((select portal_private.is_admin())
  and portal_private.can_access_project(portal_private.document_project_id(name))));

-- PostgreSQL defaults function EXECUTE to PUBLIC. Revoke both default and any
-- Supabase role grants on every new helper; explicitly allow only required calls.
revoke all on all functions in schema portal_private from public, anon, authenticated;
revoke all on function public.is_admin(), public.can_access_project(uuid),
  public.set_checklist_completed(uuid,boolean) from public, anon, authenticated;
grant execute on function portal_private.is_admin(), portal_private.can_access_project(uuid),
  portal_private.set_checklist_completed(uuid,boolean), portal_private.document_project_id(text)
  to authenticated;
grant execute on function public.is_admin(), public.can_access_project(uuid),
  public.set_checklist_completed(uuid,boolean) to authenticated;

comment on table public.admin_users is 'Only database owner manages membership. Never derive roles from user metadata.';
comment on function public.set_checklist_completed(uuid,boolean) is 'Authorized project participants may change only completion, never checklist content or project identity.';
-- Supabase may install this platform event trigger in public. Preserve its
-- automatic RLS behavior while removing unnecessary direct client execution.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
commit;

-- Bootstrap after the intended administrator has created their account:
-- insert into public.admin_users (user_id)
-- select id from auth.users where lower(email) = lower('owner@example.com') and email_confirmed_at is not null
-- on conflict (user_id) do nothing;
