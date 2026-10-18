// No package installation: Node's test runner + a system Chromium via CDP.
// Run: node --test tests/pipeline.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserExecutable = process.env.CHROMIUM || '/usr/bin/chromium';

async function browserHarness() {
  const directory = await mkdtemp(resolve(tmpdir(), 'belegwerk-pipeline-'));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/__pipeline_test') { response.end('<!doctype html><title>Pipeline test</title>'); return; }
    // Exercise outbox semantics without cloud credentials or external requests.
    if (pathname === '/js/cloud.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`
        import * as store from '/js/store.js';
        export async function getDestination(){return globalThis.testDestination || await store.getSetting('test.destination',{provider:'none'});}
        export async function uploadDocument(doc,blob){
          globalThis.testUploads = [...(globalThis.testUploads || []),doc.id];
          if(globalThis.testUploadError){const e=new Error(globalThis.testUploadError);e.code=globalThis.testUploadError;throw e;}
          return {destination:'dropbox',destinationId:(await getDestination()).id || (await getDestination()).provider,path:'/Belegwerk/'+doc.file.hash,uploadedAt:new Date().toISOString()};
        }
      `);
      return;
    }
    if (pathname === '/__pipeline_sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`
        import {drainUploads} from '/js/pipeline.js';
        self.addEventListener('message',event=>event.waitUntil(drainUploads().then(
          result=>event.ports[0].postMessage({result}),
          error=>event.ports[0].postMessage({error:error.message})
        )));
      `);
      return;
    }
    try {
      const filename = resolve(root, `.${decodeURIComponent(pathname)}`);
      if (!filename.startsWith(`${root}/`)) throw new Error('Forbidden');
      response.setHeader('Content-Type', extname(filename) === '.js' ? 'text/javascript' : 'application/octet-stream');
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(browserExecutable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((done, fail) => {
    let output = '';
    const timer = setTimeout(() => fail(new Error('Chromium startup timed out')), 15_000);
    browser.once('error', fail);
    browser.stderr.on('data', (chunk) => {
      output += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  const debuggingOrigin = endpoint.replace(/^ws:/, 'http:').replace(/\/devtools\/.*/, '');
  const targets = await (await fetch(`${debuggingOrigin}/json/list`)).json();
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let sequence = 0;
  const pending = new Map();
  const events = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    } else {
      const callbacks = events.get(message.method) || [];
      events.delete(message.method);
      for (const callback of callbacks) callback(message.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveRequest, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  const navigate = async () => {
    const loaded = new Promise((done) => events.set('Page.loadEventFired', [done]));
    await send('Page.navigate', { url: `${origin}/__pipeline_test` });
    await loaded;
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await navigate();
  return { evaluate, navigate, close: async () => {
    socket.close();
    const exited = new Promise((done) => browser.once('exit', done));
    browser.kill('SIGKILL');
    await exited;
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  } };
}

test('durable capture, migration, restart and leased outbox in Chromium', { timeout: 60_000 }, async (t) => {
  const harness = await browserHarness();
  const evaluate = harness.evaluate;
  t.after(() => harness.close());

  await t.test('v1 to v2 keeps existing documents, originals, thumbnails and settings', async () => {
    const result = await evaluate(`
      await new Promise((done, fail) => {
        const request = indexedDB.open('belegwerk', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          const docs = db.createObjectStore('docs', {keyPath:'id'});
          docs.createIndex('hash', 'file.hash');
          for (const name of ['blobs','thumbs','settings']) db.createObjectStore(name);
        };
        request.onerror = () => fail(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['docs','blobs','thumbs','settings'], 'readwrite');
          tx.objectStore('docs').put({id:'legacy',file:{name:'legacy.txt',hash:'old'},text:'Preserved',relevance:'relevant'});
          tx.objectStore('blobs').put(new Blob(['original']), 'legacy');
          tx.objectStore('thumbs').put(new Blob(['thumbnail']), 'legacy');
          tx.objectStore('settings').put({ocr:false}, 'settings');
          tx.oncomplete = () => { db.close(); done(); };
        };
      });
      const s = await import('/js/store.js'); await s.openStore();
      const doc = await s.getDoc('legacy');
      return {state:doc.processing.state, cloud:doc.cloud.state, text:await (await s.getBlob('legacy')).text(), thumb:await (await s.getThumb('legacy')).text(), settings:await s.getSetting('settings'), jobs:await s.allJobs()};
    `);
    assert.deepEqual(result, { state: 'ready', cloud: 'disabled', text: 'original', thumb: 'thumbnail', settings: { ocr: false }, jobs: [] });
  });

  let capturedId;
  await t.test('capture commits original and extraction job before any analysis; survives navigation', async () => {
    const result = await evaluate(`
      const s = await import('/js/store.js'); await s.clearAll();
      const p = await import('/js/pipeline.js');
      const [id] = await p.captureFiles([new File(['Rechnung 14.03.2025 Gesamtbetrag 42,00 EUR'], 'Rechnung.txt', {type:'text/plain'})]);
      return {id,doc:await s.getDoc(id),blob:await (await s.getBlob(id)).text(),jobs:await s.allJobs()};
    `);
    capturedId = result.id;
    assert.equal(result.doc.processing.state, 'queued');
    assert.equal(result.doc.text, '');
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].docId, capturedId);
    assert.equal(result.jobs[0].status, 'waiting');
    assert.match(result.blob, /42,00/);
    await harness.navigate();
    assert.deepEqual(await evaluate(`const s=await import('/js/store.js'); return [(await s.getDoc(${JSON.stringify(capturedId)})).processing.state, (await s.getBlob(${JSON.stringify(capturedId)})).size, (await s.allJobs()).length];`), ['queued', new TextEncoder().encode(result.blob).length, 1]);
  });

  await t.test('transaction failure rolls back document, blob and extraction intent together', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');
      await new Promise((done) => {
        const request=indexedDB.open('belegwerk',2);
        request.onsuccess=() => { const db=request.result; const tx=db.transaction('blobs','readwrite'); tx.objectStore('blobs').put(new Blob(['existing']), 'collision'); tx.oncomplete=()=>{db.close();done();}; };
      });
      let failed=false;
      try { await s.commitCapture({id:'collision',file:{name:'x.txt'},processing:{state:'queued'}},new Blob(['new'])); } catch { failed=true; }
      return {failed,doc:await s.getDoc('collision'),blob:await (await s.getBlob('collision')).text(),jobs:(await s.allJobs()).filter(j=>j.docId==='collision')};
    `);
    assert.deepEqual(result, { failed: true, doc: null, blob: 'existing', jobs: [] });
  });

  await t.test('two owners cannot claim one job; stale owner cannot commit after lease recovery', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');
      const [first,second]=await Promise.all([s.claimJob('extraction',{now:100,leaseMs:10}),s.claimJob('extraction',{now:100,leaseMs:10})]);
      const recovered=await s.claimJob('extraction',{now:111,leaseMs:10});
      let stale=false; try { await s.completeJob(first,{patch:{title:'stale'}}); } catch(e) { stale=e.code==='LEASE_LOST'; }
      await s.completeJob(recovered,{patch:{processing:{state:'review'},title:'Recovered'},upload:true});
      return {first:!!first,second,stale,tokenChanged:first.token!==recovered.token,doc:await s.getDoc(first.docId),jobs:await s.allJobs()};
    `);
    assert.equal(result.first, true);
    assert.equal(result.second, null);
    assert.equal(result.stale, true);
    assert.equal(result.tokenChanged, true);
    assert.equal(result.doc.title, 'Recovered');
    assert.equal(result.jobs.find((job) => job.type === 'upload').status, 'waiting');
  });

  await t.test('reopen drains local processing, deduplicates and queues deterministic uploads', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js'); await s.clearAll();
      const p=await import('/js/pipeline.js');
      await p.captureFiles([new File(['Rechnung vom 14.03.2025\\nAussteller: Muster GmbH\\nRechnungsnummer R-42\\nGesamtbetrag: 42,00 EUR'], 'Rechnung.txt',{type:'text/plain'})]);
      return true;
    `);
    assert.equal(result, true);
    await harness.navigate();
    const processed = await evaluate(`
      const s=await import('/js/store.js'); const p=await import('/js/pipeline.js');
      const result=await p.drainProcessing();
      const original=(await s.allDocs())[0]; const blob=await s.getBlob(original.id);
      await p.captureFiles([new File([blob],'Kopie.txt',{type:'text/plain'})]);
      await p.drainProcessing();
      return {result,docs:await s.allDocs(),jobs:await s.allJobs()};
    `);
    assert.equal(processed.result.processed, 1);
    assert.equal(processed.docs.length, 2);
    const original = processed.docs.find((doc) => !doc.duplicateOf);
    const duplicate = processed.docs.find((doc) => doc.duplicateOf);
    assert.match(original.text, /42,00/);
    assert.equal(original.file.hash.length, 64);
    assert.ok(['ready', 'review'].includes(original.processing.state));
    assert.equal(duplicate.duplicateOf, original.id);
    assert.equal(processed.jobs.filter((job) => job.type === 'upload').length, 1);
  });

  await t.test('unconfigured storage blocks uploads without retry loop; auth failure resumes explicitly', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');const p=await import('/js/pipeline.js');
      const disabled=await p.drainUploads();
      const local=(await s.allDocs()).find(d=>!d.duplicateOf);
      const disabledDoc=await s.getDoc(local.id);
      globalThis.testDestination={provider:'dropbox'};
      globalThis.testUploadError='AUTH_REQUIRED';
      await p.retryPending();
      await p.drainUploads();
      const authDoc=await s.getDoc(local.id);
      const blockedJob=(await s.allJobs()).find(j=>j.type==='upload');
      globalThis.testUploadError=null;
      await p.retryPending();
      const uploaded=await p.drainUploads();
      return {disabled,disabledState:disabledDoc.cloud.state,authState:authDoc.cloud.state,status:blockedJob.status,uploaded,final:(await s.getDoc(local.id)).cloud,uploads:globalThis.testUploads};
    `);
    assert.equal(result.disabled.pending, 0);
    assert.equal(result.disabled.nextAttemptAt, null);
    assert.equal(result.disabledState, 'disabled');
    assert.equal(result.authState, 'auth');
    assert.equal(result.status, 'blocked');
    assert.equal(result.uploaded.processed, 1);
    assert.equal(result.final.state, 'uploaded');
    assert.equal(result.uploads.length, 2);
    assert.equal(result.uploads[0], result.uploads[1]);
  });

  await t.test('transient upload failures persist backoff and survive reopening', async () => {
    const before = await evaluate(`
      const s=await import('/js/store.js');const p=await import('/js/pipeline.js');
      await p.captureFiles([new File(['Different invoice'], 'different.txt',{type:'text/plain'})]);
      await p.drainProcessing();
      globalThis.testDestination={provider:'dropbox'};globalThis.testUploadError='OFFLINE';
      const result=await p.drainUploads();
      const job=(await s.allJobs()).find(j=>j.type==='upload' && j.status==='waiting');
      return {result,job};
    `);
    assert.equal(before.job.code, 'OFFLINE');
    assert.ok(before.job.nextAttemptAt > Date.now());
    assert.equal(before.result.pending, 1);
    await harness.navigate();
    const after = await evaluate(`
      const s=await import('/js/store.js');const p=await import('/js/pipeline.js');
      const job=(await s.allJobs()).find(j=>j.type==='upload'&&j.status==='waiting');
      globalThis.testDestination={provider:'dropbox'};
      const premature=await p.drainUploads();
      await p.retryPending();const retried=await p.drainUploads();
      return {job,premature,retried};
    `);
    assert.equal(after.job.id, before.job.id);
    assert.equal(after.job.nextAttemptAt, before.job.nextAttemptAt);
    assert.equal(after.premature.processed, 0);
    assert.equal(after.retried.processed, 1);
  });

  await t.test('a new destination requeues uploaded originals and keeps in-flight owners valid', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');const p=await import('/js/pipeline.js');
      globalThis.testDestination={provider:'dropbox',id:'destination-b'};
      await p.drainUploads();
      const docs=(await s.allDocs()).filter(d=>!d.duplicateOf);
      const copied=docs.every(d=>d.cloud.destinationId==='destination-b'&&d.cloud.state==='uploaded');
      await s.ensureUploadJobs('destination-c');
      const first=await s.claimJob('upload');
      await s.ensureUploadJobs('destination-d');
      await s.completeJob(first,{patch:{cloud:{state:'uploaded',destinationId:'destination-c',path:'c'}}});
      const pending=(await s.allJobs()).find(j=>j.id===first.id);
      const owner=await s.claimJob('upload');
      // Moving the desired destination while this owner fails must not leave
      // the new destination blocked by an old authentication failure.
      await s.ensureUploadJobs('destination-e');
      const failure=await s.failJob(owner,new Error('old auth'),{blocked:true,state:'auth'});
      const requeued=(await s.allJobs()).find(j=>j.id===owner.id);
      globalThis.testDestination={provider:'dropbox',id:'destination-e'};
      await p.drainUploads();
      return {copied,pending,failure,requeued,final:(await s.allDocs()).filter(d=>!d.duplicateOf).map(d=>d.cloud)};
    `);
    assert.equal(result.copied, true);
    assert.equal(result.pending.status, 'waiting');
    assert.equal(result.pending.destinationId, 'destination-d');
    assert.equal(result.failure.requeued, true);
    assert.equal(result.requeued.status, 'waiting');
    assert.equal(result.requeued.destinationId, 'destination-e');
    assert.ok(result.final.every((cloud) => cloud.state === 'uploaded' && cloud.destinationId === 'destination-e'));
  });

  await t.test('extraction completion preserves a concurrent cloud acknowledgement', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');
      const doc=(await s.allDocs()).find(d=>!d.duplicateOf);
      await s.requeueProcessing(doc.id);
      const job=await s.claimJob('extraction');
      const latest=await s.getDoc(doc.id);
      latest.cloud={state:'uploaded',destinationId:'ack-destination',path:'confirmed'};
      await s.putDoc(latest);
      await s.completeJob(job,{patch:{processing:{state:'ready'},cloud:{state:'pending'}},upload:true});
      return (await s.getDoc(doc.id)).cloud;
    `);
    assert.deepEqual(result, { state: 'uploaded', destinationId: 'ack-destination', path: 'confirmed' });
  });

  await t.test('user metadata edits preserve an independently confirmed upload', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');
      const stale=(await s.allDocs()).find(d=>!d.duplicateOf);
      const current=await s.getDoc(stale.id);
      current.cloud={state:'uploaded',destinationId:'concurrent-ack',path:'confirmed-name'};
      await s.putDoc(current);
      const saved=await s.updateMetadata(stale.id,{...stale,title:'Manuell korrigiert',edited:{title:true},cloud:{state:'pending'}});
      return {title:saved.title,status:saved.status,cloud:saved.cloud};
    `);
    assert.deepEqual(result,{title:'Manuell korrigiert',status:'geprueft',cloud:{state:'uploaded',destinationId:'concurrent-ack',path:'confirmed-name'}});
  });

  await t.test('actual module service worker drains uploads without dynamic import', async () => {
    const result = await evaluate(`
      const s=await import('/js/store.js');
      await s.setSetting('test.destination',{provider:'dropbox',id:'worker-destination'});
      const registration=await navigator.serviceWorker.register('/__pipeline_sw.js',{type:'module'});
      await navigator.serviceWorker.ready;
      const response=await new Promise((done,fail)=>{
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>fail(new Error('Worker timeout')),5000);
        channel.port1.onmessage=({data})=>{clearTimeout(timeout);done(data);};
        registration.active.postMessage({},[channel.port2]);
      });
      await registration.unregister();
      return {response,docs:(await s.allDocs()).filter(d=>!d.duplicateOf).map(d=>d.cloud)};
    `);
    assert.equal(result.response.error, undefined);
    assert.ok(result.response.result.processed >= 1);
    assert.ok(result.docs.every((cloud) => cloud.state === 'uploaded' && cloud.destinationId === 'worker-destination'));
  });

  await t.test('delete removes original, thumbnail and every queued job', async () => {
    assert.deepEqual(await evaluate(`
      const s=await import('/js/store.js');const docs=await s.allDocs();
      for(const doc of docs) {await s.putThumb(doc.id,new Blob(['thumb']));await s.setSetting('storage.path.test-destination.'+doc.id,'Private filename');await s.deleteDoc(doc.id);if(await s.getSetting('storage.path.test-destination.'+doc.id))throw new Error('Cloud path retained');}
      return [(await s.allDocs()).length,(await s.allJobs()).length,await s.getBlob(docs[0].id),await s.getThumb(docs[0].id)];
    `), [0, 0, null, null]);
  });

  await t.test('storage denial never reports memory-only capture success', async () => {
    assert.equal(await evaluate(`
      Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});
      const s=await import('/js/store.js?denied');
      try {await s.commitCapture({id:'unsafe'},new Blob(['lost']));return 'unsafe-success';} catch(e) {return e.code;}
    `), 'STORAGE_UNAVAILABLE');
  });
});
