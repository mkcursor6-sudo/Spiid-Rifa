@echo off
cd /d "%~dp0"

echo ========================================
echo   ENVIANDO COMMITS PARA GITHUB
echo ========================================
echo.

echo Fazendo push...
git push -u origin main --verbose

echo.
echo ========================================
echo   RESULTADO
echo ========================================
echo.
pause
