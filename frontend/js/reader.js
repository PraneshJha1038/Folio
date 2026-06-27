/* ============================================================
   reader.js — Full rewrite
   Fixes:
   - raw_text null crash (article engine guards for null)
   - icon layout in floating nav
   - theme toggle mirrors index.html / library.js
   - TOC sidebar toggle
   - font-size controls wired correctly
   - progress bar on all engines
   ============================================================ */

const API_BASE = 'http://127.0.0.1:8000';

/* ── Utilities ────────────────────────────────────────────── */
function showError(msg) {
    const t = document.getElementById('error-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 5000);
}

/* ── ThemeManager (mirrors index.html exactly) ─────────────── */
class ThemeManager {
    constructor() {
        this.toggle = document.getElementById('theme-toggle');
        this.icon   = document.getElementById('theme-icon');
        const saved = localStorage.getItem('theme') || 'dark';
        this.setTheme(saved);
        this.toggle?.addEventListener('click', () => this.toggleTheme());
    }
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (this.icon) this.icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
    toggleTheme() {
        const cur = document.documentElement.getAttribute('data-theme');
        this.setTheme(cur === 'light' ? 'dark' : 'light');
        // Let the active engine update its iframe (EPUB)
        if (window._readerEngine && window._readerEngine.onThemeChange) {
            window._readerEngine.onThemeChange(cur === 'light' ? 'dark' : 'light');
        }
    }
}

/* ══════════════════════════════════════════════════════════
   UniversalReader
   ══════════════════════════════════════════════════════════ */
class UniversalReader {
    constructor() {
        if (!localStorage.getItem('access_token')) {
            window.location.href = 'index.html';
            return;
        }

        const params = new URLSearchParams(window.location.search);
        this.contentId = params.get('id');
        this.libraryItemId = params.get('library_item_id');
        this.progressPct = 0.0;
        if (!this.contentId) {
            window.location.href = 'library.html';
            return;
        }

        this.fontSize = 17; // px — used by font controls
        this.progressEl = document.getElementById('rdr-progress-fill');

        this._bindNav();
        this._fetchAndRender();
    }

    /* ── Nav controls & Session Logging ────────────────── */
    _bindNav() {
        this.startTime = Date.now();
        
        const logSessionAndLeave = async () => {
            await this._logReadingSession();
            window.location.href = 'library.html';
        };

        document.getElementById('rdr-back-btn').addEventListener('click', (e) => {
            e.preventDefault();
            logSessionAndLeave();
        });
        
        window.addEventListener('beforeunload', () => {
            // Synchronous sendBeacon is better for unload events if available
            this._logReadingSession(true);
        });

        // TOC sidebar
        const sidebar = document.getElementById('rdr-sidebar');
        document.getElementById('rdr-toc-btn').addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
        document.getElementById('rdr-close-toc').addEventListener('click', () => {
            sidebar.classList.remove('open');
        });

        // Settings panel
        const settingsPanel = document.getElementById('rdr-settings-panel');
        document.getElementById('rdr-settings-btn').addEventListener('click', () => {
            settingsPanel.classList.toggle('open');
        });
        document.getElementById('rdr-close-settings').addEventListener('click', () => {
            settingsPanel.classList.remove('open');
        });

        // Font size slider
        const fontSlider = document.getElementById('font-size-slider');
        fontSlider.addEventListener('input', (e) => {
            this.fontSize = parseInt(e.target.value, 10);
            document.documentElement.style.setProperty('--rdr-font-size', `${this.fontSize}px`);
            if (window._readerEngine?.onFontChange) window._readerEngine.onFontChange(this.fontSize);
        });

        // Font family grid
        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const font = btn.dataset.font;
                document.documentElement.style.setProperty('font-family', font, 'important');
                document.body.style.setProperty('font-family', font, 'important');
                if (window._readerEngine?.onFontFamilyChange) window._readerEngine.onFontFamilyChange(font);
            });
        });

        // 12 Themes
        const themes = ['light', 'dark', 'sepia', 'forest', 'ocean', 'dusk', 'nord', 'solarized', 'dracula', 'rose', 'slate', 'paper'];
        const themeGrid = document.getElementById('theme-grid');
        themeGrid.innerHTML = '';
        themes.forEach(theme => {
            const btn = document.createElement('div');
            btn.className = 'theme-btn';
            btn.setAttribute('data-theme', theme);
            // Quick visual representation
            btn.style.background = `var(--bg-primary)`;
            // Wait, we need the colours explicitly or CSS will handle it?
            // Actually, we can just apply the attribute to the document when hovered or clicked,
            // but for the button itself to look like the theme, we can just hardcode its bg/border or let it inherit.
            // A simple trick: set a class and let CSS handle it, but wait, variables apply globally.
            // Let's hardcode background colors for the buttons so they look right.
            const bgColors = {
                light: '#ffffff', dark: '#121212', sepia: '#f4ecd8', forest: '#e4efe4', 
                ocean: '#e6f0f5', dusk: '#2b2b36', nord: '#2e3440', solarized: '#fdf6e3', 
                dracula: '#282a36', rose: '#fff0f5', slate: '#1e293b', paper: '#fdfdfc'
            };
            const textColors = {
                light: '#111111', dark: '#eeeeee', sepia: '#433422', forest: '#1e3b1e',
                ocean: '#1c3d52', dusk: '#e2e2ec', nord: '#eceff4', solarized: '#657b83',
                dracula: '#f8f8f2', rose: '#4a2333', slate: '#f8fafc', paper: '#333333'
            };
            btn.style.backgroundColor = bgColors[theme];
            btn.style.border = `1px solid ${textColors[theme]}`;
            btn.title = theme;
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                if (window._readerEngine?.onThemeChange) window._readerEngine.onThemeChange(theme);
            });
            themeGrid.appendChild(btn);
        });

        // Initialize saved theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const activeThemeBtn = themeGrid.querySelector(`[data-theme="${savedTheme}"]`);
        if (activeThemeBtn) activeThemeBtn.classList.add('active');
    }

    async _logReadingSession(isUnload = false) {
        if (!this.startTime || this._sessionLogged) return;
        if (!this.libraryItemId) {
            console.warn('Cannot log session: library_item_id is not resolved yet');
            return;
        }
        this._sessionLogged = true; // prevent double logging
        const durationSec = Math.floor((Date.now() - this.startTime) / 1000);
        if (durationSec < 10) return; // Don't log trivial opens

        // Default WPM from localStorage or assume 250
        const wpm = parseInt(localStorage.getItem('default_wpm') || '250', 10);
        const wordsCovered = Math.max(1, Math.floor((durationSec / 60) * wpm));
        
        const payload = {
            library_item_id: parseInt(this.libraryItemId, 10),
            duration_sec: durationSec,
            words_covered: wordsCovered,
            progress_pct: parseFloat(this.progressPct || 0.0)
        };

        const token = localStorage.getItem('access_token');
        if (!token) return;

        if (isUnload && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            fetch(`${API_BASE}/reading/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(e => console.error(e));
        } else {
            try {
                await fetch(`${API_BASE}/reading/sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            } catch(e) { console.error('Failed to log session', e); }
        }
    }

    /* ── Fetch content metadata then launch engine ─────── */
    async _fetchAndRender() {
        try {
            const token = localStorage.getItem('access_token');
            
            // Fallback: Resolve library_item_id if not present in URL query
            if (!this.libraryItemId) {
                const libRes = await fetch(`${API_BASE}/library`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (libRes.ok) {
                    const libData = await libRes.json();
                    const matched = (libData.items || []).find(item => item.content_id == this.contentId);
                    if (matched) {
                        this.libraryItemId = matched.id;
                    }
                }
            }

            const res = await fetch(`${API_BASE}/content/${this.contentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) { window.location.href = 'index.html'; return; }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const doc = await res.json();
            document.getElementById('rdr-doc-title').textContent = doc.title || 'Untitled';
            document.title = `Folio – ${doc.title || 'Reader'}`;

            const type = (doc.type || '').toLowerCase();

            if (type === 'epub') {
                document.getElementById('rdr-epub').style.display = 'flex';
                window._readerEngine = new EPUBEngine(doc.file_path, this);
            } else if (type === 'pdf') {
                document.getElementById('rdr-pdf').style.display = 'flex';
                window._readerEngine = new PDFEngine(doc.file_path, this);
            } else {
                // article / url-scraped
                document.getElementById('rdr-article').style.display = 'flex';
                window._readerEngine = new ArticleEngine(doc, this);
            }

            lucide.createIcons();
        } catch (err) {
            showError('Could not load document: ' + err.message);
        }
    }

    /* ── Progress helper ───────────────────────────────── */
    setProgress(pct) {
        this.progressPct = pct;
        if (this.progressEl) this.progressEl.style.width = `${Math.round(pct)}%`;
    }

    /* ── TOC render helper ─────────────────────────────── */
    renderTOC(items) {
        const list = document.getElementById('rdr-toc-list');
        list.innerHTML = '';
        if (!items || items.length === 0) {
            list.innerHTML = '<li class="rdr-toc-empty">No table of contents</li>';
            return;
        }
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.label || 'Section';
            li.addEventListener('click', () => {
                document.getElementById('rdr-sidebar').classList.remove('open');
                if (window._readerEngine?.goTo) window._readerEngine.goTo(item.dest);
            });
            list.appendChild(li);
        });
    }
}

/* ══════════════════════════════════════════════════════════
   EPUB Engine — wraps epub.js
   ══════════════════════════════════════════════════════════ */
class EPUBEngine {
    constructor(url, reader) {
        if (!url) { showError('No file URL for EPUB.'); return; }

        this.reader = reader;
        this.book = ePub(url);
        this.rendition = this.book.renderTo('epub-viewer', {
            width: '100%',
            height: '100%',
            spread: 'none',
        });
        this.rendition.display();

        // Apply initial theme
        const theme = localStorage.getItem('theme') || 'dark';
        this.onThemeChange(theme);

        // Navigation arrows
        document.getElementById('epub-prev').addEventListener('click', () => this.rendition.prev());
        document.getElementById('epub-next').addEventListener('click', () => this.rendition.next());

        // TOC
        this.book.loaded.navigation.then(nav => {
            const items = [];
            const walk = (arr) => arr.forEach(item => {
                items.push({ label: item.label?.trim() || item.href, dest: item.href });
                if (item.subitems?.length) walk(item.subitems);
            });
            walk(nav.toc || []);
            reader.renderTOC(items);
        });

        // Progress
        this.book.ready.then(() => this.book.locations.generate(1200)).then(() => {
            this.rendition.on('relocated', loc => {
                const pct = this.book.locations.percentageFromCfi(loc.start.cfi) * 100;
                reader.setProgress(pct);
            });
        });
    }

    goTo(href) { this.rendition.display(href); }

    onThemeChange(theme) {
        const bg = theme === 'dark' ? '#1F1F1E' : '#efeeee';
        const fg = theme === 'dark' ? '#ffffff' : '#000000';
        this.rendition.themes.register('folio', {
            body: { background: bg + ' !important', color: fg + ' !important' }
        });
        this.rendition.themes.select('folio');
    }

    onFontChange(size) {
        this.rendition.themes.fontSize(`${size}px`);
    }
}

/* ══════════════════════════════════════════════════════════
   PDF Engine — wraps pdf.js
   ══════════════════════════════════════════════════════════ */
class PDFEngine {
    constructor(url, reader) {
        if (!url) { showError('No file URL for PDF.'); return; }

        this.reader  = reader;
        this.doc     = null;
        this.pageNum = 1;
        this.scale   = 1.4;
        this.rendering = false;
        this.pending   = null;

        this.canvas    = document.getElementById('pdf-canvas');
        this.ctx       = this.canvas.getContext('2d');
        this.textLayer = document.getElementById('pdf-text-layer');

        document.getElementById('pdf-prev').addEventListener('click', () => this._prev());
        document.getElementById('pdf-next').addEventListener('click', () => this._next());

        pdfjsLib.getDocument(url).promise.then(pdf => {
            this.doc = pdf;
            document.getElementById('pdf-total').textContent = pdf.numPages;
            this._render(1);
            this._loadTOC();
        }).catch(err => showError('PDF load error: ' + err.message));
    }

    async _render(num) {
        this.rendering = true;
        const page = await this.doc.getPage(num);
        const vp   = page.getViewport({ scale: this.scale });

        this.canvas.width  = vp.width;
        this.canvas.height = vp.height;

        await page.render({ canvasContext: this.ctx, viewport: vp }).promise;

        // Text layer
        const tc = await page.getTextContent();
        this.textLayer.innerHTML = '';
        this.textLayer.style.width  = `${vp.width}px`;
        this.textLayer.style.height = `${vp.height}px`;
        pdfjsLib.renderTextLayer({
            textContent: tc,
            container:   this.textLayer,
            viewport:    vp,
            textDivs:    [],
        });

        this.rendering = false;
        if (this.pending !== null) {
            this._render(this.pending);
            this.pending = null;
        }

        document.getElementById('pdf-cur').textContent = num;
        this.reader.setProgress((num / this.doc.numPages) * 100);
    }

    _queue(num) {
        if (this.rendering) { this.pending = num; }
        else { this._render(num); }
    }

    _prev() { if (this.pageNum > 1)                    { this.pageNum--; this._queue(this.pageNum); } }
    _next() { if (this.pageNum < this.doc.numPages)    { this.pageNum++; this._queue(this.pageNum); } }

    async _loadTOC() {
        const outline = await this.doc.getOutline();
        if (outline) {
            const items = outline.map(o => ({ label: o.title, dest: o.dest }));
            this.reader.renderTOC(items);
        }
    }

    goTo(dest) {
        // dest is a ref array from pdf.js outline
        if (!dest) return;
        this.doc.getPageIndex(dest[0]).then(idx => {
            this.pageNum = idx + 1;
            this._queue(this.pageNum);
        }).catch(() => {});
    }

    onFontChange(size) {
        this.scale = size / 12;
        this._queue(this.pageNum);
    }
}

/* ══════════════════════════════════════════════════════════
   Article Engine — raw_text from scrape
   ══════════════════════════════════════════════════════════ */
class ArticleEngine {
    constructor(doc, reader) {
        const container = document.getElementById('rdr-article-body');

        // Guard: raw_text may be null / undefined
        const rawText = doc.raw_text || doc.title || '';
        const title   = doc.title   || 'Article';
        const author  = doc.author  || '';
        const src     = doc.source_url || '';

        // Build HTML
        let html = `<h1>${title}</h1>`;
        if (author || src) {
            html += `<div class="article-meta">`;
            if (author) html += `<span>${author}</span>`;
            if (author && src) html += ` · `;
            if (src)    html += `<a href="${src}" target="_blank" rel="noopener">${src}</a>`;
            html += `</div>`;
        }

        if (!rawText.trim()) {
            html += `<p style="color:var(--text-light);font-style:italic">No content available for this article.</p>`;
        } else {
            // Simple paragraph split on blank lines
            const paras = rawText.split(/\n{2,}/).filter(p => p.trim());
            paras.forEach(p => {
                html += `<p>${p.replace(/\n/g, '<br>')}</p>`;
            });
        }

        container.innerHTML = html;

        // Progress on scroll
        const scrollEl = document.getElementById('rdr-article');
        scrollEl.addEventListener('scroll', () => {
            const max = scrollEl.scrollHeight - scrollEl.clientHeight;
            if (max > 0) reader.setProgress((scrollEl.scrollTop / max) * 100);
        });
    }

    goTo() {}
    onFontChange() {} // CSS var handles it
    onThemeChange() {}
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
    window.universalReader = new UniversalReader();
});
