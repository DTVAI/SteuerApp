// Belegwerk – Taxonomie: Kategorien, Belegarten, Felder, Hinweise, Limits, Checkliste.
// Reine Daten, kein DOM. Alle Suchbegriffe (strong/keywords/negative) sind normalisiert:
// lowercase, ä→ae, ö→oe, ü→ue, ß→ss.

/** Steuerliche Kategorien (Anlagen der Steuererklärung). */
export const CATEGORIES = [
  { key: 'arbeit', nr: '01', label: 'Arbeitslohn', anlage: 'Anlage N', hue: 215,
    tip: 'Lohnsteuerbescheinigung und Gehaltsabrechnungen: Grundlage der Anlage N.' },
  { key: 'werbungskosten', nr: '02', label: 'Werbungskosten', anlage: 'Anlage N', hue: 200,
    tip: 'Berufliche Ausgaben. Pauschale 1.230 € wird automatisch angesetzt, nur darüber lohnt Einzelnachweis.' },
  { key: 'vorsorge', nr: '03', label: 'Vorsorgeaufwendungen', anlage: 'Anlage Vorsorgeaufwand', hue: 265,
    tip: 'Kranken-, Pflege-, Haftpflicht-, Unfall-, Rürup-Beiträge. Meist elektronisch übermittelt.' },
  { key: 'sonderausgaben', nr: '04', label: 'Sonderausgaben', anlage: 'Anlage Sonderausgaben', hue: 285,
    tip: 'Spenden, Kirchensteuer, Schulgeld, Erstausbildung. Zuwendungsbestätigung aufbewahren.' },
  { key: 'agb', nr: '05', label: 'Außergewöhnliche Belastungen', anlage: 'Anlage Außergewöhnliche Belastungen', hue: 350,
    tip: 'Krankheits-, Pflege-, Bestattungskosten. Wirkt erst oberhalb der zumutbaren Eigenbelastung.' },
  { key: 'haushalt35a', nr: '06', label: 'Haushaltsnahe Leistungen', anlage: 'Anlage Haushaltsnahe Aufwendungen', hue: 30,
    tip: 'Handwerker und haushaltsnahe Dienste: 20 % der Arbeitskosten. Nur mit Rechnung und Überweisung.' },
  { key: 'kinder', nr: '07', label: 'Kinder', anlage: 'Anlage Kind', hue: 330,
    tip: 'Kinderbetreuung, Kindergeld, Schul- und Ausbildungsnachweise.' },
  { key: 'kapital', nr: '08', label: 'Kapitalerträge', anlage: 'Anlage KAP', hue: 150,
    tip: 'Steuerbescheinigungen von Bank und Broker. Meist nur nötig bei Günstigerprüfung oder Verlusten.' },
  { key: 'vermietung', nr: '09', label: 'Vermietung', anlage: 'Anlage V', hue: 95,
    tip: 'Mieteinnahmen und Werbungskosten der Immobilie: Zinsen, Grundsteuer, Hausgeld, Erhaltung.' },
  { key: 'rente', nr: '10', label: 'Renten', anlage: 'Anlage R', hue: 245,
    tip: 'Rentenbezugsmitteilungen und Leistungsmitteilungen. Werden dem Finanzamt meist direkt gemeldet.' },
  { key: 'sonstige', nr: '11', label: 'Sonstige Einkünfte', anlage: 'Anlage SO', hue: 180,
    tip: 'Private Veräußerungsgeschäfte, Krypto, Unterhaltsleistungen.' },
  { key: 'energetisch', nr: '12', label: 'Energetische Maßnahmen', anlage: 'Anlage Energetische Maßnahmen', hue: 60,
    tip: 'Sanierung am selbstgenutzten Wohneigentum: 20 % über drei Jahre, nur mit Fachunternehmer-Bescheinigung.' },
  { key: 'finanzamt', nr: '13', label: 'Finanzamt', anlage: 'Bescheide', hue: 0,
    tip: 'Steuerbescheide und Schreiben des Finanzamts. Einspruchsfrist: ein Monat nach Bekanntgabe.' },
  { key: 'unklar', nr: '14', label: 'Unklar', anlage: 'Zuordnen', hue: 40,
    tip: 'Nicht eindeutig erkannt. Bitte Belegart manuell wählen.' },
  { key: 'irrelevant', nr: '15', label: 'Nicht steuerrelevant', anlage: 'Ohne Anlage', hue: 220,
    tip: 'Werbung, Newsletter, Lebensmittel-Kassenbons. Wird nicht exportiert, falls ignoriert.' },
];

/** Datenfelder, die extrahiert oder manuell erfasst werden. */
export const FIELDS = {
  // Lohnsteuerbescheinigung
  brutto: { label: 'Bruttoarbeitslohn', type: 'money', hint: 'Zeile 3' },
  lohnsteuer: { label: 'Einbehaltene Lohnsteuer', type: 'money', hint: 'Zeile 4' },
  soli: { label: 'Solidaritätszuschlag', type: 'money', hint: 'Zeile 5' },
  kirchensteuer: { label: 'Kirchensteuer', type: 'money', hint: 'Zeile 6' },
  rv_an: { label: 'Rentenversicherung (AN-Anteil)', type: 'money', hint: 'Zeile 23a' },
  kv_an: { label: 'Krankenversicherung (AN-Anteil)', type: 'money', hint: 'Zeile 25' },
  pv_an: { label: 'Pflegeversicherung (AN-Anteil)', type: 'money', hint: 'Zeile 26' },
  av_an: { label: 'Arbeitslosenversicherung (AN-Anteil)', type: 'money', hint: 'Zeile 27' },
  steuerid: { label: 'Steuer-ID', type: 'text', hint: '11 Ziffern' },
  etin: { label: 'eTIN', type: 'text', hint: '' },
  steuerklasse: { label: 'Steuerklasse', type: 'number', hint: '1 bis 6' },
  // §35a
  arbeitskosten: { label: 'Arbeitskosten (inkl. Anfahrt)', type: 'money', hint: 'Lohnanteil, begünstigt' },
  materialkosten: { label: 'Materialkosten', type: 'money', hint: 'nicht begünstigt' },
  zahlungsart: { label: 'Zahlungsart', type: 'text', hint: 'Überweisung, Bar, Lastschrift' },
  // KAP
  kapitalertraege: { label: 'Kapitalerträge', type: 'money', hint: 'Zeile 7 der Bescheinigung' },
  kapest: { label: 'Kapitalertragsteuer', type: 'money', hint: '' },
  soli_kap: { label: 'Solidaritätszuschlag (KAP)', type: 'money', hint: '' },
  kist_kap: { label: 'Kirchensteuer (KAP)', type: 'money', hint: '' },
  quellensteuer: { label: 'Anrechenbare Quellensteuer', type: 'money', hint: '' },
  verluste: { label: 'Verlusttopf / Verluste', type: 'money', hint: '' },
  // Versicherung
  beitrag: { label: 'Beitrag', type: 'money', hint: 'Jahresbeitrag' },
  versicherungsnr: { label: 'Versicherungs-/Vertragsnummer', type: 'text', hint: '' },
  zeitraum: { label: 'Zeitraum', type: 'text', hint: '' },
  // Spende
  empfaenger: { label: 'Empfänger', type: 'text', hint: '' },
  zweck: { label: 'Zweck', type: 'text', hint: '' },
  sachspende: { label: 'Sachspende', type: 'text', hint: 'ja/nein' },
  // allgemein
  rechnungsnr: { label: 'Rechnungsnummer', type: 'text', hint: '' },
  iban: { label: 'IBAN', type: 'iban', hint: '' },
  steuernummer: { label: 'Steuernummer', type: 'text', hint: '' },
  netto: { label: 'Nettobetrag', type: 'money', hint: '' },
  mwst: { label: 'Umsatzsteuer', type: 'money', hint: '' },
  kind_name: { label: 'Name des Kindes', type: 'text', hint: '' },
  zeitraum_von: { label: 'Zeitraum von', type: 'date', hint: '' },
  zeitraum_bis: { label: 'Zeitraum bis', type: 'date', hint: '' },
  km: { label: 'Kilometer', type: 'number', hint: 'einfache Strecke' },
  tage: { label: 'Tage', type: 'number', hint: '' },
};

/** Hinweis-Codes an Belegen. */
export const FLAGS = {
  barzahlung: { label: 'Barzahlung', level: 'warn', tip: 'Bar bezahlt: §35a-Ermäßigung entfällt, nur Überweisung zählt.' },
  arbeitskosten_fehlen: { label: 'Arbeitskosten nicht ausgewiesen', level: 'warn', tip: 'Nur der Lohnanteil ist begünstigt. Getrennten Ausweis anfordern.' },
  jahr_abweichend: { label: 'Anderes Jahr', level: 'warn', tip: 'Beleg stammt nicht aus dem gewählten Steuerjahr. Zuordnung prüfen.' },
  betrag_fehlt: { label: 'Betrag fehlt', level: 'warn', tip: 'Kein Betrag erkannt. Bitte ergänzen.' },
  datum_fehlt: { label: 'Datum fehlt', level: 'warn', tip: 'Kein Datum erkannt. Bitte ergänzen.' },
  unter_gwg: { label: 'Geringwertiges Wirtschaftsgut', level: 'info', tip: 'Bis 952 € brutto (800 € netto): sofort im Jahr der Anschaffung absetzbar.' },
  ueber_gwg: { label: 'Über GWG-Grenze', level: 'warn', tip: 'Über 952 € brutto: Abschreibung über die Nutzungsdauer (Laptop/PC: 1 Jahr laut BMF).' },
  erstattung_moeglich: { label: 'Erstattung möglich', level: 'info', tip: 'Erstattung durch Kasse/Arbeitgeber/Versicherung abziehen, nur der Eigenanteil zählt.' },
  nur_anteilig: { label: 'Nur anteilig absetzbar', level: 'info', tip: 'Private Mitnutzung herausrechnen, z. B. pauschal 20 % bei Telefon/Internet.' },
  spende_ueber_300_bestaetigung: { label: 'Zuwendungsbestätigung nötig', level: 'warn', tip: 'Über 300 €: Zuwendungsbestätigung des Empfängers erforderlich.' },
  ocr_unsicher: { label: 'Texterkennung unsicher', level: 'warn', tip: 'Scan schlecht lesbar. Werte bitte prüfen.' },
  duplikat: { label: 'Mögliches Duplikat', level: 'warn', tip: 'Gleicher Inhalt oder gleiche Werte bereits vorhanden.' },
  text_fehlt: { label: 'Kein Text erkannt', level: 'error', tip: 'Es konnte kein Text gelesen werden. Bitte manuell zuordnen.' },
  zukunft: { label: 'Datum in der Zukunft', level: 'warn', tip: 'Das erkannte Datum liegt in der Zukunft. Bitte prüfen.' },
};

const pb = (value, label, unsicher = false) => ({ value, label, unsicher });

