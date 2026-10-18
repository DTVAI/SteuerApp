// Belegwerk – extract.js
// Datei-Expansion (Ordner, ZIP, E-Mail) und Textextraktion je Dateityp, Vorschau-Rendering.
// Browser-Modul; nutzt die global geladenen Bibliotheken pdfjsLib, JSZip, XLSX (und heic2any bei Bedarf).

import { ocrImage, ocrStatus } from './ocr.js';

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_DEPTH = 3;
const MAX_ZIP_ENTRIES = 5000;
const MAX_OCR_PAGES = 30;
const OCR_MIN_CONFIDENCE = 0.55;
const MIN_PAGE_CHARS = 25;
const THUMB_WIDTH = 360;
const MAX_TEXT_CHARS = 600_000;

/** Unterstützte Dateiendungen (klein geschrieben, ohne Punkt). */
export const SUPPORTED_EXT = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif',
  'docx', 'xlsx', 'xls', 'ods', 'csv', 'txt', 'md', 'json', 'html', 'htm', 'eml', 'rtf', 'zip',
];

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif']);
const SHEET_EXT = new Set(['xlsx', 'xls', 'ods']);
const TEXT_EXT = new Set(['txt', 'md', 'json']);

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
  avif: 'image/avif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  html: 'text/html', htm: 'text/html', eml: 'message/rfc822', rtf: 'application/rtf',
  zip: 'application/zip',
};

const EXT_BY_MIME = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tif', 'image/heic': 'heic',
  'text/plain': 'txt', 'text/html': 'html', 'text/csv': 'csv', 'application/zip': 'zip',
  'application/rtf': 'rtf', 'message/rfc822': 'eml', 'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
};

// ---------------------------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------------------------

function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function baseName(path) {
  const p = String(path || '').replace(/\\/g, '/');
  return p.slice(p.lastIndexOf('/') + 1);
}

function dirName(path) {
  const p = String(path || '').replace(/\\/g, '/');
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i + 1);
}

function stripExt(name) {
  return String(name || '').replace(/\.[A-Za-z0-9]{1,6}$/, '');
}

function isIgnoredPath(path) {
  const segs = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (!segs.length) return true;
  for (const s of segs) {
    if (s === '__MACOSX' || s.startsWith('.')) return true;
  }
  const last = segs[segs.length - 1];
  return /^(thumbs\.db|desktop\.ini)$/i.test(last) || last.startsWith('~$');
}

function bytesToBin(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return s;
}

