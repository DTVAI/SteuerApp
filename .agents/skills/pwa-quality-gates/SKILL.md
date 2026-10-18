---
name: pwa-quality-gates
description: Plane und automatisiere reale Qualitätsprüfungen für PWAs und Capacitor-Apps: Offline-Kaltstart, Installierbarkeit, Sync-Konflikte, Browser-Tests, iOS/Android und sichere Updates. Benutzen bei Release, Migration und Fehlerdiagnose.
---

# PWA Quality Gates – Beweise statt grüner Behauptungen

## Testdesign

Unterscheide **Browser-Simulation** (Playwright) von **realer Plattformprüfung** (Android/iOS). Ein Desktop-Chromium-Test beweist nicht Safari-Persistenz oder nativen Capacitor-Dateizugriff. Lies vor Testlauf Stack/Run-Scripts und richte Tests passend zum bestehenden Setup ein; keine externe Dependency ohne Abstimmung.

## Mindestgates

1. Test erfolgreich, wenn Online-Erstladung und SW-Aktivierung korrekt sind (falls PWA).
2. Offline-Kaltstart: App zuvor geladen, Tabs schließen, Netzwerk deaktivieren, URL erneut öffnen; keine Remote-Runtime-Anfrage erforderlich.
3. Deep-Link-Reload offline; fehlende Route führt zu verständlicher Meldung statt weißer Seite.
4. Offline-CRUD; Neustart im Flugmodus; unveränderte Datensätze. Falls keine CRUD-Funktion: dokumentiere N/A.
5. Synchronisierung falls vorhanden: Retry, Duplicate Submit, zwei Geräte/Versionenkonflikte, Delete-Tombstone, fehlender Server, Wiederanlauf.
6. Upgrade: alter Cache und neue App-Version, Schema-Migration, bestehende Nutzerdaten erhalten, Browser-Update ohne verloren gegangene Formularwerte.
7. Berechtigungen, Storage Quota/Eviction, Mobile Safari, Android WebView, Capacitor Pause/Resume nach Möglichkeit.
8. Security/Privacy: kein PII-Leak in Logs/Cache/Telemetrie, keine Fremd-Origins/unsichere CORS-Bypässe.

## Berichtsschema

Pro Gate: `ID`, Umgebung/Version, Schritte, erwartetes Ergebnis, tatsächlich beobachtet, Beleg (Datei/Screenshot/Testreport), `PASS/FAIL/BLOCKED/NOT RUN`. Blocked ≠ Pass. Vermutete oder simulierte Ergebnisse nicht als beobachtete Tests ausgeben. Bei nicht verfügbarer iOS-Umgebung explizit melden.

## Weiteres

Siehe `references/test-matrix.md`. Bei Playwright Integration bestehende Konfiguration bevorzugen; für echtes Offline-Caching Browser-Kontext mit persistentem Profil testen und `serviceWorkers: 'block'` **nicht** setzen.
