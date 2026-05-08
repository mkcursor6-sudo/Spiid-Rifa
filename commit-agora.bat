@echo off
cd /d "%~dp0"

echo Adicionando server.js...
git add server.js

echo.
echo Commitando...
git commit -m "Fix: CORS para Netlify + health check atualizado"

echo.
echo Enviando...
git push origin main

echo.
echo PRONTO! Aguarde 2 minutos e teste o site.
pause