function binToBytes(s) {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
  return u;
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Bestimmt den MIME-Typ. Bekannte Endungen haben Vorrang vor dem (oft ungenauen) Browser-Typ.
 * @param {string} name Dateiname
 * @param {string} [blobType] Blob.type
 * @returns {string}
 */
export function detectMime(name, blobType) {
  const byExt = MIME_BY_EXT[extOf(name)];
  if (byExt) return byExt;
  let t = String(blobType || '').split(';')[0].trim().toLowerCase();
  if (t === 'application/x-zip-compressed') t = 'application/zip';
  if (t && t !== 'application/octet-stream') return t;
  return 'application/octet-stream';
}

/** Erkennt den Typ anhand der ersten Bytes (für Dateien ohne/mit falscher Endung). */
async function sniffExt(blob) {
  try {
    const u = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const a = (i) => u[i];
    if (a(0) === 0x25 && a(1) === 0x50 && a(2) === 0x44 && a(3) === 0x46) return 'pdf';
    if (a(0) === 0xff && a(1) === 0xd8) return 'jpg';
    if (a(0) === 0x89 && a(1) === 0x50 && a(2) === 0x4e && a(3) === 0x47) return 'png';
    if (a(0) === 0x47 && a(1) === 0x49 && a(2) === 0x46) return 'gif';
    if (a(0) === 0x42 && a(1) === 0x4d) return 'bmp';
    if (a(0) === 0x52 && a(1) === 0x49 && a(2) === 0x46 && a(3) === 0x46 && a(8) === 0x57) return 'webp';
    if ((a(0) === 0x49 && a(1) === 0x49 && a(2) === 0x2a) || (a(0) === 0x4d && a(1) === 0x4d && a(3) === 0x2a)) return 'tif';
    if (a(4) === 0x66 && a(5) === 0x74 && a(6) === 0x79 && a(7) === 0x70) {
      const brand = String.fromCharCode(a(8), a(9), a(10), a(11));
      if (/^(heic|heix|mif1|msf1|hevc)/.test(brand)) return 'heic';
      if (brand === 'avif') return 'avif';
    }
    if (a(0) === 0x50 && a(1) === 0x4b) return 'zip';
    if (a(0) === 0xd0 && a(1) === 0xcf) return 'xls';
    if (a(0) === 0x7b && a(1) === 0x5c && a(2) === 0x72 && a(3) === 0x74) return 'rtf';
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
  }
  return '';
}

function requireLib(name) {
  const lib = typeof window !== 'undefined' ? window[name] : undefined;
  if (!lib) throw new Error(`Bibliothek ${name} ist nicht geladen`);
  return lib;
}

// ---------------------------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------------------------

/**
 * SHA-256 eines Blobs als Hex-String (crypto.subtle; Fallback in JS für unsichere Kontexte).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  if (globalThis.crypto && crypto.subtle) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(new Uint8Array(buf));
}

function sha256Fallback(data) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length;
  const total = (((len + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000), false);
  dv.setUint32(total - 4, (len << 3) >>> 0, false);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------------------------------------------------------------------------------------------
// Text-Dekodierung
// ---------------------------------------------------------------------------------------------

function decodeBytes(bytes, charset) {
  let label = String(charset || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!label || label === 'us-ascii' || label === 'ascii') label = 'windows-1252';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Dekodiert Dateibytes ohne Charset-Angabe: BOM → UTF-8 (strikt) → Windows-1252. */
function decodeText(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function tidyText(t) {
  return String(t || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------------------------
// HTML → Text
// ---------------------------------------------------------------------------------------------

const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'ul', 'ol', 'li', 'table', 'tr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'address', 'form', 'fieldset', 'hr', 'dl', 'dt', 'dd', 'main', 'nav']);

/**
 * Wandelt HTML in lesbaren Text (ohne script/style; Tabellenzellen mit ' | ').
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,noscript,template,head > *:not(title)').forEach((n) => n.remove());
  let out = '';
  const walk = (node, pre) => {
    if (node.nodeType === 3) {
      let t = node.nodeValue || '';
      if (!pre) t = t.replace(/\s+/g, ' ');
      out += t;
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') { out += '\n'; return; }
    const block = BLOCK_TAGS.has(tag);
    if (block) out += '\n';
    const isPre = pre || tag === 'pre';
    for (const c of node.childNodes) {
      walk(c, isPre);
      if (c.nodeType === 1 && (c.tagName === 'TD' || c.tagName === 'TH') && c.nextElementSibling) out += ' | ';
    }
    if (block) out += '\n';
  };
  const title = doc.title ? doc.title.trim() : '';
  walk(doc.body || doc.documentElement, false);
  const body = out.replace(/[ \t]*\n[ \t]*/g, '\n');
  return tidyText(title && !body.includes(title) ? `${title}\n${body}` : body);
}

// ---------------------------------------------------------------------------------------------
// E-Mail (.eml) – eigener MIME-Parser
// ---------------------------------------------------------------------------------------------

function decodeQuotedPrintableBin(s, qEncodedWord = false) {
  let t = qEncodedWord ? s.replace(/_/g, ' ') : s.replace(/=\r?\n/g, '');
  t = t.replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return t;
}

function decodeBase64Bin(s) {
  let clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const rest = clean.length % 4;
  if (rest === 1) clean = clean.slice(0, -1);
  else if (rest) clean += '='.repeat(4 - rest);
  try {
    return atob(clean);
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    return '';
  }
}

/** Decodiert RFC-2047-Header (=?charset?B|Q?…?=); Eingabe darf rohe 8-Bit-Zeichen enthalten. */
function decodeHeaderValue(raw) {
  let s = String(raw || '');
  if (/[\x80-\xff]/.test(s) && !/[^\x00-\xff]/.test(s)) {
    try { s = new TextDecoder('utf-8', { fatal: true }).decode(binToBytes(s)); } catch { /* bleibt Latin-1 */ }
  }
  if (!s.includes('=?')) return s.trim();
  const re = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;
  let out = '';
  let last = 0;
  let group = null; // {charset, bytes: string}
  const flush = () => {
    if (group) {
      out += decodeBytes(binToBytes(group.bytes), group.charset);
      group = null;
    }
  };
  let m;
  while ((m = re.exec(s))) {
    const between = s.slice(last, m.index);
    if (group && /^\s*$/.test(between)) {
      // aufeinanderfolgende Encoded-Words: Zwischenraum entfällt
    } else {
      flush();
      out += between;
    }
    const charset = m[1].split('*')[0];
    const bin = m[2].toLowerCase() === 'b' ? decodeBase64Bin(m[3]) : decodeQuotedPrintableBin(m[3], true);
    if (group && group.charset.toLowerCase() === charset.toLowerCase()) group.bytes += bin;
    else { flush(); group = { charset, bytes: bin }; }
    last = m.index + m[0].length;
  }
  flush();
  out += s.slice(last);
  return out.replace(/\s+/g, ' ').trim();
}

function parseHeaders(head) {
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ');
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    (headers[name] ||= []).push(line.slice(i + 1).trim());
  }
  return headers;
}

/** Zerlegt "wert; k=v; k2="v2"" inkl. RFC-2231 (filename*=UTF-8''…, filename*0=…). */
function parseParams(value) {
  const str = String(value || '');
  const pieces = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' && str[i - 1] !== '\\') inQ = !inQ;
    if (c === ';' && !inQ) { pieces.push(cur); cur = ''; } else cur += c;
  }
  pieces.push(cur);
  const main = (pieces.shift() || '').trim().toLowerCase();
  const plain = {};
  const ext = {}; // base → {charset, parts:[{n, enc, val}]}
  for (const p of pieces) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    let k = p.slice(0, i).trim().toLowerCase();
    let v = p.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    const m = /^(.+?)\*(\d+)?(\*)?$/.exec(k);
    if (m) {
      // "name*=" (ohne Ziffer) = kodiert; "name*0=" = Fortsetzung unkodiert; "name*0*=" = Fortsetzung kodiert
      const e = (ext[m[1]] ||= { charset: '', parts: [] });
      e.parts.push({ n: m[2] === undefined ? 0 : parseInt(m[2], 10), enc: m[2] === undefined ? true : !!m[3], val: v });
    } else {
      plain[k] = v;
    }
  }
  const params = { ...plain };
  for (const [base, e] of Object.entries(ext)) {
    e.parts.sort((a, b) => a.n - b.n);
    let bytes = '';
    let charset = '';
    e.parts.forEach((part, idx) => {
      let v = part.val;
      if (part.enc) {
        if (idx === 0) {
          const mm = /^([^']*)'[^']*'(.*)$/.exec(v);
          if (mm) { charset = mm[1]; v = mm[2]; }
        }
        bytes += v.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      } else {
        bytes += bytesToBin(new TextEncoder().encode(v));
      }
    });
    params[base] = decodeBytes(binToBytes(bytes), charset || 'utf-8');
  }
  return { main, params };
}

function splitHeadBody(s) {
  const m = /\r?\n\r?\n/.exec(s);
  if (!m) return { head: s, body: '' };
  return { head: s.slice(0, m.index), body: s.slice(m.index + m[0].length) };
}

function splitMultipart(body, boundary) {
  const d = '--' + boundary;
  const marks = [];
  let i = 0;
  while ((i = body.indexOf(d, i)) !== -1) {
    if (i === 0 || body[i - 1] === '\n') {
      const after = body.slice(i + d.length, i + d.length + 2);
      let eol = body.indexOf('\n', i + d.length);
      if (eol < 0) eol = body.length - 1;
      marks.push({ start: i, bodyStart: eol + 1, closing: after === '--' });
    }
    i += d.length;
  }
  const parts = [];
  for (let k = 0; k < marks.length - 1; k++) {
    if (marks[k].closing) break;
    let end = marks[k + 1].start;
    if (body[end - 1] === '\n') end--;
    if (body[end - 1] === '\r') end--;
    parts.push(body.slice(marks[k].bodyStart, Math.max(marks[k].bodyStart, end)));
  }
  return parts;
}

function decodePartBytes(body, cte) {
  switch (cte) {
    case 'base64': return binToBytes(decodeBase64Bin(body));
    case 'quoted-printable': return binToBytes(decodeQuotedPrintableBin(body));
    default: return binToBytes(body);
  }
}

function safeFileName(name, max = 120) {
  let n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim();
  n = n.replace(/^\.+/, '');
  if (n.length > max) {
    const ext = extOf(n);
    n = n.slice(0, max - (ext ? ext.length + 1 : 0)) + (ext ? '.' + ext : '');
  }
  return n;
}

function walkMimePart(raw, acc) {
  const { head, body } = splitHeadBody(raw);
  const h = parseHeaders(head);
  const ct = parseParams((h['content-type'] && h['content-type'][0]) || 'text/plain');
  const cd = parseParams((h['content-disposition'] && h['content-disposition'][0]) || '');
  const cte = ((h['content-transfer-encoding'] && h['content-transfer-encoding'][0]) || '7bit').trim().toLowerCase();

  if (ct.main.startsWith('multipart/') && ct.params.boundary) {
    for (const sub of splitMultipart(body, ct.params.boundary)) walkMimePart(sub, acc);
    return;
  }

  const bytes = decodePartBytes(body, cte);
  let filename = cd.params.filename || ct.params.name || '';
  if (filename) filename = decodeHeaderValue(filename);

  if (ct.main === 'message/rfc822') {
    const { head: ih } = splitHeadBody(bytesToBin(bytes));
    const subj = decodeHeaderValue((parseHeaders(ih).subject || [''])[0]);
    acc.attachments.push({ name: safeFileName(filename || (subj ? subj + '.eml' : 'Weitergeleitete Mail.eml')), bytes, mime: 'message/rfc822' });
    return;
  }

  const isText = ct.main === 'text/plain' || ct.main === 'text/html';
  const disp = cd.main;
  if (isText && !filename && disp !== 'attachment') {
    const text = decodeBytes(bytes, ct.params.charset || (cte === '7bit' ? 'us-ascii' : 'utf-8'));
    if (ct.main === 'text/html') acc.html.push(text);
    else acc.plain.push(text);
    return;
  }
  if (/pkcs7-signature|pgp-signature|pgp-keys/.test(ct.main)) return;
  if (!bytes.length) return;
  const hasCid = !!(h['content-id'] && h['content-id'][0]);
  if (ct.main.startsWith('image/') && (disp === 'inline' || hasCid) && bytes.length < 40_000) return; // Logos/Signaturbilder
  if (ct.main.startsWith('image/') && !filename && bytes.length < 10_000) return;

  let name = safeFileName(filename);
  if (!name) {
    acc.counter++;
    name = `Anhang_${acc.counter}.${EXT_BY_MIME[ct.main] || 'bin'}`;
  }
  acc.attachments.push({ name, bytes, mime: ct.main });
}

function formatMailDate(raw) {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return { text: raw || '', ms: NaN };
  const d = new Date(t);
  return { text: `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`, ms: t };
}

/**
 * Parst eine .eml-Datei (MIME multipart, base64/quoted-printable, RFC-2047-Header).
 * @param {Uint8Array} bytes
 * @returns {{subject:string, from:string, to:string, date:string, dateMs:number, text:string, attachments:{name:string, bytes:Uint8Array, mime:string}[]}}
 */
export function parseEml(bytes) {
  const raw = bytesToBin(bytes);
  const { head } = splitHeadBody(raw);
  const h = parseHeaders(head);
  const get = (k) => decodeHeaderValue((h[k] && h[k][0]) || '');
  const acc = { plain: [], html: [], attachments: [], counter: 0 };
  walkMimePart(raw, acc);
  let text = acc.plain.map((t) => t.trim()).filter(Boolean).join('\n\n');
  if (!text && acc.html.length) text = acc.html.map(htmlToText).filter(Boolean).join('\n\n');
  const date = formatMailDate(get('date'));
  return {
    subject: get('subject'), from: get('from'), to: get('to'), date: date.text, dateMs: date.ms,
    text: tidyText(text), attachments: acc.attachments,
  };
}

// ---------------------------------------------------------------------------------------------
// expandInputs
// ---------------------------------------------------------------------------------------------

// cp850 (obere Hälfte) für ZIP-Dateinamen ohne UTF-8-Flag (Windows-Explorer)
const CP850_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

function decodeZipFileName(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u);
  } catch {
    let s = '';
    for (const b of u) s += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80];
    return s;
  }
}

