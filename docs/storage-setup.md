# Automatische Ablage einrichten

Belegwerk speichert Originale und Verarbeitungsaufträge zuerst lokal in IndexedDB. Erst nachdem du ein Ablageziel ausgewählt und die Ablage aktiviert hast, dürfen die vorgesehenen Belege dorthin übertragen werden. Ein Browser-Cache oder ein erfolgreicher lokaler Import bestätigt keinen Cloud-Upload. Der Belegstatus zeigt die bestätigte Ablage gesondert an.

## Dropbox

Die App verwendet die offizielle Dropbox-API mit OAuth Authorization Code + PKCE (S256). Dafür benötigst du einmalig eine eigene Dropbox-App. Ein App-Secret oder ein eigener Anmeldeserver ist nicht erforderlich.

1. Öffne die [Dropbox App Console](https://www.dropbox.com/developers/apps) und erstelle eine App mit **Scoped access** und **App folder**. Dadurch begrenzt Dropbox den Zugriff auf den eigenen App-Ordner.
2. Aktiviere unter **Permissions** ausschließlich `files.content.write` und bestätige die Änderung. Die App liest keine fremden Dropbox-Dateien ein.
3. Hinterlege unter **OAuth 2 → Redirect URIs** die genaue Adresse deiner geöffneten App, zum Beispiel `https://belege.example.de/index.html`. Auch `https://belege.example.de/` ist möglich, wenn die App unter dieser Adresse geöffnet wird. Pfad, abschließender Schrägstrich und Port müssen exakt übereinstimmen. Die App verwendet `location.origin + location.pathname`, ohne Query und Fragment.
4. Für die lokale Entwicklung ist beispielsweise `http://localhost:8765/` erlaubt; verwende dann beim Öffnen dieselbe Adresse. Produktiv wird HTTPS benötigt. `file://` funktioniert für OAuth und PWA nicht.
5. Trage den öffentlichen **App key** in Belegwerk ein und verbinde Dropbox. Ein App-Secret gehört niemals in diese Web-App.
6. Bestätige die Dropbox-Freigabe. Der Browser kehrt zur App zurück. Die App prüft den zufälligen OAuth-State, tauscht den einmaligen Code mit dem PKCE-Verifier aus und entfernt die Anmeldeparameter aus der URL.

Der Standardpfad lautet innerhalb des freigegebenen Dropbox-App-Ordners:

```text
Belegwerk/<Jahr>/<Kategorie>/<Datum>_<Belegart>_<Aussteller>_<Betrag>__<Hash>.pdf
```

Die App überträgt die unveränderte Originaldatei mit einem aus den erkannten Angaben gebildeten Namen. Ein 96-Bit-Suffix aus dem SHA-256-Inhaltshash unterscheidet gleich benannte Dokumente. Der Zielpfad wird vor dem ersten Upload gespeichert. Wiederholungen nach einem Abbruch verwenden denselben Pfad mit `overwrite` und `autorename: false`; dadurch erzeugt ein wiederholter Auftrag keine fortlaufenden Kopien. Nachträgliche Änderungen an den erkannten Angaben verschieben bereits vorgemerkte Dateien nicht automatisch. Die Ablage ist eine Kopie des Originals; Änderungen und Löschungen in Belegwerk werden nicht automatisch auf Dropbox übertragen.

Ein einzelner Dropbox-Upload ist auf **150 MB** begrenzt. Größere Dateien bleiben lokal erhalten und brauchen einen anderen Ablageweg, etwa einen gewählten Ordner oder Export. Eine Dropbox-Bestätigung wird erst nach einer erfolgreichen API-Antwort mit Datei-ID und Pfad angenommen. Bei abgelaufener Sitzung oder fehlender Berechtigung wartet die App auf erneutes Verbinden; sie meldet keinen erfolgreichen Upload.

### Sitzungsdauer und Datenschutz

Belegwerk fordert **kurzlebige Access-Tokens** an und speichert keine Refresh-Tokens. Die Sitzung gilt höchstens vier Stunden; danach musst du Dropbox erneut verbinden. Die App kann diese Verbindung ohne erneute Freigabe nicht dauerhaft erneuern.

Damit ein Service Worker während einer gültigen Sitzung hochladen kann, liegt das Access-Token mit Ablaufzeit in **IndexedDB derselben App-Origin**. Es liegt nicht in localStorage, Dokumenten, UI-Statusobjekten oder Logs. OAuth-State und Verifier liegen bis zur einmaligen Verwendung oder zum Ablauf nach zehn Minuten ebenfalls in IndexedDB. Fehlgeschlagene oder abgelaufene Anmeldungen löschen diese Anmeldedaten. „Dropbox trennen“ löscht die lokale Sitzung und versucht zusätzlich die serverseitige Token-Widerrufung; offline gelingt die lokale Trennung sofort, das frühere Token läuft auf Dropbox spätestens regulär ab.

Dies ist ein bewusster Kompromiss für begrenzte Hintergrundarbeit in einer PWA: IndexedDB ist für JavaScript derselben Origin lesbar und nicht automatisch Ende-zu-Ende-verschlüsselt. Ein kompromittiertes App-Skript, ein entsperrtes Gerät oder Zugriff auf das Browserprofil kann deshalb lokal gespeicherte Dokumente und ein noch gültiges Token offenlegen. Verwende eine eigene vertrauenswürdige HTTPS-Origin, halte die App frei von fremden Skripten und sichere das Gerät. Lösche bei Geräteweitergabe die lokalen App-Daten und widerrufe die App zusätzlich in Dropbox. Das Trennen entfernt keine bereits übertragenen Dropbox-Dateien.

Eine wirklich dauerhafte Übertragung bei geschlossener App erfordert gegebenenfalls einen eigenen vertrauenswürdigen Server mit geschützter Token-Verwaltung oder eine native Integration. Die Browser-App speichert deshalb weder ein App-Secret noch ein langfristiges Refresh-Token als vermeintliche Abkürzung.

## Gewählter Ordner / weiterer Speicher

Auf Browsern mit **File System Access API** kannst du über den Systemdialog einen Ordner wählen. Chromium-Browser unterstützen dies üblicherweise auf Desktop-Geräten; Safari, Firefox und mobile Browser bieten den Ordnerdialog häufig nicht an. Dann stehen Dropbox und manueller Export zur Verfügung.

Der gewählte Ordner kann lokal oder in einem vom Betriebssystem eingebundenen Speicher liegen, etwa Dropbox, OneDrive oder einem Netzlaufwerk. Belegwerk schreibt nur in diesen freigegebenen Ordner. Die eigentliche Cloud-Synchronisierung übernimmt dann der installierte Speicheranbieter; ein erfolgreicher Schreibvorgang bestätigt die lokale Datei, nicht den Upload dieses Anbieters.

Die App legt Jahr- und Kategorie-Unterordner an und schreibt Originale mit derselben stabilen Benennung wie bei Dropbox. Das Ordner-Handle wird in IndexedDB gespeichert. Belegwerk fragt Schreibrechte nur nach einer Nutzeraktion ab. Nach einem Browser-Neustart, einer verweigerten Freigabe oder im Service Worker können die Rechte fehlen. Dann bleibt der Auftrag bestehen, bis du die App öffnest und den Zugriff erneut erlaubst oder den Ordner neu auswählst. Die App zeigt im Hintergrund keinen Berechtigungsdialog an.

## Hintergrundarbeit und Wiederaufnahme

Ein PWA-Service-Worker darf nicht unbegrenzt weiterlaufen. Background Sync wird je nach Browser unterstützt und vom Betriebssystem geplant. Auf iOS/Safari ist nach dem Schließen keine verlässliche Verarbeitung oder Übertragung zugesichert; auch auf anderen Plattformen kann das Betriebssystem die App anhalten. Texterkennung kann zudem eine geöffnete App benötigen, während ein bereits verarbeiteter Beleg mit gültiger Dropbox-Sitzung durch einen Service Worker hochgeladen werden kann.

Die dauerhafte lokale Warteschlange ist deshalb entscheidend: Die App setzt offene Arbeiten beim nächsten Öffnen, beim erneuten Sichtbarwerden oder bei wiederhergestellter Verbindung fort. Schließe die App erst, wenn sie die Originaldatei als **lokal gespeichert** bestätigt. Solange kein erfolgreicher Ablagestatus vorliegt, ist die Datei noch nicht als extern gesichert zu betrachten. Das Löschen des Browserprofils oder das Löschen lokaler App-Daten kann noch nicht übertragene Belege und Aufträge entfernen.

## Technische Nachweise

```sh
node --test tests/cloud.test.mjs
```

Der Test verwendet ein installiertes Chromium (`/usr/bin/chromium`, abweichend über `CHROMIUM` konfigurierbar), echte IndexedDB und einen echten Datei-Handle aus dem Origin Private File System. Dropbox-Antworten werden kontrolliert simuliert; der Test überträgt keine Belege zu Dropbox. Er prüft PKCE/State, Token-Lebensdauer und Wiederladen, idempotente Upload-Pfade, Unicode-Header, Originaldatei-Inhalt, Fehler-/Ablaufbehandlung und echte lokale Dateischreibvorgänge. Eine manuelle Anmeldung und ein Upload mit deinem Dropbox-Konto bleiben zur Prüfung der konkreten App-Konfiguration erforderlich.
