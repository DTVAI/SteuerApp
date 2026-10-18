---
name: mobile-ui-craft
description: Gestalte und auditiere hochwertige mobile Web-/PWA-/Capacitor-Oberflächen mit Touch-UX, responsivem Layout, Accessibility, sinnvoller Bewegung und visueller Konsistenz. Benutzen bei UI-Redesigns, Designreviews und mobilen Interaktionen.
---

# Mobile UI Craft – starke Gestaltung, keine Effekthascherei

Erhalte bestehende Produktidentität und funktionierende Flows; gestalte keine generische, überladene Dashboard-Kulisse. Bewerte zuerst Nutzerwege und UI-Zustände, dann visuellen Stil.

## Designprozess

1. Sichtung vorhandener Screens, Komponenten, Design-Tokens, Markenfarben, Typografie und Interaktionen. Keine neue Library ohne guten Grund.
2. Definiere eine klare visuelle Richtung mit wiederverwendbaren Tokens (Spacing, Type Scale, Radius, Elevation, Color Roles, Motion-Dauer).
3. Mobile-first: 320/375/390/430 px und Tablet testen; ergonomische Touch-Ziele, eindeutige Navigationshierarchie, horizontale Scrollbar nur wenn sinnvoll; Safe-Area-Insets auf iOS berücksichtigen.
4. Alle States gestalten: Loading, Offline, lokal gespeichert, Sync Pending, Konflikt, leere Ansicht, Fehler, Berechtigung, Erfolg. Text für Status muss fachlich korrekt sein.
5. Bewegung nur funktional: Mikrofeedback, Transitionen und Upload/Verarbeitung; `prefers-reduced-motion`, pausierbare/reduzierte Animationen; CPU/GPU-Last messen, keine permanenten 60-fps-Effekte aus Prinzip.
6. Accessible by default: semantische Elemente, Labels, Tastatur-/Screenreaderbedienbarkeit, sichtbarer Fokus, Kontraste, große klickbare Bereiche, Fehlermeldungen und Formulare.
7. Performance: stabile Layouts, Bilddimensionen, Lazy-Loading nicht übertreiben, lokal verfügbare Fonts/Assets für Offline-Betrieb; Animationen bevorzugt mit `transform`/`opacity` statt Layout-Reflow.
8. Responsive und Dark Mode optisch abgleichen; nicht nur Desktop-Screenshot beurteilen.

## Qualitätsausgabe

Vorher/Nachher mit konkreten UI-Änderungen, Dateibelegen und visuellen Tests (wenn Browser vorhanden). Fehlende echte Screenshots nicht erfinden. Tests müssen mindestens kleine Displays, reduzierte Bewegung, Touch, Fokus und Offline-Zustände abdecken.

## Optionales Originalwerkzeug

Wenn **offizielles Impeccable separat installiert** ist, kann es zusätzliche Design-/Lint-Funktionen liefern. Nicht behaupten, es sei durch diesen Skill mitgeliefert oder seine Hooks seien bereits aktiv. Den Link zum Original enthält `SOURCES.md` des Pakets.
