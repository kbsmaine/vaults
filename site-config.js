/* Public branding and phone only. Inquiry recipients must stay in server-side secrets. */
window.SITE_CONFIG = Object.freeze({
  businessName: 'Northwoods Vault & Safe',
  brandPrimary: 'NORTHWOODS',
  brandSecondary: 'VAULT & SAFE',
  phoneDisplay: '',
  phoneHref: '',
  // Public form ID only. The recipient is configured privately in Formspree.
  inquiry: Object.freeze({ enabled: false, formId: '' })
});
