#!/bin/bash
# Belegwerk lokal starten (macOS). Doppelklick genuegt.
cd "$(dirname "$0")" || exit 1
if [ ! -f dist/index.html ]; then
  echo "Bitte zuerst node scripts/build.mjs ausführen oder das vollständige PWA-Paket entpacken."
  exit 1
fi
PORT=8765
URL="http://localhost:${PORT}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 wurde nicht gefunden."
  echo "Installation z. B. mit:  brew install python   (oder python.org)"
  read -r -p "Enter zum Schliessen..." _
  exit 1
fi

if python3 -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1', ${PORT}))==0 else 1)"; then
  echo "Port ${PORT} ist bereits belegt - oeffne nur den Browser."
  open "$URL"
  exit 0
fi

echo "Belegwerk laeuft unter: ${URL}"
echo "Beenden mit Strg+C (oder Fenster schliessen)."
( sleep 1; open "$URL" ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist
