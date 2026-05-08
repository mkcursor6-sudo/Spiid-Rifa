@echo off
cd /d "%~dp0"

echo ========================================
echo   VERIFICANDO STATUS DO GITHUB
echo ========================================
echo.

echo Verificando remote...
git remote -v

echo.
echo Verificando branch...
git branch -a

echo.
echo Ultimos commits...
git log --oneline -5

echo.
echo Status atual...
git status

echo.
pause
