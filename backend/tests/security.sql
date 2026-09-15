-- TEST ONLY. Run after stubs.sql and schema.sql in a disposable owner connection.
-- All fixture data and test helpers are rolled back at the end.
begin;
create schema portal_test;
grant usage on schema portal_test to anon, authenticated;
create function portal_test.assert_true(actual boolean, label text) returns void
language plpgsql security invoker as $$ begin
  if actual is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create function portal_test.denied(statement text, label text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception when insufficient_privilege then
    raise notice 'PASS: %', label; return;
  end;
  raise exception 'FAIL: % (operation was allowed)', label;
end $$;
create function portal_test.rejected(statement text, label text) returns void
language plpgsql security invoker as $$ begin
  begin
    execute statement;
  exception when check_violation or foreign_key_violation or invalid_text_representation then
    raise notice 'PASS: %', label; return;
  end;
  raise exception 'FAIL: % (invalid data was accepted)', label;
end $$;
create function portal_test.id(key text) returns uuid language sql stable as $$
  select current_setting('test.' || key)::uuid;
$$;
-- Simulate an unrelated permissive Storage policy: restrictive bucket guards
-- must still prevent customer uploads, cross-project reads, and anonymous access.
create policy existing_wide_storage_policy on storage.objects for all to public
using (true) with check (true);
create policy existing_wide_bucket_policy on storage.buckets for all to public
using (true) with check (true);

insert into auth.users(id,email,raw_user_meta_data) values
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','alice@example.com','{"full_name":"Alice","role":"admin"}'),
 ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','bob@example.com','{"full_name":"Bob"}'),
 ('dddddddd-dddd-4ddd-dddd-dddddddddddd','owner@example.com','{"full_name":"Northwoods Team"}');
insert into public.admin_users(user_id) values ('dddddddd-dddd-4ddd-dddd-dddddddddddd');
select portal_test.assert_true((select count(*) = 3 from public.profiles), 'Auth insert creates profiles');
update auth.users set email='alice.new@example.com', raw_user_meta_data='{"full_name":"Alice Updated","is_admin":true}'
where id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
select portal_test.assert_true((select email='alice.new@example.com' and full_name='Alice Updated' from public.profiles where id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'), 'Auth updates synchronize display name and email');
select portal_test.assert_true((select public=false and file_size_limit=10485760 and allowed_mime_types=array['application/pdf','image/jpeg','image/png'] from storage.buckets where id='project-documents'), 'Document bucket is private with exact size and MIME limits');
select portal_test.assert_true((select count(*)=8 from pg_class where relnamespace='public'::regnamespace and relname in ('profiles','admin_users','projects','project_messages','change_requests','project_checklist','project_updates','project_documents') and relrowsecurity), 'All eight application tables have RLS');
select portal_test.assert_true(not has_table_privilege('service_role','public.admin_users','INSERT'), 'Service role cannot grant administrator membership');
select portal_test.assert_true((select bool_and(not prosecdef) from pg_proc where pronamespace='public'::regnamespace and proname in ('is_admin','can_access_project','set_checklist_completed')), 'Public RPC wrappers are security invoker');

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);
select portal_test.assert_true(not public.is_admin(), 'Editable user metadata cannot grant admin');
select portal_test.assert_true((select count(*)=1 from public.profiles), 'Customer reads only own profile');
select portal_test.denied('insert into public.admin_users(user_id) values (auth.uid())','Customer cannot promote self');
select portal_test.denied('select * from public.admin_users','Customer cannot list administrator membership');
select portal_test.denied($q$update public.profiles set email='forged@example.com' where id=auth.uid()$q$,'Customer cannot forge profile email');
select portal_test.denied($q$insert into public.projects(customer_id,title,service_type,zip_code) values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','Impersonation','vault-room','55401')$q$,'Customer cannot create another customer project');
select portal_test.denied($q$insert into public.projects(title,service_type,zip_code,stage) values ('Bypass','vault-room','55401','complete')$q$,'Customer cannot insert advanced stage');
select portal_test.denied($q$insert into public.projects(title,service_type,zip_code,installation_date) values ('Bypass','vault-room','55401','2027-01-01')$q$,'Customer cannot set installation date on creation');
select portal_test.denied($q$insert into public.projects(title,service_type,zip_code,date_note) values ('Bypass','vault-room','55401','Guaranteed tomorrow')$q$,'Customer cannot set scheduling note on creation');
select portal_test.rejected($q$insert into public.projects(title,service_type,zip_code) values ('Bad ZIP','vault-room','invalid')$q$,'Invalid ZIP rejected');
select portal_test.rejected($q$insert into public.projects(title,service_type,zip_code) values ('Bad service','unrecognized','55401')$q$,'Invalid service type rejected');
with p as (insert into public.projects(title,service_type,zip_code,description) values ('Alice vault','vault-room','55401','Basement installation') returning id)
select set_config('test.pa',id::text,false) from p;
select portal_test.assert_true((select stage='requested' and installation_date is null and date_note='' from public.projects where id=portal_test.id('pa')), 'Customer project has safe initial defaults');
with changed as (update public.projects set stage='complete' where id=portal_test.id('pa') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot change own stage');
with changed as (delete from public.projects where id=portal_test.id('pa') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot delete own project');
select portal_test.denied($q$update public.projects set customer_id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' where id=portal_test.id('pa')$q$,'Project ownership column cannot be changed');
with m as (insert into public.project_messages(project_id,author_id,author_name,body) values (portal_test.id('pa'),auth.uid(),'Spoofed team name','Can we discuss dimensions?') returning id)
select set_config('test.ma',id::text,false) from m;
select portal_test.assert_true((select author_name='Alice Updated' from public.project_messages where id=portal_test.id('ma')),'Database stamps verified author display name');
select portal_test.denied($q$insert into public.project_messages(project_id,author_id,body) values (portal_test.id('pa'),'dddddddd-dddd-4ddd-dddd-dddddddddddd','Forged reply')$q$,'Customer cannot impersonate team author');
select portal_test.denied($q$update public.project_messages set body='Edited' where id=portal_test.id('ma')$q$,'Messages are append only');
with c as (insert into public.change_requests(project_id,customer_id,summary,details) values (portal_test.id('pa'),auth.uid(),'Change door finish','Please use black') returning id)
select set_config('test.ca',id::text,false) from c;
select portal_test.denied($q$insert into public.change_requests(project_id,summary,status) values (portal_test.id('pa'),'Self approval','approved')$q$,'Customer cannot pre-approve change request');
select portal_test.denied($q$insert into public.change_requests(project_id,summary,response) values (portal_test.id('pa'),'Self response','Approved by team')$q$,'Customer cannot forge response on request creation');
with changed as (update public.change_requests set status='approved' where id=portal_test.id('ca') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot review own request');
select portal_test.denied($q$insert into public.project_checklist(project_id,label) values (portal_test.id('pa'),'Unauthorized item')$q$,'Customer cannot create checklist content');
select portal_test.denied($q$insert into public.project_updates(project_id,body) values (portal_test.id('pa'),'Forged team update')$q$,'Customer cannot post team updates');

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',false);
with p as (insert into public.projects(title,service_type,zip_code) values ('Bob safe','gun-safe','90210') returning id)
select set_config('test.pb',id::text,false) from p;
insert into public.project_messages(project_id,body) values (portal_test.id('pb'),'Bob private message');
insert into public.change_requests(project_id,summary) values (portal_test.id('pb'),'Bob private request');

select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-dddd-dddddddddddd',false);
select portal_test.assert_true(public.is_admin(),'Owner-bootstrapped administrator recognized');
select portal_test.assert_true((select count(*)=3 from public.profiles),'Administrator lists all customers');
with changed as (update storage.buckets set public=true, file_size_limit=null where id='project-documents' returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Browser administrator cannot make document bucket public or remove upload limits');
select portal_test.assert_true((select count(*)=2 from public.projects),'Administrator reads all projects');
select portal_test.denied($q$insert into public.admin_users(user_id) values ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')$q$,'Browser administrator cannot create more administrators');
update public.projects set title='Alice secure room',stage='scheduled',installation_date='2027-02-20',date_note='Team arrives in the morning' where id=portal_test.id('pa');
select portal_test.assert_true((select stage='scheduled' and installation_date='2027-02-20' from public.projects where id=portal_test.id('pa')),'Administrator changes stage and installation date');
select portal_test.assert_true((select count(*)=1 from public.project_updates where project_id=portal_test.id('pa') and body like '%scheduled%' and body like '%2027-02-20%'),'Stage and date changes automatically publish activity');
update public.change_requests set status='approved',response='Black finish confirmed' where id=portal_test.id('ca');
select portal_test.assert_true((select status='approved' and response='Black finish confirmed' from public.change_requests where id=portal_test.id('ca')),'Administrator reviews request');
insert into public.project_messages(project_id,body) values (portal_test.id('pa'),'We will bring the specifications.');
insert into public.project_updates(project_id,body) values (portal_test.id('pb'),'Bob team update');
with c as (insert into public.project_checklist(project_id,label,sort_order) values (portal_test.id('pa'),'Confirm access route',1770000000000) returning id)
select set_config('test.ka',id::text,false) from c;
with c as (insert into public.project_checklist(project_id,label) values (portal_test.id('pb'),'Bob private task') returning id)
select set_config('test.kb',id::text,false) from c;
select set_config('test.patha',portal_test.id('pa')::text || '/11111111-1111-4111-a111-111111111111.pdf',false);
select set_config('test.pathb',portal_test.id('pb')::text || '/22222222-2222-4222-a222-222222222222.pdf',false);
insert into storage.objects(bucket_id,name) values ('project-documents',current_setting('test.patha')),('project-documents',current_setting('test.pathb'));
insert into public.project_documents(project_id,label,storage_path) values
 (portal_test.id('pa'),'Alice specifications',current_setting('test.patha')),
 (portal_test.id('pb'),'Bob specifications',current_setting('test.pathb'));
select portal_test.assert_true((select count(*)=2 from storage.objects where bucket_id='project-documents'),'Administrator uploads and reads valid project documents');
select portal_test.denied($q$insert into storage.objects(bucket_id,name) values ('project-documents','99999999-9999-4999-a999-999999999999/11111111-1111-4111-a111-111111111111.pdf')$q$,'Administrator cannot upload to nonexistent project');
select portal_test.denied($q$insert into storage.objects(bucket_id,name) values ('project-documents','not-a-uuid/file.pdf')$q$,'Malformed storage path safely denied');
select portal_test.rejected($q$insert into public.project_documents(project_id,label,storage_path) values (portal_test.id('pa'),'Misfiled',current_setting('test.pathb') || '-copy')$q$,'Document metadata cannot point to another project');
select portal_test.denied($q$update public.project_documents set project_id=portal_test.id('pb') where project_id=portal_test.id('pa')$q$,'Administrator cannot reassign document identity');
select portal_test.denied($q$update public.projects set customer_id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' where id=portal_test.id('pa')$q$,'Administrator cannot reassign project identity');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);
select portal_test.assert_true(public.can_access_project(portal_test.id('pa')) and not public.can_access_project(portal_test.id('pb')),'Project access helper enforces ownership');
select portal_test.assert_true((select count(*)=1 from public.projects),'Customer A cannot read customer B project');
with changed as (update storage.buckets set public=true where id='project-documents' returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot make document bucket public despite broad existing bucket policy');
select portal_test.assert_true((select count(*)=0 from public.project_messages where project_id=portal_test.id('pb')),'Customer A cannot read B messages');
select portal_test.assert_true((select count(*)=0 from public.change_requests where project_id=portal_test.id('pb')),'Customer A cannot read B changes');
select portal_test.assert_true((select count(*)=0 from public.project_checklist where project_id=portal_test.id('pb')),'Customer A cannot read B checklist');
select portal_test.assert_true((select count(*)=0 from public.project_updates where project_id=portal_test.id('pb')),'Customer A cannot read B updates');
select portal_test.assert_true((select count(*)=0 from public.project_documents where project_id=portal_test.id('pb')),'Customer A cannot read B document metadata');
select portal_test.denied($q$insert into public.project_messages(project_id,body) values (portal_test.id('pb'),'Cross-account write')$q$,'Customer A cannot message B project');
select portal_test.denied($q$insert into public.change_requests(project_id,summary) values (portal_test.id('pb'),'Cross-account change')$q$,'Customer A cannot request changes on B project');
with changed as (update public.projects set stage='complete' where id=portal_test.id('pb') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer A cannot edit B project');
with changed as (update public.project_checklist set completed=true,label='Tampered' where id=portal_test.id('ka') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer direct checklist UPDATE cannot change content or completion');
select public.set_checklist_completed(portal_test.id('ka'),true);
select portal_test.assert_true((select completed and label='Confirm access route' from public.project_checklist where id=portal_test.id('ka')),'Customer completes own checklist through constrained RPC');
select public.set_checklist_completed(portal_test.id('ka'),false);
select portal_test.assert_true((select not completed from public.project_checklist where id=portal_test.id('ka')),'Customer can undo own checklist completion');
select portal_test.denied($q$select public.set_checklist_completed(portal_test.id('kb'),true)$q$,'Customer cannot complete B checklist through RPC');
select portal_test.denied($q$select public.set_checklist_completed(portal_test.id('ka'),null)$q$,'Checklist RPC rejects null completion');
select portal_test.assert_true((select count(*)=1 from storage.objects where bucket_id='project-documents' and name=current_setting('test.patha')),'Customer can select own object for signed URL creation');
select portal_test.assert_true((select count(*)=0 from storage.objects where bucket_id='project-documents' and name=current_setting('test.pathb')),'Customer cannot select B object for signed URL creation despite broad existing policy');
select portal_test.denied($q$insert into storage.objects(bucket_id,name) values ('project-documents',portal_test.id('pa')::text || '/33333333-3333-4333-a333-333333333333.pdf')$q$,'Customer cannot upload even to own project despite broad existing policy');
with changed as (delete from storage.objects where name=current_setting('test.patha') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot delete own document file');
with changed as (update storage.objects set metadata='{"modified":true}' where name=current_setting('test.patha') returning id)
select portal_test.assert_true((select count(*)=0 from changed),'Customer cannot replace own document file');
select portal_test.denied($q$insert into public.project_documents(project_id,label,storage_path) values (portal_test.id('pa'),'Forged metadata',portal_test.id('pa')::text || '/33333333-3333-4333-a333-333333333333.pdf')$q$,'Customer cannot insert document metadata');

reset role;
-- Exercise immutable-identity trigger even if an owner accidentally broadens an
-- UPDATE column grant later. Restore via final rollback; RLS remains in force.
grant update (project_id) on public.project_checklist to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-dddd-dddddddddddd',false);
select portal_test.denied($q$update public.project_checklist set project_id=portal_test.id('pb') where id=portal_test.id('ka')$q$,'Identity trigger stops reassignment even after accidental column grant');
select public.set_checklist_completed(portal_test.id('kb'),true);
select portal_test.assert_true((select completed from public.project_checklist where id=portal_test.id('kb')),'Administrator can complete another customer checklist');
delete from public.project_checklist where id=portal_test.id('kb');
select portal_test.assert_true((select count(*)=0 from public.project_checklist where id=portal_test.id('kb')),'Administrator can delete checklist item');
delete from storage.objects where name=current_setting('test.pathb');
delete from public.project_documents where project_id=portal_test.id('pb');
select portal_test.assert_true((select count(*)=0 from public.project_documents where project_id=portal_test.id('pb')),'Administrator can remove document metadata and file');

reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select portal_test.denied('select * from public.profiles','Anonymous cannot read profiles');
select portal_test.denied('select * from public.projects','Anonymous cannot read projects');
select portal_test.denied('select * from public.project_messages','Anonymous cannot read messages');
select portal_test.denied('select * from public.change_requests','Anonymous cannot read changes');
select portal_test.denied('select * from public.project_checklist','Anonymous cannot read checklist');
select portal_test.denied('select * from public.project_updates','Anonymous cannot read updates');
select portal_test.denied('select * from public.project_documents','Anonymous cannot read documents');
select portal_test.denied('select * from public.admin_users','Anonymous cannot read role membership');
select portal_test.denied('select public.is_admin()','Anonymous cannot execute admin RPC');
select portal_test.denied($q$select public.can_access_project(portal_test.id('pa'))$q$,'Anonymous cannot execute project RPC');
select portal_test.denied($q$select public.set_checklist_completed(portal_test.id('ka'),true)$q$,'Anonymous cannot execute checklist RPC');
select portal_test.denied($q$insert into public.projects(title,service_type,zip_code) values ('Anonymous','vault-room','55401')$q$,'Anonymous cannot create a project');
select portal_test.assert_true((select count(*)=0 from storage.objects where bucket_id='project-documents'),'Anonymous cannot read storage objects despite broad existing policy');
select portal_test.denied($q$insert into storage.objects(bucket_id,name) values ('project-documents',portal_test.id('pa')::text || '/44444444-4444-4444-a444-444444444444.pdf')$q$,'Anonymous cannot upload documents');
reset role;
rollback;
