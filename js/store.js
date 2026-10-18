// Belegwerk: persistent documents, originals and transactional processing outbox.
// A successful write means IndexedDB committed. Volatile fallback must never
// confirm a capture that would disappear when the user closes the application.
const DB_NAME = 'belegwerk';
const DB_VERSION = 2;
const STORE_NAMES = ['docs', 'blobs', 'thumbs', 'settings', 'jobs'];
export let isMemoryOnly = false; // Compatibility with the original UI.
let dbPromise;
let idb;

function storageError(cause) {
  const error = new Error('Lokales Speichern ist nicht verfügbar. Bitte den Browser-Speicher freigeben und erneut versuchen.', { cause });
  error.code = 'STORAGE_UNAVAILABLE';
  return error;
}

export function openStore() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(storageError()); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('docs')) {
          const docs = db.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('hash', 'file.hash', { unique: false });
        }
        for (const name of ['blobs', 'thumbs', 'settings']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
        if (!db.objectStoreNames.contains('jobs')) {
          const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
          jobs.createIndex('docId', 'docId', { unique: false });
          jobs.createIndex('type', 'type', { unique: false });
        }
        // v1 documents already contain their analysis. Keep all originals,
        // thumbnails and settings; do not silently send existing data anywhere.
        const cursor = request.transaction.objectStore('docs').openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          const doc = item.value;
          if (!doc.processing) doc.processing = { state: doc.relevance === 'pruefen' || !doc.text ? 'review' : 'ready', migrated: true };
          if (!doc.cloud) doc.cloud = { state: 'disabled' };
          item.update(doc);
          item.continue();
        };
      };
      request.onsuccess = () => {
        idb = request.result;
        idb.onversionchange = () => { idb?.close(); idb = null; dbPromise = null; };
        idb.onclose = () => { idb = null; dbPromise = null; };
        isMemoryOnly = false;
        resolve({ memoryOnly: false });
      };
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => {
        // Resolve only after the upgrade can actually commit.
        globalThis.dispatchEvent?.(new Event('belegwerk-storage-blocked'));
      };
    }).catch((error) => { isMemoryOnly = true; dbPromise = null; throw error; });
  }
  return dbPromise;
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The callback may await IDB requests only; hashing, OCR and network calls happen
// outside transactions. A request succeeding does not itself confirm a commit.
async function access(names, mode, callback) {
  await openStore();
  const tx = idb.transaction(names, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  });
  done.catch(() => {});
  const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));
  try {
    const result = await callback(stores);
    await done;
    return result;
  } catch (error) {
    try { tx.abort(); } catch { /* Already finished. */ }
    await done.catch(() => {});
    throw error;
  }
}

function validId(doc) {
  if (!doc || typeof doc.id !== 'string' || !doc.id) throw new Error('Dokument-ID fehlt');
}

