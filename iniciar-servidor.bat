@echo off
echo ========================================
echo  SPIID RIFA - Servidor Backend
echo ========================================
echo.

echo Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao esta instalado!
    echo.
    echo Por favor, instale o Node.js primeiro:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Verificando dependencias...
if not exist "node_modules\" (
    echo [AVISO] Dependencias nao instaladas!
    echo.
    echo Instalando dependencias...
    call npm install
    echo.
)

echo Iniciando servidor...
echo.
echo Servidor rodando em: http://localhost:3000
echo.
echo Pressione Ctrl+C para parar o servidor
echo ========================================
echo.

npm start
