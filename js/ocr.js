// Belegwerk – ocr.js
// Tesseract.js-Wrapper: lazy initialisierter Einzel-Worker, Warteschlange, Vorverarbeitung.
//
// Hinweise (tesseract.js 5.1.1, im Quelltext geprüft):
//  - corePath als ORDNER: der Worker wählt selbst "tesseract-core-simd-lstm.wasm.js" oder
//    "tesseract-core-lstm.wasm.js" (je nach WASM-SIMD-Unterstützung). OEM 1 (LSTM_ONLY) braucht
//    die "-lstm"-Cores; mit legacyCore/legacyLang = false (Default) bleibt es dabei.
//  - langPath + gzip:true lädt "<langPath>/deu.traineddata.gz".
//  - workerBlobURL:false → der Worker wird direkt von der Datei gestartet (kein blob:-Worker nötig).
//  - cacheMethod:'none' → kein IndexedDB-Cache der Sprachdaten (Dateien liegen lokal).

const LANG = 'deu';
const OEM_LSTM_ONLY = 1;
const TARGET_LONG_EDGE = 2000;
const MAX_UPSCALE = 2.5;
const INIT_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 90_000;

/** @type {{state:'idle'|'loading'|'ready'|'unavailable', error?:string}} */
let status = { state: 'idle' };
/** @type {Promise<any>|null} */
let workerPromise = null;
/** @type {any} */
let worker = null;
/** Aktueller Fortschritts-Callback (Tesseract-Logger ist pro Worker fest, der Callback pro Aufruf). */
let currentProgress = null;
/** Warteschlange: genau eine OCR gleichzeitig. */
let queueTail = Promise.resolve();

function vendorUrl(rel) {
  return new URL(rel, document.baseURI).href;
}

function makeError(message, code, cause) {
  const e = new Error(message);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout && onTimeout(); } catch (e) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); }
      reject(makeError(`Zeitüberschreitung nach ${Math.round(ms / 1000)} s`, 'OCR_TIMEOUT'));
    }, ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

/**
 * Aktueller Zustand der Texterkennung.
 * @returns {{state:'idle'|'loading'|'ready'|'unavailable', error?:string}}
 */
export function ocrStatus() {
  return { ...status };
}

async function ensureWorker() {
  if (status.state === 'unavailable') {
    throw makeError(status.error || 'Texterkennung nicht verfügbar', 'OCR_UNAVAILABLE');
  }
  if (worker && status.state === 'ready') return worker;
  if (workerPromise) return workerPromise;

  status = { state: 'loading' };
  const p = (async () => {
    if (typeof window === 'undefined' || !window.Tesseract || typeof window.Tesseract.createWorker !== 'function') {
      throw new Error('Tesseract.js ist nicht geladen');
    }
    if (typeof WebAssembly !== 'object') throw new Error('WebAssembly wird vom Browser nicht unterstützt');
    // Schnelltest: Eine CSP ohne 'wasm-unsafe-eval' lässt den Tesseract-Worker sonst still hängen.
    try {
      await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    } catch (e) {
      throw new Error(`WebAssembly ist blockiert: ${e && e.message ? e.message : e}`);
    }
    const w = await withTimeout(
      window.Tesseract.createWorker(LANG, OEM_LSTM_ONLY, {
        workerPath: vendorUrl('vendor/tesseract/worker-wrap.js'),
        corePath: vendorUrl('vendor/tesseract/'),
        langPath: vendorUrl('vendor/tesseract/lang'),
        gzip: true,
        workerBlobURL: false,
        cacheMethod: 'none',
        legacyCore: false,
        legacyLang: false,
        logger: (m) => {
          if (currentProgress && m && m.status === 'recognizing text' && typeof m.progress === 'number') {
            try { currentProgress(Math.min(1, Math.max(0, m.progress))); } catch (e) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); }
          }
        },
        errorHandler: () => console.warn('Belegwerk: Texterkennung fehlgeschlagen.'),
      }),
      INIT_TIMEOUT_MS,
    );
    try {
      await w.setParameters({
        tessedit_pageseg_mode: '3', // PSM AUTO
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
    } catch (e) {
      console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    }
    worker = w;
    status = { state: 'ready' };
    return w;
  })();

  workerPromise = p.catch((err) => {
    const msg = (err && err.message) ? err.message : (err ? String(err) : 'Worker konnte nicht gestartet werden');
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    status = {
      state: 'unavailable',
      error: `Texterkennung nicht verfügbar (${msg}). Möglicherweise blockiert die Umgebung WebAssembly oder Web-Worker.`,
    };
    workerPromise = null;
    worker = null;
    throw makeError(status.error, 'OCR_UNAVAILABLE', err);
  });
  return workerPromise;
}

/** Beendet den Worker (z. B. nach Timeout oder beim Aufräumen). Status wird wieder 'idle'. */
export async function terminateOcr() {
  const w = worker;
  const pending = workerPromise;
  worker = null;
  workerPromise = null;
  currentProgress = null;
  if (status.state !== 'unavailable') status = { state: 'idle' };
  try {
    const target = w || (pending ? await pending.catch(() => null) : null);
    if (target) await target.terminate();
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
  }
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToPngBlob(canvas) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas konnte nicht in PNG gewandelt werden'))), 'image/png');
  });
}