function toFile(blob, name, lastModified, mimeHint) {
  return new File([blob], name, { type: detectMime(name, mimeHint || blob.type), lastModified: lastModified || Date.now() });
}

async function readAllEntries(reader) {
  const all = [];
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkFsEntry(entry, out, top) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: String(entry.fullPath || file.name).replace(/^\/+/, ''), top });
  } else if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    for (const c of children) await walkFsEntry(c, out, top);
  }
}

async function collectInputs(input) {
  const items = [];
  const isDT = typeof DataTransfer !== 'undefined' && input instanceof DataTransfer;
  if (isDT || (input && input.items && input.files && !Array.isArray(input) && typeof input.length !== 'number')) {
    // webkitGetAsEntry muss synchron (vor dem ersten await) für alle Items aufgerufen werden.
    const entries = [];
    const loose = [];
    const list = input.items ? Array.from(input.items) : [];
    if (list.length && typeof list[0].webkitGetAsEntry === 'function') {
      for (const it of list) {
        if (it.kind !== 'file') continue;
        const e = it.webkitGetAsEntry();
        if (e) entries.push(e);
        else { const f = it.getAsFile(); if (f) loose.push(f); }
      }
    } else {
      loose.push(...Array.from(input.files || []));
    }
    for (const e of entries) {
      if (e.isDirectory) {
        const found = [];
        const top = e.name;
        try { await walkFsEntry(e, found, top); } catch (err) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); }
        for (const f of found) items.push({ file: f.file, path: f.path, kind: 'ordner', parent: top });
      } else {
        try {
          const file = await new Promise((res, rej) => e.file(res, rej));
          items.push({ file, path: file.name, kind: 'datei', parent: null });
        } catch (err) {
          console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
        }
      }
    }
    for (const f of loose) items.push({ file: f, path: f.webkitRelativePath || f.name, kind: f.webkitRelativePath ? 'ordner' : 'datei', parent: f.webkitRelativePath ? f.webkitRelativePath.split('/')[0] : null });
    return items;
  }
  const files = Array.from(input || []);
  for (const f of files) {
    const rel = f.webkitRelativePath || '';
    items.push({ file: f, path: rel || f.name, kind: rel ? 'ordner' : 'datei', parent: rel ? rel.split('/')[0] : null });
  }
  return items;
}

