(() => {
  'use strict';
  const config = window.SITE_CONFIG || {};
  const name = String(config.businessName || 'Northwoods Vault & Safe');
  const escape = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(config.email || '') ? config.email : '';
  const phone = /^[+\d().\s-]+$/.test(config.phoneHref || '') ? String(config.phoneHref).replace(/[^+\d]/g, '') : '';
  const page = document.body.dataset.page || '';
  const active = keys => keys.includes(page) ? ' class="active" aria-current="page"' : '';
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main-content';
  const mark = '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 42 42" fill="none"><path d="M21 3 7 11v20l14 8 14-8V11L21 3Z"/><path d="m21 10-8 15h5v7h6v-7h5L21 10Z"/></svg></span>';
  const brand = `${mark}<span class="brand-wordmark"><strong>${escape(config.brandPrimary || name)}</strong><small>${escape(config.brandSecondary || 'VAULT & SAFE')}</small></span>`;
  const contactLinks = `${phone && config.phoneDisplay ? `<a href="tel:${escape(phone)}">${escape(config.phoneDisplay)}</a>` : ''}${email ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''}`;
  const skipLink = document.querySelector('.skip-link') ? '' : `<a class="skip-link" href="#${escape(main?.id || 'main-content')}">Skip to content</a>`;
  const headerMount = document.querySelector('#sharedHeader');
  if (headerMount) headerMount.outerHTML = `
    ${skipLink}
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="${escape(name)} home">${brand}</a>
      <nav class="main-nav" id="primary-navigation" aria-label="Primary navigation">
        <a href="index.html#services"${['vault-rooms', 'safe-installation'].includes(page) ? ' class="active"' : ''}>Services</a>
        <a href="vault-doors.html"${active(['vault-doors'])}>Vault doors</a>
        <a href="process.html"${active(['process'])}>Our process</a>
        <a href="service-area.html"${active(['service-area'])}>Service area</a>
        <a href="portal.html"${active(['portal', 'account', 'admin'])}>Customer portal</a>
        <a class="mobile-nav-cta" href="contact.html">Plan your project <span aria-hidden="true">↗</span></a>
      </nav>
      <div class="header-actions"><a class="button button-small" href="contact.html">Plan your project <span aria-hidden="true">↗</span></a></div>
      <button class="menu-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false"><span></span><span></span></button>
    </header>`;
  const footerMount = document.querySelector('#sharedFooter');
  if (footerMount) footerMount.outerHTML = `
    <footer class="site-footer">
      <div class="footer-main">
        <div class="footer-brand"><a class="brand light-brand" href="index.html" aria-label="${escape(name)} home">${brand}</a><p>Indoor vault rooms, vault door supply and installation, and gun safe installation across Maine and New Hampshire.</p><span class="footer-region">ROOTED IN THE NORTH. BUILT FOR YOUR HOME.</span></div>
        <div class="footer-links">
          <div><strong>Explore</strong><a href="vault-rooms.html">Vault rooms</a><a href="safe-installation.html">Gun safes</a><a href="vault-doors.html">Vault doors</a><a href="process.html">Our process</a></div>
          <div><strong>Good to know</strong><a href="service-area.html">Service area</a><a href="standards.html">Project standards</a><a href="faq.html">Common questions</a><a href="portal.html">Customer portal</a><a href="contact.html">Plan your project</a></div>
          <div><strong>Let's talk</strong>${contactLinks}<a href="contact.html">Start a project inquiry <span aria-hidden="true">↗</span></a><span>Maine &amp; New Hampshire</span><span>Statewide service</span></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escape(name)}</span><a href="contact.html#inquiry-privacy">Inquiry privacy</a><a href="#top">Back to top <span aria-hidden="true">↑</span></a></div>
    </footer>`;
  document.querySelectorAll('[data-business-name]').forEach(element => { element.textContent = name; });
  document.title = document.title.replace(/Northwoods Vault & Safe/g, name);
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = description.content.replace(/Northwoods Vault & Safe/g, name);
  const contactMount = document.querySelector('#businessContact');
  if (contactMount) {
    contactMount.innerHTML = `${phone && config.phoneDisplay ? `<div class="contact-card"><small>Call</small><strong><a href="tel:${escape(phone)}">${escape(config.phoneDisplay)}</a></strong></div>` : ''}${email ? `<div class="contact-card"><small>Email</small><strong><a href="mailto:${escape(email)}">${escape(email)}</a></strong></div>` : ''}`;
    contactMount.hidden = !contactLinks;
  }
})();
