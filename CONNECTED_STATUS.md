# Connected project status — September 15, 2026

Supabase project **Vault** (`wjhycvfafglsqoyknzvz`) is connected. The portal database and private document storage are installed, and `portal-config.js` contains the real project URL and public publishable key.

## Completed

- Installed `northwoods_customer_portal` and `northwoods_security_checks` in the live project.
- Confirmed all eight portal tables have RLS enabled.
- Confirmed `project-documents` is private and limited to PDF/JPEG/PNG files up to 10 MiB.
- Confirmed anonymous REST reads of profiles/projects and the owner-check RPC return permission errors.
- Confirmed email sign-in and new registrations are enabled, email confirmation is required, and anonymous sign-in is disabled.
- Added the foreign-key index identified during database review and removed unnecessary public execution access to the platform RLS event-trigger helper. The automatic RLS trigger remains enabled.
- Rechecked the security advisor: no warnings remain. Its informational notice for `admin_users` is intentional; the role-membership table has no client policies or client grants. Only the database owner manages it. See [Supabase's explanation of the informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Still needed before customer launch

1. Publish the updated site files to the chosen host. The current website is `https://kbsmaine.github.io/vaults/`; this work has not changed that deployment or its GitHub repository. Use GitHub for source and Cloudflare Pages for customer-facing hosting as described in `PORTAL_SETUP.md`.
2. Set Supabase's Site URL and exact account confirmation/recovery redirect URLs for the final hosted address. Available project tools did not expose the Auth URL settings, so they have not been changed or verified.
3. Configure production email delivery/custom SMTP and a 12-character minimum password policy. Those settings were not exposed by the public Auth settings endpoint and have not been verified.
4. Register your owner account on the website, confirm its email, and assign owner access using the verified-email SQL in `backend/README.md`.
5. Run the live customer/owner, email, document-download, and desktop/mobile checks in `PORTAL_SETUP.md`.

Do not rerun `backend/schema.sql` in this Vault project: it is already installed. The script is retained as the consolidated fresh-install schema for review or a separate new project. No live test users, messages, or emails were created during setup.
