# Quellen-, Bekanntheits- und Adaptionsprüfung

Stand 18.10.2026. **Bekanntheit ist nicht mit Wirksamkeit gleichzusetzen.** Einschätzung basiert auf primären Repositories und offiziellen Codex-Dokumenten, nicht auf einem kontrollierten Skill-Benchmark.

| Quelle | Einordnung | Vorgehen im Paket |
|---|---|---|
| https://github.com/raphaelmans/agent-skills/tree/main/pwa-development | vorhandener, eher kleiner Community-Skill; umfangreiche PWA-Anleitung | Inhaltliche Themen in `pwa-app-shell` wesentlich straffer und testorientiert neu formuliert |
| https://github.com/agents-inc/skills/tree/main/src/skills/web-pwa-offline-first | technisch konkret (IndexedDB, Queue, Versionen, Tombstones); Community-Reichweite begrenzt | Kernmuster eigenständig in `offline-first-data` integriert; kein blinder Sync für rein lokale Apps |
| https://github.com/capawesome-team/skills/tree/main/skills/capacitor-app-development | spezialisiert durch Capacitor/Capawesome-Team, guter fachlicher Ausgangspunkt | version-agnostischer `capacitor-mobile` mit Fokus auf vorhandene Apps und Offline-Gates |
| https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines | etablierte Vercel-Sammlung für UI- und Accessibility-Prüfung; Original lädt externe Live-Regeln | autarker `mobile-ui-craft` ohne Abhängigkeit von externem Live-Fetch |
| https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices | etablierter React/Next-Regelsatz | konditionaler `react-performance`, niemals auf Vanilla JS/Vue anwenden |
| https://github.com/pbakaus/impeccable | große Community, eigenständige Design-Engine, Hooks und CLI | **nicht eingebettet**, optional native Installation; Prinzipien im eigenen `mobile-ui-craft` berücksichtigt |
| https://github.com/viettran-edgeAI/codex_workflow | Reddit-diskutierter Orchestrierungsansatz mit Light/Medium/Heavy | Prinzip der aufwandsabhängigen Delegation inspiriert `capability-delegator`; kein Framework-Code übernommen |
| https://learn.chatgpt.com/docs/build-skills | offizielle Skill-Struktur `.agents/skills/` | Paketstandard und Installer |
| https://learn.chatgpt.com/docs/agent-configuration/subagents | offizielle native Subagents, `.codex/agents/`, Modellwahl, Thread-Limits | TOML-Rollen und Grenzen im Delegator |

**Bewusste Ergänzungen:** `local-backend-migration`, `pwa-quality-gates`, `privacy-security-review` schließen praktische Lücken, gerade für alte localhost-Projekte und Anwendungen mit personenbezogenen Daten.

**Adaptionshinweis:** Texte und Tests in diesem Paket sind eigenständig erstellt; externe Quellen werden als Inspiration bzw. Nachschlagemöglichkeit genannt. Keine externe Binärdatei, kein fremder Hook, keine unverändert kopierte SKILL.md-Datei im ZIP. Änderungen an genannten Projekten nach diesem Datum sind möglich.
