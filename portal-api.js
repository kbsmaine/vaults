(() => {
  'use strict';
  const config = window.PORTAL_CONFIG || {};
  const url = String(config.supabaseUrl || '').replace(/\/$/, '');
  const key = String(config.supabasePublishableKey || '');
  // Accept public publishable keys only, never privileged server credentials.
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !!window.supabase;
  const client = configured ? window.supabase.createClient(url, key, {auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    flowType: 'implicit', storageKey: 'northwoods-customer-session'
  }}) : null;
  const stages = [
    {value:'requested',label:'Request received'}, {value:'planning',label:'Site review & planning'},
    {value:'ordered',label:'Equipment & preparation'}, {value:'scheduled',label:'Installation scheduled'},
    {value:'installing',label:'Installation in progress'}, {value:'complete',label:'Project complete'}
  ];
  const ready = () => { if (!client) throw new Error('Customer accounts are not available yet. Please check back soon.'); return client; };
  const result = async query => { const {data,error} = await query; if(error) throw error; return data; };
  const currentUser = async () => { const {data,error} = await ready().auth.getUser(); if(error || !data.user) throw new Error('Please sign in again to continue.'); return data.user; };
  async function context() {
    const user = await currentUser();
    const [profile,isAdmin] = await Promise.all([
      result(client.from('profiles').select('id,full_name,email').eq('id',user.id).single()),
      result(client.rpc('is_admin'))
    ]);
    return {user,profile,isAdmin:!!isAdmin};
  }
  async function requireSession({admin=false}={}) {
    if(!configured) { window.location.replace('account.html'); return null; }
    const {data,error} = await client.auth.getSession();
    if(error || !data.session) { window.location.replace('account.html'); return null; }
    const ctx = await context();
    if(admin && !ctx.isAdmin) { window.location.replace('portal.html'); return null; }
    // Role checks here improve the UI; database RLS enforces actual authorization.
    client.auth.onAuthStateChange(event => { if(event === 'SIGNED_OUT') window.location.replace('account.html'); });
    return ctx;
  }
  function redirectURL(mode='') { const target = new URL('account.html', window.location.href); if(mode) target.searchParams.set('mode',mode); return target.href; }
  async function listProjects() { return result(ready().from('projects').select('*').order('created_at',{ascending:false})); }
  async function createProject(data) {
    const user = await currentUser();
    return result(client.from('projects').insert({customer_id:user.id,title:data.title,service_type:data.service_type,zip_code:data.zip_code,description:data.description}).select().single());
  }
  async function getProject(id) { return result(ready().from('projects').select('*').eq('id',id).single()); }
  async function getProjectDetails(id) {
    const queries = [
      ['messages','project_messages','created_at',true],['changes','change_requests','created_at',false],
      ['checklist','project_checklist','sort_order',true],['updates','project_updates','created_at',false],
      ['documents','project_documents','created_at',false]
    ];
    return Object.fromEntries(await Promise.all(queries.map(async ([name,table,order,ascending]) => [name,await result(ready().from(table).select('*').eq('project_id',id).order(order,{ascending}))])));
  }
  async function sendMessage(projectId,body) {
    const {user,profile} = await context();
    await result(client.from('project_messages').insert({project_id:projectId,author_id:user.id,author_name:profile.full_name,body}));
  }
  async function requestChange(projectId,{summary,details}) {
    const user = await currentUser();
    await result(client.from('change_requests').insert({project_id:projectId,customer_id:user.id,summary,details}));
  }
  async function setChecklist(itemId,completed) { await result(ready().rpc('set_checklist_completed',{item_id:itemId,is_completed:!!completed})); }
  async function documentUrl(path) {
    const data = await result(ready().storage.from('project-documents').createSignedUrl(path,60,{download:true}));
    return data.signedUrl;
  }
  async function listCustomers() { return result(ready().from('profiles').select('id,full_name,email').order('full_name')); }
  async function updateProject(id,data) {
    const row = await result(ready().from('projects').update({title:data.title,stage:data.stage,installation_date:data.installation_date || null,date_note:data.date_note || ''}).eq('id',id).select('id').single());
    return row;
  }
  async function postUpdate(projectId,body) { await result(ready().from('project_updates').insert({project_id:projectId,body})); }
  async function reviewChange(id,{status,response}) { await result(ready().from('change_requests').update({status,response}).eq('id',id).select('id').single()); }
  async function addChecklist(projectId,label) { await result(ready().from('project_checklist').insert({project_id:projectId,label,sort_order:Date.now()})); }
  async function deleteChecklist(id) { await result(ready().from('project_checklist').delete().eq('id',id).select('id').single()); }
  async function uploadDocument(projectId,file,label) {
    ready();
    const allowed = {'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
    if(!allowed[file.type] || !file.size || file.size > 10*1024*1024) throw new Error('Choose a PDF, JPG, or PNG file up to 10 MB.');
    const path = `${projectId}/${crypto.randomUUID()}.${allowed[file.type]}`;
    await result(client.storage.from('project-documents').upload(path,file,{contentType:file.type,upsert:false}));
    try { await result(client.from('project_documents').insert({project_id:projectId,label:label.trim() || file.name,storage_path:path})); }
    catch(error) { await client.storage.from('project-documents').remove([path]); throw error; }
  }
  async function deleteDocument(doc) {
    await result(ready().storage.from('project-documents').remove([doc.storage_path]));
    await result(client.from('project_documents').delete().eq('id',doc.id).select('id').single());
  }
  async function signOut() {
    const {error} = await ready().auth.signOut({scope:'local'});
    if(error) throw error;
    window.location.replace('account.html');
  }
  window.NWPortal = Object.freeze({configured,stages,client,context,requireSession,redirectURL,signOut,
    listProjects,createProject,getProject,getProjectDetails,sendMessage,requestChange,setChecklist,documentUrl,
    listCustomers,updateProject,postUpdate,reviewChange,addChecklist,deleteChecklist,uploadDocument,deleteDocument});
})();
