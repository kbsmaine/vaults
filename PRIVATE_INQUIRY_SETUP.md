# Private public-inquiry delivery

Status: prepared for review, disabled, and not deployed. No real inquiry has been sent.

## Proposed delivery configuration

Use a Formspree form owned by Northwoods. Configure its receiving mailbox privately in the Formspree dashboard using the address the owner supplied in conversation. Do not put that address in this repository, client JavaScript, HTML, a form action, or a review comment.

Only these non-secret values go into `site-config.js` after setup:

```js
inquiry: Object.freeze({ enabled: true, formId: 'ACTUAL_FORM_ID' })
```

The checked-in configuration remains `{ enabled: false, formId: '' }`. The actual form ID comes from the dashboard endpoint `https://formspree.io/f/<id>`; do not invent one or use a legacy email-address endpoint.

## Connection required before activation

1. Sign in or register at https://formspree.io/register and verify the owner's mailbox.
2. Create a form called **Northwoods project inquiries** and select the confirmed private receiving mailbox. Verify that email notifications are enabled for that mailbox. Leave visitor autoresponses and unrelated integrations off.
3. Provide the form's integration endpoint. This public form ID is safe to share; do not share a password, API key, or mailbox credentials.
4. Confirm the form's spam settings support this AJAX flow. The implementation submits `_gotcha`, and Formspree performs its own spam filtering. If the account requires a CAPTCHA, its supported client challenge must be connected before activation. The implementation deliberately does not treat a CAPTCHA page or unexpected response as a successful submission. No existing CAPTCHA setting should be silently disabled.
5. Confirm the selected plan's quota and archive retention, and any available domain restrictions for `www.northwoodsvaultandsafe.com`. Nothing in this change purchases a plan or promises unlimited delivery. Keep client validation and Formspree's server email validation; configure any additional server validation supported by the chosen plan. Browser validation alone is not a security boundary.
6. Review and approve this provider configuration, then set the actual public form ID, enable the switch, and deploy the reviewed branch. The owner's original instruction requires review before enabling a submission service. A real delivery test still requires explicit approval; mocked tests do not prove inbox receipt.

No customer login is needed. The existing customer portal and database are unchanged. There are currently no deployed Supabase Edge Functions supplying a mail relay; this proposal does not use Supabase Auth emails for public inquiries.

## Customer-facing changes

- **Send inquiry** is the primary review action, in the former Copy request position.
- All existing inquiry fields and the editable summary remain. A collapsed **Keep a copy of your inquiry** option preserves copy-for-records and failure recovery.
- Sending transmits the original contact fields and edited summary. The interface discloses this clearly.
- Success requires a recognized successful Formspree response; it never claims the mailbox has received or read the email.
- Rejections and errors retain the form fields and edited summary. A recognized validation rejection can be retried; rate limits respect Retry-After.
- Unknown outcomes, including timeouts, disable another attempt to avoid an accidental duplicate. No automatic retries occur. The owner can check the Formspree submission archive for an unconfirmed inquiry.
- A status/timestamp marker in sessionStorage reduces repeat sends after a reload in the same tab. It contains no contact details or inquiry text, expires after 24 hours, and normally disappears when the tab closes. With blocked storage, the guard works only on the current page.
- This is not a claim of server-side idempotency. Another tab, cleared storage, or a manually repeated request can still create a duplicate. The earlier Worker/Resend proposal provides stronger server-side deduplication but needs more infrastructure and private credentials.

## Privacy and validation

`inquiry-privacy.html` explains transmission to Formspree, email notifications, retained provider/mailbox copies, technical anti-spam data, browser marker behavior, and deletion questions. No fixed provider retention period is invented. Only general project details should be collected.

`inquiry.js` accepts only an alphanumeric Formspree form ID, constructs a fixed HTTPS endpoint, omits credentials, rejects redirects, and never sends a client-selected receiving mailbox. Provider error text is not echoed, preventing accidental recipient disclosure or HTML injection in errors. Shared page components continue to ignore any stale `SITE_CONFIG.email` value.

`_headers` allows only the specific Formspree connection origin for compatible static hosts. GitHub Pages does not enforce this file; this change does not claim to add a live CSP header.

## Tests

21 focused mocked tests passed, plus static checks for 14 HTML pages and 10 JavaScript files with zero errors. No real provider requests were made.

Coverage: disabled/invalid configuration, no email-address endpoint, primary Send action, consent, preview freshness, edited body plus original fields, no recipient override, single request while busy, success lock, honeypot, input lengths, validation rejection/retry, rate limit cooldown, timeout, network and server failures, HTML/malformed responses, CAPTCHA redirect, reload markers, blocked browser storage, no public mailto links, and preserved copy/fallback behavior.

```sh
npm ci --prefix tests --ignore-scripts --no-audit --no-fund
node --test tests/inquiry-send.test.cjs tests/public-contact-privacy.test.cjs
python tests/check-site.py
git diff --check
```

No authenticated Formspree account, form ID, delivery rule, quota, or inbox delivery has been verified yet. Those are activation requirements, not completed work.

## Official references

- https://help.formspree.io/articles/building-your-form/building-an-html-form/
- https://help.formspree.io/articles/building-your-form/submit-forms-with-javascript-ajax/
- https://help.formspree.io/articles/building-your-form/honeypot-spam-filtering/
- https://help.formspree.io/articles/troubleshooting/how-to-prevent-spam/
- https://help.formspree.io/articles/troubleshooting/delay-on-submit-or-double-submissions/
- https://help.formspree.io/articles/form-and-project-settings/recaptcha-settings/
- https://formspree.io/legal/privacy-policy/
