# Northwoods portal database

`schema.sql` installs the portal tables, Auth profile synchronization, authorization rules, project activity triggers, and private document bucket. Run this file as the database owner in the Supabase SQL Editor for the intended project. It is a fresh-install script wrapped in a transaction. It deliberately stops if the application tables already exist, so it cannot silently reuse incompatible tables or permissive application policies. Do not run the test stubs against a real Supabase project.

Use a frontend **publishable** key with the project URL in `portal-config.js`. Keep database passwords, secret keys, and service-role keys out of the website. The browser has the same unprivileged Supabase `authenticated` role for customers and administrators; database policies distinguish administrator membership.

## Install and assign the first administrator

1. Run all of `schema.sql` in the correct project's SQL Editor. Existing Auth users receive profiles automatically; subsequent account creation and profile changes stay synchronized.
2. Configure email/password authentication, enable email confirmation, and add the website account page to the allowed Auth redirect URLs as described in `../PORTAL_SETUP.md`. Keep anonymous sign-ins disabled; this portal uses identified email accounts.
3. Create the intended administrator account through the website and confirm its email address.
4. Replace the email in the following SQL and run it as the database owner. This is the only administrator promotion route. An unconfirmed account will not be promoted.

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('owner@example.com')
  and email_confirmed_at is not null
on conflict (user_id) do nothing
returning user_id;
```

For a new administrator, this returns exactly one UUID. An empty result means the account is absent, its email is unconfirmed, or it was already an administrator. Verify membership with this owner-only query:

```sql
select u.id, u.email, u.email_confirmed_at
from auth.users u
join public.admin_users a on a.user_id = u.id
where lower(u.email) = lower('owner@example.com');
```

Sign out and back in to open the administrator page. To revoke administrator membership, run the following owner-only SQL; authorization checks read membership directly, so the next request observes the revocation:

```sql
delete from public.admin_users
where user_id = (
  select id from auth.users
  where lower(email) = lower('owner@example.com')
);
```

Neither a customer nor an administrator using the website can promote accounts. User-editable Auth metadata supplies only the display name. The `service_role` database role also has no direct permission to change `admin_users`; use the SQL owner for membership management.

## Authorization behavior

- Signed-out `anon` callers receive no application table grants and cannot execute the three public RPCs. Signed-in customers see their own profile and projects; administrators can list customer profiles and access every project.
- Customers may create their own project in `requested` stage with no installation date or scheduling note. Only administrators can edit the project title, stage, installation date, and scheduling note. Original ownership and submission fields are immutable.
- Project participants can append messages. The database validates the authenticated author ID and stamps the profile name, preventing forged team replies. Existing messages cannot be edited through the API.
- Customer change requests start pending with an empty team response. Administrators can review them; the original request remains immutable.
- Administrators manage checklist labels and ordering. Customers can change only completion through `set_checklist_completed(item_id, is_completed)`, which independently checks project access.
- Administrators post project updates. Stage, installation-date, and scheduling-note changes automatically create a readable activity entry in the same transaction.
- Documents use the private `project-documents` bucket, limited to 10 MiB and PDF, JPEG, and PNG MIME types. Administrators upload files; customers can read files in their own projects. File paths must be a valid existing project UUID followed by a generated UUID with a supported extension; the schema also accepts UUID-prefixed filenames. Metadata cannot refer to another project folder.
- Storage policies restrict the SQL `SELECT` that authorizes signed-URL creation. The frontend requests URLs lasting 60 seconds. Anyone holding an already-created signed URL can use it until it expires, so these are short-lived download links.

`portal_private` must stay outside the Data API's exposed schemas. Public RPC functions are security-invoker wrappers; privileged implementations are in the private schema with fixed empty search paths, explicit execution grants, and independent identity checks. Triggers cannot be called directly by clients. All eight application tables use RLS and explicit grants, including column-level restrictions where needed. Storage has additional restrictive guards so an unrelated permissive Storage policy cannot expose the portal bucket or let clients change its privacy settings.

The script updates only the `project-documents` bucket settings and adds policies scoped to this bucket; it does not replace policies for other buckets. Project deletion cascades database records. Remove document files through the Storage API before deleting a project or Auth account to avoid orphaned blobs; never delete Storage table rows directly to remove files.

## Run the local security suite

Requires Node.js and npm. The pinned test dependency runs PostgreSQL in WebAssembly. It needs no Supabase credentials or active service.

```sh
cd backend/tests
npm ci
npm test
```

Alternatively, on a fresh **disposable** PostgreSQL database, run all three files in order using an owner connection capable of creating roles:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/tests/stubs.sql \
  -f backend/schema.sql \
  -f backend/tests/security.sql
```

The stubs create simplified Auth and Storage schemas and reproduce broad historical Supabase grants. The tests deliberately install permissive existing Storage policies to prove the portal's restrictive guards still work. Each assertion fails the run immediately if an expected allow, deny, or invariant does not hold. Test fixtures are rolled back.

The suite covers anonymous access, cross-customer reads and writes, metadata-based escalation attempts, membership protection, field constraints, original identity immutability, author verification, customer and administrator workflows, checklist RPC scoping, document metadata paths, and Storage SQL access required for signed URLs.

These are executable database authorization tests. They do not test live email delivery, Supabase HTTP endpoints, the creation or expiry of actual signed URLs, or Storage's MIME/size enforcement. After configuration, check those integrations with two confirmed customer accounts and one administrator in the real project. Supabase database advisors should also be run after applying the schema.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security](https://supabase.com/docs/guides/database/functions), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [Auth profile triggers](https://supabase.com/docs/guides/auth/managing-user-data).
