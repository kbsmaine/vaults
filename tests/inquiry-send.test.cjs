const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (status, body, retryAfter = null) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: () => retryAfter }, json: async () => body
});
const success = () => response(200, { next: 'https://formspree.io/thanks' });
function setup(t, { config = { enabled: true, formId: 'testform' }, fetcher = success, marker, blockedStorage = false } = {}) {
  const dom = new JSDOM(read('contact.html'), { url: 'https://example.test/contact.html', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, calls = [], timers = [];
  const realTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, delay) => {
    if (delay >= 20000) { timers.push({ fn, delay }); return 10000 + timers.length; }
    return realTimeout(fn, delay);
  };
  w.matchMedia = () => ({ matches: true });
  w.fetch = (url, options) => {
    calls.push({ url, options });
    return Promise.resolve().then(() => fetcher(url, options));
  };
  w.eval(read('site-config.js'));
  w.SITE_CONFIG = { ...w.SITE_CONFIG, inquiry: config };
  if (marker) w.sessionStorage.setItem('northwoods-inquiry:testform', JSON.stringify(marker));
  if (blockedStorage) Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('Mock storage denied'); } });
  for (const file of ['components.js', 'app.js', 'inquiry.js']) w.eval(read(file));
  const form = d.querySelector('#contactForm');
  const values = { name: 'Mock Visitor', email: 'visitor@example.test', phone: '555-0100', zip: '04084',
    projectType: 'vault-door', floor: 'Basement', details: 'A mock vault door project.' };
  const prepare = () => {
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  };
  const agree = () => { d.querySelector('#inquiryConsent').checked = true; d.querySelector('#inquiryConsent').dispatchEvent(new w.Event('change')); };
  const send = () => d.querySelector('#sendInquiry').click();
  const snapshot = () => JSON.stringify({ fields: Object.keys(values).map(name => form.elements[name].value), summary: d.querySelector('#inquirySummary').value });
  return { dom, w, d, form, calls, timers, prepare, agree, send, snapshot };
}

