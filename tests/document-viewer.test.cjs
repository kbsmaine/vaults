'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const code = fs.readFileSync(path.resolve(__dirname, '../document-viewer.js'), 'utf8');
const record = {label:'Installation plan',storage_path:'p1/plan.png'};
const deferred = () => {let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject};};
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(load = async () => new Blob(['fixture'], {type:'image/png'})) {
  const dom = new JSDOM('<!doctype html><body><button id="view">View document</button></body>', {url:'https://northwoods.example/portal.html',runScripts:'outside-only'});
  const w = dom.window, calls = [], urls = [], revoked = [], timers = new Map();
  w.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  w.HTMLDialogElement.prototype.close = function(){this.open=false;};
  w.URL.createObjectURL = file => {urls.push(file); return `blob:https://northwoods.example/${urls.length}`;};
  w.URL.revokeObjectURL = url => revoked.push(url);
  w.setTimeout = fn => {const id=Symbol();timers.set(id,fn);return id;};
  w.clearTimeout = id => timers.delete(id);
  w.NWPortal = {documentFile:(...args)=>{calls.push(args);return load(...args);}};
  w.eval(code);
  const $ = selector=>w.document.querySelector(selector);
  const click = label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label).click();
  $('#view').focus();
  return {dom,w,$,click,calls,urls,revoked,timers,viewer:w.NWDocumentViewer};
}
test('images open in an accessible modal, zoom, download with a filename, and release resources on close', async()=>{
  const h=setup(); await h.viewer.open(record);
  assert.equal(h.$('dialog').open,true);
  assert.equal(h.$('dialog').getAttribute('aria-labelledby'),'documentViewerTitle');
  assert.equal(h.w.document.activeElement.textContent,'Close ×');
  const img=h.$('img'); assert.equal(img.alt,record.label);assert.match(img.src,/^blob:/);
  h.$('.document-viewer-canvas').style.padding='16px';
  Object.defineProperties(img,{naturalWidth:{value:1000},naturalHeight:{value:600}});
  Object.defineProperties(h.$('.document-viewer-canvas'),{clientWidth:{value:832},clientHeight:{value:632}});
  img.dispatchEvent(new h.w.Event('load'));
  assert.equal(h.$('.document-viewer-zoom').hidden,false);
  h.click('+');assert.equal(img.style.width,'1000px');
  h.click('−');assert.equal(img.style.width,'800px');
  h.click('Fit');assert.equal(h.$('.document-viewer-canvas').dataset.fit,'true');
  const download=h.$('a[download]');assert.equal(download.hidden,false);assert.equal(download.download,'Installation plan.png');assert.equal(download.href,img.src);
  assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
  h.click('Close ×');assert.equal(h.$('dialog').open,false);assert.equal(h.$('img'),null);
  assert.equal(download.hasAttribute('href'),false);assert.deepEqual(h.revoked,['blob:https://northwoods.example/1']);
  assert.equal(h.w.document.activeElement.id,'view');assert.equal(h.calls[0][1].signal.aborted,true);h.dom.window.close();
});
test('large images below ten-percent fit shrink when zooming out on a small screen',async()=>{
  const h=setup();await h.viewer.open(record);
  const img=h.$('img'),canvas=h.$('.document-viewer-canvas');
  canvas.style.padding='10px';
  Object.defineProperties(img,{naturalWidth:{value:6000},naturalHeight:{value:4000}});
  Object.defineProperties(canvas,{clientWidth:{value:390},clientHeight:{value:650}});
  img.dispatchEvent(new h.w.Event('load'));
  assert.equal(h.$('[aria-label="Show image at actual size"]').textContent,'6%');
  h.click('−');assert.equal(img.style.width,'296px');
  h.click('+');assert.equal(img.style.width,'370px');
  h.click('Fit');assert.equal(canvas.dataset.fit,'true');
  h.viewer.close();h.dom.window.close();
});
test('PDF preview has a title and keeps the independent download option',async()=>{
  const h=setup(async()=>new Blob(['%PDF-fixture'],{type:'application/pdf'}));
  await h.viewer.open({...record,label:'Estimate.pdf',storage_path:'p1/estimate.pdf'});
  assert.equal(h.$('iframe').title,'PDF preview: Estimate.pdf');
  assert.equal(h.$('iframe').referrerPolicy,'no-referrer');
  assert.match(h.$('.document-viewer-status').textContent,/does not display.*Download/);
  assert.equal(h.$('a[download]').download,'Estimate.pdf');assert.equal(h.$('.document-viewer-zoom').hidden,true);
  h.viewer.close();assert.equal(h.$('iframe'),null);h.dom.window.close();
});
test('network failure supports retry and requests a fresh private document',async()=>{
  let attempt=0;const h=setup(async()=>{if(++attempt===1)throw new Error('Connection unavailable');return new Blob(['image'],{type:'image/jpeg'});});
  await h.viewer.open(record);assert.match(h.$('[role=status]').textContent,/Connection unavailable/);
  assert.equal(h.$('a').hidden,true);h.click('Try again');await flush();assert.equal(h.calls.length,2);
  assert.equal(h.$('a[download]').hidden,false);assert.equal(h.$('a[download]').download,'Installation plan.jpg');
  h.viewer.close();h.dom.window.close();
});
test('a stalled request ends after the deadline and can be retried',async()=>{
  const pending=deferred();const h=setup(()=>pending.promise);const loading=h.viewer.open(record);
  [...h.timers.values()][0]();await loading;
  assert.match(h.$('[role=status]').textContent,/taking too long/);assert.equal(h.calls[0][1].signal.aborted,true);
  pending.resolve(new Blob(['late'],{type:'image/png'}));await flush();assert.equal(h.$('img'),null);
  h.viewer.close();h.dom.window.close();
});
test('closing a loading viewer discards late results and restores focus',async()=>{
  const pending=deferred();const h=setup(()=>pending.promise);const loading=h.viewer.open(record);
  h.$('dialog').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));await loading;
  assert.equal(h.$('dialog').open,false);assert.equal(h.timers.size,0);
  pending.resolve(new Blob(['late'],{type:'image/png'}));await flush();
  assert.equal(h.urls.length,0);assert.equal(h.$('img'),null);assert.equal(h.w.document.activeElement.id,'view');h.dom.window.close();
});
test('switching documents ignores an earlier result and clears the previous object URL',async()=>{
  const slow=deferred();let count=0;const h=setup(()=>++count===1?slow.promise:Promise.resolve(new Blob(['new'],{type:'image/png'})));
  const first=h.viewer.open(record);await h.viewer.open({...record,label:'Second'});await first;
  slow.resolve(new Blob(['old'],{type:'image/png'}));await flush();assert.equal(h.urls.length,1);assert.equal(h.$('img').alt,'Second');
  await h.viewer.open({...record,label:'Third'});assert.equal(h.revoked.length,1);h.viewer.close();assert.equal(h.revoked.length,2);h.dom.window.close();
});
test('HTML, oversized and empty files never receive a preview or download URL',async t=>{
  for(const file of [new Blob(['<script>alert(1)</script>'],{type:'text/html'}),{type:'image/png',size:10*1024*1024+1},new Blob([],{type:'image/png'})]){
    await t.test(`${file.type} ${file.size}`,async()=>{
      const h=setup(async()=>file);await h.viewer.open(record);assert.equal(h.urls.length,0);assert.equal(h.$('a').hidden,true);assert.equal(h.$('[role=status]').dataset.tone,'error');h.viewer.close();h.dom.window.close();
    });
  }
});
test('untrusted labels stay text and a failed image render retains download',async()=>{
  const h=setup();await h.viewer.open({...record,label:'<script>bad()</script>/plan'});
  assert.equal(h.$('script'),null);assert.equal(h.$('h2').textContent,'<script>bad()</script>/plan');
  assert.doesNotMatch(h.$('a[download]').download,/[<>/]/);
  h.$('img').dispatchEvent(new h.w.Event('error'));assert.match(h.$('[role=status]').textContent,/still download/);assert.equal(h.$('a').hidden,false);
  h.w.dispatchEvent(new h.w.Event('pagehide'));assert.equal(h.$('dialog').open,false);assert.equal(h.revoked.length,1);h.dom.window.close();
});
