// Suche & Query-Parser fuer Belegwerk. MiniSearch wird als window.MiniSearch erwartet.
import { CATEGORIES, DOC_TYPES, categoryOf, docTypeOf } from './taxonomy.js';
import { buildFilename, buildPath } from './analyze.js';

/** Token: Buchstaben, Ziffern, Diakritika-Marks; Komma nur zwischen Ziffern (249,00 bleibt ein Token). */
const TOKEN_RE = /(?:[\p{L}\p{M}\p{N}]|(?<=\p{N}),(?=\p{N}))+/gu;
const SNIPPET_CONTEXT = 70;
const SNIPPET_MAX = 140;
const STATUS_VALUES = ['offen', 'geprueft', 'ignoriert'];
const SOURCE_VALUES = ['datei', 'ordner', 'zip', 'email'];
const SEARCH_FIELDS = ['title', 'issuer', 'typeLabel', 'categoryLabel', 'text', 'tags', 'note', 'fileName', 'amount', 'date'];
const FIELD_BOOST = { title: 3, issuer: 3, typeLabel: 2, fileName: 2 };
const FILTER_RE = /^(\p{L}+)(>=|<=|>|<|:)(.+)$/u;

/** @param {unknown} s @returns {string} HTML-sicher fuer Text- und Attributkontext. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/**
 * Normalisiert fuer Index und Suche: NFC, lowercase, ä→ae ö→oe ü→ue ß→ss,
 * danach Diakritika entfernen, Whitespace zusammenfassen.
 * @param {unknown} s @returns {string}
 */
export function normalizeTerm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Zerlegt Text in Tokens (Originalzeichen). Trennt u. a. an Bindestrich, Punkt, Schraegstrich. */
function tokenize(text) {
  return String(text ?? '').match(TOKEN_RE) ?? [];
}

/** Parst Belegwerk-Suchsyntax.
 * @param {string} q
 * @returns {{ text: string, phrases: string[], filters: object }}
 */
export function parseQuery(q) {
  const filters = {
    year: null, category: null, docType: null, status: null,
    minAmount: null, maxAmount: null, minExclusive: false, maxExclusive: false,
    from: null, to: null, tags: [], flag: null, source: null,
  };
  const phrases = [];
  const withoutPhrases = String(q ?? '').replace(/"([^"]*)"/g, (_, phrase) => {
    const p = phrase.trim();
    if (p) phrases.push(p);
    return ' ';
  });
  const words = [];
  for (const raw of withoutPhrases.split(/\s+/)) {
    if (!raw) continue;
    if (!applyToken(raw, filters)) words.push(raw);
  }
  return { text: words.join(' '), phrases, filters };
}

