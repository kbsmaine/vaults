# Validation record — September 15, 2026

## Passed locally

- **83 PostgreSQL security/workflow assertions** against the complete setup script in PGlite (PostgreSQL in WebAssembly). Auth and Storage platform schemas are represented by disposable fixtures. Tests cover all eight RLS tables, anonymous denial, customer-to-customer isolation, metadata escalation attempts, protected owner membership, restricted writes, immutable identity, message attribution, checklist RPC scoping, and private Storage SQL policies. Deliberately broad existing Storage policies do not defeat the portal guards.
- **31 Node test cases**: 29 authentication/API cases plus customer and owner interaction suites. The interaction suites include multiple workflow assertions. Tests use controlled API responses and a DOM model, not a real browser or live Supabase service.
- **13 HTML pages and 8 application JavaScript files** pass source checks: landmarks, unique IDs, explicit labels, dependency loading order, local links/anchors, image alternatives, SVG parsing, CSS asset references, and JavaScript syntax.
- **Static build passed** using `node build.cjs`. Website pages, assets, public configuration, and `_headers` are copied to `dist`; database setup scripts, tests, and instructions are excluded.

The tests exercise failed saves without losing drafts, repeat submission protection, stale project response rejection, correct ownership when making requests, email-confirmation flow, password recovery, partial password-reset/signout failure, signed download URL requests, upload failure cleanup, and owner gating.

## Not yet verified

The Supabase project URL/key are not configured in this package. The database script has not been applied to a live project. No real customer accounts have been created, no real email has been sent, and no website has been deployed by this work.

Live account confirmation, password resets, Supabase Data API access, Storage upload restrictions, signed URL expiry, hosting headers, and final domain redirects need a hosted integration test. The SQL tests prove row-policy behavior, not the behavior of Supabase’s HTTP services.

Browser rendering was blocked by the workspace’s browser policy, so there is no desktop/mobile screenshot verification for the new portal pages. The approved public design was retained, with a new Customer portal navigation link. Review the new pages in desktop and mobile browsers before inviting customers.

## Reproduce checks

From the extracted `vaults` directory:

```sh
python tests/check-site.py
npm ci --prefix tests
npm test --prefix tests
npm ci --prefix backend/tests
npm test --prefix backend/tests
```

Only tests need npm dependencies. The website ships its pinned browser SDK and requires no npm installation. Never run `backend/tests/stubs.sql` or `backend/tests/security.sql` against your live Supabase database.
