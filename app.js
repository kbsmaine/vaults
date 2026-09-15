(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const nav = $('.main-nav');
  const toggle = $('.menu-toggle');
  const setMenu = open => {
    if (!nav || !toggle) return;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    if (open) nav.querySelector('a')?.focus();
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('click', event => {
    if (nav?.classList.contains('is-open') && !nav.contains(event.target) && !toggle?.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('is-open')) { setMenu(false); toggle?.focus(); }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 940) setMenu(false); });
  // Content is visible by default. Animation is an optional enhancement only.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }
  const form = $('#contactForm');
  if (!form) return;
  const fields = $('#inquiryFields');
  const status = $('#formStatus');
  const preview = $('#inquiryPreview');
  const summary = $('#inquirySummary');
  const copyButton = $('#copyRequest');
  const emailDraft = $('#emailDraft');
  const draftStatus = $('#draftStatus');
  const emailDraftNote = $('#emailDraftNote');
  const config = window.SITE_CONFIG || {};
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(config.email || '') ? config.email : '';
  const serviceLabels = { 'vault-room': 'Indoor vault room', 'vault-door': 'Vault door', 'gun-safe': 'Gun safe' };
  const selectedService = new URLSearchParams(window.location.search).get('service');
  if (Object.hasOwn(serviceLabels, selectedService || '')) form.elements.projectType.value = selectedService;
  const updateDraft = () => {
    if (!email || !emailDraft) return;
    const subject = `Project inquiry — ${config.businessName || 'Northwoods Vault & Safe'}`;
    emailDraft.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary.value)}`;
    emailDraft.hidden = false;
    if (emailDraftNote) emailDraftNote.hidden = false;
  };
  const clearErrors = () => {
    form.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
    status.textContent = '';
    status.classList.remove('is-error');
  };
  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
    if (!preview.hidden) {
      draftStatus.textContent = 'Project details changed. Choose “Prepare inquiry” again to update your summary.';
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearErrors();
    for (const key of ['name', 'details']) {
      const field = form.elements[key];
      field.setCustomValidity(field.value.trim() ? '' : 'Please complete this field.');
    }
    const zip = form.elements.zip;
    zip.setCustomValidity(/^0[34]\d{3}$/.test(zip.value.trim()) ? '' : 'Enter a five-digit Maine or New Hampshire ZIP code, starting with 03 or 04.');
    const invalid = Array.from(form.elements).find(field => field.willValidate && !field.checkValidity());
    if (invalid) {
      invalid.setAttribute('aria-invalid', 'true');
      status.classList.add('is-error');
      const label = form.querySelector(`label[for="${invalid.id}"]`);
      status.textContent = `Please check ${label?.textContent.replace(/\s*\*\s*$/, '').trim().toLowerCase() || 'the highlighted field'}. ${invalid.validationMessage}`;
      invalid.focus();
      return;
    }
    const data = new FormData(form);
    const value = key => String(data.get(key) || '').trim();
    summary.value = [
      `Project inquiry for ${config.businessName || 'Northwoods Vault & Safe'}`,
      '', `Name: ${value('name')}`, `Email: ${value('email')}`,
      value('phone') ? `Phone: ${value('phone')}` : '',
      `Project ZIP: ${value('zip')}`, `Project type: ${serviceLabels[value('projectType')] || value('projectType')}`,
      value('floor') ? `Intended floor: ${value('floor')}` : '',
      '', 'Project details:', value('details'),
      '', 'Please contact me to discuss the project and next steps.'
    ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
    preview.hidden = false;
    draftStatus.textContent = 'Your inquiry is ready to review. Nothing has been sent.';
    updateDraft();
    $('#previewHeading').focus();
  });
  summary?.addEventListener('input', () => {
    updateDraft();
    draftStatus.textContent = 'Your edited summary is ready to copy or share. Nothing has been sent.';
  });
  copyButton?.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(summary.value);
      draftStatus.textContent = 'Inquiry copied. Paste it into a message when you are ready to share it.';
    } catch {
      summary.focus();
      summary.select();
      summary.setSelectionRange(0, summary.value.length);
      draftStatus.textContent = 'Your inquiry is selected. Use your device’s Copy command, or press Ctrl+C (Command+C on Mac).';
    }
  });
  emailDraft?.addEventListener('click', () => {
    updateDraft();
    draftStatus.textContent = 'Opening an email draft. The inquiry is sent only when you send it in your email app.';
  });
  if (fields) fields.disabled = false;
})();