export async function putDoc(doc) {
  validId(doc);
  await access(['docs'], 'readwrite', (s) => reqP(s.docs.put(doc)));
}
/** Edit user metadata without overwriting an upload acknowledgement or lease state. */
export async function updateMetadata(id, patch) {
  return access(['docs'], 'readwrite', async (s) => {
    const doc = await reqP(s.docs.get(id));
    if (!doc) throw new Error('Beleg nicht mehr vorhanden.');
    if (['queued', 'processing'].includes(doc.processing?.state)) throw new Error('Bitte die laufende Verarbeitung zuerst abschließen lassen.');
    for (const key of ['title', 'issuer', 'date', 'year', 'amount', 'category', 'docType', 'note', 'tags']) if (key in patch) doc[key] = patch[key];
    doc.edited = { ...doc.edited, ...patch.edited };
    doc.status = 'geprueft'; doc.processing = { ...doc.processing, state: 'ready' };
    doc.updatedAt = new Date().toISOString();
    await reqP(s.docs.put(doc));
    return doc;
  });
}
export async function getDoc(id) {
  return (await access(['docs'], 'readonly', (s) => reqP(s.docs.get(id)))) ?? null;
}
export async function allDocs() {
  const docs = await access(['docs'], 'readonly', (s) => reqP(s.docs.getAll()));
  return docs.sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
}
export async function deleteDoc(id) {
  await access(['docs', 'blobs', 'thumbs', 'jobs', 'settings'], 'readwrite', async (s) => {
    const jobs = await reqP(s.jobs.index('docId').getAll(id));
    const keys = await reqP(s.settings.getAllKeys());
    const paths = keys.filter((key) => typeof key === 'string' && key.startsWith('storage.path.') && key.endsWith(`.${id}`));
    await Promise.all([reqP(s.docs.delete(id)), reqP(s.blobs.delete(id)), reqP(s.thumbs.delete(id)), ...jobs.map((job) => reqP(s.jobs.delete(job.id))), ...paths.map((key) => reqP(s.settings.delete(key)))]);
  });
}
export async function findByHash(hash) {
  if (!hash) return null;
  const docs = await access(['docs'], 'readonly', (s) => reqP(s.docs.index('hash').getAll(hash)));
  return docs.find((doc) => !doc.duplicateOf) || null;
}
export async function putBlob(id, blob) { await access(['blobs'], 'readwrite', (s) => reqP(s.blobs.put(blob, id))); }
export async function getBlob(id) { return (await access(['blobs'], 'readonly', (s) => reqP(s.blobs.get(id)))) ?? null; }
export async function putThumb(id, blob) { await access(['thumbs'], 'readwrite', (s) => reqP(s.thumbs.put(blob, id))); }
export async function getThumb(id) { return (await access(['thumbs'], 'readonly', (s) => reqP(s.thumbs.get(id)))) ?? null; }
export async function getSetting(key, fallback) {
  const value = await access(['settings'], 'readonly', (s) => reqP(s.settings.get(key)));
  return value === undefined ? fallback : value;
}
export async function setSetting(key, value) { await access(['settings'], 'readwrite', (s) => reqP(s.settings.put(value, key))); }
export async function clearAll() { await access(STORE_NAMES, 'readwrite', (s) => Promise.all(STORE_NAMES.map((name) => reqP(s[name].clear())))); }

export function makeJob(type, docId) {
  return { id: `${type}:${docId}`, type, docId, status: 'waiting', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, token: null };
}

/** Original + document + extraction intent commit atomically before capture succeeds. */
export async function commitCapture(doc, blob) {
  validId(doc);
  if (!(blob instanceof Blob)) throw new TypeError('Originaldatei fehlt');
  await access(['docs', 'blobs', 'jobs'], 'readwrite', (s) => Promise.all([
    reqP(s.docs.add(doc)), reqP(s.blobs.add(blob, doc.id)), reqP(s.jobs.add(makeJob('extraction', doc.id))),
  ]));
  return doc.id;
}

/** Atomic claim survives worker/tab crashes; token prevents stale owners committing. */
export async function claimJob(type, { leaseMs = 30_000, now = Date.now() } = {}) {
  return access(['jobs', 'docs'], 'readwrite', async (s) => {
    const jobs = await reqP(s.jobs.index('type').getAll(type));
    const ready = jobs.filter((job) => (job.status === 'waiting' && (job.nextAttemptAt || 0) <= now) || (job.status === 'running' && (job.leaseUntil || 0) <= now))
      .sort((a, b) => (a.nextAttemptAt || 0) - (b.nextAttemptAt || 0));
    for (const job of ready) {
      const doc = await reqP(s.docs.get(job.docId));
      if (!doc) { await reqP(s.jobs.delete(job.id)); continue; }
      Object.assign(job, { status: 'running', token: globalThis.crypto?.randomUUID?.() || `${now}-${Math.random()}`, leaseUntil: now + leaseMs, attempts: (job.attempts || 0) + 1 });
      if (type === 'extraction') doc.processing = { ...doc.processing, state: 'processing', attempts: job.attempts, error: null };
      await Promise.all([reqP(s.jobs.put(job)), reqP(s.docs.put(doc))]);
      return job;
    }
    return null;
  });
}

function owns(current, claim) { return current?.status === 'running' && current.token === claim.token; }
function lostLease() { const error = new Error('Verarbeitung wurde von einem anderen Fenster übernommen.'); error.code = 'LEASE_LOST'; return error; }

export async function renewLease(claim, leaseMs = 30_000) {
  return access(['jobs'], 'readwrite', async (s) => {
    const job = await reqP(s.jobs.get(claim.id));
    if (!owns(job, claim)) return false;
    job.leaseUntil = Date.now() + leaseMs;
    await reqP(s.jobs.put(job));
    return true;
  });
}

