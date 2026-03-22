@echo off
chcp 65001 >nul
title VideoDown Pro

echo.
echo ========================================
echo   VideoDown Pro - Baixador de Videos
echo ========================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo   ERRO: Python nao encontrado!
    echo   Instale Python em: python.org/downloads
    echo.
    pause
    exit /b 1
)

echo   Python encontrado
echo.

:: Criar ambiente virtual (opcional)
if not exist "venv" (
    echo   Criando ambiente virtual...
    python -m venv venv
    echo.
)

:: Ativar virtualenv
call venv\Scripts\activate.bat

:: Instalar dependências
echo   Instalando dependências...
pip install --quiet flask flask-cors yt-dlp
if errorlevel 1 (
    echo   ERRO ao instalar dependências!
    pause
    exit /b 1
)
echo.
echo   Dependências instaladas!

:: Verificar yt-dlp
yt-dlp --version >nul 2>&1
if errorlevel 1 (
    echo   AVISO: yt-dlp nao encontrado no PATH
)

:: Verificar FFmpeg
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo.
    echo   AVISO: FFmpeg nao encontrado!
    echo   Alguns recursos podem nao funcionar.
    echo   Baixe em: ffmpeg.org/download.html
)

echo.
echo   Iniciando servidor...
echo.
echo   Acesse: http://localhost:5000
echo   Pressione Ctrl+C para parar
echo ========================================
echo.

:: Iniciar servidor
python server.py

pause
