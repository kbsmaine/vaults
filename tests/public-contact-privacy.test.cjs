const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const privateAddress = 'private-owner@example.test';
function page(name, { staleConfig = false, clipboardFails = false } = {}) {
  const dom = new JSDOM(read(name), {
    url: `https://example.test/${name}`, runScripts: 'outside-only'
  });
  const w = dom.window;
  let copied;
  w.matchMedia = () => ({ matches: true });
  w.fetch = () => { throw new Error('Network is forbidden in privacy tests'); };
  Object.defineProperty(w.navigator, 'clipboard', { value: {
    writeText: async value => {
      if (clipboardFails) throw new Error('Mock clipboard denied');
      copied = value;
    }
  }});
  w.eval(read('site-config.js'));
  if (staleConfig) w.SITE_CONFIG = { ...w.SITE_CONFIG, email: privateAddress };
  w.eval(read('components.js'));
  w.eval(read('app.js'));
  return { dom, w, d: w.document, copied: () => copied };
}

test('public configuration has no email recipient', () => {
  const { dom, w } = page('contact.html');
  assert.equal(Object.hasOwn(w.SITE_CONFIG, 'email'), false);
  dom.window.close();
});

test('every page ignores a cached email recipient and has no mailto links', () => {
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const { dom, d } = page(name, { staleConfig: true });
    assert.equal(d.documentElement.outerHTML.includes(privateAddress), false, name);
    assert.equal(d.querySelector('a[href^="mailto:"]'), null, name);
    assert.equal(d.querySelector('#emailDraft'), null, name);
    dom.window.close();
  }
});

for (const clipboardFails of [false, true]) {
  test(`inquiry stays editable with ${clipboardFails ? 'failed' : 'successful'} copying`, async () => {
    const { dom, w, d, copied } = page('contact.html', { staleConfig: true, clipboardFails });
    const form = d.querySelector('#contactForm');
    const fields = { name: 'Mock Visitor', email: 'visitor@example.test', zip: '04084',
      projectType: 'vault-door', details: 'Mock project description' };
    for (const [name, value] of Object.entries(fields)) form.elements[name].value = value;
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(d.querySelector('#inquiryPreview').hidden, false);
    const summary = d.querySelector('#inquirySummary');
    summary.value += '\nEdited project details';
    summary.dispatchEvent(new w.Event('input', { bubbles: true }));
    const edited = summary.value;
    d.querySelector('#copyRequest').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(summary.value, edited);
    assert.equal(form.elements.details.value, fields.details);
    assert.equal(edited.includes(privateAddress), false);
    if (clipboardFails) {
      assert.equal(summary.selectionStart, 0);
      assert.equal(summary.selectionEnd, edited.length);
    } else assert.equal(copied(), edited);
    assert.match(d.querySelector('#inquiry-privacy').textContent, /does not send/);
    dom.window.close();
  });
}
