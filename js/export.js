// Export fuer Belegwerk: ZIP, XLSX, CSV, Sicherung (Backup) und Ordner-Export.
// Erwartet globale Scripts: window.JSZip (3.10.1) und window.XLSX (SheetJS 0.18.5).
import { CATEGORIES, DOC_TYPES, categoryOf, docTypeOf, LIMITS } from './taxonomy.js';
import { buildFilename, buildPath } from './analyze.js';

const SUMMARY_XLSX = 'Belegwerk-Übersicht.xlsx';
const SUMMARY_CSV = 'Belegwerk-Übersicht.csv';
const BACKUP_JSON = 'belegwerk-backup.json';
const BACKUP_VERSION = 1;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY_FMT = '#,##0.00 €';
const DATE_FMT = 'DD.MM.YYYY';
const BASE_HEADERS = [
  'Jahr', 'Kategorie', 'Belegart', 'Datum', 'Betrag', 'Aussteller', 'Beschreibung',
  'Status', 'Neuer Dateiname', 'Ordner', 'Originaldatei', 'Hinweise', 'Notiz',
];
const STATUS_LABEL = { offen: 'offen', geprueft: 'geprüft', ignoriert: 'ignoriert' };

/** Fuer ZIP, Ordner-Export und Summen: keine Beispielbelege, keine ignorierten. */
function isExportable(doc) {
  return !doc.sample && doc.status !== 'ignoriert';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function requireGlobal(name) {
  const lib = globalThis[name];
  if (!lib) throw new Error(`${name} ist nicht geladen (window.${name} fehlt)`);
  return lib;
}

/** Blob -> Uint8Array (funktioniert in Browser und Node, ohne FileReader). */
async function toBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Sortierung fuer Listen: Jahr, Kategorie-Nr, Datum, Dateiname. */
function sortForExport(docs) {
  const nr = (d) => categoryOf(d.category)?.nr ?? '99';
  return [...docs].sort((a, b) =>
    (a.year ?? 9999) - (b.year ?? 9999)
    || nr(a).localeCompare(nr(b))
    || String(a.date ?? '').localeCompare(String(b.date ?? ''))
    || String(a.file?.name ?? '').localeCompare(String(b.file?.name ?? '')),
  );
}

/** Kollisionsfreier Pfad: 'Name.pdf' -> 'Name (2).pdf'. Vergleich ohne Gross/Klein. */
function uniquePath(path, used) {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = path;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    candidate = `${dir}${base} (${i})${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function extOf(doc) {
  const fromField = typeof doc.file?.ext === 'string' ? doc.file.ext : '';
  const fromName = doc.file?.name?.match(/\.([^.]+)$/)?.[1] ?? '';
  const ext = (fromField || fromName).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
}

// --- Gemeinsame Zeilen-Logik (CSV und XLSX) -----------------------------------

function baseFields(doc) {
  return {
    year: doc.year ?? null,
    category: categoryOf(doc.category)?.label ?? '',
    docType: docTypeOf(doc.docType)?.label ?? '',
    date: doc.date ?? null,
    amount: typeof doc.amount === 'number' ? doc.amount : null,
    issuer: doc.issuer ?? '',
    title: doc.title ?? '',
    status: STATUS_LABEL[doc.status] ?? doc.status ?? '',
    newName: buildFilename(doc),
    folder: buildPath(doc),
    original: doc.file?.path || doc.file?.name || '',
    flags: (doc.flags ?? []).join(', '),
    note: doc.note ?? '',
  };
}

/** Alle vorkommenden Feld-Keys in Reihenfolge des ersten Auftretens. */
function fieldKeysOf(docs) {
  const keys = [];
  const seen = new Set();
  for (const doc of docs) {
    for (const key of Object.keys(doc.fields ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

function fieldValue(doc, key) {
  const value = doc.fields?.[key]?.value;
  if (Array.isArray(value)) return value.join(', ');
  return value ?? null;
}

/** Excel-Seriennummer fuer 'YYYY-MM-DD' (1900-System). */
function excelSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

function dateCell(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return '';
  return { t: 'n', v: excelSerial(iso), z: DATE_FMT };
}

function moneyCell(n) {
  if (n == null) return '';
  return { t: 'n', v: n, z: MONEY_FMT };
}

/** Zeilenwerte fuer das Blatt 'Belege' (Zellobjekte mit Format). */
function xlsxRow(doc, keys) {
  const b = baseFields(doc);
  return [
    b.year ?? '', b.category, b.docType, dateCell(b.date), moneyCell(b.amount),
    b.issuer, b.title, b.status, b.newName, b.folder, b.original, b.flags, b.note,
    ...keys.map((k) => fieldValue(doc, k) ?? ''),
  ];
}

function formatDateDE(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function formatMoneyDE(n) {
  return typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '';
}

function formatPlainDE(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  return String(v);
}

/** CSV-Feld mit ';' als Trenner: Quotes bei Sonderzeichen. */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// --- Summen ---------------------------------------------------------------------

function aggregate(list) {
  let sum = 0;
  let open = 0;
  let checked = 0;
  for (const doc of list) {
    if (typeof doc.amount === 'number') sum += doc.amount;
    if (doc.status === 'geprueft') checked++;
    else open++;
  }
  return { count: list.length, sum: round2(sum), open, checked };
}

/**
 * Summen fuer Uebersicht und Export. Beispielbelege und ignorierte Belege zaehlen nicht mit
 * (ignorierte werden separat ausgewiesen).
 * @param {object[]} docs
 * @param {number|null} [year] nur dieses Steuerjahr, sonst alle Dokumente
 * @returns {{ year: number|null, byCategory: object[], byDocType: object[], total: object,
 *   open: number, checked: number, ignored: number }}
 */
export function summarize(docs, year = null) {
  const scope = year != null ? docs.filter((d) => Number(d.year) === Number(year)) : docs;
  const exportable = scope.filter(isExportable);
  const catKey = (d) => categoryOf(d.category)?.key;
  const typeKey = (d) => docTypeOf(d.docType)?.key;

  const byCategory = CATEGORIES.map((c) => ({
    key: c.key,
    nr: c.nr,
    label: c.label,
    anlage: c.anlage,
    ...aggregate(exportable.filter((d) => catKey(d) === c.key)),
  }));

  const byDocType = DOC_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    category: t.category,
    ...aggregate(exportable.filter((d) => typeKey(d) === t.key)),
  })).filter((t) => t.count > 0);

  const total = aggregate(exportable);
  return {
    year: year ?? null,
    byCategory,
    byDocType,
    total,
    open: total.open,
    checked: total.checked,
    ignored: scope.filter((d) => !d.sample && d.status === 'ignoriert').length,
  };
}

// --- CSV ------------------------------------------------------------------------

/**
 * CSV mit ';', UTF-8-BOM, Dezimalkomma, Datum TT.MM.JJJJ, Zeilenende CRLF.
 * Spalten wie Blatt 'Belege' (inkl. aller vorkommenden Feld-Keys).
 * @param {object[]} docs
 * @returns {string}
 */
export function buildCsv(docs) {
  const keys = fieldKeysOf(docs);
  const lines = [[...BASE_HEADERS, ...keys]];
  for (const doc of sortForExport(docs)) {
    const b = baseFields(doc);
    lines.push([
      b.year ?? '', b.category, b.docType, formatDateDE(b.date), formatMoneyDE(b.amount),
      b.issuer, b.title, b.status, b.newName, b.folder, b.original, b.flags, b.note,
      ...keys.map((k) => formatPlainDE(fieldValue(doc, k))),
    ]);
  }
  return `﻿${lines.map((l) => l.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

// --- XLSX -----------------------------------------------------------------------

function columnWidths(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, c) => {
      let len;
      if (cell && typeof cell === 'object') len = cell.z ? 12 : String(cell.v ?? '').length;
      else len = String(cell ?? '').length;
      widths[c] = Math.min(50, Math.max(widths[c] ?? 6, len + 2));
    });
  }
  return widths.map((wch) => ({ wch }));
}

function sheetOf(X, rows, { autofilter = false } = {}) {
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = columnWidths(rows);
  const width = Math.max(...rows.map((r) => r.length));
  if (autofilter && rows.length > 1) {
    ws['!autofilter'] = {
      ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: width - 1 } }),
    };
  }
  return ws;
}

