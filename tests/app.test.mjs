// End-to-end checks use existing Playwright + system Chromium. No install/network service required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.md': 'text/plain;charset=utf-8' };

test('PWA capture, offline cold restart, actual OCR and search', { timeout: 180000 }, async (t) => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname); if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, 'dist', '.' + path);
    if (!file.startsWith(root + '/dist/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-cache'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(resolve(tmpdir(), 'belegwerk-app-'));
  let context;
  const errors = []; const requests = [];
  const launch = async (offline = false) => {
    context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } });
    if (offline) await context.setOffline(true);
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) requests.push(request.url()); });
    return page;
  };
  t.after(async () => { await context?.close(); server.closeAllConnections(); await new Promise((done) => server.close(done)); await rm(profile, { recursive: true, force: true }); });
  let page = await launch();
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#pwa-state').textContent === 'Offline bereit', { timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await t.test('shell precaches actual assets, no external runtime requests or chat UI', async () => {
    assert.equal(await page.locator('#camera-button').count(), 1);
    assert.equal(await page.locator('#upload-button').count(), 1);
    assert.equal(await page.locator('[role="log"], [aria-label*="Chat"], textarea[placeholder*="Nachricht"]').count(), 0);
    const cachesState = await page.evaluate(async () => { const names = await caches.keys(); const cache = await caches.open(names.find((n) => n.startsWith('belegwerk-shell-'))); return (await cache.keys()).map((r) => new URL(r.url).pathname); });
    assert.ok(cachesState.includes('/vendor/tesseract/lang/deu.traineddata.gz.wasm'));
    assert.ok(cachesState.includes('/js/cloud.js'));
    assert.ok(!cachesState.some((p) => p.includes('Beispielbelege') || p.includes('/tests/')));
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
  });
  const waitForDoc = async (name, timeout = 100000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const doc = await page.evaluate(async (name) => (await (await import('/js/store.js')).allDocs()).find((d) => d.file.name === name), name);
      if (doc && ['ready','review'].includes(doc.processing.state)) return doc;
      await new Promise((done) => setTimeout(done, 75));
    }
    throw new Error('Processing timed out: ' + name);
  };
  let textId;
  await t.test('upload confirms persisted original, extracts metadata and supports fuzzy/amount/filter/filename search', async () => {
    await page.locator('#file-input').setInputFiles({ name: 'Fahrrad-2025.txt', mimeType: 'text/plain', buffer: Buffer.from('Rechnung\nFahrradhaus Müller GmbH\nRechnungsdatum: 12.05.2025\nRechnungsnummer: BW-2025-101\nReparatur Fahrrad\nGesamtbetrag: 129,90 EUR\nVielen Dank') });
    await page.waitForFunction(() => document.querySelector('#capture-receipt').textContent.includes('auf diesem Gerät gespeichert'));
    await waitForDoc('Fahrrad-2025.txt');
    const doc = await page.evaluate(async () => { const s = await import('/js/store.js'); const d = (await s.allDocs()).find((d) => d.file.name === 'Fahrrad-2025.txt'); return { ...d, bytes: (await s.getBlob(d.id)).size }; });
    textId = doc.id; assert.equal(doc.amount, 129.90, JSON.stringify({text:doc.text,warnings:doc.warnings,processing:doc.processing})); assert.equal(doc.date, '2025-05-12'); assert.ok(doc.bytes > 100);
    await page.locator('.nav [data-view="library"]').click();
    for (const query of ['Muellr', '129,90', 'jahr:2025 betrag>100', '"Fahrrad-2025.txt"']) {
      await page.locator('#search-input').fill(query);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#search-results .doc-row').count(), 1, `Query ${query}`);
    }
    await page.locator('#search-input').fill('129,91'); assert.equal(await page.locator('#search-results .doc-row').count(), 0, 'numeric matching is exact');
    await page.locator('#search-input').fill('Müller');
    await page.locator('#search-results .doc-row').click();
    await page.locator('input[name="title"]').fill('Fahrradreparatur im Mai');
    await page.locator('input[name="tags"]').fill('Fahrrad, Reparatur');
    await page.locator('#detail-form button[type="submit"]').click();
    await page.locator('#search-input').fill('#Fahrrad'); assert.equal(await page.locator('#search-results .doc-row').count(), 1);
  });
  await t.test('original captured immediately before full browser shutdown resumes offline', async () => {
    await page.evaluate(async () => { const p = await import('/js/pipeline.js'); await p.captureFiles([new File(['Rechnung\nBuchladen Morgen\nDatum: 13.06.2025\nGesamtbetrag: 42,00 EUR'], 'Wiederanlauf.txt', {type:'text/plain'})]); });
    await context.close(); page = await launch(true);
    await page.goto(origin + '/#library', { waitUntil: 'domcontentloaded' });
    await waitForDoc('Wiederanlauf.txt');
    const docs = await page.evaluate(async () => (await (await import('/js/store.js')).allDocs()).map((d) => ({id:d.id,name:d.file.name,processing:d.processing.state})));
    assert.equal(docs.length, 2); assert.ok(docs.some((d) => d.id === textId));
    assert.equal(await page.locator('#library-view').isVisible(), true);
  });
  await t.test('real local image OCR works offline and indexed text is searchable', async () => {
    // The capture-first PWA always reads photos, even if the former desktop app disabled OCR.
    await page.evaluate(async () => (await import('/js/store.js')).setSetting('settings',{ocr:false}));
    await page.locator('.nav [data-view="capture"]').click();
    await page.locator('#camera-input').setInputFiles(resolve(root, 'tests/fixtures/receipt.png'));
    await waitForDoc('receipt.png');
    const doc = await page.evaluate(async () => (await (await import('/js/store.js')).allDocs()).find((d) => d.file.name === 'receipt.png'));
    assert.match(doc.text, /PAPIERWERK/i, JSON.stringify({warnings:doc.warnings,processing:doc.processing})); assert.match(doc.text, /25[,.]00/); assert.match(doc.method, /ocr/);
    await page.locator('.nav [data-view="library"]').click(); await page.locator('#search-input').fill('PAPIERWERK'); assert.equal(await page.locator('#search-results .doc-row').count(), 1);
    assert.deepEqual(errors, []);
  });
  await t.test('PDF extraction and worker preview are available offline', async () => {
    await page.locator('.nav [data-view="capture"]').click();
    await page.locator('#file-input').setInputFiles(resolve(root,'tests/fixtures/receipt.pdf'));
    const doc = await waitForDoc('receipt.pdf');
    assert.match(doc.text,/Buchladen Morgen/); assert.equal(doc.amount,42); assert.equal(doc.date,'2025-06-15');
    await page.locator('.nav [data-view="library"]').click(); await page.locator('#search-input').fill('BW-PDF-100');
    assert.equal(await page.locator('#search-results .doc-row').count(),1);
    await page.locator('#search-results .doc-row').click();
    await page.locator('#detail-preview img').waitFor({state:'visible'}); await page.keyboard.press('Escape');
  });

  await t.test('backup refuses incomplete originals instead of claiming success', async () => {
    const message = await page.evaluate(async () => { const e = await import('/js/export.js'); const s = await import('/js/store.js'); try { await e.buildBackup((await s.allDocs()).slice(0,1),async()=>null); return ''; } catch(error) { return error.message; } });
    assert.match(message,/Original fehlt/);
  });

  await t.test('320–430px layouts, keyboard dialog dismissal, dark mode and reduced motion', async () => {
    await mkdir(resolve(root, '../work/screenshots'), { recursive: true });
    for (const width of [320,375,390,430]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['capture','library','activity']) {
        await page.locator(`.nav [data-view="${view}"]`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} at ${width}`);
      }
    }
    await page.locator('.nav [data-view="capture"]').click(); await page.setViewportSize({width:390,height:844});
    await page.screenshot({ path: resolve(root, '../work/screenshots/mobile.png'), fullPage: true });
    await page.locator('#mobile-settings').click(); await page.locator('#settings-dialog').waitFor({state:'visible'}); assert.equal(await page.locator('#settings-dialog').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#settings-dialog').isVisible(), false);
    await page.emulateMedia({ colorScheme:'dark', reducedMotion:'reduce' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.emulateMedia({ colorScheme:'light' }); await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({ path: resolve(root, '../work/screenshots/desktop.png'), fullPage: true });
    assert.deepEqual(requests, []);
  });
});