/** Gesetzliche Pauschalen und Höchstbeträge je Steuerjahr. */
export const LIMITS = {
  2025: {
    arbeitnehmerPauschbetrag: pb(1230, 'Arbeitnehmer-Pauschbetrag'),
    entfernungspauschale: pb(0.30, 'Entfernungspauschale je km (1.–20. km); ab 21. km 0,38 €'),
    entfernungspauschaleAb21: pb(0.38, 'Entfernungspauschale je km ab 21. km'),
    homeofficeProTag: pb(6, 'Homeoffice-Pauschale je Tag'),
    homeofficeMaxTage: pb(210, 'Homeoffice-Pauschale, maximale Tage (1.260 €)'),
    sonderausgabenPauschbetrag: pb(36, 'Sonderausgaben-Pauschbetrag (Zusammenveranlagung 72 €)'),
    sparerPauschbetrag: pb(1000, 'Sparer-Pauschbetrag (Zusammenveranlagung 2.000 €)'),
    grundfreibetrag: pb(12096, 'Grundfreibetrag'),
    kinderfreibetrag: pb(6672, 'Kinderfreibetrag je Kind, beide Eltern (ohne BEA-Freibetrag 2.928 €)'),
    kindergeldMonat: pb(255, 'Kindergeld je Kind und Monat'),
    basisrenteHoechst: pb(29344, 'Höchstbetrag Basisrente (Alleinstehende)'),
    vorsorgeSonstigeAN: pb(1900, 'Sonstige Vorsorge, Höchstbetrag Arbeitnehmer'),
    vorsorgeSonstigeSelbst: pb(2800, 'Sonstige Vorsorge, Höchstbetrag ohne Arbeitgeberzuschuss'),
    handwerkerMax: pb(1200, '§35a Handwerker: max. Steuerermäßigung (20 % von 6.000 €)'),
    haushaltsnahMax: pb(4000, '§35a haushaltsnahe Dienste: max. Steuerermäßigung (20 % von 20.000 €)'),
    minijobHaushaltMax: pb(510, '§35a Minijob im Haushalt: max. Steuerermäßigung (20 % von 2.550 €)'),
    kinderbetreuungAnteil: pb(0.8, 'Kinderbetreuung: abziehbarer Anteil (ab 2025 80 %)', true),
    kinderbetreuungMax: pb(4800, 'Kinderbetreuung: max. abziehbar je Kind (bis 14 J.)', true),
    gwgNetto: pb(800, 'GWG-Grenze netto'),
    gwgBrutto: pb(952, 'GWG-Grenze brutto (19 % USt)'),
    pflegePauschbetragPG2: pb(600, 'Pflege-Pauschbetrag Pflegegrad 2'),
    pflegePauschbetragPG3: pb(1100, 'Pflege-Pauschbetrag Pflegegrad 3'),
    pflegePauschbetragPG45: pb(1800, 'Pflege-Pauschbetrag Pflegegrad 4/5'),
    unterhaltHoechst: pb(12096, 'Unterhalt an bedürftige Personen: Höchstbetrag'),
    veraeusserungFreigrenze: pb(1000, 'Private Veräußerungsgeschäfte: Freigrenze (§23 EStG)'),
    schulgeldAnteil: pb(0.3, 'Schulgeld: abziehbarer Anteil (max. 5.000 €)'),
    erstausbildungMax: pb(6000, 'Erstausbildung: Sonderausgaben bis'),
    kontofuehrungPauschal: pb(16, 'Kontoführungsgebühren pauschal ohne Nachweis', true),
    spendeOhneBestaetigung: pb(300, 'Spenden: Kontoauszug genügt bis'),
    energetisch35cMax: pb(40000, '§35c: max. Ermäßigung je Objekt (20 % von 200.000 €)'),
    abgabefristOhneBerater: pb('31.07.2026', 'Abgabefrist ohne Steuerberater (Steuerjahr 2025)'),
  },
  2026: {
    arbeitnehmerPauschbetrag: pb(1230, 'Arbeitnehmer-Pauschbetrag'),
    entfernungspauschale: pb(0.38, 'Entfernungspauschale je km ab dem 1. km (ab 2026)', true),
    entfernungspauschaleAb21: pb(0.38, 'Entfernungspauschale je km ab 21. km'),
    homeofficeProTag: pb(6, 'Homeoffice-Pauschale je Tag'),
    homeofficeMaxTage: pb(210, 'Homeoffice-Pauschale, maximale Tage (1.260 €)'),
    sonderausgabenPauschbetrag: pb(36, 'Sonderausgaben-Pauschbetrag (Zusammenveranlagung 72 €)'),
    sparerPauschbetrag: pb(1000, 'Sparer-Pauschbetrag (Zusammenveranlagung 2.000 €)'),
    grundfreibetrag: pb(12348, 'Grundfreibetrag', true),
    kinderfreibetrag: pb(6828, 'Kinderfreibetrag je Kind, beide Eltern (ohne BEA-Freibetrag 2.928 €)', true),
    kindergeldMonat: pb(259, 'Kindergeld je Kind und Monat', true),
    basisrenteHoechst: pb(30826, 'Höchstbetrag Basisrente (Alleinstehende)', true),
    vorsorgeSonstigeAN: pb(1900, 'Sonstige Vorsorge, Höchstbetrag Arbeitnehmer'),
    vorsorgeSonstigeSelbst: pb(2800, 'Sonstige Vorsorge, Höchstbetrag ohne Arbeitgeberzuschuss'),
    handwerkerMax: pb(1200, '§35a Handwerker: max. Steuerermäßigung (20 % von 6.000 €)'),
    haushaltsnahMax: pb(4000, '§35a haushaltsnahe Dienste: max. Steuerermäßigung (20 % von 20.000 €)'),
    minijobHaushaltMax: pb(510, '§35a Minijob im Haushalt: max. Steuerermäßigung (20 % von 2.550 €)'),
    kinderbetreuungAnteil: pb(0.8, 'Kinderbetreuung: abziehbarer Anteil', true),
    kinderbetreuungMax: pb(4800, 'Kinderbetreuung: max. abziehbar je Kind (bis 14 J.)', true),
    gwgNetto: pb(800, 'GWG-Grenze netto'),
    gwgBrutto: pb(952, 'GWG-Grenze brutto (19 % USt)'),
    pflegePauschbetragPG2: pb(600, 'Pflege-Pauschbetrag Pflegegrad 2'),
    pflegePauschbetragPG3: pb(1100, 'Pflege-Pauschbetrag Pflegegrad 3'),
    pflegePauschbetragPG45: pb(1800, 'Pflege-Pauschbetrag Pflegegrad 4/5'),
    unterhaltHoechst: pb(12348, 'Unterhalt an bedürftige Personen: Höchstbetrag', true),
    veraeusserungFreigrenze: pb(1000, 'Private Veräußerungsgeschäfte: Freigrenze (§23 EStG)'),
    schulgeldAnteil: pb(0.3, 'Schulgeld: abziehbarer Anteil (max. 5.000 €)'),
    erstausbildungMax: pb(6000, 'Erstausbildung: Sonderausgaben bis'),
    kontofuehrungPauschal: pb(16, 'Kontoführungsgebühren pauschal ohne Nachweis', true),
    spendeOhneBestaetigung: pb(300, 'Spenden: Kontoauszug genügt bis'),
    energetisch35cMax: pb(40000, '§35c: max. Ermäßigung je Objekt (20 % von 200.000 €)'),
    abgabefristOhneBerater: pb('31.07.2027', 'Abgabefrist ohne Steuerberater (Steuerjahr 2026)', true),
  },
};

/** „Fehlt noch?“-Liste typischer Belege. */
export const CHECKLIST = [
  { docType: 'lohnsteuerbescheinigung', label: 'Lohnsteuerbescheinigung', when: 'immer bei Anstellung' },
  { docType: 'jahressteuerbescheinigung', label: 'Jahressteuerbescheinigung der Bank', when: 'bei Depot oder Zinserträgen über Sparer-Pauschbetrag' },
  { docType: 'krankenversicherung', label: 'Beitragsbescheinigung Krankenversicherung', when: 'bei privater Versicherung oder Zusatzbeiträgen' },
  { docType: 'spende', label: 'Spendenbescheinigungen', when: 'bei Spenden über 300 €' },
  { docType: 'gewerkschaft', label: 'Gewerkschafts-/Verbandsbeitrag', when: 'bei Mitgliedschaft' },
  { docType: 'arbeitsmittel', label: 'Rechnungen Arbeitsmittel', when: 'bei beruflicher Anschaffung' },
  { docType: 'homeoffice', label: 'Homeoffice-Tage / Bescheinigung', when: 'bei Arbeit von zu Hause' },
  { docType: 'handwerker', label: 'Handwerkerrechnungen mit Überweisungsbeleg', when: 'bei Reparatur oder Renovierung' },
  { docType: 'nebenkostenabrechnung', label: 'Nebenkostenabrechnung mit §35a-Anteil', when: 'bei Miete oder Eigentum' },
  { docType: 'kita', label: 'Kita-/Betreuungsrechnungen', when: 'bei Kindern unter 14 Jahren' },
  { docType: 'rentenbezug', label: 'Rentenbezugsmitteilung / Renteninformation', when: 'bei Rentenbezug' },
  { docType: 'haftpflicht', label: 'Versicherungsnachweise (Haftpflicht, BU, Unfall)', when: 'bei bestehenden Verträgen' },
  { docType: 'arzt', label: 'Krankheitskosten (Eigenanteile)', when: 'bei hohen Gesundheitskosten' },
  { docType: 'steuerbescheid', label: 'Letzter Steuerbescheid', when: 'für Vorjahresvergleich' },
];

const DT = [];
/** Kurzschreibweise zum Anlegen einer Belegart. */
function dt(key, label, short, category, filenameLabel, o) {
  DT.push({ key, label, short, category, strong: o.s || [], keywords: o.k || [], negative: o.n || [],
    fields: o.f || [], tip: o.t || '', filenameLabel, periodic: false });
}

// ---- Arbeitslohn / Werbungskosten -----------------------------------------------------------
dt('lohnsteuerbescheinigung', 'Lohnsteuerbescheinigung', 'LStB', 'arbeit', 'Lohnsteuerbescheinigung', {
  s: ['ausdruck der elektronischen lohnsteuerbescheinigung', 'elektronische lohnsteuerbescheinigung', 'lohnsteuerbescheinigung fuer'],
  k: ['bruttoarbeitslohn', 'einbehaltene lohnsteuer', 'solidaritaetszuschlag', 'kirchensteuer des arbeitnehmers', 'etin', 'steuerklasse', 'steuerliche identifikationsnummer', 'bescheinigungszeitraum', 'lohnsteuerbescheinigung', 'arbeitgeberanteil'],
  n: ['angebot', 'bestellung'],
  f: ['brutto', 'lohnsteuer', 'soli', 'kirchensteuer', 'rv_an', 'kv_an', 'pv_an', 'av_an', 'steuerid', 'etin', 'steuerklasse'],
  t: 'Grundlage der Anlage N. Werte stehen elektronisch beim Finanzamt, Ausdruck dient der Kontrolle und Eintragung in die Erklärung.' });
