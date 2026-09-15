'use strict';

// DOM behavior tests use the real owner page with a controlled API.
// Live backend authorization is verified separately in backend/verify.sql.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(root + '/admin.html', 'utf8');
const code = fs.readFileSync(root + '/admin.js', 'utf8');
const stages = [{value:'requested',label:'Request received'},{value:'planning',label:'Planning'},{value:'complete',label:'Complete'}];
const customers = [{id:'c1',full_name:'Casey Pine',email:'casey@example.com'}, {id:'c2',full_name:'River Oak',email:'river@example.com'}];
const projects = [{id:'p1',customer_id:'c1',title:'<img src=x onerror=alert(1)>',service_type:'vault-room',zip_code:'04001',stage:'requested',description:'Secure room\nSite review',created_at:'2026-09-01T12:00:00Z',installation_date:null,date_note:''},{id:'p2',customer_id:'c2',title:'Garage safe',service_type:'gun-safe',zip_code:'03201',stage:'planning',description:'Safe project',created_at:'2026-09-02T12:00:00Z',installation_date:'2026-10-01',date_note:'Morning'}];
const fixture = () => ({messages:[{id:'m1',project_id:'p1',author_id:'c1',author_name:'Casey',body:'Hello <script>alert(1)</script>',created_at:'2026-09-03T12:00:00Z'}],updates:[],checklist:[{id:'k1',project_id:'p1',label:'Clear route',completed:false,sort_order:1}],changes:[{id:'ch1',project_id:'p1',summary:'Move the date',details:'Can we move later?',status:'pending',response:'',created_at:'2026-09-03T12:00:00Z'}],documents:[{id:'d1',project_id:'p1',label:'Floor plan',storage_path:'p1/plan.pdf',created_at:'2026-09-03T12:00:00Z'}]});
const flush = async () => { for(let i=0;i<6;i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function setup(overrides = {}) {
  const calls = [];
  let details = fixture();
  const api = {configured:true,stages,requireSession:async opts=>{calls.push(['requireSession',opts]);return {user:{id:'owner'},profile:{full_name:'Alex'},isAdmin:true};},listProjects:async()=>structuredClone(projects),listCustomers:async()=>customers,getProject:async id=>structuredClone(projects.find(p=>p.id===id)),getProjectDetails:async()=>structuredClone(details),signOut:async()=>{calls.push(['signOut']);},documentUrl:async()=> 'https://example.com/signed.pdf',...overrides};
  for(const key of ['updateProject','postUpdate','sendMessage','reviewChange','addChecklist','deleteChecklist','setChecklist','uploadDocument','deleteDocument']) api[key] = overrides[key] || (async (...args)=>{calls.push([key,...args]); if(key==='postUpdate') details.updates.push({id:'u1',body:args[1],created_at:'2026-09-04T12:00:00Z'}); if(key==='sendMessage') details.messages.push({id:'m2',author_id:'owner',body:args[1],created_at:'2026-09-04T12:00:00Z'}); if(key==='deleteChecklist') details.checklist=[]; if(key==='setChecklist') details.checklist[0].completed=args[1]; if(key==='deleteDocument') details.documents=[];});
  const dom = new JSDOM(html, {url:'https://northwoods.example/admin.html',runScripts:'outside-only'});
  dom.window.NWPortal = api;
  dom.window.eval(code);
  const $ = id=>dom.window.document.getElementById(id);
  const submit = id=>$(id).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,$,api,calls,submit};
}
test('owner workspace authorization, filters, writes, document handling, and stale responses', async () => {
  let t=setup({configured:false,listProjects:async()=>{throw new Error('must not query');}});await flush();assert.equal(t.$('adminWorkspace').hidden,true);assert.match(t.$('gateHeading').textContent,/prepared/);t.dom.window.close();
  t=setup({requireSession:async()=>({user:{id:'customer'},isAdmin:false}),listProjects:async()=>{throw new Error('must not query');}});await flush();assert.equal(t.$('adminWorkspace').hidden,true);assert.match(t.$('gateHeading').textContent,/Owner access/);t.dom.window.close();
  t=setup();await flush();assert.equal(t.$('adminWorkspace').hidden,false);assert.equal(t.$('adminDetail').hidden,false);assert.equal(t.calls[0][0],'requireSession');assert.equal(t.calls[0][1].admin,true);assert.equal(t.$('projectList').querySelectorAll('button').length,2);assert.equal(t.$('selectedProjectTitle').textContent,projects[0].title);assert.equal(t.$('selectedProjectTitle').querySelector('img'),null);assert.equal(t.$('messagesList').querySelector('script'),null);assert.equal(t.$('editTitle').disabled,false);
  t.$('projectSearch').value='river@example.com';t.$('projectSearch').dispatchEvent(new t.dom.window.Event('input'));assert.equal(t.$('projectList').querySelectorAll('button').length,1);assert.match(t.$('projectList').textContent,/Garage safe/);
  t.$('projectSearch').value='';t.$('customerFilter').value='c1';t.$('customerFilter').dispatchEvent(new t.dom.window.Event('change'));assert.equal(t.$('projectList').querySelectorAll('button').length,1);
  t.$('stageFilter').value='complete';t.$('stageFilter').dispatchEvent(new t.dom.window.Event('change'));assert.match(t.$('projectList').textContent,/No projects match/);
  t.$('customerFilter').value='';t.$('stageFilter').value='';t.$('stageFilter').dispatchEvent(new t.dom.window.Event('change'));
  // A late response from an earlier project must not replace the selected project.
  const slow = deferred(); const get=t.api.getProject;t.api.getProject=id=>id==='p2'?slow.promise:get(id);
  t.$('projectList').querySelector('[data-project-id="p2"]').click();
  t.$('projectList').querySelector('[data-project-id="p1"]').click();await flush();slow.resolve(structuredClone(projects[1]));await flush();assert.equal(t.$('selectedProjectTitle').textContent,projects[0].title);
  t.api.getProject=get;
  // Writes lock controls, retain content on rejection, and restore controls.
  const failure=deferred();t.api.sendMessage=()=>failure.promise;t.$('messageBody').value='Please confirm access.';t.submit('messageForm');assert.equal(t.$('editTitle').disabled,true);failure.reject(new Error('Network unavailable'));await flush();assert.equal(t.$('messageBody').value,'Please confirm access.');assert.equal(t.$('editTitle').disabled,false);assert.match(t.$('messageForm').textContent,/Network unavailable/);
  t.api.sendMessage=async(...args)=>t.calls.push(['sendMessage',...args]);t.submit('messageForm');await flush();assert.equal(t.$('messageBody').value,'');assert.ok(t.calls.some(c=>c[0]==='sendMessage'&&c[1]==='p1'&&c[2]==='Please confirm access.'));
  t.$('updateBody').value='Equipment ordered';t.submit('updateForm');await flush();assert.match(t.$('updatesList').textContent,/Equipment ordered/);assert.equal(t.$('updateBody').value,'');
  t.$('checklistLabel').value='Measure stairway';t.submit('checklistForm');await flush();assert.ok(t.calls.some(c=>c[0]==='addChecklist'&&c[2]==='Measure stairway'));
  t.$('checklistList').querySelector('input').click();await flush();assert.ok(t.calls.some(c=>c[0]==='setChecklist'&&c[1]==='k1'&&c[2]===true));assert.equal(t.$('checklistList').querySelector('input').checked,true);
  t.$('checklistList').querySelector('button').click();await flush();assert.match(t.$('checklistList').textContent,/No preparation/);
  const change=t.$('changesList').querySelector('form');change.elements.status.value='approved';change.elements.response.value='Confirmed for later.';change.dispatchEvent(new t.dom.window.Event('submit',{cancelable:true}));await flush();assert.ok(t.calls.some(c=>c[0]==='reviewChange'&&c[1]==='ch1'&&c[2].status==='approved'));
  t.$('editTitle').value='Updated plan';t.$('editStage').value='planning';t.$('editDate').value='2026-10-10';t.$('editDateNote').value='Morning arrival';t.submit('projectEditForm');await flush();assert.ok(t.calls.some(c=>c[0]==='updateProject'&&c[2].installation_date==='2026-10-10'&&c[2].date_note==='Morning arrival'));
  const expired=[];const canceled=[];t.dom.window.setTimeout=(fn)=>{expired.push(fn);return expired.length;};t.dom.window.clearTimeout=(id)=>canceled.push(id);
  t.$('documentsList').querySelector('button').click();await flush();const link=t.$('documentsList').querySelector('a');assert.equal(link.hidden,false);assert.equal(link.href,'https://example.com/signed.pdf');t.$('documentsList').querySelector('button').click();await flush();assert.ok(canceled.includes(1));assert.equal(link.hidden,false);expired.at(-1)();assert.equal(link.hidden,true);
  t.$('documentsList').querySelector('button[aria-label^="Delete"]').click();await flush();assert.match(t.$('documentsList').textContent,/No project documents/);
  // Validate uploads before sending and pass valid file and title through the API.
  const uploadFile=new t.dom.window.File(['plan content'],'plan.pdf',{type:'application/pdf'});Object.defineProperty(t.$('documentFile'),'files',{configurable:true,value:[uploadFile]});t.$('documentForm').reportValidity=()=>true;t.$('documentLabel').value='Plan';t.submit('documentForm');await flush();assert.ok(t.calls.some(c=>c[0]==='uploadDocument'&&c[1]==='p1'&&c[2]===uploadFile&&c[3]==='Plan'));
  const count=t.calls.filter(c=>c[0]==='uploadDocument').length;Object.defineProperty(t.$('documentFile'),'files',{configurable:true,value:[{name:'bad.svg',type:'image/svg+xml',size:10}]});t.$('documentLabel').value='Bad file';t.submit('documentForm');await flush();assert.equal(t.calls.filter(c=>c[0]==='uploadDocument').length,count);assert.match(t.$('documentForm').textContent,/Choose a PDF, PNG, or JPG/);
  Object.defineProperty(t.$('documentFile'),'files',{configurable:true,value:[{name:'large.pdf',type:'application/pdf',size:11*1024*1024}]});t.submit('documentForm');await flush();assert.equal(t.calls.filter(c=>c[0]==='uploadDocument').length,count);assert.match(t.$('documentForm').textContent,/no larger than 10 MB/);
  // A successful write followed by refresh failure must say it was saved and clear submitted text.
  t.api.getProjectDetails=async()=>{throw new Error('refresh failed');};t.$('messageBody').value='Persisted note';t.submit('messageForm');await flush();assert.equal(t.$('messageBody').value,'');assert.match(t.$('messageForm').textContent,/Message sent.*latest view could not be loaded/);
  t.$('adminSignOut').click();await flush();assert.equal(t.$('adminWorkspace').hidden,true);assert.match(t.$('gateHeading').textContent,/signed out/);t.dom.window.close();
  t=setup({getProjectDetails:async()=>({...fixture(),changes:[{id:'approved1',summary:'Saved review',details:'Existing request',status:'approved',response:'Already agreed',created_at:'2026-09-04T00:00:00Z'}]})});await flush();t.$('refreshProjects').click();await flush();assert.equal(t.$('changesList').querySelector('select').value,'approved');assert.equal(t.$('changesList').querySelector('textarea').value,'Already agreed');t.dom.window.close();
  t=setup({listProjects:async()=>[]});await flush();assert.equal(t.$('adminDetail').hidden,true);assert.match(t.$('projectList').textContent,/New customer projects/);t.dom.window.close();
  t=setup({listProjects:async()=>{throw new Error('Connection failed');}});await flush();assert.match(t.$('adminStatus').textContent,/Connection failed/);assert.equal(t.$('refreshProjects').disabled,false);t.dom.window.close();
  console.log('PASS: setup gate, authorization, loading, safe text, filters, stale response protection, mutation errors and success, checklist, change reviews, project editing, documents/renewal, upload validation, saved-review refresh, partial-refresh success, sign out, empty/error states.');
});
