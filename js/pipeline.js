// Durable capture first, resumable local extraction second, cloud outbox last.
// No DOM modules are imported until drainProcessing; drainUploads is SW-safe.
import * as store from './store.js';
import * as cloud from './cloud.js';

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const LEASE_MS = 30_000;
let processingPromise;
let uploadPromise;
const iso = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const extOf = (name) => /\.([a-z0-9]{1,8})$/i.exec(name || '')?.[1].toLowerCase() || '';

function newDocument(blob, { name, path, source, lastModified, id = uid(), hash = null } = {}) {
  const filename = name || blob.name || `Aufnahme-${Date.now()}.${blob.type === 'image/png' ? 'png' : blob.type?.startsWith('image/') ? 'jpg' : 'bin'}`;
  return {
    id, addedAt: iso(), updatedAt: iso(), sample: false,
    file: { name: filename, path: path || filename, mime: blob.type || '', ext: extOf(filename), size: blob.size, hash, lastModified: lastModified || blob.lastModified || Date.now() },
    source: typeof source === 'object' ? source : { kind: source || 'datei', parent: null },
    text: '', title: filename, pages: 0, method: 'none', ocrConfidence: null,
    category: 'unklar', docType: 'sonstiges', confidence: 0, relevance: 'pruefen',
    year: null, date: null, amount: null, currency: 'EUR', issuer: '', fields: {}, flags: [], alternatives: [], warnings: [],
    ai: null, status: 'offen', tags: [], note: '', edited: {}, duplicateOf: null,
    processing: { state: 'queued', attempts: 0 }, cloud: { state: 'disabled' },
  };
}

/**
 * Resolve only after each original, document and extraction job is committed.
 * No OCR, hashing or archive expansion is required before this confirmation.
 * A partial batch failure carries capturedIds so already committed originals
 * remain visible and can be reported correctly.
 */
export async function captureFiles(input, { source = 'datei' } = {}) {
  const files = input instanceof Blob ? [input] : Array.from(input?.files || input || []);
  const ids = [];
  try {
    for (const file of files) {
      if (!(file instanceof Blob)) throw new TypeError('Bitte eine Datei auswählen.');
      if (file.size > MAX_FILE_BYTES) throw new Error('Eine Datei darf höchstens 200 MB groß sein.');
      const doc = newDocument(file, { source, path: file.webkitRelativePath || file.name });
      ids.push(await store.commitCapture(doc, file));
    }
    return ids;
  } catch (error) {
    error.capturedIds = ids;
    throw error;
  }
}

async function changed(callback, id) {
  if (!callback) return;
  try { await callback(await store.getDoc(id)); } catch { /* Rendering must never invalidate a committed job. */ }
}
function progress(callback, id, fraction, label) {
  try { callback?.({ id, progress: fraction, label }); } catch { /* UI only. */ }
}

async function withLease(job, operation) {
  const timer = setInterval(() => { store.renewLease(job, LEASE_MS).catch(() => {}); }, LEASE_MS / 3);
  try { return await operation(); } finally { clearInterval(timer); }
}

async function exclusive(type, operation) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) return operation();
  return locks.request(`belegwerk-${type}`, { ifAvailable: true }, (lock) => lock ? operation() : { processed: 0, busy: true });
}

async function queueState(type, processed) {
  const jobs = (await store.allJobs()).filter((job) => job.type === type && !['done', 'failed', 'blocked'].includes(job.status));
  return { processed, pending: jobs.length, nextAttemptAt: jobs.length ? Math.min(...jobs.map((job) => job.status === 'running' ? job.leaseUntil : job.nextAttemptAt || Date.now())) : null };
}

function entryFor(doc, blob) {
  return { file: blob, name: doc.file.name, path: doc.file.path, lastModified: doc.file.lastModified, source: doc.source };
}

