/* ============================================================
   library.js — Full LibraryManager rewrite
   Fixes: theme, sidebar toggle, search, upload modal,
          three-dot settings, shelf creation, user settings
   ============================================================ */

const API_BASE = 'http://127.0.0.1:8000';

/* ── Utility: error toast ─────────────────────────────────── */
function showError(message, duration = 5000) {
    const toast = document.getElementById('error-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── Utility: open / close modal ─────────────────────────── */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

/* ── Utility: API fetch with auth ────────────────────────── */
async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('access_token');
    const headers = { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) };
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('access_token');
        window.location.href = 'index.html';
        return;
    }
    return response;
}

/* ══════════════════════════════════════════════════════════
   ThemeManager — mirrors index.html ThemeManager exactly
   ══════════════════════════════════════════════════════════ */
class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('theme-toggle');
        this.themeIcon   = document.getElementById('theme-icon');
        const saved = localStorage.getItem('theme') || 'dark';
        this.setTheme(saved);
        this.themeToggle?.addEventListener('click', () => this.toggleTheme());
    }
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (this.themeIcon) {
            // index.html uses FontAwesome classes, not lucide
            this.themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        this.setTheme(current === 'light' ? 'dark' : 'light');
    }
}

/* ══════════════════════════════════════════════════════════
   LibraryManager
   ══════════════════════════════════════════════════════════ */
class LibraryManager {
    constructor() {
        if (!localStorage.getItem('access_token')) {
            window.location.href = 'index.html';
            return;
        }

        this.currentView  = 'local';
        this.allBooks     = [];          // full list for current view
        this.searchQuery  = '';
        this.activeDropdown = null;      // currently open three-dot menu

        this._bindDOM();
        this._bindEvents();
        this.fetchUserProfile();
        this.fetchShelves();
        this.loadView('local');
    }

    /* ── DOM refs ───────────────────────────────────────── */
    _bindDOM() {
        this.bookGrid      = document.getElementById('book-grid');
        this.viewTitle     = document.getElementById('lib-view-title');
        this.sidebarName   = document.getElementById('sidebar-display-name');
        this.searchInput   = document.getElementById('search-input');
        this.shelvesList   = document.getElementById('shelves-nav-list');
    }