/**
 * Graustufen + leichte Kontrastanhebung (Perzentil-Streckung) in place.
 * @param {ImageData} img
 */
function enhance(img) {
  const d = img.data;
  const n = d.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = d[o + 3];
    let r = d[o], g = d[o + 1], b = d[o + 2];
    if (a < 255) { // Transparenz auf Weiß
      const k = a / 255;
      r = r * k + 255 * (1 - k); g = g * k + 255 * (1 - k); b = b * k + 255 * (1 - k);
    }
    const y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    d[o] = y;
    hist[y]++;
  }
  const clip = Math.max(1, Math.floor(n * 0.005));
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > clip) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > clip) { hi = v; break; } }
  const range = hi - lo;
  const stretch = range >= 40 && range < 250;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = stretch ? Math.round(((v - lo) / range) * 255) : v;
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const y = lut[d[o]];
    d[o] = d[o + 1] = d[o + 2] = y;
    d[o + 3] = 255;
  }
}

/**
 * Bereitet ein Bild für die OCR auf: Orientierung, Skalierung (~2000 px lange Kante, max. 2,5×),
 * Graustufen, Kontrast. Liefert ein PNG-Blob.
 * @param {Blob|HTMLCanvasElement|OffscreenCanvas|ImageBitmap} source
 * @returns {Promise<Blob>}
 */
async function preprocess(source) {
  let bitmap = null;
  let ownBitmap = false;
  let drawable = source;
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    ownBitmap = true;
    drawable = bitmap;
  }
  const sw = drawable.width, sh = drawable.height;
  if (!sw || !sh) throw makeError('Bild hat keine Größe', 'OCR_BAD_IMAGE');
  const long = Math.max(sw, sh);
  const scale = Math.min(TARGET_LONG_EDGE / long, MAX_UPSCALE);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawable, 0, 0, w, h);
  if (ownBitmap && bitmap.close) bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  enhance(img);
  ctx.putImageData(img, 0, 0);
  return canvasToPngBlob(canvas);
}

function cleanText(t) {
  return String(t || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MONEY_RE = /\d{1,3}(?:\.\d{3})*,\d{2}\b|\d+\.\d{2}\b/g;
function moneyCount(t) { return (String(t).match(MONEY_RE) || []).length; }
function needsBlockRetry(t) {
  const s = String(t).toLowerCase();
  if (!/summe|gesamt|betrag|zu zahlen|eur|€|bar|rechnung|total/.test(s)) return false;
  const lines = s.split('\n').filter(l => l.trim()).length;
  return moneyCount(s) < Math.max(2, Math.round(lines / 8));
}

/**
 * Erkennt Text in einem Bild (deutsch). Aufrufe werden nacheinander abgearbeitet.
 * Wirft einen Error mit `code === 'OCR_UNAVAILABLE'`, wenn die Texterkennung nicht läuft,
 * `'OCR_TIMEOUT'` bei > 90 s pro Seite.
 * @param {Blob|HTMLCanvasElement|OffscreenCanvas|ImageBitmap} source
 * @param {{onProgress?:(fraction:number)=>void}} [opts]
 * @returns {Promise<{text:string, confidence:number}>} confidence 0..1
 */
export function ocrImage(source, { onProgress } = {}) {
  const job = queueTail.then(async () => {
    if (status.state === 'unavailable') {
      throw makeError(status.error || 'Texterkennung nicht verfügbar', 'OCR_UNAVAILABLE');
    }
    const w = await ensureWorker();
    const image = await preprocess(source);
    currentProgress = onProgress || null;
    try {
      const result = await withTimeout(
        w.recognize(image, {}, { text: true }),
        PAGE_TIMEOUT_MS,
        () => { terminateOcr(); },
      );
      const data = result && result.data ? result.data : {};
      const conf = typeof data.confidence === 'number' ? data.confidence / 100 : 0;
      let best = { text: cleanText(data.text), confidence: Math.min(1, Math.max(0, conf)) };
      // Belege mit rechtsbündiger Betragsspalte: PSM 3 verwirft die Spalte oft.
      // Fehlen Beträge, obwohl Summen-Wörter da sind → als ein Block (PSM 6) erneut lesen.
      if (needsBlockRetry(best.text)) {
        try {
          await w.setParameters({ tessedit_pageseg_mode: '6' });
          const r2 = await withTimeout(w.recognize(image, {}, { text: true }), PAGE_TIMEOUT_MS, () => { terminateOcr(); });
          const d2 = r2 && r2.data ? r2.data : {};
          const alt = { text: cleanText(d2.text), confidence: Math.min(1, Math.max(0, (d2.confidence || 0) / 100)) };
          if (moneyCount(alt.text) > moneyCount(best.text)) best = alt;
        } catch (e) {
          console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
        } finally {
          try { if (worker) await worker.setParameters({ tessedit_pageseg_mode: '3' }); } catch { /* Worker evtl. beendet */ }
        }
      }
      return best;
    } finally {
      currentProgress = null;
    }
  });
  queueTail = job.catch(() => {});
  return job;
}