async function expandZip(item, depth, out) {
  const JSZip = requireLib('JSZip');
  let zip;
  try {
    zip = await JSZip.loadAsync(item.file, { decodeFileName: decodeZipFileName });
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    out.push({ file: item.file, name: baseName(item.path), path: item.path, lastModified: item.file.lastModified, source: { kind: item.kind, parent: item.parent }, warning: 'ZIP-Datei konnte nicht geöffnet werden' });
    return;
  }
  const backup = Object.keys(zip.files).find((n) => /(^|\/)belegwerk-backup\.json$/.test(n) && !zip.files[n].dir);
  if (backup) {
    out.push({ backup: item.file, file: item.file, name: baseName(item.path), path: item.path, lastModified: item.file.lastModified, source: { kind: 'zip', parent: null } });
    return;
  }
  const parentName = baseName(item.path);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !isIgnoredPath(n));
  if (names.length > MAX_ZIP_ENTRIES) console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
  for (const n of names.slice(0, MAX_ZIP_ENTRIES)) {
    const entry = zip.files[n];
    const size = entry._data && entry._data.uncompressedSize;
    if (size && size > MAX_FILE_BYTES) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); continue; }
    try {
      const blob = await entry.async('blob');
      const name = baseName(n);
      const file = toFile(blob, name, entry.date ? entry.date.getTime() : item.file.lastModified);
      await processItem({ file, path: n, kind: 'zip', parent: parentName }, depth + 1, out);
    } catch (e) {
      console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    }
  }
}

async function expandEml(item, depth, out) {
  let mail;
  try {
    mail = parseEml(new Uint8Array(await item.file.arrayBuffer()));
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    out.push({ file: item.file, name: baseName(item.path), path: item.path, lastModified: item.file.lastModified, source: { kind: item.kind, parent: item.parent } });
    return;
  }
  const emlName = baseName(item.path);
  const dir = dirName(item.path);
  const when = Number.isNaN(mail.dateMs) ? item.file.lastModified : mail.dateMs;
  const header = [
    `Betreff: ${mail.subject}`,
    `Von: ${mail.from}`,
    mail.to ? `An: ${mail.to}` : '',
    `Datum: ${mail.date}`,
  ].filter(Boolean).join('\n');
  const mailText = `${header}\n\n${mail.text}\n`;
  const mailName = safeFileName((mail.subject || stripExt(emlName)) + '.txt') || 'E-Mail.txt';
  out.push({
    file: new File([mailText], mailName, { type: 'text/plain', lastModified: when }),
    name: mailName, path: dir + mailName, lastModified: when,
    source: { kind: 'email', parent: emlName },
    mail: { subject: mail.subject, from: mail.from, to: mail.to, date: mail.date },
  });
  const used = new Set([mailName.toLowerCase()]);
  for (const att of mail.attachments) {
    let name = att.name;
    if (used.has(name.toLowerCase())) {
      const ext = extOf(name);
      const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
      let k = 2;
      while (used.has(`${stem} (${k})${ext ? '.' + ext : ''}`.toLowerCase())) k++;
      name = `${stem} (${k})${ext ? '.' + ext : ''}`;
    }
    used.add(name.toLowerCase());
    const file = toFile(new Blob([att.bytes]), name, when, att.mime);
    await processItem({ file, path: dir + name, kind: 'email', parent: emlName }, depth + 1, out);
  }
}

async function processItem(item, depth, out) {
  const name = baseName(item.path);
  if (isIgnoredPath(item.path)) return;
  if (item.file.size > MAX_FILE_BYTES) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); return; }
  let ext = extOf(name);
  if (!ext || !SUPPORTED_EXT.includes(ext)) {
    const sniffed = await sniffExt(item.file);
    if (sniffed === 'zip' && ext !== 'docx' && ext !== 'xlsx' && ext !== 'ods') ext = ext || 'zip';
  }
  if (ext === 'zip' && depth < MAX_ZIP_DEPTH) return expandZip(item, depth, out);
  if (ext === 'eml' && depth < MAX_ZIP_DEPTH + 1) return expandEml(item, depth, out);
  const f = item.file;
  out.push({
    file: f, name, path: item.path, lastModified: f.lastModified || Date.now(),
    source: { kind: item.kind, parent: item.parent },
  });
}

/**
 * Wandelt Eingaben (FileList, File[], DataTransfer) in eine flache Liste von Belegen um.
 * Ordner werden rekursiv gelesen, ZIPs (bis Tiefe 3) entpackt, .eml in Mailtext + Anhänge zerlegt.
 * ZIPs mit `belegwerk-backup.json` ergeben einen Eintrag mit `backup`-Blob statt Expansion.
 * Bei DataTransfer muss die Funktion synchron im drop-Handler aufgerufen werden.
 * @param {FileList|File[]|DataTransfer} input
 * @returns {Promise<{file:Blob, name:string, path:string, lastModified:number, source:{kind:string, parent:string|null}, backup?:Blob}[]>}
 */