async function expandContainer(doc, blob, extract) {
  // The original archive/mail was already committed by captureFiles. Derived
  // originals and their jobs are committed with the parent's completion below.
  const original = new File([blob], doc.file.name, { type: doc.file.mime, lastModified: doc.file.lastModified });
  const entries = await extract.expandInputs([original]);
  if (!entries.length || entries.some((entry) => entry.backup || entry.warning || entry.name === doc.file.name && ['zip', 'eml'].includes(extOf(entry.name)))) {
    const error = new Error('Archiv oder E-Mail konnte nicht vollständig entpackt werden. Das Original bleibt erhalten; bitte erneut versuchen oder einzelne Dateien hochladen.');
    error.code = 'CONTAINER_UNREADABLE';
    error.nonretryable = true;
    throw error;
  }
  const captures = [];
  for (const entry of entries) {
    if (!entry.file) continue;
    const hash = await extract.sha256(entry.file);
    const child = newDocument(entry.file, { ...entry, id: `${doc.id}-${hash.slice(0, 24)}`, hash, source: { ...entry.source, captureParent: doc.id } });
    captures.push({ doc: child, blob: entry.file });
  }
  return captures;
}

/** Local extraction uses DOM/canvas/OCR and runs while an app window is alive. */
export function drainProcessing({ onChange, onProgress } = {}) {
  if (processingPromise) return processingPromise;
  processingPromise = exclusive('extraction', async () => {
    const extract = await import('./extract.js');
    const analysis = await import('./analyze.js');
    let processed = 0;
    let job;
    while ((job = await store.claimJob('extraction', { leaseMs: LEASE_MS }))) {
      await changed(onChange, job.docId);
      await withLease(job, async () => {
        try {
          let doc = await store.getDoc(job.docId);
          const blob = await store.getBlob(doc.id);
          if (!blob) { const error = new Error('Die lokal gespeicherte Originaldatei fehlt.'); error.nonretryable = true; throw error; }
          progress(onProgress, doc.id, 0.03, 'Prüft auf Duplikat');
          const hash = await extract.sha256(blob);
          const duplicate = await store.recordHash(job, hash);
          if (duplicate) {
            await store.completeJob(job, { patch: { duplicateOf: duplicate.id, processing: { state: 'ready', duplicate: true, completedAt: iso() }, cloud: { state: 'disabled', reason: 'duplicate' }, warnings: ['Diese Datei ist bereits lokal gespeichert.'] } });
            processed++;
            return;
          }
          doc = await store.getDoc(doc.id);
          if (['zip', 'eml'].includes(doc.file.ext)) {
            const captures = await expandContainer(doc, blob, extract);
            await store.completeJob(job, {
              captures, upload: true,
              patch: { title: doc.file.name, isContainer: true, warnings: ['Archiv aufgeteilt. Die Vollständigkeit kann anhand des gespeicherten Originals geprüft werden.'], processing: { state: 'review', completedAt: iso(), attempts: job.attempts }, cloud: { state: 'pending' } },
            });
          } else {
            const result = await extract.extract(entryFor(doc, blob), {
              ocr: true,
              onProgress: (fraction, label) => progress(onProgress, doc.id, 0.08 + (Number(fraction) || 0) * 0.85, label || 'Liest Datei'),
            });
            const detected = analysis.analyze(result.text || '', { filename: doc.file.name, mime: result.mime, ocr: /ocr/.test(result.method || ''), lastModified: doc.file.lastModified });
            // Edits or upload acknowledgements may have arrived during OCR.
            doc = await store.getDoc(doc.id);
            if (!doc) { const error = new Error('Dokument wurde gelöscht.'); error.code = 'LEASE_LOST'; throw error; }
            const merged = analysis.mergeAnalysis({ ...doc }, detected);
            const review = !result.text?.trim() || detected.relevance === 'pruefen' || detected.confidence < 0.65 || Boolean(result.warnings?.length) || Boolean(detected.flags?.length);
            await store.completeJob(job, {
              thumb: result.thumb, upload: doc.cloud?.state !== 'uploaded',
              patch: {
                ...Object.fromEntries(['category', 'docType', 'confidence', 'alternatives', 'relevance', 'year', 'date', 'amount', 'currency', 'issuer', 'title', 'fields', 'flags'].map((key) => [key, merged[key]])),
                analysis: detected, file: { ...doc.file, mime: result.mime || doc.file.mime },
                text: result.text || '', pages: result.pages || 0, method: result.method || 'none', ocrConfidence: result.ocrConfidence ?? null, warnings: result.warnings || [],
                processing: { state: review ? 'review' : 'ready', completedAt: iso(), attempts: job.attempts },
                cloud: doc.cloud?.state === 'uploaded' ? doc.cloud : { ...doc.cloud, state: 'pending' },
              },
            });
          }
          processed++;
          progress(onProgress, doc.id, 1, 'Verarbeitet');
        } catch (error) {
          if (error.code !== 'LEASE_LOST') await store.failJob(job, error, { permanent: Boolean(error.nonretryable) || job.attempts >= 5 });
        } finally {
          await changed(onChange, job.docId);
        }
      });
    }
    return queueState('extraction', processed);
  }).finally(() => { processingPromise = null; });
  return processingPromise;
}

