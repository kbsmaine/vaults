'use strict';

// Run the production upload, metadata lookup, private retrieval, and viewer
// together. Only Supabase/network responses and browser blob URLs are mocked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/documents', name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const projectId = '10000000-0000-4000-8000-000000000001';

function setup() {
  const dom = new JSDOM('<!doctype html><body><button>View document</button></body>', {
    url:'https://northwoods.example/portal.html', runScripts:'outside-only'
  });
  const w = dom.window;
  const stored = new Map(), urls = new Map(), rows = [], uploads = [], retrievals = [];
  const client = {
    storage:{from(bucket){
      assert.equal(bucket,'project-documents');
      return {
        async upload(storagePath,file,options) {
          uploads.push({storagePath,file,options});
          stored.set(storagePath,{bytes:Buffer.from(await file.arrayBuffer()),type:options.contentType});
          return {data:{path:storagePath},error:null};
        },
        async createSignedUrl(storagePath,lifetime,options) {
          assert.equal(lifetime,60);assert.equal(options.download,true);
          if (!stored.has(storagePath)) return {data:null,error:new Error('Object unavailable')};
          return {data:{signedUrl:`https://project.supabase.co/storage/v1/object/sign/project-documents/${storagePath}?token=mock-only`},error:null};
        }
      };
    }},
    from(table) {
      const filters=[];
      const query={
        async insert(row) { assert.equal(table,'project_documents');rows.push({...row,id:`doc-${rows.length}`});return {data:null,error:null}; },
        select(){return query;},eq(key,value){filters.push([key,value]);return query;},order(){return query;},
        then(resolve,reject) {
          const data=table==='project_documents'?rows.filter(row=>filters.every(([key,value])=>row[key]===value)).map(row=>({...row})):[];
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      };
      return query;
    }
  };
  w.PORTAL_CONFIG={supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_mockOnly'};
  w.supabase={createClient:()=>client};
  w.fetch=async (address,options)=>{
    options.signal?.throwIfAborted();
    const url=new URL(address);
    assert.equal(url.origin,'https://project.supabase.co');
    assert.equal(options.cache,'no-store');
    const storagePath=url.pathname.replace('/storage/v1/object/sign/project-documents/','');
    retrievals.push(storagePath);
    const file=stored.get(storagePath);
    return new Response(file.bytes,{headers:{'content-type':file.type,'content-length':String(file.bytes.length)}});
  };
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let sequence=0;
  w.URL.createObjectURL=file=>{const url=`blob:https://northwoods.example/${++sequence}`;urls.set(url,file);return url;};
  w.URL.revokeObjectURL=url=>urls.delete(url);
  w.eval(fs.readFileSync(path.join(root,'portal-api.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'document-viewer.js'),'utf8'));
  return {dom,w,stored,urls,rows,uploads,retrievals,api:w.NWPortal,viewer:w.NWDocumentViewer};
}

test('uploaded PNG, JPEG and PDF bytes reach both preview and download unchanged',async t=>{
  for (const [name,type,tag] of [['first.png','image/png','img'],['photo.jpg','image/jpeg','img'],['plan.pdf','application/pdf','iframe']]) {
    await t.test(name,async()=>{
      const h=setup();
      try {
        const original=fixture(name),file=new File([original],name,{type});
        await h.api.uploadDocument(projectId,file,'Customer upload');
        assert.equal(h.uploads[0].file,file,'upload must receive the original File');
        assert.equal(hash(h.stored.get(h.rows[0].storage_path).bytes),hash(original));
        const details=await h.api.getProjectDetails(projectId);
        await h.viewer.open(details.documents[0]);
        assert.deepEqual(h.retrievals,[h.rows[0].storage_path]);
        const preview=h.w.document.querySelector(tag),download=h.w.document.querySelector('a[download]');
        assert.equal(preview.src,download.href,'preview and download must use the same retrieved blob');
        const shown=h.urls.get(preview.src);
        const renderedBytes=Buffer.from(await shown.arrayBuffer());
        assert.deepEqual(renderedBytes,original);
        assert.equal(hash(renderedBytes),hash(original),'SHA-256 must match the original upload');
        assert.equal(shown.type,type);assert.equal(download.hidden,false);
      } finally {h.viewer.close();h.dom.window.close();}
    });
  }
});

test('same-named uploads retain separate content and the viewer retrieves the selected project document',async()=>{
  const h=setup();
  try {
    const first=fixture('first.png'),second=fixture('second.png');
    assert.notEqual(hash(first),hash(second));
    await h.api.uploadDocument(projectId,new File([first],'mockup.png',{type:'image/png'}),'Mockup');
    await h.api.uploadDocument(projectId,new File([second],'mockup.png',{type:'image/png'}),'Mockup');
    const otherId='20000000-0000-4000-8000-000000000002';
    await h.api.uploadDocument(otherId,new File([first],'mockup.png',{type:'image/png'}),'Mockup');
    const {documents}=await h.api.getProjectDetails(projectId);
    assert.equal(documents.length,2);assert.notEqual(documents[0].storage_path,documents[1].storage_path);
    for (const [record,expected] of [[documents[1],second],[documents[0],first],[documents[1],second]]) {
      await h.viewer.open(record);
      assert.equal(h.retrievals.at(-1),record.storage_path);
      const blob=h.urls.get(h.w.document.querySelector('img').src);
      assert.deepEqual(Buffer.from(await blob.arrayBuffer()),expected);
      assert.equal(h.urls.size,1,'a previous document must not remain available in the viewer');
    }
  } finally {h.viewer.close();h.dom.window.close();}
});
