// Belegwerk – Analyse: Klassifizierung, Feldextraktion, Dateinamen. Rein (kein DOM), Node-tauglich.
import { DOC_TYPES, LIMITS, categoryOf, docTypeOf } from './taxonomy.js';

// ================================================================================================
// Normalisierung & Basis-Parser
// ================================================================================================

/**
 * Normalisiert Text für den Abgleich: lowercase, ä→ae, ö→oe, ü→ue, ß→ss, Whitespace verdichtet
 * (Zeilenumbrüche bleiben als einzelne \n erhalten).
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (text == null) return '';
  let s = String(text).normalize('NFKC');
  s = s.replace(/[​-‍﻿­]/g, '');
  s = s.toLowerCase();
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  s = s.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
  s = s.replace(/[  -   　\t\f\v]+/g, ' ');
  s = s.replace(/ {2,}/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Faltet ae/oe/ue zu a/o/u, damit OCR-Texte ohne Umlaute-Punkte gleich matchen. */
const fold = (s) => s.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
/** Regex aus Quelltext mit normalisierter Schreibweise (wird gefaltet). */
const R = (src, flags = '') => new RegExp(fold(src), flags);

const NOW = () => Date.now();

/** OCR-Korrektur in Zahlen/Datumsangaben: l/I/| → 1, O → 0 zwischen Ziffern und Trennzeichen. */
const fixCache = new Map();
function fixOcrDigits(s) {
  let r = fixCache.get(s);
  if (r !== undefined) return r;
  r = fixOcrRaw(s);
  if (fixCache.size > 4000) fixCache.clear();
  fixCache.set(s, r);
  return r;
}
function fixOcrRaw(s) {
  return s
    .replace(/(?<=[\d.,\/])[lI|](?=[\d.,\/])/g, '1')
    .replace(/(?<=\d)[lI|](?![a-zA-Z])/g, '1')
    .replace(/(?<![a-zA-Z])[lI|](?=\d)/g, '1')
    .replace(/(?<=[\d.,\/])[Oo](?=[\d.,\/])/g, '0')
    .replace(/(?<=\d)[Oo](?![a-zA-Z])/g, '0')
    .replace(/(?<![a-zA-Z])[Oo](?=\d)/g, '0');
}

/**
 * Wandelt einen Betrags-String in eine Zahl (deutsch und englisch, Tausenderpunkte, Vorzeichen).
 * @param {string|number} input z. B. '1.234,56 €', '$1,234.56', '-12,50', '(45,00)'
 * @returns {number|null}
 */
export function parseMoney(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[−–—]/g, '-');
  if (/^\s*-/.test(s) || /\d\s*-\s*(?:€|eur|euro)?\s*$/i.test(s)) neg = true;
  s = s.replace(/€|euro?\b|usd|chf|gbp|[$£]/gi, '');
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  let decIdx = -1;
  if (lc >= 0 && ld >= 0) decIdx = Math.max(lc, ld);
  else if (lc >= 0 || ld >= 0) {
    const idx = Math.max(lc, ld);
    const sep = s[idx];
    const count = s.split(sep).length - 1;
    const after = s.length - idx - 1;
    const before = s.slice(0, idx);
    if (count > 1) decIdx = -1;
    else if (after === 3 && /^[1-9]\d{0,2}$/.test(before)) decIdx = -1;
    else decIdx = idx;
  }
  let v;
  if (decIdx >= 0) {
    const ip = s.slice(0, decIdx).replace(/[.,]/g, '') || '0';
    const fp = s.slice(decIdx + 1).replace(/[.,]/g, '');
    v = Number(`${ip}.${fp || '0'}`);
  } else {
    v = Number(s.replace(/[.,]/g, ''));
  }
  if (!Number.isFinite(v)) return null;
  v = Math.round(v * 100) / 100;
  return neg ? -v : v;
}

const MONTHS = {
  januar: 1, jan: 1, january: 1, februar: 2, feb: 2, february: 2, maerz: 3, marz: 3, mrz: 3, mar: 3, march: 3,
  april: 4, apr: 4, mai: 5, may: 5, juni: 6, jun: 6, june: 6, juli: 7, jul: 7, july: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11,
  dezember: 12, dez: 12, dec: 12, december: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const pad = (n) => String(n).padStart(2, '0');
function validISO(y, m, d) {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const fullYear = (yy) => (yy.length === 4 ? Number(yy) : Number(yy) <= 69 ? 2000 + Number(yy) : 1900 + Number(yy));

const DATE_PATTERNS = [
  // 14.03.2025, 14.3.25, 14 . 03 . 2025, 14/03/2025
  { re: /(?<![\d.\/])(\d{1,2})\s?[.\/]\s?(\d{1,2})\s?[.\/]\s?(\d{4}|\d{2})(?![\d])/g, f: (m) => validISO(fullYear(m[3]), +m[2], +m[1]) },
  // 14-03-2025
  { re: /(?<![\d-])(\d{1,2})-(\d{1,2})-(\d{4})(?![\d])/g, f: (m) => validISO(+m[3], +m[2], +m[1]) },
  // 2025-03-14, 2025/03/14, 2025.03.14
  { re: /(?<![\d])(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?![\d])/g, f: (m) => validISO(+m[1], +m[2], +m[3]) },
  // 14. März 2025, 14 Mar 2025, 14.maerz.2025
  { re: new RegExp(`(?<![\\d])(\\d{1,2})\\.?\\s?(?:ten|te|ter)?\\s?(${MONTH_RE})\\.?,?\\s?(\\d{4})(?![\\d])`, 'g'), f: (m) => validISO(+m[3], MONTHS[m[2]], +m[1]) },
  // March 14, 2025
  { re: new RegExp(`(?<![a-z])(${MONTH_RE})\\.?\\s(\\d{1,2})(?:st|nd|rd|th)?,?\\s(\\d{4})(?![\\d])`, 'g'), f: (m) => validISO(+m[3], MONTHS[m[1]], +m[2]) },
];

/**
 * Findet alle Datumsangaben in einer (bereits normalisierten) Zeile.
 * @returns {{iso:string,index:number,end:number}[]}
 */
function findDates(line) {
  const out = [];
  const taken = [];
  for (const p of DATE_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line))) {
      const s = m.index, e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      const iso = p.f(m);
      if (iso) { out.push({ iso, index: s, end: e }); taken.push([s, e]); }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Wandelt ein Datum aus Text in ISO (YYYY-MM-DD).
 * @param {string} input z. B. '14.03.2025', '14. März 2025', '2025-03-14', '14.03.25'
 * @returns {string|null}
 */
export function parseDate(input) {
  if (input == null) return null;
  const n = fixOcrDigits(normalizeText(String(input)));
  const d = findDates(n);
  return d.length ? d[0].iso : null;
}

/**
 * Macht aus beliebigem Text einen sicheren Dateinamen-Teil: verbotene Zeichen entfernt,
 * Leerzeichen → '-', gekürzt auf max Zeichen.
 * @param {string} s
 * @param {number} [max=40]
 * @returns {string}
 */
export function sanitizeName(s, max = 40) {
  if (s == null) return '';
  let t = String(s)
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '')
    .replace(/[,;]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.\s_]+|[-.\s_]+$/g, '');
  if (t.length > max) t = t.slice(0, max).replace(/[-.\s_]+$/g, '');
  return t;
}

// ================================================================================================
// Geld-Tokens
// ================================================================================================

const blank = (line, re) => line.replace(re, (m) => ' '.repeat(m.length));
const IBAN_RE = /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){3,7}(?:\s?[a-z0-9]{1,4})?\b/gi;
const DATE_ANY = /(?<![\d.\/])\d{1,2}\s?[.\/]\s?\d{1,2}\s?[.\/]\s?(?:\d{4}|\d{2})(?!\d)|\b\d{4}-\d{2}-\d{2}\b/g;
const PHONE_LINE = /\b(?:tel|fax|telefon|mobil|handy|durchwahl|hotline|ruf)\b/;
const MONEY_RE = /(?<![\w.,])(-\s?|−\s?)?(\d{1,3}(?:\.\d{3})+,-+|\d+,-+|\d{1,3}(?: \d{3})+,\d{2}|\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+,\d{1,2}|\d+\.\d{2}|\d{1,3}(?:\.\d{3})+|\d+)(\s?-(?![\w\d]))?(?![\d]|[,.]\d)/g;
const UNIT_AFTER = /^\s*(?:%|km\b|kg\b|stk\b|stueck\b|st\.|x\b|qm\b|m2\b|m²|kwh\b|mwh\b|std\b|h\b|tage\b|tagen\b|prozent|ct\b|mal\b)/;

/**
 * Extrahiert Geldbeträge einer normalisierten Zeile.
 * @returns {{value:number,index:number,end:number,cur:boolean,dec:boolean}[]}
 */
const moneyCache = new Map();
function moneyTokens(line) {
  let hit = moneyCache.get(line);
  if (hit) return hit;
  hit = moneyTokensRaw(line);
  if (moneyCache.size > 4000) moneyCache.clear();
  moneyCache.set(line, hit);
  return hit;
}
function moneyTokensRaw(line) {
  let l = fixOcrDigits(line);
  l = blank(l, IBAN_RE);
  l = blank(l, DATE_ANY);
  if (PHONE_LINE.test(l)) l = blank(l, /(?:\+|00)?\d[\d\s\/()-]{6,}\d/g);
  const out = [];
  MONEY_RE.lastIndex = 0;
  let m;
  while ((m = MONEY_RE.exec(l))) {
    let raw = m[2];
    const shorthand = /,-+$/.test(raw);
    if (shorthand) raw = raw.replace(/,-+$/, ',00');
    const dec = shorthand || (/[,.]\d{1,2}$/.test(raw) && !/^\d{1,3}(?:\.\d{3})+$/.test(raw));
    const before = l.slice(Math.max(0, m.index - 5), m.index);
    const after = l.slice(m.index + m[0].length);
    const cur = /^\s*(?:€|eur\b|euro\b)/.test(after) || /(?:€|eur|euro)\s*$/.test(before);
    if (!dec && !cur) continue;
    if (UNIT_AFTER.test(after)) continue;
    let v = parseMoney((m[1] ? '-' : '') + raw + (m[3] ? '-' : ''));
    if (v == null || Math.abs(v) > 9_999_999) continue;
    out.push({ value: v, index: m.index, end: m.index + m[0].length, cur, dec });
  }
  return out;
}

