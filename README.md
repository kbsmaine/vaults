# Northwoods Vault & Safe website

A responsive, standalone website for a company providing indoor vault rooms, vault door supply and installation, and gun safe installation across Maine and New Hampshire. Vault doors are sourced through Safe & Vault Store.

## Preview

Open `index.html` in a browser. The site uses ordinary HTML, CSS, JavaScript, and local image assets; there is no build or package installation step. For development, you can also serve this folder with a static file server. Keep the supplied directory structure intact.

## Business identity and contact details

Edit `site-config.js` to set the confirmed business name, wordmark, phone number, and email address. The current business name is **Northwoods Vault & Safe**. No phone number or email address was provided, so those fields are intentionally empty and their contact links remain hidden.

- `businessName`: full company name used in the shared interface and inquiry summary.
- `brandPrimary` / `brandSecondary`: two lines of the navigation and footer wordmark.
- `phoneDisplay`: the readable phone number.
- `phoneHref`: a dialable number, ideally including its country code, without a `tel:` prefix.
- `email`: the public inquiry email address, without a `mailto:` prefix.

If the business name changes again, review the text on each HTML page as well as the shared configuration. Confirm the service descriptions and chosen product details before public use.

## Inquiry behavior

The project inquiry has no backend or submission service. It creates an editable summary in the current page, which the visitor can copy. If an email address is configured, an **Open email draft** link opens the visitor's email application with the current summary. Sending occurs only when the visitor sends that email. No request is presented as received, booked, or submitted by the website.

The page does not create accounts, persist requests, or store passwords. Entered details remain in the live page; browser autofill and page restoration remain subject to the visitor's browser settings. The website makes no form submission or background request with inquiry data. Copy uses the browser clipboard when available and selects the summary for manual copying otherwise. The disabled form includes a clear JavaScript fallback.

The ZIP field checks a five-digit format beginning with `03` or `04`, the prefix range for Maine and New Hampshire; it does not verify a specific postal location, availability, or installation suitability. Use project follow-up to confirm the actual location and scope.

Preselect a service with `contact.html?service=vault-room`, `contact.html?service=vault-door`, or `contact.html?service=gun-safe`.

## Design and assets

The design uses a forest green, warm cream, and muted bronze palette with responsive layouts, visible keyboard focus, semantic headings, mobile navigation, and reduced-motion support. Content remains visible without reveal animations.

The supplied hero image is an original AI-created architectural concept rendering. It is labeled as a rendering on the site and is not a photograph of a completed installation. Do not present it as project history or evidence of actual products.

The service-area map is built from public-domain Natural Earth state boundary data, with Maine and New Hampshire highlighted. It depicts statewide coverage; it is not a property survey, route map, or promise of access to a particular site. See https://www.naturalearthdata.com/about/terms-of-use/ for Natural Earth's public-domain terms.

## Main files

- `index.html`: homepage and service overview.
- `styles.css`: complete responsive visual design.
- `site-config.js`: business identity and optional contact details.
- `components.js`: shared navigation, footer, and configured contact links.
- `app.js`: mobile navigation and editable inquiry preparation.
- `contact.html`: project inquiry planner.
- `vault-rooms.html`, `safe-installation.html`, `vault-doors.html`: service information.
- `process.html`, `standards.html`, `service-area.html`, `faq.html`: planning and service details.
- Local asset directory: rendering and geographic map artwork.

## Validation and launch handoff

JavaScript syntax, internal page/asset references, content consistency, and inquiry behavior should be checked before delivery. Review the site in desktop and mobile browsers before public launch. There is no server configuration, analytics integration, payment flow, external form provider, or automatic email delivery in this package.

Hosting these static files is a separate deployment step. Connecting a backend later requires replacing the inquiry behavior and explaining the actual collection, sending, and retention of information to visitors.

## Validation for this delivery

- Checked all nine HTML pages for one main landmark and H1, unique IDs, and correct shared-script loading order.
- Checked local page links, anchors, image references, CSS assets, and SVG XML.
- All three JavaScript files pass Node syntax checks.
- Reviewed responsive stylesheet rules and corrected the mobile-menu keyboard focus behavior.
- Browser rendering and interaction testing were not completed: the available browser policy blocked the local preview. Open `index.html` in your own browser and check desktop/mobile layouts, navigation, and inquiry preparation before publishing.

See `assets/ASSET_NOTES.md` for the original illustration prompt and map provenance.
