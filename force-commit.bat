@echo off
echo ========================================
echo   FORCANDO COMMIT DO SERVER.JS
echo ========================================
echo.

cd /d "%~dp0"

echo Adicionando server.js com forca...
git add -f server.js

echo.
echo Status do Git:
git status

echo.
echo Fazendo commit...
git commit -m "Fix: Permitir qualquer dominio .netlify.app no CORS"

echo.
echo Enviando para GitHub...
git push origin main

echo.
echo ========================================
echo   PRONTO!
echo ========================================
echo.
pause