// ================================================================================================
// Dokument-Vorbereitung & Begriffssuche
// ================================================================================================

const MAX_TEXT = 300_000;
const isAl = (c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
const isLetter = (c) => c >= 'a' && c <= 'z';

/** Bereitet Text auf: Originalzeilen (ohne Leerzeilen), normalisierte + gefaltete Zeilen. */
function prepare(text) {
  const raw = String(text ?? '').slice(0, MAX_TEXT);
  const orig = [];
  for (const l of raw.split(/\r\n?|\n|\u2028|\u2029/)) {
    const t = l.replace(/[ \t ]+/g, ' ').trim();
    if (t) orig.push(t);
  }
  const lines = orig.map((l) => fold(normalizeText(l)));
  return { orig, lines, text: lines.join('\n') };
}

const META = new Map();
function termMeta(term) {
  let m = META.get(term);
  if (!m) {
    const fw = /^[a-z0-9]+/.exec(term);
    const tl = term.length;
    const single = !!fw && fw[0].length === tl;
    m = { tl, w0: fw ? fw[0] : null, single, toks: term.match(/[a-z0-9]+/g) || [], compound: single && tl >= 10,
      startsAl: isAl(term[0]), endsLetter: isLetter(term[tl - 1]) };
    META.set(term, m);
  }
  return m;
}

/** Erzeugt eine Suchfunktion term → {count, first} über einen gefalteten Text (mit Cache und Wort-Index). */
function makeMatcher(foldedText) {
  const cache = new Map();
  const words = new Set();
  const stems = new Set();
  const wre = /[a-z0-9]+/g;
  const longWords = [];
  let wm;
  while ((wm = wre.exec(foldedText))) {
    const w = wm[0];
    words.add(w);
    if (w.length >= 10) longWords.push(w);
    stems.add(w);
    if (w.length > 3) { stems.add(w.slice(0, -1)); if (w.length > 4) stems.add(w.slice(0, -2)); }
  }
  let longText = null;
  return (term) => {
    let r = cache.get(term);
    if (r) return r;
    r = { count: 0, first: -1 };
    cache.set(term, r);
    const meta = termMeta(term);
    const tl = meta.tl;
    // Schnellabweisung über den Wortindex: erstes Wort des Begriffs muss im Text vorkommen
    if (!meta.compound && meta.toks.length) {
      const tk = meta.toks;
      const last = tk.length - 1;
      for (let i = 0; i <= last; i++) {
        const w = tk[i];
        // letztes Token darf ein Suffix tragen, wenn der Begriff mit einem Buchstaben endet
        if (!(i === last && meta.endsLetter ? stems.has(w) : words.has(w))) return r;
      }
    }
    // Lange Einzelwörter dürfen Teil eines Kompositums sein (Suche nur in den langen Wörtern)
    const compound = meta.compound;
    if (compound && longText === null) longText = longWords.join(' ');
    const hay = compound ? longText : foldedText;
    const startsAl = !compound && meta.startsAl;
    const maxExtra = compound ? 12 : 2;
    const endsLetter = meta.endsLetter;
    let idx = -1, guard = 0;
    while ((idx = hay.indexOf(term, idx + 1)) !== -1 && guard++ < 30) {
      if (startsAl && idx > 0 && isAl(hay[idx - 1])) continue;
      if (endsLetter) {
        let k = idx + tl, extra = 0;
        while (k < hay.length && isLetter(hay[k]) && extra <= maxExtra) { k++; extra++; }
        if (extra > maxExtra) continue;
      }
      r.count++;
      if (r.first < 0) r.first = idx;
      if (r.count >= 4) break;
    }
    return r;
  };
}

const prep = (arr) => (arr || []).map((t) => fold(t).trim()).filter(Boolean);
const TYPES = DOC_TYPES.map((t) => ({
  key: t.key,
  strong: prep(t.strong),
  keywords: prep(t.keywords),
  negative: prep(t.negative),
}));
const SCORED = TYPES.filter((t) => t.key !== 'sonstiges');

/** Bewertet alle Belegarten. @returns {{key:string,score:number}[]} absteigend sortiert */
function scoreTypes(doc, meta) {
  const m = makeMatcher(doc.text);
  const header = doc.lines.slice(0, 8).join('\n');
  const hm = makeMatcher(header);
  const fname = fold(normalizeText((meta.filename || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.+]+/g, ' ')));
  const fm = fname ? makeMatcher(fname) : () => ({ count: 0 });
  const out = [];
  for (const t of SCORED) {
    let s = 0;
    const sv = [];
    for (const term of t.strong) {
      const r = m(term);
      if (r.count) {
        let v = (term.split(' ').length >= 3 ? 7 : 5.5) + Math.min(r.count - 1, 2) * 0.5;
        if (hm(term).count) v += 3;
        sv.push(v);
      }
      if (fm(term).count) s += 4;
    }
    sv.sort((a, b) => b - a);
    for (let i = 0; i < sv.length; i++) s += sv[i] * DIM[Math.min(i, DIM.length - 1)];
    let kw = 0, fk = 0;
    for (const term of t.keywords) {
      const r = m(term);
      if (r.count) {
        const w = term.length >= 9 ? 1.3 : term.length <= 4 ? 0.6 : 1.0;
        kw += w + Math.min(r.count - 1, 3) * 0.2;
      }
      if (fm(term).count) fk += 2;
    }
    s += Math.min(kw, 9) + Math.min(fk, 4);
    let neg = 0;
    for (const term of t.negative) if (m(term).count) neg += 2.5;
    s -= Math.min(neg, 8);
    out.push({ key: t.key, score: Math.max(0, s) });
  }
  return out.sort((a, b) => b.score - a.score);
}

const DIM = [1, 0.65, 0.45, 0.3];
const SOFT_T = 2.5;
const SOFT_BASE = 2.5;
/** Softmax-artige Normalisierung mit Baseline „keine Belegart“; Nullscores zählen nicht. */
function softmax(scores) {
  const ex = scores.map((s) => (s.score > 0 ? Math.exp(s.score / SOFT_T) - 1 : 0));
  const sum = ex.reduce((a, b) => a + b, Math.exp(SOFT_BASE / SOFT_T) - 1);
  return ex.map((e) => e / sum);
}

// ================================================================================================
// Beträge
// ================================================================================================

const AMOUNT_LABELS = {
  gesamtbetrag: 10, rechnungsbetrag: 10, endbetrag: 10, 'zu zahlen': 10, 'zu zahlender betrag': 10,
  zahlbetrag: 10, zahlungsbetrag: 10, rechnungssumme: 10, gesamtsumme: 10, endsumme: 10, 'amount due': 10,
  'total due': 10, 'offener betrag': 10, auszahlungsbetrag: 10, ueberweisungsbetrag: 10, 'fuer sie zu zahlen': 10,
  'rechnungsbetrag brutto': 10, bruttobetrag: 9, 'summe brutto': 9, gesamtbrutto: 9, gesamtpreis: 8, gesamtkosten: 8,
  'zu entrichten': 8, summe: 7, total: 7, gesamt: 7, insgesamt: 7, brutto: 6, saldo: 5, bar: 4, 'ec-karte': 4,
  girocard: 4, kartenzahlung: 4, betrag: 3, zahlung: 3, kosten: 2, preis: 2,
  zwischensumme: -5, netto: -6, nettobetrag: -6, nettosumme: -6, 'summe netto': -6, mwst: -6, mehrwertsteuer: -6,
  umsatzsteuer: -6, ust: -6, rabatt: -6, skonto: -6, versandkosten: -4, porto: -3, pfand: -3, rueckgeld: -6,
  zurueck: -5, gegeben: -6, anzahlung: -3, 'bereits bezahlt': -4, einzelpreis: -5, stueckpreis: -5, 'e-preis': -5,
  steuersatz: -6, 'gesamtbetrag der einkuenfte': -6, 'zu versteuerndes einkommen': -6, 'summe der einkuenfte': -6,
  zinssatz: -6, 'anteil': -2, 'davon': -3,
};
const BEITRAG = { jahresbeitrag: 10, gesamtbeitrag: 10, beitrag: 8, beitraege: 8, 'summe der beitraege': 10, 'beitrag gesamt': 10, monatsbeitrag: 4 };
const AMOUNT_EXTRA = {
  lohnsteuerbescheinigung: { bruttoarbeitslohn: 12 },
  gehaltsabrechnung: { auszahlungsbetrag: 11, ueberweisungsbetrag: 11, 'netto-verdienst': 10, nettoverdienst: 10, gesamtbrutto: 4, 'gesamt-brutto': 4 },
  krankenversicherung: BEITRAG, pflegeversicherung: BEITRAG, haftpflicht: BEITRAG, unfallversicherung: BEITRAG,
  berufsunfaehigkeit: BEITRAG, kfz_haftpflicht: BEITRAG, risikoleben: BEITRAG, ruerup: BEITRAG, riester: BEITRAG,
  gewerkschaft: { ...BEITRAG, mitgliedsbeitrag: 9 }, berufsverband: { ...BEITRAG, mitgliedsbeitrag: 9 },
  mitgliedsbeitrag: { ...BEITRAG, mitgliedsbeitrag: 9 },
  spende: { spendenbetrag: 11, 'betrag der zuwendung': 11, 'summe der zuwendungen': 11, zuwendung: 8, spende: 8, betrag: 9, 'im wert von': 10 },
  kita: { ...BEITRAG, elternbeitrag: 9, betreuungsbeitrag: 9 }, schulgeld: { ...BEITRAG, schulgeld: 9 },
  steuerbescheid: { abschlusszahlung: 11, nachzahlung: 11, erstattung: 11, 'zu erstattender betrag': 11, verbleibende: 9, 'festgesetzte einkommensteuer': 8 },
  vorauszahlung: { vorauszahlung: 9, 'je vorauszahlung': 9, vierteljaehrlich: 9 },
  jahressteuerbescheinigung: { 'kapitalertraege gesamt': 12, kapitalertraege: 11, 'gezahlte steuern insgesamt': -6, 'gezahlte steuern': -6 },
  zahlungsnachweis: { betrag: 10 },
  nebenkostenabrechnung: { nachzahlung: 11, guthaben: 11, nachforderung: 11, abrechnungsergebnis: 11, ergebnis: 8 },
  hausgeld_weg: { nachzahlung: 11, guthaben: 11, nachforderung: 11, abrechnungsergebnis: 11, ergebnis: 8 },
  rentenbezug: { jahresbetrag: 10, bruttorente: 10, rentenbetrag: 10, 'monatliche rente': 8 },
  grundsteuer: { jahresbetrag: 10, grundsteuer: 8 },
  darlehen: { 'gezahlte zinsen': 11, zinsbetrag: 10, sollzinsen: 10, zinsen: 8 },
  kontofuehrung: { kontofuehrungsentgelt: 10, jahresentgelt: 10, entgelt: 8 },
  unterhalt: { unterhalt: 8, unterhaltszahlung: 9 },
};

