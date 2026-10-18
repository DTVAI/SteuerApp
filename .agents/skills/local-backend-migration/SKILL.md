---
name: local-backend-migration
description: Analysiere eine bisher lokal per Python-/Node-/HTTP-Server betriebene App und plane die serverunabhängige Umstellung auf PWA/Capacitor einschließlich Datenbank, Dateien, Authentifizierung und nativer Alternativen. Verwenden bei localhost-App zu Offline-Mobile-App.
---

# Localhost-App zu echter Offline-App

## Das Kernproblem

`http://localhost:3000` auf dem iPhone verweist auf **das iPhone**, nicht auf den Entwickler-Mac. Selbst wenn eine WebView lokal geladen wird, kann das ursprüngliche Python-/Node-Backend fehlen. PWA-Installation ist keine automatische Portierung des Servers.

## Erhebung: serverseitiger Funktionskatalog

Ermittle alle `fetch`, Axios/WebSocket/SSE, serverseitigen Templates/SSR, Datenbank-Zugriffe, Dateipfade, Cron/Jobs, OAuth-Callbacks, Python-Libraries, native Binaries, PDF/OCR/ML, lokale `localhost`-URLs und APIs, die Client-seitig nicht existieren. Dokumentiere pro Funktion Input/Output, Latenz, Dateigröße, Sicherheit und Zielplattform.

## Entscheidung pro Funktion

A. **Browserfähig** → JS/TS/wasm nur mit funktionalem Offline-Test und passenden RAM-/CPU-Budgets.
B. **Geräteseitig nativ** → Capacitor-Plugin, plattformspezifisches Kotlin/Swift oder lokal nutzbare Geräte-API; Kosten/Wartung prüfen.
C. **Remote-Server erforderlich** → bewusst online-only deklarieren, keine vollständige Offline-Fähigkeit versprechen; ggf. Queue und spätere Verarbeitung.
D. **Technisch nicht tragfähig** → Einschränkung, Alternativprozess oder reduzierte Offline-Funktion offen benennen.

## Vorgehen

1. Bestehende Server-Flows gegen tatsächliche Browser-/Mobil-Kompatibilität auditieren.
2. App-Shell und Datenfluss trennen; Feature-Matrix offline/online erstellen.
3. Risikofunktionen als Proof of Concept auf schwachem Endgerät testen (z. B. OCR/ML, große PDFs).
4. Authentifizierung und lokale Sicherheit neu konzipieren; Server-Secrets nicht in JS-Bundle verschieben.
5. Nach und nach Runtime-Server-Abhängigkeiten ersetzen, ohne bestehende Desktop-Funktionalität stillschweigend zu entfernen.
6. Flugmodus/kein LAN/kein Backend + App-Neustart prüfen. Wenn Funktionen nicht offline gehen: benennen.

## Ausgabeformat

Tabelle `Feature`, `bisherige Backend-Abhängigkeit`, `Zielarchitektur`, `Offline möglich?`, `geschätztes Risiko`, `Testnachweis`. Keine pauschale Umsetzbarkeitszusage.
