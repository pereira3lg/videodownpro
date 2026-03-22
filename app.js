/* ===================================================
   VideoDown Pro – app.js
   Frontend JavaScript para o baixador de vídeos
   =================================================== */

// Log de diagnóstico
console.log('VideoDown Pro - Carregando script...');

// URL da API - Detecção automática de ambiente
const API_URL = getApiUrl();

console.log('API URL:', API_URL);

function getApiUrl() {
    // Verificar se há URL salva pelo usuário
    const savedUrl = localStorage.getItem('vdp_api_url');
    if (savedUrl && savedUrl.trim() !== '') {
        return savedUrl.trim();
    }
    
    // Detectar ambiente: localhost ou produção
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '0.0.0.0';
    
    if (isLocalhost) {
        // Ambiente de desenvolvimento local
        return 'http://localhost:3000';
    } else {
        // Ambiente de produção (Netlify) - backend no Render
        return 'https://videodown-2.onrender.com';
    }
}

// Estado da aplicação
let state = {
    videoInfo: null,
    selectedQuality: null,
    selectedAudio: { format: 'mp3', quality: '320k' },
    activeTab: 'video',
    downloadHistory: JSON.parse(localStorage.getItem('vdp_history') || '[]'),
    stats: JSON.parse(localStorage.getItem('vdp_stats') || '{"downloads":0,"totalBytes":0}'),
};

// Verificar conexão ao carregar
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM carregado, inicializando...');
    await checkServerConnection();
    updateStats();
    renderHistory();
    setupInputListeners();
    
    // Detectar plataforma ao digitar URL
    const urlInputEl = document.getElementById('urlInput');
    if (urlInputEl) {
        urlInputEl.addEventListener('input', detectPlatformFromURL);
    }
    console.log('Inicialização concluída');
});

// Verificar se o servidor está rodando
async function checkServerConnection() {
    try {
        const response = await fetch(`${API_URL}/`);
        
        // Verificar se a resposta é JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Servidor não retornou JSON');
        }
        
        const data = await response.json();
        console.log('Servidor conectado:', data);
    } catch (error) {
        console.error('Erro ao conectar no servidor:', error);
        showToast('Erro: Servidor não conectado. Clique no ícone de engrenagem para configurar o IP.', 'error', 'fas fa-exclamation-triangle');
    }
}

function setupInputListeners() {
    const input = document.getElementById('urlInput');

    // Enter para analisar
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') analyzeVideo();
    });

    // Botão colar
    document.getElementById('pasteBtn').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            input.value = text;
            detectPlatformFromURL();
            showToast('Link colado!', 'info', 'fas fa-clipboard');
        } catch {
            showToast('Não foi possível acessar a área de transferência', 'warning', 'fas fa-exclamation');
        }
    });

    // Botão analisar - removido冗余, agora usa onclick no HTML
    // O botão já tem onclick="analyzeVideo()" no HTML
}

// ===== DETECTAR PLATAFORMA =====

// Fetch com tratamento de erro melhorado
async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    
    // Verificar se a resposta é JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            throw new Error('Servidor retornou HTML. Verifique a URL da API nas configurações.');
        }
        throw new Error(text || 'Resposta inválida do servidor');
    }
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
        throw new Error(data.error || `Erro ${response.status}`);
    }
    
    return data;
}

// Função mantida para compatibilidade (não usada em produção)
function showRemoteAccessHelp() {
    const help = `VideoDown Pro\n\nPara usar o app, certifique-se de que:\n1. O servidor backend está rodando\n2. A URL da API está correta nas configurações\n\nEm produção, o backend está hospedado no Render.`;
    alert(help);
}