const labelRegexCache = new Map();
function labelRegex(extra) {
  const key = extra ? JSON.stringify(extra) : '';
  let c = labelRegexCache.get(key);
  if (c) return c;
  const table = {};
  for (const [k, v] of Object.entries(AMOUNT_LABELS)) table[fold(k)] = v;
  if (extra) for (const [k, v] of Object.entries(extra)) table[fold(k)] = v;
  const keys = Object.keys(table).sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  c = { re: new RegExp(`(?<![a-z])(${keys.join('|')})(?![a-z])`, 'g'), table };
  labelRegexCache.set(key, c);
  return c;
}

/** Alle Labels einer Zeile: [{w, idx, end}] (inkl.-Ausnahme für negative Steuer-Labels). */
function labelsIn(s, lr) {
  const out = [];
  lr.re.lastIndex = 0;
  let m;
  while ((m = lr.re.exec(s))) {
    let w = lr.table[m[1]];
    if (w < 0 && /(?:inkl|incl|enthalt\w*|davon|zzgl|zgl)\.?\s*(?:\d+(?:[.,]\d+)?\s*%\s*)?$/.test(s.slice(Math.max(0, m.index - 18), m.index))) continue;
    out.push({ w, idx: m.index, end: m.index + m[0].length });
  }
  return out;
}

const AMOUNT_IGNORE_LINE = /\b(?:iban|bic|steuernummer|kundennummer|kundennr|ust-?id|idnr|telefon|tel\.|fax|seite|blz|konto-?nr)\b/;

/**
 * Sucht den Gesamtbetrag.
 * @returns {{value:number|null, conf:number}}
 */
function findAmount(doc, typeKey) {
  const lr = labelRegex(AMOUNT_EXTRA[typeKey]);
  const lines = doc.lines;
  let best = null;
  const unl = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const toks = moneyTokens(line);
    if (!toks.length) continue;
    let colLabels = null;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      const prefix = line.slice(0, t.index);
      let labs = labelsIn(prefix, lr);
      let w = labs.length ? labs[labs.length - 1].w : 0;
      if (!labs.length) {
        const after = line.slice(t.end, t.end + 24);
        const sm = /^\s*(?:€|eur|euro)?\s*[(\[]?\s*(gesamt|brutto|total|summe)\b/.exec(after);
        if (sm) w = 7;
      }
      if (!labs.length && w === 0 && i > 0 && prefix.replace(/[^a-z]/g, '').length < 3) {
        const prev = lines[i - 1];
        if (prev.length < 70) {
          if (colLabels === null) colLabels = labelsIn(prev, lr);
          if (colLabels.length >= 2 && colLabels.length === toks.length) w = colLabels[k].w * 0.9;
          else if (colLabels.length && toks.length === 1) w = colLabels[colLabels.length - 1].w * 0.85;
        }
      }
      const cand = { value: t.value, w, i, cur: t.cur };
      if (w > 0) {
        const sc = w + (t.cur ? 0.3 : 0);
        if (!best || sc > best.sc || (sc === best.sc && i >= best.i)) best = { ...cand, sc };
      } else if (w === 0 && !AMOUNT_IGNORE_LINE.test(line)) unl.push(cand);
    }
  }
  if (best) return { value: best.value, conf: best.w >= 10 ? 0.9 : best.w >= 6 ? 0.75 : 0.55 };
  const pool = unl.filter((c) => c.value > 0 && c.value < 1_000_000);
  if (!pool.length) return { value: null, conf: 0 };
  // Fallback: größter plausibler Betrag, bevorzugt nahe einer „Summe“-Zeile
  const near = pool.filter((c) => {
    for (let j = Math.max(0, c.i - 2); j <= Math.min(lines.length - 1, c.i + 2); j++) if (/summe|gesamt|total|betrag/.test(lines[j])) return true;
    return false;
  });
  const use = near.length ? near : pool;
  const top = use.reduce((a, b) => (b.value > a.value ? b : a));
  return { value: top.value, conf: 0.35 };
}

function detectCurrency(text) {
  if (/\b(?:eur|euro)\b|€/.test(text)) return 'EUR';
  if (/\bchf\b/.test(text)) return 'CHF';
  if (/\busd\b|\$/.test(text)) return 'USD';
  if (/\bgbp\b|£/.test(text)) return 'GBP';
  return 'EUR';
}

// ================================================================================================
// Datum & Steuerjahr
// ================================================================================================

const DATE_LABELS = {
  rechnungsdatum: 10, belegdatum: 10, ausstellungsdatum: 10, ausstelldatum: 10, 'datum der ausstellung': 10,
  'ausgestellt am': 10, 'rechnung vom': 9, 'beleg vom': 9, 'invoice date': 10, 'date of issue': 10,
  'bescheid vom': 9, 'bescheinigung vom': 9, 'schreiben vom': 9, 'kassenbon vom': 9, 'quittung vom': 9,
  datum: 8, date: 7, ausfertigung: 8, 'erstellt am': 8, 'ausgefertigt am': 8, abrechnungsdatum: 8,
  kaufdatum: 6, buchungsdatum: 5, bestelldatum: 5, zahlungsdatum: 5, zahldatum: 5, 'bezahlt am': 5, druckdatum: 3,
  stand: 3, vom: 2, leistungsdatum: 1, lieferdatum: 1, 'datum der leistung': 1, 'datum der lieferung': 1,
  faellig: -9, faelligkeit: -9, 'faellig am': -9, 'zahlbar bis': -9, zahlbar: -5, zahlungsziel: -9, spaetestens: -8,
  frist: -8, 'gueltig bis': -9, gueltig: -5, geburtsdatum: -10, geboren: -10, geb: -10, 'geb am': -10, geburtstag: -10,
  kuendigung: -6, 'bis zum': -6, ablauf: -8, mietbeginn: -6, vertragsbeginn: -4, versicherungsbeginn: -5,
  lieferung: -3, bis: -4, zeitraum: -3, 'zum': -2, vertragsende: -6, 'laufzeit': -4, 'einspruchsfrist': -9,
};
const DATE_EXTRA = {
  spende: { 'datum der zuwendung': 11, zuwendungsdatum: 11, spendendatum: 11, 'tag der zuwendung': 11, 'datum der spende': 11 },
  krankenversicherung: { 'ausgestellt am': 10 },
  zahlungsnachweis: { ausfuehrungsdatum: 10, buchungsdatum: 8, valuta: 7 },
};
const dateLabelCache = new Map();
function dateLabelRegex(extra) {
  const key = extra ? JSON.stringify(extra) : '';
  let c = dateLabelCache.get(key);
  if (c) return c;
  const table = {};
  for (const [k, v] of Object.entries(DATE_LABELS)) table[fold(k)] = v;
  if (extra) for (const [k, v] of Object.entries(extra)) table[fold(k)] = v;
  const keys = Object.keys(table).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  c = { re: new RegExp(`(?<![a-z])(${keys.join('|')})(?![a-z])`, 'g'), table };
  dateLabelCache.set(key, c);
  return c;
}

/** Findet einen Zeitraum „01.01.2025 – 31.12.2025“ / „vom 01.01. bis 31.12.2025“. */
function findRange(lines) {
  const re = /(?<![\d.])(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4})?\s?(?:-|–|—|bis|\/)\s?(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4})(?!\d)/;
  let first = null;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(fixOcrDigits(lines[i]));
    if (!m) continue;
    const by = +m[6];
    const bis = validISO(by, +m[5], +m[4]);
    let vy = m[3] ? +m[3] : by;
    let von = validISO(vy, +m[2], +m[1]);
    if (von && bis && von > bis && !m[3]) von = validISO(by - 1, +m[2], +m[1]);
    if (!von || !bis || von > bis) continue;
    const days = (Date.parse(bis) - Date.parse(von)) / 86400000;
    if (days > 400) continue;
    const r = { von, bis, line: i, days };
    if (days >= 20) return r;
    if (!first) first = r;
  }
  return first;
}

/** Sucht das Belegdatum. @returns {{iso:string|null, conf:number, future:boolean}} */
function findDate(doc, typeKey, range, today) {
  const lr = dateLabelRegex(DATE_EXTRA[typeKey]);
  const lines = doc.lines;
  const limit = today + 86400000;
  let best = null, futureSeen = false;
  const rangeLine = range ? range.line : -1;
  for (let i = 0; i < lines.length; i++) {
    const line = fixOcrDigits(lines[i]);
    const ds = findDates(line);
    if (!ds.length) continue;
    const isRangeLine = i === rangeLine;
    for (const d of ds) {
      const ts = Date.parse(d.iso);
      if (d.iso < '1990-01-01') continue;
      const prefix = line.slice(0, d.index);
      let labs = labelsIn(prefix, lr);
      let w;
      if (labs.length) w = labs[labs.length - 1].w;
      else if (/,\s*(?:den|am)\s*$/.test(prefix)) w = 8;
      else if (/\bden\s*$/.test(prefix)) w = 6;
      else {
        w = i < 12 ? 3 : 1;
        if (i > 0 && ds.length === 1) {
          const pl = labelsIn(lines[i - 1], lr);
          if (pl.length && lines[i - 1].length < 70) w = pl[pl.length - 1].w * 0.85;
        }
      }
      if (isRangeLine && ds.length >= 2 && range && (d.iso === range.von || d.iso === range.bis)) w = Math.min(w, -4);
      if (ts > limit) { if (w > 0) futureSeen = true; continue; }
      if (w <= -5) continue;
      if (!best || w > best.w) best = { iso: d.iso, w, i };
    }
  }
  if (!best || best.w <= -1) {
    return { iso: best && best.w > -4 ? best.iso : null, conf: 0.2, future: futureSeen && !best };
  }
  return { iso: best.iso, conf: best.w >= 8 ? 0.9 : best.w >= 3 ? 0.65 : 0.45, future: false };
}