/** Upload existing originals; safe in a module Service Worker and Background Sync. */
export function drainUploads({ onChange } = {}) {
  if (uploadPromise) return uploadPromise;
  uploadPromise = exclusive('upload', async () => {
    const destination = await cloud.getDestination();
    if (!destination || destination.provider === 'none') {
      // Preserve documents locally, without treating an unconfigured destination
      // as a failure or scheduling an endless retry loop.
      let job;
      while ((job = await store.claimJob('upload', { leaseMs: LEASE_MS }))) {
        const error = new Error('Kein Cloud-Speicher eingerichtet.'); error.code = 'NOT_CONFIGURED';
        await store.failJob(job, error, { blocked: true, state: 'disabled' });
        await changed(onChange, job.docId);
      }
      return { processed: 0, pending: 0, nextAttemptAt: null };
    }
    await store.ensureUploadJobs(destination.id || destination.provider);
    let processed = 0;
    let pauseUntil;
    let job;
    while ((job = await store.claimJob('upload', { leaseMs: LEASE_MS }))) {
      let stop = false;
      await withLease(job, async () => {
        try {
          const doc = await store.getDoc(job.docId);
          const blob = await store.getBlob(job.docId);
          if (!blob) { const error = new Error('Die Originaldatei fehlt.'); error.nonretryable = true; throw error; }
          const result = await cloud.uploadDocument(doc, blob);
          await store.completeJob(job, { patch: { cloud: { ...result, state: 'uploaded', error: null, uploadedAt: result.uploadedAt || iso() } } });
          processed++;
        } catch (error) {
          if (error.code !== 'LEASE_LOST') {
            const blocked = ['AUTH_REQUIRED', 'PERMISSION_REQUIRED', 'NOT_CONFIGURED'].includes(error.code);
            const state = ['AUTH_REQUIRED', 'PERMISSION_REQUIRED'].includes(error.code) ? 'auth' : error.code === 'NOT_CONFIGURED' ? 'disabled' : 'error';
            const rateLimited = Number.isFinite(error.retryAfter) && error.retryAfter > 0;
            const outcome = await store.failJob(job, error, { blocked, state, delay: rateLimited ? error.retryAfter * 1000 : undefined, permanent: Boolean(error.nonretryable) || job.attempts >= 8 });
            stop = !outcome?.requeued && (blocked || rateLimited || error.code === 'OFFLINE');
            // Auth/configuration failures need user action. Offline errors pause
            // the whole destination, even when other jobs are immediately due.
            if (stop && blocked) pauseUntil = null;
            else if (stop && rateLimited) pauseUntil = Date.now() + error.retryAfter * 1000;
            else if (stop && error.code === 'OFFLINE') pauseUntil = Date.now() + Math.min(60 * 60_000, 6000 * 2 ** Math.min(job.attempts - 1, 9));
          }
        } finally { await changed(onChange, job.docId); }
      });
      if (stop) break;
    }
    const result = await queueState('upload', processed);
    if (pauseUntil !== undefined) result.nextAttemptAt = pauseUntil;
    return result;
  }).finally(() => { uploadPromise = null; });
  return uploadPromise;
}

/** Call after explicit retry/reconnection or after destination/auth changes. */
export async function retryPending() { return store.resetJobs(); }
export async function retryDocument(id) {
  const doc = await store.getDoc(id);
  if (!doc) return 0;
  if (['review', 'error'].includes(doc.processing?.state)) return store.requeueProcessing(id);
  return store.resetJobs(id);
}