export async function expandInputs(input) {
  const items = await collectInputs(input);
  const out = [];
  for (const it of items) {
    try {
      await processItem(it, 0, out);
    } catch (e) {
      console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Canvas-Helfer, Thumbnails
// ---------------------------------------------------------------------------------------------

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function makeThumb(src) {
  try {
    const scale = Math.min(1, THUMB_WIDTH / src.width);
    const c = newCanvas(src.width * scale, src.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const b = await canvasToBlob(c, 'image/jpeg', 0.8);
    c.width = c.height = 0;
    return b;
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    return null;
  }
}

function releaseCanvas(c) {
  if (c && c.width) { c.width = 0; c.height = 0; }
}

// ---------------------------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------------------------

let heicLoading = null;
function loadHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!heicLoading) {
    heicLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('vendor/heic2any.min.js', document.baseURI).href;
      s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any nicht verfügbar')));
      s.onerror = () => { heicLoading = null; reject(new Error('heic2any konnte nicht geladen werden')); };
      document.head.appendChild(s);
    });
  }
  return heicLoading;
}

/** Dekodiert ein Bild (inkl. HEIC) in eine ImageBitmap, EXIF-Orientierung wird angewandt. */
async function decodeImage(blob, ext) {
  const opts = { imageOrientation: 'from-image' };
  try {
    return await createImageBitmap(blob, opts);
  } catch (e) {
    if (ext !== 'heic' && ext !== 'heif') throw e;
  }
  const heic2any = await loadHeic2any();
  let res = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
  if (Array.isArray(res)) res = res[0];
  return createImageBitmap(res, opts);
}

// ---------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------

async function loadPdf(blob) {
  const lib = requireLib('pdfjsLib');
  lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
  const data = new Uint8Array(await blob.arrayBuffer());
  return lib.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
}

/** Setzt pdf.js-Textitems zu Zeilen zusammen (nach y gruppiert, nach x sortiert). */
function textItemsToString(items) {
  const arr = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str.length) continue;
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const h = Math.abs(it.height) || Math.hypot(t[2], t[3]) || 10;
    arr.push({ s: it.str, x: t[4], y: t[5], w: it.width || 0, h });
  }
  if (!arr.length) return '';
  arr.sort((a, b) => b.y - a.y);
  const lines = [];
  for (const it of arr) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(2, 0.45 * Math.min(it.h, last.h))) {
      last.items.push(it);
      last.h = Math.max(last.h, it.h);
    } else {
      lines.push({ y: it.y, h: it.h, items: [it] });
    }
  }
  const out = [];
  let prevY = null;
  let prevH = null;
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x - b.x);
    let s = '';
    let prev = null;
    for (const it of ln.items) {
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        const spaced = /\s$/.test(s) || /^\s/.test(it.s);
        if (!spaced) {
          if (gap > ln.h * 2.5) s += '  ';
          else if (gap > ln.h * 0.12 || (!prev.w && gap > 0)) s += ' ';
        }
      }
      s += it.s;
      prev = it;
    }
    s = s.replace(/[ \t]+$/g, '');
    if (!s.trim()) continue;
    if (prevY !== null && prevY - ln.y > 2.2 * Math.max(ln.h, prevH)) out.push('');
    out.push(s);
    prevY = ln.y;
    prevH = ln.h;
  }
  return out.join('\n');
}

