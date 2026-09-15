'use strict';

// Dependency-free contract tests. These exercise the real scripts and form
// names without a browser or a live Supabase project; RLS still needs the
// separate database verification described in PORTAL_SETUP.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'account.html'), 'utf8');
const accountSource = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'portal-api.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const user = {id:'customer-1', email:'customer@example.test'};
const session = {user};

function attributes(source) {
  const values = {};
  for (const match of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) values[match[1]] = match[2] ?? '';
  return values;
}

function element(attrs={}) {
  const node = {
    id:attrs.id, name:attrs.name, value:attrs.value || '',
    hidden:Object.hasOwn(attrs,'hidden'), disabled:Object.hasOwn(attrs,'disabled'),
    textContent:'', dataset:{}, handlers:{}, children:[], resets:0,
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); },
    async dispatch(name) {
      await Promise.all((this.handlers[name] || []).map(fn => fn({preventDefault(){}, currentTarget:this})));
      await settle();
    },
    reportValidity() { return this.valid !== false; },
    querySelectorAll(selector) {
      assert.equal(selector,'button,input');
      return this.children;
    },
    reset() { this.resets++; this.children.forEach(child => {if(child.name) child.value='';}); }
  };
  for (const [key,value] of Object.entries(attrs)) {
    if(key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
  }
  return node;
}

function documentStub() {
  const ids = new Map();
  for(const match of html.matchAll(/<\w+\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const attrs=attributes(match[1]);
    ids.set(attrs.id,element(attrs));
  }
  const forms=[];
  const switches=[];
  const controls=[];
  for(const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    const form=ids.get(attributes(match[1]).id);
    forms.push(form);
    for(const childMatch of match[2].matchAll(/<(?:input|button)\b([^>]*)>/g)) {
      const attrs=attributes(childMatch[1]);
      const child=attrs.id ? ids.get(attrs.id) : element(attrs);
      form.children.push(child); controls.push(child);
      if(child.dataset.mode) switches.push(child);
    }
  }
  ids.get('authViews').children=controls;
  return {
    ids, forms, controls,
    getElementById(id) { assert.ok(ids.has(id),`Unexpected DOM id: ${id}`); return ids.get(id); },
    querySelectorAll(selector) {
      if(selector==='[data-auth-view]') return forms;
      if(selector==='[data-mode]') return switches;
      throw new Error(`Unexpected selector: ${selector}`);
    }
  };
}

function locationStub(href='https://northwoods.example/account.html') {
  const url = new URL(href);
  const redirects=[];
  const location={href:url.href,hash:url.hash,search:url.search,pathname:url.pathname,replace:target=>redirects.push(target)};
  const history={replacements:[], replaceState(_state,_unused,target) {
    this.replacements.push(target);
    const next=new URL(target,location.href);
    Object.assign(location,{href:next.href,hash:next.hash,search:next.search,pathname:next.pathname});
  }};
  return {location,history,redirects};
}

async function accountHarness({configured=true,href,initialSession=null,overrides={}}={}) {
  const document=documentStub();
  const {location,history,redirects}=locationStub(href);
  const calls=[];
  let callback;
  let formDataReads=0;
  const responses={
    getSession:()=>({data:{session:initialSession},error:null}),
    signInWithPassword:()=>({data:{session,user},error:null}),
    signUp:()=>({data:{session:null,user},error:null}),
    resetPasswordForEmail:()=>({data:{},error:null}),
    resend:()=>({data:{},error:null}),
    updateUser:()=>({data:{user},error:null}),
    signOut:()=>({error:null}), ...overrides
  };
  const auth={onAuthStateChange(fn) {callback=fn;return {data:{subscription:{unsubscribe(){}}}};}};
  for(const [name,implementation] of Object.entries(responses)) auth[name]=async(...args)=>{
    calls.push({name,args:copy(args)});
    return implementation(...args);
  };
  const api={configured,client:{auth},redirectURL:mode=>`https://northwoods.example/account.html?mode=${mode}`,signOut:async()=>{redirects.push('account.html');}};
  class FormDataStub {
    constructor(form) {formDataReads++; this.form=form;}
    get(name) { return this.form.children.find(node=>node.name===name)?.value ?? null; }
  }
  const context=vm.createContext({window:{NWPortal:api,location},document,history,URLSearchParams,FormData:FormDataStub,console});
  await vm.runInContext(accountSource,context,{filename:'account.js'});
  return {
    document,location,history,redirects,calls,auth,
    get formDataReads(){return formDataReads;},
    emit(event){callback?.(event);},
    async submit(id,values) {
      const form=document.getElementById(id);
      for(const [name,value] of Object.entries(values)) {
        const input=form.children.find(node=>node.name===name);
        assert.ok(input,`${id} has no ${name} input`); input.value=value;
      }
      await form.dispatch('submit');
    },
    get status(){return document.getElementById('accountStatus');},
    get visibleForm(){return document.forms.find(form=>!form.hidden)?.id;}
  };
}

function apiHarness({config,queryResponse,storageResponse,rpcResponse,authOverrides={}}={}) {
  const calls=[];
  const {location,history,redirects}=locationStub('https://northwoods.example/vaults/account.html');
  const auth={getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session},error:null}),
    signOut:async()=>({error:null}),onAuthStateChange(){},...authOverrides};
  function builder(table) {
    const query={table,steps:[]}; calls.push(query);
    const value={};
    for(const method of ['select','eq','order','single','insert','update','delete']) value[method]=(...args)=>{
      query.steps.push({method,args:copy(args)}); return value;
    };
    value.then=(resolve,reject)=>Promise.resolve(queryResponse ? queryResponse(query) : {
      data:table==='profiles'?{id:user.id,full_name:'Customer',email:user.email}:[{id:'row-1'}],error:null
    }).then(resolve,reject);
    return value;
  }
  const storage={from(bucket){return Object.fromEntries(['createSignedUrl','upload','remove'].map(method=>[method,async(...args)=>{
    const call={storage:true,bucket,method,args:copy(args)};calls.push(call);
    return storageResponse ? storageResponse(call) : {data:method==='createSignedUrl'?{signedUrl:'https://project.supabase.co/storage/v1/object/sign/project-documents/customer-1/file.pdf?token=short-lived'}:{},error:null};
  }]))}};
  const client={auth,from:builder,storage,rpc:async(name,args)=>{
    const call={rpc:name,args:copy(args || {})};calls.push(call);
    return rpcResponse ? rpcResponse(call) : {data:name==='is_admin'?false:null,error:null};
  }};
  const window={location,PORTAL_CONFIG:config || {supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_testKey'},
    supabase:{createClient(...args){calls.push({createClient:copy(args)});return client;}}};
  vm.runInNewContext(apiSource,{window,history,URL,crypto:{randomUUID:()=> 'fixed-uuid'},console},{filename:'portal-api.js'});
  return {api:window.NWPortal,calls,redirects};
}

