---
name: capacitor-mobile
description: Integriere oder prüfe bestehende Web-Apps als installierbare iOS- und Android-Anwendungen mit Capacitor, nativer Bridge, lokalen Assets und sicheren Plattform-APIs. Benutzen bei iOS/Android-Build, App Store, nativen Plugins und Mobile-WebView; nicht für reines PWA-Caching.
---

# Capacitor: Webcode + echte native App-Hülle

Capacitor erzeugt **native iOS/Android-Projekte**, deren Oberfläche Web-Technologien in einer **WebView** nutzt. Native Integration bedeutet nicht, dass eine lokale Python-/Node-Serveranwendung automatisch auf einem Smartphone mitläuft.

## Vor jedem Schritt

Lies `package.json`, Build-Skripte, `capacitor.config.*`, `ios/`, `android/`, Framework/SPA/SSR, Node-Version, native Plugins. Ermittle die aktuell installierte Capacitor-Hauptversion und nutze dazu passende CLI-Dokumentation; keine inkompatiblen Plugin-Majors mischen. Android Studio/SDK und für iOS Xcode/macOS prüfen.

## Migrationsreihenfolge

1. Vollständige Runtime-Abhängigkeiten von HTTP/localhost und Backend identifizieren (siehe `$local-backend-migration`).
2. Ziel festlegen: nur Browser-PWA, Capacitor-Pakete oder beides; offline startbare statische Web-Assets erzeugen.
3. App-ID/Bundle-Identifier, Name, Bundle, `webDir`, URL-Scheme und Origins, Navigation, Safe Areas prüfen.
4. Native Plattformprojekte hinzufügen/aktualisieren nur nach Versionsprüfung, dann Build/Sync. Keine Produktionsanwendung auf einen nur im WLAN erreichbaren `server.url` verweisen; Live-Reload-URL nur für Entwicklung.
5. Native Funktionen nur über benötigte, gepflegte Plugins (Dateisystem, Kamera, Benachrichtigung etc.), restriktive Berechtigungen.
6. Dateisystem und große Blobs nativ testen; Bridge-Daten JSON-serialisierbar halten, Datei-Pfade statt unnötiger Base64-Payloads.
7. App-Lifecycle: Pause/Resume, Netzwechsel, App-Kill, Neustart, Speicherbereinigung, Back-Button (Android), In-App-Navigation und Deep Links.
8. Plattformkonforme Icons, Screenshots, Signing, Datenschutztexte und Release-Builds nach SDK-Vorgaben.

## Verifizieren

Auf realen Geräten oder Simulatoren: Frischinstallation, Start ohne Backend, Flugmodus, Datenpersistenz, Camera/File-Picker (falls genutzt), Resume, Wechsel WiFi/Mobil, OS-Dark-Mode, App-Upgrade. Browser-Erfolg allein bestätigt keine native Kompatibilität. Bei fehlendem Xcode/Android-SDK „nicht getestet“ berichten.

## Anti-Patterns

- Entwicklungsserver als dauerhafte Runtime-Abhängigkeit.
- WebView als Tarnung für eine weiterhin serverpflichtige Anwendung.
- Harte Versionsbefehle ohne Prüfung der installierten Capacitor-Version.
- `localhost` mit realem Endgeräte-Backend gleichsetzen.
- App-Store-Fähigkeit oder Offline-Sicherheit aus erfolgreichem `npm run build` ableiten.