/** Excel-Blattnamen: max. 31 Zeichen, ohne []:*?/\ , eindeutig. */
function sheetName(raw, used) {
  const base = String(raw).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Blatt';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function overviewRows(summary, year, limitYear) {
  const catLabel = (key) => categoryOf(key)?.label ?? key;
  const rows = [
    [`Belegwerk-Übersicht${year != null ? ` ${year}` : ''}`],
    [`Stand: ${new Date().toISOString().slice(0, 10).split('-').reverse().join('.')}`],
    [`Belege: ${summary.total.count} · offen: ${summary.open} · geprüft: ${summary.checked} · ignoriert: ${summary.ignored}`],
    [],
    ['Kategorie', 'Anlage', 'Anzahl', 'Summe', 'davon geprüft'],
    ...summary.byCategory.map((c) => [c.label, c.anlage, c.count, moneyCell(c.sum), c.checked]),
    ['Gesamt', '', summary.total.count, moneyCell(summary.total.sum), summary.total.checked],
    [],
    ['Belegart', 'Kategorie', 'Anzahl', 'Summe', 'davon geprüft'],
    ...summary.byDocType.map((t) => [t.label, catLabel(t.category), t.count, moneyCell(t.sum), t.checked]),
  ];
  const limits = limitYear != null ? LIMITS[limitYear] : null;
  if (limits) {
    rows.push([], [`Hinweise auf Limits (${limitYear})`], ['Limit', 'Wert', 'Hinweis']);
    for (const [key, entry] of Object.entries(limits)) {
      const value = typeof entry?.value === 'number' ? moneyCell(entry.value) : (entry?.value ?? '');
      rows.push([entry?.label ?? key, value, entry?.unsicher ? 'unsicher, bitte prüfen' : '']);
    }
  }
  return rows;
}