/** Wendet ein Filter-Token an. @returns {boolean} true, wenn es ein gueltiger Filter war. */
function applyToken(raw, filters) {
  const tag = raw.match(/^#(.+)$/);
  if (tag) {
    filters.tags.push(tag[1]);
    return true;
  }
  const m = raw.match(FILTER_RE);
  if (!m) return false;
  const key = normalizeTerm(m[1]);
  const op = m[2];
  const val = m[3];

  switch (key) {
    case 'jahr':
      if (op === ':' && /^\d{4}$/.test(val)) {
        filters.year = Number(val);
        return true;
      }
      return false;
    case 'kat':
      if (op !== ':') return false;
      filters.category = val;
      return true;
    case 'typ':
      if (op !== ':') return false;
      filters.docType = val;
      return true;
    case 'status': {
      const canon = normalizeTerm(val);
      if (op !== ':' || !STATUS_VALUES.includes(canon)) return false;
      filters.status = canon;
      return true;
    }
    case 'betrag':
      return applyAmount(op, val, filters);
    case 'von':
    case 'bis': {
      if (op !== ':') return false;
      const day = parseDateValue(val, key === 'von' ? 'start' : 'end');
      if (!day) return false;
      if (key === 'von') filters.from = day;
      else filters.to = day;
      return true;
    }
    case 'flag':
      if (op !== ':') return false;
      filters.flag = val.toLowerCase();
      return true;
    case 'quelle':
    case 'source': {
      const canon = normalizeTerm(val);
      if (op !== ':' || !SOURCE_VALUES.includes(canon)) return false;
      filters.source = canon;
      return true;
    }
    default:
      return false;
  }
}

/** betrag>100, betrag>=100, betrag<50, betrag<=50, betrag:100-200, betrag:100, betrag:100- */
function applyAmount(op, val, filters) {
  if (op === '>' || op === '>=') {
    const n = parseNumber(val);
    if (n === null) return false;
    filters.minAmount = n;
    filters.minExclusive = op === '>';
    return true;
  }
  if (op === '<' || op === '<=') {
    const n = parseNumber(val);
    if (n === null) return false;
    filters.maxAmount = n;
    filters.maxExclusive = op === '<';
    return true;
  }
  if (op === ':') {
    const parts = val.split('-');
    if (parts.length === 1) {
      const n = parseNumber(val);
      if (n === null) return false;
      filters.minAmount = n;
      filters.maxAmount = n;
      return true;
    }
    if (parts.length !== 2) return false;
    const lo = parts[0] ? parseNumber(parts[0]) : null;
    const hi = parts[1] ? parseNumber(parts[1]) : null;
    if ((parts[0] && lo === null) || (parts[1] && hi === null) || (lo === null && hi === null)) return false;
    filters.minAmount = lo;
    filters.maxAmount = hi;
    return true;
  }
  return false;
}

/** '249,00' | '1.234,56' | '249.00' | '1000' -> Zahl, sonst null. */
function parseNumber(s) {
  const t = String(s ?? '').trim();
  let norm;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+([.,]\d+)?$/.test(t)) norm = t.replace(',', '.');
  else return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Datumsfilter -> 'YYYY-MM-DD'. 'start' = frueheste, 'end' = spaeteste Zeit des Zeitraums.
 * Akzeptiert YYYY, YYYY-MM, YYYY-MM-DD, DD.MM.YYYY.
 */
function parseDateValue(val, edge) {
  let y;
  let m;
  let d;
  let mm;
  let match;
  if ((match = val.match(/^(\d{4})$/))) {
    y = Number(match[1]);
    return edge === 'start' ? isoDay(y, 1, 1) : isoDay(y, 12, 31);
  }
  if ((match = val.match(/^(\d{4})-(\d{1,2})$/))) {
    y = Number(match[1]);
    m = Number(match[2]);
    if (m < 1 || m > 12) return null;
    return edge === 'start' ? isoDay(y, m, 1) : isoDay(y, m, lastDayOfMonth(y, m));
  }
  if ((match = val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return isoDay(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if ((match = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) {
    d = Number(match[1]);
    mm = Number(match[2]);
    y = Number(match[3]);
    return isoDay(y, mm, d);
  }
  return null;
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Prueft, ob (y, m, d) ein gueltiges Datum ist, und liefert 'YYYY-MM-DD' oder null. */
function isoDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Filterwert matcht Eintraege, deren key gleich ist oder deren normalisiertes Label mit dem Wert beginnt. */
function matchingKeys(list, value) {
  const v = normalizeTerm(value);
  const keys = new Set();
  for (const entry of list) {
    if (entry.key === value || entry.key === v || normalizeTerm(entry.label).startsWith(v)) {
      keys.add(entry.key);
    }
  }
  return keys;
}

/** Prueft ein Dokument gegen die Filter aus parseQuery().filters. */
export function matchFilters(doc, filters) {
  if (!filters) return true;
  if (filters.year != null && Number(doc.year) !== Number(filters.year)) return false;
  if (filters.category && !matchingKeys(CATEGORIES, filters.category).has(doc.category)) return false;
  if (filters.docType && !matchingKeys(DOC_TYPES, filters.docType).has(doc.docType)) return false;
  if (filters.status && doc.status !== filters.status) return false;

  if (filters.minAmount != null) {
    const a = typeof doc.amount === 'number' ? doc.amount : null;
    if (a === null) return false;
    if (filters.minExclusive ? !(a > filters.minAmount) : !(a >= filters.minAmount)) return false;
  }
  if (filters.maxAmount != null) {
    const a = typeof doc.amount === 'number' ? doc.amount : null;
    if (a === null) return false;
    if (filters.maxExclusive ? !(a < filters.maxAmount) : !(a <= filters.maxAmount)) return false;
  }
  if (filters.from && !(doc.date && doc.date >= filters.from)) return false;
  if (filters.to && !(doc.date && doc.date <= filters.to)) return false;

  if (filters.tags?.length) {
    const have = new Set((doc.tags ?? []).map(normalizeTerm));
    if (!filters.tags.every((t) => have.has(normalizeTerm(t)))) return false;
  }
  if (filters.flag && !(doc.flags ?? []).includes(filters.flag)) return false;
  if (filters.source && doc.source?.kind !== filters.source) return false;
  return true;
}

/** Ein Dokument fuer den Index: nur die durchsuchbaren Felder. */
function indexedFields(doc) {
  const str = (v) => String(v ?? '');
  return {
    id: doc.id,
    title: str(doc.title),
    issuer: str(doc.issuer),
    typeLabel: docTypeOf(doc.docType)?.label ?? '',
    categoryLabel: categoryOf(doc.category)?.label ?? '',
    text: str(doc.text),
    tags: (doc.tags ?? []).map(str).join(' '),
    note: str(doc.note),
    fileName: [doc.file?.name, doc.file?.path, buildFilename(doc), buildPath(doc), doc.cloud?.path].filter(Boolean).join(' '),
    amount: typeof doc.amount === 'number' ? [doc.amount.toFixed(2), doc.amount.toFixed(2).replace('.', ','), doc.currency || 'EUR'].join(' ') : '',
    date: [doc.date, doc.year, doc.date?.split('-').reverse().join('.')].filter(Boolean).join(' '),
  };
}

/**
 * Erzeugt einen Suchindex ueber window.MiniSearch.
 * @returns {{ addAll(docs), upsert(doc), remove(id), search(q, {limit}), suggest(prefix) }}
 */
export function createIndex() {
  const MS = globalThis.MiniSearch;
  if (!MS) throw new Error('MiniSearch ist nicht geladen (window.MiniSearch fehlt)');

  const ms = new MS({
    fields: SEARCH_FIELDS,
    storeFields: [],
    idField: 'id',
    tokenize,
    processTerm: normalizeTerm,
    searchOptions: {
      prefix: (term) => /\p{L}/u.test(term),
      fuzzy: (term) => /\p{L}/u.test(term) ? 0.2 : false,
      combineWith: 'AND',
      boost: FIELD_BOOST,
    },
  });

  /** id -> Dokument (fuer Filter und Snippets). */
  const records = new Map();
  /** normalisierter Term -> Schreibweise aus den Kurzfeldern (fuer Vorschlaege). */
  const surface = new Map();

  function learn(doc) {
    const short = [doc.title, doc.issuer, docTypeOf(doc.docType)?.label, categoryOf(doc.category)?.label, ...(doc.tags ?? [])];
    for (const value of short) {
      for (const token of tokenize(value)) {
        const n = normalizeTerm(token);
        if (n && !surface.has(n)) surface.set(n, token);
      }
    }
  }

  function removeFromIndex(id) {
    if (ms.has(id)) ms.discard(id);
  }

  return {
    /** Ersetzt bestehende Eintraege mit gleicher id. */
    addAll(docs) {
      const byId = new Map();
      for (const doc of docs) byId.set(doc.id, doc);
      const batch = [];
      for (const doc of byId.values()) {
        removeFromIndex(doc.id);
        records.set(doc.id, doc);
        learn(doc);
        batch.push(indexedFields(doc));
      }
      if (batch.length) ms.addAll(batch);
    },

    upsert(doc) {
      removeFromIndex(doc.id);
      records.set(doc.id, doc);
      learn(doc);
      ms.add(indexedFields(doc));
    },

    remove(id) {
      removeFromIndex(id);
      records.delete(id);
    },

    /**
     * Freitext (MiniSearch, AND, Praefix, Fuzzy) plus Filter und "exakte Phrasen".
     * Ohne Freitext: alle Dokumente, die den Filtern genuegen (score 0), neueste zuerst.
     * @returns {{ id: string, score: number, snippet: string }[]}
     */
    search(q, { limit = 50 } = {}) {
      const { text, phrases, filters } = parseQuery(q);
      const qTerms = tokenize(text).map(normalizeTerm).filter(Boolean);
      const phraseTerms = phrases.flatMap((p) => tokenize(p).map(normalizeTerm)).filter(Boolean);

      let hits;
      if (text.trim()) {
        hits = ms.search(text).map((r) => ({ id: r.id, score: r.score, matched: new Set(r.terms) }));
      } else {
        hits = [...records.keys()].map((id) => ({ id, score: 0, matched: new Set() }));
        hits.sort((a, b) => String(records.get(b.id)?.date ?? '').localeCompare(String(records.get(a.id)?.date ?? '')));
      }

      const kept = [];
      for (const hit of hits) {
        const doc = records.get(hit.id);
        if (!doc || !matchFilters(doc, filters)) continue;
        if (phrases.length) {
          const haystack = normalizeTerm([doc.title, doc.issuer, doc.note, doc.text, doc.file?.name, doc.file?.path, buildFilename(doc), ...(doc.tags ?? [])].join(' '));
          if (!phrases.every((p) => haystack.includes(normalizeTerm(p)))) continue;
        }
        kept.push(hit);
        if (kept.length >= limit) break;
      }

      const allTerms = [...qTerms, ...phraseTerms];
      return kept.map((hit) => ({
        id: hit.id,
        score: hit.score,
        snippet: buildSnippet(records.get(hit.id), allTerms, hit.matched),
      }));
    },

    /**
     * Vorschlaege fuer die Eingabe: letzter Begriff wird per MiniSearch autoSuggest vervollstaendigt.
     * Vorschlaege stehen in Originalschreibweise, vorangehende Begriffe bleiben erhalten. Max. 6.
     */
    suggest(prefix) {
      const words = tokenize(parseQuery(prefix).text);
      if (!words.length) return [];
      const last = normalizeTerm(words[words.length - 1]);
      const head = words.slice(0, -1).join(' ');
      const out = [];
      const seen = new Set();
      for (const s of ms.autoSuggest(last)) {
        for (const term of s.suggestion.split(' ')) {
          const shown = surface.get(term);
          if (!shown || !term.startsWith(last)) continue;
          const phrase = head ? `${head} ${shown}` : shown;
          const key = normalizeTerm(phrase);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(phrase);
          if (out.length >= 6) return out;
        }
      }
      return out;
    },
  };
}

/**
 * Snippet: Ausschnitt um den ersten Treffer (±70 Zeichen). Erst escapen, dann Treffer mit <mark> umschliessen.
 * Die Trefferpruefung ist normalisiert, angezeigt werden die Originalzeichen.
 */
function buildSnippet(doc, qTerms, matched) {
  if (!doc) return '';
  const isHit = (norm) => matched.has(norm) || qTerms.some((q) => norm.startsWith(q));
  const sources = [
    doc.text,
    doc.note,
    [doc.title, doc.issuer, doc.file?.name].filter(Boolean).join(' · '),
  ].map((s) => String(s ?? '').trim()).filter(Boolean);
  if (!sources.length) return '';

  const src = sources.find((s) => tokenize(s).some((t) => isHit(normalizeTerm(t)))) ?? sources[0];
  return snippetFrom(src, isHit);
}

function snippetFrom(src, isHit) {
  const tokens = [...src.matchAll(TOKEN_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    text: m[0],
    hit: isHit(normalizeTerm(m[0])),
  }));
  const first = tokens.find((t) => t.hit);
  const center = first ? first.start : 0;
  const centerEnd = first ? first.end : Math.min(src.length, SNIPPET_MAX);

  let from = Math.max(0, center - SNIPPET_CONTEXT);
  let to = Math.min(src.length, centerEnd + SNIPPET_CONTEXT);
  if (!first) to = Math.min(src.length, SNIPPET_MAX);

  // Auf Wortgrenzen schneiden, ohne den Treffer abzuschneiden.
  if (from > 0) {
    const sp = src.slice(from, center).search(/\s/);
    if (sp !== -1) from += sp + 1;
  }
  if (to < src.length) {
    const sp = src.slice(centerEnd, to).search(/\s\S*$/);
    if (sp !== -1) to = centerEnd + sp;
  }

  let body = '';
  let cursor = from;
  for (const t of tokens) {
    if (t.start < from || t.end > to) continue;
    if (t.start > cursor) body += escapeHtml(src.slice(cursor, t.start).replace(/\s+/g, ' '));
    body += t.hit ? `<mark>${escapeHtml(t.text)}</mark>` : escapeHtml(t.text);
    cursor = t.end;
  }
  if (cursor < to) body += escapeHtml(src.slice(cursor, to).replace(/\s+/g, ' '));

  const prefix = from > 0 ? '… ' : '';
  const suffix = to < src.length ? ' …' : '';
  return `${prefix}${body.trim()}${suffix}`;
}
