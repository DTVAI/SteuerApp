---
name: capability-delegator
description: Delegiere komplexere Programmieraufgaben in Codex an native Subagents nach nachgewiesenen Aufgabenanforderungen, Werkzeugzugriff, Modellverfügbarkeit und Tokenbudget. Benutzen bei Multi-Agent-Aufgaben, großen PWA-Migrationen und unabhängigen Prüfungen; NICHT für triviale Änderungen.
---

# Capability Delegator – zielgerichtet, sparsam, überprüfbar

Du bist der **Hauptagent**. Verwende die nativen Codex-Subagent-Werkzeuge, **falls sie dir tatsächlich zur Verfügung stehen**. Diese Datei kann keine Agents ausführen. Erfinde keine ausgeführten Agenten, Toolrechte, Modellnamen, Tokens oder Ergebnisse. Bei fehlender Subagent-Funktion: allein arbeiten und dies transparent melden.

## Schritt 1: Auftrag lesen, Komplexität bewerten

Analysiere: gewünschtes Ergebnis, Akzeptanzkriterien, technische Unsicherheit, Daten-/Sicherheitsrisiko, bestehende Projektstruktur, Testbarkeit, Dateien, parallele Unabhängigkeit. Starte nicht reflexartig Agents.

| Route | Wenn | Durchführung |
|---|---|---|
| Light | klar umrissen; kleiner Fix; einfacher Refactor; < ca. 3 betroffene Dateien | Hauptagent allein; direkt testen |
| Medium | eine wichtige Unklarheit oder unabhängig prüfbare Teilfrage; moderate Änderung | maximal **ein** read-only Subagent zur Prüfung, Hauptagent implementiert |
| Heavy | mehrere trennbare Untersuchungen oder größere Architekturmigration mit Tests | maximal **zwei** Subagents gleichzeitig; zunächst read-only, dann begrenzte Umsetzung, dann Review |

Wenn Parallelisierung keine nachweisbaren Vorteile verspricht, Light nehmen, selbst wenn der Auftrag groß klingt. Bei engem Tokenbudget keine Heavy-Route ohne ausdrücklichen Grund. Ein langes Projekt darf in Sequenzen zerfallen, keine endlosen parallelen Worker.

## Schritt 2: Wirkliche Fähigkeiten statt Rollennamen prüfen

Ermittle **vor** Routing:
1. Welche nativen Agents und Tools stehen zur Verfügung (Browser, Filesystem, iOS-/Android-Build, Codeausführung, ggf. visuelle Prüfung)?
2. Welche Modelle/Reasoning-Stufen sind verfügbar? Nur verifizierte Angaben nutzen. Kein Zugriff auf Sol oder Luna unterstellen.
3. Gibt es spezialisierte lokale Skill-Dateien? Lies nur die für die Aufgabe relevanten.
4. Ist das Projekt React oder nicht, Capacitor bereits vorhanden oder nicht, synchronisierte Daten oder nur lokal?
5. Welche Dateien dürfen Agenten verändern? Wer übernimmt Integration und abschließende Tests?

**Rollenwahl:**
- `code_explorer` → breites, read-only Code-Mapping; präzise Quellen.
- `offline_architect` → Datenmodell, Offline-Strategien und Migrationsentscheidungen; hohe Komplexität.
- `mobile_integrator` → iOS/Android/Capacitor; nur wenn Plattformproblem existiert.
- `ui_specialist` → Interaktion, Accessibility, Design-Spezifikation, visuelle Prüfung.
- `implementation_worker` → eng definierte, bereits entschiedene Codeänderungen.
- `qa_reviewer` → unabhängige Regression/Tests; bevorzugt nicht der Autor des Codes.
- `privacy_reviewer` → PII, Verschlüsselung, Datenlöschung, riskante Telemetrie.

Falls eine Rolle nicht vorhanden ist, nutze einen existierenden Built-in-Agent und beschreibe dessen Auftrag; nicht behaupten, eine TOML-Rolle existiere. Modellstärke an Komplexität ausrichten: schnelle verfügbare Modelle für abgegrenzte Recherche; stärkeres verfügbares Modell für Architektur, schwierige Debugging-Fälle oder Security-Review. **Modellwahl überprüfen**, nicht anhand von Namen behaupten. Rollenlabels sind keine gemessene Qualität.

## Schritt 3: Grenzen und Delegationsvertrag

Für jeden Subagent maximal 1 klar definierter Teilauftrag: `Ziel`, `Input`, `Scope/Dateien`, `Read-only vs. Write`, `Nicht-Ziele`, `Akzeptanzkriterien`, `Tests`, `Rückgabeformat`, `Budget`. Gib keinen kompletten Gesprächsverlauf weiter, wenn eine präzise Zusammenfassung genügt.

**Standard:** 2 parallel; keine rekursive Subagent-Delegation; keine parallelen Edits im selben Modul; kein Agent darf ohne Freigabe Deployments, Paketinstallationen, git reset, Datenexport oder destruktive Migrationen ausführen. Tatsächliche Sandbox-Rechte folgen den Parent-Berechtigungen – read-only im Prompt ist **keine technische Zugriffsbeschränkung**.

Beispiel-Delegation für eine PWA:
- paralleler Read-only-Check A: Service Worker/Manifest/Build;
- paralleler Read-only-Check B: lokaler Backend-/DB-/Sync-Pfad;
- danach Architekturentscheidung durch Hauptagent;
- begrenzte Umsetzung nacheinander oder in dateiseitig disjunkten Bereichen;
- unabhängiger QA-Check und Hauptagenten-Test.

## Schritt 4: Fach-Skills auswählen (nicht alle zugleich)

- Installierbarkeit/Cache: `$pwa-app-shell`
- IndexedDB und Synchronisierung: `$offline-first-data`
- iOS/Android: `$capacitor-mobile`
- Design/Touch/Animation: `$mobile-ui-craft`
- React-Performance **nur bei React**: `$react-performance`
- End-to-End-Tests: `$pwa-quality-gates`
- Lokaler Node-/Python-Server: `$local-backend-migration`
- personenbezogene oder HR-Daten: `$privacy-security-review`

## Schritt 5: Qualitätskontrolle und Ergebnis

Vor Abschluss: alle Agentenresultate einsammeln; Belege prüfen; Integrationskonflikte klären; Tests **wirklich** selbst ausführen und Resultate angeben. Reports kurz: `Route`, `Subagents inkl. tatsächlicher Modellkonfiguration soweit bekannt`, `Entscheidungen`, `Dateien`, `Tests + Ergebnisse`, `offene Risiken`. Keine bloße Behauptung "funktioniert offline" ohne Kaltstartprüfung.

Für Aufgaben- und Übergabestruktur: `../../templates/handoff-report.md` im ursprünglichen Paket; im installierten Projekt kann stattdessen eine äquivalente Kurzvorlage in der Antwort verwendet werden.

## Fehlende Agent-Funktionen

Wenn Codex kein native Spawning bereitstellt, **keine** Shell-Subprozesse oder API-Calls starten, um einen Agenten heimlich zu simulieren. Arbeite seriell. Optional `scripts/route_task.py` aus dem Originalpaket als Vorschlag; dessen Heuristik ersetzt keine technische Toolprüfung.
