@echo off
rem Belegwerk lokal starten (Windows). Doppelklick genuegt.
setlocal
cd /d "%~dp0"
if not exist dist\index.html (
  echo Bitte zuerst node scripts/build.mjs ausfuehren oder das vollstaendige PWA-Paket entpacken.
  pause
  exit /b 1
)
set PORT=8765
set URL=http://localhost:%PORT%
set PY=

where py >nul 2>nul && set PY=py -3
if "%PY%"=="" where python >nul 2>nul && set PY=python

if "%PY%"=="" goto nopython

netstat -ano | findstr /R /C:"127.0.0.1:%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 goto alreadyrunning

echo Belegwerk laeuft unter: %URL%
echo Beenden mit Strg+C oder Fenster schliessen.
start "" cmd /c "timeout /t 1 /nobreak >nul & start %URL%"
%PY% -m http.server %PORT% --bind 127.0.0.1 --directory dist
goto end

:alreadyrunning
echo Port %PORT% ist bereits belegt - es wird nur der Browser geoeffnet.
start "" %URL%
goto end

:nopython
echo Python 3 wurde nicht gefunden.
echo Installation z. B. mit:  winget install Python.Python.3.12
echo Danach dieses Fenster schliessen und erneut starten.
pause
goto end

:end
endlocal