/**
 * Excel-Datei: Blatt 'Übersicht' (Summen je Kategorie und Belegart, Limits), 'Belege'
 * (alle Spalten, Beträge als Zahl, Datum als Datum) und je Kategorie mit Belegen ein Blatt.
 * Beispiel- und ignorierte Belege werden nicht gefiltert: das entscheidet der Aufrufer.
 * @param {object[]} docs
 * @param {{ year?: number|null }} [options] nur dieses Steuerjahr
 * @returns {Blob}
 */
export function buildXlsx(docs, { year = null } = {}) {
  const X = requireGlobal('XLSX');
  const scoped = sortForExport(year != null ? docs.filter((d) => Number(d.year) === Number(year)) : docs);
  const keys = fieldKeysOf(scoped);
  const summary = summarize(scoped);
  const years = [...new Set(scoped.map((d) => d.year).filter((y) => y != null))];
  const limitYear = year ?? (years.length === 1 ? years[0] : null);
  const belegeRows = (list) => [[...BASE_HEADERS, ...keys], ...list.map((d) => xlsxRow(d, keys))];

  const wb = X.utils.book_new();
  wb.Props = { Title: 'Belegwerk-Übersicht', Author: 'Belegwerk' };
  X.utils.book_append_sheet(wb, sheetOf(X, overviewRows(summary, year, limitYear)), 'Übersicht');
  X.utils.book_append_sheet(wb, sheetOf(X, belegeRows(scoped), { autofilter: true }), 'Belege');

  const used = new Set(['übersicht', 'belege']);
  for (const cat of CATEGORIES) {
    const list = scoped.filter((d) => categoryOf(d.category)?.key === cat.key);
    if (!list.length) continue;
    X.utils.book_append_sheet(
      wb,
      sheetOf(X, belegeRows(list), { autofilter: true }),
      sheetName(`${cat.nr} ${cat.label}`, used),
    );
  }

  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: XLSX_MIME });
}

