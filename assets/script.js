const state = { items: [], filtered: [], renderIndex: 0, chunkSize: 20, format: 'all', view: 'grid', sort: 'relevance', filters: { author: '', categories: [], minSizeMB: 0, maxSizeMB: 500, yearFrom: 1900, yearTo: 2025, ratingMin: 0 } };
const GRID_MAP = { compact: '280px', standard: '380px', comfortable: '500px' };

const els = {
  list: document.getElementById('pdf-list'),
  empty: document.getElementById('empty'),
  totalCount: document.getElementById('total-count'),
  filteredCount: document.getElementById('filtered-count'),
  totalSize: document.getElementById('total-size'),
  search: document.getElementById('search'),
  typeFilter: document.getElementById('type-filter'),
  sortBy: document.getElementById('sort-by'),
  pageSize: document.getElementById('page-size'),
  gridSize: document.getElementById('grid-size'),
  year: document.getElementById('year'),
  toast: document.getElementById('toast'),
  modalBackdrop: document.getElementById('modal-backdrop'),
  descModal: document.getElementById('desc-modal'),
  descModalClose: document.getElementById('desc-modal-close'),
  descModalBody: document.getElementById('desc-modal-body'),
  descModalTitle: document.getElementById('desc-modal-title'),
  filtersToggle: document.getElementById('filters-toggle'),
  filtersGrid: document.getElementById('filters-grid'),
  authorInput: document.getElementById('author-input'),
  sizeMin: document.getElementById('size-min'),
  sizeMax: document.getElementById('size-max'),
  sizeMinLabel: document.getElementById('size-min-label'),
  sizeMaxLabel: document.getElementById('size-max-label'),
  yearFromInput: document.getElementById('year-from'),
  yearToInput: document.getElementById('year-to'),
  ratingMin: document.getElementById('rating-min')
};
const viewBtns = Array.from(document.querySelectorAll('.view-btn'));
let isLoadingMore = false;
let scrollObserver = null;
function __num(x, d) { return typeof x === 'number' ? x : d; }
function computeChunkSize() {
  const vh = window.innerHeight || 800;
  const v = state.view || 'grid';
  let base;
  if (v === 'grid') base = Math.ceil(vh / 240) * 4;
  else if (v === 'compact') base = Math.ceil(vh / 120) * 6;
  else base = Math.ceil(vh / 140) * 5;
  const dm = __num(navigator.deviceMemory, 4);
  if (dm >= 8) base += 8; else if (dm <= 4) base -= 4;
  base = Math.max(12, Math.min(60, base));
  return base;
}
function computeObserverOptions() {
  const c = state.chunkSize || 20;
  const dm = __num(navigator.deviceMemory, 4);
  let margin = c * 16;
  if (dm >= 8) margin += 200; else if (dm <= 4) margin -= 100;
  margin = Math.max(200, Math.min(800, margin));
  return { rootMargin: `${margin}px`, threshold: 0.1 };
}

function __normalizeSagaKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function __romanToInt(r) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const s = String(r || '').toUpperCase().replace(/[^IVXLCDM]/g, '');
  if (!s) return NaN;
  let total = 0, prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const val = map[s[i]] || 0;
    if (val < prev) total -= val; else { total += val; prev = val; }
  }
  return total || NaN;
}

