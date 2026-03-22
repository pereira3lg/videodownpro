#!/usr/bin/env python3
"""
VideoDown Pro - Script de Inicialização
Instala dependências e inicia o servidor.
"""

import os
import sys
import subprocess
import socket


def get_local_ip():
    """Obtém o IP local do computador na rede."""
    try:
        # Cria um socket para determinar o IP local
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    print("\n" + "=" * 55)
    print("  🎬 VideoDown Pro - Baixador de Vídeos")
    print("=" * 55)

    # Verificar Python
    print("\n  📌 Verificando Python...")
    try:
        result = subprocess.run(
            [sys.executable, "--version"],
            capture_output=True,
            text=True
        )
        print(f"  ✅ {result.stdout.strip()}")
    except Exception:
        print("  ❌ Python não encontrado!")
        print("     Instale em: python.org/downloads")
        input("\n  Pressione Enter para sair...")
        sys.exit(1)

    # Instalar dependências
    print("\n  📦 Instalando dependências...")
    deps = ["flask", "flask-cors", "yt-dlp"]
    for dep in deps:
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet", dep],
                check=True
            )
            print(f"     ✅ {dep}")
        except subprocess.CalledProcessError:
            print(f"     ❌ Erro ao instalar {dep}")

    # Verificar yt-dlp
    print("\n  🔍 Verificando yt-dlp...")
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"  ✅ yt-dlp v{result.stdout.strip()}")
        else:
            print("  ⚠️  yt-dlp não encontrado no PATH")
    except FileNotFoundError:
        print("  ⚠️  yt-dlp não encontrado!")

    # Verificar FFmpeg
    print("\n  🔍 Verificando FFmpeg...")
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5
        )
        if result.returncode == 0:
            print("  ✅ FFmpeg encontrado")
        else:
            print("  ⚠️  FFmpeg pode não estar instalado corretamente")
    except FileNotFoundError:
        print("  ⚠️  FFmpeg não encontrado!")
        print("     Alguns recursos podem não funcionar.")
        print("     Baixe em: ffmpeg.org/download.html")
    except subprocess.TimeoutExpired:
        print("  ⚠️  Timeout ao verificar FFmpeg")

    # Criar pasta de downloads
    downloads = os.path.join(os.path.expanduser("~"), "Downloads", "VideoDown Pro")
    os.makedirs(downloads, exist_ok=True)

    local_ip = get_local_ip()
    
    print(f"\n  📁 Pasta de downloads: {downloads}")
    print("\n  🌐 Iniciando servidor...")

    print("\n" + "=" * 55)
    print("  📱 ACESSO NO COMPUTADOR (recomendado):")
    print(f"     http://{local_ip}:5000")
    print("     (ou http://127.0.0.1:5000)")
    print()
    print("  📱 ACESSO NO CELULAR (mesma Wi-Fi):")
    print(f"     http://{local_ip}:5000")
    print()
    print("  ℹ️  Para acessar do celular, escaneie o QR code")
    print("     ou digite o IP acima no navegador do celular")
    print()
    print("  ⏹️  Pressione Ctrl+C para parar")
    print("=" * 55 + "\n")

    # Importar e rodar servidor
    try:
        from server import app, DOWNLOADS_DIR
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n\n  👋 Servidor parado. Até mais!")
    except Exception as e:
        print(f"\n  ❌ Erro ao iniciar servidor: {e}")
        input("\n  Pressione Enter para sair...")


if __name__ == "__main__":
    main()