dt('gehaltsabrechnung', 'Gehaltsabrechnung', 'Gehalt', 'arbeit', 'Gehaltsabrechnung', {
  s: ['entgeltabrechnung', 'gehaltsabrechnung', 'lohnabrechnung', 'verdienstabrechnung', 'lohn/gehaltsabrechnung'],
  k: ['gesamtbrutto', 'auszahlungsbetrag', 'netto-verdienst', 'nettoverdienst', 'sv-brutto', 'steuerbrutto', 'abrechnungsmonat', 'personalnummer', 'vermoegenswirksame leistungen', 'abzuege'],
  n: ['lohnsteuerbescheinigung'],
  f: ['brutto', 'netto', 'lohnsteuer', 'zeitraum'],
  t: 'Nur Kontrollbeleg: Die Dezember-Abrechnung zeigt Jahressummen. Maßgeblich ist die elektronische Lohnsteuerbescheinigung.' });
dt('arbeitsmittel', 'Arbeitsmittel', 'Arbeitsm.', 'werbungskosten', 'Arbeitsmittel', {
  s: ['arbeitsmittel', 'bueroausstattung', 'schreibtisch', 'buerostuhl'],
  k: ['laptop', 'notebook', 'notebooks', 'usb', 'hdmi', 'display', 'zoll', 'garantie', 'ultrasharp', 'thinkpad', 'macbook', 'lenovo', 'logitech', 'monitor', 'bildschirm', 'tastatur', 'maus', 'headset', 'webcam', 'drucker', 'tablet', 'dockingstation', 'externe festplatte', 'rechnung', 'artikel', 'lieferung', 'ssd', 'ergonomisch', 'aktenordner', 'toner', 'tintenpatrone'],
  n: ['lebensmittel', 'angebot gueltig', 'newsletter', 'handwerker', 'arbeitskosten', 'lohnanteil', 'buchhandlung', 'isbn', 'lehrbuch', 'fachbuch'],
  f: ['rechnungsnr', 'netto', 'mwst'],
  t: 'Beruflich voll absetzbar. Bis 952 € brutto sofort, darüber Abschreibung (Computer/Software: 1 Jahr). Private Nutzung kürzen.' });
dt('fachliteratur', 'Fachliteratur', 'Fachlit.', 'werbungskosten', 'Fachliteratur', {
  s: ['fachliteratur', 'fachbuch', 'fachzeitschrift', 'fachzeitung', 'buchhandlung', 'lehrbuch', 'isbn'],
  k: ['buch', 'auflage', 'abonnement', 'zeitschrift', 'fachverlag', 'verlag', 'e-book', 'ebook', 'loseblatt', 'kommentar', 'wolters kluwer', 'haufe', 'buchhandlung', 'thalia'],
  n: ['roman', 'kochbuch', 'kinderbuch', 'krimi', 'reisefuehrer'],
  f: ['rechnungsnr'],
  t: 'Fachbücher und Zeitschriften mit beruflichem Bezug sind Werbungskosten. Allgemeine Zeitungen und Romane nicht.' });