// --- ZIP ------------------------------------------------------------------------

/**
 * ZIP mit Struktur <Jahr>/<NN Kategorie>/<Dateiname>, dazu Uebersicht (xlsx + csv) im Root.
 * Beispiel- und ignorierte Belege sind ausgenommen. Kollisionen erhalten ' (2)'.
 * @param {object[]} docs
 * @param {(id: string) => Promise<Blob|null>} getBlob
 * @param {{ includeSummary?: boolean, onProgress?: (fraction: number, label: string) => void }} [options]
 * @returns {Promise<Blob>}
 */
export async function buildZip(docs, getBlob, { includeSummary = true, onProgress } = {}) {
  const JSZip = requireGlobal('JSZip');
  const list = sortForExport(docs.filter(isExportable));
  const zip = new JSZip();
  const used = new Set();

  for (let i = 0; i < list.length; i++) {
    const doc = list[i];
    const blob = await getBlob(doc.id);
    if (blob) {
      zip.file(uniquePath(`${buildPath(doc)}/${buildFilename(doc)}`, used), await toBytes(blob));
    } else {
      throw new Error('Ein Original fehlt. Der Export wurde nicht erstellt; bitte den betroffenen Beleg erneut hinzufügen.');
    }
    onProgress?.(((i + 1) / (list.length || 1)) * 0.5, doc.file?.name ?? '');
  }

  if (includeSummary) {
    zip.file(SUMMARY_XLSX, await toBytes(buildXlsx(list)));
    zip.file(SUMMARY_CSV, buildCsv(list));
  }

  const out = await zip.generateAsync(
    { type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => onProgress?.(0.5 + (meta.percent / 100) * 0.5, meta.currentFile ?? ''),
  );
  return out;
}

// --- Sicherung ----------------------------------------------------------------------

/**
 * Sicherung als ZIP: belegwerk-backup.json (Dokumente und Einstellungen), files/<id>.<ext>,
 * optional thumbs/<id>.jpg (wenn getThumb uebergeben wird).
 * @param {object[]} docs
 * @param {(id: string) => Promise<Blob|null>} getBlob
 * @param {object} settings
 * @param {{ getThumb?: (id: string) => Promise<Blob|null> }} [options]
 * @returns {Promise<Blob>}
 */
export async function buildBackup(docs, getBlob, settings = {}, { getThumb = null } = {}) {
  const JSZip = requireGlobal('JSZip');
  const zip = new JSZip();
  zip.file(BACKUP_JSON, JSON.stringify({
    app: 'belegwerk',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    docs,
  }, null, 2));

  for (const doc of docs) {
    const blob = await getBlob(doc.id);
    if (blob) {
      zip.file(`files/${doc.id}.${extOf(doc)}`, await toBytes(blob));
    } else {
      throw new Error('Ein Original fehlt. Es wurde keine unvollständige Sicherung erstellt; bitte den betroffenen Beleg erneut hinzufügen.');
    }
    if (getThumb) {
      const thumb = await getThumb(doc.id);
      if (thumb) zip.file(`thumbs/${doc.id}.jpg`, await toBytes(thumb));
    }
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
}

/** Dateiname ohne Erweiterung = Dokument-id. */
function idFromEntryName(name) {
  return name.split('/').pop().replace(/\.[^.]*$/, '');
}

/**
 * Liest eine Sicherung (siehe buildBackup).
 * @param {Blob} blob
 * @returns {Promise<{ docs: object[], blobs: Map<string, Blob>, thumbs: Map<string, Blob>, settings: object, exportedAt: string|null }>}
 */
export async function restoreBackup(blob) {
  const JSZip = requireGlobal('JSZip');
  const zip = await JSZip.loadAsync(await toBytes(blob));
  const jsonEntry = zip.file(BACKUP_JSON);
  if (!jsonEntry) throw new Error('Keine Belegwerk-Sicherung: belegwerk-backup.json fehlt.');

  const meta = JSON.parse(await jsonEntry.async('string'));
  if (meta?.app !== 'belegwerk') throw new Error('Die Datei gehört nicht zu Belegwerk.');
  if (meta.version !== BACKUP_VERSION) {
    throw new Error(`Sicherungsversion ${meta.version} wird nicht unterstützt.`);
  }
  if (!Array.isArray(meta.docs)) throw new Error('Die Sicherung enthält keine Dokumentliste.');

  const docs = meta.docs.filter((d) => d && typeof d.id === 'string');
  const mimeById = new Map(docs.map((d) => [d.id, d.file?.mime ?? '']));
  const blobs = new Map();
  const thumbs = new Map();

  for (const entry of zip.file(/^files\/[^/]+$/)) {
    const id = idFromEntryName(entry.name);
    blobs.set(id, new Blob([await entry.async('uint8array')], { type: mimeById.get(id) ?? '' }));
  }
  for (const entry of zip.file(/^thumbs\/[^/]+$/)) {
    const id = idFromEntryName(entry.name);
    thumbs.set(id, new Blob([await entry.async('uint8array')], { type: 'image/jpeg' }));
  }

  return {
    docs,
    blobs,
    thumbs,
    settings: meta.settings ?? {},
    exportedAt: meta.exportedAt ?? null,
  };
}

// --- Ordner-Export ------------------------------------------------------------------

/** Unterordner rekursiv anlegen (Cache je Pfad). */
async function ensureDir(root, path, cache) {
  let parent = root;
  let key = '';
  for (const segment of path.split('/').filter(Boolean)) {
    key = key ? `${key}/${segment}` : segment;
    let next = cache.get(key);
    if (!next) {
      next = await parent.getDirectoryHandle(segment, { create: true });
      cache.set(key, next);
    }
    parent = next;
  }
  return parent;
}

async function fileExists(dir, name) {
  try {
    await dir.getFileHandle(name, { create: false });
    return true;
  } catch (err) {
    if (err?.name === 'NotFoundError') return false;
    throw err;
  }
}

/** 'Name.pdf' -> 'Name (2).pdf', ... bis ein freier Name gefunden ist. */
async function freeFileName(dir, name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let i = 2; await fileExists(dir, candidate); i++) {
    candidate = `${base} (${i})${ext}`;
  }
  return candidate;
}

/**
 * Schreibt die Belege in einen Ordner (File System Access API), Struktur wie buildZip.
 * Ueberschreibt nie: existiert der Name, wird ' (2)' angehaengt.
 * Beispiel- und ignorierte Belege sind ausgenommen.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {object[]} docs
 * @param {(id: string) => Promise<Blob|null>} getBlob
 * @param {{ onProgress?: (fraction: number, label: string) => void }} [options]
 * @returns {Promise<{ written: number, skipped: number }>}
 */
export async function writeToFolder(dirHandle, docs, getBlob, { onProgress } = {}) {
  const list = sortForExport(docs.filter(isExportable));
  const dirs = new Map();
  let written = 0;
  let skipped = 0;

  for (let i = 0; i < list.length; i++) {
    const doc = list[i];
    const label = doc.file?.name ?? doc.id;
    const blob = await getBlob(doc.id);
    if (!blob) {
      skipped++;
      console.warn('Belegwerk: Ein Original fehlt bei der Ordnerablage.');
    } else {
      const folder = await ensureDir(dirHandle, buildPath(doc), dirs);
      const name = await freeFileName(folder, buildFilename(doc));
      const fh = await folder.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        await writable.abort?.().catch(() => {});
        throw err;
      }
      written++;
    }
    onProgress?.((i + 1) / (list.length || 1), label);
  }

  return { written, skipped };
}
