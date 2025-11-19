const state = { items: [], filtered: [], renderIndex: 0, chunkSize: 20, format: 'all' };
const GRID_MAP = { compact: '280px', standard: '380px', comfortable: '500px' };

const els = {
  list: document.getElementById('pdf-list'),
  empty: document.getElementById('empty'),
  totalCount: document.getElementById('total-count'),
  filteredCount: document.getElementById('filtered-count'),
  totalSize: document.getElementById('total-size'),
  search: document.getElementById('search'),
  typeFilter: document.getElementById('type-filter'),
  pageSize: document.getElementById('page-size'),
  gridSize: document.getElementById('grid-size'),
  year: document.getElementById('year'),
  toast: document.getElementById('toast'),
  modalBackdrop: document.getElementById('modal-backdrop'),
  descModal: document.getElementById('desc-modal'),
  descModalClose: document.getElementById('desc-modal-close'),
  descModalBody: document.getElementById('desc-modal-body')
};

function formatSize(bytes) {
  if (!bytes) return 'Tamanho desconhecido';
  
  // Cálculo automático e preciso de MB
  const mb = bytes / (1000 * 1000); // Usando sistema decimal (1MB = 1.000.000 bytes)
  
  if (mb >= 1) {
    // Para valores >= 1MB, mostra com 2 casas decimais
    return `${mb.toFixed(2)} MB`;
  } else {
    // Para valores < 1MB, converte para KB
    const kb = bytes / 1000;
    return `${kb.toFixed(1)} KB`;
  }
}

function calculateExactMB(bytes) {
  if (!bytes) return '0.00';
  return (bytes / 1000000).toFixed(2);
}