dt('fortbildung', 'Fortbildung / Seminar', 'Fortbild.', 'werbungskosten', 'Fortbildung', {
  s: ['teilnahmebestaetigung', 'seminargebuehr', 'teilnahmegebuehr', 'fortbildung', 'weiterbildung'],
  k: ['seminar', 'lehrgang', 'zertifikat', 'workshop', 'schulung', 'kursgebuehr', 'kurs', 'training', 'webinar', 'pruefungsgebuehr', 'ihk', 'volkshochschule', 'akademie', 'veranstaltung', 'teilnehmer', 'zertifizierung'],
  n: ['fitness', 'sportkurs', 'kinderkurs'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Berufliche Fortbildung voll absetzbar, dazu Fahrt- und Übernachtungskosten. Teilnahmebestätigung und Rechnung aufbewahren.' });
dt('fahrtkosten', 'Fahrtkosten / ÖPNV-Ticket', 'Fahrt', 'werbungskosten', 'Fahrtkosten', {
  s: ['deutschlandticket', 'jobticket', 'monatskarte', 'jahreskarte', 'bahncard'],
  k: ['fahrkarte', 'fahrschein', 'ticket', 'oepnv', 'verkehrsverbund', 'hvv', 'bvg', 'mvv', 'rmv', 'vrr', 'tankbeleg', 'parkgebuehr', 'fahrtenbuch', 'entfernung', 'pendler', 'arbeitsweg', 'zeitkarte', 'abo'],
  n: ['flugticket', 'hotel', 'konzert', 'kino'],
  f: ['km', 'tage', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Wege zur Arbeit: Entfernungspauschale 0,30 €/km (ab 21. km 0,38 €, 2026 ab 1. km 0,38 €) je Arbeitstag. ÖPNV-Kosten nur, wenn höher.' });
dt('homeoffice', 'Homeoffice-Bescheinigung', 'Homeoffice', 'werbungskosten', 'Homeoffice', {
  s: ['homeoffice-bescheinigung', 'bescheinigung homeoffice', 'bescheinigung ueber homeoffice', 'homeofficetage', 'homeoffice-tage'],
  k: ['homeoffice', 'home-office', 'mobiles arbeiten', 'telearbeit', 'heimarbeit', 'arbeitszimmer', 'tagespauschale', 'remote', 'arbeitstage zu hause'],
  n: ['angebot', 'newsletter'],
  f: ['tage', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Tagespauschale 6 € je Homeoffice-Tag, max. 210 Tage (1.260 €). Tage selbst dokumentieren, Bescheinigung ist freiwillig.' });
dt('gewerkschaft', 'Gewerkschaftsbeitrag', 'Gewerksch.', 'werbungskosten', 'Gewerkschaft', {
  s: ['gewerkschaftsbeitrag', 'beitragsbescheinigung gewerkschaft', 'gewerkschaft', 'gewerkschaften', 'industriegewerkschaft', 'ver.di', 'verdi', 'ig metall', 'igbce', 'ig bau'],
  k: ['gewerkschaft', 'mitgliedsbeitrag', 'beitragsbescheinigung', 'dgb', 'ig bce', 'nahrung-genuss-gaststaetten', 'ngg', 'mitgliedsnummer', 'kampfgeld'],
  n: ['sportverein', 'fitness'],
  f: ['beitrag', 'zeitraum'],
  t: 'Gewerkschaftsbeiträge sind Werbungskosten in voller Höhe. Jahresbescheinigung genügt, steht oft auf dem Kontoauszug.' });
dt('berufsverband', 'Berufsverband', 'Verband', 'werbungskosten', 'Berufsverband', {
  s: ['berufsverband', 'berufsverbandsbeitrag', 'fachverband', 'berufsstaendische'],
  k: ['verband', 'kammer', 'mitgliedsbeitrag', 'mitgliedschaft', 'beitragsrechnung', 'beitragsjahr', 'berufsorganisation', 'aerztekammer', 'ingenieurkammer', 'vdi', 'bdp'],
  n: ['gewerkschaft', 'sportverein', 'spende', 'zuwendung'],
  f: ['beitrag', 'rechnungsnr'],
  t: 'Beiträge zu Berufsverbänden und -kammern sind Werbungskosten, wenn der Verband beruflich relevant ist.' });
dt('bewerbung', 'Bewerbungskosten', 'Bewerbung', 'werbungskosten', 'Bewerbung', {
  s: ['bewerbungskosten', 'bewerbungsunterlagen', 'bewerbungsfoto', 'bewerbungsmappe'],
  k: ['bewerbung', 'vorstellungsgespraech', 'fotograf', 'portraet', 'kopien', 'porto', 'einschreiben', 'bewerbungsfotos'],
  n: [],
  f: ['rechnungsnr'],
  t: 'Bewerbungskosten absetzbar: Fotos, Mappen, Porto, Fahrt zum Vorstellungsgespräch (0,30 €/km). Auch ohne Erfolg.' });
dt('umzug_beruflich', 'Umzugskosten (beruflich)', 'Umzug', 'werbungskosten', 'Umzug', {
  s: ['umzugskosten', 'umzugsunternehmen', 'umzugsrechnung', 'umzugsvertrag'],
  k: ['umzug', 'spedition', 'umzugskartons', 'halteverbot', 'ummeldung', 'transport', 'moebeltransport', 'makler', 'beladung', 'entladung', 'doppelte miete'],
  n: [],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten'],
  t: 'Bei berufsbedingtem Umzug als Werbungskosten absetzbar (Spedition, Fahrten, Pauschale). Sonst nur Arbeitskosten über §35a.' });
dt('doppelte_haushaltsfuehrung', 'Doppelte Haushaltsführung', 'Doppelte HH', 'werbungskosten', 'DoppelteHaushaltsfuehrung', {
  s: ['doppelte haushaltsfuehrung', 'zweitwohnung', 'zweitwohnsitz', 'beschaeftigungsort'],
  k: ['zweitwohnung', 'untermiete', 'moebliertes zimmer', 'wohnung am arbeitsort', 'familienheimfahrt', 'heimfahrt', 'zweitwohnungssteuer'],
  n: ['urlaub'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Zweitwohnung am Arbeitsort: Miete bis 1.000 €/Monat, Familienheimfahrt wöchentlich mit Entfernungspauschale absetzbar.' });
dt('reisekosten', 'Reisekosten / Dienstreise', 'Reise', 'werbungskosten', 'Reisekosten', {
  s: ['reisekostenabrechnung', 'dienstreise', 'geschaeftsreise', 'reisekosten'],
  k: ['hotel', 'uebernachtung', 'bahnticket', 'flugticket', 'flug', 'mietwagen', 'verpflegungsmehraufwand', 'taxi', 'buchungsbestaetigung', 'reisedatum', 'abreise', 'anreise', 'zimmer', 'frueehstueck', 'boarding', 'db navigator', 'deutsche bahn'],
  n: ['urlaub', 'privatreise'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Dienstreisen: Fahrt, Hotel und Verpflegungspauschale (14 €/28 €) absetzbar, soweit der Arbeitgeber nicht erstattet.' });
dt('kontofuehrung', 'Kontoführungsgebühren', 'Kontoführung', 'werbungskosten', 'Kontofuehrung', {
  s: ['kontofuehrungsgebuehr', 'kontofuehrungsentgelt', 'entgeltinformation', 'kontofuehrungsgebuehren'],
  k: ['kontofuehrung', 'girokonto', 'kontoentgelt', 'jahresentgelt', 'buchungsposten', 'entgelt', 'depotgebuehr', 'kartenentgelt', 'kontogebuehr'],
  n: ['dividende', 'kapitalertrag'],
  f: ['beitrag', 'iban', 'zeitraum'],
  t: '16 € pauschal als Werbungskosten ohne Nachweis, höhere Gebühren nur bei Nachweis anteilig (Gehaltskonto).' });
dt('steuerberatung', 'Steuerberatung / Steuersoftware', 'Steuerber.', 'werbungskosten', 'Steuerberatung', {
  s: ['steuerberatungskosten', 'steuerberater', 'lohnsteuerhilfeverein', 'steuersoftware', 'steuerberatung', 'wiso steuer', 'elster', 'taxfix', 'smartsteuer'],
  k: ['steuerberatung', 'steuererklaerung', 'gebuehrenrechnung', 'stbvv', 'honorar', 'mandant', 'steuerkanzlei', 'lohnsteuerhilfe', 'buhl', 'vereinigte lohnsteuerhilfe', 'software lizenz'],
  n: ['bescheid ueber einkommensteuer'],
  f: ['rechnungsnr', 'netto', 'mwst'],
  t: 'Nur der Anteil für Einkünfte (z. B. Anlage N, V, KAP) ist Werbungskosten. Rein private Erklärungshilfe ist nicht absetzbar.' });
dt('arbeitskleidung', 'Arbeitskleidung', 'Arbeitskl.', 'werbungskosten', 'Arbeitskleidung', {
  s: ['arbeitskleidung', 'berufskleidung', 'arbeitsschuhe', 'sicherheitsschuhe', 'schutzkleidung', 'arbeitsschutz'],
  k: ['arbeitshose', 'kittel', 'uniform', 'warnweste', 'schutzhelm', 'sicherheitshandschuhe', 'reinigung der arbeitskleidung', 'berufsbekleidung', 'latzhose', 'sicherheitsstiefel', 'workwear'],
  n: ['freizeitkleidung', 'schuhe damen'],
  f: ['rechnungsnr', 'netto'],
  t: 'Typische Berufskleidung und Schutzausrüstung voll absetzbar, auch Reinigung. Normale Straßenkleidung nicht.' });
dt('telefon_internet', 'Telefon / Internet', 'Telefon', 'werbungskosten', 'TelefonInternet', {
  s: ['mobilfunkrechnung', 'telefonrechnung', 'internetrechnung', 'einzelverbindungsnachweis'],
  k: ['mobilfunk', 'handyvertrag', 'telefon', 'internet', 'dsl', 'flatrate', 'vodafone', 'telekom', 'o2', 'telefonica', '1&1', 'congstar', 'sim', 'tarif', 'glasfaser', 'rufnummer', 'kundennummer', 'grundgebuehr', 'datenvolumen'],
  n: ['stromrechnung', 'gasrechnung'],
  f: ['rechnungsnr', 'netto', 'mwst', 'zeitraum'],
  t: 'Beruflichen Anteil absetzen, ohne Einzelnachweis pauschal bis 20 % des Rechnungsbetrags, max. 20 € monatlich.' });

// ---- Vorsorge ---------------------------------------------------------------------------------
dt('krankenversicherung', 'Krankenversicherung (Beitragsbescheinigung)', 'KV', 'vorsorge', 'Krankenversicherung', {
  s: ['bescheinigung ueber die beitraege zur kranken', 'beitragsbescheinigung zur vorlage beim finanzamt', 'beitragsbescheinigung krankenversicherung', 'steuerbescheinigung krankenversicherung', 'basiskranken', 'beitragsbescheinigung fuer das finanzamt'],
  k: ['krankenversicherung', 'krankenkasse', 'basisabsicherung', 'tk', 'aok', 'barmer', 'dak-gesundheit', 'techniker krankenkasse', 'ikk', 'bkk', 'allianz private kranken', 'debeka', 'signal iduna', 'zusatzbeitrag', 'wahlleistungen', 'krankentagegeld', 'beitragsrueckerstattung', 'versichertennummer', 'versicherter'],
  n: ['arztrechnung', 'rezept', 'liquidation'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Basis-KV und Pflegebeiträge voll absetzbar (Anlage Vorsorgeaufwand). Beitragsrückerstattungen abziehen. Meist elektronisch übermittelt.' });
dt('pflegeversicherung', 'Pflegeversicherung', 'PV', 'vorsorge', 'Pflegeversicherung', {
  s: ['pflegepflichtversicherung', 'private pflegepflichtversicherung', 'beitragsbescheinigung pflegeversicherung', 'soziale pflegeversicherung'],
  k: ['pflegeversicherung', 'pflegekasse', 'pflegebeitrag', 'beitragszuschlag kinderlose', 'pflegepflicht', 'versichertennummer', 'beitragsbescheinigung'],
  n: ['pflegeheim', 'pflegegrad'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Beiträge zur Pflegepflichtversicherung gehören zu den Basisvorsorgeaufwendungen und sind voll absetzbar.' });
dt('haftpflicht', 'Haftpflichtversicherung', 'Haftpflicht', 'vorsorge', 'Haftpflicht', {
  s: ['privathaftpflicht', 'haftpflichtversicherung', 'hundehaftpflicht', 'tierhalterhaftpflicht', 'haus- und grundbesitzerhaftpflicht'],
  k: ['haftpflicht', 'versicherungsschein', 'versicherungsbeitrag', 'jahresbeitrag', 'beitragsrechnung', 'versicherungsnummer', 'deckungssumme', 'selbstbeteiligung', 'police', 'versicherungsnehmer', 'versicherungsbeginn'],
  n: ['kfz', 'berufshaftpflicht'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Sonstige Vorsorgeaufwendungen: zusammen mit anderen Versicherungen bis 1.900 € (Arbeitnehmer). Oft wirkungslos, da KV/PV es ausschöpfen.' });
dt('unfallversicherung', 'Unfallversicherung', 'Unfall', 'vorsorge', 'Unfallversicherung', {
  s: ['unfallversicherung', 'private unfallversicherung', 'unfallpolice'],
  k: ['invaliditaet', 'unfalltod', 'progression', 'gliedertaxe', 'versicherungsbeitrag', 'versicherungsschein', 'jahresbeitrag', 'versicherungssumme', 'police', 'versicherungsnehmer'],
  n: ['berufsunfaehigkeit', 'kfz'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Beiträge zur privaten Unfallversicherung zählen zu den sonstigen Vorsorgeaufwendungen (Höchstbetrag 1.900 €).' });
dt('berufsunfaehigkeit', 'Berufsunfähigkeitsversicherung', 'BU', 'vorsorge', 'Berufsunfaehigkeit', {
  s: ['berufsunfaehigkeitsversicherung', 'berufsunfaehigkeitszusatzversicherung', 'bu-versicherung', 'erwerbsunfaehigkeitsversicherung'],
  k: ['berufsunfaehigkeit', 'bu-rente', 'bu rente', 'versicherungsschein', 'beitragsrechnung', 'jahresbeitrag', 'erwerbsminderung', 'versicherungsnehmer', 'police', 'garantierte rente'],
  n: [],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'BU-Beiträge sind sonstige Vorsorgeaufwendungen (Höchstbetrag 1.900 €). Meist schon durch KV/PV ausgeschöpft.' });
dt('kfz_haftpflicht', 'Kfz-Haftpflicht', 'Kfz-Haftpfl.', 'vorsorge', 'KfzHaftpflicht', {
  s: ['kfz-haftpflicht', 'kfz haftpflicht', 'kfz-versicherung', 'kraftfahrtversicherung', 'kraftfahrzeug-haftpflicht', 'versicherungsbestaetigung kfz'],
  k: ['kennzeichen', 'schadenfreiheitsklasse', 'sf-klasse', 'teilkasko', 'vollkasko', 'fahrzeug', 'typklasse', 'regionalklasse', 'hsn', 'tsn', 'beitragsrechnung', 'evb', 'fahrzeugversicherung'],
  n: [],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Nur der Haftpflichtanteil zählt als sonstige Vorsorge (max. 1.900 €). Kasko nicht. Bei beruflicher Nutzung: Fahrtkosten.' });
dt('risikoleben', 'Risikolebensversicherung', 'Risikoleben', 'vorsorge', 'Risikolebensversicherung', {
  s: ['risikolebensversicherung', 'risikoversicherung', 'todesfallschutz', 'risiko-lebensversicherung'],
  k: ['todesfallsumme', 'versicherungssumme', 'leistung im todesfall', 'bezugsberechtigt', 'jahresbeitrag', 'police', 'versicherungsnehmer', 'versicherte person', 'lebensversicherung'],
  n: ['rente', 'basisrente'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Beiträge zur reinen Risikolebensversicherung sind sonstige Vorsorgeaufwendungen (max. 1.900 € zusammen mit anderen).' });
dt('ruerup', 'Basisrente / Rürup', 'Rürup', 'vorsorge', 'Basisrente', {
  s: ['basisrente', 'ruerup', 'ruerup-rente', 'altersvorsorgevertrag', 'bescheinigung nach 10 abs. 2a', 'nr. 2 buchst. b'],
  k: ['10 abs. 1 nr. 2', 'altersvorsorgebeitraege', 'zertifizierungsnummer', 'vertragsnummer', 'beitragsbescheinigung', 'schichtenmodell', 'basisversorgung', 'zertifiziert', 'beitraege zu einem basisrentenvertrag', 'altersvorsorge'],
  n: ['riester', 'zulage'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Basisrente voll absetzbar bis 29.344 € (2025) bzw. 30.826 € (2026). Anbieter meldet elektronisch, Bescheinigung zur Kontrolle.' });
dt('riester', 'Riester-Rente', 'Riester', 'vorsorge', 'Riester', {
  s: ['riester', 'bescheinigung nach 92 estg', 'altersvorsorgezulage', 'bescheinigung nach 92'],
  k: ['zulage', 'zulagennummer', 'zulagenantrag', 'grundzulage', 'kinderzulage', 'eigenbeitrag', 'altersvorsorgevertrag', 'anlage av', 'dauerzulageantrag', 'mindesteigenbeitrag', '10a'],
  n: ['basisrente', 'ruerup'],
  f: ['beitrag', 'versicherungsnr', 'zeitraum'],
  t: 'Riester-Beiträge (Anlage AV): bis 2.100 € als Sonderausgaben, Günstigerprüfung gegen Zulage. Bescheinigung nach §92 EStG beilegen.' });

// ---- Sonderausgaben -----------------------------------------------------------------------------
dt('spende', 'Spende / Zuwendungsbestätigung', 'Spende', 'sonderausgaben', 'Spende', {
  s: ['zuwendungsbestaetigung', 'bestaetigung ueber geldzuwendungen', 'spendenbescheinigung', 'spendenquittung', 'im sinne des 10b', 'bestaetigung ueber zuwendungen', 'sammelbestaetigung'],
  k: ['spende', 'spenden', 'gemeinnuetzig', 'freistellungsbescheid', 'foerderung', 'mildtaetig', 'wir bedanken uns', 'zuwendung', 'verzicht auf erstattung', 'spendenbetrag', 'hilfswerk', 'stiftung', 'sachspende', 'kirchliche zwecke'],
  n: ['mitgliedsbeitrag', 'rechnung', 'kirchensteuer'],
  f: ['empfaenger', 'zweck', 'sachspende', 'steuernummer'],
  t: 'Bis 20 % der Einkünfte absetzbar. Bis 300 € genügt der Kontoauszug, darüber Zuwendungsbestätigung. Parteispenden: Steuerermäßigung.' });
dt('mitgliedsbeitrag', 'Mitgliedsbeitrag gemeinnützig', 'Mitgliedsb.', 'sonderausgaben', 'Mitgliedsbeitrag', {
  s: ['mitgliedsbeitrag', 'beitragsquittung', 'beitragsbescheinigung verein', 'foerdermitgliedschaft'],
  k: ['verein', 'e.v.', 'foerdermitglied', 'jahresbeitrag', 'mitgliedsnummer', 'vereinsbeitrag', 'gemeinnuetzig', 'freistellung', 'satzung', 'foerderverein', 'mitgliedschaft'],
  n: ['gewerkschaft', 'gewerkschaften', 'werbungskosten', 'fitnessstudio', 'golfclub', 'sportverein', 'berufsverband'],
  f: ['empfaenger', 'beitrag', 'zeitraum'],
  t: 'Nur Spendenanteil bei gemeinnützigen Zwecken (z. B. Umwelt, Soziales) absetzbar. Sport, Kultur- und Freizeitvereine nicht.' });
dt('kirchensteuer', 'Kirchensteuer (Zahlung/Erstattung)', 'KiSt', 'sonderausgaben', 'Kirchensteuer', {
  s: ['kirchensteuerbescheinigung', 'kirchensteuer nachzahlung', 'kirchensteuer erstattung', 'kirchensteuerbescheid', 'kirchensteueramt', 'bescheinigung kirchensteuer', 'kirchensteuer-nachzahlung', 'kirchgeld', 'kirchenbeitrag'],
  k: ['kirchensteuer', 'ev. kirchenverwaltung', 'kirchensteuerzahlung', 'bistum', 'landeskirche', 'kirchensteuer erstattung', 'kirchengemeinde', 'kirchensteueramt', 'nachzahlung kirchensteuer'],
  n: ['spende', 'zuwendungsbestaetigung', 'lohnsteuerbescheinigung', 'bruttoarbeitslohn'],
  f: ['kirchensteuer', 'zeitraum'],
  t: 'Gezahlte Kirchensteuer voll als Sonderausgabe absetzbar, Erstattungen abziehen. Lohnsteuer-KiSt wird automatisch übernommen.' });
dt('schulgeld', 'Schulgeld', 'Schulgeld', 'sonderausgaben', 'Schulgeld', {
  s: ['schulgeld', 'schulgeldbescheinigung', 'schulgeldrechnung', 'schulgeld-bescheinigung'],
  k: ['privatschule', 'ersatzschule', 'internat', 'schulbeitrag', 'freie schule', 'waldorf', 'montessori', 'schulverein', 'schulgeldzahlung', 'staatlich anerkannt', 'genehmigte schule'],
  n: ['kita', 'kindergarten', 'hort'],
  f: ['kind_name', 'beitrag', 'zeitraum'],
  t: '30 % des Schulgelds absetzbar, max. 5.000 € je Kind. Ohne Unterkunft, Verpflegung, Betreuung. Schule muss anerkannt sein.' });
dt('erstausbildung', 'Erstausbildung / Studium', 'Erstausb.', 'sonderausgaben', 'Erstausbildung', {
  s: ['immatrikulationsbescheinigung', 'studienbescheinigung', 'studiengebuehr', 'semesterbeitrag', 'ausbildungsvertrag'],
  k: ['semester', 'universitaet', 'hochschule', 'matrikelnummer', 'studiengang', 'ausbildung', 'berufsschule', 'studierendenwerk', 'semesterticket', 'ausbildungsverguetung', 'duales studium', 'fachhochschule', 'studienfach'],
  n: ['zweitstudium', 'lohnsteuerbescheinigung'],
  f: ['kind_name', 'zeitraum_von', 'zeitraum_bis', 'rechnungsnr'],
  t: 'Erstausbildung: bis 6.000 € als Sonderausgaben. Im Zweitstudium oder nach Ausbildung: Werbungskosten, Verlustvortrag möglich.' });

// ---- Außergewöhnliche Belastungen -------------------------------------------------------------
dt('arzt', 'Arztrechnung', 'Arzt', 'agb', 'Arzt', {
  s: ['liquidation', 'privatrechnung', 'privatliquidation', 'goae', 'gebuehrenordnung fuer aerzte', 'honorarrechnung arzt', 'arztrechnung', 'dr. med.', 'facharzt', 'arztpraxis'],
  k: ['behandlung', 'diagnose', 'untersuchung', 'patient', 'patientin', 'praxis', 'arzt', 'aerztin', 'gebuehrenziffer', 'ziffer', 'faktor', 'steigerungssatz', 'medizinisch', 'beratung', 'sonographie', 'laborleistung', 'impfung'],
  n: ['zahnarzt', 'goz', 'heil- und kostenplan', 'tierarzt', 'newsletter'],
  f: ['rechnungsnr', 'zeitraum', 'iban'],
  t: 'Krankheitskosten nur oberhalb der zumutbaren Eigenbelastung (Einkommen/Familie). Erstattungen von Kasse abziehen, Sammeln lohnt.' });
dt('zahnarzt', 'Zahnarztrechnung', 'Zahnarzt', 'agb', 'Zahnarzt', {
  s: ['heil- und kostenplan', 'zahnarztrechnung', 'goz', 'gebuehrenordnung fuer zahnaerzte', 'zahnarzt', 'zahnaerztin', 'zahnarztpraxis', 'kieferorthopaede'],
  k: ['zahnersatz', 'krone', 'implantat', 'fuellung', 'prophylaxe', 'zahnreinigung', 'zahntechnik', 'labor', 'brueckenglied', 'inlay', 'wurzelbehandlung', 'zahn', 'kieferorthopaedie', 'zahnspange', 'bema'],
  n: ['tierarzt'],
  f: ['rechnungsnr', 'zeitraum', 'iban'],
  t: 'Zahnersatz und Eigenanteile: außergewöhnliche Belastung nach Abzug zumutbarer Eigenbelastung. Kassenerstattung gegenrechnen.' });
dt('apotheke', 'Apotheke / Rezept', 'Apotheke', 'agb', 'Apotheke', {
  s: ['apotheke', 'apotheken', 'rezeptgebuehr', 'zuzahlung', 'pzn', 'pharmazentralnummer', 'rezept', 'sanitaetshaus'],
  k: ['medikament', 'arzneimittel', 'tabletten', 'salbe', 'tropfen', 'packungsgroesse', 'rezeptpflichtig', 'apothekerin', 'apotheker', 'abgabe', 'kassenrezept', 'privatrezept', 'tabl', 'filmtabl', 'ratiopharm', 'ibuprofen', 'paracetamol'],
  n: ['drogerie', 'rossmann', 'dm-markt', 'kosmetik'],
  f: ['rechnungsnr'],
  t: 'Zuzahlungen und ärztlich verordnete Medikamente als Krankheitskosten absetzbar (nur über zumutbarer Eigenbelastung). Rezept aufbewahren.' });
dt('optiker', 'Optiker / Brille', 'Optiker', 'agb', 'Optiker', {
  s: ['optiker', 'augenoptik', 'optik', 'kontaktlinsen', 'brillenglaeser', 'brillenfassung', 'sehhilfe', 'brille'],
  k: ['brille', 'gleitsichtglaeser', 'dioptrien', 'sehstaerke', 'hornhaut', 'refraktion', 'augenoptiker', 'linsen', 'fassung', 'glaeser', 'sph', 'zyl', 'fielmann', 'apollo', 'brillen', 'pflegemittel'],
  n: ['sonnenbrille'],
  f: ['rechnungsnr', 'iban'],
  t: 'Brillen und Kontaktlinsen mit ärztlicher Verordnung als Krankheitskosten absetzbar. Eine augenärztliche Verordnung ist nötig.' });
dt('krankenhaus', 'Krankenhaus / Klinik', 'Klinik', 'agb', 'Krankenhaus', {
  s: ['krankenhaus', 'klinikum', 'krankenhausrechnung', 'entlassungsbericht', 'universitaetsklinikum', 'klinik'],
  k: ['stationaer', 'aufenthalt', 'aufnahme', 'entlassung', 'pflegesatz', 'drg', 'wahlleistung', 'eigenanteil', 'zuzahlung krankenhaus', 'patient', 'station', 'operation', 'rehabilitation', 'reha', 'kur', 'tagessatz', 'behandlung'],
  n: ['tierklinik'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Zuzahlung 10 € je Tag (max. 28 Tage) und Wahlleistungen: Krankheitskosten über zumutbarer Eigenbelastung.' });
dt('therapie', 'Therapie / Physiotherapie', 'Therapie', 'agb', 'Therapie', {
  s: ['physiotherapie', 'krankengymnastik', 'ergotherapie', 'logopaedie', 'psychotherapie', 'heilmittelverordnung', 'massage'],
  k: ['physiotherapeut', 'praxis fuer physiotherapie', 'behandlungseinheit', 'manuelle therapie', 'lymphdrainage', 'osteopathie', 'verordnung', 'heilmittel', 'termin', 'sitzung', 'behandlungen', 'therapeut', 'rueckenschule'],
  n: ['wellness', 'kosmetik', 'fitness'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Verordnete Therapien (Eigenanteil) als Krankheitskosten absetzbar. Ohne Verordnung nur mit amtsärztlichem Attest bei Alternativmethoden.' });
dt('heilpraktiker', 'Heilpraktiker', 'Heilprakt.', 'agb', 'Heilpraktiker', {
  s: ['heilpraktiker', 'heilpraktikerin'],
  k: ['naturheilkunde', 'akupunktur', 'homoeopathie', 'bioresonanz', 'eigenblut', 'chiropraktik', 'naturheilpraxis', 'behandlung', 'anamnese', 'diagnose', 'sitzung'],
  n: [],
  f: ['rechnungsnr', 'zeitraum'],
  t: 'Heilpraktikerkosten sind Krankheitskosten über zumutbarer Eigenbelastung. Bei Alternativmedizin kann Verordnung oder Attest nötig sein.' });
dt('hilfsmittel', 'Hilfsmittel (Hörgerät, Orthopädie)', 'Hilfsmittel', 'agb', 'Hilfsmittel', {
  s: ['hoergeraet', 'hoergeraete', 'hoerakustiker', 'orthopaedietechnik', 'sanitaetshaus', 'hilfsmittelverordnung', 'orthopaedie-schuhtechnik', 'einlagen'],
  k: ['rollstuhl', 'rollator', 'gehhilfe', 'kompressionsstruempfe', 'bandage', 'prothese', 'orthese', 'hilfsmittel', 'pflegebett', 'gehstock', 'inkontinenz', 'blutzucker', 'orthopaedisch', 'krankenkassenanteil', 'eigenanteil'],
  n: [],
  f: ['rechnungsnr', 'iban'],
  t: 'Ärztlich verordnete Hilfsmittel als Krankheitskosten absetzbar, abzüglich Kassenerstattung. Verordnung aufbewahren.' });
dt('pflege', 'Pflegekosten', 'Pflege', 'agb', 'Pflege', {
  s: ['pflegeheim', 'pflegedienst', 'ambulanter pflegedienst', 'heimentgelt', 'pflegerechnung', 'pflegegrad', 'pflegebeduerftig'],
  k: ['pflegeleistungen', 'unterkunft und verpflegung', 'investitionskosten', 'pflegesatz', 'pflegekasse', 'eigenanteil', 'tagespflege', 'haeusliche pflege', 'betreuung', 'pflegegeld', 'heimkosten', 'seniorenheim', 'altenheim', 'pflegepauschbetrag'],
  n: ['pflegeversicherung beitrag', 'beitragsbescheinigung'],
  f: ['rechnungsnr', 'zeitraum_von', 'zeitraum_bis', 'kind_name'],
  t: 'Pflegekosten als außergewöhnliche Belastung (nach Abzug Pflegegeld). Alternativ Pflege-Pauschbetrag 600 bis 1.800 € bei eigener Pflege.' });
dt('behinderung', 'Schwerbehinderung (Ausweis/Bescheid)', 'Behinderung', 'agb', 'Behinderung', {
  s: ['schwerbehindertenausweis', 'feststellungsbescheid', 'grad der behinderung', 'versorgungsamt', 'behindertenpauschbetrag', 'schwerbehinderung'],
  k: ['gdb', 'merkzeichen', 'versorgungsamt', 'landesamt fuer soziales', 'schwerbehindert', 'behindert', 'nachteilsausgleich', 'pauschbetrag', 'gueltig bis', 'ausweis', 'behinderung', 'blind', 'hilflos', 'gehbehindert'],
  n: [],
  f: ['zeitraum_von', 'zeitraum_bis', 'kind_name'],
  t: 'Behinderten-Pauschbetrag je nach GdB (ab 20): 384 bis 2.840 €, 7.400 € bei Blindheit/Hilflosigkeit. Ausweis oder Bescheid beilegen.' });
dt('bestattung', 'Bestattungskosten', 'Bestattung', 'agb', 'Bestattung', {
  s: ['bestattungsunternehmen', 'bestattung', 'bestattungskosten', 'trauerfeier', 'bestattungsinstitut', 'beerdigung', 'grabstelle'],
  k: ['sarg', 'urne', 'friedhof', 'grabstaette', 'kremation', 'trauerdruck', 'traueranzeige', 'sterbefall', 'verstorbene', 'verstorbener', 'grabstein', 'friedhofsgebuehr', 'beisetzung', 'erbfall', 'nachlass'],
  n: ['tierbestattung'],
  f: ['rechnungsnr', 'iban'],
  t: 'Bestattungskosten als außergewöhnliche Belastung, soweit sie den Nachlass übersteigen. Nachlasswert und Sterbegeld abziehen.' });

// ---- Haushaltsnahe Leistungen §35a -------------------------------------------------------------
dt('handwerker', 'Handwerkerleistung', 'Handwerker', 'haushalt35a', 'Handwerker', {
  s: ['handwerkerleistung', 'handwerkerrechnung', 'arbeitskosten inkl. anfahrt', 'lohnanteil', 'arbeitskosten', 'lohnkosten', 'fachbetrieb'],
  k: ['reparatur', 'montage', 'wartung', 'installation', 'anfahrt', 'anfahrtspauschale', 'material', 'monteur', 'arbeitsstunden', 'handwerker', 'sanitaer', 'elektriker', 'maler', 'tischler', 'dachdecker', 'heizungsbauer', 'renovierung', 'austausch', 'stundenlohn', 'lohn', 'meisterbetrieb', 'bar bezahlt', 'betrag dankend erhalten', 'schlussrechnung', 'abschlagsrechnung'],
  n: ['bescheinigung nach 35c', 'energetische massnahme', 'bescheinigung fuer steuerliche foerderung', 'newsletter', 'betriebskostenabrechnung', 'nebenkostenabrechnung', 'umlageschluessel', 'hausgeldabrechnung'],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten', 'zahlungsart', 'netto', 'mwst', 'iban'],
  t: '20 % der Arbeitskosten, max. 1.200 € Steuerermäßigung. Nur per Überweisung, Material und Bar zählen nicht. Lohnanteil muss getrennt stehen.' });
dt('haushaltsnahe_dl', 'Haushaltsnahe Dienstleistung', 'Haushalts-DL', 'haushalt35a', 'HaushaltsnaheDienstleistung', {
  s: ['haushaltsnahe dienstleistung', 'haushaltsnahe dienstleistungen', 'reinigungsservice', 'gebaeudereinigung', 'gartenpflege', 'winterdienst', 'treppenhausreinigung', 'hausmeisterservice', 'haushaltshilfe'],
  k: ['reinigung', 'putzdienst', 'fensterreinigung', 'gartenarbeiten', 'rasenmaehen', 'heckenschnitt', 'baumpflege', 'schneeraeumung', 'hausmeister', 'tierbetreuung', 'umzugshelfer', 'pflegedienst', 'essen auf raedern', 'arbeitskosten', 'grundreinigung', 'unterhaltsreinigung', 'gaertner', 'landschaftsbau'],
  n: ['arztrechnung', 'bescheinigung nach 35c', 'betriebskostenabrechnung', 'nebenkostenabrechnung', 'umlageschluessel', 'hausgeldabrechnung', 'heizkostenabrechnung'],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten', 'zahlungsart', 'netto', 'mwst', 'iban'],
  t: '20 % der Arbeitskosten, max. 4.000 € Steuerermäßigung. Nur per Überweisung auf Rechnung, Barzahlung ist ausgeschlossen.' });
dt('nebenkostenabrechnung', 'Nebenkostenabrechnung', 'Nebenkosten', 'haushalt35a', 'Nebenkostenabrechnung', {
  s: ['nebenkostenabrechnung', 'betriebskostenabrechnung', 'heizkostenabrechnung', 'bescheinigung nach 35a', 'abrechnung der betriebskosten', 'nebenkosten-abrechnung'],
  k: ['betriebskosten', 'nebenkosten', 'heizkosten', 'umlageschluessel', 'nachzahlung', 'guthaben', 'vorauszahlungen', 'abrechnungszeitraum', 'hausmeister', 'gartenpflege', 'schornsteinfeger', 'verbrauch', 'wohnflaeche', 'verteilerschluessel', 'ablesung', 'vermieter', 'mieter', 'gebaeudereinigung', 'winterdienst', 'aufzug', 'kaltwasser', 'muellabfuhr', 'ista', 'techem', 'brunata'],
  n: ['hausgeldabrechnung', 'wirtschaftsplan'],
  f: ['arbeitskosten', 'zeitraum_von', 'zeitraum_bis', 'rechnungsnr'],
  t: 'Lohnanteile (Hausmeister, Reinigung, Garten, Winterdienst) sind nach §35a ansetzbar. Vermieterbescheinigung oder Posten markieren.' });
dt('hausgeld_weg', 'Hausgeld / WEG-Abrechnung', 'Hausgeld', 'haushalt35a', 'Hausgeld', {
  s: ['hausgeldabrechnung', 'jahresabrechnung weg', 'wohnungseigentuemergemeinschaft', 'hausgeld', 'wirtschaftsplan', 'weg-abrechnung', 'hausverwaltung'],
  k: ['eigentuemer', 'instandhaltungsruecklage', 'erhaltungsruecklage', 'verwalter', 'miteigentumsanteil', 'weg', 'sondereigentum', 'beschlussfassung', 'hausgeldvorauszahlung', 'eigentuemerversammlung', 'verwaltungskosten', 'gemeinschaftseigentum', 'einheit'],
  n: ['mietvertrag'],
  f: ['arbeitskosten', 'zeitraum_von', 'zeitraum_bis', 'rechnungsnr'],
  t: 'Selbstgenutzt: §35a-Anteile (Hausmeister, Reinigung, Garten) übernehmen. Vermietet: gesamtes Hausgeld teils in Anlage V.' });
dt('minijob_haushalt', 'Minijob im Haushalt', 'Minijob HH', 'haushalt35a', 'MinijobHaushalt', {
  s: ['haushaltsscheck', 'minijob-zentrale', 'minijob zentrale', 'haushaltshilfe minijob', 'beitragsnachweis haushaltsscheck'],
  k: ['minijob', 'geringfuegige beschaeftigung', 'haushaltsscheckverfahren', 'knappschaft', 'pauschalbeitraege', 'u1', 'u2', 'umlage', 'beschaeftigungsverhaeltnis', 'haushalt', '538 euro', '556 euro', 'minijobber', 'unfallversicherung haushalt', 'abgaben'],
  n: [],
  f: ['beitrag', 'zeitraum_von', 'zeitraum_bis'],
  t: '20 % der Aufwendungen, max. 510 € Steuerermäßigung. Haushaltsscheck-Bescheinigung der Minijob-Zentrale beilegen.' });
dt('schornsteinfeger', 'Schornsteinfeger', 'Schornstein', 'haushalt35a', 'Schornsteinfeger', {
  s: ['schornsteinfeger', 'bezirksschornsteinfeger', 'schornsteinfegermeister', 'feuerstaettenschau', 'abgasmessung'],
  k: ['kehrung', 'emissionsmessung', 'immissionsschutz', 'kehr- und ueberpruefungsordnung', 'feuerstaette', 'heizungsanlage', 'messung', 'kaminkehrer', 'feuerstaettenbescheid', 'ofen', 'abgaswegeueberpruefung', 'arbeitswerte', 'anfahrt'],
  n: [],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten', 'zahlungsart', 'iban'],
  t: 'Kehr- und Messarbeiten zählen als Handwerkerleistung. 20 % der Arbeitskosten, max. 1.200 €. Nur per Überweisung.' });

// ---- Kinder ---------------------------------------------------------------------------------------
dt('kita', 'Kita / Kinderbetreuung', 'Kita', 'kinder', 'Kita', {
  s: ['kindertagesstaette', 'kindertagesstaetten', 'kindergarten', 'tagesmutter', 'tagespflege kind', 'betreuungsvertrag', 'kinderkrippe', 'betreuungsbeitrag', 'kita'],
  k: ['kita', 'krippe', 'hort', 'ganztagsbetreuung', 'betreuungsgebuehr', 'elternbeitrag', 'kinderbetreuung', 'betreuungszeit', 'tagespflegeperson', 'verpflegung', 'essensgeld', 'kindergartengebuehr', 'ogs', 'offene ganztagsschule', 'kinderladen', 'tageseinrichtung', 'betreuungskosten', 'eltern'],
  n: ['schulgeld', 'musikunterricht'],
  f: ['kind_name', 'beitrag', 'rechnungsnr', 'zeitraum_von', 'zeitraum_bis'],
  t: '80 % der Betreuungskosten, max. 4.800 € je Kind unter 14 J. (Anlage Kind). Verpflegung herausrechnen, nur Überweisung.' });
dt('kindergeld', 'Kindergeldbescheid', 'Kindergeld', 'kinder', 'Kindergeld', {
  s: ['familienkasse', 'kindergeldbescheid', 'bescheid ueber kindergeld', 'festsetzung von kindergeld', 'kindergeldnummer'],
  k: ['kindergeld', 'kindergeldberechtigt', 'kindergeldnummer', 'bundesagentur fuer arbeit', 'kinderzuschlag', 'kindergeldauszahlung', 'berechtigter', 'kind', 'monatlich', 'festgesetzt', 'kindergeldempfaenger'],
  n: ['einkommensteuerbescheid'],
  f: ['kind_name', 'zeitraum_von', 'zeitraum_bis', 'steuerid'],
  t: 'Kindergeld (255 €/Monat 2025, 259 € 2026) dient der Günstigerprüfung gegen Kinderfreibetrag. Bescheid ggf. als Nachweis.' });
dt('schulbescheinigung', 'Schul-/Ausbildungsbescheinigung', 'Schulbesch.', 'kinder', 'Schulbescheinigung', {
  s: ['schulbescheinigung', 'ausbildungsbescheinigung', 'studienbescheinigung kind', 'schuelerausweis', 'schulbesuchsbescheinigung'],
  k: ['schule', 'schueler', 'schuelerin', 'klasse', 'schuljahr', 'besucht die schule', 'gymnasium', 'realschule', 'grundschule', 'berufskolleg', 'schulleitung', 'schulbesuch', 'ausbildungsplatz', 'bundesfreiwilligendienst', 'fsj', 'immatrikulation'],
  n: ['schulgeld', 'privatschule'],
  f: ['kind_name', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Nachweis für Kinder über 18 (bis 25 in Ausbildung): erhält Kindergeld und Freibeträge. Jahresweise vorlegen.' });

// ---- Kapitalerträge ------------------------------------------------------------------------------
dt('jahressteuerbescheinigung', 'Jahressteuerbescheinigung (Bank)', 'JStB', 'kapital', 'Jahressteuerbescheinigung', {
  s: ['jahressteuerbescheinigung', 'steuerbescheinigung nach 45a', 'steuerbescheinigung', 'kapitalertragsteuerbescheinigung', 'jahressteuerbescheinigung fuer kapitalertraege'],
  k: ['kapitalertragsteuer', 'kapitalertraege', 'freistellungsauftrag', 'dividenden', 'zinsertraege', 'depot', 'sparer-pauschbetrag', 'verlustverrechnung', 'abgeltungsteuer', 'steuerabzug', 'quellensteuer', 'kirchensteuer auf kapitalertraege', 'solidaritaetszuschlag', 'vorabpauschale', 'ertraege'],
  n: ['verlustbescheinigung', 'einkommensteuerbescheid'],
  f: ['kapitalertraege', 'kapest', 'soli_kap', 'kist_kap', 'quellensteuer', 'verluste', 'steuerid'],
  t: 'Anlage KAP: Banken melden Erträge selbst. Erklären nur bei Günstigerprüfung, ausländischen Konten, Verlusten oder Kirchensteuer.' });
dt('verlustbescheinigung', 'Verlustbescheinigung', 'Verlust', 'kapital', 'Verlustbescheinigung', {
  s: ['verlustbescheinigung', 'bescheinigung nach 43a abs. 3', 'bescheinigung ueber nicht ausgeglichene verluste', 'nicht ausgeglichene verluste'],
  k: ['verlustverrechnungstopf', 'aktienverlusttopf', 'verlusttopf', 'allgemeiner verlusttopf', 'verlustuebertrag', 'verlustvortrag', 'verluste aus aktien', 'depotwechsel', 'verrechnungstopf', 'verlustsaldo'],
  n: [],
  f: ['verluste', 'steuerid'],
  t: 'Antrag bis 15.12. beim Institut nötig. Bescheinigung erlaubt Verlustverrechnung mit Gewinnen bei anderen Banken (Anlage KAP).' });
dt('broker', 'Broker-Abrechnung / Depotauszug', 'Broker', 'kapital', 'BrokerAbrechnung', {
  s: ['wertpapierabrechnung', 'ertragsgutschrift', 'dividendengutschrift', 'depotauszug', 'jahresdepotauszug', 'steuerreport', 'wertpapierabrechnung kauf', 'wertpapierabrechnung verkauf', 'ertragsabrechnung'],
  k: ['depot', 'wertpapier', 'isin', 'wkn', 'etf', 'aktie', 'aktien', 'stueck', 'kurs', 'dividende', 'ausschuettung', 'order', 'ausfuehrung', 'boerse', 'trade republic', 'scalable', 'comdirect', 'ing', 'dkb', 'consorsbank', 'flatex', 'gebuehren', 'fremdgebuehren', 'kurswert', 'schlusstag', 'verkauf', 'kauf'],
  n: ['jahressteuerbescheinigung', 'kryptow'],
  f: ['kapitalertraege', 'kapest', 'soli_kap', 'kist_kap', 'quellensteuer', 'verluste', 'iban'],
  t: 'Orderabrechnungen und Dividenden: i. d. R. schon versteuert. Beleg nur wichtig bei ausländischem Broker ohne Steuerabzug.' });

// ---- Vermietung -----------------------------------------------------------------------------------
dt('mietvertrag', 'Mietvertrag / Mieteinnahmen', 'Miete', 'vermietung', 'Mietvertrag', {
  s: ['mietvertrag', 'mieterhoehung', 'mietaufstellung', 'mietuebersicht', 'untermietvertrag', 'mieteinnahmen', 'mietzahlung', 'einnahmen aus vermietung'],
  k: ['vermieter', 'mieter', 'kaltmiete', 'warmmiete', 'nettokaltmiete', 'kaution', 'mietbeginn', 'mietbeginn', 'mietobjekt', 'mietflaeche', 'wohnflaeche', 'kuendigungsfrist', 'staffelmiete', 'indexmiete', 'mietspiegel', 'uebergabeprotokoll', 'mietwohnung'],
  n: ['hausgeldabrechnung'],
  f: ['netto', 'zeitraum_von', 'zeitraum_bis', 'iban'],
  t: 'Mieteinnahmen gehören in Anlage V. Vertrag und Zahlungsübersicht belegen Einnahmen. Mind. 66 % der ortsüblichen Miete halten.' });
dt('grundsteuer', 'Grundsteuerbescheid', 'Grundsteuer', 'vermietung', 'Grundsteuer', {
  s: ['grundsteuerbescheid', 'grundsteuermessbescheid', 'grundbesitzabgaben', 'grundsteuer b', 'grundsteuerwert', 'bescheid ueber grundsteuer'],
  k: ['grundsteuer', 'hebesatz', 'messbetrag', 'gemeinde', 'stadtkasse', 'grundstueck', 'flurstueck', 'grundbesitz', 'gemarkung', 'grundbesitzabgabe', 'abfallgebuehr', 'strassenreinigung', 'faellig', 'abgaben'],
  n: [],
  f: ['zeitraum', 'rechnungsnr'],
  t: 'Bei Vermietung in Anlage V voll absetzbar. Selbst bewohnt nicht absetzbar, nur in der Nebenkostenabrechnung für Mieter.' });
dt('darlehen', 'Darlehen / Zinsbescheinigung', 'Darlehen', 'vermietung', 'Darlehen', {
  s: ['zinsbescheinigung', 'jahreskontoauszug darlehen', 'darlehensvertrag', 'bescheinigung ueber gezahlte zinsen', 'zins- und tilgungsplan', 'tilgungsplan', 'immobiliendarlehen', 'baufinanzierung'],
  k: ['darlehen', 'kredit', 'zinsen', 'tilgung', 'restschuld', 'sollzins', 'effektivzins', 'annuitaet', 'rate', 'sondertilgung', 'zinsbindung', 'grundschuld', 'finanzierung', 'kreditnehmer', 'bausparvertrag', 'bausparkasse', 'darlehensnummer', 'kontoauszug darlehen'],
  n: ['verbraucherkredit', 'dispo'],
  f: ['iban', 'zeitraum_von', 'zeitraum_bis'],
  t: 'Bei Vermietung sind die gezahlten Schuldzinsen Werbungskosten (Anlage V), Tilgung nicht. Jahresbescheinigung genügt.' });
dt('erhaltungsaufwand', 'Erhaltungsaufwand Vermietung', 'Erhaltung', 'vermietung', 'ErhaltungsaufwandVermietung', {
  s: ['erhaltungsaufwand', 'instandhaltung mietobjekt', 'renovierung mietwohnung', 'sanierung mietobjekt', 'instandsetzung mietwohnung', 'mieterwechsel'],
  k: ['mietwohnung', 'mieter', 'schoenheitsreparatur', 'schadensbehebung', 'wasserschaden', 'neues bad', 'bodenbelag', 'neue kueche', 'vermietete wohnung', 'vermietete immobilie', 'objekt', 'einheit', 'sanierung', 'renovierung', 'instandsetzung', 'reparatur', 'handwerker'],
  n: [],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten', 'zahlungsart', 'netto', 'mwst'],
  t: 'Reparaturen am Mietobjekt sind sofort Werbungskosten (Anlage V). Aufwendungen über 15 % des Gebäudewerts in 3 Jahren: Herstellungskosten.' });

// ---- Renten ---------------------------------------------------------------------------------------
dt('rentenbezug', 'Rentenbezugsmitteilung / Renteninformation', 'Rente', 'rente', 'Rente', {
  s: ['rentenbezugsmitteilung', 'renteninformation', 'rentenanpassungsmitteilung', 'rentenbescheid', 'deutsche rentenversicherung', 'rentenbescheinigung', 'bescheinigung zur vorlage beim finanzamt rente'],
  k: ['rentenversicherung', 'monatliche rente', 'altersrente', 'erwerbsminderungsrente', 'regelaltersrente', 'rentenbeginn', 'versicherungsnummer', 'rentenartfaktor', 'entgeltpunkte', 'rentenwert', 'zahlbetrag', 'beitragsanteil kv', 'beitragsanteil pv', 'rentenzahlung', 'renteninformation', 'rentenauskunft', 'versorgungswerk', 'betriebsrente', 'pensionskasse'],
  n: ['riester', 'ruerup'],
  f: ['brutto', 'beitrag', 'zeitraum_von', 'zeitraum_bis', 'versicherungsnr'],
  t: 'Renten werden dem Finanzamt gemeldet (Anlage R). Beitragsanteile für KV/PV als Sonderausgabe angeben. Besteuerungsanteil prüfen.' });
dt('leistungsmitteilung', 'Leistungsmitteilung (§22 Nr. 5)', 'Leistungsm.', 'rente', 'Leistungsmitteilung', {
  s: ['leistungsmitteilung', 'mitteilung ueber steuerpflichtige leistungen', '22 nr. 5', 'leistungen aus altersvorsorgevertraegen', 'mitteilung nach 22 nr. 5'],
  k: ['altersvorsorgevertrag', 'basisrentenvertrag', 'auszahlung', 'pensionsfonds', 'riester', 'rueckzahlung zulagen', 'steuerpflichtige leistung', 'besteuerungsgrundlage', 'leistungsempfaenger', 'anbieter', 'zulagen', 'foerderbetrag'],
  n: [],
  f: ['zeitraum', 'versicherungsnr'],
  t: 'Auszahlungen aus Riester/Rürup/bAV: Anlage R bzw. AV. Mitteilung des Anbieters ist Grundlage für Besteuerung.' });

// ---- Sonstige Einkünfte -----------------------------------------------------------------------------
dt('krypto', 'Kryptowerte', 'Krypto', 'sonstige', 'Krypto', {
  s: ['kryptowerte', 'kryptowaehrung', 'krypto-steuerreport', 'transaktionshistorie', 'bitcoin', 'steuerreport krypto'],
  k: ['ethereum', 'btc', 'eth', 'coinbase', 'binance', 'kraken', 'bitpanda', 'blockchain', 'wallet', 'staking', 'token', 'koinly', 'cointracking', 'bitcoin.de', 'krypto', 'coin', 'tradegewinn', 'haltefrist'],
  n: ['depotauszug'],
  f: ['zeitraum_von', 'zeitraum_bis'],
  t: 'Private Veräußerungsgeschäfte (Anlage SO): steuerfrei nach 1 Jahr Haltefrist. Gewinne unter 1.000 € (Freigrenze) steuerfrei.' });
dt('veraeusserung', 'Veräußerung (privat)', 'Veräußerung', 'sonstige', 'Veraeusserung', {
  s: ['privates veraeusserungsgeschaeft', 'veraeusserungsgewinn', 'kaufvertrag grundstueck', 'notarvertrag', 'verkaufsabrechnung', 'veraeusserung'],
  k: ['verkaufspreis', 'anschaffungskosten', 'spekulationsfrist', 'notar', 'beurkundung', 'verkaeufer', 'kaeufer', 'kaufpreis', 'grundbuch', 'gewinn', 'besitzuebergang', 'ebay', 'gold', 'edelmetall', 'verkauf'],
  n: [],
  f: ['netto', 'iban'],
  t: 'Verkauf innerhalb 10 Jahre (Immobilien) bzw. 1 Jahr (Wirtschaftsgüter): Gewinn steuerpflichtig, Freigrenze 1.000 €. Nur wenn über Grenze.' });
dt('unterhalt', 'Unterhalt', 'Unterhalt', 'sonstige', 'Unterhalt', {
  s: ['unterhaltszahlung', 'unterhaltsvereinbarung', 'anlage u', 'realsplitting', 'unterhaltsverpflichtung', 'unterhaltstitel', 'unterhalt'],
  k: ['ex-partner', 'geschiedener ehegatte', 'getrennt lebend', 'unterhaltsleistungen', 'unterhaltsberechtigte', 'beduerftige person', 'kindesunterhalt', 'ehegattenunterhalt', 'zustimmung', 'unterhaltsleistung', 'trennung', 'scheidung', 'unterstuetzung angehoerige', 'unterhaltshoechstbetrag'],
  n: [],
  f: ['kind_name', 'zeitraum_von', 'zeitraum_bis', 'iban'],
  t: 'Ex-Partner (Realsplitting, Anlage U): bis ca. 13.800 € als Sonderausgabe mit Zustimmung. Sonst bis zum Höchstbetrag als agB. Nachweis nötig.' });

// ---- Energetisch --------------------------------------------------------------------------------------
dt('energetisch35c', 'Energetische Maßnahme §35c', 'Energetisch', 'energetisch', 'Energetisch35c', {
  s: ['bescheinigung fuer steuerliche foerderung energetischer massnahmen', 'bescheinigung nach 35c', 'steuerliche foerderung energetischer', '35c estg', 'energetische massnahme'],
  k: ['waermepumpe', 'daemmung', 'fenstertausch', 'heizungsoptimierung', 'fachunternehmen', 'energieberater', 'solarthermie', 'lueftungsanlage', 'wohngebaeude', 'fenster', 'daemmung dach', 'fassadendaemmung', 'energieeffizienz', 'sanierungsfahrplan', 'heizungstausch', 'fachunternehmer', 'gebaeudehuelle', 'energieausweis', 'effizienzhaus'],
  n: ['mietobjekt', 'vermietet'],
  f: ['rechnungsnr', 'arbeitskosten', 'materialkosten', 'zahlungsart', 'iban', 'netto'],
  t: '20 % der Kosten über 3 Jahre (7 %/7 %/6 %), max. 40.000 € je Objekt. Nur selbstgenutzt, Fachunternehmer-Bescheinigung, Überweisung.' });

// ---- Finanzamt ------------------------------------------------------------------------------------------
dt('steuerbescheid', 'Steuerbescheid', 'Steuerbescheid', 'finanzamt', 'Steuerbescheid', {
  s: ['einkommensteuerbescheid', 'bescheid ueber einkommensteuer', 'steuerbescheid', 'bescheid fuer', 'einspruchsfrist', 'rechtsbehelfsbelehrung'],
  k: ['festgesetzte einkommensteuer', 'zu versteuerndes einkommen', 'erstattung', 'nachzahlung', 'vorbehalt der nachpruefung', 'steuernummer', 'finanzamt', 'steuerfestsetzung', 'festsetzung', 'einspruch', 'bekanntgabe', 'steuerabzug', 'verspaetungszuschlag', 'veranlagung', 'abrechnung', 'bescheid'],
  n: ['vorauszahlung', 'grundsteuer', 'kfz-steuer'],
  f: ['steuernummer', 'steuerid', 'zeitraum'],
  t: 'Auf Fehler prüfen. Einspruch innerhalb von einem Monat nach Bekanntgabe. Aufbewahren, am besten dauerhaft.' });
dt('vorauszahlung', 'Vorauszahlungsbescheid', 'Vorauszahlung', 'finanzamt', 'Vorauszahlungsbescheid', {
  s: ['vorauszahlungsbescheid', 'bescheid ueber einkommensteuer-vorauszahlungen', 'festsetzung der vorauszahlungen', 'vorauszahlungen einkommensteuer', 'einkommensteuervorauszahlung'],
  k: ['vorauszahlung', 'vorauszahlungen', 'vierteljaehrlich', 'faelligkeit', '10.03', '10.06', '10.09', '10.12', 'steuernummer', 'finanzamt', 'zahlungstermin', 'zahlungsaufforderung'],
  n: ['einkommensteuerbescheid'],
  f: ['steuernummer', 'zeitraum'],
  t: 'Vorauszahlungen zum 10.3./6./9./12. Prüfen, ob Höhe noch passt. Gezahlte Beträge sind im Steuerbescheid angerechnet.' });
dt('finanzamt_schreiben', 'Finanzamt-Schreiben', 'FA-Schreiben', 'finanzamt', 'Finanzamt', {
  s: ['finanzamt', 'steuerverwaltung', 'finanzverwaltung', 'aufforderung zur abgabe', 'hinweis zur steuererklaerung', 'belegvorlage', 'rueckfrage zur steuererklaerung', 'bitte um belegvorlage', 'bundeszentralamt fuer steuern'],
  k: ['steuernummer', 'sachbearbeiter', 'aktenzeichen', 'frist', 'steuererklaerung', 'fristverlaengerung', 'mahnung', 'verspaetungszuschlag', 'ihr schreiben', 'sachgebiet', 'stellungnahme', 'auskunft', 'finanzamt', 'sachstand', 'elster', 'steuerliche'],
  n: ['einkommensteuerbescheid', 'vorauszahlungsbescheid'],
  f: ['steuernummer', 'zeitraum'],
  t: 'Fristen beachten: Antwort in der gesetzten Frist. Schreiben dient als Nachweis für Belegvorlage oder Rückfragen.' });

// ---- Sonstiges / irrelevant -----------------------------------------------------------------------
dt('zahlungsnachweis', 'Zahlungsnachweis (Überweisung)', 'Zahlung', 'haushalt35a', 'Zahlungsnachweis', {
  s: ['zahlungsbeleg', 'ueberweisungsbeleg', 'sepa-ueberweisung', 'ueberweisungsauftrag', 'zahlungsbestaetigung', 'ueberweisungsbestaetigung', 'zahlungsnachweis', 'sepa-zahlungsbeleg'],
  k: ['verwendungszweck', 'empfaenger', 'iban empfaenger', 'auftraggeber', 'ausfuehrungsdatum', 'sepa', 'bic', 'ausgefuehrt', 'transaktionsnummer', 'zahlungsempfaenger', 'buchungsdatum', 'valuta', 'ueberweisung', 'beguenstigter', 'online-banking'],
  n: ['rechnungsbetrag', 'gesamtbetrag', 'nettobetrag', 'mwst', 'jahressteuerbescheinigung'],
  f: ['rechnungsnr', 'empfaenger', 'zweck', 'iban'],
  t: 'Belegt die unbare Zahlung (§35a-Pflicht). Zur Rechnung legen.' });
dt('sonstiges', 'Sonstiges (ungeprüft)', 'Sonstiges', 'unklar', 'Sonstiges', {
  s: [],
  k: [],
  n: [],
  f: ['rechnungsnr', 'netto', 'mwst', 'iban'],
  t: 'Nicht zugeordnet. Prüfen, ob steuerlich relevant, sonst als nicht relevant markieren oder ignorieren.' });
dt('privat_irrelevant', 'Privat / nicht relevant', 'Privat', 'irrelevant', 'Privat', {
  s: ['newsletter', 'abbestellen', 'werbung', 'sonderangebot', 'gutschein', 'rabattaktion', 'unsubscribe', 'kassenbon', 'kassenbeleg', 'kassenzettel', 'bonuspunkte', 'treuepunkte', 'angebot gueltig', 'jetzt sparen', 'prospekt', 'supermarkt', 'lebensmittel', 'danke fuer ihren einkauf', 'abmelden'],
  k: ['filiale', 'kasse', 'bon', 'mwst a', 'rewe', 'edeka', 'aldi', 'lidl', 'kaufland', 'netto marken-discount', 'penny', 'brot', 'milch', 'vollmilch', 'obst', 'gemuese', 'bananen', 'eier', 'joghurt', 'kaffee', 'tomaten', 'mineralwasser', 'butter', 'kaese', 'nudeln', 'pfand', 'payback', 'kuendigungsbestaetigung', 'kuendigung', 'abo gekuendigt', 'streaming', 'netflix', 'spotify', 'rabatt', 'aktion', 'webshop', 'vielen dank fuer ihren einkauf', 'ihre bestellung', 'versandbestaetigung', 'speisekarte', 'tankstelle', 'restaurant', 'bewirtung', 'versand', 'neukunden'],
  n: ['bruttoarbeitslohn', 'steuer', 'finanzamt', 'arbeitsmittel', 'zuwendungsbestaetigung', 'arztrechnung', 'rezept', 'apotheke', 'rechnungsnummer'],
  f: [],
  t: 'Kein Steuerbezug. Nicht exportieren, kann ignoriert werden. Ausnahmen (z. B. Medikamente im Supermarkt) manuell zuordnen.' });


// Jahresbescheinigungen: Dateiname beginnt mit dem Steuerjahr, nicht mit dem Ausstellungsdatum.
const PERIODIC = ['lohnsteuerbescheinigung', 'krankenversicherung', 'pflegeversicherung', 'jahressteuerbescheinigung',
  'verlustbescheinigung', 'gewerkschaft', 'berufsverband', 'rentenbezug', 'leistungsmitteilung', 'kindergeld', 'ruerup',
  'riester', 'nebenkostenabrechnung', 'hausgeld_weg', 'darlehen', 'homeoffice', 'schulbescheinigung', 'schulgeld',
  'minijob_haushalt', 'mitgliedsbeitrag', 'kirchensteuer', 'kontofuehrung'];
for (const d of DT) if (PERIODIC.includes(d.key)) d.periodic = true;

/** Alle Belegarten. */
export const DOC_TYPES = DT;

const _catMap = new Map(CATEGORIES.map((c) => [c.key, c]));
const _typeMap = new Map(DOC_TYPES.map((d) => [d.key, d]));

/**
 * Liefert die Kategorie zu einem Schlüssel (Fallback: „unklar“).
 * @param {string} key
 */
export function categoryOf(key) {
  return _catMap.get(key) || _catMap.get('unklar');
}

/**
 * Liefert die Belegart zu einem Schlüssel (Fallback: „sonstiges“).
 * @param {string} key
 */
export function docTypeOf(key) {
  return _typeMap.get(key) || _typeMap.get('sonstiges');
}