/** Save a content hash and resolve duplicates without a hash/write race. */
export async function recordHash(claim, hash) {
  return access(['docs', 'jobs'], 'readwrite', async (s) => {
    if (!owns(await reqP(s.jobs.get(claim.id)), claim)) throw lostLease();
    const doc = await reqP(s.docs.get(claim.docId));
    if (!doc) throw lostLease();
    const matches = await reqP(s.docs.index('hash').getAll(hash));
    const duplicate = matches.find((item) => item.id !== doc.id && !item.duplicateOf);
    doc.file = { ...doc.file, hash };
    await reqP(s.docs.put(doc));
    return duplicate || null;
  });
}

/** Finish a lease and create derived documents/upload intent in the same commit. */
export async function completeJob(claim, { patch = {}, thumb, upload = false, captures = [] } = {}) {
  return access(['docs', 'blobs', 'thumbs', 'jobs'], 'readwrite', async (s) => {
    const job = await reqP(s.jobs.get(claim.id));
    if (!owns(job, claim)) throw lostLease();
    const doc = await reqP(s.docs.get(claim.docId));
    if (!doc) throw lostLease();
    const childIds = [];
    for (const child of captures) {
      const hash = child.doc.file?.hash;
      const matches = hash ? await reqP(s.docs.index('hash').getAll(hash)) : [];
      const existing = matches.find((item) => item.id !== doc.id && !item.duplicateOf) || await reqP(s.docs.get(child.doc.id));
      if (existing) { childIds.push(existing.id); continue; }
      await Promise.all([reqP(s.docs.add(child.doc)), reqP(s.blobs.add(child.blob, child.doc.id)), reqP(s.jobs.add(makeJob('extraction', child.doc.id)))]);
      childIds.push(child.doc.id);
    }
    // Extraction must not erase a concurrent upload acknowledgement.
    const confirmedCloud = claim.type === 'extraction' && (doc.cloud?.state === 'uploaded' || doc.cloud?.pendingDestinationId) ? doc.cloud : null;
    Object.assign(doc, patch, { updatedAt: new Date().toISOString() });
    if (confirmedCloud && !doc.duplicateOf) doc.cloud = confirmedCloud;
    if (captures.length) doc.children = childIds;
    if (upload && !doc.duplicateOf && doc.cloud?.state !== 'uploaded') {
      const previous = await reqP(s.jobs.get(`upload:${doc.id}`));
      if (!previous || previous.status === 'done') await reqP(s.jobs.put(makeJob('upload', doc.id)));
    }
    let finished = { ...job, status: 'done', token: null, leaseUntil: 0, error: null };
    if (claim.type === 'upload' && job.requestedDestinationId && job.requestedDestinationId !== doc.cloud?.destinationId) {
      // A new destination was enabled while this owner was uploading. Keep its
      // successful acknowledgement, then enqueue the newly requested copy.
      finished = { ...makeJob('upload', doc.id), destinationId: job.requestedDestinationId };
      doc.cloud = { ...doc.cloud, state: 'pending', pendingDestinationId: job.requestedDestinationId };
    }
    await Promise.all([reqP(s.docs.put(doc)), reqP(s.jobs.put(finished)), ...(thumb ? [reqP(s.thumbs.put(thumb, doc.id))] : [])]);
    return doc;
  });
}

/** Failure state and retry intent also commit together. */
export async function failJob(claim, error, { blocked = false, permanent = false, state, delay } = {}) {
  return access(['docs', 'jobs'], 'readwrite', async (s) => {
    const job = await reqP(s.jobs.get(claim.id));
    if (!owns(job, claim)) return false;
    const doc = await reqP(s.docs.get(claim.docId));
    if (!doc) return false;
    if (claim.type === 'upload' && job.requestedDestinationId && job.requestedDestinationId !== job.destinationId) {
      const next = { ...makeJob('upload', doc.id), destinationId: job.requestedDestinationId };
      doc.cloud = { ...doc.cloud, state: 'pending', pendingDestinationId: next.destinationId, error: null };
      await Promise.all([reqP(s.jobs.put(next)), reqP(s.docs.put(doc))]);
      return { requeued: true };
    }
    const message = String(error?.message || error || 'Verarbeitung fehlgeschlagen').slice(0, 500);
    const retryDelay = delay ?? Math.min(60 * 60_000, 5000 * 2 ** Math.min(job.attempts - 1, 9)) * (0.8 + Math.random() * 0.4);
    Object.assign(job, { status: blocked ? 'blocked' : permanent ? 'failed' : 'waiting', token: null, leaseUntil: 0, nextAttemptAt: Date.now() + retryDelay, error: message, code: error?.code || 'FAILED' });
    const key = claim.type === 'extraction' ? 'processing' : 'cloud';
    doc[key] = { ...doc[key], state: state || 'error', error: message, code: job.code, attempts: job.attempts, nextAttemptAt: blocked || permanent ? null : job.nextAttemptAt };
    doc.updatedAt = new Date().toISOString();
    await Promise.all([reqP(s.jobs.put(job)), reqP(s.docs.put(doc))]);
    return true;
  });
}

