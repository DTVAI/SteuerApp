# Belegwerk PWA: Verarbeitung und Wiederaufnahme

## Ziel und erhaltene Funktionen

Die Startansicht reduziert den Alltag auf Kamera oder Dateiauswahl. Die vorhandenen Module für PDF-, Bild-, Office-, E-Mail- und Text-Extraktion, deutsche Texterkennung, steuerliche Vorschläge und Export werden weiterverwendet. Chat und Ollama sind aus der Anwendung entfernt. Externe Fonts und weitere Laufzeit-CDNs entfallen.

## Datenfluss

1. `pipeline.captureFiles` schreibt Dokument, unveränderten Original-Blob und Analyseauftrag gemeinsam in eine IndexedDB-Transaktion. Erst nach Commit bestätigt die Oberfläche, dass die App geschlossen werden kann.
2. `drainProcessing` beansprucht den nächsten Auftrag mit einer zeitlich begrenzten Lease. SHA-256 erkennt Duplikate. Der vorhandene Extraktor liest Text und erzeugt Vorschaubilder; Tesseract läuft lokal im Web Worker. Regelbasierte Analyse schlägt Datum, Betrag, Aussteller, Jahr, Belegart und Kategorie vor. Unklare Ergebnisse bleiben als „Zu prüfen“ sichtbar.
3. Analyseergebnis, Vorschaubild und Uploadabsicht werden gemeinsam gespeichert. ZIP-/E-Mail-Originale bleiben erhalten; abgeleitete Dateien bekommen eigene Aufträge. Archive werden wegen möglicher übersprungener Einträge zur Prüfung markiert.
4. `drainUploads` sendet das Original in die ausgewählte Ablage. Der stabile Dateipfad enthält erkannte Angaben und eine Inhaltskennung; eine Wiederholung überschreibt denselben Pfad. Erst eine bestätigte API-Antwort oder ein abgeschlossener Ordner-Schreibvorgang setzt den externen Ablagestatus.
5. Beim Start, Sichtbarwerden, Wiederverbinden und durch unterstützte Background-Sync-Ereignisse werden offene Aufträge fortgesetzt. Leases und transaktionale Eigentümertokens verhindern konkurrierende Commits aus mehreren Fenstern und dem Service Worker.

## Grenzen der Hintergrundarbeit

Eine reine PWA kann nach vollständigem Schließen keine dauerhafte CPU-Verarbeitung garantieren. Besonders iOS/Safari beendet oder pausiert lokale OCR. Die App verliert dann weder Original noch Auftrag und arbeitet beim nächsten Öffnen weiter. Der Service Worker verarbeitet ausschließlich bereits ausgelesene Uploadaufträge; er benötigt keine DOM- oder Canvas-Extraktion.

Für Verarbeitung unabhängig von jeder Appöffnung wäre ein erreichbarer Server mit dauerhaftem Auftragsspeicher und passender OCR nötig. Ein lokaler Python-Startserver stellt hier nur statische Dateien bereit und ist kein mobiles Backend. Es gibt keine versteckte Abhängigkeit von einem Entwicklungsrechner.

## Suche

Der lokale MiniSearch-Index umfasst Original- und Ablagenamen, erkannten Text, Aussteller, Belegart, Kategorie, Schlagwörter, Notizen, Beträge und Datumsangaben. Wortanfänge, deutsche Umlautnormalisierung und Tippfehlertoleranz unterstützen die Freitextsuche. Zahlen werden ohne unscharfe Ähnlichkeit gesucht. Exakte Phrasen und strukturierte Filter wie `jahr:2025 betrag>100` ergänzen sichtbare Filter. Treffer zeigen sicher escapte Textausschnitte. Metadaten lassen sich bestätigen und korrigieren.

## Speicherung und Sicherheit

Die bestehende Datenbank `belegwerk` migriert von Version 1 auf 2. Originale, Dokumente, Vorschaubilder und Einstellungen bleiben erhalten; der neue Store `jobs` ergänzt die Warteschlange. Eine fehlgeschlagene Speicherung führt zu einem sichtbaren Fehler, niemals zu einer flüchtigen Erfolgsmeldung. Sicherungen enthalten keine Dropbox-Tokens. Lokales Löschen entfernt auch Aufträge und Ablagepfad-Metadaten; externe Kopien bleiben erhalten.

Der App-Cache enthält ausschließlich ausgelieferte Programmdateien einschließlich der OCR-Sprachdaten. Belege und Anmeldedaten bleiben außerhalb des HTTP-Caches in IndexedDB. CSP begrenzt Skripte auf die eigene Origin und Netzwerkverbindungen auf die eigene Origin sowie die benötigten Dropbox-Endpunkte. Langfristige Dropbox-Refresh-Tokens und App-Secrets werden nicht im Browser gespeichert. Details und die begrenzte Sitzungsdauer stehen in `storage-setup.md`.

## Verwendete Repository-Skills

Route Heavy, zwei begrenzte parallele Implementierungen: dauerhafter Speicher/Verarbeitungswarteschlange sowie Speicheradapter/OAuth. Hauptagent: Oberfläche, Suche, PWA-Shell, Integration und abschließende Browserprüfung. Keine rekursive Delegation.

Angewendet: `capability-delegator`, `pwa-app-shell`, `offline-first-data`, `local-backend-migration`, `mobile-ui-craft`, `privacy-security-review`, `pwa-quality-gates`. Kein React oder Capacitor eingeführt: der bestehende Vanilla-JavaScript-Aufbau reicht für die PWA.
