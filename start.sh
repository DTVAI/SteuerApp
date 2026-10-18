#!/bin/bash
# Belegwerk lokal starten (Linux).
cd "$(dirname "$0")" || exit 1
if [ ! -f dist/index.html ]; then
  echo "Bitte zuerst node scripts/build.mjs ausführen oder das vollständige PWA-Paket entpacken."
  exit 1
fi
PORT=8765
URL="http://localhost:${PORT}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 wurde nicht gefunden (z. B. sudo apt install python3)."
  exit 1
fi

if python3 -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1', ${PORT}))==0 else 1)"; then
  echo "Port ${PORT} ist bereits belegt - oeffne nur den Browser."
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" >/dev/null 2>&1
  exit 0
fi

echo "Belegwerk laeuft unter: ${URL}"
echo "Beenden mit Strg+C."
( sleep 1; command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" >/dev/null 2>&1 ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist
