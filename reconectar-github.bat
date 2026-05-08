@echo off
cd /d "%~dp0"

echo ========================================
echo   RECONECTANDO AO GITHUB
echo ========================================
echo.

echo Removendo remote antigo...
git remote remove origin

echo.
echo Adicionando novo remote...
git remote add origin https://github.com/mkcursor6-sushi/Spiid-Rifa.git

echo.
echo Enviando commits...
git push -u origin main

echo.
echo ========================================
echo   PRONTO!
echo ========================================
echo.
echo Agora va no Render e tente fazer o deploy novamente.
echo.
pause