test('unconfigured account hides credential forms, attaches no capture handler, and makes no auth calls',async()=>{
  const h=await accountHarness({configured:false});
  assert.equal(h.document.getElementById('authViews').hidden,true);
  assert.equal(h.document.getElementById('unavailable').hidden,false);
  await h.submit('signInForm',{email:'test@example.test',password:'a password'});
  assert.equal(h.formDataReads,0);
  assert.equal(h.calls.length,0);
  assert.deepEqual(h.redirects,[]);
});

test('configuration rejects secret, service-role JWT, malformed key, and foreign URL',()=>{
  const roleJwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
  for(const key of ['sb_secret_realSecret',roleJwt,'anon-key','', 'sb_publishable_public\nsecret']) {
    const h=apiHarness({config:{supabaseUrl:'https://project.supabase.co',supabasePublishableKey:key}});
    assert.equal(h.api.configured,false,key);assert.equal(h.calls.length,0,key);
  }
  for(const url of ['http://project.supabase.co','https://project.supabase.co.evil.test','javascript:alert(1)']) {
    assert.equal(apiHarness({config:{supabaseUrl:url,supabasePublishableKey:'sb_publishable_test'}}).api.configured,false);
  }
});

test('unconfigured API blocks data access before creating a client',async()=>{
  const h=apiHarness({config:{}});
  await assert.rejects(h.api.listProjects(),/not available/i);
  assert.equal(h.calls.length,0);
  assert.equal(await h.api.requireSession(),null);
  assert.deepEqual(h.redirects,['account.html']);
});

for(const suffix of ['?mode=update-password','#access_token=example&type=recovery']) {
  test(`recovery link ${suffix} shows password update and never redirects early`,async()=>{
    const h=await accountHarness({href:`https://northwoods.example/account.html${suffix}`,initialSession:session});
    assert.equal(h.visibleForm,'passwordForm');
    assert.equal(h.document.getElementById('signedIn').hidden,true);
    assert.deepEqual(h.redirects,[]);
    assert.equal(h.calls.filter(call=>call.name==='updateUser').length,0);
    if(suffix.startsWith('#')) assert.equal(h.location.hash,'');
  });
}