async function renderPdfPage(page, { scale, width }) {
  const base = page.getViewport({ scale: 1 });
  let s = width ? width / base.width : scale;
  const MAX_SIDE = 4096;
  const MAX_AREA = 16_000_000;
  s = Math.min(s, MAX_SIDE / base.width, MAX_SIDE / base.height, Math.sqrt(MAX_AREA / (base.width * base.height)));
  const viewport = page.getViewport({ scale: s });
  const canvas = newCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Rendert Seiten eines PDFs oder ein Bild als Canvas (für die Vorschau).
 * @param {Blob} blob
 * @param {string} mime
 * @param {{maxPages?:number, width?:number}} [opts]
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export async function renderPages(blob, mime, { maxPages = 10, width = 900 } = {}) {
  const name = blob.name || '';
  let ext = extOf(name);
  if (!ext || !SUPPORTED_EXT.includes(ext)) ext = EXT_BY_MIME[String(mime || '').toLowerCase()] || (await sniffExt(blob));
  if (ext === 'pdf') {
    const pdf = await loadPdf(blob);
    const canvases = [];
    try {
      const n = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= n; i++) {
        const page = await pdf.getPage(i);
        canvases.push(await renderPdfPage(page, { width }));
        page.cleanup();
      }
    } finally {
      pdf.destroy();
    }
    return canvases;
  }
  if (IMAGE_EXT.has(ext)) {
    const bmp = await decodeImage(blob, ext);
    const scale = Math.min(1, width / bmp.width);
    const c = newCanvas(bmp.width * scale, bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return [c];
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// OCR-Anbindung (mit optionalem Vision-Fallback)
// ---------------------------------------------------------------------------------------------

function makeOcrContext(opts) {
  return {
    enabled: opts.ocr !== false,
    visionOcr: opts.ocr !== false && typeof opts.visionOcr === 'function' ? opts.visionOcr : null,
    timeouts: 0,
    unavailableWarned: false,
    warnings: [],
  };
}

/**
 * Liest Text aus einem Canvas/Bitmap: erst Tesseract, bei Ausfall oder Unsicherheit (< 0.55) optional Vision-KI.
 * @returns {Promise<{text:string, confidence:number|null, via:'ocr'|'ki'|null}>}
 */
async function recognizeImage(source, ctx, label, onFrac) {
  let res = null;
  if (ctx.enabled) {
    try {
      res = await ocrImage(source, { onProgress: onFrac });
      ctx.timeouts = 0;
    } catch (e) {
      if (e && e.code === 'OCR_UNAVAILABLE') {
        ctx.enabled = false;
        if (!ctx.unavailableWarned) {
          ctx.unavailableWarned = true;
          ctx.warnings.push(ocrStatus().error || 'Texterkennung nicht verfügbar');
        }
      } else if (e && e.code === 'OCR_TIMEOUT') {
        ctx.warnings.push(`${label}: Texterkennung dauerte zu lange und wurde abgebrochen`);
        if (++ctx.timeouts >= 2) { ctx.enabled = false; ctx.warnings.push('Texterkennung nach wiederholter Zeitüberschreitung beendet'); }
      } else {
        console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
        ctx.warnings.push(`${label}: Texterkennung fehlgeschlagen`);
      }
    }
  }
  const weak = !res || !res.text.trim() || res.confidence < OCR_MIN_CONFIDENCE;
  if (weak && ctx.visionOcr) {
    try {
      const blob = await sourceToJpeg(source, 1800);
      const t = blob ? await ctx.visionOcr(blob) : null;
      if (t && t.trim().length >= 20) return { text: tidyText(t), confidence: null, via: 'ki' };
    } catch (e) {
      console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
      ctx.warnings.push(`${label}: KI-Texterkennung fehlgeschlagen`);
    }
  }
  if (res && res.text.trim()) return { text: res.text, confidence: res.confidence, via: 'ocr' };
  return { text: '', confidence: null, via: null };
}

async function sourceToJpeg(source, maxSide) {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source;
  const long = Math.max(source.width, source.height);
  const s = Math.min(1, maxSide / long);
  const c = newCanvas(source.width * s, source.height * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const b = await canvasToBlob(c, 'image/jpeg', 0.85);
  releaseCanvas(c);
  return b;
}

function mergeMethod(kinds) {
  const has = (k) => kinds.includes(k);
  if (!kinds.length) return 'none';
  if (has('text') && (has('ocr') || has('ki'))) return 'mixed';
  if (has('text')) return 'text';
  if (has('ki') && has('ocr')) return 'mixed';
  if (has('ki')) return 'ki-ocr';
  return 'ocr';
}

// ---------------------------------------------------------------------------------------------
// Extraktoren je Typ
// ---------------------------------------------------------------------------------------------

async function extractPdf(blob, opts, ctx, progress) {
  const warnings = ctx.warnings;
  let pdf;
  try {
    pdf = await loadPdf(blob);
  } catch (e) {
    const pw = e && (e.name === 'PasswordException');
    warnings.push(pw ? 'PDF ist passwortgeschützt' : 'PDF konnte nicht gelesen werden');
    if (!pw) console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    return { text: '', pages: 0, method: 'none', ocrConfidence: null, thumb: null };
  }
  const n = pdf.numPages;
  const pageTexts = [];
  const kinds = [];
  let confSum = 0;
  let confWeight = 0;
  let ocrPages = 0;
  let skippedOcr = 0;
  let thumb = null;
  try {
    for (let i = 1; i <= n; i++) {
      const lbl = `Seite ${i}/${n}`;
      progress(((i - 1) + 0.02) / n, `${lbl} · Text lesen`);
      const page = await pdf.getPage(i);
      let text = '';
      try {
        const tc = await page.getTextContent();
        text = textItemsToString(tc.items);
      } catch (e) {
        console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
      }
      const hasText = text.trim().length >= MIN_PAGE_CHARS;
      let pageCanvas = null;
      if (hasText) {
        kinds.push('text');
        pageTexts.push(text.trim());
      } else if (ctx.enabled || ctx.visionOcr) {
        if (ocrPages >= MAX_OCR_PAGES) {
          skippedOcr++;
          if (text.trim()) pageTexts.push(text.trim());
        } else {
          ocrPages++;
          progress(((i - 1) + 0.1) / n, `${lbl} · Seite rendern`);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(3, Math.max(2, 2000 / Math.max(base.width, base.height)));
          pageCanvas = await renderPdfPage(page, { scale });
          progress(((i - 1) + 0.2) / n, `${lbl} · Texterkennung`);
          const r = await recognizeImage(pageCanvas, ctx, lbl, (f) => progress(((i - 1) + 0.2 + 0.8 * f) / n, `${lbl} · Texterkennung`));
          if (r.via) {
            kinds.push(r.via);
            const t = r.text.trim();
            pageTexts.push(text.trim() && !t.includes(text.trim()) ? `${text.trim()}\n${t}` : t);
            if (r.via === 'ocr') { confSum += r.confidence * t.length; confWeight += t.length; }
          } else if (text.trim()) {
            pageTexts.push(text.trim());
          }
        }
      } else if (text.trim()) {
        pageTexts.push(text.trim());
      }
      if (i === 1) {
        try {
          const c = pageCanvas || await renderPdfPage(page, { width: THUMB_WIDTH * 2 });
          thumb = await makeThumb(c);
          if (!pageCanvas) releaseCanvas(c);
        } catch (e) {
          console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
        }
      }
      releaseCanvas(pageCanvas);
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }
  if (skippedOcr) warnings.push(`Nur die ersten ${MAX_OCR_PAGES} Seiten wurden per Texterkennung gelesen (${skippedOcr} weitere übersprungen)`);
  if (!ctx.enabled && !ctx.visionOcr && kinds.length < n && !warnings.length) {
    warnings.push('Seiten ohne Text wurden nicht erkannt (Texterkennung ausgeschaltet)');
  }
  return {
    text: pageTexts.join('\n\n'),
    pages: n,
    method: mergeMethod(kinds),
    ocrConfidence: confWeight ? confSum / confWeight : null,
    thumb,
  };
}

async function extractImage(blob, ext, opts, ctx, progress) {
  let bmp;
  try {
    progress(0.05, 'Bild · Laden');
    bmp = await decodeImage(blob, ext);
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    ctx.warnings.push(ext === 'tif' || ext === 'tiff'
      ? 'TIFF wird von diesem Browser nicht unterstützt – bitte als PDF oder JPG hinzufügen'
      : 'Bild konnte nicht gelesen werden');
    return { text: '', pages: 1, method: 'none', ocrConfidence: null, thumb: null };
  }
  const thumb = await makeThumb(bmp);
  let text = '';
  let conf = null;
  let method = 'none';
  if (ctx.enabled || ctx.visionOcr) {
    progress(0.15, 'Bild · Texterkennung');
    const r = await recognizeImage(bmp, ctx, 'Bild', (f) => progress(0.15 + 0.85 * f, 'Bild · Texterkennung'));
    if (r.via) {
      text = r.text;
      conf = r.via === 'ocr' ? r.confidence : null;
      method = r.via === 'ki' ? 'ki-ocr' : 'ocr';
    }
  } else {
    ctx.warnings.push('Texterkennung ist ausgeschaltet');
  }
  bmp.close();
  return { text, pages: 1, method, ocrConfidence: conf, thumb };
}

function w(node, local) {
  return node.localName === local;
}

function docxParagraph(p) {
  let s = '';
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (ln === 't') s += c.textContent;
      else if (ln === 'tab') s += '\t';
      else if (ln === 'br' || ln === 'cr') s += '\n';
      else if (ln === 'noBreakHyphen') s += '-';
      else if (ln === 'p') { s += '\n'; walk(c); s += '\n'; }
      else if (ln === 'pPr' || ln === 'rPr' || ln === 'delText' || ln === 'instrText') continue;
      else walk(c);
    }
  };
  walk(p);
  return s;
}

function docxBlocks(parent, out) {
  for (const c of parent.children) {
    if (w(c, 'p')) {
      const t = docxParagraph(c).trim();
      if (t) out.push(t);
    } else if (w(c, 'tbl')) {
      for (const tr of c.children) {
        if (!w(tr, 'tr')) continue;
        const cells = [];
        for (const tc of tr.children) {
          if (!w(tc, 'tc')) continue;
          const inner = [];
          docxBlocks(tc, inner);
          cells.push(inner.join(' ').replace(/\s+/g, ' ').trim());
        }
        if (cells.some(Boolean)) out.push(cells.join(' | '));
      }
    } else if (w(c, 'sdt') || w(c, 'sdtContent') || w(c, 'ins') || w(c, 'customXml')) {
      docxBlocks(c, out);
    }
  }
}

async function extractDocx(blob, ctx, progress) {
  const JSZip = requireLib('JSZip');
  const zip = await JSZip.loadAsync(blob);
  const parseXml = async (path) => {
    const f = zip.file(path);
    if (!f) return null;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  };
  progress(0.2, 'Word-Dokument lesen');
  const headers = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).sort();
  const footers = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n)).sort();
  const lines = [];
  for (const path of [...headers, 'word/document.xml', ...footers]) {
    const doc = await parseXml(path);
    if (!doc) continue;
    const root = path === 'word/document.xml' ? (doc.getElementsByTagNameNS('*', 'body')[0] || doc.documentElement) : doc.documentElement;
    docxBlocks(root, lines);
  }
  let thumb = null;
  const th = zip.file(/^docProps\/thumbnail\.(jpe?g|png)$/i)[0];
  if (th) {
    try {
      const bmp = await createImageBitmap(await th.async('blob'));
      thumb = await makeThumb(bmp);
      bmp.close();
    } catch (e) {
      console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    }
  }
  const text = tidyText(lines.join('\n'));
  if (!text) ctx.warnings.push('Word-Dokument enthält keinen Text');
  return { text, pages: 1, method: text ? 'text' : 'none', ocrConfidence: null, thumb };
}

