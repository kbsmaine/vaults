const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..') + path.sep;
const source = fs.readFileSync(root+'portal.js','utf8');
const html = fs.readFileSync(root+'portal.html','utf8');
class Element {
 constructor(tag='div'){ this.tagName=tag;this.dataset={};this.children=[];this.events={};this.attrs={};this.hidden=false;this.disabled=false;this.value='';this.isConnected=true;this.scrollHeight=500;this._text=''; }
 set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 append(...items){this.children.push(...items);} replaceChildren(...items){this.children.forEach(c=>c.isConnected=false);this.children=items;this._text='';}
 setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];} addEventListener(k,f){this.events[k]=f;}
 querySelectorAll(){return this.controls||[];} focus(){this.focused=true;} reportValidity(){return true;} reset(){(this.controls||[]).forEach(c=>c.value='');}
 fire(type){return this.events[type]?.({preventDefault(){},currentTarget:this});}
}
const empty = ()=>({messages:[],changes:[],checklist:[],updates:[],documents:[]});
const project=(id='p1',owner='u1')=>({id,customer_id:owner,title:'Project '+id,service_type:'vault-room',zip_code:'04001',description:'<img src=x onerror=bad()>',stage:'planning',installation_date:null,created_at:'2026-09-10T10:00:00Z'});
const stages=['requested','planning','ordered','scheduled','installing','complete'].map(value=>({value,label:value}));
function setup(overrides={}){
 const ids={};
 for(const m of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[1]);e.hidden=/\bhidden\b/.test(m[2]);ids[m[3]]=e;}
 const forms={newProjectForm:{newTitle:'title',newService:'service_type',newZip:'zip_code',newDescription:'description'},messageForm:{messageBody:'body'},changeForm:{changeSummary:'summary',changeDetails:'details'}};
 for(const [form,fields] of Object.entries(forms)){ids[form].controls=Object.entries(fields).map(([id,name])=>Object.assign(ids[id],{name}));ids[form].controls.push(new Element('button'));}
 const api={configured:true,stages,requireSession:async()=>({user:{id:'u1'},profile:{full_name:'Customer'},isAdmin:false}),listProjects:async()=>[project()],getProject:async(id)=>project(id),getProjectDetails:async()=>empty(),sendMessage:async()=>{},requestChange:async()=>{},createProject:async()=>project('new'),setChecklist:async()=>{},documentUrl:async()=> 'https://project.supabase.co/storage/document.pdf?token=x',signOut:async()=>{},...overrides};
 vm.runInNewContext(source,{window:{NWPortal:api},document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag)},URL,Intl,Date,FormData:class{constructor(form){this.form=form;}get(name){return this.form.controls.find(c=>c.name===name)?.value;}}});
 return {ids,api};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('customer portal: authorization, async races, input safety, and write lifecycles', async()=>{
 let x=setup({configured:false,requireSession:async()=>{throw Error('Must not authenticate')}});await flush();assert.equal(x.ids.setupNotice.hidden,false);assert.equal(x.ids.portalApp.hidden,true);
 x=setup({requireSession:async()=>null});await flush();assert.equal(x.ids.portalApp.hidden,true);
 x=setup({listProjects:async()=>[]});await flush();assert.equal(x.ids.newProjectPanel.hidden,false);assert.equal(x.ids.emptyAccount.hidden,false);assert.equal(x.ids.projectContent.hidden,true);
 x=setup({requireSession:async()=>({user:{id:'u1'},profile:{},isAdmin:true}),listProjects:async()=>[project('other','u2'),project()]});await flush();assert.equal(x.ids.projectSelect.children.length,1);assert.equal(x.ids.projectTitle.textContent,'Project p1');assert.equal(x.ids.ownerLink.hidden,false);
 assert.equal(x.ids.projectDescription.textContent,'<img src=x onerror=bad()>');assert.equal(x.ids.projectDescription.children.length,0);assert.equal(x.ids.projectTimeline.children[1].attrs['aria-current'],'step');assert.equal(x.ids.projectMessages.scrollTop,500);
 const a=deferred(),b=deferred();x=setup({listProjects:async()=>[project('a'),project('b')],getProject: id=>id==='a'?a.promise:b.promise});await flush();x.ids.projectSelect.value='b';x.ids.projectSelect.fire('change');b.resolve(project('b'));await flush();a.resolve(project('a'));await flush();assert.equal(x.ids.projectTitle.textContent,'Project b');
 x=setup({sendMessage:async()=>{throw Error('Network unavailable');}});await flush();x.ids.messageBody.value='Keep this draft';await x.ids.messageForm.fire('submit');assert.equal(x.ids.messageBody.value,'Keep this draft');assert.equal(x.ids.messageStatus.dataset.tone,'error');assert.match(x.ids.messageStatus.textContent,/Network/);assert.equal(x.ids.messageBody.disabled,false);
 const sending=deferred();let sends=0;x=setup({sendMessage:()=>{sends++;return sending.promise;}});await flush();x.ids.messageBody.value='A question';const first=x.ids.messageForm.fire('submit');x.ids.messageForm.fire('submit');assert.equal(sends,1);assert.equal(x.ids.projectSelect.disabled,true);sending.resolve();await first;assert.equal(x.ids.messageBody.value,'');assert.equal(x.ids.messageStatus.dataset.tone,'success');
 const d=empty();d.checklist=[{id:'c1',label:'Clear path',completed:false,sort_order:0}];d.documents=[{id:'d1',label:'Plan',storage_path:'p1/plan.pdf',created_at:'2026-09-10T10:00:00Z'}];x=setup({getProjectDetails:async()=>d,setChecklist:async()=>{throw Error('Denied')}});await flush();const box=x.ids.projectChecklist.children[0].children[0].children[0];box.checked=true;await box.fire('change');assert.equal(box.checked,false);assert.equal(x.ids.checklistStatus.dataset.tone,'error');const actions=x.ids.projectDocuments.children[0].children[1];assert.equal(actions.children[1].hidden,true);await actions.children[0].fire('click');assert.equal(actions.children[1].hidden,false);assert.match(actions.children[1].href,/^https:/);assert.equal(actions.children[1].rel,'noopener noreferrer');
 x=setup({getProjectDetails:async()=>d,documentUrl:async()=> 'javascript:alert(1)'});await flush();const unsafe=x.ids.projectDocuments.children[0].children[1];await unsafe.children[0].fire('click');assert.equal(unsafe.children[1].hidden,true);assert.equal(x.ids.documentStatus.dataset.tone,'error');
 x=setup({listProjects:async()=>[]});await flush();Object.assign(x.ids.newTitle,{value:'My new project'});x.ids.newService.value='vault-room';x.ids.newZip.value='04001';x.ids.newDescription.value='Description';await x.ids.newProjectForm.fire('submit');assert.equal(x.ids.newProjectPanel.hidden,true);assert.equal(x.ids.projectTitle.textContent,'Project new');assert.match(x.ids.pageStatus.textContent,/sent/);
 console.log('PASS: setup gating, session gating, empty account, customer scoping, safe text, stage rendering, async project race, draft preservation, duplicate submission guard, checklist rollback, secure document link validation, and project creation.');
});
