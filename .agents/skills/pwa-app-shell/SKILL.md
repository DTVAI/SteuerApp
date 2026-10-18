---
name: pwa-app-shell
description: Entwirf, implementiere und prüfe installierbare Progressive Web Apps mit Service Worker, Manifest, Cache- und Update-Strategie. Verwenden bei PWA-Installierbarkeit, Offline-Start und Web-Caching; nicht zur Daten-Synchronisation.
---

# Offline startfähige PWA-Shell

## Vorher untersuchen

Projektstruktur, Framework und Rendering-Art (SPA/SSR/Server-Routes), Bundler, Routen/Assets, bereits vorhandene Service Worker, `manifest.webmanifest`, Authentifizierung, Content Security Policy, Deployment-Basispfad, Offline-Bedarf. Baue keinen zweiten konkurrierenden Worker ein. Prüfe Abhängigkeit von SSR / API.

## Umsetzung

1. Manifest: Name, Icons (inkl. maskable, real vorhandene Dateien), `start_url`, `scope`, `display`, Theme. Keine Fantasiepfade.
2. SW nur unter HTTPS oder localhost. Asset-Precache **aus dem tatsächlichen Build-Manifest** und Content-Hash; Versionierung und kontrollierte Aktivierung.
3. Navigationsfallback nur auf App-Routen; niemals Login-Endpunkte, API-Calls oder sensible fremde Seiten ungeprüft mit HTML beantworten.
4. Strategie: versionierte App-Shell precache; öffentliche Bilder/fonts je nach Aktualitätsbedarf cache-first oder stale-while-revalidate; API-Inhalte getrennt und vorsichtig, bei personenbezogenen Daten standardmäßig **nicht** in ungeschützten Cache Storage legen.
5. `skipWaiting()`/`clients.claim()` bewusst planen: keine Daten- oder Formularverluste bei Updates; explizites Update-UI falls erforderlich.
6. Offline-Status nicht nur anhand von `navigator.onLine` behaupten. Lokale Writes und Sync gehören zu `$offline-first-data`.

## Qualitätsnachweise

- Nach erstem Online-Laden: DevTools offline, alle Browser-Tabs schließen, **komplett ohne Netzwerk neu öffnen**, Deep Link prüfen.
- Route und Datenfunktionen dokumentieren: welche Pfade offline und welche bewusst online-only sind.
- Update auf neue App-Version simulieren, Backward Compatibility mit lokalem Schema prüfen.
- Safari/iOS-Besonderheiten (Add to Home Screen, Quota/Eviction, Plattformlimits) gesondert auf Gerät testen.
- Lighthouse nur als Indikator; echter Offline-Kaltstart und Funktionstest sind entscheidend.

## Nicht tun

Service Worker nicht für persistente Entitätsdatenhaltung missbrauchen; keine unbeschränkten Cache-Gößen, keine pauschalen `fetch`-Caches für private APIs, keine Scheingenauigkeit bei Browser-Unterstützung.