const CERT_TYPES = new Set([
  'lohnsteuerbescheinigung', 'krankenversicherung', 'pflegeversicherung', 'rentenbezug', 'leistungsmitteilung',
  'jahressteuerbescheinigung', 'verlustbescheinigung', 'steuerbescheid', 'vorauszahlung', 'nebenkostenabrechnung',
  'hausgeld_weg', 'grundsteuer', 'darlehen', 'ruerup', 'riester', 'kirchensteuer', 'kindergeld', 'schulbescheinigung',
  'gewerkschaft', 'mitgliedsbeitrag', 'minijob_haushalt', 'schulgeld', 'haftpflicht', 'unfallversicherung',
  'berufsunfaehigkeit', 'risikoleben', 'kfz_haftpflicht', 'homeoffice', 'kontofuehrung', 'broker', 'kita', 'gehaltsabrechnung',
]);
const YEAR_PATTERNS = [
  R('(?:kalenderjahr|veranlagungszeitraum|steuerjahr|beitragsjahr|abrechnungsjahr|wirtschaftsjahr|bescheinigungsjahr|leistungsjahr|jahr)\\s*[:\\-]?\\s*(20\\d{2})(?!\\d)'),
  R('(?:homeoffice-?tage|tage)\\s+(20\\d{2})(?!\\d)'),
  R('\\bfuer\\s+(?:das\\s+)?(?:kalender|steuer|beitrags)?\\s*(?:jahr\\s+)?(20\\d{2})(?!\\d)'),
  R('(?:bescheinigung|bescheid|jahresabrechnung|jahresmeldung|abrechnung|jahresuebersicht|jahresbescheinigung|renteninformation|rentenbezugsmitteilung|steuerbescheinigung|leistungsmitteilung|beitragsbescheinigung)\\s+(?:fuer\\s+)?(20\\d{2})(?!\\d)'),
  R('(?:abrechnungsmonat|abrechnungszeitraum|abrechnung|monat)\\s*:?\\s*(?:0?[1-9]|1[0-2])\\s*[\\/.]\\s*(20\\d{2})(?!\\d)'),
  R(`(?:abrechnungsmonat|abrechnung|zeitraum|monat|fuer)\\s*:?\\s*(?:${MONTH_RE})\\s+(20\\d{2})(?!\\d)`),
];

function findExplicitYear(doc, range) {
  for (const l of doc.lines) {
    for (const re of YEAR_PATTERNS) {
      const m = re.exec(l);
      if (m) {
        const y = +m[1];
        if (y >= 1990 && y <= 2100) return y;
      }
    }
  }
  if (range && range.days >= 20) return +range.bis.slice(0, 4);
  return null;
}

/** Häufigstes plausibles Jahr im Text (letzter Ausweg). */
function mostFrequentYear(doc, nowYear) {
  const cnt = new Map();
  const re = /(?<![\d.,\/-])(20[12]\d)(?![\d]|[.,\/-]\d)/g;
  let m;
  while ((m = re.exec(doc.text))) {
    const y = Number(m[1]);
    if (y > nowYear + 1) continue;
    cnt.set(y, (cnt.get(y) || 0) + 1);
  }
  let best = null;
  for (const [y, c] of cnt) if (!best || c > best.c || (c === best.c && y > best.y)) best = { y, c };
  return best ? best.y : null;
}

// ================================================================================================
// Aussteller & Titel
// ================================================================================================

const LEGAL_RE = /(?:\b(?:gmbh|ag|kg|ohg|ug|se|gbr|mbh|e\.?\s?v\.?|e\.?\s?k\.?|kgaa|ltd|inc|llc|co\.|& co)\b|\bgmbh\s*&\s*co)/i;
const ORG_RE = /(?<![\p{L}])(?:apotheke|apotheken|praxis|zahnarzt\p{L}*|zahnärzt\p{L}*|dr\.?\s?med|dr\.?\s?dent|krankenkasse|krankenversicherung|versicherung|versicherungen|bank|sparkasse|volksbank|raiffeisenbank|finanzamt|stadt|gemeinde|landkreis|kita|kindergarten|kindertagesst\p{L}*|klinik|klinikum|krankenhaus|verein|stiftung|verlag|hotel|optik|optiker|physiotherapie|steuerberat\p{L}*|rechtsanwal\p{L}*|gewerkschaft|bundesagentur|familienkasse|rentenversicherung|stadtwerke|schule|universit\p{L}*|hochschule|werkstatt|haustechnik|elektro|sanitär|sanitaer|malerbetrieb|gartenbau|reinigung|hausverwaltung|verwaltung|kirchengemeinde|bistum|aok|barmer|techniker krankenkasse|dak)(?![\p{L}])|(?:klinikum|krankenhaus|versicherung|sparkasse|volksbank|verlag|kasse|praxis|apotheke|institut|stiftung|verband|akademie|zentrum|reinigung|verwaltung|gewerkschaft|krankenkasse|bank)(?![\p{L}])/iu;
const ISS_SKIP = /^(?:\[|inh\.?(?=\s)|inhaber|geschäftsführer|geschaeftsfuehrer|vertreten|ansprechpartner|rechnung|beleg|quittung|kassenbon|kassenbeleg|bescheinigung|seite|datum|kunden|betrag|summe|tel(?![\p{L}])|telefon|fax|www|http|e-?mail|iban|bic|ust(?:-|(?![\p{L}]))|steuernummer|steuer-?id|de\s?\d{2}|\d|sehr geehrte|guten tag|herr(?![\p{L}])|herrn|frau(?![\p{L}])|familie|an:|bestellung|lieferschein|angebot|auftrag|vielen dank|zahlung|ihre|unser|betreff|ausdruck|elektronische|lohnsteuerbescheinigung|jahressteuer|bitte|hinweis|anlage|zuwendungsbest|bestaetigung|bestätigung|steuerbescheid|einkommensteuerbescheid|bescheid|name,? ?vorname|pos(?![\p{L}])|artikel|menge|anzahl|mwst|gesamt|netto|brutto|kontoauszug|beitragsrechnung|gebührenrechnung|entgeltabrechnung)/iu;
const ISS_ADDR = /(?:\b(?:str\.|strasse|straße|weg|allee|platz|gasse|ring|damm|ufer|chaussee)\s*\d+|^\d{5}\s+\p{L}|\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+\s*$|postfach|@|www\.|\.de\b)/iu;
const LABEL_PREFIX = '(?:absender|aussteller|rechnungssteller|rechnungsaussteller|arbeitgeber|versicherer|zahlungsempfaenger|zahlungsempfänger|empfänger der spende|empfaenger der spende|zuwendungsempfaenger|zuwendungsempfänger|empfänger|empfaenger|begünstigter|beguenstigter|name des arbeitgebers|krankenkasse|verwalter|institut|von)';
const ISS_LABEL = new RegExp(`^${LABEL_PREFIX}\\s*:\\s*(.{3,80})$`, 'iu');
const ISS_LABEL_STRIP = new RegExp(`^${LABEL_PREFIX}\\s*:\\s*`, 'iu');
const ISS_LABEL_NEXT = /(?:arbeitgebers?|aussteller|absender|zuwendungsempfaenger|zuwendungsempfänger)\s*(?:\)|:)?\s*$/i;

function cleanIssuer(raw) {
  let s = raw.replace(/^[^\p{L}\d]+/u, '').replace(/\s+/g, ' ').trim();
  s = s.replace(ISS_LABEL_STRIP, '').replace(/<[^>]*>?/g, '').trim();
  const segs = s.split(/\s[|·•]\s|\s[–—]\s|\s-\s(?=\D*\d)|,\s*(?=[^,]*\d)/);
  let pick = segs[0];
  for (const sg of segs) if (LEGAL_RE.test(sg) || ORG_RE.test(sg)) { pick = sg; break; }
  s = pick.trim();
  s = s.replace(/\s+(?:[A-ZÄÖÜ][\wäöüß.-]*(?:str\.|strasse|straße|weg|allee|platz|gasse)\s*\d+.*)$/, '');
  s = s.replace(/\s+\d{5}\s.*$/, '');
  s = s.replace(/^(?:rechnung von|rechnungssteller|absender|aussteller)\s*:?\s*/i, '');
  s = s.replace(/\s*\(.*$/, '');
  const keepDot = /(?:\b[a-z]\.\s?[a-z]|\bco|\binc|\bltd)\.\s*$/i.test(s);
  s = s.replace(/[\s,;:.|·•-]+$/, '');
  if (keepDot) s += '.';
  if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, '');
  s = s.trim();
  // Tabellen-/Markup-Reste lieber verwerfen als Müll liefern
  if (/[\[\]{}|<>\\=;]/.test(s) || (s.match(/\p{L}/gu) || []).length < 3 || (s.match(/\d/g) || []).length > s.length * 0.3) return '';
  return s;
}