function detectPlatformFromURL() {
    const url = document.getElementById('urlInput').value.toLowerCase();
    const btn = document.getElementById('analyzeBtn');

    if (!url) return;

    const platforms = {
        'youtube.com': { name: 'YouTube', color: '#ff0000', icon: 'fab fa-youtube' },
        'youtu.be': { name: 'YouTube', color: '#ff0000', icon: 'fab fa-youtube' },
        'tiktok.com': { name: 'TikTok', color: '#fff', icon: 'fab fa-tiktok' },
        'instagram.com': { name: 'Instagram', color: '#e1306c', icon: 'fab fa-instagram' },
        'twitter.com': { name: 'Twitter/X', color: '#1da1f2', icon: 'fab fa-twitter' },
        'x.com': { name: 'Twitter/X', color: '#1da1f2', icon: 'fab fa-twitter' },
        'facebook.com': { name: 'Facebook', color: '#1877f2', icon: 'fab fa-facebook' },
        'fb.watch': { name: 'Facebook', color: '#1877f2', icon: 'fab fa-facebook' },
        'twitch.tv': { name: 'Twitch', color: '#9146ff', icon: 'fab fa-twitch' },
        'reddit.com': { name: 'Reddit', color: '#ff4500', icon: 'fab fa-reddit' },
        'vimeo.com': { name: 'Vimeo', color: '#1ab7ea', icon: 'fab fa-vimeo' },
        'dailymotion.com': { name: 'Dailymotion', color: '#00aaff', icon: 'fas fa-play' },
    };

    for (const [domain, info] of Object.entries(platforms)) {
        if (url.includes(domain)) {
            btn.innerHTML = `<i class="${info.icon}"></i> Analisar ${info.name} <div class="btn-shine"></div>`;
            return;
        }
    }

    btn.innerHTML = `<i class="fas fa-search"></i> Analisar Vídeo <div class="btn-shine"></div>`;
}