/** Requeue processed originals when an explicitly selected destination changes. */
export async function ensureUploadJobs(destinationId) {
  return access(['docs', 'jobs', 'blobs'], 'readwrite', async (s) => {
    const docs = await reqP(s.docs.getAll());
    let count = 0;
    for (const doc of docs) {
      if (doc.sample || doc.duplicateOf || !['ready', 'review'].includes(doc.processing?.state)) continue;
      if (doc.cloud?.state === 'uploaded' && (!destinationId || doc.cloud.destinationId === destinationId)) continue;
      const old = await reqP(s.jobs.get(`upload:${doc.id}`));
      if (old?.status === 'running' && old.leaseUntil > Date.now()) {
        if (destinationId) {
          if (old.destinationId !== destinationId) old.requestedDestinationId = destinationId;
          else delete old.requestedDestinationId;
          await reqP(s.jobs.put(old));
        }
        continue; // Never invalidate an active owner's lease.
      }
      if (old && old.status !== 'done' && (!destinationId || old.destinationId === destinationId)) continue;
      if (!await reqP(s.blobs.get(doc.id))) continue;
      doc.cloud = { ...doc.cloud, state: 'pending', pendingDestinationId: destinationId || null, error: null };
      const next = { ...makeJob('upload', doc.id), destinationId: destinationId || null };
      await Promise.all([reqP(s.docs.put(doc)), reqP(s.jobs.put(next))]);
      count++;
    }
    return count;
  });
}

/** Explicit retry; active owners are never disturbed. */
export async function resetJobs(docId) {
  return access(['docs', 'jobs'], 'readwrite', async (s) => {
    const jobs = docId ? await reqP(s.jobs.index('docId').getAll(docId)) : await reqP(s.jobs.getAll());
    let count = 0;
    for (const job of jobs) {
      if (job.status === 'done' || (job.status === 'running' && job.leaseUntil > Date.now())) continue;
      const doc = await reqP(s.docs.get(job.docId));
      if (!doc) continue;
      Object.assign(job, { status: 'waiting', attempts: 0, nextAttemptAt: 0, token: null, leaseUntil: 0 });
      const key = job.type === 'extraction' ? 'processing' : 'cloud';
      doc[key] = { ...doc[key], state: job.type === 'extraction' ? 'queued' : 'pending', error: null, nextAttemptAt: null };
      await Promise.all([reqP(s.jobs.put(job)), reqP(s.docs.put(doc))]);
      count++;
    }
    return count;
  });
}

/** Explicitly ask for fresh OCR/analysis while preserving the original. */
export async function requeueProcessing(id) {
  return access(['docs', 'jobs'], 'readwrite', async (s) => {
    const doc = await reqP(s.docs.get(id));
    if (!doc) return 0;
    const old = await reqP(s.jobs.get(`extraction:${id}`));
    if (old?.status === 'running' && old.leaseUntil > Date.now()) return 0;
    doc.processing = { ...doc.processing, state: 'queued', error: null };
    await Promise.all([reqP(s.docs.put(doc)), reqP(s.jobs.put(makeJob('extraction', id)))]);
    return 1;
  });
}

export async function allJobs() { return access(['jobs'], 'readonly', (s) => reqP(s.jobs.getAll())); }

export async function storageInfo() {
  const info = { usage: null, quota: null, persisted: false };
  const storage = globalThis.navigator?.storage;
  if (!storage) return info;
  try {
    if (storage.estimate) { const estimate = await storage.estimate(); info.usage = estimate.usage ?? null; info.quota = estimate.quota ?? null; }
    if (storage.persisted) info.persisted = Boolean(await storage.persisted());
  } catch { /* The estimate is optional, unlike a capture commit. */ }
  return info;
}
export async function requestPersist() {
  try { return Boolean(await globalThis.navigator?.storage?.persist?.()); } catch { return false; }
}
