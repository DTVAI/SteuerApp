// Capture first. Durable work and search use the same local document records.
import * as store from './store.js';
import * as pipeline from './pipeline.js';
import * as cloud from './cloud.js';
import { createIndex, escapeHtml as esc } from './search.js';
import { CATEGORIES, DOC_TYPES, categoryOf } from './taxonomy.js';
import { buildFilename, buildPath } from './analyze.js';
import { buildBackup, restoreBackup, buildZip } from './export.js';
import { saveFile } from './platform.js';

const $ = (selector) => document.querySelector(selector);
const state = { docs: new Map(), index: null, view: 'capture', limit: 60, hits: [], progress: new Map(), detailId: null };
const money = (v, currency = 'EUR') => typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR' }).format(v) : '';
const date = (v) => { if (!v) return ''; const value = String(v); const parsed = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(parsed.getTime()) ? 'Datum unklar' : new Intl.DateTimeFormat('de-DE').format(parsed); };
const icons = {
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 12h8M8 16h5"/>',
  tag: '<path d="M3 3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1"/>',
  cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11M12 21V11m-4 4 4-4 4 4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`;
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

let toastTimer, renderFrame, pumpTimer, pumping = false, capturing = false, rerun = false, installPrompt, waitingWorker, detailUrl;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('belegwerk') : null;
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 9000 : 5000); }
function fail(error) { toast(error?.message || 'Das hat nicht geklappt. Bitte erneut versuchen.', true); }
function scheduleRender() { if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = null; render(); }); }
function visibleDocs() { return [...state.docs.values()].filter((doc) => !doc.sample && !doc.duplicateOf).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || ''))); }
function statusOf(doc) {
  if (doc.processing?.state === 'error') return { text: 'Erneut versuchen', kind: 'error' };
  if (['queued', 'processing'].includes(doc.processing?.state)) return { text: 'Wird verarbeitet', kind: '' };
  if (doc.processing?.state === 'review' && doc.status !== 'geprueft') return { text: 'Zu prüfen', kind: 'warn' };
  if (doc.cloud?.state === 'uploaded') return { text: 'Extern abgelegt', kind: '' };
  if (doc.cloud?.state === 'auth') return { text: 'Anmelden zum Hochladen', kind: 'warn' };
  if (doc.cloud?.state === 'error') return { text: 'Upload offen', kind: 'warn' };
  if (doc.cloud?.state === 'pending' || doc.cloud?.state === 'uploading') return { text: 'Upload ausstehend', kind: '' };
  return { text: 'Lokal gespeichert', kind: '' };
}
function docRow(doc, snippet = '', activity = false) {
  const status = statusOf(doc); const p = state.progress.get(doc.id);
  const title = doc.processing?.state === 'queued' ? doc.file?.name : doc.issuer || doc.title || doc.file?.name || 'Beleg';
  return `<button class="doc-row" data-doc="${esc(doc.id)}"><span class="file-icon">${esc((doc.file?.ext || 'Datei').slice(0, 5))}</span><span class="doc-meta"><span class="doc-title">${esc(title)}</span><span class="doc-subtitle">${esc(date(doc.date || doc.addedAt))}<span>·</span>${esc(categoryOf(doc.category)?.label || 'Unklar')}<span>·</span>${esc(status.text)}</span>${snippet ? `<span class="doc-snippet">${snippet}</span>` : ''}${activity ? `<span class="activity-message">${esc(p?.label || doc.processing?.error || doc.cloud?.error || (doc.cloud?.state === 'uploaded' ? doc.cloud?.path : doc.file?.name) || '')}</span>` : ''}${p ? `<span class="progress-track"><progress max="1" value="${Math.min(1, Math.max(0, p.progress || 0))}" aria-label="Fortschritt"></progress></span>` : ''}</span><span class="doc-amount">${esc(money(doc.amount, doc.currency))}</span><span class="doc-status ${status.kind}">${esc(status.text)}</span><span class="doc-arrow">${icon('arrow')}</span></button>`;
}
const empty = (title, body) => `<div class="empty-state">${icon('file')}<strong>${title}</strong>${body}</div>`;
function refreshFilters() {
  const selected = $('#filter-year').value;
  const years = [...new Set(visibleDocs().map((d) => Number(d.year)).filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100))].sort((a, b) => b - a);
  $('#filter-year').innerHTML = '<option value="">Alle Jahre</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('#filter-year').value = selected;
}
function renderSearch() {
  const q = $('#search-input').value.trim();
  let hits = state.index?.search(q, { limit: Math.max(state.docs.size, 60) }) || [];
  const year = $('#filter-year').value, cat = $('#filter-category').value, status = $('#filter-status').value;
  hits = hits.filter((hit) => {
    const d = state.docs.get(hit.id); if (!d || d.sample || d.duplicateOf) return false;
    return (!year || String(d.year) === year) && (!cat || d.category === cat) && (!status ||
      status === 'review' && d.processing?.state === 'review' && d.status !== 'geprueft' ||
      status === 'pending' && ['queued', 'processing', 'error'].includes(d.processing?.state) ||
      status === 'uploaded' && d.cloud?.state === 'uploaded');
  });
  const sort = $('#sort-select').value;
  if (sort !== 'relevance' || !q) hits.sort((a, b) => {
    const x = state.docs.get(a.id), y = state.docs.get(b.id);
    return sort === 'amount' ? (y.amount ?? -Infinity) - (x.amount ?? -Infinity) : String((sort === 'date' ? y.date : y.addedAt) || '').localeCompare(String((sort === 'date' ? x.date : x.addedAt) || ''));
  });
  state.hits = hits;
  $('#result-count').textContent = `${hits.length} ${hits.length === 1 ? 'Beleg' : 'Belege'}${q ? ' gefunden' : ''}`;
  $('#search-results').innerHTML = hits.length ? hits.slice(0, state.limit).map((h) => docRow(state.docs.get(h.id), q ? h.snippet : '')).join('') : empty(q ? 'Dazu haben wir noch keinen Beleg.' : 'Noch ganz übersichtlich.', q ? 'Versuche einen kürzeren Begriff oder ändere die Filter.' : 'Dein erstes Foto oder Dokument erscheint hier.');
  $('#load-more').hidden = hits.length <= state.limit;
  $('#export-visible').disabled = !hits.length;
  $('#search-suggestions').innerHTML = q ? state.index.suggest(q).slice(0, 4).map((s) => `<button class="suggestion" data-query="${esc(s)}">${esc(s)}</button>`).join('') : '';
}
function render() {
  const docs = visibleDocs();
  $('#library-count').textContent = docs.length;
  const pending = docs.filter((d) => ['queued', 'processing', 'error'].includes(d.processing?.state) || ['pending', 'uploading', 'auth', 'error'].includes(d.cloud?.state)).length;
  $('#activity-count').textContent = pending || '';
  $('#recent-list').innerHTML = docs.length ? docs.slice(0, 5).map((d) => docRow(d)).join('') : empty('Dein erster Beleg wartet schon.', 'Foto machen oder eine Datei hinzufügen. Um den Rest kümmern wir uns.');
  if (state.view === 'library') renderSearch();
  if (state.view === 'activity') {
    const extracted = docs.filter((d) => ['ready', 'review'].includes(d.processing?.state)).length;
    const uploaded = docs.filter((d) => d.cloud?.state === 'uploaded').length;
    $('#activity-summary').innerHTML = [[docs.length, 'Lokal gespeichert'], [extracted, 'Ausgelesen & zugeordnet'], [uploaded, 'Extern abgelegt']].map(([n, label]) => `<div class="stat-card"><strong>${n}</strong><span>${label}</span></div>`).join('');
    $('#activity-list').innerHTML = docs.length ? docs.map((d) => docRow(d, '', true)).join('') : empty('Hier ist alles erledigt.', 'Sobald du einen Beleg erfasst, siehst du hier den Fortschritt.');
  }
}
function go(view, setHash = true) {
  if (!['capture', 'library', 'activity'].includes(view)) view = 'capture';
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== view + '-view'; });
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = innerWidth <= 760 ? 'belegwerk.' : { capture: 'Dein Eingang', library: 'Dein Archiv', activity: 'Deine Aktivität' }[view];
  if (setHash) history.replaceState(null, '', '#' + view);
  render();
}
async function reloadDocs() { state.docs = new Map((await store.allDocs()).map((d) => [d.id, d])); state.index = createIndex(); state.index.addAll([...state.docs.values()]); refreshFilters(); render(); }
function changed(doc) { if (doc) { state.docs.set(doc.id, doc); state.index?.upsert(doc); if (!['queued', 'processing'].includes(doc.processing?.state)) state.progress.delete(doc.id); } refreshFilters(); scheduleRender(); channel?.postMessage({ type: 'changed' }); }
async function registerBackgroundUpload() {
  if (!(await store.allJobs()).some((job) => job.type === 'upload' && !['done', 'failed', 'blocked'].includes(job.status))) return;
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return;
  try { if (registration.sync) await registration.sync.register('belegwerk-uploads'); } catch { /* Foreground/reopen recovery remains available. */ }
  registration.active?.postMessage({ type: 'UPLOADS_CHANGED' });
}
async function pump() {
  if (pumping) { rerun = true; return; }
  pumping = true; clearTimeout(pumpTimer);
  try {
    const uploads = pipeline.drainUploads({ onChange: changed }).catch((error) => ({ error }));
    const extraction = await pipeline.drainProcessing({ onChange: (doc) => { changed(doc); if (['ready', 'review'].includes(doc?.processing?.state)) { void pipeline.drainUploads({ onChange: changed }).catch(fail); void registerBackgroundUpload().catch(() => {}); } }, onProgress: (p) => { state.progress.set(p.id, p); scheduleRender(); } });
    const firstUpload = await uploads; if (firstUpload.error) throw firstUpload.error;
    const uploadResult = await pipeline.drainUploads({ onChange: changed });
    const deadlines = [extraction?.nextAttemptAt, uploadResult?.nextAttemptAt].filter((t) => typeof t === 'number');
    if (deadlines.length) pumpTimer = setTimeout(pump, Math.max(1000, Math.min(60000, Math.min(...deadlines) - Date.now() + 100)));
    await registerBackgroundUpload();
  } catch (error) { fail(error); } finally { pumping = false; if (rerun) { rerun = false; void pump(); } }
}
async function capture(files, source = 'datei') {
  if (!files?.length) return;
  capturing = true;
  const receipt = $('#capture-receipt');
  receipt.hidden = false; receipt.innerHTML = '<div><strong>Wird auf diesem Gerät gespeichert …</strong><p>Bitte kurz warten, bevor du die App schließt.</p></div>';
  $('#camera-button').disabled = $('#upload-button').disabled = true;
  try {
    const ids = await pipeline.captureFiles(files, { source });
    receipt.innerHTML = `<div>${icon('shield')}</div><div><strong>${ids.length === 1 ? 'Beleg' : ids.length + ' Belege'} auf diesem Gerät gespeichert.</strong><p>Du kannst die App jetzt schließen. Offene Schritte werden beim nächsten Öffnen fortgesetzt.</p></div>`;
    await reloadDocs(); void store.requestPersist(); void pump();
  } catch (error) {
    const saved = error.capturedIds?.length || 0;
    receipt.innerHTML = `<div><strong>${saved ? saved + ' Dateien gespeichert.' : 'Noch nicht gespeichert.'}</strong><p>${esc(error.message)} Bitte die fehlenden Dateien erneut hinzufügen.</p></div>`;
    await reloadDocs().catch(() => {}); if (saved) void pump(); fail(error);
  } finally { capturing = false; $('#camera-button').disabled = $('#upload-button').disabled = false; }
}
async function openSettings() {
  await updateConnection();
  const info = await store.storageInfo();
  $('#storage-info').innerHTML = `<p>${info.usage == null ? '' : (info.usage / 1048576).toFixed(1) + ' MB belegt · '}${info.persisted ? 'Dauerhafter Speicher aktiv' : 'Dauerhafter Speicher noch nicht zugesichert'}</p>`;
  $('#redirect-url').textContent = location.origin + location.pathname;
  if (!$('#settings-dialog').open) $('#settings-dialog').showModal();
}
async function updateConnection() {
  const status = await cloud.getConnectionStatus();
  const config = await cloud.getDestination();
  $('#destination-status').innerHTML = `<strong>${esc(status.label || 'Auf diesem Gerät')}</strong>${esc(status.message || '')}`;
  $('#destination-caption').textContent = status.configured ? status.label || 'Ablage verbunden' : 'Ablage verbinden';
  $('#dropbox-key').value = config.clientId || '';
  $('#folder-connect').hidden = !status.supportsFolder;
  $('#folder-permission').hidden = status.provider !== 'folder' || !status.requiresGesture;
  $('#storage-disconnect').hidden = !status.configured;
  $('#connection').textContent = navigator.onLine === false ? 'Offline · lokal bereit' : status.connected ? 'Ablage verbunden' : 'Lokal bereit';
  $('#connection').classList.toggle('offline', navigator.onLine === false);
}
function revokeDetailUrl() { if (detailUrl) URL.revokeObjectURL(detailUrl); detailUrl = null; }
async function showDoc(id) {
  const doc = await store.getDoc(id); if (!doc) return;
  state.detailId = id; revokeDetailUrl(); const active = ['queued', 'processing'].includes(doc.processing?.state);
  $('#detail-content').innerHTML = `<h2 class="detail-name">${esc(doc.title || doc.file.name)}</h2><p class="detail-path">${esc(buildPath(doc) + '/' + buildFilename(doc))}</p><span class="doc-status ${statusOf(doc).kind}">${esc(statusOf(doc).text)}</span><div class="detail-preview" id="detail-preview"></div>${doc.cloud?.path ? `<p class="detail-path">Extern: ${esc(doc.cloud.path)}</p>` : ''}<p class="metadata-note">${active ? 'Die Datei wird noch ausgelesen. Angaben können danach bearbeitet werden.' : 'Automatisch erkannte Angaben bitte prüfen. Das Original bleibt erhalten.'}</p>
  <form id="detail-form"><fieldset class="detail-fields" ${active ? 'disabled' : ''}><div class="detail-grid"><label class="full">Beschreibung<input class="text-input" name="title" value="${esc(doc.title || '')}" maxlength="200"></label><label>Aussteller<input class="text-input" name="issuer" value="${esc(doc.issuer || '')}" maxlength="160"></label><label>Datum<input class="text-input" name="date" type="date" value="${esc(doc.date || '')}"></label><label>Betrag (${esc(doc.currency || 'EUR')})<input class="text-input" name="amount" type="number" step="0.01" value="${esc(doc.amount ?? '')}"></label><label>Jahr<input class="text-input" name="year" type="number" min="1900" max="2100" value="${esc(doc.year || '')}"></label><label>Kategorie<select name="category">${CATEGORIES.map((c) => `<option value="${c.key}" ${doc.category === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label><label>Belegart<select name="docType">${DOC_TYPES.map((c) => `<option value="${c.key}" ${doc.docType === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label><label class="full">Schlagwörter (mit Komma trennen)<input class="text-input" name="tags" value="${esc((doc.tags || []).join(', '))}" maxlength="500"></label><label class="full">Notiz<textarea name="note" rows="2" maxlength="4000">${esc(doc.note || '')}</textarea></label></div><div class="button-row"><button type="submit" class="button primary">Angaben bestätigen</button></div></fieldset></form>
  ${(doc.warnings || []).length ? `<p class="metadata-note">${doc.warnings.map(esc).join(' · ')}</p>` : ''}<details class="explanation"><summary>Erkannter Text</summary><pre class="extracted-text">${esc(doc.text || 'Noch kein Text erkannt.')}</pre></details><div class="more-actions"><button class="text-button" data-action="download">Original herunterladen ↓</button><button class="text-button" data-action="retry" ${active ? 'disabled' : ''}>Erneut auslesen</button><button class="text-button danger" data-action="delete">Lokal löschen</button></div>`;
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  const thumb = await store.getThumb(id);
  if (thumb && state.detailId === id) { detailUrl = URL.createObjectURL(thumb); const img = document.createElement('img'); img.src = detailUrl; img.alt = 'Vorschau des Belegs'; $('#detail-preview').replaceChildren(img); }
}
async function saveDetails(form) {
  const doc = await store.getDoc(state.detailId); if (!doc || ['queued', 'processing'].includes(doc.processing?.state)) return;
  const data = new FormData(form);
  for (const k of ['title', 'issuer', 'date', 'category', 'docType', 'note']) { doc[k] = String(data.get(k) || '').trim() || (k === 'date' ? null : ''); doc.edited = { ...doc.edited, [k]: true }; }
  doc.amount = data.get('amount') === '' ? null : Number(data.get('amount')); doc.year = data.get('year') === '' ? null : Number(data.get('year'));
  doc.edited.amount = doc.edited.year = true; doc.tags = String(data.get('tags') || '').split(',').map((v) => v.trim()).filter(Boolean).slice(0, 30);
  doc.status = 'geprueft'; doc.processing = { ...doc.processing, state: 'ready' }; doc.updatedAt = new Date().toISOString();
  const saved = await store.updateMetadata(doc.id, doc); changed(saved); toast('Angaben gespeichert.'); $('#detail-dialog').close();
}
async function exportHits() { const docs = state.hits.map((h) => state.docs.get(h.id)); if (!docs.length) return; await saveFile(await buildZip(docs, store.getBlob), 'Belegwerk-Auswahl.zip'); }
async function backup() { await saveFile(await buildBackup([...state.docs.values()], store.getBlob, {}, { getThumb: store.getThumb }), 'Belegwerk-Sicherung-' + new Date().toISOString().slice(0, 10) + '.zip'); }
async function restore(file) {
  if (!file) return;
  const result = await restoreBackup(file); let count = 0;
  for (const doc of result.docs) {
    if (await store.getDoc(doc.id)) continue;
    const blob = result.blobs.get(doc.id); if (!blob) throw new Error('Sicherung unvollständig: Ein Original fehlt. Bereits importierte Belege bleiben gespeichert.');
    // Backup metadata is untrusted input. Keep a bounded, typed document schema.
    if (!doc.file || typeof doc.file.name !== 'string' || doc.id.length > 200) throw new Error('Ungültige Beleg-Metadaten in der Sicherung.');
    for (const key of ['tags', 'warnings', 'flags']) doc[key] = Array.isArray(doc[key]) ? doc[key].filter((v) => typeof v === 'string').slice(0, 100) : [];
    for (const key of ['title', 'issuer', 'note', 'text']) doc[key] = typeof doc[key] === 'string' ? doc[key].slice(0, key === 'text' ? 600000 : 4000) : '';
    doc.amount = typeof doc.amount === 'number' && Number.isFinite(doc.amount) ? doc.amount : null;
    doc.year = Number.isInteger(doc.year) && doc.year >= 1900 && doc.year <= 2100 ? doc.year : null;
    doc.date = typeof doc.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(doc.date) && !Number.isNaN(Date.parse(doc.date)) ? doc.date : null;
    doc.currency = typeof doc.currency === 'string' && /^[A-Z]{3}$/.test(doc.currency) ? doc.currency : 'EUR';
    doc.status = ['offen', 'geprueft', 'ignoriert'].includes(doc.status) ? doc.status : 'offen';
    doc.edited = doc.edited && typeof doc.edited === 'object' && !Array.isArray(doc.edited) ? doc.edited : {};
    // Re-extract from restored originals so saved jobs cannot claim an upload happened on this device.
    await store.commitCapture({ ...doc, cloud: { state: 'disabled' }, processing: { state: 'queued' } }, blob);
    if (result.thumbs.has(doc.id)) await store.putThumb(doc.id, result.thumbs.get(doc.id)); count++;
  }
  await reloadDocs(); toast(`${count} Belege importiert.`); void pump();
}
async function setupPwa() {
  if (!('serviceWorker' in navigator) || !isSecureContext) { $('#pwa-state').textContent = 'Installation benötigt HTTPS'; return; }
  try {
    const reg = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { type: 'module', scope: new URL('../', import.meta.url).pathname });
    const ready = () => { $('#pwa-state').textContent = 'Offline bereit'; };
    if (reg.active) ready();
    const update = () => { waitingWorker = reg.waiting; if (waitingWorker && navigator.serviceWorker.controller) $('#update-notice').hidden = false; };
    update(); reg.addEventListener('updatefound', () => { const worker = reg.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'activated') ready(); if (worker.state === 'installed') { if (!navigator.serviceWorker.controller) ready(); update(); } }); });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'DOCUMENTS_CHANGED') void reloadDocs(); });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (waitingWorker) location.reload(); else ready(); });
  } catch { $('#pwa-state').textContent = 'Offline-Einrichtung fehlgeschlagen'; toast('Offline-Einrichtung fehlgeschlagen. Bitte online erneut öffnen.', true); }
}
function bindEvents() {
  document.addEventListener('click', (event) => {
    const view = event.target.closest('[data-view]'); if (view) { go(view.dataset.view); return; }
    const doc = event.target.closest('[data-doc]'); if (doc) { void showDoc(doc.dataset.doc).catch(fail); return; }
    const query = event.target.closest('[data-query]'); if (query) { $('#search-input').value = query.dataset.query; state.limit = 60; renderSearch(); $('#search-input').focus(); }
  });
  $('#camera-button').onclick = () => $('#camera-input').click(); $('#upload-button').onclick = () => $('#file-input').click();
  for (const [id, source] of [['camera-input', 'camera'], ['file-input', 'datei']]) $( '#' + id).onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; void capture(files, source); };
  $('#capture-zone').ondragover = (e) => { e.preventDefault(); $('#capture-zone').classList.add('dragging'); };
  $('#capture-zone').ondragleave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) $('#capture-zone').classList.remove('dragging'); };
  $('#capture-zone').ondrop = (e) => { e.preventDefault(); $('#capture-zone').classList.remove('dragging'); void capture([...e.dataTransfer.files]); };
  $('#search-input').oninput = () => { state.limit = 60; renderSearch(); };
  for (const id of ['filter-year', 'filter-category', 'filter-status', 'sort-select']) $('#' + id).onchange = () => { state.limit = 60; renderSearch(); };
  $('#load-more').onclick = () => { state.limit += 60; renderSearch(); };
  for (const id of ['settings-button', 'mobile-settings', 'destination-shortcut']) $('#' + id).onclick = () => { void openSettings().catch(fail); };
  $('#dropbox-connect').onclick = () => { void cloud.connectDropbox($('#dropbox-key').value).catch(fail); };
  $('#folder-connect').onclick = async () => { try { if (await cloud.chooseFolder()) { await pipeline.retryPending(); await updateConnection(); void pump(); toast('Ordner verbunden. Belege werden abgelegt.'); } } catch (e) { fail(e); } };
  $('#folder-permission').onclick = async () => { try { if (await cloud.requestFolderPermission()) { await pipeline.retryPending(); await updateConnection(); void pump(); } } catch (e) { fail(e); } };
  $('#storage-disconnect').onclick = async () => { try { await cloud.disconnectDropbox(); await cloud.setDestination({ provider: 'none' }); await updateConnection(); await reloadDocs(); toast('Ablage getrennt. Lokale Originale bleiben gespeichert.'); } catch (e) { fail(e); } };
  $('#persist-button').onclick = async () => { const ok = await store.requestPersist(); toast(ok ? 'Dauerhafter Speicher aktiv.' : 'Der Browser hat dauerhaften Speicher nicht zugesichert. Sicherung empfohlen.'); await openSettings(); };
  $('#retry-all').onclick = () => { void pipeline.retryPending().then(() => { void pump(); toast('Offene Aufträge werden fortgesetzt.'); }).catch(fail); };
  $('#backup-button').onclick = () => { void backup().catch(fail); }; $('#restore-button').onclick = () => $('#restore-input').click();
  $('#restore-input').onchange = (e) => { const file = e.target.files[0]; e.target.value = ''; void restore(file).catch(fail); };
  $('#export-visible').onclick = () => { void exportHits().catch(fail); };
  $('#detail-content').addEventListener('submit', (e) => { if (e.target.id === 'detail-form') { e.preventDefault(); void saveDetails(e.target).catch(fail); } });
  $('#detail-content').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action; if (!action) return;
    try {
      const doc = await store.getDoc(state.detailId); if (!doc) return;
      if (action === 'download') { const blob = await store.getBlob(doc.id); if (!blob) throw new Error('Original nicht verfügbar.'); await saveFile(blob, buildFilename(doc)); }
      if (action === 'retry') { await pipeline.retryDocument(doc.id); $('#detail-dialog').close(); void pump(); }
      if (action === 'delete' && confirm('Diesen Beleg und das Original von diesem Gerät löschen? Bereits extern abgelegte Dateien bleiben dort erhalten.')) { await store.deleteDoc(doc.id); $('#detail-dialog').close(); await reloadDocs(); channel?.postMessage({ type: 'changed' }); toast('Lokal gelöscht.'); }
    } catch (error) { fail(error); }
  });
  $('#detail-dialog').onclose = () => { revokeDetailUrl(); state.detailId = null; };
  $('#install-button').onclick = async () => { if (!installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('#install-button').hidden = true; };
  $('#update-button').onclick = () => { if (pumping || capturing || $('#detail-dialog').open) { toast('Bitte Verarbeitung und Änderungen zuerst abschließen.'); return; } waitingWorker?.postMessage({ type: 'SKIP_WAITING' }); };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('#install-button').hidden = false; });
  window.addEventListener('online', () => { void updateConnection(); void pump(); }); window.addEventListener('offline', () => { void updateConnection(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void reloadDocs().then(pump).catch(fail); void updateConnection(); } else void registerBackgroundUpload().catch(() => {}); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) void reloadDocs().then(pump).catch(fail); });
  window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
  window.addEventListener('resize', () => { $('#breadcrumb').textContent = innerWidth <= 760 ? 'belegwerk.' : { capture: 'Dein Eingang', library: 'Dein Archiv', activity: 'Deine Aktivität' }[state.view]; });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); go('library'); $('#search-input').focus(); } });
  channel?.addEventListener('message', () => { void reloadDocs().catch(fail); });
}
async function boot() {
  bindEvents(); $('#filter-category').innerHTML += CATEGORIES.map((c) => `<option value="${c.key}">${esc(c.label)}</option>`).join('');
  try {
    await store.openStore();
    if (await cloud.completeDropboxAuth()) { await pipeline.retryPending(); toast('Dropbox verbunden. Uploads werden fortgesetzt.'); }
  } catch (error) { fail(error); }
  try { await reloadDocs(); await updateConnection(); go(location.hash.slice(1) || 'capture', false); void pump(); }
  catch (error) { $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'Lokale Speicherung ist nicht verfügbar. Bitte Browser-Speicher freigeben oder einen regulären Browser verwenden. Es wurden keine neuen Dateien gespeichert.'; $('#camera-button').disabled = $('#upload-button').disabled = true; fail(error); }
  void setupPwa();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else void boot();
