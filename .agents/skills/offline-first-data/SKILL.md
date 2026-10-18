---
name: offline-first-data
description: Plane und implementiere robuste Offline-Datenhaltung mit IndexedDB, Schema-Migrationen, Sync-Queues und Konfliktstrategie. Verwenden bei offline editierbaren Datensätzen, persistenter Speicherung und Wiederverbindung; reine PWA-Dateicaches gehören nicht hierher.
---

# Lokale Daten sind keine HTTP-Cache-Einträge

## Kläre zuerst drei Betriebsfälle

1. **Reine Offline-App ohne Cloud:** IndexedDB oder geeignete Geräte-Datenbank als persistenter Store, **keine Sync-Queue nötig**.
2. **Offline lesen, online schreiben:** lokaler Read-Cache und deutliche Grenzen; keine pseudolokalen Write-Versprechen.
3. **Offline CRUD + späterer Sync:** lokaler Store + transaktionaler Outbox-Mechanismus, Idempotenz und Konfliktlösung.

## Verbindliche Implementierungsregeln

- Verwende für umfangreiche strukturierte Web-Daten IndexedDB (z. B. `idb` oder Dexie, nur falls im Projekt sinnvoll vorhanden). Keine großen JSON-Datensammlungen in localStorage.
- Versionsmigrationen müssen von altem Schema auf neues funktionieren, mit Backup/Recovery-Plan für kritische Daten.
- Bei Sync: lokale Mutation und Outbox-Eintrag **in einer IDB-Transaktion**, atomar, bevor der UI-Erfolg bestätigt wird. Keine `await fetch()` innerhalb einer offenen IDB-Transaktion.
- IDs stabil; Mutationen mit Idempotenzschlüssel; serverseitig Wiederholungen tolerieren; Batch-Grenzen und Retry mit exponential backoff + jitter.
- Löschungen mit Tombstones, bis Remote-Bestätigung und korrekte Garbage Collection erfolgt; sonst droht Wiederauferstehung.
- Stale-Version erkennen (z. B. ETag/Revisionen); Strategie pro Entität festlegen: Server-authoritative, LWW nur bei explizit geringem Konfliktrisiko, manuelle Auflösung bei personenbezogenen/geschäftskritischen Daten.
- `navigator.onLine` nicht als Beweis für erreichbare API verwenden; Background Sync allein reicht nicht für iOS/Safari. Synchronisiere beim App-Start, Sichtbarwerden, Online-Ereignis und manuellem Versuch – mit deduplizierter Queue.
- Status unterscheiden: „lokal gespeichert“, „wartet auf Synchronisation“, „synchronisiert“, „Konflikt“, „fehlgeschlagen“. Niemals „gespeichert“ im Sinne von Serverbestätigung behaupten, wenn nur lokaler Commit existiert.
- Für große Dateien/Blobs Datei-API, Größenbegrenzung, Quota und Eviction separat prüfen; insbesondere iOS.

## Sicherheitsgrenzen

Geheimnisse/Authentifizierungs-Token nicht naiv in JS-zugänglicher Langzeitspeicherung ablegen. Offline-Daten können bei Gerätezugriff/Backup zugänglich sein; bei HR-Daten `$privacy-security-review` zwingend anwenden. Persistenz ist nicht automatische Verschlüsselung.

## Nachweise

Offline erstellen → App schließen → Neustart ohne Netzwerk → Daten vorhanden → wieder verbinden → Queue drain → Server bestätigt → zweites Gerät ändert gleichzeitig → Konflikt erkannt → Delete/Restore testen. Tests für Crash **zwischen lokalem Commit und Remote-Ack** und für Schema-Migration.