test('PASSWORD_RECOVERY event opens the password form after initial session check',async()=>{
  const h=await accountHarness({initialSession:session});
  h.emit('PASSWORD_RECOVERY');
  assert.equal(h.visibleForm,'passwordForm');assert.deepEqual(h.redirects,[]);
});

test('expired recovery session offers a fresh reset link without attempting password update',async()=>{
  const h=await accountHarness({href:'https://northwoods.example/account.html?mode=update-password'});
  assert.equal(h.visibleForm,'resetForm');assert.equal(h.status.dataset.tone,'error');
  assert.equal(h.calls.filter(call=>call.name==='updateUser').length,0);
  assert.deepEqual(h.redirects,[]);
});

test('sign-in failure stays on account page and makes controls usable again',async()=>{
  const h=await accountHarness({overrides:{signInWithPassword:()=>({error:{message:'Invalid login credentials'}})}});
  await h.submit('signInForm',{email:' person@example.test ',password:'bad password'});
  assert.deepEqual(h.redirects,[]);assert.match(h.status.textContent,/did not match/i);
  assert.equal(h.status.dataset.tone,'error');
  assert.ok(h.document.controls.every(control=>!control.disabled));
  assert.equal(h.calls.find(call=>call.name==='signInWithPassword').args[0].email,'person@example.test');
});

test('sign-in redirects only after the asynchronous request succeeds and ignores repeated submission',async()=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const h=await accountHarness({overrides:{signInWithPassword:()=>pending}});
  await h.submit('signInForm',{email:'person@example.test',password:'a long password'});
  await h.submit('signInForm',{email:'person@example.test',password:'a long password'});
  assert.deepEqual(h.redirects,[]);
  assert.equal(h.calls.filter(call=>call.name==='signInWithPassword').length,1);
  assert.ok(h.document.controls.every(control=>control.disabled));
  finish({data:{session},error:null});await settle();
  assert.deepEqual(h.redirects,['portal.html']);
});

test('sign-up without a session requests email confirmation and does not redirect',async()=>{
  const h=await accountHarness();
  await h.submit('signUpForm',{email:' person@example.test ',full_name:' Jane Doe ',password:'long passphrase',confirm:'long passphrase'});
  assert.deepEqual(h.redirects,[]);assert.equal(h.visibleForm,'signInForm');
  assert.match(h.status.textContent,/confirmation link/i);
  assert.equal(h.status.dataset.tone,'success');
  const call=h.calls.find(call=>call.name==='signUp');
  assert.equal(call.args[0].options.data.full_name,'Jane Doe');
  assert.match(call.args[0].options.emailRedirectTo,/account\.html\?mode=confirmed$/);
  assert.equal(h.document.getElementById('signUpForm').resets,1);
});

test('password mismatch is rejected before sending signup credentials',async()=>{
  const h=await accountHarness();
  await h.submit('signUpForm',{email:'person@example.test',full_name:'Jane Doe',password:'long passphrase',confirm:'other passphrase'});
  assert.equal(h.calls.filter(call=>call.name==='signUp').length,0);
  assert.equal(h.status.dataset.tone,'error');assert.match(h.status.textContent,/don’t match/i);
});

test('successful email-confirmation callback offers portal access without losing the session',async()=>{
  const h=await accountHarness({initialSession:session,href:'https://northwoods.example/account.html?mode=confirmed#access_token=example'});
  assert.equal(h.document.getElementById('signedIn').hidden,false);
  assert.equal(h.document.getElementById('authViews').hidden,true);
  assert.match(h.status.textContent,/email is confirmed/i);
  assert.equal(h.location.hash,'');assert.deepEqual(h.redirects,[]);
});

test('reset request returns the same nondisclosing message for registered and unknown addresses',async()=>{
  const messages=[];
  for(const email of ['registered@example.test','unknown@example.test']) {
    const h=await accountHarness();await h.submit('resetForm',{email});
    messages.push(h.status.textContent);assert.equal(h.status.dataset.tone,'success');
    assert.match(h.calls.find(call=>call.name==='resetPasswordForEmail').args[1].redirectTo,/mode=update-password$/);
  }
  assert.equal(messages[0],messages[1]);assert.match(messages[0],/If an account uses that email/);
});

test('reset unknown-user errors cannot disclose whether an address has an account',async()=>{
  const normal=await accountHarness();await normal.submit('resetForm',{email:'registered@example.test'});
  const unknown=await accountHarness({overrides:{resetPasswordForEmail:()=>({error:{code:'user_not_found',message:'User not found'}})}});
  await unknown.submit('resetForm',{email:'unknown@example.test'});
  assert.equal(unknown.status.textContent,normal.status.textContent);
  assert.equal(unknown.status.dataset.tone,normal.status.dataset.tone);
});

