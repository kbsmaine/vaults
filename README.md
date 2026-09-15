# Northwoods Vault & Safe

Complete public website with a Supabase-backed customer portal and owner dashboard.

**Start with `CONNECTED_STATUS.md`. Your Vault database is installed and the website configuration is filled in. `PORTAL_SETUP.md` covers the remaining email and hosting setup.**

The website source can live in GitHub. Use Cloudflare Pages for the actual customer website and Supabase for accounts and private project records. This package is connected to the Vault database. Publishing the website, configuring final email redirects/delivery, and a hosted verification pass remain.

New pages:

- `account.html`: sign-in, registration, email confirmation, and password reset.
- `portal.html`: customer projects, progress, messages, change requests, preparation checklist, and documents.
- `admin.html`: owner project management and customer communication.
- `portal-privacy.html`: plain-language information about portal data.

Open `index.html` after extracting the entire ZIP to inspect the public website. To exercise account pages locally, serve the folder over HTTP (for example `python -m http.server 8000`) and configure matching Supabase auth redirect URLs. Real accounts need the backend configuration; opening an HTML file alone does not activate login.

Build for Cloudflare Pages with `node build.cjs` and publish the `dist` directory. No npm install is required for the website. SQL setup and test files stay in the source repository and are excluded from the deployment.

The existing public inquiry planner still prepares a summary for copying; it does not send that public form. Customers can submit an actual project request after signing in to the new portal. Business contact details in `site-config.js` remain blank until confirmed.

## Public website and assets

The public pages describe indoor vault rooms, vault door supply and installation, and gun safe installation across Maine and New Hampshire. Vault doors are sourced through Safe & Vault Store. The design uses forest green, warm cream, and pale lime, with responsive layouts and visible keyboard focus.

The homepage image is an original AI-created architectural concept rendering, labeled on the site. It does not represent a completed installation or a specific supplier product. The statewide Maine/New Hampshire service map uses public-domain Natural Earth boundary data. See `assets/ASSET_NOTES.md` for provenance.

## Business settings

Edit `site-config.js` to add your verified public phone number and email. `phoneHref` takes a dialable number without `tel:`; `email` takes an email address without `mailto:`. Empty contact fields remain hidden. The confirmed business name is Northwoods Vault & Safe.

The public planner at `contact.html` prepares an editable inquiry and optionally opens an email draft when a business email is configured. Its ZIP format check does not confirm installation suitability or scheduling availability. The new customer portal submits actual project requests to Supabase after sign-in.

## Main code

- `styles.css`, `components.js`, `app.js`: public design, shared navigation/footer, and public inquiry planner.
- `portal-config.js`: the Supabase public URL and publishable key.
- `portal-api.js`: account/session access and database/storage operations.
- `account.js`, `portal.js`, `admin.js`: account, customer, and owner interactions.
- `portal.css`, `account.css`: portal layouts using the existing brand.
- `backend/schema.sql`: database setup, permissions, and private storage policies.
- `build.cjs`, `_headers`: static hosting build and browser security headers.

## Verification

See `VALIDATION.md` for automated checks and their limits. Browser rendering was not available in this workspace, so review the new account/customer/owner screens on desktop and mobile before inviting real customers. Live authentication, email delivery, and file downloads must also be checked after your Supabase settings and hosted domain are connected.
