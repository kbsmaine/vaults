(() => {
  'use strict';
  const api = window.NWPortal;
  const $ = (id) => document.getElementById(id);
  const state = { session: null, projects: [], customers: [], selected: null, details: null, busy: false, request: 0, timers: [], disabled: [] };
  const services = { 'vault-room': 'Indoor vault room', 'vault-door': 'Vault door', 'gun-safe': 'Gun safe installation' };
  const changeStatuses = [['pending', 'Pending'], ['in_review', 'In review'], ['approved', 'Approved'], ['declined', 'Declined']];
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };
  const dateText = (value) => {
    if (!value) return 'Date not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date not available' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const stageLabel = (value) => (api.stages.find((stage) => stage.value === value) || {}).label || 'Requested';
  const customerFor = (project) => state.customers.find((customer) => customer.id === project.customer_id) || { full_name: 'Customer', email: '' };
  const setStatus = (target, message, tone = '') => {
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = tone;
  };
  const messageFor = (error) => error && error.message ? error.message : 'Something went wrong. Please try again.';
  const clearTimers = () => { state.timers.forEach(window.clearTimeout); state.timers = []; };
  function setBusy(busy) {
    state.busy = busy;
    $('adminWorkspace').setAttribute('aria-busy', String(busy));
    if (busy) {
      state.disabled = [...$('adminWorkspace').querySelectorAll('button, input, select, textarea')].map((element) => [element, element.disabled]);
      state.disabled.forEach(([element]) => { element.disabled = true; });
    } else {
      state.disabled.forEach(([element, wasDisabled]) => { if (element.isConnected) element.disabled = wasDisabled; });
      state.disabled = [];
    }
  }
  function emptyList(target, message) {
    target.replaceChildren(node('p', 'portal-empty', message));
  }
  function addOptions(select, values) {
    values.forEach(([value, label]) => {
      const option = node('option', '', label);
      option.value = value;
      select.append(option);
    });
  }
  function populateCustomerFilter() {
    const current = $('customerFilter').value;
    $('customerFilter').replaceChildren();
    addOptions($('customerFilter'), [['', 'All customers'], ...state.customers.map((customer) => [customer.id, `${customer.full_name || 'Customer'}${customer.email ? ` · ${customer.email}` : ''}`])]);
    $('customerFilter').value = state.customers.some((customer) => customer.id === current) ? current : '';
  }
  function filteredProjects() {
    const query = $('projectSearch').value.trim().toLocaleLowerCase();
    return state.projects.filter((project) => {
      const customer = customerFor(project);
      const searchText = [project.title, project.zip_code, services[project.service_type], customer.full_name, customer.email].join(' ').toLocaleLowerCase();
      return (!$('customerFilter').value || project.customer_id === $('customerFilter').value) && (!$('stageFilter').value || project.stage === $('stageFilter').value) && (!query || searchText.includes(query));
    });
  }
  function renderProjects() {
    const projects = filteredProjects();
    const list = $('projectList');
    list.replaceChildren();
    $('projectCount').textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} shown`;
    if (!projects.length) {
      emptyList(list, state.projects.length ? 'No projects match these filters.' : 'New customer projects will appear here.');
      return;
    }
    projects.forEach((project) => {
      const customer = customerFor(project);
      const button = node('button', 'portal-project-button');
      button.type = 'button';
      button.dataset.projectId = project.id;
      button.setAttribute('aria-pressed', String(Boolean(state.selected && state.selected.id === project.id)));
      button.append(node('strong', '', project.title), node('small', '', customer.full_name || customer.email || 'Customer'), node('span', 'portal-badge', stageLabel(project.stage)));
      button.addEventListener('click', () => { if (!state.busy) selectProject(project.id, true); });
      list.append(button);
    });
  }
  function renderSelected(project, fillForm = true) {
    const customer = customerFor(project);
    $('selectedProjectTitle').textContent = project.title;
    $('selectedStage').textContent = stageLabel(project.stage);
    $('selectedCustomer').textContent = [customer.full_name || 'Customer', customer.email].filter(Boolean).join(' · ');
    $('selectedService').textContent = [services[project.service_type] || project.service_type, project.zip_code ? `ZIP ${project.zip_code}` : '', `Requested ${dateText(project.created_at)}`].filter(Boolean).join(' · ');
    $('selectedDescription').textContent = project.description || 'No project description provided.';
    if (fillForm) {
      $('editTitle').value = project.title || '';
      $('editStage').value = project.stage;
      $('editDate').value = project.installation_date || '';
      $('editDateNote').value = project.date_note || '';
    }
  }
  async function selectProject(id, focusHeading = false) {
    const request = ++state.request;
    clearTimers();
    state.selected = state.projects.find((project) => project.id === id) || null;
    state.details = null;
    $('adminDetail').hidden = true;
    $('projectPlaceholder').hidden = false;
    $('placeholderText').textContent = 'Loading project details…';
    renderProjects();
    setStatus($('adminStatus'), '');
    try {
      const [project, details] = await Promise.all([api.getProject(id), api.getProjectDetails(id)]);
      if (request !== state.request) return;
      if (!project) throw new Error('This project is no longer available. Refresh the project list.');
      state.selected = project;
      state.details = details;
      state.projects = state.projects.map((item) => item.id === project.id ? project : item);
      [...$('adminDetail').querySelectorAll('form')].forEach((form) => form.reset());
      [...$('adminDetail').querySelectorAll('.portal-status')].forEach((status) => setStatus(status, ''));
      renderSelected(project);
      renderDetails();
      renderProjects();
      $('projectPlaceholder').hidden = true;
      $('adminDetail').hidden = false;
      if (focusHeading) $('selectedProjectTitle').focus({ preventScroll: true });
    } catch (error) {
      if (request !== state.request) return;
      $('placeholderText').textContent = 'We could not load this project. Select it again or refresh the project list.';
      setStatus($('adminStatus'), messageFor(error), 'error');
    }
  }
  async function loadProjects() {
    if (state.busy) return;
    setBusy(true);
    const request = ++state.request;
    setStatus($('adminStatus'), 'Loading customer projects…');
    try {
      const [projects, customers] = await Promise.all([api.listProjects(), api.listCustomers()]);
      if (request !== state.request) return;
      const selectedId = state.selected && state.selected.id;
      state.projects = projects;
      state.customers = customers;
      populateCustomerFilter();
      $('adminCounts').textContent = `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'} · ${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · ${projects.filter((project) => project.stage !== 'complete').length} active`;
      renderProjects();
      setStatus($('adminStatus'), '');
      const selected = projects.find((project) => project.id === selectedId) || filteredProjects()[0];
      if (selected) {
        await selectProject(selected.id);
      } else {
        clearTimers();
        state.selected = null;
        state.details = null;
        $('adminDetail').hidden = true;
        $('projectPlaceholder').hidden = false;
        $('placeholderText').textContent = projects.length ? 'Select a project from the list. Adjust the filters to see more projects.' : 'When a customer starts a project, you can manage its plan, messages, and documents here.';
      }
    } catch (error) {
      setStatus($('adminStatus'), messageFor(error), 'error');
      $('placeholderText').textContent = 'We could not load the workspace. Use Refresh projects to try again.';
    } finally {
      setBusy(false);
    }
  }
  function renderUpdates() {
    const list = $('updatesList');
    const updates = [...(state.details.updates || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.replaceChildren();
    if (!updates.length) return emptyList(list, 'No project updates yet.');
    updates.forEach((update) => {
      const item = node('article', 'portal-item');
      item.append(node('p', 'portal-meta', dateText(update.created_at)), node('p', 'portal-prewrap', update.body));
      list.append(item);
    });
  }
  function renderMessages() {
    const list = $('messagesList');
    const messages = [...(state.details.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    list.replaceChildren();
    if (!messages.length) return emptyList(list, 'No messages yet. Send a note to start the conversation.');
    messages.forEach((message) => {
      const fromCustomer = message.author_id === state.selected.customer_id;
      const item = node('article', `portal-item portal-message${fromCustomer ? '' : ' is-self'}`);
      const author = message.author_id === state.session.user.id ? 'You' : message.author_name || (fromCustomer ? 'Customer' : 'Northwoods team');
      item.append(node('p', 'portal-meta', `${author} · ${dateText(message.created_at)}`), node('p', 'portal-prewrap', message.body));
      list.append(item);
    });
  }
  function actionButton(label, callback, className = 'button portal-button-secondary button-small') {
    const button = node('button', className, label);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }
  function renderChecklist() {
    const list = $('checklistList');
    const items = [...(state.details.checklist || [])].sort((a, b) => a.sort_order - b.sort_order);
    list.replaceChildren();
    if (!items.length) return emptyList(list, 'No preparation tasks added yet.');
    items.forEach((item) => {
      const row = node('div', 'portal-item portal-inline');
      const label = node('label', 'portal-inline');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(item.completed);
      checkbox.addEventListener('change', () => {
        const checked = checkbox.checked;
        checkbox.checked = !checked;
        runWrite(null, () => api.setChecklist(item.id, checked), 'Checklist updated.', 'checklist');
      });
      label.append(checkbox, node('span', '', item.label));
      const remove = actionButton('Remove', () => runWrite(null, () => api.deleteChecklist(item.id), 'Preparation task removed.', 'checklist'));
      remove.setAttribute('aria-label', `Remove task: ${item.label}`);
      row.append(label, remove);
      list.append(row);
    });
  }
  function renderChanges(changedId, preserveDrafts = false) {
    const list = $('changesList');
    const drafts = new Map();
    list.querySelectorAll('form[data-change-id]').forEach((form) => {
      if (preserveDrafts && form.dataset.changeId !== changedId) drafts.set(form.dataset.changeId, { status: form.elements.status.value, response: form.elements.response.value });
    });
    list.replaceChildren();
    const changes = [...(state.details.changes || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!changes.length) return emptyList(list, 'No change requests to review.');
    changes.forEach((change, index) => {
      const item = node('article', 'portal-item');
      const title = node('h3', '', change.summary);
      const savedStatus = changeStatuses.find(([value]) => value === change.status);
      item.append(title, node('p', 'portal-meta', `${savedStatus ? savedStatus[1] : change.status} · ${dateText(change.created_at)}`), node('p', 'portal-prewrap', change.details));
      const form = node('form', 'portal-form');
      form.dataset.changeId = change.id;
      const statusLabel = node('label', 'portal-field', 'Review status');
      const select = node('select');
      select.name = 'status';
      select.id = `change-status-${index}`;
      statusLabel.htmlFor = select.id;
      addOptions(select, changeStatuses);
      select.value = (drafts.get(change.id) || {}).status || change.status;
      statusLabel.append(select);
      const responseLabel = node('label', 'portal-field', 'Response to customer');
      const response = node('textarea');
      response.name = 'response';
      response.rows = 3;
      response.maxLength = 5000;
      response.id = `change-response-${index}`;
      responseLabel.htmlFor = response.id;
      response.value = drafts.has(change.id) ? drafts.get(change.id).response : change.response || '';
      responseLabel.append(response);
      const submit = node('button', 'button button-small', 'Save review');
      submit.type = 'submit';
      const status = node('p', 'portal-status');
      status.dataset.formStatus = '';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.append(statusLabel, responseLabel, submit, status);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        runWrite(form, () => api.reviewChange(change.id, { status: select.value, response: response.value.trim() }), 'Change request reviewed.', 'changes', change.id);
      });
      item.append(form);
      list.append(item);
    });
  }
  function renderDocuments() {
    clearTimers();
    const list = $('documentsList');
    list.replaceChildren();
    const documents = state.details.documents || [];
    if (!documents.length) return emptyList(list, 'No project documents uploaded yet.');
    documents.forEach((documentRecord) => {
      const row = node('article', 'portal-item portal-document');
      const info = node('div');
      info.append(node('h3', '', documentRecord.label), node('p', 'portal-meta', dateText(documentRecord.created_at)));
      const actions = node('div', 'portal-actions');
      let expiryTimer;
      const downloadStatus = node('p', 'portal-status');
      downloadStatus.setAttribute('role', 'status');
      downloadStatus.setAttribute('aria-live', 'polite');
      const link = node('a', 'text-link', 'Open file');
      link.hidden = true;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Open ${documentRecord.label} in a new tab`);
      const prepare = actionButton('Get download link', async () => {
        if (state.busy) return;
        const projectId = state.selected.id;
        const request = state.request;
        setBusy(true);
        setStatus(downloadStatus, 'Preparing a secure download…');
        try {
          const url = await api.documentUrl(documentRecord.storage_path);
          if (request !== state.request || !state.selected || state.selected.id !== projectId || !row.isConnected) return;
          if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new Error('The download link could not be prepared. Please try again.');
          if (expiryTimer) window.clearTimeout(expiryTimer);
          link.href = url;
          link.hidden = false;
          setStatus(downloadStatus, 'Your link is ready and expires in one minute.', 'success');
          expiryTimer = window.setTimeout(() => {
            if (!link.isConnected) return;
            link.hidden = true;
            link.removeAttribute('href');
            setStatus(downloadStatus, 'This link has expired. Get a new download link to open the file.');
          }, 55000);
          state.timers.push(expiryTimer);
        } catch (error) {
          if (row.isConnected) setStatus(downloadStatus, messageFor(error), 'error');
        } finally { setBusy(false); }
      });
      prepare.setAttribute('aria-label', `Get download link for ${documentRecord.label}`);
      const remove = actionButton('Delete document', () => runWrite(null, () => api.deleteDocument(documentRecord), 'Document deleted.', 'documents'));
      remove.setAttribute('aria-label', `Delete document: ${documentRecord.label}`);
      actions.append(prepare, link, remove);
      info.append(downloadStatus);
      row.append(info, actions);
      list.append(row);
    });
  }
  const renderers = { updates: renderUpdates, messages: renderMessages, checklist: renderChecklist, changes: renderChanges, documents: renderDocuments };
  function renderDetails(section, changedId) {
    if (section) renderers[section](changedId, true);
    else Object.values(renderers).forEach((render) => render());
  }
  async function runWrite(form, action, success, section, changedId) {
    if (state.busy || !state.selected || !state.details) return;
    if (form && !form.reportValidity()) return;
    const projectId = state.selected.id;
    const request = state.request;
    const status = form ? form.querySelector('[data-form-status]') : $('detailStatus');
    setStatus(status, 'Saving…');
    setBusy(true);
    let saved = false;
    try {
      await action(projectId);
      saved = true;
      if (request !== state.request || !state.selected || state.selected.id !== projectId) return;
      if (form && form !== $('projectEditForm') && !form.dataset.changeId) form.reset();
      if (section) {
        const details = await api.getProjectDetails(projectId);
        if (request !== state.request) return;
        state.details = details;
        renderDetails(section, changedId);
      } else {
        const [project, details] = await Promise.all([api.getProject(projectId), api.getProjectDetails(projectId)]);
        if (request !== state.request) return;
        if (!project) throw new Error('The saved project could not be loaded.');
        state.selected = project;
        state.details = details;
        renderUpdates();
        state.projects = state.projects.map((item) => item.id === projectId ? project : item);
        renderSelected(project);
        renderProjects();
        $('adminCounts').textContent = `${state.customers.length} ${state.customers.length === 1 ? 'customer' : 'customers'} · ${state.projects.length} ${state.projects.length === 1 ? 'project' : 'projects'} · ${state.projects.filter((item) => item.stage !== 'complete').length} active`;
      }
      setStatus(status.isConnected ? status : $('detailStatus'), success, 'success');
    } catch (error) {
      if (request !== state.request) return;
      setStatus(status.isConnected ? status : $('detailStatus'), saved ? `${success} The latest view could not be loaded. Refresh projects to see it.` : messageFor(error), saved ? 'success' : 'error');
    } finally { setBusy(false); }
  }
  function requireText(input, status, label) {
    if (input.value.trim()) return true;
    setStatus(status, `Please enter ${label}.`, 'error');
    input.focus();
    return false;
  }
  function bindForms() {
    $('projectEditForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireText($('editTitle'), event.currentTarget.querySelector('[data-form-status]'), 'a project title')) return;
      runWrite(event.currentTarget, (id) => api.updateProject(id, { title: $('editTitle').value.trim(), stage: $('editStage').value, installation_date: $('editDate').value || null, date_note: $('editDateNote').value.trim() }), 'Project plan saved.');
    });
    [['updateForm', 'updateBody', 'an update', 'updates', 'Update posted.', 'postUpdate'], ['messageForm', 'messageBody', 'a message', 'messages', 'Message sent.', 'sendMessage'], ['checklistForm', 'checklistLabel', 'a preparation task', 'checklist', 'Preparation task added.', 'addChecklist']].forEach(([formId, inputId, label, section, success, method]) => {
      $(formId).addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!requireText($(inputId), form.querySelector('[data-form-status]'), label)) return;
        const value = $(inputId).value.trim();
        runWrite(form, (id) => api[method](id, value), success, section);
      });
    });
    $('documentForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector('[data-form-status]');
      if (!requireText($('documentLabel'), status, 'a document title')) return;
      const file = $('documentFile').files[0];
      if (!file) return setStatus(status, 'Please choose a file.', 'error');
      const extension = file.name.split('.').pop().toLowerCase();
      const expectedTypes = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
      if (!expectedTypes[extension] || file.type !== expectedTypes[extension]) return setStatus(status, 'Choose a PDF, PNG, or JPG file.', 'error');
      if (file.size > 10 * 1024 * 1024 || file.size === 0) return setStatus(status, 'Choose a nonempty file no larger than 10 MB.', 'error');
      const label = $('documentLabel').value.trim();
      runWrite(form, (id) => api.uploadDocument(id, file, label), 'Document uploaded.', 'documents');
    });
  }
  async function start() {
    if (!api || !api.configured) {
      $('gateHeading').textContent = 'Your workspace is being prepared.';
      setStatus($('gateStatus'), 'The account service is not available yet. Please return to the website or try again later.');
      return;
    }
    try {
      const session = await api.requireSession({ admin: true });
      if (!session || !session.isAdmin) {
        $('gateHeading').textContent = 'Owner access required.';
        setStatus($('gateStatus'), 'This workspace is available to authorized Northwoods staff.');
        $('gateAccount').hidden = false;
        return;
      }
      state.session = session;
      addOptions($('stageFilter'), api.stages.map((stage) => [stage.value, stage.label]));
      addOptions($('editStage'), api.stages.map((stage) => [stage.value, stage.label]));
      $('ownerGreeting').textContent = `Welcome${session.profile && session.profile.full_name ? `, ${session.profile.full_name}` : ''}. Manage customer projects from the first request through installation.`;
      $('adminGate').hidden = true;
      $('adminWorkspace').hidden = false;
      $('projectSearch').addEventListener('input', renderProjects);
      $('customerFilter').addEventListener('change', renderProjects);
      $('stageFilter').addEventListener('change', renderProjects);
      $('refreshProjects').addEventListener('click', loadProjects);
      $('adminSignOut').addEventListener('click', async () => {
        if (state.busy) return;
        ++state.request;
        setBusy(true);
        try {
          await api.signOut();
          clearTimers();
          state.session = null;
          state.selected = null;
          $('adminWorkspace').hidden = true;
          $('adminGate').hidden = false;
          $('gateHeading').textContent = 'You are signed out.';
          setStatus($('gateStatus'), 'Your workspace has been closed.');
          $('gateAccount').hidden = false;
        } catch (error) { setStatus($('adminStatus'), messageFor(error), 'error'); }
        finally { setBusy(false); }
      });
      bindForms();
      await loadProjects();
    } catch (error) {
      $('adminWorkspace').hidden = true;
      $('adminGate').hidden = false;
      $('gateHeading').textContent = 'We could not open your workspace.';
      setStatus($('gateStatus'), messageFor(error), 'error');
      $('gateAccount').hidden = false;
    }
  }
  start();
})();