test('reset network failure is shown as an error rather than a sent-email claim',async()=>{
  const h=await accountHarness({overrides:{resetPasswordForEmail:()=>({error:{message:'Network fetch failed'}})}});
  await h.submit('resetForm',{email:'person@example.test'});
  assert.equal(h.status.dataset.tone,'error');assert.match(h.status.textContent,/couldn’t connect/i);
  assert.doesNotMatch(h.status.textContent,/on its way/i);
});

test('password update failure keeps recovery form and does not sign out or redirect',async()=>{
  const h=await accountHarness({initialSession:session,href:'https://northwoods.example/account.html?mode=update-password',
    overrides:{updateUser:()=>({error:{message:'New password should be different from the old password.'}})}});
  await h.submit('passwordForm',{password:'long passphrase',confirm:'long passphrase'});
  assert.equal(h.visibleForm,'passwordForm');assert.equal(h.status.dataset.tone,'error');
  assert.equal(h.calls.filter(call=>call.name==='signOut').length,0);assert.deepEqual(h.redirects,[]);
});

test('password update succeeds before global refresh-token signout and returns to sign in',async()=>{
  const h=await accountHarness({initialSession:session,href:'https://northwoods.example/account.html?mode=update-password'});
  await h.submit('passwordForm',{password:'long passphrase',confirm:'long passphrase'});
  const updateIndex=h.calls.findIndex(call=>call.name==='updateUser');
  const signoutIndex=h.calls.findIndex(call=>call.name==='signOut');
  assert.ok(signoutIndex>updateIndex && updateIndex>=0);
  assert.deepEqual(h.calls[signoutIndex].args,[{scope:'global'}]);
  assert.equal(h.visibleForm,'signInForm');assert.equal(h.status.dataset.tone,'success');
  assert.deepEqual(h.redirects,[]);assert.equal(h.location.search,'');
});

test('failed global signout preserves password-save notice and retries only signout from the account page',async()=>{
  let attempts=0;
  const h=await accountHarness({initialSession:session,href:'https://northwoods.example/account.html?mode=update-password',
    overrides:{signOut:()=>({error:++attempts<3?{message:'Network fetch failed'}:null})}});
  await h.submit('passwordForm',{password:'long passphrase',confirm:'long passphrase'});
  assert.equal(h.document.getElementById('authViews').hidden,true);
  assert.equal(h.document.getElementById('signedIn').hidden,false);
  assert.match(h.status.textContent,/password was saved/i);
  assert.match(h.status.textContent,/did not finish/i);
  assert.deepEqual(h.redirects,[]);
  const button=h.document.getElementById('accountSignOut');
  assert.match(button.textContent,/finish signing out/i);
  await button.dispatch('click');
  assert.equal(h.status.dataset.tone,'error');assert.equal(button.disabled,false);
  assert.deepEqual(h.redirects,[]);
  await button.dispatch('click');
  assert.deepEqual(h.redirects,['account.html']);
  assert.equal(h.calls.filter(call=>call.name==='updateUser').length,1);
  const signouts=h.calls.filter(call=>call.name==='signOut');
  assert.equal(signouts.length,3);
  assert.ok(signouts.every(call=>call.args[0].scope==='global'));
});

test('resend confirmation gives the same response for pending, unknown, and already-confirmed accounts',async()=>{
  const messages=[];
  for(const error of [null,{code:'user_not_found',message:'User not found'},
    {code:'email_already_confirmed',message:'Email already confirmed'}]) {
    const h=await accountHarness({overrides:{resend:()=>({error})}});
    await h.submit('resendForm',{email:'person@example.test'});
    messages.push(h.status.textContent);
    assert.equal(h.status.dataset.tone,'success');
    const call=h.calls.find(call=>call.name==='resend');
    assert.equal(call.args[0].type,'signup');
    assert.match(call.args[0].options.emailRedirectTo,/mode=confirmed$/);
  }
  assert.equal(new Set(messages).size,1);
});