// ===== ANALISAR VÍDEO =====
async function analyzeVideo() {
    console.log('Função analyzeVideo chamada!');
    const urlInput = document.getElementById('urlInput');
    const url = urlInput ? urlInput.value.trim() : '';
    console.log('URL digitada:', url);

    if (!url) {
        showToast('Cole um link de vídeo primeiro!', 'warning', 'fas fa-link');
        document.getElementById('urlInput').focus();
        return;
    }

    if (!isValidURL(url)) {
        showToast('URL inválida. Verifique o link.', 'error', 'fas fa-times');
        return;
    }

    // Mostrar loading
    hideAllSections();
    show('loadingSection');

    try {
        const data = await fetchJson(`${API_URL}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        state.videoInfo = data;
        displayVideoInfo(data);

    } catch (error) {
        hide('loadingSection');
        console.error('Erro:', error);
        
        // Verificar se é erro de conexão
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showError('Servidor não está respondendo. Verifique a conexão com a API.');
        } else {
            showError(error.message);
        }
    }
}

// ===== EXIBIR INFORMAÇÕES DO VÍDEO =====
function displayVideoInfo(info) {
    hide('loadingSection');

    // Thumbnail
    const thumb = document.getElementById('thumbnailImg');
    if (info.thumbnail) {
        thumb.src = info.thumbnail;
        thumb.onerror = () => { thumb.src = 'https://via.placeholder.com/320x180/1a1a3e/6c63ff?text=Video'; };
    } else {
        thumb.src = 'https://via.placeholder.com/320x180/1a1a3e/6c63ff?text=Video';
    }

    // Info
    document.getElementById('videoTitle').textContent = info.title || 'Sem título';
    document.getElementById('videoDuration').innerHTML = `<i class="far fa-clock"></i> ${formatDuration(info.duration)}`;
    document.getElementById('videoUploader').innerHTML = `<i class="fas fa-user"></i> ${info.uploader || 'Desconhecido'}`;
    document.getElementById('videoViews').innerHTML = `<i class="fas fa-eye"></i> ${formatViews(info.view_count)}`;
    document.getElementById('videoDescription').textContent = info.description || '';

    // Badge da plataforma
    const platformName = getPlatformName(info.extractor || '');
    document.getElementById('platformBadge').textContent = platformName;

    // Formatos de qualidade
    buildQualityGrid(info.formats || []);

    // Mostrar sections
    show('videoPreview');
    show('downloadOptions');
}

// ===== CONSTRUIR GRADE DE QUALIDADES =====
function buildQualityGrid(formats) {
    const grid = document.getElementById('qualityGrid');
    grid.innerHTML = '';

    // Filtrar formatos de vídeo
    const videoFormats = formats.filter(f =>
        f.vcodec && f.vcodec !== 'none' &&
        f.height && f.height > 0
    );

    // Agrupar por resolução
    const seen = new Set();
    const unique = [];

    // Ordenar por qualidade (maior primeiro)
    videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const f of videoFormats) {
        const key = `${f.height}p`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(f);
        }
    }

    // Se não tiver formatos específicos, adicionar opções padrão
    if (unique.length === 0) {
        const defaults = [
            { format_id: 'best', height: 1080, ext: 'mp4', label: '1080p', badge: 'best' },
            { format_id: 'bestvideo[height<=720]+bestaudio', height: 720, ext: 'mp4', label: '720p', badge: 'hd' },
            { format_id: 'bestvideo[height<=480]+bestaudio', height: 480, ext: 'mp4', label: '480p', badge: 'sd' },
            { format_id: 'bestvideo[height<=360]+bestaudio', height: 360, ext: 'mp4', label: '360p', badge: 'sd' },
            { format_id: 'worst', height: 144, ext: 'mp4', label: '144p', badge: null },
        ];
        defaults.forEach(d => addQualityCard(grid, d));
    } else {
        unique.slice(0, 8).forEach((f, i) => {
            let badge = null;
            if (i === 0) badge = 'best';
            else if (f.height >= 720) badge = 'hd';
            else badge = 'sd';
            addQualityCard(grid, { ...f, badge });
        });
    }

    // Adicionar opção "Melhor qualidade"
    const bestCard = document.createElement('div');
    bestCard.className = 'quality-card';
    bestCard.dataset.formatId = 'best';
    bestCard.dataset.height = '9999';
    bestCard.innerHTML = `
        <span class="quality-badge best">AUTO</span>
        <span class="quality-res">✨</span>
        <span class="quality-ext">Melhor</span>
        <span class="quality-size">Auto</span>
    `;
    bestCard.onclick = () => selectQuality(bestCard);
    grid.insertBefore(bestCard, grid.firstChild);

    // Selecionar automaticamente a melhor
    selectQuality(bestCard);
}

function addQualityCard(grid, format) {
    const card = document.createElement('div');
    card.className = 'quality-card';
    card.dataset.formatId = format.format_id || 'best';
    card.dataset.height = format.height || 0;

    const size = format.filesize
        ? formatBytes(format.filesize)
        : (format.filesize_approx ? formatBytes(format.filesize_approx) : '~');

    card.innerHTML = `
        ${format.badge ? `<span class="quality-badge ${format.badge}">${format.badge === 'best' ? 'Melhor' : format.badge.toUpperCase()}</span>` : ''}
        <span class="quality-res">${format.height || format.label}p</span>
        <span class="quality-ext">${(format.ext || 'mp4').toUpperCase()}</span>
        <span class="quality-size">${size}</span>
    `;
    card.onclick = () => selectQuality(card);
    grid.appendChild(card);
}

// ===== SELECIONAR QUALIDADE =====
function selectQuality(card) {
    document.querySelectorAll('.quality-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.selectedQuality = {
        formatId: card.dataset.formatId,
        height: parseInt(card.dataset.height)
    };
}

// ===== SELECIONAR ÁUDIO =====
function selectAudio(el) {
    document.querySelectorAll('.audio-option').forEach(a => a.classList.remove('selected'));
    el.classList.add('selected');
    state.selectedAudio = {
        format: el.dataset.format,
        quality: el.dataset.quality
    };
}

// ===== TROCAR TAB =====
function switchTab(tab) {
    state.activeTab = tab;

    document.getElementById('tabVideo').classList.toggle('active', tab === 'video');
    document.getElementById('tabAudio').classList.toggle('active', tab === 'audio');

    document.getElementById('tabContentVideo').style.display = tab === 'video' ? '' : 'none';
    document.getElementById('tabContentAudio').style.display = tab === 'audio' ? '' : 'none';
}

// ===== INICIAR DOWNLOAD =====
async function startDownload() {
    if (!state.videoInfo) return;

    const url = document.getElementById('urlInput').value.trim();
    const isAudio = state.activeTab === 'audio';

    const options = {
        url,
        format_id: isAudio ? null : (state.selectedQuality?.formatId || 'best'),
        audio_only: isAudio,
        audio_format: isAudio ? state.selectedAudio.format : null,
        audio_quality: isAudio ? state.selectedAudio.quality : null,
        subtitles: document.getElementById('subtitlesCheck').checked,
        metadata: document.getElementById('metadataCheck').checked,
        thumbnail: document.getElementById('thumbnailCheck').checked,
    };

    hideAllSections();
    show('videoPreview');
    show('progressSection');

    // Reset progress
    updateProgress(0, 'Iniciando...', '--', '--');

    try {
        // Iniciar download no backend
        const data = await fetchJson(`${API_URL}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        const taskId = data.task_id;

        // Polling de progresso
        await pollProgress(taskId);

    } catch (error) {
        hide('progressSection');
        
        // Verificar se é erro de conexão ou resposta HTML
        let errorMsg = error.message;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('JSON')) {
            errorMsg = 'Servidor não está respondendo corretamente. Verifique se o backend está rodando.';
        }
        showError(errorMsg);
    }
}