function extractSaga(item) {
  const t = String(item.title || '');
  const bi = t.indexOf('[');
  const pi = t.indexOf('(');
  let m = t.match(/\[([^\]]+?)\s*(?:#|)?\s*([IVXLCDM]+|\d+)\]/i);
  if (m) {
    const numRaw = m[2];
    const idx = /^\d+$/.test(numRaw) ? Number(numRaw) : __romanToInt(numRaw);
    const base = bi > -1 ? t.slice(0, bi).trim() : '';
    const name = (base || m[1]).trim();
    return { key: __normalizeSagaKey(name), name, index: isNaN(idx) ? null : idx };
  }
  m = t.match(/\((?:Vol\.?|Volume|Livro|Tomo|Parte)\s*\.?\s*([IVXLCDM]+|\d+)\)/i);
  if (m) {
    const numRaw = m[1];
    const idx = /^\d+$/.test(numRaw) ? Number(numRaw) : __romanToInt(numRaw);
    const base = pi > -1 ? t.slice(0, pi).trim() : t;
    const name = base.trim();
    return { key: __normalizeSagaKey(name), name, index: isNaN(idx) ? null : idx };
  }
  m = t.match(/\[([^\]]+?)\]/);
  if (m) {
    const base = bi > -1 ? t.slice(0, bi).trim() : '';
    const name = (base || m[1]).trim();
    return { key: __normalizeSagaKey(name), name, index: null };
  }
  return null;
}

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

function setupInfiniteScroll() {
  if (scrollObserver) { scrollObserver.disconnect(); }
  const lastCard = els.list && els.list.lastElementChild;
  if (!lastCard) return;
  const opts = computeObserverOptions();
  scrollObserver = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (e && e.isIntersecting && !isLoadingMore) {
      const currentEnd = state.renderIndex + state.chunkSize;
      if (currentEnd < state.filtered.length) {
        isLoadingMore = true;
        state.renderIndex = currentEnd;
        renderMore();
      }
    }
  }, opts);
  scrollObserver.observe(lastCard);
}