function parseCsv(text) {
  const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join('\n');
  const count = (ch) => (head.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
  const cands = [';', ',', '\t', '|'];
  let delim = ';';
  let best = -1;
  for (const d of cands) { const c = count(d); if (c > best) { best = c; delim = d; } }
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c;
    } else if (c === '"' && cur === '') inQ = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function rowsToText(rows) {
  const lines = [];
  for (const r of rows) {
    const cells = r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    if (cells.length) lines.push(cells.join(' | '));
  }
  return lines.join('\n');
}

/** Zelle als deutsch formatierter Text (Datum tt.mm.jjjj, Dezimalkomma, Währungszeichen aus dem Zellformat). */
function sheetCellText(cell) {
  if (!cell) return '';
  const v = cell.v;
  if (v === undefined || v === null) return '';
  if (cell.t === 'd' || v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000); // Mitte des Tages: robust gegen Zeitzonen-Versatz
    return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }
  if (cell.t === 'n' && typeof v === 'number') {
    const w = String(cell.w || '');
    if (/%/.test(w)) return w;
    const dm = /[.,](\d+)\D*$/.exec(w);
    const decimals = dm && !/^General$/i.test(cell.z || '') ? Math.min(dm[1].length, 6) : null;
    let s = decimals === null ? String(Math.round(v * 1e8) / 1e8) : v.toFixed(decimals);
    s = s.replace('.', ',');
    if (/€|EUR/.test(w)) s += ' €';
    return s;
  }
  if (cell.t === 'b') return v ? 'ja' : 'nein';
  return String(cell.w !== undefined && cell.t !== 's' ? cell.w : v);
}

async function extractSheet(blob, ext, ctx, progress) {
  progress(0.2, 'Tabelle lesen');
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  if (ext === 'csv') {
    text = rowsToText(parseCsv(decodeText(u8)));
  } else {
    const XLSX = requireLib('XLSX');
    const wb = XLSX.read(u8, { type: 'array', cellDates: true });
    const parts = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const rows = [];
      const lastRow = Math.min(range.e.r, range.s.r + 4999);
      const lastCol = Math.min(range.e.c, range.s.c + 99);
      for (let r = range.s.r; r <= lastRow; r++) {
        const row = [];
        for (let c = range.s.c; c <= lastCol; c++) row.push(sheetCellText(ws[XLSX.utils.encode_cell({ r, c })]));
        rows.push(row);
      }
      const body = rowsToText(rows);
      if (body) parts.push(wb.SheetNames.length > 1 ? `[${name}]\n${body}` : body);
    }
    text = parts.join('\n\n');
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    ctx.warnings.push('Tabelle ist sehr groß – Text gekürzt');
  }
  return { text: tidyText(text), pages: 1, method: text.trim() ? 'text' : 'none', ocrConfidence: null, thumb: null };
}