test('disabled configuration and email-like form IDs never send', async t => {
  for (const config of [{ enabled: false, formId: 'testform' }, { enabled: true, formId: '' },
    { enabled: true, formId: 'owner@example.test' }, { enabled: true, formId: '../other' },
    { enabled: true, formId: 'https://other.test/f/testform' }]) {
    const s = setup(t, { config }); s.prepare(); s.agree(); s.send(); await flush();
    assert.equal(s.calls.length, 0);
    assert.equal(s.d.querySelector('#sendInquiry').disabled, true);
  }
});
test('Send is the primary action; copy remains a secondary records option', t => {
  const s = setup(t);
  assert.equal(s.d.querySelector('.inquiry-actions > button').id, 'sendInquiry');
  assert.ok(s.d.querySelector('details #copyRequest'));
  assert.equal(s.d.querySelector('a[href^="mailto:"]'), null);
});
test('preparation and consent are required before a request', async t => {
  const s = setup(t); s.agree(); s.send(); await flush(); assert.equal(s.calls.length, 0);
  s.prepare(); s.send(); await flush(); assert.equal(s.calls.length, 0);
  s.agree(); s.send(); await flush(); assert.equal(s.calls.length, 1);
});
test('sends edited summary and original fields, without recipient overrides or cookies', async t => {
  const s = setup(t); s.prepare();
  s.d.querySelector('#inquirySummary').value = 'Edited text & Unicode café <script>not executable</script>';
  s.d.querySelector('#inquirySummary').dispatchEvent(new s.w.Event('input'));
  s.agree(); const before = s.snapshot(); s.send(); await flush();
  assert.equal(s.calls[0].url, 'https://formspree.io/f/testform');
  const request = s.calls[0].options, body = JSON.parse(request.body);
  assert.equal(body.message, s.d.querySelector('#inquirySummary').value);
  assert.equal(body.email, 'visitor@example.test');
  assert.equal(body.details, 'A mock vault door project.');
  for (const key of ['to','cc','bcc','recipient','_replyto','_next']) assert.equal(key in body, false);
  assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
  assert.equal(s.snapshot(), before);
  assert.equal(s.form.dataset.deliveryState, 'accepted');
});
test('double clicks and post-success sends make exactly one request', async t => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const s = setup(t, { fetcher: () => pending }); s.prepare(); s.agree(); s.send(); s.send(); await flush();
  assert.equal(s.calls.length, 1); assert.equal(s.d.querySelector('#inquirySummary').readOnly, true);
  assert.equal(s.d.querySelector('#inquiryFields').disabled, true);
  resolve(success()); await flush(); s.send(); await flush(); assert.equal(s.calls.length, 1);
  assert.equal(s.d.querySelector('#inquiryFields').disabled, false);
});
test('changed fields require a fresh preview and edited summaries require renewed consent', t => {
  const s = setup(t); s.prepare(); s.agree();
  s.d.querySelector('#inquirySummary').dispatchEvent(new s.w.Event('input'));
  assert.equal(s.d.querySelector('#sendInquiry').disabled, true);
  s.agree(); s.form.elements.details.dispatchEvent(new s.w.Event('input', { bubbles: true })); s.agree();
  assert.equal(s.d.querySelector('#sendInquiry').disabled, true);
});
test('honeypot and invalid or oversized summaries do not send', async t => {
  for (const value of ['', 'x'.repeat(6001), '\u0000']) {
    const s = setup(t); s.prepare(); s.d.querySelector('#inquirySummary').value = value; s.agree(); s.send(); await flush();
    assert.equal(s.calls.length, 0);
  }
  const s = setup(t); s.prepare(); s.d.querySelector('#inquiryWebsite').value = 'spam'; s.agree(); s.send(); await flush();
  assert.equal(s.calls.length, 0);
});
test('confirmed validation failure retains data and permits a deliberate retry', async t => {
  let count = 0;
  const s = setup(t, { fetcher: () => ++count === 1 ? response(422, { errors: [{ code: 'TYPE_EMAIL', message: 'Untrusted provider text' }] }) : success() });
  s.prepare(); s.agree(); const before = s.snapshot(); s.send(); await flush();
  assert.equal(s.snapshot(), before); assert.equal(s.d.querySelector('#sendInquiry').disabled, false);
  assert.equal(s.d.body.textContent.includes('Untrusted provider text'), false);
  s.send(); await flush(); assert.equal(s.calls.length, 2); assert.equal(s.form.dataset.deliveryState, 'accepted');
});
test('rate limits retain data and enforce Retry-After without automatically retrying', async t => {
  const s = setup(t, { fetcher: () => response(429, { error: 'Rate limit' }, '120') });
  s.prepare(); s.agree(); const before = s.snapshot(); s.send(); await flush();
  assert.equal(s.snapshot(), before); s.send(); assert.equal(s.calls.length, 1);
  assert.equal(s.d.querySelector('#sendInquiry').disabled, true);
});
for (const [label, fetcher] of [
  ['network failure', () => { throw new Error('Mock offline'); }],
  ['server failure', () => response(500, { error: 'Unknown server failure' })],
  ['malformed success', () => response(200, { wrong: true })],
  ['HTML response', () => ({ ...response(200, {}), json: async () => { throw new Error('HTML'); } })],
  ['captcha redirect', () => response(200, { next: 'https://formspree.io/recaptcha' })]
]) test(`${label} keeps all input, never claims success, and prevents ambiguous resending`, async t => {
  const s = setup(t, { fetcher }); s.prepare(); s.agree(); const before = s.snapshot(); s.send(); await flush();
  assert.equal(s.snapshot(), before); assert.equal(s.form.dataset.deliveryState, 'unconfirmed');
  assert.equal(s.d.querySelector('#inquirySummary').readOnly, false);
  assert.match(s.d.querySelector('#sendStatus').textContent, /could not confirm/);
  s.send(); await flush(); assert.equal(s.calls.length, 1);
});
test('timeout preserves input even when the network mock ignores cancellation', async t => {
  const s = setup(t, { fetcher: () => new Promise(() => {}) }); s.prepare(); s.agree();
  const before = s.snapshot(); s.send(); await flush(); s.timers.find(timer => timer.delay === 20000).fn(); await flush();
  assert.equal(s.snapshot(), before); assert.equal(s.form.dataset.deliveryState, 'unconfirmed');
  assert.equal(s.calls[0].options.signal.aborted, true);
});
test('reload markers block resending and store no customer content', async t => {
  const s = setup(t); s.prepare(); s.agree(); s.send(); await flush();
  const raw = s.w.sessionStorage.getItem('northwoods-inquiry:testform');
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['state','time']);
  for (const state of ['accepted','unconfirmed']) {
    const reload = setup(t, { marker: { state, time: Date.now() } });
    reload.prepare(); reload.agree(); reload.send(); await flush(); assert.equal(reload.calls.length, 0);
  }
});
test('blocked storage still allows sending with same-page duplicate protection', async t => {
  const s = setup(t, { blockedStorage: true }); s.prepare(); s.agree(); s.send(); await flush(); s.send(); await flush();
  assert.equal(s.calls.length, 1); assert.equal(s.form.dataset.deliveryState, 'accepted');
});
