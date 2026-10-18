# Belegwerk PWA

**Öffnen → Foto machen oder Datei hinzufügen → „Auf diesem Gerät gespeichert“ abwarten → schließen.**

Belegwerk übernimmt danach Texterkennung, Vorschläge für Datum/Betrag/Aussteller/Kategorie und die geordnete Ablage. Offene Arbeit bleibt in einer dauerhaften Warteschlange. Die App enthält keine Chatoberfläche und benötigt keinen Ollama- oder anderen lokalen Analyse-Server.

## Sofort ausprobieren

Nach dem Klonen oder Herunterladen dieses GitHub-Repositorys zunächst `node scripts/build.mjs` ausführen (Node.js 20+, keine Paketinstallation). Dadurch entsteht der fertige statische Build unter `dist/`. Ein vorbereitetes PWA-Paket kann diesen Build bereits enthalten. Danach das passende Startskript ausführen:

- macOS: `Belegwerk starten (Mac).command` (gegebenenfalls Rechtsklick → Öffnen).
- Windows: `Belegwerk starten (Windows).bat`.
- Linux: `bash start.sh`.

Die Startskripte benötigen Python 3 und stellen ausschließlich statische Dateien unter `http://localhost:8765/` bereit. Sie sind für die lokale Vorschau auf diesem Rechner gedacht. Derselbe Browser, dieselbe Adresse und derselbe Port greifen auf dieselben lokalen Belege zu.

## Als mobile PWA verwenden

1. Den **Inhalt von `dist/`** auf einer vertrauenswürdigen HTTPS-Adresse bereitstellen, auch in einem Unterordner möglich. Es ist kein Anwendungsserver nötig.
2. Diese Adresse am Smartphone öffnen und auf **„Offline bereit“** warten. Sämtliche Bibliotheken und deutsche OCR-Sprachdaten werden lokal vorgehalten.
3. Android/Chromium: „App installieren“. iPhone/iPad: Teilen → Zum Home-Bildschirm.
4. Optional in den Einstellungen Dropbox oder einen unterstützten Ordner verbinden. [Ablage einrichten](docs/storage-setup.md).
5. Foto aufnehmen oder Datei wählen. Die Erfolgsmeldung bestätigt den dauerhaften lokalen Commit; „Extern abgelegt“ bestätigt die spätere Ablage.

Dateien: PDF, Fotos einschließlich HEIC (browserabhängig), Word, Excel, CSV, Text, HTML, E-Mail und ZIP. Unklare Erkennung ist als **„Zu prüfen“** markiert; Angaben lassen sich im Beleg korrigieren. Steuerliche Zuordnungen sind Vorschläge.

## Suche

Volltextsuche über erkannte Inhalte, Original- und Ablagenamen, Aussteller, Belegart, Kategorie, Notizen, Schlagwörter, Betrag und Datum. Mit Wortanfängen, Umlautnormalisierung, Tippfehlertoleranz, Treffertexten und Filtern.

Beispiele: `Müller`, `129,90`, `jahr:2025 betrag>100`, `"Rechnungsnummer"`, `von:2025-01 bis:2025-06`, `#Fortbildung`. Treffer lassen sich als geordnetes ZIP exportieren. In den Einstellungen gibt es zusätzlich eine vollständige Sicherung mit Originalen.

## Hintergrundverarbeitung

OCR läuft im Web Worker einer geöffneten App. Das Betriebssystem kann sie nach dem Schließen oder beim Hintergrundwechsel anhalten. **Eine reine PWA garantiert insbesondere auf iOS keine dauerhaft laufende Hintergrund-OCR.** Die Originale und Aufträge sind vorher gespeichert und werden beim nächsten Öffnen automatisch weiterverarbeitet.

Bereits verarbeitete Uploadaufträge können über einen Service Worker und Background Sync weiterlaufen, soweit Browser, Rechte und Dropbox-Sitzung dies erlauben. Andernfalls werden sie ebenfalls beim nächsten Öffnen fortgesetzt. Dropbox benötigt einmalig eine eigene App-Folder-App mit öffentlichem App-Key. Kurzlebige Sitzungen müssen nach Ablauf erneut verbunden werden; keine langfristigen Refresh-Tokens liegen im Browser. Details: [Speicheranbindung und Grenzen](docs/storage-setup.md).

## Entwicklung und Prüfung

```sh
node scripts/build.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Build: Node.js 20 oder neuer, keine Paketinstallation. Der Build generiert die Cache-Version aus den tatsächlich ausgelieferten Dateien und stellt das Deployment-Verzeichnis zusammen. Nach Codeänderungen erneut bauen. Vorhandene Belegwerk-Daten auf derselben Origin werden aus IndexedDB v1 nach v2 übernommen.

```sh
node --test tests/pipeline.test.mjs tests/cloud.test.mjs
node --test tests/app.test.mjs
```

Die ersten Tests benötigen Node.js 22+ (WebSocket) und Chromium. Die App-Prüfung verwendet zusätzlich ein vorhandenes Playwright; hier ist es vorinstalliert. Abweichenden Chromium-Pfad über `CHROMIUM` setzen. Die Tests führen keine echten Dropbox-Uploads aus. Die vollständige Appprüfung umfasst echte Offline-OCR, persistente Browserprofile, einen kompletten Browser-Neustart und 320–430-px-Layouts.

Architektur: [docs/architecture.md](docs/architecture.md). Ergebnisbericht: [docs/refactor-report.md](docs/refactor-report.md). Repository-Anweisungen und Skills bleiben unter `AGENTS.md`, `.agents/skills/`, `.codex/` und [docs/codex](docs/codex/README.md) erhalten.