function rtfToText(src) {
  const special = { par: '\n', line: '\n', sect: '\n', page: '\n', tab: '\t', emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ' };
  const skipDest = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'themedata', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'datastore', 'colorschememapping', 'fldinst', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'private', 'revtbl']);
  const cp = new TextDecoder('windows-1252');
  let out = '';
  const stack = [];
  let skip = false;
  let uc = 1;
  let skipChars = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { stack.push({ skip, uc }); continue; }
    if (c === '}') { const s = stack.pop(); if (s) { skip = s.skip; uc = s.uc; } continue; }
    if (c === '\r' || c === '\n') continue;
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '\\' || n === '{' || n === '}') { if (!skip && !skipChars) out += n; else if (skipChars) skipChars--; i++; continue; }
      if (n === '*') { skip = true; i++; continue; }
      if (n === "'") {
        const hex = src.substr(i + 2, 2);
        if (skipChars) skipChars--;
        else if (!skip) out += cp.decode(Uint8Array.of(parseInt(hex, 16) || 63));
        i += 3;
        continue;
      }
      if (n === '~') { if (!skip) out += ' '; i++; continue; }
      if (n === '-' || n === '_') { if (!skip) out += '-'; i++; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
      if (m) {
        const word = m[1];
        const param = m[2] === undefined ? null : parseInt(m[2], 10);
        i += m[0].length - 1;
        if (skipDest.has(word)) skip = true;
        else if (word === 'uc' && param !== null) uc = param;
        else if (word === 'u' && param !== null) {
          if (!skip) out += String.fromCharCode(param < 0 ? param + 65536 : param);
          skipChars = uc;
        } else if (!skip && word in special) out += special[word];
        continue;
      }
      i++;
      continue;
    }
    if (skipChars) { skipChars--; continue; }
    if (!skip) out += c;
  }
  return tidyText(out);
}

async function extractPlainLike(blob, ext, ctx) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  if (ext === 'html' || ext === 'htm') text = htmlToText(decodeText(u8));
  else if (ext === 'rtf') text = rtfToText(bytesToBin(u8));
  else text = tidyText(decodeText(u8));
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    ctx.warnings.push('Text ist sehr lang – gekürzt');
  }
  return { text, pages: 1, method: text ? 'text' : 'none', ocrConfidence: null, thumb: null };
}

// ---------------------------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------------------------

/**
 * Liest Text (und Vorschaubild) aus einem Beleg.
 * @param {{file:Blob, name?:string}|Blob} entry Eintrag aus expandInputs (oder Blob/File)
 * @param {{onProgress?:(fraction:number,label:string)=>void, ocr?:boolean, visionOcr?:null|((imageBlob:Blob)=>Promise<string|null>)}} [opts]
 * @returns {Promise<{text:string, pages:number, method:'text'|'ocr'|'mixed'|'ki-ocr'|'none', ocrConfidence:number|null, mime:string, thumb:Blob|null, warnings:string[]}>}
 */
export async function extract(entry, opts = {}) {
  const blob = entry instanceof Blob ? entry : entry.file;
  const name = (entry && entry.name) || blob.name || '';
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const progress = (f, label) => {
    if (!onProgress) return;
    try { onProgress(Math.min(1, Math.max(0, f)), label); } catch (e) { console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.'); }
  };
  const ctx = makeOcrContext(opts);
  let ext = extOf(name);
  if (!ext || !SUPPORTED_EXT.includes(ext)) {
    const sniffed = await sniffExt(blob);
    if (sniffed) ext = sniffed;
  }
  const mime = detectMime(ext ? `x.${ext}` : name, blob.type);
  const empty = { text: '', pages: 0, method: 'none', ocrConfidence: null, thumb: null };
  let r;
  progress(0, 'Datei lesen');
  try {
    if (ext === 'pdf') r = await extractPdf(blob, opts, ctx, progress);
    else if (IMAGE_EXT.has(ext)) r = await extractImage(blob, ext, opts, ctx, progress);
    else if (ext === 'docx') r = await extractDocx(blob, ctx, progress);
    else if (SHEET_EXT.has(ext) || ext === 'csv') r = await extractSheet(blob, ext, ctx, progress);
    else if (TEXT_EXT.has(ext) || ext === 'html' || ext === 'htm' || ext === 'rtf') r = await extractPlainLike(blob, ext, ctx);
    else if (ext === 'eml') {
      const mail = parseEml(new Uint8Array(await blob.arrayBuffer()));
      const head = [`Betreff: ${mail.subject}`, `Von: ${mail.from}`, mail.to ? `An: ${mail.to}` : '', `Datum: ${mail.date}`].filter(Boolean).join('\n');
      r = { text: `${head}\n\n${mail.text}`, pages: 1, method: 'text', ocrConfidence: null, thumb: null };
    } else {
      ctx.warnings.push(`Dateityp „${ext || name}“ wird nicht unterstützt`);
      r = { ...empty };
    }
  } catch (e) {
    console.warn('Belegwerk: Verarbeitungsschritt fehlgeschlagen.');
    ctx.warnings.push(`Datei konnte nicht gelesen werden${e && e.message ? ` (${e.message})` : ''}`);
    r = { ...empty };
  }
  progress(1, 'Fertig');
  return {
    text: r.text,
    pages: r.pages,
    method: r.text && r.text.trim() ? r.method : 'none',
    ocrConfidence: r.ocrConfidence,
    mime,
    thumb: r.thumb || null,
    warnings: ctx.warnings,
  };
}
