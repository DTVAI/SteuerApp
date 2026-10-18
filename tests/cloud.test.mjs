// Real Chromium + IndexedDB, mocked Dropbox HTTP responses. No package install.
// Run: node --test tests/cloud.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function browserHarness() {
  const directory = await mkdtemp(resolve(tmpdir(), 'belegwerk-cloud-'));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/__storage_test') { response.end('<!doctype html><title>Storage test</title>'); return; }
    try {
      const filename = resolve(root, `.${decodeURIComponent(pathname)}`);
      if (!filename.startsWith(`${root}/`)) throw new Error('Forbidden');
      response.setHeader('Content-Type', extname(filename) === '.js' ? 'text/javascript' : 'application/octet-stream');
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(process.env.CHROMIUM || '/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  const debugOrigin = endpoint.replace(/^ws:/, 'http:').replace(/\/devtools\/.*/, '');
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
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
  const once = (method) => new Promise((done) => events.set(method, [...(events.get(method) || []), done]));
  const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveRequest, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  const navigate = async () => {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: `${origin}/__storage_test` });
    await loaded;
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await navigate();
  return { evaluate, navigate, once, send, close: async () => {
    socket.close();
    const exited = new Promise((done) => browser.once('exit', done));
    browser.kill('SIGKILL');
    await exited;
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  } };
}

