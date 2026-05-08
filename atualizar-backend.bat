6@echo off
echo ========================================
echo   ATUALIZANDO BACKEND NO GITHUB
echo ========================================
echo.

cd /d "%~dp0"

echo Adicionando arquivos alterados...
git add server.js .env

echo.
echo Fazendo commit...
git commit -m "Fix: Atualizar CORS para aceitar Netlify"

echo.
echo Enviando para GitHub...
git push origin main

echo.
echo ========================================
echo   PRONTO!
echo ========================================
echo.
echo O Render vai fazer o deploy automaticamente.
echo Aguarde 2-3 minutos e teste o site novamente.
echo.
pause