// ===== POLLING DE PROGRESSO =====
async function pollProgress(taskId) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const data = await fetchJson(`${API_URL}/progress/${taskId}`);

                if (data.status === 'downloading') {
                    updateProgress(
                        data.percent || 0,
                        'Baixando...',
                        data.speed || '--',
                        data.eta || '--'
                    );
                } else if (data.status === 'processing') {
                    updateProgress(90, 'Processando...', '--', '--');
                } else if (data.status === 'done') {
                    clearInterval(interval);
                    updateProgress(100, 'Concluído!', '--', '0s');

                    setTimeout(() => {
                        hide('progressSection');
                        showSuccess(data.filename || 'Arquivo baixado', data.filepath || '');
                        addToHistory(state.videoInfo, options, data);
                        updateStatsAfterDownload(data.filesize || 0);
                    }, 800);

                    resolve();
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    hide('progressSection');
                    showError(data.error || 'Erro durante o download');
                    reject(new Error(data.error));
                }
            } catch (err) {
                clearInterval(interval);
                reject(err);
            }
        }, 500);
    });
}

// ===== ATUALIZAR PROGRESSO =====
function updateProgress(percent, label, speed, eta) {
    const bar = document.getElementById('progressBar');
    const glow = document.getElementById('progressGlow');
    const pct = document.getElementById('progressPercent');
    const spd = document.getElementById('progressSpeed');
    const etaEl = document.getElementById('progressETA');

    bar.style.width = `${percent}%`;
    glow.style.left = `${Math.max(0, percent - 5)}%`;
    pct.textContent = `${Math.round(percent)}%`;
    spd.innerHTML = `<i class="fas fa-tachometer-alt"></i> ${speed}`;
    etaEl.innerHTML = `<i class="far fa-clock"></i> ETA: ${eta}`;
}

// ===== MOSTRAR SUCESSO =====
function showSuccess(filename, filepath) {
    document.getElementById('resultMessage').textContent = `Download concluído: ${filename}`;
    document.getElementById('resultFilePath').textContent = filepath;
    show('resultSection');
    hide('errorSection');
    showToast('Download concluído com sucesso!', 'success', 'fas fa-check');
}

