---
name: react-performance
description: Prüfe und verbessere Rendering, Bundle-Größe, Datenlade-Wasserfälle und Komponentenarchitektur in bestehenden React-/Next.js-PWAs. Nur aktivieren, wenn React tatsächlich im Projekt eingesetzt wird; nicht auf Vue, Svelte oder Vanilla JS übertragen.
---

# React Performance – zuerst messen, dann optimieren

## Scope prüfen

Ermittle React-/Next-Version, Build-System und App-Router/Pages-Router. Bestehende Tests und Performancewerte sammeln. Bei Nicht-React: diesen Skill **nicht** anwenden. Next.js mit servergebundenen Pages/Actions kann nicht ohne Weiteres offline in Capacitor geladen werden; mit `$local-backend-migration` abstimmen.

## Optimierungspriorität

1. Kritische Ketten von Netzwerk-/Async-Aufrufen erkennen, unabhängige Anfragen parallelisieren und vermeidbare Wasserfälle entfernen.
2. JavaScript-Bundle nach Route/Funktion teilen, große Libraries dynamisch laden, teure Importe und doppeltes Polyfilling messen.
3. Rendering-Probleme im Profiler belegen: teure Listen, unnötige Re-renders, instabile Keys/Props, problematische Effects.
4. UI-State und serverseitige Daten korrekt trennen: Client-Persistenz für Offline-First, keine unnötige API-Abfrage bei jedem Render; Invalidierung und Recovery testen.
5. Accessibility und Navigations-Korrektheit bei Performance-Refactors erhalten; keine unreflektierte `memo`-/`useMemo`-Verteilung.
6. Wichtig für PWA: Caches, IndexedDB-Migration und JS-Bundle-Versionen kompatibel halten; `lazy()`-Chunks offline precachen, sofern für Offline-Flows nötig.

## Messgrößen und Tests

Vorher/nachher: JS-Byte-Größe, Navigation/LCP/INP nach Möglichkeit, React Profiler, Testlauf/Regressionsfehler. Wenn keine Performance-Tools verfügbar: nur Hypothese, keine gemessenen Gewinne behaupten.

## Herkunft

Eigenständige Zusammenfassung von React-Grundsätzen, inspiriert von Vercels React Best Practices; keine Übernahme des umfangreichen Original-Regelsatzes.
