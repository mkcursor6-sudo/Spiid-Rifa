@echo off
cd /d "%~dp0"

echo ========================================
echo   CONECTANDO AO GITHUB CORRETO
echo ========================================
echo.

echo Removendo remote antigo...
git remote remove origin

echo.
echo Adicionando remote correto (mkcursor6-sudo)...
git remote add origin https://github.com/mkcursor6-sudo/Spiid-Rifa.git

echo.
echo Enviando commits...
git push -u origin main

echo.
echo ========================================
echo   PRONTO!
echo ========================================
echo.
pause