// ===== MOSTRAR ERRO =====
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    show('errorSection');
    hide('resultSection');
    showToast(`Erro: ${message}`, 'error', 'fas fa-times');
}

// ===== ABRIR PASTA DE DOWNLOADS =====
async function openDownloadFolder() {
    try {
        await fetch(`${API_URL}/open-folder`);
    } catch {
        showToast('Não foi possível abrir a pasta', 'warning', 'fas fa-folder');
    }
}

// ===== RESETAR FORMULÁRIO =====
function resetForm() {
    document.getElementById('urlInput').value = '';
    state.videoInfo = null;
    state.selectedQuality = null;
    hideAllSections();
    document.getElementById('analyzeBtn').innerHTML = `<i class="fas fa-search"></i> Analisar Vídeo <div class="btn-shine"></div>`;
    document.getElementById('urlInput').focus();
}

// ===== HISTÓRICO =====
function addToHistory(info, options, result) {
    if (!info) return;

    const item = {
        id: Date.now(),
        title: info.title,
        thumbnail: info.thumbnail,
        url: document.getElementById('urlInput').value,
        platform: getPlatformName(info.extractor || ''),
        type: options.audio_only ? 'audio' : 'video',
        format: options.audio_only ? options.audio_format : 'mp4',
        filename: result.filename,
        date: new Date().toLocaleString('pt-BR'),
    };

    state.downloadHistory.unshift(item);
    if (state.downloadHistory.length > 20) state.downloadHistory.pop();
    localStorage.setItem('vdp_history', JSON.stringify(state.downloadHistory));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    const section = document.getElementById('historySection');

    if (state.downloadHistory.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    list.innerHTML = '';

    state.downloadHistory.forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.onclick = () => {
            document.getElementById('urlInput').value = item.url;
            window.scrollTo(0, 0);
            showToast('Link carregado! Clique em Analisar.', 'info', 'fas fa-link');
        };

        const platformIcons = {
            'YouTube': '▶️', 'TikTok': '🎵', 'Instagram': '📸',
            'Twitter': '🐦', 'Facebook': '📘', 'Twitch': '🟣',
            'Reddit': '🤖', 'Vimeo': '🎬'
        };

        el.innerHTML = `
            <span class="history-platform">${platformIcons[item.platform] || '🎬'}</span>
            ${item.thumbnail ? `<img class="history-thumb" src="${item.thumbnail}" onerror="this.style.display='none'">` : ''}
            <div class="history-info">
                <div class="history-title">${item.title || 'Sem título'}</div>
                <div class="history-meta">${item.platform} • ${item.type === 'audio' ? '🎵 ' + item.format.toUpperCase() : '🎬 ' + item.format.toUpperCase()} • ${item.date}</div>
            </div>
        `;
        list.appendChild(el);
    });
}

function clearHistory() {
    if (confirm('Limpar todo o histórico de downloads?')) {
        state.downloadHistory = [];
        localStorage.removeItem('vdp_history');
        renderHistory();
        showToast('Histórico limpo!', 'info', 'fas fa-trash');
    }
}

// ===== STATS =====
function updateStatsAfterDownload(bytes) {
    state.stats.downloads++;
    state.stats.totalBytes += bytes || 0;
    localStorage.setItem('vdp_stats', JSON.stringify(state.stats));
    updateStats();
}

function updateStats() {
    document.getElementById('totalDownloads').textContent = state.stats.downloads;
    document.getElementById('totalSize').textContent = formatBytes(state.stats.totalBytes);
}

// ===== TOAST =====
function showToast(message, type = 'info', icon = 'fas fa-info-circle') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icon}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3100);
}

