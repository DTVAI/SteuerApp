# Belegwerk: PWA-Refactor

Stand: 18.10.2026. Implementiert in der Arbeitskopie `/workspace/SteuerApp`; fertig gebaut unter `dist/`.

## Ergebnis

- Startansicht mit zwei Aktionen: Beleg fotografieren und Datei hinzufügen. Kein Chat, kein Ollama und keine externen Fonts.
- Persistente Originaldatei, Dokument und Auftrag werden atomar in IndexedDB gespeichert. Erst danach bestätigt die Oberfläche das Schließen der App.
- Automatische lokale OCR, Extraktion und Vorschläge für Datum, Betrag, Aussteller, Belegart, Steuerjahr und Kategorie. Unsichere Belege sind prüfbar; Metadaten, Notizen und Tags bleiben bearbeitbar.
- Volltextsuche mit deutschen Umlauten, Tippfehlertoleranz für Wörter, exakten Zahlen, strukturierten Filtern, Original-/Ablagenamen und markierten Treffern.
- Installierbare PWA mit Manifest, Icons, sicheren Updatehinweisen und versioniertem Offline-Cache einschließlich OCR und PDF-Worker.
- Dropbox-Anbindung über PKCE sowie alternative Ordnerablage. Automatische, geordnete Originaldatei-Kopien mit stabilem Hashsuffix und wiederholbaren Uploads. Zielwechsel und parallele Bestätigungen sind berücksichtigt.
- Sicherung, Wiederherstellung und ZIP-Export. Fehlende Originale führen beim Backup zu einem Fehler statt einer unvollständigen Erfolgsmeldung. Lokale Löschung entfernt auch Jobs und Ablagepfad-Metadaten.

## Arbeitsaufteilung und Skills

Der Hauptagent hat Oberfläche, Suche, PWA-Shell und Integration übernommen. Zwei begrenzte Subagents implementierten dauerhafte Datenhaltung/Verarbeitung sowie Speicheradapter/OAuth; zusätzlich erfolgte ein unabhängiges Review ihrer Schnittstellen. Keine rekursive Delegation.

Verwendet wurden die Repository-Skills `capability-delegator`, `pwa-app-shell`, `offline-first-data`, `local-backend-migration`, `mobile-ui-craft`, `privacy-security-review` und `pwa-quality-gates`. Die originale Extraktions- und Analysebasis aus dem bereitgestellten ZIP wurde weiterverwendet. Beigefügte Dokumente und Beispielbelege dienten als Ausgangsmaterial; der Funktionsumfang folgte dem Nutzerauftrag. Die hochgeladenen Beispielbelege sind nicht im ausgelieferten App-Build enthalten.

## Tatsächlich ausgeführte Prüfung

`npm run build`: PASS. Statischer Build ohne neue Laufzeitpakete, Cache-Version `b9b16f1354ca4566b1a3`.

`npm test`: **32 bestanden, 0 fehlgeschlagen** (einschließlich übergeordneter Testgruppen). Browser: vorhandenes Chromium mit echten IndexedDB-Daten und persistentem Browserprofil. Keine Paketinstallation erforderlich gewesen.

| Prüfung | Ergebnis | Nachweis |
|---|---|---|
| Offline-App-Shell und lokale OCR-Assets | PASS | `tests/app.test.mjs` |
| Original sofort speichern, Browser vollständig beenden, offline erneut öffnen und Auftrag fortsetzen | PASS | `tests/app.test.mjs` |
| Tatsächliche Foto-OCR ohne Netzwerk, auch nach alter abgeschalteter OCR-Einstellung | PASS | `tests/app.test.mjs` |
| PDF-Text, Datum/Betrag und Vorschau ohne Netzwerk | PASS | `tests/app.test.mjs` |
| Suche: Tippfehler, Betrag, Jahrfilter, Dateiname, Tags | PASS | `tests/app.test.mjs` |
| 320/375/390/430 px ohne horizontales Seitenüberlaufen; Dialogbedienung, Dark Mode, Reduced Motion | PASS | `tests/app.test.mjs` |
| Migration IndexedDB v1 → v2, atomarer Rollback und verweigerter Speicher | PASS | `tests/pipeline.test.mjs` |
| Leases, Wiederaufnahme, Hash-Duplikate, Offline-Backoff und Löschung | PASS | `tests/pipeline.test.mjs` |
| Zielwechsel, Uploadbestätigung während Extraktion oder Metadatenbearbeitung | PASS | `tests/pipeline.test.mjs` |
| Uploadwarteschlange in echtem Modul-Service-Worker | PASS | `tests/pipeline.test.mjs`, kontrollierter Cloud-Adapter |
| Dropbox PKCE/State, kurzlebige Anmeldung, Unicode-Header, Originalbytes, stabile Dateipfade | PASS | `tests/cloud.test.mjs`, simulierte Dropbox-Antworten |
| Abgelaufene Anmeldung, falscher OAuth-State, Netzwerkfehler und Dateigrößenlimit | PASS | `tests/cloud.test.mjs` |
| Echte lokale Dateischreibvorgänge und Rechte-/Zielwechsel | PASS | `tests/cloud.test.mjs`, Origin Private File System |
| Unvollständige Sicherung wird abgelehnt | PASS | `tests/app.test.mjs` |
| Linux/macOS-Startskripte: Shellsyntax | PASS | `bash -n` |
| Reale Kamera, Installation und App-Kill auf iOS/Android | NICHT AUSGEFÜHRT | Keine physischen Geräte verfügbar |
| Dropbox-Anmeldung und Upload mit Nutzerkonto | NICHT AUSGEFÜHRT | Kein App-Key/Konto verbunden |
| Windows-Startskript ausführen | NICHT AUSGEFÜHRT | Linux-Umgebung |

## Einsatz und Grenzen

`dist/` enthält die statischen Dateien für HTTPS-Hosting. Lokal startet `bash start.sh` beziehungsweise das passende Mac-/Windows-Skript einen statischen Python-Server. Für mobile Installation muss die App einmal unter ihrer endgültigen HTTPS-Adresse geöffnet werden, bis „Offline bereit“ erscheint. Browserdaten sind an diese Adresse und das Browserprofil gebunden.

Für Dropbox ist eine eigene App-Folder-App mit öffentlichem App-Key und genauer Redirect-URL nötig; Details stehen in `storage-setup.md`. Die Sitzung ist kurzlebig und muss nach Ablauf erneut verbunden werden. Ordnerablage hängt von File System Access und der erteilten Berechtigung ab. Ein bestätigter Ordnerschreibvorgang garantiert nicht die anschließende Synchronisierung eines externen Desktop-Cloudclients.

OCR kann bei vollständig geschlossener PWA nicht dauerhaft garantiert werden, insbesondere auf iOS. Bereits vorbereitete Uploads nutzen verfügbare Hintergrund-Synchronisierung; offene Verarbeitung und Übertragung setzen beim nächsten Öffnen fort. Für garantierte Verarbeitung bei dauerhaft geschlossener App wäre ein Serverdienst oder eine native Integration erforderlich.

IndexedDB ist nicht automatisch verschlüsselt. Gerätesperre, regelmäßige Backups und eine vertrauenswürdige HTTPS-Origin bleiben erforderlich. Externe Ablage ist eine Kopie der Originale; nachträgliche lokale Metadatenänderungen oder lokale Löschung verschieben oder löschen keine vorhandenen Cloud-Dateien.