/** Aussteller aus den Kopfzeilen (Originalschreibweise). */
function findIssuer(doc) {
  const o = doc.orig;
  const n = Math.min(o.length, 40);
  for (let i = 0; i < n; i++) {
    const m = ISS_LABEL.exec(o[i]);
    if (m) { const c = cleanIssuer(m[1]); if (c.length >= 3) return c; }
    if (i + 1 < o.length && ISS_LABEL_NEXT.test(o[i]) && o[i].length < 70) {
      const nx = o[i + 1];
      if (!ISS_ADDR.test(nx) && /\p{L}{3}/u.test(nx) && !ISS_SKIP.test(nx)) { const c = cleanIssuer(nx); if (c.length >= 3) return c; }
    }
  }
  let best = null;
  const head = Math.min(o.length, 14);
  const consider = (i, bonusPos) => {
    const line = o[i];
    if (line.length < 3 || line.length > 100) return;
    if (ISS_SKIP.test(line) || ISS_ADDR.test(line) && !LEGAL_RE.test(line)) return;
    if (line.includes(' | ') && !LEGAL_RE.test(line) && !ORG_RE.test(line)) return;
    if (moneyTokens(doc.lines[i]).length) return;
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters < line.replace(/\s/g, '').length * 0.5) return;
    let sc = bonusPos;
    if (LEGAL_RE.test(line)) sc += 6;
    if (ORG_RE.test(line)) sc += 5;
    if (/[A-ZÄÖÜ]/.test(line[0])) sc += 0.7;
    if (/\d/.test(line)) sc -= 1.5;
    if (line.length >= 4 && line.length <= 45) sc += 1;
    if (!best || sc > best.sc) best = { sc, i, strong: LEGAL_RE.test(line) || ORG_RE.test(line) };
  };
  for (let i = 0; i < head; i++) consider(i, Math.max(0, 3 - i * 0.5));
  if (!best || best.sc < 5) for (let i = Math.max(head, o.length - 6); i < o.length; i++) consider(i, 0);
  if (best && best.sc >= (best.strong ? 3 : 3.5)) {
    const c = cleanIssuer(o[best.i]);
    if (c.length >= 3) return c;
  }
  return '';
}

const TITLE_SKIP = R('(?:arbeitskosten|materialkosten|lohnanteil|lohnkosten|anfahrt|nachzahlung|guthaben|vorauszahlung|eigenanteil|zuzahlung|jahresbeitrag|beitrag|summe|gesamt|mwst|ust\\b|versand|rechnungs|zwischen|netto|brutto|zahlung|porto|rabatt|pfand|rueckgeld|zurueck|bar\\b|saldo|total|betrag|steuer|iban|datum|seite|kunden|bestell|lieferung|zahlbar|ueberweis|bankverbindung|vielen dank|mit freundlichen|fuer sie)');
const TITLE_HEAD = /(?:^|\s)(?:pos\.?|position|bezeichnung|beschreibung|artikel|leistung|produkt|text)\b.*(?:betrag|preis|menge|anzahl|summe|gesamt)/;

function cleanItem(origLine, line) {
  let s = fixOcrDigits(origLine);
  s = s.replace(/(?:€|eur\b|euro\b)/gi, ' ');
  s = s.replace(/\d+,-+/g, ' ').replace(/-?\d{1,3}(?:[. ]\d{3})*[,.]\d{1,2}\s*-?/g, ' ').replace(/\b\d+\s?%/g, ' ');
  s = s.replace(/^\s*(?:\d{1,3}\s*[.)]?\s+)?(?:\d+(?:[,.]\d+)?\s*(?:x|stk\.?|st\.?|stueck|stück|mal)\s+)?/i, '');
  s = s.replace(/\s+\d{1,4}\s*$/, '').replace(/\s+[abc]\s*$/i, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[^\p{L}\d"]+|[^\p{L}\d")]+$/gu, '');
  if ((s.match(/\p{L}/gu) || []).length < 4) return '';
  if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, '') + '…';
  return s;
}

/** Erste Rechnungsposition (Beschreibung) oder ''. */
function findItem(doc) {
  const { lines, orig } = doc;
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 80); i++) if (TITLE_HEAD.test(lines[i])) { start = i + 1; break; }
  const end = Math.min(lines.length, start ? start + 14 : 60);
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (TITLE_SKIP.test(l) || ISS_ADDR.test(orig[i]) && !start) continue;
    if (!moneyTokens(l).length) continue;
    const c = cleanItem(orig[i], l);
    if (c) return c;
  }
  return '';
}

const ITEM_TYPES = new Set(['arbeitsmittel', 'fachliteratur', 'fortbildung', 'handwerker', 'haushaltsnahe_dl', 'reisekosten',
  'arbeitskleidung', 'erhaltungsaufwand', 'schornsteinfeger', 'umzug_beruflich', 'fahrtkosten', 'bewerbung']);

// ================================================================================================
// Feldextraktion
// ================================================================================================

/**
 * Betrag hinter einem Label: gleiche Zeile (letzter Betrag nach dem Label), sonst nächste Zeilen.
 * @returns {{value:number, conf:number}|null}
 */
const COLS_RE = /(?<![a-z])(?:netto|mwst|ust|umsatzsteuer|mehrwertsteuer|brutto|gesamt|summe)(?![a-z])/g;
const STOP_RE = /(?<![a-z])(?:material\w*|netto\w*|brutto\w*|mwst|summe|gesamt\w*|rabatt|lohn\w*|arbeitskosten|ust)(?![a-z])/;
function moneyAfterLabel(doc, re, opts = {}) {
  if (opts.num) {
    // Zeilennummern-basiert (Lohnsteuerbescheinigung): erst Zeilen mit passender Nummer, dann un-nummerierte
    const numRe = new RegExp(`^(?:${opts.num.join('|')})\\.?\\s`);
    const r1 = scanMoney(doc, re, opts, (l) => numRe.test(l));
    if (r1) return r1;
    return scanMoney(doc, re, opts, (l) => !/^\d{1,2}[a-z]?\.?\s/.test(l));
  }
  return scanMoney(doc, re, opts, null);
}

function scanMoney(doc, re, opts, accept) {
  const { lines } = doc;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = re.exec(l);
    if (!m) continue;
    if (opts.not && opts.not.test(l)) continue;
    if (accept && !accept(l)) continue;
    const endIdx = m.index + m[0].length;
    let toks = moneyTokens(l).filter((t) => t.index >= endIdx - 1);
    if (toks.length > 1) {
      // mehrere Label in einer Zeile: nur bis zum nächsten Label lesen
      STOP_RE.lastIndex = 0;
      const sm = STOP_RE.exec(l.slice(endIdx));
      if (sm) {
        const lim = endIdx + sm.index;
        const part = toks.filter((t) => t.index < lim);
        if (part.length) toks = part;
      }
    }
    if (toks.length) {
      const t = opts.first ? toks[0] : toks[toks.length - 1];
      return { value: t.value, conf: 0.9 };
    }
    // Spaltenkopf („Netto MwSt Brutto“) mit Werten in der Folgezeile
    const cols = l.match(COLS_RE);
    if (cols && cols.length >= 2 && i + 1 < lines.length) {
      const nt = moneyTokens(lines[i + 1]);
      if (nt.length === cols.length) {
        const pos = cols.findIndex((c) => re.test(c));
        re.lastIndex = 0;
        if (pos >= 0) return { value: nt[pos].value, conf: 0.8 };
      }
    }
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const nt = moneyTokens(lines[j]);
      const letters = lines[j].replace(/[^a-z]/g, '').length;
      if (nt.length && letters < 5) return { value: nt[0].value, conf: 0.7 };
      if (letters >= 5) break;
    }
  }
  return null;
}

/** Summe der Beträge direkt hinter jedem Label-Treffer (je Betrag nur einmal). */
function sumByLabel(doc, re) {
  const g = new RegExp(re.source, 'g');
  let sum = 0, n = 0;
  for (const l of doc.lines) {
    const toks = moneyTokens(l);
    if (!toks.length) continue;
    const used = new Set();
    g.lastIndex = 0;
    let m;
    while ((m = g.exec(l))) {
      const end = m.index + m[0].length;
      const t = toks.find((x) => x.index >= end - 1);
      if (t && !used.has(t)) { used.add(t); sum += t.value; n++; }
    }
  }
  return n ? { value: Math.round(sum * 100) / 100, conf: 0.5 } : null;
}

function ibanValid(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of r) {
    const v = ch >= 'A' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    rem = (v > 9 ? rem * 100 + v : rem * 10 + v) % 97;
  }
  return rem === 1;
}

function findIban(doc) {
  let fallback = null;
  for (const l of doc.orig) {
    const re = /\b[A-Za-z]{2}\s?\d{2}(?:\s?[A-Za-z0-9]{4}){3,7}(?:\s?[A-Za-z0-9]{1,4})?\b/g;
    let m;
    while ((m = re.exec(l))) {
      const compact = m[0].replace(/\s/g, '').toUpperCase();
      const grouped = compact.replace(/(.{4})/g, '$1 ').trim();
      if (ibanValid(compact)) return { value: grouped, conf: 0.95 };
      if (!fallback && /^DE\d{20}$/.test(compact)) fallback = { value: grouped, conf: 0.55 };
    }
  }
  return fallback;
}

function firstMatch(doc, re, group = 1, useOrig = false) {
  const arr = useOrig ? doc.orig : doc.lines;
  for (let i = 0; i < arr.length; i++) {
    const src = useOrig ? arr[i] : fixOcrDigits(arr[i]);
    const m = re.exec(src);
    if (m && m[group]) return { text: m[group].trim(), line: i };
  }
  return null;
}

