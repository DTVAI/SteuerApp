# SteuerApp – Codex Skills und Agenten

Dieses Repository enthält das projektlokale Codex PWA Agent Studio aus dem bereitgestellten Paket v1.0. Anwendungscode ist noch nicht vorhanden.

## Start

1. Dieses Repository in Codex als Projekt öffnen, im Terminal beispielsweise `cd /workspace/SteuerApp` und `codex`.
2. Falls Codex fragt, das eigene Projekt als vertrauenswürdig bestätigen. Projektkonfigurationen werden je nach Client erst für vertrauenswürdige Projekte geladen.
3. Nach Änderungen an Skills oder Agenten eine neue Sitzung starten bzw. das Projekt neu öffnen.
4. Einen Skill ausdrücklich mit `$skill-name` ansprechen oder eine passende Aufgabe beschreiben. `AGENTS.md` enthält die Projektregeln zur gezielten Auswahl.

Beispiele für Nachrichten an Codex:

```text
$capability-delegator Untersuche dieses Repository und plane die nächsten Schritte.
Nutze bei Bedarf maximal zwei Agenten parallel. Noch nichts implementieren.
```

```text
$pwa-app-shell Prüfe Manifest, Service Worker und Offline-Kaltstart.
```

```text
$privacy-security-review Prüfe den Umgang mit personenbezogenen Steuerdaten.
```

```text
Nutze den Agenten code_explorer für eine Bestandsaufnahme und qa_reviewer
für eine unabhängige Testprüfung. Berichte die Ergebnisse mit Dateibelegen.
```

Ein leerer Projektstand erlaubt zunächst nur Planung; die Beispiele setzen für konkrete App-Prüfungen Anwendungscode voraus.

## Skills

Die neun Skills liegen in `.agents/skills/<name>/SKILL.md`:

| Name | Aufgabe |
| --- | --- |
| capability-delegator | Aufgaben einschätzen und gezielt delegieren |
| pwa-app-shell | Manifest, Service Worker und Offline-Start |
| offline-first-data | Lokale Datenhaltung, Synchronisation und Konflikte |
| capacitor-mobile | iOS-/Android-Integration mit Capacitor |
| mobile-ui-craft | Mobile Oberfläche und Barrierefreiheit |
| react-performance | Performance bei React-/Next-Projekten |
| pwa-quality-gates | Offline-, Plattform- und Regressionstests |
| local-backend-migration | Abhängigkeiten von lokalen Servern untersuchen |
| privacy-security-review | Datenschutz und sichere Speicherung |

## Agenten

Die sieben Rollen liegen in `.codex/agents/`:

- `code_explorer`: Bestandsaufnahme
- `offline_architect`: Offline- und Datenarchitektur
- `mobile_integrator`: Native Integration
- `ui_specialist`: Oberfläche und Bedienbarkeit
- `implementation_worker`: Klar abgegrenzte Implementierung
- `qa_reviewer`: Tests und Regressionen
- `privacy_reviewer`: Datenschutz und Sicherheit

`.codex/config.toml` aktiviert Agenten mit maximal zwei gleichzeitigen Subagenten. Es werden keine Modelle fest vorgegeben. Kleine Aufgaben bearbeitet der Hauptagent allein; das Ablegen einer Rolle startet noch keinen Agenten. Tatsächliche Rollenerkennung und Delegation hängen vom verwendeten Codex-Client ab. Die Dateien ändern die Konfiguration einer bereits laufenden Chatsitzung nicht rückwirkend.

## Prüfung und Herkunft

Vor der Installation bestanden die statische Paketprüfung und alle sechs mitgelieferten Unittests. Nach der Installation wurden neun Skill-Dateien, sieben TOML-Rollen und die TOML-Konfiguration geprüft. Codex CLI 0.159.2 meldete im Konfigurationscheck `config loaded`; ein tatsächlicher Start der Rollen wurde nicht getestet. Der allgemeine Doctor meldete außerdem eingeschränkte Provider-Erreichbarkeit in dieser Umgebung.

Die Skills und Rollen sind Teil dieses Repositorys. Eine neue Codex-Sitzung benötigt einen Checkout des Branches, der diese Dateien enthält. Bei lokalen Änderungen müssen auch die versteckten Verzeichnisse `.agents` und `.codex` committed und zum Remote-Repository gepusht werden, bevor ein frischer GitHub-Checkout sie enthält.

Herkunft, Lizenz und weitere Prompt-Beispiele stehen unter `docs/codex/`. Die Inhalte des ZIPs wurden als Installationsmaterial behandelt, nicht als Auftrag zur App-Entwicklung oder zum Start zusätzlicher Agenten.
