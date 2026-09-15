(() => {
  'use strict';
  const api = window.NWPortal;
  const $ = id => document.getElementById(id);
  const serviceLabels = { 'vault-room': 'Indoor vault room', 'vault-door': 'Vault door supply & installation', 'gun-safe': 'Gun safe installation' };
  const changeLabels = { pending: 'Awaiting review', in_review: 'In review', approved: 'Approved', declined: 'Declined' };
  let account = null;
  let projects = [];
  let activeId = '';
  let generation = 0;
  let busyCount = 0;

  function node(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
  }
  function status(id, message = '', tone = '') {
    const element = $(id);
    element.textContent = message;
    element.dataset.tone = tone;
    element.hidden = !message;
  }
  function errorMessage(error) {
    return error && error.message ? String(error.message) : 'Something went wrong. Please try again.';
  }
  function timeLabel(value, full = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', full ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }
  function timeNode(value, full = false) {
    const element = node('time', 'portal-meta', timeLabel(value, full));
    if (value) element.dateTime = value;
    return element;
  }
  function sorted(items, newestFirst = false) {
    return [...(items || [])].sort((a, b) => (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * (newestFirst ? -1 : 1));
  }
  function emptyList(id, message) {
    const list = $(id);
    list.replaceChildren(node('li', 'portal-empty', message));
  }
  function formBusy(form, busy) {
    form.dataset.busy = busy ? 'true' : '';
    form.setAttribute('aria-busy', String(busy));
    form.querySelectorAll('input,select,textarea,button').forEach(element => { element.disabled = busy; });
  }
  function navigationBusy(busy) {
    busyCount += busy ? 1 : -1;
    busyCount = Math.max(0, busyCount);
    $('projectSelect').disabled = busyCount > 0 || projects.length < 2;
    $('refreshProject').disabled = busyCount > 0 || !activeId;
  }
  function clearProjectStatuses() {
    ['messageStatus', 'changeStatus', 'checklistStatus', 'documentStatus'].forEach(id => status(id));
  }
  function toggleNewProject(open) {
    $('newProjectPanel').hidden = !open;
    $('newProjectButton').setAttribute('aria-expanded', String(open));
    if (open) $('newTitle').focus();
  }
  function renderSelector(selectedId) {
    const select = $('projectSelect');
    select.replaceChildren();
    if (!projects.length) {
      const option = node('option', '', 'Your first project starts here');
      option.value = '';
      select.append(option);
    }
    projects.forEach(project => {
      const option = node('option', '', project.title);
      option.value = project.id;
      select.append(option);
    });
    select.value = selectedId || (projects[0] && projects[0].id) || '';
    select.disabled = busyCount > 0 || projects.length < 2;
    $('emptyAccount').hidden = projects.length > 0;
    $('cancelProjectButton').hidden = !projects.length;
    $('newProjectButton').hidden = !projects.length;
    $('refreshProject').disabled = busyCount > 0 || !projects.length;
    if (!projects.length) {
      $('newProjectPanel').hidden = false;
      $('newProjectButton').setAttribute('aria-expanded', 'true');
    }
  }
  function renderOverview(project) {
    $('projectTitle').textContent = project.title;
    const stages = Array.isArray(api.stages) ? api.stages : [];
    const current = stages.findIndex(stage => stage.value === project.stage);
    $('projectStage').textContent = current >= 0 ? stages[current].label : 'Project in progress';
    $('projectStage').dataset.status = project.stage;
    $('projectMeta').textContent = [serviceLabels[project.service_type] || project.service_type, project.zip_code ? 'ZIP ' + project.zip_code : '', project.created_at ? 'Started ' + timeLabel(project.created_at) : ''].filter(Boolean).join(' · ');
    $('projectDescription').textContent = project.description || '';
    const timeline = $('projectTimeline');
    timeline.replaceChildren();
    stages.forEach((stage, index) => {
      const item = node('li', index < current ? 'is-complete' : index === current ? 'is-current' : '', stage.label);
      if (index === current) item.setAttribute('aria-current', 'step');
      if (index < current) item.append(node('span', 'sr-only', ' — completed'));
      timeline.append(item);
    });
    const date = project.installation_date ? new Date(project.installation_date + 'T12:00:00') : null;
    $('installationDate').textContent = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date) : 'Let’s get the details right.';
    $('installationNote').textContent = project.date_note || (project.installation_date ? 'Your team will coordinate arrival and site details with you here.' : 'Your team will confirm a date here once the scope and site preparations are ready.');
  }
  function renderUpdates(updates) {
    $('updateCount').textContent = String(updates.length);
    if (!updates.length) return emptyList('projectUpdates', 'Your team’s next update will appear here.');
    $('projectUpdates').replaceChildren(...sorted(updates, true).map(update => {
      const item = node('li', 'portal-item');
      item.append(timeNode(update.created_at), node('p', 'portal-prewrap', update.body));
      return item;
    }));
  }
  function renderMessages(messages) {
    if (!messages.length) return emptyList('projectMessages', 'Questions about your project? Start the conversation below.');
    $('projectMessages').replaceChildren(...sorted(messages).map(message => {
      const self = message.author_id === account.user.id;
      const item = node('li', 'portal-message' + (self ? ' is-self' : ''));
      const header = node('div', 'portal-message-head');
      header.append(node('strong', '', self ? 'You' : (message.author_name || 'Northwoods team')), timeNode(message.created_at, true));
      item.append(header, node('p', 'portal-prewrap', message.body));
      return item;
    }));
  }
  function renderChanges(changes) {
    $('changeCount').textContent = String(changes.length);
    if (!changes.length) return emptyList('projectChanges', 'No change requests for this project.');
    $('projectChanges').replaceChildren(...sorted(changes, true).map(change => {
      const item = node('li', 'portal-item');
      const header = node('div', 'portal-section-heading');
      const badge = node('span', 'portal-badge', changeLabels[change.status] || 'Under review');
      badge.dataset.status = change.status;
      header.append(node('h3', '', change.summary), badge);
      item.append(header, timeNode(change.created_at), node('p', 'portal-prewrap', change.details));
      if (change.response) {
        const response = node('div', 'portal-change-response');
        response.append(node('strong', '', 'From your Northwoods team'), node('p', 'portal-prewrap', change.response));
        item.append(response);
      }
      return item;
    }));
  }
  function renderChecklist(checklist, projectId) {
    $('checklistCount').textContent = checklist.filter(item => item.completed).length + ' / ' + checklist.length;
    if (!checklist.length) return emptyList('projectChecklist', 'Preparation steps will appear here as your plan takes shape.');
    $('projectChecklist').replaceChildren(...[...checklist].sort((a, b) => a.sort_order - b.sort_order).map(item => {
      const row = node('li');
      const label = node('label');
      const input = node('input');
      input.type = 'checkbox';
      input.checked = Boolean(item.completed);
      input.addEventListener('change', async () => {
        const desired = input.checked;
        input.disabled = true;
        navigationBusy(true);
        status('checklistStatus', 'Saving your preparation step…');
        try {
          await api.setChecklist(item.id, desired);
          item.completed = desired;
          if (activeId === projectId) {
            $('checklistCount').textContent = checklist.filter(entry => entry.completed).length + ' / ' + checklist.length;
            status('checklistStatus', 'Preparation step saved.', 'success');
          }
        } catch (error) {
          input.checked = !desired;
          if (activeId === projectId) status('checklistStatus', errorMessage(error), 'error');
        } finally {
          input.disabled = false;
          navigationBusy(false);
        }
      });
      label.append(input, node('span', '', item.label));
      row.append(label);
      return row;
    }));
  }
  function renderDocuments(documents, projectId) {
    $('documentCount').textContent = String(documents.length);
    if (!documents.length) return emptyList('projectDocuments', 'Your team will share project documents here.');
    $('projectDocuments').replaceChildren(...sorted(documents, true).map(document => {
      const row = node('li', 'portal-document');
      const info = node('div');
      info.append(node('strong', '', document.label), timeNode(document.created_at));
      const actions = node('div', 'portal-actions');
      const button = node('button', 'button portal-button-secondary button-small', 'Get secure link');
      button.type = 'button';
      const link = node('a', 'text-link', 'Open document ↗');
      link.hidden = true;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const note = node('span', 'portal-meta portal-small');
      button.addEventListener('click', async () => {
        button.disabled = true;
        link.hidden = true;
        note.textContent = '';
        button.textContent = 'Preparing link…';
        try {
          const signed = await api.documentUrl(document.storage_path);
          const url = new URL(signed);
          if (url.protocol !== 'https:') throw new Error('The document link could not be verified. Please contact your team.');
          if (activeId !== projectId || !row.isConnected) return;
          link.href = url.href;
          link.hidden = false;
          note.textContent = 'Link expires in 60 seconds.';
          status('documentStatus', 'Your secure link is ready. Select “Open document” to view it.', 'success');
        } catch (error) {
          if (activeId === projectId) status('documentStatus', errorMessage(error), 'error');
        } finally {
          button.disabled = false;
          button.textContent = 'Refresh secure link';
        }
      });
      actions.append(button, link, note);
      row.append(info, actions);
      return row;
    }));
  }
  async function loadProject(id, options = {}) {
    const ownGeneration = ++generation;
    activeId = id;
    $('projectContent').hidden = true;
    $('projectContent').setAttribute('aria-busy', 'true');
    status('pageStatus', 'Loading your project…');
    if (!options.keepForms) {
      $('messageForm').reset();
      $('changeForm').reset();
      clearProjectStatuses();
    }
    try {
      const [project, details] = await Promise.all([api.getProject(id), api.getProjectDetails(id)]);
      if (ownGeneration !== generation || activeId !== id) return false;
      if (!project) throw new Error('This project is no longer available. Refresh the page to update your project list.');
      renderOverview(project);
      renderUpdates(details.updates || []);
      renderMessages(details.messages || []);
      renderChanges(details.changes || []);
      renderChecklist(details.checklist || [], id);
      renderDocuments(details.documents || [], id);
      $('projectContent').hidden = false;
      $('projectMessages').scrollTop = $('projectMessages').scrollHeight;
      status('pageStatus');
      return true;
    } catch (error) {
      if (ownGeneration === generation) status('pageStatus', errorMessage(error) + ' Use “Refresh project” to try again.', 'error');
      return false;
    } finally {
      if (ownGeneration === generation) $('projectContent').setAttribute('aria-busy', 'false');
    }
  }
  function bindProjectForm(formId, statusId, operation, successMessage) {
    const form = $(formId);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.busy === 'true' || !activeId || !form.reportValidity()) return;
      const data = new FormData(form);
      const projectId = activeId;
      formBusy(form, true);
      navigationBusy(true);
      status(statusId, 'Sending…');
      let saved = false;
      try {
        await operation(projectId, data);
        saved = true;
        if (activeId !== projectId) return;
        form.reset();
        const refreshed = await loadProject(projectId, { keepForms: true });
        if (activeId === projectId) {
          status(statusId, successMessage, 'success');
          if (!refreshed) status('pageStatus', successMessage + ' The latest project details could not be loaded. Use “Refresh project” to try again.', 'error');
        }
      } catch (error) {
        if (activeId === projectId) status(statusId, saved ? 'Your request was saved, but the latest details could not be loaded.' : errorMessage(error), 'error');
      } finally {
        formBusy(form, false);
        navigationBusy(false);
      }
    });
  }
  async function initialize() {
    if (!api || !api.configured) {
      status('pageStatus');
      $('setupNotice').hidden = false;
      return;
    }
    try {
      account = await api.requireSession();
      if (!account) return;
      $('accountActions').hidden = false;
      $('ownerLink').hidden = !account.isAdmin;
      const name = account.profile && account.profile.full_name;
      $('welcomeText').textContent = name ? 'Welcome, ' + name + '. Here’s what’s happening with your project.' : 'Your updates, conversations, and next steps, all in one place.';
      projects = (await api.listProjects()).filter(project => project.customer_id === account.user.id);
      renderSelector();
      $('portalApp').hidden = false;
      status('pageStatus');
      if (projects.length) await loadProject(projects[0].id);
    } catch (error) {
      status('pageStatus', errorMessage(error) + ' Reload the page to try again.', 'error');
    }
  }

  $('signOutButton').addEventListener('click', async () => {
    $('signOutButton').disabled = true;
    try { await api.signOut(); }
    catch (error) { status('pageStatus', errorMessage(error), 'error'); $('signOutButton').disabled = false; }
  });
  $('projectSelect').addEventListener('change', () => { if ($('projectSelect').value) loadProject($('projectSelect').value); });
  $('refreshProject').addEventListener('click', () => { if (activeId) loadProject(activeId, { keepForms: true }); });
  $('newProjectButton').addEventListener('click', () => toggleNewProject($('newProjectPanel').hidden));
  $('cancelProjectButton').addEventListener('click', () => toggleNewProject(false));
  $('newProjectForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.busy === 'true' || !form.reportValidity()) return;
    const data = new FormData(form);
    const payload = { title: String(data.get('title') || '').trim(), service_type: String(data.get('service_type') || ''), zip_code: String(data.get('zip_code') || '').trim(), description: String(data.get('description') || '').trim() };
    if (!payload.title || !payload.description) { status('newProjectStatus', 'Please add a project name and a few details about your space.', 'error'); return; }
    formBusy(form, true);
    navigationBusy(true);
    status('newProjectStatus', 'Sending your project request…');
    try {
      const project = await api.createProject(payload);
      projects.unshift(project);
      renderSelector(project.id);
      form.reset();
      toggleNewProject(false);
      const refreshed = await loadProject(project.id);
      status('pageStatus', refreshed ? 'Your project request has been sent. You can message your team below while we review the details.' : 'Your project request was sent. The project details could not be loaded yet; use “Refresh project” to try again.', refreshed ? 'success' : 'error');
      status('newProjectStatus');
    } catch (error) { status('newProjectStatus', errorMessage(error), 'error'); }
    finally { formBusy(form, false); navigationBusy(false); }
  });
  bindProjectForm('messageForm', 'messageStatus', (id, data) => {
    const body = String(data.get('body') || '').trim();
    if (!body) throw new Error('Please write a message before sending.');
    return api.sendMessage(id, body);
  }, 'Your message has been sent.');
  bindProjectForm('changeForm', 'changeStatus', (id, data) => {
    const summary = String(data.get('summary') || '').trim();
    const details = String(data.get('details') || '').trim();
    if (!summary || !details) throw new Error('Please add a title and details for your change request.');
    return api.requestChange(id, { summary, details });
  }, 'Your change request has been sent for review.');
  initialize();
})();
