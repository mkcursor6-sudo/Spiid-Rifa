@echo off
echo ========================================
echo  SPIID RIFA - Instalacao de Dependencias
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
    echo Ou leia o arquivo INSTALAR_NODEJS.md
    echo.
    pause
    exit /b 1
)

echo Node.js encontrado!
node --version
echo.

echo Instalando dependencias...
echo.
npm install

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo  Instalacao concluida com sucesso!
    echo ========================================
    echo.
    echo Para iniciar o servidor, execute:
    echo   npm start
    echo.
    echo Ou clique duas vezes em: iniciar-servidor.bat
    echo.
) else (
    echo.
    echo [ERRO] Falha na instalacao das dependencias.
    echo Verifique sua conexao com a internet.
    echo.
)

pause
