(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('contactForm'), send = $('sendInquiry');
  if (!form || !send) return;
  const config = window.SITE_CONFIG?.inquiry || {};
  // Only a non-secret Formspree ID is public. Never accept recipient URLs.
  if (config.enabled !== true || !/^[a-zA-Z0-9]{6,32}$/.test(config.formId || '')) return;
  const endpoint = `https://formspree.io/f/${config.formId}`;
  const fields = $('inquiryFields'), summary = $('inquirySummary');
  const consent = $('inquiryConsent'), status = $('sendStatus');
  const markerKey = `northwoods-inquiry:${config.formId}`;
  const markerLifetime = 24 * 60 * 60 * 1000;
  let prepared = false, busy = false, terminal = '', retryAt = 0;
  let marker;
  const say = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const saveMarker = state => {
    marker = { state, time: Date.now() };
    try { sessionStorage.setItem(markerKey, JSON.stringify(marker)); } catch { /* Same-page guard remains active. */ }
  };
  const clearMarker = () => {
    marker = undefined;
    try { sessionStorage.removeItem(markerKey); } catch { /* No draft is stored. */ }
  };
  const update = () => {
    send.disabled = busy || !!terminal || !prepared || !consent.checked || Date.now() < retryAt;
    send.setAttribute('aria-busy', String(busy));
    send.textContent = busy ? 'Sending…' : terminal === 'accepted' ? 'Inquiry submitted' : 'Send inquiry';
    fields.disabled = busy;
    summary.readOnly = busy;
    consent.disabled = busy || !!terminal;
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(markerKey));
    if (saved && ['accepted', 'unconfirmed'].includes(saved.state) && Number.isFinite(saved.time) &&
        Date.now() - saved.time >= 0 && Date.now() - saved.time < markerLifetime) {
      marker = saved;
      terminal = saved.state;
      form.dataset.deliveryState = terminal;
    }
  } catch { /* Storage is optional and never contains contact details. */ }
  if (terminal === 'accepted') say('An inquiry was already submitted from this tab. Another send is disabled to avoid a duplicate.');
  else if (terminal) say('An earlier send from this tab could not be confirmed. Please ask Northwoods to check before sending again. Another send is disabled to avoid a duplicate.', true);
  else say('Review your inquiry and agree to be contacted, then choose Send inquiry.');

  form.addEventListener('inquiry:prepared', () => {
    prepared = true;
    consent.checked = false;
    if (!terminal) say('Review your inquiry and agree to be contacted, then choose Send inquiry.');
    update();
  });
  form.addEventListener('input', () => {
    prepared = false;
    consent.checked = false;
    if (!terminal) say('Project details changed. Choose Prepare inquiry again before sending.');
    update();
  });
  summary.addEventListener('input', () => {
    consent.checked = false;
    if (!terminal) say('Review your edited summary and agree to be contacted before sending.');
    update();
  });
  consent.addEventListener('change', update);

  const payload = () => {
    const result = {};
    const limits = { name: 100, email: 254, phone: 40, zip: 5, projectType: 20, floor: 30, details: 2500 };
    for (const [key, limit] of Object.entries(limits)) {
      result[key] = form.elements[key].value.trim();
      if (result[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result[key]) ||
          (key !== 'details' && /[\r\n\t]/.test(result[key]))) return null;
    }
    result.message = summary.value.trim();
    if (!form.checkValidity() || !result.name || !result.details ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) || !/^0[34]\d{3}$/.test(result.zip) ||
        !['vault-room', 'vault-door', 'gun-safe'].includes(result.projectType) ||
        !['', 'Basement', 'Ground floor', 'Upper floor', 'Garage / slab', 'Still deciding'].includes(result.floor) ||
        !result.message || result.message.length > 6000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result.message)) return null;
    return { ...result, consent: 'Contact me about this project', _gotcha: $('inquiryWebsite').value };
  };
  send.addEventListener('click', async () => {
    if (busy || terminal || !prepared || !consent.checked || Date.now() < retryAt) return;
    const data = payload();
    if (!data) { say('Please check your project fields and summary. Your details are still here.', true); return; }
    if (data._gotcha) { say('The spam check could not be completed. Your details have not been sent.', true); return; }
    busy = true;
    // Record before the network call, so reloading during an ambiguous request cannot silently resend.
    saveMarker('unconfirmed');
    form.dataset.deliveryState = 'sending';
    $('draftStatus').textContent = 'Sending your inquiry…';
    update();
    say('Sending your inquiry… Please keep this page open.');
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 20000);
      });
      const request = (async () => {
        const response = await fetch(endpoint, {
          method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
          referrerPolicy: 'origin', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        const body = await response.json();
        return { response, body };
      })();
      const { response, body } = await Promise.race([request, timeout]);
      const errorResponse = body && (Array.isArray(body.errors) && body.errors.length > 0 || typeof body.error === 'string');
      const challenge = typeof body?.next === 'string' && /captcha|challenge|verify/i.test(body.next);
      if (response.ok && body && !errorResponse && !challenge &&
          (body.ok === true || typeof body.next === 'string')) {
        terminal = 'accepted';
        saveMarker('accepted');
        say('Your inquiry was submitted to Northwoods for review. This is not an installation booking.');
      } else if ([400, 401, 403, 404, 413, 422, 429].includes(response.status) && errorResponse) {
        clearMarker();
        const codes = (body.errors || []).map(error => error.code);
        let message = 'Your inquiry was not accepted. Please check your details and try again.';
        if (codes.some(code => ['INACTIVE', 'FORM_NOT_FOUND', 'PROJECT_NOT_FOUND'].includes(code))) {
          message = 'Online sending is temporarily unavailable. Please try again later.';
        } else if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : 60;
          retryAt = Date.now() + wait * 1000;
          window.setTimeout(update, wait * 1000);
          message = 'Too many attempts. Please wait before trying again.';
        } else if (response.status === 403) {
          message = 'The spam check could not be completed. Please try again later.';
        }
        say(`${message} Your fields and edited summary are still here.`, true);
      } else throw new Error('unconfirmed');
    } catch {
      terminal = 'unconfirmed';
      say('We could not confirm whether your inquiry arrived. Your fields and edited summary are still here. Please ask Northwoods to check before sending again; another send is disabled to avoid a duplicate.', true);
    } finally {
      window.clearTimeout(timer);
      busy = false;
      form.dataset.deliveryState = terminal;
      $('draftStatus').textContent = terminal === 'accepted' ? 'Inquiry submitted. You can keep a copy for your records.' :
        terminal === 'unconfirmed' ? 'Submission is unconfirmed. Your details are still here.' : 'Your inquiry was not accepted. Your details are still here.';
      update();
      status.focus();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (busy || terminal === 'unconfirmed') { event.preventDefault(); event.returnValue = ''; }
  });
  update();
})();