let __toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = msg;
  toast.className = `toast toast--${type}`;
  toast.classList.add('show');
  if (__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 350);
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateCover(title) {
  const colors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  ];
  const letter = (title || 'P').charAt(0).toUpperCase();
  const gradient = colors[Math.floor(Math.random() * colors.length)];
  return `data:image/svg+xml,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="400" height="320">
                    <defs>
                        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#667eea"/>
                            <stop offset="100%" style="stop-color:#764ba2"/>
                        </linearGradient>
                    </defs>
                    <rect width="400" height="320" fill="url(#g)"/>
                    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" 
                          font-family="system-ui" font-size="120" font-weight="bold" opacity="0.9">
                        ${letter}
                    </text>
                </svg>
            `)}`;
}

function render() {
  const list = els.list;
  const empty = els.empty;

  list.innerHTML = '';

  if (state.filtered.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  const end = Math.min(state.renderIndex + state.chunkSize, state.filtered.length);
  for (let idx = 0; idx < end; idx++) {
    const item = state.filtered[idx];
    const li = document.createElement('li');
    li.className = 'pdf-card';

    const coverSrc = item.cover || generateCover(item.title);

    const longDesc = (item.description || '').length > 180;
    const fileType = (state.format === 'all' ? getFormat(item) : state.format).toUpperCase();
    
    // Adicionando o tamanho exato em MB como data attribute
    const exactMB = calculateExactMB(item.size);
    
    li.innerHTML = `
                    <div class="card-cover">
                        <img src="${coverSrc}" alt="Capa de ${escapeHtml(item.title)}" 
                             onerror="this.src='${generateCover(item.title)}'">
                        <div class="card-badge">${fileType}</div>
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${escapeHtml(item.title)}</h3>
                        ${item.description ? `<p class="card-description">${escapeHtml(item.description)}</p>` : ''}
                        ${longDesc ? `<button class="read-more" type="button" aria-haspopup="dialog" aria-controls="desc-modal">Ler mais</button>` : ''}
                        <div class="card-meta">
                            <span class="meta-item">💾 ${formatSize(item.size)}</span>
                            <span class="meta-item" data-exact-mb="${exactMB}">📄 ${fileType}</span>
                        </div>
                        <div class="card-actions">
                            <button class="btn btn-primary download-btn">
                                <span>⬇️</span>
                                <span>Baixar</span>
                            </button>
                            <button class="btn btn-secondary preview-btn">
                                <span>👁️</span>
                                <span>Visualizar</span>
                            </button>
                        </div>
                    </div>
                `;

    const downloadBtn = li.querySelector('.download-btn');
    downloadBtn.onclick = async () => {
      const href = resolveDownloadHref(item, state.format);
      const ext = (state.format === 'all' ? (href.toLowerCase().split('.').pop() || 'pdf') : (state.format || 'pdf')).toLowerCase();
      const name = buildDownloadName(item, ext, href);
      
      // Mostra o tamanho exato no toast de download
      const exactMB = calculateExactMB(item.size);
      showToast(`📥 Iniciando download: ${item.title} (${exactMB} MB)`);
      
      try {
        const res = await fetch(href, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const mime = ext === 'epub' ? 'application/epub+zip' : (ext === 'mobi' ? 'application/x-mobipocket-ebook' : 'application/pdf');
        const typed = blob.type ? blob : new Blob([blob], { type: mime });
        const url = URL.createObjectURL(typed);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`✅ Download iniciado: ${item.title} (${exactMB} MB)`);
      } catch (err) {
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`⚠️ Tentando baixar diretamente: ${item.title} (${exactMB} MB)`);
      }
    };

    const previewBtn = li.querySelector('.preview-btn');
    previewBtn.onclick = () => {
      window.open(item.url, '_blank');
      const exactMB = calculateExactMB(item.size);
      showToast(`👁️ Abrindo: ${item.title} (${exactMB} MB)`);
    };

    const readMore = li.querySelector('.read-more');
    if (readMore) {
      const backdrop = els.modalBackdrop;
      const modal = els.descModal;
      const closeBtn = els.descModalClose;
      const body = els.descModalBody;
      const open = () => {
        body.textContent = item.description || '';
        backdrop.hidden = false;
        modal.hidden = false;
        closeBtn.focus();
        const onEsc = (e) => { if (e.key === 'Escape') { close(); } };
        document.addEventListener('keydown', onEsc, { once: true });
        backdrop.onclick = close;
        closeBtn.onclick = close;
        function close() {
          modal.hidden = true;
          backdrop.hidden = true;
          readMore.focus();
        }
      };
      readMore.onclick = open;
    }

    list.appendChild(li);
  }

  const existingBtn = document.getElementById('load-more');
  if (existingBtn) existingBtn.remove();
  if (end < state.filtered.length) {
    const btn = document.createElement('button');
    btn.id = 'load-more';
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Carregar mais';
    btn.setAttribute('aria-label', 'Carregar mais livros');
    btn.onclick = () => { state.renderIndex = end; render(); };
    list.parentNode.insertBefore(btn, list.nextSibling);
  } else {
    state.renderIndex = 0;
  }

  updateStats();
}

function updateStats() {
  els.totalCount.textContent = state.items.length;
  els.filteredCount.textContent = state.filtered.length;
  const totalBytes = state.items.reduce((sum, item) => sum + (item.size || 0), 0);
  const totalMB = calculateExactMB(totalBytes);
  els.totalSize.textContent = `${totalMB} MB`;
}

function applyFilter(query) {
  const q = query.toLowerCase();
  let base = q
    ? state.items.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q)
    )
    : state.items.slice();
  if (state.format !== 'all') {
    base = base.filter(i => hasFormat(i, state.format));
  }
  state.filtered = base;
  state.renderIndex = 0;
  render();
}

// Load data
fetch('books/books.json')
  .then(res => res.json())
  .then(data => {
    state.items = Array.isArray(data) ? data : [];
    state.filtered = state.items.slice();
    state.renderIndex = 0;
    render();
    
    // Calcular tamanho total para o toast
    const totalBytes = state.items.reduce((sum, item) => sum + (item.size || 0), 0);
    const totalMB = calculateExactMB(totalBytes);
    showToast(`✨ ${state.items.length} livros carregados (${totalMB} MB no total)!`);
  })
  .catch(() => {
    document.getElementById('empty').hidden = false;
    showToast('❌ Erro ao carregar a biblioteca');
  });

// Search
const debounce = (fn, wait = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
};
els.search.addEventListener('input', debounce((e) => applyFilter(e.target.value), 300));

if (els.typeFilter) {
  els.typeFilter.addEventListener('change', (e) => {
    state.format = e.target.value;
    applyFilter(els.search.value || '');
  });
}

if (els.pageSize) {
  els.pageSize.addEventListener('change', (e) => {
    state.chunkSize = Number(e.target.value) || 20;
    state.renderIndex = 0;
    render();
  });
}

if (els.gridSize) {
  const applyGrid = (val) => {
    const px = GRID_MAP[val] || GRID_MAP.standard;
    els.list.style.setProperty('--card-min', px);
  };
  els.gridSize.addEventListener('change', (e) => applyGrid(e.target.value));
  applyGrid(els.gridSize.value || 'standard');
}

if (els.pageSize) els.pageSize.value = String(state.chunkSize);

// Year
els.year.textContent = new Date().getFullYear();

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    els.search.focus();
  }
});

// Click to dismiss toast
(() => {
  const t = els.toast;
  if (t) t.addEventListener('click', () => {
    t.classList.remove('show');
    if (typeof __toastTimer !== 'undefined') clearTimeout(__toastTimer);
    t.hidden = true;
  });
})();

// Testes básicos e benchmark simples
function runTests() {
  const assert = (cond, msg) => { if (!cond) console.error('Teste falhou:', msg); };
  assert(calculateExactMB(1000000) === '1.00', 'MB de 1.000.000 bytes');
  assert(formatSize(2500000).includes('MB'), 'formatSize retorna MB');
  const start = performance.now();
  const tmp = state.filtered.slice(0, Math.min(5, state.filtered.length));
  const prev = state.filtered;
  state.filtered = tmp;
  render();
  state.filtered = prev;
  const dur = performance.now() - start;
  console.log(`Benchmark render parcial: ${dur.toFixed(2)}ms`);
}

function getFormat(item) {
  const fmt = String(item.format || '').toLowerCase();
  if (fmt === 'pdf' || fmt === 'epub' || fmt === 'mobi') return fmt;
  const href = String(item.url || item.filename || '').toLowerCase();
  if (href.endsWith('.epub')) return 'epub';
  if (href.endsWith('.mobi')) return 'mobi';
  return 'pdf';
}

function resolveDownloadHref(item, format) {
  const files = item.files || {};
  const chosen = (format && format !== 'all') ? format : null;
  if (chosen && files[chosen]) return files[chosen];
  const baseHref = String(item.url || item.filename || '');
  if (!chosen || chosen === getFormat(item)) return baseHref;
  const name = baseHref.split('/').pop() || (item.filename || item.title || 'arquivo');
  const base = name.replace(/\.(pdf|epub|mobi)$/i, '');
  const targetName = `${base}.${chosen}`;
  const dir = chosen === 'pdf' ? 'books/pdf' : (chosen === 'epub' ? 'books/epub' : 'books/mobi');
  return `${dir}/${targetName}`;
}

function hasFormat(item, fmt) {
  const files = item.files || {};
  if (files[fmt]) return true;
  const primary = getFormat(item);
  if (primary === fmt) return true;
  const href = String(item.url || item.filename || '').toLowerCase();
  if (fmt === 'epub' && href.endsWith('.epub')) return true;
  if (fmt === 'mobi' && href.endsWith('.mobi')) return true;
  return false;
}

function buildDownloadName(item, ext, href) {
  const title = String(item.title || '').trim();
  const src = title || (String(item.filename || '').split('/').pop()) || (String(href || '').split('/').pop()) || 'arquivo';
  const withoutExt = src.replace(/\.(pdf|epub|mobi)$/i, '');
  const cleaned = withoutExt
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/\.-+$/g, '')
    .replace(/^-+|-+$/g, '');
  return `${cleaned}.${ext}`;
}
/**
 * Biblioteca Digital Script
 * Versão: 1.0.0
 * Responsável: Biblioteca Digital
 * Descrição: Renderiza catálogo, aplica busca/filtros e gerencia downloads.
 */

// Cache de elementos do DOM para evitar buscas repetidas