function createCardElement(item) {
  const li = document.createElement('li');
  li.className = state.view === 'grid' ? 'pdf-card' : 'pdf-row';
  const coverSrc = item.cover || generateCover(item.title);
  const longDesc = (item.description || '').length > 180;
  const fileType = (state.format === 'all' ? getFormat(item) : state.format).toUpperCase();
  const exactMB = calculateExactMB(item.size);
  const isSaga = Array.isArray(item.__seriesGroup) && item.__seriesGroup.length > 1;
  const sagaCount = isSaga ? (item.__seriesGroup.length || 0) : 0;
  if (state.view === 'grid') {
    li.innerHTML = `
                    <div class="card-cover">
                        <img src="${coverSrc}" alt="Capa de ${escapeHtml(item.title)}" 
                             loading="lazy" decoding="async"
                             onerror="this.src='${generateCover(item.title)}'">
                        <div class="card-badge">${fileType}</div>
                        ${isSaga ? `<div class="saga-badge">Saga (${sagaCount})</div>` : ''}
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
                            ${isSaga ? `<button class="btn btn-secondary saga-btn"><span>📚</span><span>Saga</span></button>` : ''}
                        </div>
                    </div>
                `;
  } else {
    const author = getAuthor(item) || '';
    li.innerHTML = `
        <div class="row-cover">
          <img src="${coverSrc}" alt="Capa de ${escapeHtml(item.title)}" loading="lazy" decoding="async" onerror="this.src='${generateCover(item.title)}'">
        </div>
        <div class="row-main">
          <div class="row-title">${escapeHtml(item.title)}</div>
          <div class="row-sub">${escapeHtml(author)} • ${fileType} • ${formatSize(item.size)}${isSaga ? ` • Saga (${sagaCount})` : ''}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-primary download-btn"><span>⬇️</span><span>Baixar</span></button>
          <button class="btn btn-secondary preview-btn"><span>👁️</span><span>Visualizar</span></button>
          ${isSaga ? `<button class="btn btn-secondary saga-btn"><span>📚</span><span>Saga</span></button>` : ''}
        </div>
      `;
  }
  const downloadBtn = li.querySelector('.download-btn');
  downloadBtn.onclick = async () => {
    const href = resolveDownloadHref(item, state.format);
    const ext = (state.format === 'all' ? (href.toLowerCase().split('.').pop() || 'pdf') : (state.format || 'pdf')).toLowerCase();
    const name = buildDownloadName(item, ext, href);
    const exactMB = calculateExactMB(item.size);
    showToast(`📥 Iniciando download: ${item.title} (${exactMB} MB)`);
    const candidates = [href, href.replace(/\s+\.(pdf|epub|mobi)$/i, '.$1')];
    for (const u of candidates) {
      try {
        const res = await fetch(encodeURI(u), { mode: 'cors' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const mime = ext === 'epub' ? 'application/epub+zip' : (ext === 'mobi' ? 'application/x-mobipocket-ebook' : 'application/pdf');
        const typed = blob.type ? blob : new Blob([blob], { type: mime });
        const url = URL.createObjectURL(typed);
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`✅ Download iniciado: ${item.title} (${exactMB} MB)`);
        return;
      } catch { }
    }
    const a = document.createElement('a'); a.href = encodeURI(href); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    showToast(`⚠️ Tentando baixar diretamente: ${item.title} (${exactMB} MB)`);
  };
  const previewBtn = li.querySelector('.preview-btn');
  previewBtn.onclick = () => {
    const href = String(item.url || '');
    const target = href || '';
    window.open(encodeURI(target), '_blank');
    const exactMB = calculateExactMB(item.size);
    showToast(`👁️ Abrindo: ${item.title} (${exactMB} MB)`);
  };
  const readMore = li.querySelector('.read-more');
  if (readMore) { readMore.onclick = () => openBookModal(item, readMore); }
  const sagaBtn = li.querySelector('.saga-btn');
  if (sagaBtn) {
    const backdrop = els.modalBackdrop;
    const modal = els.descModal;
    const closeBtn = els.descModalClose;
    const body = els.descModalBody;
    const openSaga = () => {
      const group = Array.isArray(item.__seriesGroup) ? item.__seriesGroup : [];
      const name = String(item.__seriesName || 'Saga');
      const rows = group.map((bi, idx) => {
        const cover = bi.cover || generateCover(bi.title);
        const fmt = getFormat(bi).toUpperCase();
        const sizeStr = formatSize(bi.size);
        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <img src="${cover}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:8px;" loading="lazy" decoding="async" onerror="this.src='${generateCover(bi.title)}'">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;">${escapeHtml(bi.title)}</div>
                <div style="font-size:12px;opacity:.8;">${fmt} • ${sizeStr}</div>
                <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
                  <button class="btn btn-secondary series-preview" data-index="${idx}">Visualizar</button>
                  <button class="btn btn-primary series-download" data-index="${idx}">Baixar</button>
                  <button class="btn btn-secondary series-details" data-index="${idx}">Detalhes</button>
                </div>
              </div>
            </div>`;
      }).join('');
      body.innerHTML = rows || '<div>Nenhum livro encontrado nesta saga.</div>';
      if (els.descModalTitle) els.descModalTitle.textContent = `Saga: ${name}`;
      backdrop.hidden = false;
      modal.hidden = false;
      closeBtn.focus();
      const onEsc = (e) => { if (e.key === 'Escape') { close(); } };
      document.addEventListener('keydown', onEsc, { once: true });
      backdrop.onclick = close;
      closeBtn.onclick = close;
      function close() { modal.hidden = true; backdrop.hidden = true; sagaBtn.focus(); }
      const previews = body.querySelectorAll('.series-preview');
      previews.forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-index'));
          const bi = group[i];
          const href = String(bi.url || '');
          window.open(encodeURI(href || ''), '_blank');
          const exactMB = calculateExactMB(bi.size);
          showToast(`👁️ Abrindo: ${bi.title} (${exactMB} MB)`);
        });
      });
      const downs = body.querySelectorAll('.series-download');
      downs.forEach(btn => {
        btn.addEventListener('click', async () => {
          const i = Number(btn.getAttribute('data-index'));
          const bi = group[i];
          const href = resolveDownloadHref(bi, state.format);
          const ext = (state.format === 'all' ? (href.toLowerCase().split('.').pop() || 'pdf') : (state.format || 'pdf')).toLowerCase();
          const name = buildDownloadName(bi, ext, href);
          const exactMB = calculateExactMB(bi.size);
          showToast(`📥 Iniciando download: ${bi.title} (${exactMB} MB)`);
          const candidates = [href, href.replace(/\s+\.(pdf|epub|mobi)$/i, '.$1')];
          for (const u of candidates) {
            try {
              const res = await fetch(encodeURI(u), { mode: 'cors' });
              if (!res.ok) continue;
              const blob = await res.blob();
              const mime = ext === 'epub' ? 'application/epub+zip' : (ext === 'mobi' ? 'application/x-mobipocket-ebook' : 'application/pdf');
              const typed = blob.type ? blob : new Blob([blob], { type: mime });
              const url = URL.createObjectURL(typed);
              const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              showToast(`✅ Download iniciado: ${bi.title} (${exactMB} MB)`);
              return;
            } catch { }
          }
          const a = document.createElement('a'); a.href = encodeURI(href); a.download = name; document.body.appendChild(a); a.click(); a.remove();
          showToast(`⚠️ Tentando baixar diretamente: ${bi.title} (${exactMB} MB)`);
        });
      });
      const dets = body.querySelectorAll('.series-details');
      dets.forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-index'));
          const bi = group[i];
          openBookModal(bi, btn);
        });
      });
    };
    sagaBtn.onclick = openSaga;
  }
  return li;
}

function renderMore() {
  const end = Math.min(state.renderIndex + state.chunkSize, state.filtered.length);
  const fragment = document.createDocumentFragment();
  for (let idx = state.renderIndex - state.chunkSize; idx < end; idx++) {
    if (idx < 0 || idx >= state.filtered.length) continue;
    const item = state.filtered[idx];
    const li = createCardElement(item);
    fragment.appendChild(li);
  }
  els.list.appendChild(fragment);
  isLoadingMore = false;
  setupInfiniteScroll();
  updateStats();
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

  list.classList.toggle('list-view', state.view !== 'grid');
  list.classList.toggle('compact-view', state.view === 'compact');
  if (typeof state.__autoChunk !== 'boolean') state.__autoChunk = true;
  if (state.__autoChunk) state.chunkSize = computeChunkSize();
  const end = Math.min(state.renderIndex + state.chunkSize, state.filtered.length);
  const fragment = document.createDocumentFragment();
  for (let idx = 0; idx < end; idx++) {
    const item = state.filtered[idx];
    const li = createCardElement(item);
    fragment.appendChild(li);
  }
  list.appendChild(fragment);

  if (end < state.filtered.length) {
    setupInfiniteScroll();
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
  const f = state.filters;
  if (f.author && f.author.trim()) {
    const a = f.author.trim().toLowerCase();
    base = base.filter(i => getAuthor(i).toLowerCase().includes(a));
  }
  if (Array.isArray(f.categories) && f.categories.length) {
    base = base.filter(i => {
      const cats = getCategories(i);
      for (const c of f.categories) { if (cats.includes(c)) return true; }
      return false;
    });
  }
  if (typeof f.minSizeMB === 'number' || typeof f.maxSizeMB === 'number') {
    const minB = (f.minSizeMB || 0) * 1000000;
    const maxB = (typeof f.maxSizeMB === 'number' ? f.maxSizeMB : 500) * 1000000;
    base = base.filter(i => {
      const s = i.size || 0;
      return s >= minB && s <= maxB;
    });
  }
  if (typeof f.yearFrom === 'number' || typeof f.yearTo === 'number') {
    const y1 = f.yearFrom || 0;
    const y2 = f.yearTo || 3000;
    base = base.filter(i => {
      const y = getYear(i);
      if (!y) return true;
      return y >= y1 && y <= y2;
    });
  }
  if (typeof f.ratingMin === 'number' && f.ratingMin > 0) {
    base = base.filter(i => (i.rating || 0) >= f.ratingMin);
  }
  const groups = new Map();
  const order = [];
  for (const item of base) {
    const info = extractSaga(item);
    if (info) {
      const k = info.key;
      let g = groups.get(k);
      if (!g) {
        g = { name: info.name, items: [] };
        groups.set(k, g);
        order.push({ type: 'group', key: k });
      }
      const idx = (info.index == null ? 9999 : info.index);
      g.items.push({ item, index: idx });
    } else {
      order.push({ type: 'single', item });
    }
  }
  const collapsed = [];
  const sagaIndex = state.__sagaIndex || new Map();
  for (const entry of order) {
    if (entry.type === 'single') {
      collapsed.push(entry.item);
    } else {
      const k = entry.key;
      const full = sagaIndex.get(k);
      if (full && full.items && full.items.length) {
        const first = full.items[0];
        first.__seriesGroup = full.items.slice();
        first.__seriesName = full.name;
        first.__seriesCount = full.items.length;
        first.__seriesTotalSize = full.items.reduce((s, it) => s + (it.size || 0), 0);
        collapsed.push(first);
      } else {
        const g = groups.get(k);
        g.items.sort((a, b) => a.index - b.index);
        const first = g.items[0].item;
        const groupItems = g.items.map(x => x.item);
        first.__seriesGroup = groupItems;
        first.__seriesName = g.name;
        first.__seriesCount = groupItems.length;
        first.__seriesTotalSize = groupItems.reduce((s, it) => s + (it.size || 0), 0);
        collapsed.push(first);
      }
    }
  }
  const sortKey = state.sort || 'relevance';
  if (sortKey !== 'relevance') {
    collapsed.sort((a, b) => {
      if (sortKey === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''));
      if (sortKey === 'title-desc') return String(b.title || '').localeCompare(String(a.title || ''));
      if (sortKey === 'year-desc') {
        const ya = getYear(a) || 0; const yb = getYear(b) || 0; return yb - ya;
      }
      if (sortKey === 'size-desc') {
        const sa = (a.__seriesTotalSize || a.size || 0); const sb = (b.__seriesTotalSize || b.size || 0); return sb - sa;
      }
      if (sortKey === 'rating-desc') return (b.rating || 0) - (a.rating || 0);
      return 0;
    });
  }
  state.filtered = collapsed;
  state.renderIndex = 0;
  isLoadingMore = false;
  if (scrollObserver) scrollObserver.disconnect();
  render();
}

// Load data
function renderSkeleton(count = 8) {
  const list = els.list;
  const empty = els.empty;
  list.innerHTML = '';
  empty.hidden = true;
  list.classList.toggle('list-view', false);
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    li.className = 'pdf-card skeleton-card';
    li.innerHTML = `
      <div class="card-cover skeleton"></div>
      <div class="card-content">
        <div class="line skeleton" style="height:22px;width:70%;margin-bottom:12px;"></div>
        <div class="line skeleton" style="height:14px;width:100%;margin-bottom:8px;"></div>
        <div class="line skeleton" style="height:14px;width:90%;margin-bottom:16px;"></div>
        <div class="line skeleton" style="height:14px;width:50%;"></div>
      </div>`;
    list.appendChild(li);
  }
}

renderSkeleton(8);

fetch('books/books.json')
  .then(res => res.json())
  .then(data => {
    state.items = Array.isArray(data) ? data : [];
    const idx = new Map();
    for (const it of state.items) {
      const info = extractSaga(it);
      if (!info) continue;
      const k = info.key;
      let g = idx.get(k);
      if (!g) { g = { name: info.name, items: [] }; idx.set(k, g); }
      g.items.push({ item: it, index: (info.index == null ? 9999 : info.index) });
    }
    for (const [k, g] of idx) {
      g.items.sort((a, b) => a.index - b.index);
      g.items = g.items.map(x => x.item);
    }
    state.__sagaIndex = idx;
    state.renderIndex = 0;
    applyFilter(els.search.value || '');

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

if (els.sortBy) {
  els.sortBy.addEventListener('change', (e) => {
    state.sort = e.target.value || 'relevance';
    applyFilter(els.search.value || '');
  });
}

if (els.pageSize) {
  els.pageSize.addEventListener('change', (e) => {
    state.chunkSize = Number(e.target.value) || 20;
    state.__autoChunk = false;
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

function openBookModal(item, returnFocusEl) {
  const backdrop = els.modalBackdrop;
  const modal = els.descModal;
  const closeBtn = els.descModalClose;
  const body = els.descModalBody;
  const author = getAuthor(item) || 'Desconhecido';
  const year = getYear(item);
  const cats = getCategories(item);
  const rating = item.rating || null;
  const cover = item.cover || generateCover(item.title);
  const fmt = getFormat(item).toUpperCase();
  const sizeStr = formatSize(item.size);
  const isbn = item.isbn || '';
  const metaBits = [year ? `📅 ${year}` : '', cats[0] ? `📚 ${cats[0]}` : '', rating ? `⭐ ${rating}` : ''].filter(Boolean).join(' ');
  const sinopse = escapeHtml(item.description || '');
  body.innerHTML = `
    <div class="book-modal-header">
      <img src="${cover}" alt="" class="book-modal-cover" loading="lazy" decoding="async" onerror="this.src='${generateCover(item.title)}'">
      <div class="book-modal-info">
        <h2 id="book-title">${escapeHtml(item.title)}</h2>
        <p class="book-author">Autor: <span>${escapeHtml(author)}</span></p>
        <div class="book-meta">${metaBits}</div>
      </div>
    </div>
    <div class="book-modal-body">
      <div class="book-tabs">
        <button class="tab-btn active" data-tab="sinopse">Sinopse</button>
        <button class="tab-btn" data-tab="detalhes">Detalhes</button>
      </div>
      <div id="sinopse-tab" class="tab-content">${sinopse || 'Sem descrição disponível.'}</div>
      <div id="detalhes-tab" class="tab-content" hidden>
        <dl>
          <dt>ISBN:</dt><dd>${escapeHtml(isbn || '—')}</dd>
          <dt>Formato:</dt><dd>${fmt}</dd>
          <dt>Tamanho:</dt><dd>${sizeStr}</dd>
        </dl>
      </div>
    </div>
  `;
  if (els.descModalTitle) els.descModalTitle.textContent = 'Detalhes do Livro';
  backdrop.hidden = false;
  modal.hidden = false;
  modal.classList.add('modal--book');
  closeBtn.focus();
  const onEsc = (e) => { if (e.key === 'Escape') { close(); } };
  document.addEventListener('keydown', onEsc, { once: true });
  backdrop.onclick = close;
  closeBtn.onclick = close;
  function close() {
    modal.hidden = true;
    backdrop.hidden = true;
    modal.classList.remove('modal--book');
    if (returnFocusEl) returnFocusEl.focus();
  }
  const tabs = body.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sel = btn.getAttribute('data-tab');
      const sin = body.querySelector('#sinopse-tab');
      const det = body.querySelector('#detalhes-tab');
      const showSin = sel === 'sinopse';
      sin.hidden = !showSin;
      det.hidden = showSin;
    });
  });
}

function getAuthor(item) {
  const t = String(item.title || '').trim();
  const i = t.indexOf(' - ');
  if (i > 0) return t.slice(0, i).trim();
  return '';
}

function getYear(item) {
  if (item.year && typeof item.year === 'number') return item.year;
  const src = `${item.title || ''} ${item.filename || ''} ${item.description || ''}`;
  const m = src.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function getCategories(item) {
  if (Array.isArray(item.categories)) return item.categories.map(x => String(x).toLowerCase());
  const t = String(item.title || '').toLowerCase();
  const d = String(item.description || '').toLowerCase();
  const out = [];
  if (/(manual|guia|curso|roteiro|técnico)/.test(t) || /(manual|guia|curso|roteiro|técnico)/.test(d)) out.push('técnico');
  if (/(ficção|romance|fantasia|mistério|thriller|suspense)/.test(t) || /(ficção|romance|fantasia|mistério|thriller|suspense)/.test(d)) out.push('ficção');
  if (/(hábito|auto ajuda|auto-ajuda|produtividade|motivação)/.test(t) || /(hábito|auto ajuda|auto-ajuda|produtividade|motivação)/.test(d)) out.push('auto-ajuda');
  return Array.from(new Set(out));
}

if (els.filtersToggle && els.filtersGrid) {
  els.filtersToggle.addEventListener('click', () => {
    const backdrop = els.modalBackdrop;
    const modal = els.descModal;
    const closeBtn = els.descModalClose;
    const body = els.descModalBody;
    const container = document.querySelector('.filters-panel');
    let placeholder = document.getElementById('__filters_placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = '__filters_placeholder';
      container.appendChild(placeholder);
    }
    if (els.descModalTitle) els.descModalTitle.textContent = 'Filtros Avançados';
    body.innerHTML = '';
    body.appendChild(els.filtersGrid);
    els.filtersGrid.hidden = false;
    backdrop.hidden = false;
    modal.hidden = false;
    modal.classList.add('modal--filters');
    closeBtn.focus();
    const onEsc = (e) => { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', onEsc, { once: true });
    backdrop.onclick = close;
    closeBtn.onclick = close;
    function close() {
      placeholder.replaceWith(els.filtersGrid);
      els.filtersGrid.hidden = true;
      modal.hidden = true;
      backdrop.hidden = true;
      modal.classList.remove('modal--filters');
      els.filtersToggle.setAttribute('aria-expanded', 'false');
      els.filtersToggle.focus();
    }
    els.filtersToggle.setAttribute('aria-expanded', 'true');
  });
}

if (els.authorInput) {
  els.authorInput.addEventListener('input', debounce((e) => {
    state.filters.author = String(e.target.value || '').trim();
    applyFilter(els.search.value || '');
  }, 300));
}

if (els.sizeMin && els.sizeMax) {
  const syncLabels = () => {
    els.sizeMinLabel.textContent = `${els.sizeMin.value} MB`;
    els.sizeMaxLabel.textContent = `${els.sizeMax.value} MB`;
  };
  syncLabels();
  els.sizeMin.addEventListener('input', () => { state.filters.minSizeMB = Number(els.sizeMin.value) || 0; syncLabels(); applyFilter(els.search.value || ''); });
  els.sizeMax.addEventListener('input', () => { state.filters.maxSizeMB = Number(els.sizeMax.value) || 500; syncLabels(); applyFilter(els.search.value || ''); });
}

if (els.yearFromInput && els.yearToInput) {
  const apply = () => {
    state.filters.yearFrom = Number(els.yearFromInput.value) || 1900;
    state.filters.yearTo = Number(els.yearToInput.value) || 2025;
    applyFilter(els.search.value || '');
  };
  els.yearFromInput.addEventListener('change', apply);
  els.yearToInput.addEventListener('change', apply);
}

if (els.ratingMin) {
  els.ratingMin.addEventListener('change', (e) => {
    state.filters.ratingMin = Number(e.target.value) || 0;
    applyFilter(els.search.value || '');
  });
}

(() => {
  const checks = document.querySelectorAll('.category-check');
  if (checks && checks.length) {
    checks.forEach((c) => {
      c.addEventListener('change', () => {
        const selected = Array.from(document.querySelectorAll('.category-check:checked')).map(x => x.value);
        state.filters.categories = selected.map(x => String(x).toLowerCase());
        applyFilter(els.search.value || '');
      });
    });
  }
})();
/**
 * Biblioteca Digital Script
 * Versão: 1.0.0
 * Responsável: Biblioteca Digital
 * Descrição: Renderiza catálogo, aplica busca/filtros e gerencia downloads.
 */

// Cache de elementos do DOM para evitar buscas repetidas
if (viewBtns && viewBtns.length) {
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view') || 'grid';
      state.view = v;
      viewBtns.forEach(b => b.classList.toggle('active', b === btn));
      state.renderIndex = 0;
      render();
    });
  });
}
