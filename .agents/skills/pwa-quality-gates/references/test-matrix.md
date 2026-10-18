# Testmatrix (an Projekt anpassen)

| ID | Umgebung | Vorgehen | PASS wenn |
|---|---|---|---|
| PWA-01 | Chrome | Erst online, installieren, Cache füllen | Manifest, Icons, SW aktiv; keine fehlerhaften Assets |
| PWA-02 | Chrome | Tabs schließen, Netzwerk aus, Kaltstart | Startseite und Kernnavigation offline |
| PWA-03 | Chrome | Offline Deep Link öffnen/reload | Route vorhanden oder definierte Offline-Meldung |
| DATA-01 | Chrome | Offline erstellen, App schließen, offline wieder öffnen | Datensatz vorhanden, kein verlorener Commit |
| DATA-02 | Chrome | Offline ändern, online gehen, Server prüfen | genau eine erfolgreiche Mutation / idempotent |
| DATA-03 | Zwei Clients | Gleichen Datensatz parallel ändern | Konfliktstrategie korrekt, kein Silent Overwrite |
| DATA-04 | Chrome | Offline löschen, online resync, pull | Datensatz wird nicht wiederbelebt |
| UPDATE-01 | Chrome | Alte Schema-Version → Upgrade | Daten vollständig, Service Worker veraltet nicht blockierend |
| MOBILE-01 | Android real/emuliert | Install, Flugmodus, Kill, Neustart | Native App öffnet lokal gebündelte Assets und Daten |
| MOBILE-02 | iOS real/simuliert | Install, Flugmodus, Kill, Neustart | WKWebView startet ohne Live-Server |
| MOBILE-03 | Beide | Hintergrund/Resume, Dateiupload, Deep Link | korrekter State und Berechtigungen |
| UI-01 | Mobil | 320–430 px, Touch, Tastatur, Screenreader | UI vollständig bedienbar |
| UI-02 | Mobil | Reduced Motion, Dark Mode, Offline | Relevante Zustände sauber und lesbar |
| SEC-01 | Alle | Netzwerk-/Cache-/Log-Inspektion | Keine sensitiven Inhalte ungewollt gespeichert/versendet |

Regel: ein Gate nur `PASS` markieren, wenn tatsächlich ausgeführt und belegt. Automatisierte Browser-Tests und manuelle Gerätetests separat ausweisen.
