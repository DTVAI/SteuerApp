---
name: privacy-security-review
description: Prüfe Web-/PWA-/Capacitor-Projekte mit sensiblen oder personenbezogenen Daten auf lokale Speicherung, Gerätediebstahl, Logs, Berechtigungen, Löschung, DSGVO-Risiken und Angriffsflächen. Benutzen bei HR-/Recruiting-Anwendungen, sensiblen Uploads und Offline-Speicherung.
---

# Privacy + Security Review für lokale Apps

Dies ist technische Risikoprüfung, **keine Rechtsberatung**. Bei HR-Daten hohe Sensibilität annehmen, auch ohne besondere Kategorien. Prüfe Datenschutz durch Design, Datenminimierung, Art. 5/25/32 DSGVO als Orientierungsrahmen, ohne Compliance zu behaupten.

## Pflichtpunkte

- Dateninventar: Bewerberprofile, Anhänge, Telefonnummern, Kommentare, Dokumente und Tokens. Welche Daten **müssen** offline verfügbar sein?
- Speicherung: IndexedDB/Cache Storage/Capacitor Filesystem/Backups. Ist sie durch Gerätesperre und Plattformmechanismen ausreichend geschützt? Web-IndexedDB ist **nicht automatisch Ende-zu-Ende-verschlüsselt**.
- XSS/Injection: lokal abgelegte Bewerbertexte oder HTML können gefährlich sein; sichere Ausgabe, Sanitisierung, CSP, keine fremden HTML-Snippets ausführen.
- Auth: Offline-Sitzung/Tokenablauf, Revocation, unbefugter Gerätezugriff; hochprivilegierte Aufgaben nicht allein aufgrund alter Token offline erlauben.
- Speicherung/Retention: definiertes Löschkonzept einschließlich Cache, Blob-Speicher, Outbox, Tombstones, Backups und Sync-Replikate.
- Datenexport & Löschung: Offline-Änderungen bei Widerruf/Accountwechsel kontrolliert behandeln; Daten nicht heimlich synchronisieren.
- Logging: keine personenbezogenen Inhalte, Bilder, PDFs, Access-Tokens oder vollständige Requests in Klartext-Logs/Analytics.
- Permissions: Kamera/Datei/Clipboard/Benachrichtigung nur nach Bedarf, nur erforderliche Daten weitergeben.
- Drittanbieter und Cloud: alle Übermittlungen / DPA / Hosting prüfen, insbesondere bei Bewerberdaten.
- Review-Modus und Löschtests dokumentieren; keinen Compliance-Status ohne rechtliche Prüfung vergeben.

## Risikobericht

Priorität `kritisch/hoch/mittel/niedrig`, `konkreter Angriffs-/Verlustpfad`, `betroffene Datei/Funktion`, `Reproduktion/Evidenz`, `minimaler Fix`, `Restrisiko`.