const RE = {
  brutto: R('(?<![a-z])(?:bruttoarbeitslohn|gesamt-?brutto|bruttolohn|bruttogehalt|bruttorente)(?![a-z])|(?<![a-z])brutto(?![a-z])'),
  lohnsteuer: R('(?<![a-z])(?:einbehaltene\\s+)?lohnsteuer(?!bescheinig|hilfe|klasse|abzug|-?id)'),
  soli: R('solidaritaetszuschlag|(?<![a-z])soli(?![a-z])'),
  kist: R('kirchensteuer'),
  kistNot: R('ehegatt|lebenspartner|ehepartner'),
  rv: R('(?:arbeitnehmeranteil|arbeitnehmerbeitr\\w*)[^\\d]{0,60}rentenversicherung|rentenversicherung[^\\d]{0,40}arbeitnehmer'),
  kv: R('(?:arbeitnehmeranteil|arbeitnehmerbeitr\\w*)[^\\d]{0,60}krankenversicherung|^25\\.?\\s.*kranken|kranken-? ?(?:und|u\\.) ?pflegeversicherung[^\\d]{0,40}arbeitnehmer'),
  pv: R('(?:arbeitnehmeranteil|arbeitnehmerbeitr\\w*)[^\\d]{0,60}pflegeversicherung|^26\\.?\\s.*pflegeversicherung'),
  av: R('(?:arbeitnehmeranteil|arbeitnehmerbeitr\\w*)[^\\d]{0,60}arbeitslosenversicherung|^27\\.?\\s.*arbeitslosenversicherung'),
  agNot: R('arbeitgeber'),
  nettoGehalt: R('auszahlungsbetrag|ueberweisungsbetrag|netto-?verdienst|(?<![a-z])netto(?![a-z])'),
  netto: R('(?<![a-z])(?:nettobetrag|nettosumme|summe netto|zwischensumme netto|netto)(?![a-z])'),
  mwst: R('(?<![a-z])(?:mwst|mehrwertsteuer|umsatzsteuer|ust)(?![a-z])'),
  beitrag: R('(?<![a-z])(?:jahresbeitrag|gesamtbeitrag|summe der beitraege|beitrag gesamt|mitgliedsbeitrag|elternbeitrag|betreuungsbeitrag|beitraege|beitrag)(?![a-z])'),
  beitragNot: R('beitragssatz|beitragsbemessung|beitragsnachweis'),
  ak: R('(?<![a-z])(?:arbeitskosten|lohnanteil|lohnkosten|arbeitsleistungen?|lohnaufwand|arbeitslohn)(?![a-z])'),
  akParts: R('(?<![a-z])(?:lohn|arbeitszeit|arbeitsstunden|montage|anfahrt|fahrtkosten|stundenlohn|arbeit)(?![a-z])'),
  mat: R('(?<![a-z])(?:materialkosten|materialanteil|materialien|material|ersatzteile|warenwert)(?![a-z])'),
  kap: R('(?<![a-z])(?:kapitalertraege|zinsertraege|dividenden|ertraege)(?![a-z])'),
  kapest: R('kapitalertragsteuer(?!bescheinig)'),
  quelle: R('quellensteuer|auslaendische steuer'),
  verl: R('(?:nicht ausgeglichene\\s+)?verluste?(?![a-z])|verlusttopf|verlustverrechnungstopf'),
  steuerklasse: R('steuerklasse\\D{0,14}([1-6])(?!\\d)'),
  steuerid: R('(?:identifikationsnummer|identifikations-?nr\\.?|steuer-?id\\w*|idnr\\.?|ident-?nr\\.?)\\D{0,30}?(\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3})(?!\\d)'),
  etin: R('etin\\s*[:.\\-]?\\s*([a-z0-9]{8,16})(?:\\s|$)'),
  rechnungsnr: R('(?:rechnungs-?(?:nr|nummer)|rechnung\\s*(?:nr|nummer)|rechnungs-?no|beleg-?(?:nr|nummer)|belegnummer|re-?nr|invoice\\s*(?:no|number|nr)|quittungs-?nr|bon-?nr)\\.?\\s*[:.#]?\\s*([a-z0-9][a-z0-9\\-\\/_.]{2,24})'),
  rechnungsnr3: R('(?:rechnung|rg\\.?|re)\\s+([a-z]{1,3}-\\d{4}-\\d{2,}|[a-z]{1,3}-?\\d{4,}[\\w\\-\\/]*)'),
  rechnungsnr2: R('^rechnung\\s+(?:nr\\.?\\s*)?([a-z]*[-\\/]?\\d[\\w\\-\\/]{2,})'),
  vnr: R('(?:versicherungs(?:schein)?-?(?:nr|nummer)|vertrags-?(?:nr|nummer)|police(?:n)?-?(?:nr|nummer)|versichertennummer|mitgliedsnummer|vers\\.?-?nr)\\.?\\s*[:.#]?\\s*([a-z0-9][a-z0-9\\-\\/ ]{4,22}[a-z0-9])'),
  stnr: R('steuer-?(?:nr|nummer)\\.?\\s*[:.]?\\s*(\\d{2,3}\\s?[\\/ ]\\s?\\d{3,4}\\s?[\\/ ]\\s?\\d{4,5}|\\d{10,13})(?!\\d)'),
  km: /(\d{1,3}(?:,\d)?)\s*km\b/,
  kmCtx: R('entfernung|einfache|strecke|arbeitsweg|pendel|wohnung'),
  tage: R('(?:anzahl\\s+(?:der\\s+)?(?:homeoffice-?)?tage|homeoffice-?tage|tage)\\s*(?:im jahr)?\\s*[:=]?\\s*(\\d{1,3})(?![\\d,])|(\\d{1,3})\\s*(?:homeoffice-?)?(?:tage|tagen)\\b'),
  kind: /(?:name des kindes|vorname des kindes|betreutes kind|f(?:ü|ue)r das kind|kind|sch(?:ü|ue)ler(?:in)?)\s*:\s*([A-ZÄÖÜ][\p{L}\-' ]{2,40})/iu,
  empf: /(?:zuwendungsempf(?:ä|ae)nger|empf(?:ä|ae)nger der zuwendung|spendenempf(?:ä|ae)nger|empf(?:ä|ae)nger)\s*:\s*(.{3,70})/iu,
  zweck: /(?:zweck|f(?:ö|oe)rderzweck|verwendungszweck|gemeinn(?:ü|ue)tziger zweck)\s*:\s*(.{3,80})/iu,
};

const money = (r) => (r ? { value: r.value, conf: r.conf } : null);

/** Extrahiert die Felder, die zur Belegart gehören. @returns {Object<string,{value,confidence,source}>} */
function extractFields(doc, typeKey, ctx) {
  const wanted = docTypeOf(typeKey).fields || [];
  const out = {};
  const put = (k, r) => {
    if (r == null || r.value == null || r.value === '' || (typeof r.value === 'number' && Number.isNaN(r.value))) return;
    out[k] = { value: r.value, confidence: Math.round((r.conf ?? 0.6) * 100) / 100, source: 'regel' };
  };
  const isGehalt = typeKey === 'gehaltsabrechnung';
  const lst = typeKey === 'lohnsteuerbescheinigung';
  for (const k of wanted) {
    switch (k) {
      case 'brutto': put(k, money(moneyAfterLabel(doc, RE.brutto, lst ? { num: ['3'] } : {}))); break;
      case 'lohnsteuer': put(k, money(moneyAfterLabel(doc, RE.lohnsteuer, lst ? { num: ['4'] } : {}))); break;
      case 'soli': put(k, money(moneyAfterLabel(doc, RE.soli, lst ? { num: ['5'] } : {}))); break;
      case 'kirchensteuer': put(k, money(moneyAfterLabel(doc, RE.kist, { not: RE.kistNot, ...(lst ? { num: ['6'] } : {}) }))); break;
      case 'rv_an': put(k, money(moneyAfterLabel(doc, RE.rv, { not: RE.agNot, ...(lst ? { num: ['23a', '26'] } : {}) }))); break;
      case 'kv_an': put(k, money(moneyAfterLabel(doc, RE.kv, lst ? { num: ['25'] } : {}))); break;
      case 'pv_an': put(k, money(moneyAfterLabel(doc, RE.pv, lst ? { num: ['26'] } : {}))); break;
      case 'av_an': put(k, money(moneyAfterLabel(doc, RE.av, lst ? { num: ['27'] } : {}))); break;
      case 'steuerid': {
        const m = firstMatch(doc, RE.steuerid);
        if (m) put(k, { value: m.text.replace(/\s/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4'), conf: 0.9 });
        break;
      }
      case 'etin': {
        const m = firstMatch(doc, RE.etin);
        if (m) put(k, { value: m.text.toUpperCase(), conf: 0.75 });
        break;
      }
      case 'steuerklasse': {
        const m = firstMatch(doc, RE.steuerklasse);
        if (m) put(k, { value: Number(m.text), conf: 0.9 });
        break;
      }
      case 'netto': put(k, money(moneyAfterLabel(doc, isGehalt ? RE.nettoGehalt : RE.netto))); break;
      case 'mwst': put(k, money(moneyAfterLabel(doc, RE.mwst))); break;
      case 'beitrag': put(k, money(moneyAfterLabel(doc, RE.beitrag, { not: RE.beitragNot }) || (ctx.amount != null && /vorsorge|sonderausgaben|kinder/.test(ctx.category) ? { value: ctx.amount, conf: 0.4 } : null))); break;
      case 'arbeitskosten': {
        let r = moneyAfterLabel(doc, RE.ak);
        if (!r && (typeKey === 'handwerker' || typeKey === 'haushaltsnahe_dl' || typeKey === 'schornsteinfeger' || typeKey === 'energetisch35c' || typeKey === 'erhaltungsaufwand')) r = sumByLabel(doc, RE.akParts);
        put(k, money(r));
        break;
      }
      case 'materialkosten': put(k, money(moneyAfterLabel(doc, RE.mat))); break;
      case 'zahlungsart': {
        const t = doc.text;
        if (ctx.bar) put(k, { value: 'Bar', conf: 0.85 });
        else if (/lastschrift|sepa-?mandat|abbuchung|eingezogen/.test(t)) put(k, { value: 'Lastschrift', conf: 0.7 });
        else if (/ec-?karte|girocard|kartenzahlung|visa|mastercard/.test(t)) put(k, { value: 'Karte', conf: 0.7 });
        else if (R('ueberweisung|ueberweisen|bankverbindung|iban|zahlungsziel|zahlbar innerhalb').test(t)) put(k, { value: 'Überweisung', conf: 0.6 });
        break;
      }
      case 'kapitalertraege': put(k, money(moneyAfterLabel(doc, RE.kap))); break;
      case 'kapest': put(k, money(moneyAfterLabel(doc, RE.kapest))); break;
      case 'soli_kap': put(k, money(moneyAfterLabel(doc, RE.soli))); break;
      case 'kist_kap': put(k, money(moneyAfterLabel(doc, RE.kist, { not: RE.kistNot }))); break;
      case 'quellensteuer': put(k, money(moneyAfterLabel(doc, RE.quelle))); break;
      case 'verluste': put(k, money(moneyAfterLabel(doc, RE.verl))); break;
      case 'versicherungsnr': {
        const m = firstMatch(doc, RE.vnr);
        if (m && /\d/.test(m.text)) put(k, { value: m.text.toUpperCase(), conf: 0.7 });
        break;
      }
      case 'zeitraum':
        if (ctx.range) put(k, { value: `${fmtDe(ctx.range.von)} – ${fmtDe(ctx.range.bis)}`, conf: 0.8 });
        else if (ctx.year && CERT_TYPES.has(typeKey)) put(k, { value: String(ctx.year), conf: 0.5 });
        break;
      case 'zeitraum_von': if (ctx.range) put(k, { value: ctx.range.von, conf: 0.8 }); break;
      case 'zeitraum_bis': if (ctx.range) put(k, { value: ctx.range.bis, conf: 0.8 }); break;
      case 'empfaenger': {
        const m = firstMatch(doc, RE.empf, 1, true);
        if (m) put(k, { value: cleanIssuer(m.text), conf: 0.8 });
        else if (ctx.issuer) put(k, { value: ctx.issuer, conf: 0.5 });
        break;
      }
      case 'zweck': {
        const m = firstMatch(doc, RE.zweck, 1, true);
        if (m) put(k, { value: m.text.replace(/[\s.;,]+$/, ''), conf: 0.7 });
        break;
      }
      case 'sachspende':
        if (/sachzuwendung|sachspende/.test(doc.text) && !/keine sach|nicht um eine sach/.test(doc.text)) put(k, { value: 'ja', conf: 0.7 });
        else if (/geldzuwendung|geldspende|spendenbetrag|betrag der zuwendung/.test(doc.text)) put(k, { value: 'nein', conf: 0.6 });
        break;
      case 'rechnungsnr': {
        let m = firstMatch(doc, RE.rechnungsnr);
        let v = m && /\d/.test(m.text) ? m.text : null;
        if (!v) { m = firstMatch(doc, RE.rechnungsnr2); v = m && /\d/.test(m.text) ? m.text : null; }
        if (!v) { m = firstMatch(doc, RE.rechnungsnr3); v = m && /\d/.test(m.text) ? m.text : null; }
        if (v) put(k, { value: v.replace(/[.\-\/_]+$/, '').toUpperCase(), conf: 0.8 });
        break;
      }
      case 'iban': put(k, findIban(doc)); break;
      case 'steuernummer': {
        const m = firstMatch(doc, RE.stnr);
        if (m) put(k, { value: m.text.replace(/\s/g, ''), conf: 0.85 });
        break;
      }
      case 'kind_name': {
        const m = firstMatch(doc, RE.kind, 1, true);
        if (m) put(k, { value: m.text.split(/[,;\d]/)[0].trim().split(/\s+/).slice(0, 3).join(' '), conf: 0.6 });
        break;
      }
      case 'km': {
        let hit = null;
        for (const l of doc.lines) {
          const m = RE.km.exec(l);
          if (!m) continue;
          const v = Number(m[1].replace(',', '.'));
          if (!(v > 0 && v < 1000)) continue;
          if (RE.kmCtx.test(l)) { hit = v; break; }
          if (hit == null) hit = v;
        }
        if (hit != null) put(k, { value: hit, conf: 0.6 });
        break;
      }
      case 'tage': {
        if (typeKey === 'homeoffice') { const tb = homeofficeTable(doc); if (tb) { put(k, tb); break; } }
        const m = firstMatch(doc, RE.tage);
        const raw = m && (m.text.match(/\d+/) || [])[0];
        const v = raw ? Number(raw) : NaN;
        if (v > 0 && v <= 366) put(k, { value: v, conf: 0.6 });
        else {
          for (const l of doc.lines) {
            const mm = RE.tage.exec(l);
            const n = mm && Number(mm[1] || mm[2]);
            if (n > 0 && n <= 366) { put(k, { value: n, conf: 0.6 }); break; }
          }
        }
        break;
      }
      default: break;
    }
  }
  return out;
}

const fmtDe = (iso) => iso.split('-').reverse().join('.');

// ================================================================================================
// Hinweise (Flags)
// ================================================================================================

const BAR_RE = /bar bezahlt|barzahlung|betrag dankend erhalten|bezahlt in bar|barzahler|bar erhalten|dankend in bar|bar kassiert|barverkauf|in bar erhalten|cash/;
const BAR_NEG = /(?:keine|nicht|ohne|unbar|ausgeschlossen)[^.\n]{0,25}$/;

function detectBar(text) {
  const re = new RegExp(BAR_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (BAR_NEG.test(before)) continue;
    if (/^[^\n]{0,15}(?:nicht|ausgeschlossen|unmoeglich|nicht moeglich)/.test(after)) continue;
    return true;
  }
  return false;
}

const BAR_CATS = new Set(['haushalt35a', 'energetisch', 'kinder']);
const NO_AMOUNT = new Set(['behinderung', 'schulbescheinigung', 'finanzamt_schreiben', 'homeoffice', 'privat_irrelevant',
  'sonstiges', 'kindergeld', 'verlustbescheinigung', 'mietvertrag', 'bewerbung']);
const ERSTATTUNG = new Set(['arzt', 'zahnarzt', 'apotheke', 'optiker', 'krankenhaus', 'therapie', 'heilpraktiker', 'hilfsmittel', 'pflege']);
const ANTEILIG = new Set(['telefon_internet', 'kfz_haftpflicht', 'steuerberatung']);
const LABOR_TYPES = new Set(['handwerker', 'haushaltsnahe_dl', 'schornsteinfeger', 'energetisch35c']);

function computeFlags({ docType, category, amount, date, year, fields, doc, meta, dateInfo, hasRange, bar, relevance }) {
  const flags = [];
  const add = (f) => { if (!flags.includes(f)) flags.push(f); };
  if (doc.text.replace(/\s/g, '').length < 10) add('text_fehlt');
  if (relevance !== 'irrelevant') {
    if (amount == null && !NO_AMOUNT.has(docType)) add('betrag_fehlt');
    if (!date && !hasRange && !(year && CERT_TYPES.has(docType))) add('datum_fehlt');
  }
  if (dateInfo && dateInfo.future) add('zukunft');
  if (meta.taxYear && year && Number(meta.taxYear) !== year) add('jahr_abweichend');
  if (bar && BAR_CATS.has(category)) add('barzahlung');
  if (LABOR_TYPES.has(docType) && !fields.arbeitskosten) add('arbeitskosten_fehlen');
  if (docType === 'arbeitsmittel' && amount != null && amount > 0) {
    const net = fields.netto ? fields.netto.value : null;
    const over = net != null ? net > 800 : amount > 952;
    add(over ? 'ueber_gwg' : 'unter_gwg');
  }
  if (ERSTATTUNG.has(docType)) add('erstattung_moeglich');
  if (ANTEILIG.has(docType)) add('nur_anteilig');
  if (docType === 'spende' && amount != null && amount > 300 &&
      !R('zuwendungsbestaetigung|bestaetigung ueber (?:geld)?zuwendung|spendenbescheinigung|sammelbestaetigung').test(doc.text)) add('spende_ueber_300_bestaetigung');
  if (meta.ocr) {
    const oc = typeof meta.ocrConfidence === 'number' ? meta.ocrConfidence : null;
    if ((oc != null && oc < 0.75) || (oc == null && (amount == null || !date))) add('ocr_unsicher');
  }
  return flags;
}

// ================================================================================================
// Hauptfunktion
// ================================================================================================

const PAY_RULES = [
  ['haushalt35a', R('handwerk|sanitaer|elektro|maler|heizung|montage|reparatur|installat|dachdeck|tischler|schreiner|klempner|fliesen|renovier|sanierung|schornstein|gartenbau|gartenpflege|reinigung|hausmeister|winterdienst')],
  ['sonderausgaben', R('spende|spendenquittung|hilfswerk|zuwendung|kirchensteuer|schulgeld')],
  ['kinder', R('kita|kindergarten|kinderbetreuung|tagesmutter|hort\\b')],
  ['agb', R('arzt|aerztin|zahnarzt|apotheke|klinik|krankenhaus|physio|therapie|optik')],
  ['vorsorge', R('versicherung|haftpflicht')],
  ['finanzamt', R('finanzamt|einkommensteuer|steuernummer')],
  ['haushalt35a', R('(?:rechnung|rg\\.?|re)[\\s.-]*(?:nr\\.?\\s*)?[a-z]{0,3}-?\\d{4}-\\d{2,}')],
];

/** Kategorie eines Zahlungsnachweises aus Empfänger/Verwendungszweck ableiten. */
function paymentCategory(foldedText) {
  for (const [cat, re] of PAY_RULES) if (re.test(foldedText)) return cat;
  return 'unklar';
}

/** Summe der Spalte „Homeoffice-Tage“ aus einer Tabelle (Zeilen „Jan | 8 | 14“). */
function homeofficeTable(doc) {
  const L = doc.lines;
  for (let i = 0; i < L.length; i++) {
    if (!L[i].includes('|')) continue;
    const cells = L[i].split('|').map((c) => c.trim());
    const col = cells.findIndex((c) => /homeoffice/.test(c) && /tage/.test(c));
    if (col < 0) continue;
    let sum = 0, n = 0;
    for (let j = i + 1; j < L.length; j++) {
      const l = L[j];
      if (l.startsWith('[')) break;
      if (!l.includes('|') && !/^summe/.test(l)) { if (n > 0) break; continue; }
      const cs = l.split('|').map((c) => c.trim());
      if (/^(?:summe|gesamt|pauschale)/.test(cs[0])) break;
      if (/^\d{1,3}(?:[.,]0+)?$/.test(cs[col] || '')) { sum += parseInt(cs[col], 10); n++; }
    }
    if (n) return { value: sum, conf: 0.85 };
  }
  return null;
}

const stripParen = (s) => s.replace(/\s*\(.*\)\s*/, '').trim();

/**
 * Analysiert einen Beleg-Text regelbasiert.
 * @param {string} text Volltext (PDF-Text oder OCR)
 * @param {{filename?:string, mime?:string, ocr?:boolean, ocrConfidence?:number, lastModified?:number, taxYear?:number, now?:number}} [meta]
 * @returns {{category:string, docType:string, confidence:number, alternatives:{docType:string,score:number}[],
 *   relevance:'relevant'|'pruefen'|'irrelevant', year:number|null, date:string|null, amount:number|null,
 *   currency:string, issuer:string, title:string, fields:Object, flags:string[]}}
 */
export function analyze(text, meta = {}) {
  meta = meta || {};
  const doc = prepare(text);
  const today = typeof meta.now === 'number' ? meta.now : NOW();

  // --- Klassifizierung ---
  const scores = scoreTypes(doc, meta);
  const probs = softmax(scores);
  const top = scores[0];
  let docType = 'sonstiges';
  let confidence = 0.1;
  let altStart = 0;
  if (top && top.score >= 2.0) {
    docType = top.key;
    confidence = probs[0];
    altStart = 1;
  } else if (top) {
    confidence = Math.min(0.3, probs[0]);
  }
  const alternatives = [];
  for (let i = altStart; i < scores.length && alternatives.length < 3; i++) {
    if (scores[i].score <= 0 || probs[i] < 0.02) continue;
    alternatives.push({ docType: scores[i].key, score: Math.round(probs[i] * 1000) / 1000 });
  }
  const def = docTypeOf(docType);
  const category = docType === 'zahlungsnachweis' ? paymentCategory(doc.text) : def.category;

  // --- Betrag, Datum, Jahr ---
  const range = findRange(doc.lines);
  let amountInfo = findAmount(doc, docType);
  let currency = detectCurrency(doc.text);
  let dateInfo = findDate(doc, docType, range, today);
  let date = dateInfo.iso;
  const fname = fold(normalizeText(meta.filename || ''));
  if (!date && range && CERT_TYPES.has(docType)) date = range.bis;
  if (!date && fname) {
    const fd = findDates(fname.replace(/_/g, ' ').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
      .filter((d) => Date.parse(d.iso) <= today + 86400000);
    if (fd.length) date = fd[0].iso;
  }
  const explicitYear = findExplicitYear(doc, range);
  let year = null;
  if (CERT_TYPES.has(docType) && explicitYear) year = explicitYear;
  else if (date) year = Number(date.slice(0, 4));
  else if (explicitYear) year = explicitYear;
  else {
    const fy = /(?<!\d)(20[12]\d)(?!\d)/.exec(fname);
    if (fy) year = Number(fy[1]);
    else year = mostFrequentYear(doc, new Date(today).getUTCFullYear());
  }
  if (docType === 'homeoffice' && year && dateInfo.conf < 0.7) date = `${year}-12-31`;

  // --- Aussteller ---
  const issuer = findIssuer(doc);
  const bar = detectBar(doc.text);

  // --- Felder ---
  let amount = amountInfo.value;
  const ctx = { amount, category, range, year, issuer, bar };
  const fields = extractFields(doc, docType, ctx);
  if (docType === 'lohnsteuerbescheinigung' && fields.brutto) amount = fields.brutto.value;
  if (docType === 'privat_irrelevant' && amountInfo.conf < 0.5) amount = null;
  if (docType === 'homeoffice' && fields.tage && (amount == null || amountInfo.conf < 0.5)) {
    const lim = LIMITS[year] || LIMITS[2026] || LIMITS[2025];
    const rate = lim && lim.homeofficeProTag ? lim.homeofficeProTag.value : 6;
    const maxDays = lim && lim.homeofficeMaxTage ? lim.homeofficeMaxTage.value : 210;
    amount = Math.round(Math.min(fields.tage.value, maxDays) * rate * 100) / 100;
  }

  // --- Titel ---
  let title = '';
  if (ITEM_TYPES.has(docType)) title = findItem(doc);
  if (!title) {
    const base = stripParen(def.label);
    if (CERT_TYPES.has(docType) && year) title = `${base} ${year}`;
    else title = issuer ? `${base} – ${issuer}` : base;
  }

  // --- Relevanz ---
  let relevance = 'relevant';
  if (docType === 'sonstiges' || confidence < 0.45 || category === 'unklar') relevance = 'pruefen';
  else if (docType === 'privat_irrelevant') relevance = 'irrelevant';

  const flags = computeFlags({
    docType, category, amount, date, year, fields, doc, meta, dateInfo, hasRange: !!range, bar, relevance,
  });
  if (flags.includes('text_fehlt')) relevance = 'pruefen';

  return {
    category,
    docType,
    confidence: Math.round(confidence * 1000) / 1000,
    alternatives,
    relevance,
    year,
    date,
    amount: amount == null ? null : amount,
    currency,
    issuer,
    title,
    fields,
    flags,
  };
}

// ================================================================================================
// Dateinamen, Pfade, Zusammenführen
// ================================================================================================

const LEGAL_SUFFIX = /\s+(?:gmbh\s*&\s*co\.?\s*kgaa?|gmbh\s*&\s*co\.?\s*kg|&\s*co\.?\s*kg|gmbh|mbh|ag|kgaa|kg|ohg|ug(?:\s*\(haftungsbeschränkt\))?|gbr|se|eg|e\.\s?v\.?|e\.\s?k\.?|e\.\s?kfm\.?|ltd\.?|inc\.?|llc|co\.?)\.?$/i;
const TITLE_TOKEN = /^(?:praxis|dr\.?|prof\.?|med\.?|dent\.?|rer\.?|nat\.?|phil\.?|jur\.?|ing\.?|dipl\.?(?:-[\p{L}]+\.?)?|herr|frau)$/iu;
const DANGLING = new Set(['und', 'für', 'fuer', 'der', 'die', 'das', 'am', 'im', 'in', 'zum', 'zur', 'von', 'vom', 'bei', 'mit', 'a.', '-']);

/**
 * Kürzt einen Aussteller für den Dateinamen: Label-Präfixe, Titel (Praxis Dr. med.) und
 * Rechtsformen entfallen, „&“ → „und“, Kürzung an Wortgrenzen (max 32 Zeichen).
 * @param {string} issuer
 * @param {number} [max=32]
 * @returns {string}
 */
function shortIssuer(issuer, max = 32) {
  let s = String(issuer || '').replace(ISS_LABEL_STRIP, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  for (let n = 0; n < 4 && LEGAL_SUFFIX.test(s) && s.replace(LEGAL_SUFFIX, '').trim().length >= 3; n++) s = s.replace(LEGAL_SUFFIX, '').trim();
  let toks = s.split(' ');
  while (toks.length > 1 && TITLE_TOKEN.test(toks[0])) toks.shift();
  while (toks.length > 1 && TITLE_TOKEN.test(toks[toks.length - 1])) toks.pop();
  toks = toks.map((t) => (t === '&' ? 'und' : t.replace(/&/g, 'und')));
  let out = '';
  for (const t of toks) {
    const next = out ? `${out} ${t}` : t;
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = toks[0].slice(0, max);
  const parts = out.split(' ');
  while (parts.length > 1 && DANGLING.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return sanitizeName(parts.join(' '), max);
}

/**
 * Baut den Zieldateinamen: `<YYYY-MM-DD>_<Belegart>_<Aussteller>_<Betrag>EUR.<ext>`.
 * Bei Jahresbescheinigungen (periodic) oder wenn das Belegjahr vom Steuerjahr abweicht, steht
 * das Steuerjahr statt des Datums vorn. Fehlende Teile entfallen; maximal rund 100 Zeichen.
 * @param {object} doc Beleg (date, year, docType, issuer, amount, currency, file.ext/name)
 * @returns {string}
 */
export function buildFilename(doc) {
  const file = doc.file || {};
  let ext = (file.ext || '').replace(/^\./, '');
  if (!ext && file.name && /\.[A-Za-z0-9]{1,6}$/.test(file.name)) ext = file.name.split('.').pop();
  ext = ext.toLowerCase();
  const def = docTypeOf(doc.docType);
  let date = doc.date && /^\d{4}-\d{2}-\d{2}$/.test(doc.date) ? doc.date : '';
  const year = doc.year ? String(doc.year) : '';
  if (year && (def.periodic || (date && date.slice(0, 4) !== year))) date = year;
  const label = sanitizeName(def.filenameLabel || '', 40);
  let issuer = shortIssuer(doc.issuer || '');
  let amount = '';
  if (typeof doc.amount === 'number' && Number.isFinite(doc.amount)) {
    amount = doc.amount.toFixed(2).replace('.', ',') + (doc.currency || 'EUR').replace(/[^A-Za-z]/g, '').toUpperCase();
  }
  const extPart = ext ? `.${ext}` : '';
  const join = () => [date, label, issuer, amount].filter(Boolean).join('_');
  let base = join();
  const maxBase = 100 - extPart.length;
  if (base.length > maxBase && issuer) {
    const over = base.length - maxBase;
    issuer = shortIssuer(issuer.replace(/-/g, ' '), Math.max(8, issuer.length - over));
    base = join();
  }
  if (base.length > maxBase) base = base.slice(0, maxBase).replace(/[-_.\s]+$/, '');
  if (!base) base = 'Beleg';
  return base + extPart;
}

/**
 * Zielordner im Export: `<Jahr>/<nr> <Kategorie>` bzw. `Ohne Jahr/…`.
 * @param {object} doc
 * @returns {string}
 */
export function buildPath(doc) {
  const y = doc.year || (doc.date ? Number(String(doc.date).slice(0, 4)) : null);
  const cat = categoryOf(doc.category);
  const folder = sanitizeName(`${cat.nr} ${cat.label}`, 60).replace(/-/g, ' ');
  return `${y ? y : 'Ohne Jahr'}/${folder}`;
}

const MERGE_SCALARS = ['docType', 'category', 'amount', 'currency', 'date', 'year', 'issuer', 'title', 'relevance'];

/**
 * Übernimmt ein Analyseergebnis in den Beleg. Vom Nutzer bearbeitete Felder (`doc.edited`) und
 * Felder mit source 'nutzer' bleiben erhalten.
 * @param {object} doc
 * @param {object} result Ergebnis von analyze()
 * @returns {object} doc (verändert)
 */
export function mergeAnalysis(doc, result) {
  const ed = doc.edited || {};
  const typeEdited = !!ed.docType;
  for (const k of MERGE_SCALARS) {
    if (ed[k]) continue;
    if (typeEdited && (k === 'category' || k === 'relevance')) continue;
    if (k in result) doc[k] = result[k];
  }
  if (!typeEdited) {
    doc.confidence = result.confidence;
    doc.alternatives = result.alternatives;
  }
  const keep = {};
  for (const [k, v] of Object.entries(doc.fields || {})) if (v && (v.source === 'nutzer' || ed[`field:${k}`])) keep[k] = v;
  doc.fields = { ...(result.fields || {}), ...keep };
  const prevDup = (doc.flags || []).includes('duplikat');
  let flags = [...(result.flags || [])];
  if (prevDup && !flags.includes('duplikat')) flags.push('duplikat');
  if (doc.amount != null) flags = flags.filter((f) => f !== 'betrag_fehlt');
  if (doc.date) flags = flags.filter((f) => f !== 'datum_fehlt');
  doc.flags = flags;
  return doc;
}