test('private documents use the private bucket and a 60-second signed download URL',async()=>{
  const h=apiHarness();const signed=await h.api.documentUrl('project-1/private.pdf');
  assert.match(signed,/\/object\/sign\//);assert.match(signed,/token=/);
  assert.deepEqual(h.calls.find(call=>call.storage),{storage:true,bucket:'project-documents',method:'createSignedUrl',args:['project-1/private.pdf',60,{download:true}]});
});

test('storage signing errors propagate instead of yielding a public URL',async()=>{
  const h=apiHarness({storageResponse:()=>({data:null,error:new Error('permission denied')})});
  await assert.rejects(h.api.documentUrl('other-project/private.pdf'),/permission denied/);
});

test('database errors reject reads and writes instead of becoming successful results',async()=>{
  const error=new Error('RLS denied the operation');
  const h=apiHarness({queryResponse:()=>({data:null,error})});
  await assert.rejects(h.api.listProjects(),/RLS denied/);
  await assert.rejects(h.api.createProject({title:'Test',service_type:'vault-room'}),/RLS denied/);
  await assert.rejects(h.api.requestChange('p-1',{summary:'Change',details:'Details'}),/RLS denied/);
  await assert.rejects(h.api.postUpdate('p-1','Update'),/RLS denied/);
});

test('admin updates and deletes require one returned row so zero-row RLS results cannot appear successful',async()=>{
  const h=apiHarness({queryResponse:query=>{
    const requiresSingle=query.steps.some(step=>step.method==='single');
    return requiresSingle?{data:null,error:new Error('JSON object requested, multiple (or no) rows returned')}:{data:[],error:null};
  }});
  await assert.rejects(h.api.updateProject('missing',{title:'New',stage:'planning'}),/no\) rows/);
  await assert.rejects(h.api.reviewChange('missing',{status:'approved',response:'Yes'}),/no\) rows/);
  await assert.rejects(h.api.deleteChecklist('missing'),/no\) rows/);
  await assert.rejects(h.api.deleteDocument({id:'missing',storage_path:'p-1/file.pdf'}),/no\) rows/);
});

test('project creation derives ownership from the authenticated user and drops admin-only fields',async()=>{
  const h=apiHarness();await h.api.createProject({customer_id:'victim',title:'My safe',service_type:'gun-safe',zip_code:'04001',description:'Ground floor',stage:'complete',installation_date:'2026-10-01'});
  const inserted=h.calls.find(call=>call.table==='projects').steps.find(step=>step.method==='insert').args[0];
  assert.deepEqual(inserted,{customer_id:user.id,title:'My safe',service_type:'gun-safe',zip_code:'04001',description:'Ground floor'});
});

test('checklist completion calls the narrow RPC and propagates access errors',async()=>{
  const h=apiHarness({rpcResponse:()=>({data:null,error:new Error('not authorized')})});
  await assert.rejects(h.api.setChecklist('item-1',true),/not authorized/);
  assert.deepEqual(h.calls.find(call=>call.rpc),{rpc:'set_checklist_completed',args:{item_id:'item-1',is_completed:true}});
  assert.equal(h.calls.some(call=>call.table==='project_checklist'),false);
});

test('ordinary customers cannot enter the admin UI even if local metadata says admin',async()=>{
  const h=apiHarness({authOverrides:{getUser:async()=>({data:{user:{...user,user_metadata:{is_admin:true,role:'admin'}}},error:null})}});
  assert.equal(await h.api.requireSession({admin:true}),null);
  assert.deepEqual(h.redirects,['portal.html']);
});

test('document uploads reject invalid content types and oversize files before any storage call',async()=>{
  const h=apiHarness();
  for(const file of [{type:'text/html',size:100,name:'x.html'},{type:'application/pdf',size:10*1024*1024+1,name:'big.pdf'},{type:'image/png',size:0,name:'empty.png'}]) {
    await assert.rejects(h.api.uploadDocument('p-1',file,'Document'),/PDF, JPG, or PNG/);
  }
  assert.equal(h.calls.some(call=>call.storage),false);
});

test('document metadata failure removes the newly uploaded object and still rejects',async()=>{
  const h=apiHarness({queryResponse:()=>({data:null,error:new Error('metadata insert failed')})});
  await assert.rejects(h.api.uploadDocument('p-1',{type:'application/pdf',size:100,name:'plan.pdf'},'Plan'),/metadata insert failed/);
  const operations=h.calls.filter(call=>call.storage);
  assert.equal(operations[0].method,'upload');assert.match(operations[0].args[0],/^p-1\/.+\.pdf$/);
  assert.equal(operations[0].args[2].upsert,false);
  assert.equal(operations[1].method,'remove');assert.equal(operations[1].args[0][0],operations[0].args[0]);
});

test('signout failure never redirects as if the session were ended',async()=>{
  const h=apiHarness({authOverrides:{signOut:async()=>({error:new Error('offline')})}});
  await assert.rejects(h.api.signOut(),/offline/);assert.deepEqual(h.redirects,[]);
});
