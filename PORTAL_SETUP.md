# Northwoods customer portal setup

**For your connected Vault project, database installation and public website settings are already complete. Skip steps 1 and 2 below. Read `CONNECTED_STATUS.md` for the current launch checklist. Do not rerun the fresh-install schema in this project.**

The public website and portal are in this folder. Accounts, project records, and documents are kept in your Supabase project. The website never needs your database password or a Supabase secret key.

## 1. Add the database

In your new Supabase project, open **SQL Editor → New query**. Paste the entire contents of `backend/schema.sql` and run it once. It creates the portal tables, access rules, and a private `project-documents` storage bucket together. Use a new project or review existing table names before running; this setup is designed for a new portal.

Keep Row Level Security enabled. The rules allow customers to read only their own projects and submit their own messages and change requests. Installation stages, scheduling, shared documents, and change decisions are controlled by owner accounts.

## 2. Connect the website

Open the project’s **Connect** dialog to find the Project URL and Publishable key. You can also find keys under **Settings → API Keys**. Add the two public values to `portal-config.js`:

```js
window.PORTAL_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_PUBLIC_KEY'
});
```

The public key is designed to be visible in website source; the database access rules supply the protection. This build accepts the newer `sb_publishable_` key format. Never place a secret key, a legacy `service_role` key, database passwords, customer exports, or SMTP credentials in these website files or a GitHub repository.

With missing settings, the account page shows an honest “Opening soon” message. It does not collect passwords or simulate accounts.

## 3. Host from your GitHub repository

Keep your website source in a GitHub repository. A private repository is a sensible default while you work on it. Public source can also work: customers’ records belong in Supabase, not in repository files.

For this business site with customer sign-in, use **Cloudflare Pages** for web hosting. GitHub Pages is static hosting, and its usage rules restrict business hosting and say it should not be used for password transactions.

1. Put the contents of the `vaults` folder at the root of your GitHub repository.
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Import an existing Git repository**.
3. Select your repository and production branch.
4. Choose no framework preset. Set **Build command** to `node build.cjs` and **Build output directory** to `dist`.
5. Deploy. You can start with the provided `pages.dev` address and add your business domain later.

If your repository keeps the surrounding `vaults` directory, set the build’s root directory to `vaults` instead. The build copies only website files to `dist`; SQL scripts, setup notes, and tests remain out of the published website. Keep `_headers` in the output for the site’s security and caching settings. The website does not require a paid JavaScript framework or an application server.

## 4. Set account email and redirect settings

In Supabase **Authentication**, enable email/password sign-in and new user registrations. Keep **Confirm email** on. Set the minimum password length to **12**. Keep anonymous sign-in disabled.

In **Authentication → URL Configuration**:

- Set **Site URL** to your published website origin, for example `https://northwoods-example.pages.dev`.
- Add the exact redirect URLs used by this site:
  - `https://YOUR-SITE/account.html?mode=confirmed`
  - `https://YOUR-SITE/account.html?mode=update-password`
- If you use a custom domain, add those URLs for that domain too. Add local URLs only for local testing; avoid broad production wildcard redirects.

Cloudflare Pages may normalize `.html` URLs to extensionless paths. These redirects retain the query and fragment used by the account page. Allow the `.html` URLs above because those are the exact values sent by this app to Supabase.

Configure **custom SMTP** in Supabase for real customer confirmation and reset emails. Supabase’s default mail service is for testing, restricts recipients, and has a very low rate limit. New Free projects also need custom SMTP to customize auth email templates. Keep the default `{{ .ConfirmationURL }}` link in the confirmation and password recovery templates; it returns customers to `account.html` after verification. Never put SMTP credentials in `portal-config.js`.

This version sends project activity through the portal only. Email and text notifications for project updates are not implemented. Auth emails for confirmation and password reset are separate.

## 5. Give yourself owner access

First, use the website’s **Create an account** form to create your own account and confirm your email. Then, in Supabase SQL Editor, run the owner bootstrap statement documented in `backend/README.md`, replacing its email placeholder with the exact email you registered.

Owner access is assigned in the database. There is no public “make me an admin” setting, and changing browser storage or user profile metadata cannot grant the role.

Sign in and open `admin.html`, or follow the Owner dashboard link inside your customer portal. You can now see customer project requests, update schedules and stages, post updates, respond to messages, review changes, add preparation tasks, and share documents.

## 6. Confirm the complete flow before inviting customers

Use two different customer test accounts and your owner account. Confirm both emails.

- Each customer can submit a project request and see only their own project.
- The owner can update that project’s stage and planned installation date, post an update, and send a reply.
- A customer can request a change. Its status changes only after the owner reviews it.
- A preparation task can be checked off by its customer and is visible to the owner after refresh.
- A PDF, PNG, or JPG under 10 MB uploaded by the owner can be downloaded by that project’s customer. Another customer cannot access it. Download links expire quickly; obtain a new one from the portal if needed.
- Signing out prevents access to project data. Password reset emails return to the password form and allow a fresh sign-in afterward.
- Check the account, customer, and owner pages on a phone as well as a desktop. Confirm there are no browser console errors, redirects to the wrong domain, or blocked requests.

`backend` includes automated database checks using a local PostgreSQL runtime with Supabase auth/storage stubs. These verify SQL permissions and row isolation. `tests` includes JavaScript account/API checks. Local automated checks do not replace a final test against your configured Supabase project, its email provider, and your hosted site.

## Day-to-day use

A customer registers, confirms their email, signs in, and creates a project request. You review it in the owner dashboard and take it through request received, site review and planning, equipment and preparation, installation scheduled, installation in progress, and complete. An installation date is described as planned until you confirm details with the customer. Change requests are reviewable records; they do not automatically alter project scope, price, or scheduling.

Refresh the selected project to see new activity. This first version does not use realtime subscriptions, send project notification emails, collect card payments, or provide electronic signatures. Quotes, invoices, installation notes, and warranty information can be shared as private documents.

The portal keeps a basic progress history. It is not a tamper-proof audit service. Customer accounts and records remain until you manage deletion through Supabase. To remove an account, revoke its sessions first; old access tokens can remain valid until their expiry. Review retained project documents before deleting a customer. Configure backups appropriate to your Supabase plan.

Update the real business contact details in `site-config.js` before launch. Review `portal-privacy.html` against the way you actually handle customer information. Do not collect safe combinations, alarm codes, payment card numbers, or detailed firearm inventories in project messages.

## Primary references

- [Cloudflare static HTML deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Supabase public and secret API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase email delivery setup](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase private storage access](https://supabase.com/docs/guides/storage/security/access-control)

Implementation prepared September 15, 2026. The bundled Supabase JavaScript SDK is pinned to 2.116.0; its MIT license is included under `assets/vendor`. Recheck provider documentation when changing hosting, authentication settings, or dependency versions.