// ===== UTILITÁRIOS =====
function isValidURL(str) {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

function formatDuration(secs) {
    if (!secs) return 'N/A';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatViews(n) {
    if (!n) return 'N/A';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getPlatformName(extractor) {
    const map = {
        'youtube': 'YouTube', 'YoutubeTab': 'YouTube',
        'TikTok': 'TikTok', 'tiktok': 'TikTok',
        'Instagram': 'Instagram', 'instagram': 'Instagram',
        'Twitter': 'Twitter', 'twitter': 'Twitter',
        'Facebook': 'Facebook', 'facebook': 'Facebook',
        'Twitch': 'Twitch', 'twitch': 'Twitch',
        'Reddit': 'Reddit', 'reddit': 'Reddit',
        'Vimeo': 'Vimeo', 'vimeo': 'Vimeo',
        'Dailymotion': 'Dailymotion',
    };
    for (const [key, val] of Object.entries(map)) {
        if (extractor.toLowerCase().includes(key.toLowerCase())) return val;
    }
    return extractor || 'Web';
}

function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

function hideAllSections() {
    ['loadingSection', 'videoPreview', 'downloadOptions',
     'progressSection', 'resultSection', 'errorSection'].forEach(hide);
}

// ===== CONFIGURAÇÕES =====
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsOverlay');
    const input = document.getElementById('apiUrlInput');
    
    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        input.value = localStorage.getItem('vdp_api_url') || 'http://localhost:5000';
        panel.classList.add('active');
        overlay.classList.add('active');
    }
}

function saveApiUrl() {
    const input = document.getElementById('apiUrlInput');
    let url = input.value.trim();
    
    if (!url) {
        showToast('Digite uma URL válida', 'warning', 'fas fa-exclamation');
        return;
    }
    
    // Adicionar http se não tiver
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }
    
    // Remover barra no final
    url = url.replace(/\/$/, '');
    
    localStorage.setItem('vdp_api_url', url);
    showToast('URL salva!', 'success', 'fas fa-check');
    
    toggleSettings();
    
    // Recarregar página para aplicar novo IP
    setTimeout(() => {
        window.location.reload();
    }, 500);
}

// Detectar e aplicar IP automaticamente
async function autoDetectIP() {
    const btn = event.target;
    const input = document.getElementById('apiUrlInput');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detectando...';
    
    // Primeiro, tentar via servidor
    try {
        // Tentar alguns IPs comuns
        const commonIPs = [
            'http://192.168.1.100:5000',
            'http://192.168.1.101:5000',
            'http://192.168.1.102:5000',
            'http://192.168.1.1:5000',
            'http://10.0.0.1:5000',
            'http://10.0.0.2:5000'
        ];
        
        for (const testUrl of commonIPs) {
            try {
                const response = await fetch(`${testUrl}/`, { 
                    method: 'GET',
                    signal: AbortSignal.timeout(2000) 
                });
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data.status === 'running' || data.name) {
                        input.value = testUrl;
                        showToast(`IP detectado: ${testUrl}`, 'success', 'fas fa-check');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-wifi"></i> Detectar IP Automaticamente';
                        return;
                    }
                }
            } catch {
                // Continuar para próximo IP
            }
        }
    } catch (e) {
        console.log('Falha na detecção automática');
    }
    
    // Mostrar instructions
    showToast('Não foi possível detectar automaticamente. Configure o IP manualmente.', 'warning', 'fas fa-exclamation-triangle');
    showRemoteAccessHelp();
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-wifi"></i> Detectar IP Automaticamente';
}

async function testConnection() {
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
    
    try {
        const response = await fetch(`${API_URL}/`);
        
        // Verificar se a resposta é JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Resposta não é JSON - verifique o IP do servidor');
        }
        
        const data = await response.json();
        showToast(`Conectado! Servidor: ${data.name}`, 'success', 'fas fa-check');
    } catch (error) {
        showToast('Erro ao conectar. Verifique o IP e porta. Do celular, use o IP do computador (ex: http://192.168.1.100:5000)', 'error', 'fas fa-times');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug"></i> Testar Conexão';
}
