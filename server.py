"""
VideoDown Pro – server.py
Backend Flask + yt-dlp para baixar vídeos de múltiplas plataformas.
Suporta: YouTube, TikTok, Instagram, Twitter, Facebook, Twitch, Reddit e +1000 sites.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path
import yt_dlp
import uuid
import threading
import time
import json
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"])

# ========================================
# CONFIGURAÇÕES
# ========================================
DOWNLOADS_DIR = Path.home() / "Downloads" / "VideoDown Pro"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Dicionário de tarefas em progresso { task_id: {...} }
tasks = {}


# ========================================
# HOOKS DE PROGRESSO DO YT-DLP
# ========================================

class ProgressHook:
    """Hook para monitorar progresso do download."""
    
    def __init__(self, task_id):
        self.task_id = task_id
        self.last_percent = 0
    
    def __call__(self, d):
        task = tasks.get(self.task_id)
        if not task:
            return
        
        status = d.get('status', '')
        
        if status == 'downloading':
            # Obter percentual
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            
            if total > 0:
                percent = (downloaded / total) * 100
            else:
                # Tentar obter de 'percent'
                percent = d.get('percent', 0)
            
            task['percent'] = min(100, percent)
            task['status'] = 'downloading'
            
            # Velocidade
            speed = d.get('speed')
            if speed:
                task['speed'] = format_speed(speed)
            else:
                task['speed'] = '--'
            
            # ETA
            eta = d.get('eta')
            if eta:
                task['eta'] = format_eta(eta)
            else:
                task['eta'] = '--'
            
            # Tamanho
            if total > 0:
                task['size'] = format_bytes(total)
            
            self.last_percent = task['percent']
            
        elif status == 'finished':
            task['status'] = 'processing'
            task['percent'] = 95
            task['filename'] = d.get('filename', '')
            
        elif status == 'error':
            task['status'] = 'error'
            task['error'] = d.get('error', 'Erro desconhecido')


def format_speed(bytes_per_sec):
    """Formata velocidade em formato legível."""
    if bytes_per_sec >= 1024 * 1024:
        return f"{bytes_per_sec / (1024 * 1024):.1f} MB/s"
    elif bytes_per_sec >= 1024:
        return f"{bytes_per_sec / 1024:.1f} KB/s"
    return f"{bytes_per_sec} B/s"


def format_eta(seconds):
    """Formata ETA em formato legível."""
    if seconds is None:
        return '--'
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        m = int(seconds // 60)
        s = int(seconds % 60)
        return f"{m}:{s:02d}"
    else:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        return f"{h}:{m:02d}"


def format_bytes(size):
    """Formata tamanho em bytes."""
    if not size:
        return '--'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# ========================================
# ROTAS DA API
# ========================================

# Servir o index.html na raiz
@app.route('/index')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# Error handler para retornar JSON em vez de HTML
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Rota não encontrada'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Erro interno do servidor'}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({'error': f'Erro: {str(e)}'}), 500


@app.route('/info', methods=['POST'])
def get_info():
    """Obtém informações sobre o vídeo (título, thumbnail, formatos)."""
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL não fornecida'}), 400

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            return jsonify({'error': 'Não foi possível obter informações do vídeo'}), 400

        # Filtrar formatos disponíveis
        formats = []
        for f in (info.get('formats') or []):
            if f.get('vcodec') and f['vcodec'] != 'none':
                formats.append({
                    'format_id': f.get('format_id'),
                    'ext': f.get('ext', 'mp4'),
                    'height': f.get('height'),
                    'fps': f.get('fps'),
                    'vcodec': f.get('vcodec'),
                    'acodec': f.get('acodec'),
                    'filesize': f.get('filesize'),
                    'filesize_approx': f.get('filesize_approx'),
                    'tbr': f.get('tbr'),
                    'vbr': f.get('vbr'),
                })

        response = {
            'title': info.get('title', 'Sem título'),
            'description': (info.get('description') or '')[:300],
            'thumbnail': info.get('thumbnail') or (
                info.get('thumbnails', [{}])[-1].get('url') if info.get('thumbnails') else None
            ),
            'duration': info.get('duration'),
            'view_count': info.get('view_count'),
            'uploader': info.get('uploader') or info.get('channel') or info.get('creator'),
            'upload_date': info.get('upload_date'),
            'extractor': info.get('extractor', ''),
            'webpage_url': info.get('webpage_url', url),
            'formats': formats,
        }

        return jsonify(response)

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        
        # Mensagens amigáveis
        if 'Unsupported URL' in error_msg:
            error_msg = 'URL não suportada. Verifique o link.'
        elif 'Private video' in error_msg:
            error_msg = 'Este vídeo é privado.'
        elif 'Video unavailable' in error_msg:
            error_msg = 'Vídeo indisponível ou foi removido.'
        elif 'login' in error_msg.lower() or 'sign in' in error_msg.lower():
            error_msg = 'Este vídeo requer login.'
        
        return jsonify({'error': error_msg}), 400
        
    except Exception as e:
        return jsonify({'error': f'Erro: {str(e)}'}), 500


@app.route('/download', methods=['POST'])
def start_download():
    """Inicia o download do vídeo em background."""
    data = request.get_json()
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL não fornecida'}), 400

    task_id = str(uuid.uuid4())

    tasks[task_id] = {
        'status': 'starting',
        'percent': 0,
        'speed': '--',
        'eta': '--',
        'size': '--',
        'filename': None,
        'filepath': None,
        'error': None,
    }

    # Construir opções do yt-dlp
    ydl_opts = build_ytdlp_options(data, task_id)

    # Executar em thread separada
    thread = threading.Thread(
        target=download_worker,
        args=(task_id, url, ydl_opts),
        daemon=True
    )
    thread.start()

    return jsonify({'task_id': task_id, 'status': 'started'})


def build_ytdlp_options(data: dict, task_id: str) -> dict:
    """Constrói opções para yt-dlp."""
    audio_only = data.get('audio_only', False)
    format_id = data.get('format_id', 'best')
    audio_format = data.get('audio_format', 'mp3')
    audio_quality = data.get('audio_quality', '320k')
    include_subs = data.get('subtitles', False)
    include_meta = data.get('metadata', True)
    include_thumb = data.get('thumbnail', False)

    opts = {
        'outtmpl': str(DOWNLOADS_DIR / '%(title)s.%(ext)s'),
        'progress_hooks': [ProgressHook(task_id)],
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'prefer_ffmpeg': True,
    }

    if audio_only:
        # Baixar apenas áudio
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': audio_format,
            'preferredquality': audio_quality.replace('k', ''),
        }]
    else:
        # Formato de vídeo
        if format_id and format_id not in ('best', 'auto'):
            opts['format'] = f'{format_id}+bestaudio[ext=m4a]/{format_id}+bestaudio/best'
        else:
            opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
        
        opts['merge_output_format'] = 'mp4'

    # Legendas
    if include_subs:
        opts['writesubtitles'] = True
        opts['subtitleslangs'] = ['pt', 'en']
        opts['convert subtitles'] = 'srt'

    # Metadados
    if include_meta:
        opts['embedmetadata'] = True
        opts['addmetadata'] = True

    # Thumbnail
    if include_thumb:
        opts['writethumbnail'] = True
        opts['postprocessors'].append({
            'key': 'FFmpegThumbnailsConvertor',
            'format': 'jpg',
        })

    return opts


def download_worker(task_id: str, url: str, ydl_opts: dict):
    """Worker em thread para executar o download."""
    task = tasks.get(task_id)
    if not task:
        return

    task['status'] = 'downloading'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Baixar o vídeo
            info = ydl.extract_info(url, download=True)
            
            # Obter filename final
            if info:
                filename = ydl.prepare_filename(info)
                task['filename'] = os.path.basename(filename)
                task['filepath'] = str(DOWNLOADS_DIR / task['filename'])
                
                # Verificar tamanho do arquivo
                filepath = Path(task['filepath'])
                if filepath.exists():
                    task['filesize'] = filepath.stat().st_size
                    task['size'] = format_bytes(task['filesize'])

        task['status'] = 'done'
        task['percent'] = 100

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        
        # Mensagens amigáveis
        if 'Private video' in error_msg:
            error_msg = 'Vídeo privado - não é possível baixar'
        elif 'login' in error_msg.lower() or 'sign in' in error_msg.lower():
            error_msg = 'Requer login para acessar este vídeo'
        elif 'HTTP Error 429' in error_msg:
            error_msg = 'Rate limit atingido. Aguarde um momento.'
        elif 'not available' in error_msg.lower():
            error_msg = 'Conteúdo não disponível na sua região ou foi removido'
        
        task['status'] = 'error'
        task['error'] = error_msg
        
    except Exception as e:
        task['status'] = 'error'
        task['error'] = str(e)


@app.route('/progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    """Retorna o progresso atual de uma tarefa."""
    task = tasks.get(task_id)
    if not task:
        return jsonify({'status': 'error', 'error': 'Tarefa não encontrada'}), 404
    return jsonify(task)


@app.route('/open-folder', methods=['GET', 'POST'])
def open_folder():
    """Abre a pasta de downloads no explorador de arquivos."""
    try:
        if os.name == 'nt':  # Windows
            os.startfile(str(DOWNLOADS_DIR))
        elif os.name == 'posix':
            import subprocess
            if sys.platform == 'darwin':
                subprocess.Popen(['open', str(DOWNLOADS_DIR)])
            else:
                subprocess.Popen(['xdg-open', str(DOWNLOADS_DIR)])
        return jsonify({'status': 'ok', 'path': str(DOWNLOADS_DIR)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/check', methods=['GET'])
def check_dependencies():
    """Verifica se as dependências estão instaladas."""
    try:
        ytdlp_version = yt_dlp.version.__version__
        ytdlp_ok = True
    except Exception:
        ytdlp_version = None
        ytdlp_ok = False

    ffmpeg_ok = False
    try:
        import subprocess
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        ffmpeg_ok = result.returncode == 0
    except Exception:
        pass

    return jsonify({
        'ytdlp': ytdlp_ok,
        'ytdlp_version': ytdlp_version,
        'ffmpeg': ffmpeg_ok,
        'downloads_dir': str(DOWNLOADS_DIR),
        'status': 'ok' if ytdlp_ok else 'missing_dependencies'
    })


# Rota principal - serve o index.html
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Rota da API (alternativa para /)
@app.route('/api', methods=['GET'])
def api_info():
    return jsonify({
        'name': 'VideoDown Pro API',
        'version': '1.0.0',
        'status': 'running',
        'downloads_dir': str(DOWNLOADS_DIR)
    })


# ========================================
# MAIN
# ========================================
if __name__ == '__main__':
    print("=" * 55)
    print("  🎬 VideoDown Pro – Servidor Backend")
    print("=" * 55)
    print(f"  📁 Pasta de downloads: {DOWNLOADS_DIR}")
    print()

    # Verificar yt-dlp
    try:
        v = yt_dlp.version.__version__
        print(f"  ✅ yt-dlp v{v} instalado")
    except Exception:
        print("  ❌ yt-dlp NÃO instalado!")
        print("     Execute: pip install yt-dlp")

    # Verificar FFmpeg
    try:
        import subprocess
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        if result.returncode == 0:
            print("  ✅ FFmpeg encontrado")
        else:
            print("  ⚠️  FFmpeg não encontrado (alguns recursos podem não funcionar)")
    except FileNotFoundError:
        print("  ⚠️  FFmpeg não encontrado (alguns recursos podem não funcionar)")
    except Exception:
        print("  ⚠️  FFmpeg não encontrado")

    print()
    print("  🌐 API rodando em: http://localhost:5000")
    print("  🖥️  Abra o index.html no navegador para usar")
    print("=" * 55)

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,
        threaded=True
    )