test('Dropbox PKCE and durable, idempotent storage adapters in Chromium', { timeout: 60_000 }, async (t) => {
  const harness = await browserHarness();
  const evaluate = harness.evaluate;
  t.after(() => harness.close());
  await evaluate(`window.cloud = await import('/js/cloud.js'); window.store = await import('/js/store.js'); await store.clearAll();`);

  await t.test('PKCE redirects with S256, random state and no app secret', async () => {
    await harness.send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.dropbox.com/oauth2/authorize*', requestStage: 'Request' }] });
    const intercepted = harness.once('Fetch.requestPaused');
    await evaluate(`await cloud.connectDropbox('test-public-app-key'); return true;`);
    const request = await intercepted;
    await harness.send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'Aborted' });
    await harness.send('Fetch.disable');
    const pending = await evaluate(`return await store.getSetting('storage.dropbox.pending');`);
    const url = new URL(request.request.url);
    assert.equal(url.searchParams.get('state'), pending.state);
    assert.ok(pending.state.length >= 43);
    assert.ok(pending.verifier.length >= 43);
    assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('token_access_type'), 'online');
    assert.equal(url.searchParams.get('scope'), 'files.content.write');
    assert.equal(url.searchParams.has('client_secret'), false);
    assert.equal(new URL(pending.redirectUri).pathname, '/__storage_test');
  });

  await t.test('code exchange checks state, stores only a short-lived token and removes callback parameters', async () => {
    const result = await evaluate(`
      const pending = await store.getSetting('storage.dropbox.pending');
      history.replaceState(null, '', '?code=test-code&state=' + encodeURIComponent(pending.state));
      window.requests = [];
      window.fetch = async (url, options) => {
        requests.push({url, body: Object.fromEntries(options.body), credentials:options.credentials});
        return new Response(JSON.stringify({access_token:'test-access-token',token_type:'bearer',expires_in:14400,refresh_token:'must-not-store'}), {status:200});
      };
      const completed = await cloud.completeDropboxAuth();
      const auth = await store.getSetting('storage.dropbox.auth');
      const status = await cloud.getConnectionStatus();
      return {completed,requests,authKeys:Object.keys(auth),expiresIn:auth.expiresAt-Date.now(),status,query:location.search,
        pending:await store.getSetting('storage.dropbox.pending'),localStorageLength:localStorage.length};
    `);
    assert.equal(result.completed, true);
    assert.equal(result.requests[0].url, 'https://api.dropboxapi.com/oauth2/token');
    assert.equal(result.requests[0].body.grant_type, 'authorization_code');
    assert.equal(result.requests[0].body.code, 'test-code');
    assert.ok(result.requests[0].body.code_verifier.length >= 43);
    assert.equal(result.requests[0].credentials, 'omit');
    assert.deepEqual(result.authKeys.sort(), ['accessToken', 'clientId', 'expiresAt']);
    assert.ok(result.expiresIn > 14_000_000 && result.expiresIn <= 14_400_000);
    assert.equal(JSON.stringify(result.status).includes('test-access-token'), false);
    assert.equal(result.status.connected, true);
    assert.equal(result.pending, null);
    assert.equal(result.query, '');
    assert.equal(result.localStorageLength, 0);
    await harness.navigate();
    const persisted = await evaluate(`window.cloud=await import('/js/cloud.js'); window.store=await import('/js/store.js'); return (await cloud.getConnectionStatus()).connected;`);
    assert.equal(persisted, true, 'credential survives a real page restart in IndexedDB');
  });

  await t.test('uploads original bytes with escaped Dropbox headers and serial, stable overwrite paths', async () => {
    const result = await evaluate(`
      window.doc = {id:'receipt-1',file:{name:'scan.pdf',ext:'pdf',hash:'a'.repeat(64)},date:'2026-10-18',year:2026,
        category:'werbung',docType:'arbeitsmittel',issuer:'Büro GmbH',amount:49,currency:'EUR'};
      window.requests=[]; let active=0; let maximum=0;
      window.fetch=async(url,options)=>{
        active++;maximum=Math.max(maximum,active);
        await new Promise(done=>setTimeout(done,10));
        const argument=JSON.parse(options.headers['Dropbox-API-Arg']);
        requests.push({url,authorization:options.headers.Authorization,contentType:options.headers['Content-Type'],
          argument,rawArg:options.headers['Dropbox-API-Arg'],body:await options.body.text()});
        active--;
        return new Response(JSON.stringify({id:'id:remote-receipt',path_display:argument.path}),{status:200});
      };
      const blob=new Blob(['original-receipt-bytes'],{type:'application/pdf'});
      const first=await Promise.all([cloud.uploadDocument(doc,blob),cloud.uploadDocument(doc,blob)]);
      doc.issuer='Nachträglich bearbeitet';
      const edited=await cloud.uploadDocument(doc,blob);
      return {first,edited,requests,maximum};
    `);
    assert.equal(result.maximum, 1);
    assert.equal(result.requests.length, 3);
    for (const request of result.requests) {
      assert.equal(request.url, 'https://content.dropboxapi.com/2/files/upload');
      assert.equal(request.authorization, 'Bearer test-access-token');
      assert.equal(request.contentType, 'application/octet-stream');
      assert.equal(request.argument.mode, 'overwrite');
      assert.equal(request.argument.autorename, false);
      assert.equal(request.body, 'original-receipt-bytes');
      assert.match(request.argument.path, /__a{24}\.pdf$/);
      assert.ok(!/[^\x00-\x7f]/.test(request.rawArg), 'HTTP header contains ASCII with Unicode escapes');
    }
    assert.equal(result.first[0].path, result.first[1].path);
    assert.equal(result.first[0].path, result.edited.path, 'saved path survives metadata edits and remote-ACK retries');
    assert.equal(result.first[0].destination, 'dropbox');
    assert.equal(typeof result.first[0].destinationId, 'string');
    assert.ok(result.first[0].destinationId.length > 0, 'upload acknowledgement identifies its configured destination');
    assert.ok(result.first[0].path.includes('Büro'));
  });

  await t.test('expired tokens are cleared before network access', async () => {
    const result = await evaluate(`
      const auth=await store.getSetting('storage.dropbox.auth');
      await store.setSetting('storage.dropbox.auth',{...auth,expiresAt:Date.now()-1});
      let calls=0;window.fetch=async()=>{calls++;throw new Error('Unexpected network');};
      let error;try{await cloud.uploadDocument(doc,new Blob(['test']));}catch(e){error={code:e.code,nonretryable:e.nonretryable};}
      return {error,calls,auth:await store.getSetting('storage.dropbox.auth'),status:await cloud.getConnectionStatus()};
    `);
    assert.deepEqual(result.error, { code: 'AUTH_REQUIRED', nonretryable: true });
    assert.equal(result.calls, 0);
    assert.equal(result.auth, null);
    assert.equal(result.status.connected, false);
  });

  await t.test('wrong state and expired OAuth flows fail closed without token exchange', async () => {
    for (const expired of [false, true]) {
      const result = await evaluate(`
        let calls=0;window.fetch=async()=>{calls++;throw new Error('Unexpected token exchange');};
        await store.setSetting('storage.dropbox.auth',{accessToken:'old-token',expiresAt:Date.now()+14400000,clientId:'test-public-app-key'});
        await store.setSetting('storage.dropbox.pending',{state:'expected-state',verifier:'verifier',clientId:'test-public-app-key',
          redirectUri:location.origin+location.pathname,createdAt:Date.now()-${expired ? 600_001 : 0}});
        history.replaceState(null,'','?code=code&state=${expired ? 'expected-state' : 'wrong-state'}');
        let code;try{await cloud.completeDropboxAuth();}catch(e){code=e.code;}
        return {code,calls,auth:await store.getSetting('storage.dropbox.auth'),pending:await store.getSetting('storage.dropbox.pending'),query:location.search};
      `);
      assert.equal(result.code, 'AUTH_REQUIRED');
      assert.equal(result.calls, 0);
      assert.equal(result.auth, null);
      assert.equal(result.pending, null);
      assert.equal(result.query, '');
    }
  });

  await t.test('401 clears auth, transient failures remain retryable and 150 MB cap avoids a request', async () => {
    const result = await evaluate(`
      const errors=[];
      for(const status of [401,503]){
        await store.setSetting('storage.dropbox.auth',{accessToken:'test-token',expiresAt:Date.now()+14400000,clientId:'test-public-app-key'});
        window.fetch=async()=>new Response('',{status});
        try{await cloud.uploadDocument(doc,new Blob(['test']));}catch(e){errors.push({code:e.code,nonretryable:e.nonretryable,auth:!!await store.getSetting('storage.dropbox.auth')});}
      }
      let calls=0;window.fetch=async()=>{calls++;throw new Error('Unexpected oversized upload');};
      try{await cloud.uploadDocument(doc,{size:150000001});}catch(e){errors.push({code:e.code,nonretryable:e.nonretryable});}
      return {errors,calls};
    `);
    assert.deepEqual(result.errors, [
      { code: 'AUTH_REQUIRED', nonretryable: true, auth: false },
      { code: 'UPLOAD_FAILED', nonretryable: false, auth: true },
      { code: 'FILE_TOO_LARGE', nonretryable: true },
    ]);
    assert.equal(result.calls, 0);
  });

  await t.test('folder selection stores a real handle and writes the original without any network request', async () => {
    const result = await evaluate(`
      let calls=0;window.fetch=async()=>{calls++;throw new Error('Unexpected transfer');};
      const root=await navigator.storage.getDirectory();
      const folder=await root.getDirectoryHandle('storage-test',{create:true});
      window.showDirectoryPicker=async()=>folder;
      const config=await cloud.chooseFolder();
      const status=await cloud.getConnectionStatus();
      const uploaded=await cloud.uploadDocument({...doc,id:'folder-receipt'},new Blob(['folder-original']));
      let directory=folder;const parts=uploaded.path.split('/');
      for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part);
      const handle=await directory.getFileHandle(parts.at(-1));
      const bytes=await(await handle.getFile()).text();
      return {config,status,uploaded,bytes,calls,auth:await store.getSetting('storage.dropbox.auth')};
    `);
    assert.equal(result.config.provider, 'folder');
    assert.equal(result.status.connected, true);
    assert.equal(result.uploaded.destination, 'folder');
    assert.equal(result.bytes, 'folder-original');
    assert.equal(result.calls, 0);
    assert.equal(result.auth, null);
    assert.equal('handle' in result.status, false);
  });

  await t.test('another module changing the destination invalidates a cached folder handle', async () => {
    const result = await evaluate(`
      const other=await import('/js/cloud.js?independent-context');
      const root=await navigator.storage.getDirectory();
      const former=await root.getDirectoryHandle('storage-test');
      const selected=await root.getDirectoryHandle('storage-test-new',{create:true});
      window.showDirectoryPicker=async()=>selected;
      await other.chooseFolder();
      const uploaded=await cloud.uploadDocument({...doc,id:'folder-receipt'},new Blob(['new-destination-original']));
      const read=async(root,path)=>{let directory=root;const parts=path.split('/');
        for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part);
        return await(await(await directory.getFileHandle(parts.at(-1))).getFile()).text();};
      return {current:await read(selected,uploaded.path),former:await read(former,uploaded.path),status:await cloud.getConnectionStatus()};
    `);
    assert.equal(result.current, 'new-destination-original');
    assert.equal(result.former, 'folder-original');
    assert.equal(result.status.label, 'storage-test-new');
  });

  await t.test('disconnect clears credentials and configuration even while offline', async () => {
    const result = await evaluate(`
      await cloud.setDestination({provider:'dropbox',clientId:'test-public-app-key'});
      await store.setSetting('storage.dropbox.auth',{accessToken:'disconnect-token',expiresAt:Date.now()+14400000,clientId:'test-public-app-key'});
      await store.setSetting('storage.dropbox.pending',{state:'pending-flow'});
      window.fetch=async()=>{throw new TypeError('Offline');};
      await cloud.disconnectDropbox();
      return {destination:await cloud.getDestination(),auth:await store.getSetting('storage.dropbox.auth'),pending:await store.getSetting('storage.dropbox.pending')};
    `);
    assert.deepEqual(result.destination, { provider: 'none' });
    assert.equal(result.auth, null);
    assert.equal(result.pending, null);
  });
});
