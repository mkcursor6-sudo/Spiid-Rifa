@echo off
echo ========================================
echo   ENVIANDO CORRECAO DO CORS
echo ========================================
echo.

cd /d "%~dp0"

echo Verificando arquivos modificados...
git status

echo.
echo Adicionando server.js...
git add server.js

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
echo Aguarde 2-3 minutos para o Render fazer o deploy.
echo.
pause