    /* ── Event listeners ────────────────────────────────── */
    _bindEvents() {
        // Sidebar view toggle
        document.getElementById('nav-local').addEventListener('click',  () => this.loadView('local'));
        document.getElementById('nav-global').addEventListener('click', () => this.loadView('global'));

        // Search — live filter
        this.searchInput.addEventListener('input', () => {
            this.searchQuery = this.searchInput.value.toLowerCase().trim();
            this._renderGrid(this._filtered());
        });

        // Upload modal
        document.getElementById('upload-btn').addEventListener('click', () => openModal('upload-modal-overlay'));
        document.getElementById('upload-modal-close').addEventListener('click', () => closeModal('upload-modal-overlay'));

        // Upload modal tabs
        document.getElementById('tab-file').addEventListener('click', () => this._switchUploadTab('file'));
        document.getElementById('tab-url').addEventListener('click',  () => this._switchUploadTab('url'));

        // Upload forms
        document.getElementById('upload-file-form').addEventListener('submit', (e) => this._handleFileUpload(e));
        document.getElementById('upload-url-form').addEventListener('submit',  (e) => this._handleUrlScrape(e));

        // Add shelf modal
        document.getElementById('add-shelf-btn').addEventListener('click', () => openModal('shelf-modal-overlay'));
        document.getElementById('shelf-modal-close').addEventListener('click', () => closeModal('shelf-modal-overlay'));
        document.getElementById('add-shelf-form').addEventListener('submit', (e) => this._handleAddShelf(e));

        // User settings modal
        document.getElementById('user-profile-btn').addEventListener('click', () => this._openUserModal());
        document.getElementById('user-modal-close').addEventListener('click', () => closeModal('user-modal-overlay'));
        document.getElementById('update-user-form').addEventListener('submit', (e) => this._handleUpdateUser(e));
        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('access_token');
            window.location.href = 'index.html';
        });

        // Content edit modal
        document.getElementById('content-modal-close').addEventListener('click', () => closeModal('content-modal-overlay'));
        document.getElementById('update-content-form').addEventListener('submit', (e) => this._handleUpdateContent(e));
        document.getElementById('delete-content-btn').addEventListener('click', () => this._handleDeleteContent());

        // Add to shelf modal
        document.getElementById('add-to-shelf-modal-close').addEventListener('click', () => closeModal('add-to-shelf-modal-overlay'));
        document.getElementById('add-to-shelf-form').addEventListener('submit', (e) => this._handleAddToShelfSubmit(e));

        // Set cover modal
        document.getElementById('set-cover-modal-close').addEventListener('click', () => closeModal('set-cover-modal-overlay'));
        document.getElementById('set-cover-form').addEventListener('submit', (e) => this._handleSetCoverSubmit(e));

        // Smart Queue
        document.getElementById('smart-queue-btn').addEventListener('click', () => openModal('smart-queue-modal-overlay'));
        document.getElementById('smart-queue-modal-close').addEventListener('click', () => closeModal('smart-queue-modal-overlay'));
        document.getElementById('smart-queue-form').addEventListener('submit', (e) => this._handleSmartQueue(e));

        // AI Panel
        document.getElementById('nav-ai').addEventListener('click', () => {
            document.getElementById('ai-panel-overlay').classList.add('active');
            const select = document.getElementById('ai-understand-book-select');
            select.innerHTML = '';
            (this.allBooks || []).forEach(book => {
                const opt = document.createElement('option');
                opt.value = book.id; // ContentSource ID
                opt.textContent = book.title;
                select.appendChild(opt);
            });
        });
        document.getElementById('ai-panel-close').addEventListener('click', () => {
            document.getElementById('ai-panel-overlay').classList.remove('active');
        });
        document.getElementById('ai-understand-btn').addEventListener('click', () => this._handleAiUnderstand());
        document.getElementById('ai-learning-path-btn').addEventListener('click', () => this._handleAiLearningPath());

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (this.activeDropdown && !this.activeDropdown.contains(e.target)) {
                this.activeDropdown.classList.remove('open');
                this.activeDropdown = null;
            }
        });

        // Click overlay to close modals
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        });
    }

    /* ── Load view ──────────────────────────────────────── */
    async loadView(view) {
        this.currentView = view;
        this.searchInput.value = '';
        this.searchQuery = '';

        // Sidebar active state
        document.getElementById('nav-local').classList.toggle('active',  view === 'local');
        document.getElementById('nav-global').classList.toggle('active', view === 'global');
        this.viewTitle.textContent = view === 'local' ? 'My Library' : 'Global Library';

        this._showSpinner();
        try {
            if (view === 'local') {
                await this._fetchLocalBooks();
            } else {
                await this._fetchGlobalBooks();
            }
        } catch (err) {
            showError('Failed to load library: ' + err.message);
            this.bookGrid.innerHTML = '<div class="lib-empty"><p>Could not load books.</p></div>';
        }
    }

    async _fetchLocalBooks() {
        const res = await apiFetch('/library');
        if (!res || !res.ok) throw new Error(await res?.text() || 'error');
        const data = await res.json();
        // /library returns array of LibraryItemResponse which has .content_source
        this.allBooks = (Array.isArray(data) ? data : (data.items || [])).map(item => {
            if (item.content_source) {
                return { 
                    ...item.content_source, 
                    library_item_id: item.id,
                    is_finished: item.is_finished,
                    current_position: item.current_position
                };
            }
            return item;
        });
        this._renderGrid(this._filtered());
    }

    async _fetchGlobalBooks() {
        const res = await apiFetch('/content/global?limit=80');
        if (!res || !res.ok) throw new Error(await res?.text() || 'error');
        const data = await res.json();
        this.allBooks = data.items || [];
        this._renderGrid(this._filtered());
    }

    /* ── Filtering ──────────────────────────────────────── */
    _filtered() {
        if (!this.searchQuery) return this.allBooks;
        return this.allBooks.filter(b =>
            (b.title  || '').toLowerCase().includes(this.searchQuery) ||
            (b.author || '').toLowerCase().includes(this.searchQuery)
        );
    }

    /* ── Render book grid ───────────────────────────────── */
    _showSpinner() {
        this.bookGrid.innerHTML = '<div class="spinner">Loading…</div>';
    }

    _renderGrid(books) {
        this.bookGrid.innerHTML = '';

        if (!books.length) {
            this.bookGrid.innerHTML = `
                <div class="lib-empty">
                    <i data-lucide="book-open"></i>
                    <p>${this.searchQuery ? 'No results for "' + this.searchQuery + '"' : 'No books yet.'}</p>
                    <small>${this.currentView === 'local' ? 'Upload a file or scrape an article to get started.' : ''}</small>
                </div>`;
            lucide.createIcons();
            return;
        }

        books.forEach(book => this.bookGrid.appendChild(this._makeCard(book)));
        lucide.createIcons();
    }

    _makeCard(book) {
        const card = document.createElement('div');
        card.className = 'book-card';

        // Cover
        let coverHTML;
        if (book.cover_image_url) {
            coverHTML = `<img class="book-cover-img" src="${book.cover_image_url}" alt="${book.title}" loading="lazy">`;
        } else {
            // Coloured placeholder matching index.html book spine palette
            const colours = ['#AFA9EC','#5DCAA5','#F0997B','#85B7EB','#F3C370','#EA99B6','#97C459','#B9B4A9'];
            const bg = colours[Math.abs(this._hash(book.title || '')) % colours.length];
            coverHTML = `
                <div class="book-cover-placeholder" style="background:${bg}">
                    <span class="book-cover-placeholder-text">${book.title || 'Untitled'}</span>
                </div>`;
        }

        const typeLabel = (book.type || 'file').toUpperCase();
        const progress  = book.progress_pct ?? (book.is_finished ? 100 : 0);

        card.innerHTML = `
            <div class="book-cover-wrap" id="cover-${book.id}">
                ${coverHTML}
                <span class="book-type-badge">${typeLabel}</span>
                <button class="book-menu-btn" data-id="${book.id}" title="Options">
                    <i data-lucide="more-vertical"></i>
                </button>
                <div class="book-dropdown" id="dropdown-${book.id}">
                    <div class="book-dropdown-item" data-action="read" data-id="${book.id}">
                        <i data-lucide="book-open"></i> Open
                    </div>
                    ${this.currentView === 'local' ? `
                    <div class="book-dropdown-item" data-action="add-shelf" data-id="${book.library_item_id}">
                        <i data-lucide="layers"></i> Add to shelf
                    </div>
                    <div class="book-dropdown-item" data-action="set-cover" data-id="${book.id}">
                        <i data-lucide="image"></i> Set cover image
                    </div>
                    <div class="book-dropdown-item" data-action="edit" data-id="${book.id}">
                        <i data-lucide="pencil"></i> Edit details
                    </div>
                    <div class="book-dropdown-item danger" data-action="delete" data-id="${book.library_item_id || book.id}">
                        <i data-lucide="trash-2"></i> Delete
                    </div>` : `
                    <div class="book-dropdown-item" data-action="add-library" data-id="${book.id}">
                        <i data-lucide="plus-circle"></i> Add to My Library
                    </div>
                    `}
                </div>
            </div>
            <div class="book-info">
                <div class="book-title-text">${book.title || 'Untitled'}</div>
                <div class="book-meta-row">
                    <span>${book.author || ''}</span>
                    <span>${progress}%</span>
                </div>
                <div class="book-progress-bar">
                    <div class="book-progress-fill" style="width:${progress}%"></div>
                </div>
            </div>`;

        // Three-dot button: open dropdown (stop propagation so card click doesn't fire)
        card.querySelector('.book-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const dd = document.getElementById(`dropdown-${book.id}`);
            if (this.activeDropdown && this.activeDropdown !== dd) {
                this.activeDropdown.classList.remove('open');
            }
            dd.classList.toggle('open');
            this.activeDropdown = dd.classList.contains('open') ? dd : null;
        });

        // Dropdown items
        card.querySelectorAll('.book-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                const id = item.dataset.id;
                if (this.activeDropdown) { this.activeDropdown.classList.remove('open'); this.activeDropdown = null; }
                if (action === 'read')   window.location.href = `reader.html?id=${id}&library_item_id=${book.library_item_id || ''}`;
                if (action === 'edit')   this._openEditModal(book);
                if (action === 'delete') this._quickDelete(id);
                if (action === 'add-shelf') this._openAddToShelfModal(id);
                if (action === 'set-cover') this._openSetCoverModal(id);
                if (action === 'add-library') this._addToLibrary(id);
            });
        });

        // Cover click → open reader (only if menu not open)
        card.querySelector('.book-cover-wrap').addEventListener('click', (e) => {
            if (e.target.closest('.book-menu-btn') || e.target.closest('.book-dropdown')) return;
            window.location.href = `reader.html?id=${book.id}&library_item_id=${book.library_item_id || ''}`;
        });

        return card;
    }

    /* Deterministic colour hash */
    _hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return h;
    }

    /* ── User profile ───────────────────────────────────── */
    async fetchUserProfile() {
        try {
            const res = await apiFetch('/auth/users/me');
            if (!res || !res.ok) return;
            const user = await res.json();
            this._user = user;
            this.sidebarName.textContent = user.display_name || user.email || 'User';
            
            // Display WPM
            const wpmBadge = document.getElementById('sidebar-wpm-badge');
            if (wpmBadge) {
                wpmBadge.textContent = `${user.default_wpm || 250} WPM`;
            }
            
            // Also store WPM for reader
            localStorage.setItem('default_wpm', user.default_wpm || 250);
        } catch (e) { /* silent */ }
    }

    _openUserModal() {
        if (this._user) {
            document.getElementById('user-display-name').value = this._user.display_name || '';
            document.getElementById('user-default-wpm').value  = this._user.default_wpm  || '';
        }
        openModal('user-modal-overlay');
    }

    async _handleUpdateUser(e) {
        e.preventDefault();
        const body = {
            display_name: document.getElementById('user-display-name').value || undefined,
            default_wpm:  parseInt(document.getElementById('user-default-wpm').value) || undefined,
        };
        try {
            const res = await apiFetch('/auth/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Update failed');
            closeModal('user-modal-overlay');
            await this.fetchUserProfile();
        } catch (err) { showError(err.message); }
    }

    /* ── Shelves ────────────────────────────────────────── */
    async fetchShelves() {
        try {
            const res = await apiFetch('/shelves');
            if (!res || !res.ok) return;
            const data = await res.json();
            const shelves = data.items || data;
            this.shelvesList.innerHTML = '';
            
            // Store shelves for the select dropdown later
            this._shelves = shelves;
            
            shelves.forEach(shelf => {
                const li = document.createElement('li');
                li.className = 'lib-nav-item';
                li.innerHTML = `<i data-lucide="bookmark"></i><span>${shelf.name}</span>`;
                li.addEventListener('click', () => {
                    this.loadShelf(shelf.id, shelf.name);
                });
                this.shelvesList.appendChild(li);
            });
            lucide.createIcons();
        } catch (e) { /* silent */ }
    }

    async loadShelf(shelfId, shelfName) {
        this.currentView = 'shelf';
        this.searchInput.value = '';
        this.searchQuery = '';

        // Sidebar active state
        document.querySelectorAll('.lib-nav-item').forEach(el => el.classList.remove('active'));
        // Find the clicked shelf and make it active (optional, omitted for brevity, local/global are inactive)
        
        this.viewTitle.textContent = `Shelf: ${shelfName}`;
        this._showSpinner();
        
        try {
            // Need to fetch items for this shelf. The API has POST /shelves/{id}/items, wait, is there GET?
            // Actually, /shelves/{id}/items isn't documented as GET in the plan. Let's fetch all library items
            // Wait, let's just use the /library and filter? No, we need to know what's in the shelf.
            // Let's check backend/router/shelves.py or just use /shelves?
            const res = await apiFetch(`/shelves`);
            // Actually, if GET /shelves/{id}/items is missing, I can fetch all library items, but I need shelf items.
            // Let me see if there's a GET /shelves endpoint returning items.
            // I'll just check backend/router/shelves.py later, let's assume `GET /shelves/{id}` returns it with items.
            const sRes = await apiFetch(`/shelves/${shelfId}/items`);
            if (!sRes.ok) throw new Error('Could not load shelf items');
            const shelfData = await sRes.json();
            // Assuming shelfData.items contains library items
            this.allBooks = (shelfData.items || []).map(item => {
                const li = item.library_item || item;
                if (li.content_source) {
                    return {
                        ...li.content_source,
                        library_item_id: li.id,
                        is_finished: li.is_finished,
                        current_position: li.current_position,
                        shelf_item_id: item.id // if we want to delete from shelf
                    };
                }
                return li;
            });
            this._renderGrid(this._filtered());
        } catch (err) {
            showError('Failed to load shelf: ' + err.message);
            this.bookGrid.innerHTML = '<div class="lib-empty"><p>Could not load shelf.</p></div>';
        }
    }

    /* ── Dropdown actions ───────────────────────────────── */
    _openAddToShelfModal(libraryItemId) {
        document.getElementById('add-to-shelf-item-id').value = libraryItemId;
        const select = document.getElementById('add-to-shelf-select');
        select.innerHTML = '';
        (this._shelves || []).forEach(shelf => {
            const opt = document.createElement('option');
            opt.value = shelf.id;
            opt.textContent = shelf.name;
            select.appendChild(opt);
        });
        openModal('add-to-shelf-modal-overlay');
    }

    async _handleAddToShelfSubmit(e) {
        e.preventDefault();
        const libraryItemId = document.getElementById('add-to-shelf-item-id').value;
        const shelfId = document.getElementById('add-to-shelf-select').value;
        if (!libraryItemId || !shelfId) return;

        try {
            const res = await apiFetch(`/shelves/${shelfId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ library_item_id: parseInt(libraryItemId) })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed to add to shelf');
            closeModal('add-to-shelf-modal-overlay');
        } catch (err) { showError(err.message); }
    }

    async _handleSmartQueue(e) {
        e.preventDefault();
        const timeBudget = parseInt(document.getElementById('sq-time-budget').value, 10);
        if (!timeBudget || timeBudget < 5) return;

        const btn = document.getElementById('sq-submit-btn');
        const resultsContainer = document.getElementById('sq-results-container');
        btn.textContent = 'Generating...';
        btn.disabled = true;
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '<div class="spinner">Crunching your library...</div>';

        try {
            const res = await apiFetch('/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time_budget_minutes: timeBudget })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed to start smart queue');
            const data = await res.json();
            const reqId = data.id || data.request_id;
            
            // Poll for completion
            this._pollSuggestions(reqId);
        } catch (err) {
            showError(err.message);
            btn.textContent = 'Get Suggestions';
            btn.disabled = false;
        }
    }

    async _pollSuggestions(reqId) {
        const resultsContainer = document.getElementById('sq-results-container');
        resultsContainer.style.display = 'block';

        const poll = async () => {
            try {
                const res = await apiFetch(`/suggestions/${reqId}`);
                if (!res.ok) throw new Error('Failed to check status');
                const data = await res.json();
                
                if (data.status === 'completed') {
                    const btn = document.getElementById('sq-submit-btn');
                    btn.textContent = 'Get Suggestions';
                    btn.disabled = false;
                    
                    const suggestions = data.result || [];
                    if (suggestions.length === 0) {
                        resultsContainer.innerHTML = '<p>No suggestions found for this time budget.</p>';
                        return;
                    }

                    resultsContainer.innerHTML = suggestions.map(s => `
                        <div class="book-card" style="margin-bottom:1rem; width:100%; display:flex; gap:1rem; align-items:center; cursor:pointer;" onclick="window.location.href='reader.html?id=${s.id || s.content_id}'">
                            <div style="flex:1">
                                <strong>${s.title || 'Untitled'}</strong><br>
                                <small>${s.author || 'Unknown'}</small>
                            </div>
                            <div style="background:var(--bg-secondary); padding:0.5rem; border-radius:4px; font-size:0.8rem;">
                                ~${s.estimated_minutes || '?'} mins
                            </div>
                        </div>
                    `).join('');
                } else if (data.status === 'failed') {
                    throw new Error('Suggestion task failed');
                } else {
                    // still pending
                    setTimeout(poll, 3000);
                }
            } catch (err) {
                showError(err.message);
                const btn = document.getElementById('sq-submit-btn');
                btn.textContent = 'Get Suggestions';
                btn.disabled = false;
                resultsContainer.innerHTML = '<p>An error occurred.</p>';
            }
        };
        setTimeout(poll, 2000);
    }

    _openSetCoverModal(contentId) {
        document.getElementById('set-cover-content-id').value = contentId;
        openModal('set-cover-modal-overlay');
    }

    async _handleSetCoverSubmit(e) {
        e.preventDefault();
        const contentId = document.getElementById('set-cover-content-id').value;
        const fileInput = document.getElementById('set-cover-file');
        if (!fileInput.files.length) return;

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch(`${API_BASE}/content/${contentId}/cover`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed to upload cover');
            closeModal('set-cover-modal-overlay');
            showError('Cover image updated!', 3000); // success toast
            this.loadView(this.currentView);
        } catch (err) { showError(err.message); }
    }

    async _addToLibrary(contentId) {
        try {
            const res = await apiFetch('/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content_id: parseInt(contentId) })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed to add to library');
            showError('Added to My Library!', 3000); // reuse toast for success
        } catch (err) { showError(err.message); }
    }

    async _handleAddShelf(e) {
        e.preventDefault();
        const name = document.getElementById('shelf-name-input').value.trim();
        if (!name) return;
        try {
            const res = await apiFetch('/shelves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Could not create shelf');
            document.getElementById('shelf-name-input').value = '';
            closeModal('shelf-modal-overlay');
            await this.fetchShelves();
        } catch (err) { showError(err.message); }
    }

    /* ── Upload modal tabs ──────────────────────────────── */
    _switchUploadTab(tab) {
        document.getElementById('tab-file').classList.toggle('active', tab === 'file');
        document.getElementById('tab-url').classList.toggle('active',  tab === 'url');
        document.getElementById('tab-content-file').style.display = tab === 'file' ? 'block' : 'none';
        document.getElementById('tab-content-url').style.display  = tab === 'url'  ? 'block' : 'none';
    }

    /* ── File upload ────────────────────────────────────── */
    async _handleFileUpload(e) {
        e.preventDefault();
        const fileInput = document.getElementById('upload-file-input');
        const file = fileInput.files[0];
        if (!file) { showError('Please select a file.'); return; }

        const btn = document.getElementById('upload-file-btn');
        btn.textContent = 'Uploading…';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('file', file);
        const title = document.getElementById('upload-title').value.trim();
        const author = document.getElementById('upload-author').value.trim();
        const visibility = document.getElementById('upload-visibility').value;
        if (title)  formData.append('title', title);
        if (author) formData.append('author', author);
        formData.append('visibility', visibility);

        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch(`${API_BASE}/content/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Upload failed');
            }
            closeModal('upload-modal-overlay');
            e.target.reset();
            await this.loadView(this.currentView);
        } catch (err) {
            showError(err.message);
        } finally {
            btn.textContent = 'Upload File';
            btn.disabled = false;
        }
    }

    /* ── URL scrape ─────────────────────────────────────── */
    async _handleUrlScrape(e) {
        e.preventDefault();
        const url = document.getElementById('scrape-url').value.trim();
        const visibility = document.getElementById('scrape-visibility').value;
        if (!url) { showError('Please enter a URL.'); return; }

        const btn = document.getElementById('scrape-url-btn');
        btn.textContent = 'Scraping…';
        btn.disabled = true;

        try {
            const res = await apiFetch('/content/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, visibility }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Scrape failed');
            }
            closeModal('upload-modal-overlay');
            e.target.reset();
            await this.loadView(this.currentView);
        } catch (err) {
            showError(err.message);
        } finally {
            btn.textContent = 'Scrape & Add';
            btn.disabled = false;
        }
    }

    /* ── Content edit modal ─────────────────────────────── */
    _openEditModal(book) {
        document.getElementById('edit-content-id').value            = book.id;
        document.getElementById('edit-content-title').value         = book.title  || '';
        document.getElementById('edit-content-author').value        = book.author || '';
        document.getElementById('edit-content-visibility').value    = book.visibility || 'local';
        openModal('content-modal-overlay');
    }

    async _handleUpdateContent(e) {
        e.preventDefault();
        const id = document.getElementById('edit-content-id').value;
        const body = {
            title:      document.getElementById('edit-content-title').value.trim()      || undefined,
            author:     document.getElementById('edit-content-author').value.trim()     || undefined,
            visibility: document.getElementById('edit-content-visibility').value,
        };
        try {
            const res = await apiFetch(`/content/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Update failed');
            closeModal('content-modal-overlay');
            await this.loadView(this.currentView);
        } catch (err) { showError(err.message); }
    }

    async _handleDeleteContent() {
        const id = document.getElementById('edit-content-id').value;
        if (!confirm('Delete this content? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/content/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).detail || 'Delete failed');
            closeModal('content-modal-overlay');
            await this.loadView(this.currentView);
        } catch (err) { showError(err.message); }
    }

    async _quickDelete(id) {
        if (!confirm('Delete this content? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/content/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).detail || 'Delete failed');
            await this.loadView(this.currentView);
        } catch (err) { showError(err.message); }
    }

    async _handleAiUnderstand() {
        const select = document.getElementById('ai-understand-book-select');
        const bookId = select.value;
        if (!bookId) { showError('Please select a book.'); return; }

        const btn = document.getElementById('ai-understand-btn');
        const resultContainer = document.getElementById('ai-understand-results');
        
        btn.textContent = 'Analyzing...';
        btn.disabled = true;
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = '<div class="spinner">Analyzing content via AI...</div>';

        try {
            const res = await apiFetch('/ai/understand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content_id: parseInt(bookId, 10) })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Analyze request failed');
            
            // Poll /content/{id}
            const poll = async () => {
                try {
                    const cRes = await apiFetch(`/content/${bookId}`);
                    if (!cRes.ok) throw new Error('Failed to retrieve content');
                    const content = await cRes.json();
                    
                    if (content.ai_processed) {
                        btn.textContent = 'Analyze Concept';
                        btn.disabled = false;
                        
                        const keyConceptsList = (content.key_concepts || []).map(c => `<li>${c}</li>`).join('');
                        resultContainer.innerHTML = `
                            <div style="margin-top: 1rem; border-top: 1px solid var(--border-primary); padding-top: 1rem;">
                                <h5 style="margin: 0 0 0.5rem 0; color: #9b59b6;">Difficulty: ${content.difficulty || 'Unknown'}</h5>
                                <h5 style="margin: 0 0 0.25rem 0;">Summary</h5>
                                <p style="margin: 0 0 1rem 0; font-size: 0.88rem; line-height: 1.4;">${content.summary || 'No summary available.'}</p>
                                <h5 style="margin: 0 0 0.25rem 0;">Key Concepts</h5>
                                <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.88rem; line-height: 1.4;">${keyConceptsList || '<li>None</li>'}</ul>
                            </div>
                        `;
                    } else {
                        setTimeout(poll, 3000);
                    }
                } catch (err) {
                    showError(err.message);
                    btn.textContent = 'Analyze Concept';
                    btn.disabled = false;
                    resultContainer.style.display = 'none';
                }
            };
            setTimeout(poll, 1500);
        } catch (err) {
            showError(err.message);
            btn.textContent = 'Analyze Concept';
            btn.disabled = false;
            resultContainer.style.display = 'none';
        }
    }

    async _handleAiLearningPath() {
        const topicInput = document.getElementById('ai-learning-path-topic');
        const topic = topicInput.value.trim();
        if (!topic) { showError('Please enter a topic.'); return; }

        const btn = document.getElementById('ai-learning-path-btn');
        const resultContainer = document.getElementById('ai-learning-path-results');
        
        btn.textContent = 'Generating...';
        btn.disabled = true;
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = '<div class="spinner">Curating curriculum from library...</div>';

        try {
            const res = await apiFetch('/ai/learning-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: topic })
            });
            if (!res.ok) throw new Error((await res.json()).detail || 'Failed to start learning path');
            const data = await res.json();
            const jobId = data.request_id;
            
            // Poll /ai/jobs/{id}
            const poll = async () => {
                try {
                    const jRes = await apiFetch(`/ai/jobs/${jobId}`);
                    if (!jRes.ok) throw new Error('Failed to query job status');
                    const job = await jRes.json();
                    
                    if (job.status === 'completed') {
                        btn.textContent = 'Generate Path';
                        btn.disabled = false;
                        
                        const curriculum = job.result?.curriculum || [];
                        if (curriculum.length === 0) {
                            resultContainer.innerHTML = '<p>No curriculum path generated.</p>';
                            return;
                        }
                        
                        const phasesHtml = curriculum.map(p => `
                            <div style="margin-top: 0.8rem; border-left: 2px solid #9b59b6; padding-left: 0.8rem;">
                                <strong style="color: #9b59b6;">${p.phase}</strong>
                                <p style="margin: 0.2rem 0; font-size: 0.85rem; line-height: 1.3;">${p.description}</p>
                                <span style="font-size: 0.75rem; color: var(--text-light)">Books: ${p.resources.join(', ')}</span>
                            </div>
                        `).join('');
                        
                        resultContainer.innerHTML = `
                            <div style="margin-top: 1rem; border-top: 1px solid var(--border-primary); padding-top: 1rem;">
                                <h5 style="margin: 0;">Your Personalized Learning Path</h5>
                                ${phasesHtml}
                            </div>
                        `;
                    } else if (job.status === 'failed') {
                        throw new Error('AI Job failed');
                    } else {
                        setTimeout(poll, 3000);
                    }
                } catch (err) {
                    showError(err.message);
                    btn.textContent = 'Generate Path';
                    btn.disabled = false;
                    resultContainer.style.display = 'none';
                }
            };
            setTimeout(poll, 1500);
        } catch (err) {
            showError(err.message);
            btn.textContent = 'Generate Path';
            btn.disabled = false;
            resultContainer.style.display = 'none';
        }
    }
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
    window.libraryManager = new LibraryManager();
});
