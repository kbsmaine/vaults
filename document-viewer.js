(() => {
  'use strict';
  let dialog, title, status, canvas, download, retry, zoomTools, zoomLabel, closeButton;
  let current = null, opener = null, controller = null, objectUrl = '', image = null;
  let generation = 0, zoom = 1, timer = null;
  const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(label, action, className = 'button portal-button-secondary button-small') {
    const element = node('button', className, label);
    element.type = 'button';
    element.addEventListener('click', action);
    return element;
  }
  function message(text, tone = '') {
    status.textContent = text;
    status.dataset.tone = tone;
    status.hidden = !text;
  }
  function release() {
    ++generation;
    if (controller) controller.abort();
    controller = null;
    window.clearTimeout(timer);
    timer = null;
    image = null;
    if (canvas) canvas.replaceChildren();
    if (download) { download.hidden = true; download.removeAttribute('href'); }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
  function close() {
    if (!dialog) return;
    release();
    current = null;
    if (dialog.open) dialog.close();
    document.body.classList.remove('document-viewer-open');
    if (opener && opener.isConnected) opener.focus();
    opener = null;
  }
  function fitScale() {
    const style = window.getComputedStyle(canvas);
    const padding = property => Number.parseFloat(style[property]) || 0;
    return Math.max(Number.EPSILON, Math.min(1,
      (canvas.clientWidth - padding('paddingLeft') - padding('paddingRight')) / image.naturalWidth,
      (canvas.clientHeight - padding('paddingTop') - padding('paddingBottom')) / image.naturalHeight));
  }
  function resize(fit = false) {
    if (!image) return;
    canvas.dataset.fit = String(fit);
    if (fit) {
      image.style.width = '';
      zoom = fitScale();
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    } else {
      // Large phone photos can fit below 10%. Zoom out must still shrink them.
      zoom = Math.max(Math.min(0.1, fitScale() / 4), Math.min(4, zoom));
      image.style.width = `${Math.round(image.naturalWidth * zoom)}px`;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }
  }
  function create() {
    if (dialog) return;
    dialog = node('dialog', 'document-viewer');
    dialog.setAttribute('aria-labelledby', 'documentViewerTitle');
    const shell = node('div', 'document-viewer-shell');
    const header = node('header', 'document-viewer-header');
    const heading = node('div', 'document-viewer-heading');
    heading.append(node('p', 'eyebrow', 'Project document'));
    title = node('h2'); title.id = 'documentViewerTitle';
    heading.append(title);
    const actions = node('div', 'document-viewer-actions');
    download = node('a', 'button button-small', 'Download ↓');
    download.hidden = true;
    closeButton = button('Close ×', close);
    closeButton.autofocus = true;
    actions.append(download, closeButton);
    header.append(heading, actions);
    const toolbar = node('div', 'document-viewer-toolbar');
    zoomTools = node('div', 'document-viewer-zoom');
    zoomTools.hidden = true;
    const minus = button('−', () => { zoom /= 1.25; resize(); });
    minus.setAttribute('aria-label', 'Zoom out');
    const plus = button('+', () => { zoom *= 1.25; resize(); });
    plus.setAttribute('aria-label', 'Zoom in');
    zoomLabel = button('Fit', () => { zoom = 1; resize(); });
    zoomLabel.setAttribute('aria-label', 'Show image at actual size');
    zoomTools.append(minus, zoomLabel, plus, button('Fit', () => resize(true)));
    toolbar.append(node('span', 'portal-meta', 'Shared with your project'), zoomTools);
    status = node('p', 'document-viewer-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    retry = button('Try again', () => load());
    retry.hidden = true;
    const notices = node('div', 'document-viewer-notices');
    notices.append(status, retry);
    canvas = node('div', 'document-viewer-canvas');
    canvas.setAttribute('aria-label', 'Document preview');
    canvas.tabIndex = 0;
    shell.append(header, toolbar, notices, canvas);
    dialog.append(shell);
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    window.addEventListener('pagehide', close);
  }
  async function load() {
    release();
    const request = generation;
    const record = current;
    controller = new AbortController();
    const signal = controller.signal;
    if (document.activeElement === retry) closeButton.focus();
    retry.hidden = true;
    zoomTools.hidden = true;
    canvas.setAttribute('aria-busy', 'true');
    message('Loading your document…');
    const aborted = new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('The document is taking too long to load. Please try again.')), { once: true });
    });
    timer = window.setTimeout(() => controller?.abort(), 20000);
    try {
      const file = await Promise.race([window.NWPortal.documentFile(record.storage_path, { signal }), aborted]);
      if (request !== generation || !dialog.open) return;
      window.clearTimeout(timer);
      if (!types[file.type] || !file.size || file.size > 10 * 1024 * 1024) throw new Error('This file cannot be previewed. Ask your team for a PDF, PNG, or JPG up to 10 MB.');
      objectUrl = URL.createObjectURL(file);
      const name = String(record.label || 'Project document').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '-').trim().slice(0,140).replace(/\.(pdf|png|jpe?g)$/i, '') || 'Project document';
      download.href = objectUrl;
      download.download = `${name}.${types[file.type]}`;
      download.hidden = false;
      if (file.type === 'application/pdf') {
        const frame = node('iframe', 'document-viewer-pdf');
        frame.title = `PDF preview: ${record.label || 'Project document'}`;
        frame.referrerPolicy = 'no-referrer';
        frame.src = objectUrl;
        canvas.dataset.fit = 'true';
        canvas.append(frame);
        message('If the PDF does not display on your device, choose Download to open it.');
      } else {
        image = node('img', 'document-viewer-image');
        image.alt = record.label || 'Project document';
        image.addEventListener('load', () => {
          if (request !== generation) return;
          message(''); zoomTools.hidden = false; resize(true);
        });
        image.addEventListener('error', () => {
          if (request !== generation) return;
          message('The image preview could not be displayed. You can still download the file.', 'error');
          retry.hidden = false;
        });
        image.src = objectUrl;
        canvas.append(image);
      }
    } catch (error) {
      if (request !== generation || !dialog.open) return;
      message(error.message || 'The document could not be loaded. Please try again.', 'error');
      retry.hidden = false;
    } finally {
      if (request === generation) { window.clearTimeout(timer); canvas.setAttribute('aria-busy', 'false'); }
    }
  }
  function open(record) {
    create();
    if (!dialog.open) opener = document.activeElement;
    current = { label: record.label, storage_path: record.storage_path };
    title.textContent = record.label || 'Project document';
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('document-viewer-open');
    closeButton.focus();
    return load();
  }
  window.NWDocumentViewer = Object.freeze({ open, close });
})();
