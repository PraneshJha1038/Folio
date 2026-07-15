// library.js — Folio Library Page (Redesigned)

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('access_token')) {
        window.location.href = '/';
        return;
    }

    // ─── State ───────────────────────────────────────────────────────────
    let allItems = [];          // local library items
    let currentMode = 'local';  // 'local' | 'global'
    let pendingFile = null;     // File object waiting for visibility selection
    let currentDetailContent = null;  // content obj open in details modal
    let currentDetailLibItem = null;  // library_item obj (null for global)
    let currentUserId = getUserIdFromToken();
    let shelves = [];           // array of shelf objects

    // ─── Theme ───────────────────────────────────────────────────────────
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);

    document.getElementById('btn-theme').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        applyTheme(cur === 'light' ? 'dark' : 'light');
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        document.getElementById('theme-sun').style.display = theme === 'light' ? 'none' : '';
        document.getElementById('theme-moon').style.display = theme === 'light' ? '' : 'none';
    }

    // ─── Modal helpers ───────────────────────────────────────────────────
    function openModal(id) {
        const el = document.getElementById(id);
        if (el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
    }

    // Close on backdrop click or [data-close] button
    document.querySelectorAll('.lib-modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) closeModal(backdrop.id);
        });
    });
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // ─── Add popover ─────────────────────────────────────────────────────
    const addPopover = document.getElementById('add-popover');
    const btnAdd = document.getElementById('btn-add');

    btnAdd.addEventListener('click', e => {
        e.stopPropagation();
        addPopover.classList.toggle('open');
    });

    document.addEventListener('click', e => {
        if (!addPopover.contains(e.target) && e.target !== btnAdd) {
            addPopover.classList.remove('open');
        }
        // Close shelf dropdowns if clicking outside
        if (!e.target.closest('.lib-shelf-dropdown') && !e.target.closest('.lib-card-extra-btn')) {
            document.querySelectorAll('.lib-shelf-dropdown').forEach(d => d.classList.remove('open'));
        }
    });

    // ─── Top Bar Navigation ───────────────────────────────────────────────
    document.getElementById('btn-home').addEventListener('click', () => {
        searchInput.value = '';
        loadLocalLibrary();
    });

    document.getElementById('btn-global').addEventListener('click', () => {
        searchInput.value = '';
        currentMode = 'global';
        updateSearchPlaceholder();
        loadGlobalLibrary();
    });

    document.getElementById('btn-shelves').addEventListener('click', () => {
        openModal('shelves-modal');
        loadShelves();
    });

    document.getElementById('btn-insights').addEventListener('click', () => {
        window.location.href = '/insights';
    });

    document.getElementById('btn-optimize').addEventListener('click', () => {
        openModal('optimize-modal');
    });

    const morePopover = document.getElementById('more-popover');
    document.getElementById('btn-more-options').addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = morePopover.classList.contains('open');
        document.querySelectorAll('.lib-add-popover').forEach(p => p.classList.remove('open'));
        if (!isOpen) morePopover.classList.add('open');
    });

    document.getElementById('pop-bankruptcy').addEventListener('click', () => {
        morePopover.classList.remove('open');
        openBankruptcyModal();
    });

    // Popover rows
    document.getElementById('pop-from-device').addEventListener('click', () => {
        addPopover.classList.remove('open');
        document.getElementById('file-input-hidden').click();
    });

    document.getElementById('pop-from-url').addEventListener('click', () => {
        addPopover.classList.remove('open');
        // Reset the URL modal visibility toggle to 'local'
        setActiveVis(document.querySelector('#url-modal .lib-vis-toggle'), 'local');
        document.getElementById('url-input').value = '';
        openModal('url-modal');
    });

    document.getElementById('pop-from-global').addEventListener('click', () => {
        addPopover.classList.remove('open');
        currentMode = 'global';
        updateSearchPlaceholder();
        loadGlobalLibrary();
    });

    // ─── File input → show visibility modal ──────────────────────────────
    document.getElementById('file-input-hidden').addEventListener('change', e => {
        pendingFile = e.target.files[0];
        if (!pendingFile) return;
        document.getElementById('upload-filename').textContent = pendingFile.name;
        setActiveVis(document.querySelector('#upload-vis-modal .lib-vis-toggle'), 'local');
        openModal('upload-vis-modal');
        e.target.value = ''; // reset so same file can be re-picked
    });

    // Visibility toggle buttons (shared logic)
    document.querySelectorAll('.lib-vis-toggle').forEach(group => {
        group.querySelectorAll('.lib-vis-btn').forEach(btn => {
            btn.addEventListener('click', () => setActiveVis(group, btn.dataset.val));
        });
    });

    function setActiveVis(group, val) {
        group.querySelectorAll('.lib-vis-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.val === val);
        });
    }

    function getActiveVis(group) {
        return group.querySelector('.lib-vis-btn.active')?.dataset.val || 'local';
    }

    // ─── Upload file ──────────────────────────────────────────────────────
    document.getElementById('btn-do-upload').addEventListener('click', async () => {
        if (!pendingFile) return;
        const btn = document.getElementById('btn-do-upload');
        const visGroup = document.querySelector('#upload-vis-modal .lib-vis-toggle');
        const visibility = getActiveVis(visGroup);

        const fd = new FormData();
        fd.append('file', pendingFile);
        fd.append('visibility', visibility);

        btn.textContent = 'Uploading…'; btn.disabled = true;
        try {
            await api.post('/content/upload', fd);
            closeModal('upload-vis-modal');
            pendingFile = null;
            toast('✓ Uploaded and added to your library');
            currentMode = 'local';
            await loadLocalLibrary();
        } catch (_) { /* api shows error */ }
        btn.textContent = 'Upload'; btn.disabled = false;
    });

    // ─── Add from URL ─────────────────────────────────────────────────────
    document.getElementById('btn-do-url').addEventListener('click', async () => {
        const url = document.getElementById('url-input').value.trim();
        if (!url) { toast('Please enter a URL'); return; }
        const btn = document.getElementById('btn-do-url');
        const visGroup = document.querySelector('#url-modal .lib-vis-toggle');
        const visibility = getActiveVis(visGroup);

        btn.textContent = 'Scraping…'; btn.disabled = true;
        try {
            await api.post('/content/url', { url, visibility });
            closeModal('url-modal');
            toast('✓ Article added to your library');
            currentMode = 'local';
            await loadLocalLibrary();
        } catch (_) { /* api shows error */ }
        btn.textContent = 'Scrape & Add'; btn.disabled = false;
    });

    // ─── Profile panel ────────────────────────────────────────────────────
    document.getElementById('btn-profile').addEventListener('click', async () => {
        openModal('profile-panel');
        loadProfilePanel();
    });

    async function loadProfilePanel() {
        try {
            const user = await api.get('/auth/users/me');
            document.getElementById('profile-name-input').value = user.display_name || '';
            document.getElementById('profile-email-display').textContent = user.email;
            document.getElementById('stat-wpm').textContent = user.current_wpm || user.default_wpm || '—';

            try {
                const stats = await api.get('/profile/stats');
                document.getElementById('stat-words').textContent =
                    Number(stats.total_words_read || 0).toLocaleString();
                const hrs = ((stats.total_time_read_sec || 0) / 3600).toFixed(1);
                document.getElementById('stat-time').textContent = hrs + 'h';
            } catch (_) {}
        } catch (_) {}
    }

    document.getElementById('btn-save-name').addEventListener('click', async () => {
        const name = document.getElementById('profile-name-input').value.trim();
        if (!name) return;
        const btn = document.getElementById('btn-save-name');
        btn.textContent = '…'; btn.disabled = true;
        try {
            await api.patch('/auth/users/me', { display_name: name });
            toast('✓ Name updated');
        } catch (_) {}
        btn.textContent = 'Save'; btn.disabled = false;
    });

    // ─── Shelf Management ─────────────────────────────────────────────────
    async function loadShelves() {
        try {
            const res = await api.get('/shelves');
            shelves = res.items || res || [];
            renderShelves();
        } catch (_) {}
    }

    function renderShelves() {
        const container = document.getElementById('shelf-list-container');
        container.innerHTML = '';
        if (shelves.length === 0) {
            container.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;text-align:center;padding:12px;">No shelves yet.</p>';
            return;
        }

        shelves.forEach(shelf => {
            const item = document.createElement('div');
            item.className = 'lib-shelf-item';
            item.innerHTML = `
                <div class="lib-shelf-name" title="${esc(shelf.name)}">${esc(shelf.name)}</div>
                <div class="lib-shelf-actions">
                    <button class="lib-shelf-icon-btn edit" title="Rename" data-id="${shelf.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="lib-shelf-icon-btn view" title="View Books" data-id="${shelf.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                    <button class="lib-shelf-icon-btn delete" title="Delete Shelf" data-id="${shelf.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            `;

            // Rename
            item.querySelector('.edit').addEventListener('click', async () => {
                const newName = prompt('Enter new shelf name:', shelf.name);
                if (!newName || newName === shelf.name) return;
                try {
                    await api.patch(`/shelves/${shelf.id}`, { name: newName });
                    await loadShelves();
                } catch (_) {}
            });

            // View Books
            item.querySelector('.view').addEventListener('click', async () => {
                closeModal('shelves-modal');
                showLoading();
                try {
                    // Fetch items in this shelf
                    const res = await api.get(`/shelves/${shelf.id}/items`);
                    // The backend returns a list of ShelfItem or an object with items.
                    const rawItems = res.items || res || [];
                    const items = rawItems.map(si => si.library_item);
                    allItems = items;
                    currentMode = 'local';
                    searchInput.value = '';
                    renderLocalGrid();
                    toast(`Showing shelf: ${shelf.name}`);
                } catch (_) {
                    showError('Failed to load shelf items.');
                }
            });

            // Delete
            item.querySelector('.delete').addEventListener('click', async () => {
                if (!confirm(`Delete shelf "${shelf.name}"? Books will remain in your library.`)) return;
                try {
                    await api.delete(`/shelves/${shelf.id}`);
                    await loadShelves();
                } catch (_) {}
            });

            container.appendChild(item);
        });
    }

    document.getElementById('btn-new-shelf').addEventListener('click', () => {
        const form = document.getElementById('new-shelf-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        if (form.style.display === 'block') document.getElementById('new-shelf-input').focus();
    });

    document.getElementById('btn-save-new-shelf').addEventListener('click', async () => {
        const input = document.getElementById('new-shelf-input');
        const name = input.value.trim();
        if (!name) return;
        try {
            await api.post('/shelves', { name, sort_order: 0 });
            input.value = '';
            document.getElementById('new-shelf-form').style.display = 'none';
            await loadShelves();
        } catch (_) {}
    });

    document.getElementById('new-shelf-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') document.getElementById('btn-save-new-shelf').click();
    });

    // ─── Search ───────────────────────────────────────────────────────────
    const searchInput = document.getElementById('lib-search');
    searchInput.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        if (currentMode === 'global') {
            clearTimeout(window._searchTimer);
            window._searchTimer = setTimeout(() => loadGlobalLibrary(term), 380);
        } else {
            renderLocalGrid(term);
        }
    });

    // ─── Data loaders ─────────────────────────────────────────────────────
    async function loadLocalLibrary() {
        showLoading();
        try {
            const res = await api.get('/library?limit=80');
            allItems = res.items || [];
            currentMode = 'local';
            renderLocalGrid(searchInput.value.toLowerCase().trim());
        } catch (_) {
            showError('Failed to load library. Is the backend running?');
        }
    }

    async function loadGlobalLibrary(term = '') {
        showLoading();
        try {
            let url = '/content/global?limit=80';
            if (term) url += `&title=${encodeURIComponent(term)}`;
            const res = await api.get(url);
            renderGlobalGrid(res.items || []);
        } catch (_) {
            showError('Failed to load global library.');
        }
    }

    // ─── Renderers ────────────────────────────────────────────────────────
    function renderLocalGrid(term = '') {
        let items = [...allItems];
        if (term) {
            items = items.filter(i => {
                const t = (i.content_source?.title || '').toLowerCase();
                const a = (i.content_source?.author || '').toLowerCase();
                return t.includes(term) || a.includes(term);
            });
        }
        updateSearchPlaceholder(allItems.length);
        const grid = document.getElementById('lib-grid');
        grid.innerHTML = '';

        if (items.length === 0) {
            grid.innerHTML = `
                <div class="lib-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    <p>${term ? 'No books match your search.' : 'Your library is empty.'}</p>
                    <small>${term ? '' : 'Click + to add your first book.'}</small>
                </div>`;
            return;
        }

        items.forEach(item => grid.appendChild(buildLocalCard(item)));
    }

    function renderGlobalGrid(sources) {
        updateSearchPlaceholder(sources.length);
        const grid = document.getElementById('lib-grid');
        grid.innerHTML = '';

        if (sources.length === 0) {
            grid.innerHTML = `<div class="lib-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <p>No public content found.</p></div>`;
            return;
        }

        sources.forEach(cs => grid.appendChild(buildGlobalCard(cs)));
    }

    // ─── Card builders ────────────────────────────────────────────────────
    function buildLocalCard(item) {
        const cs = item.content_source;
        if (!cs) return document.createElement('div');

        const card = document.createElement('div');
        card.className = 'lib-card';

        // Open reader on card click (not on info btn click)
        card.addEventListener('click', e => {
            if (e.target.closest('.lib-card-info-btn')) return;
            window.location.href = `/reader?id=${cs.id}`;
        });

        // Decay Badge
        let decayBadgeHtml = '';
        if (item.decay_percent !== undefined) {
            let decayTier = 'fresh';
            let decayLabel = 'Fresh';
            if (item.decay_percent >= 20 && item.decay_percent < 60) { decayTier = 'aging'; decayLabel = 'Aging'; }
            else if (item.decay_percent >= 60) { decayTier = 'stale'; decayLabel = 'Stale'; }
            
            decayBadgeHtml = `<div class="lib-badge-decay ${decayTier}" title="${esc(cs.time_sensitivity || '')}">
                <div class="decay-dot"></div>${decayLabel}
            </div>`;
        }

        const progressPct = Math.round(item.progress_percent || 0);
        
        const statusHtml = item.is_finished
            ? `<span class="lib-badge-finished">Finished</span>${decayBadgeHtml}`
            : `<span>${progressPct}%</span>${decayBadgeHtml}`;

        // Tags
        let tagsHtml = '';
        if (cs.tags && Array.isArray(cs.tags) && cs.tags.length > 0) {
            tagsHtml = '<div class="lib-card-tags">';
            cs.tags.slice(0, 3).forEach(tag => {
                tagsHtml += `<span class="lib-card-tag">${esc(tag)}</span>`;
            });
            tagsHtml += '</div>';
        }

        card.innerHTML = `
            <div class="lib-card-cover">
                ${cs.cover_image_url
                    ? `<img src="${esc(cs.cover_image_url)}" alt="${esc(cs.title)}" loading="lazy">`
                    : `<div class="lib-card-cover-placeholder">
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                               <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                           </svg>
                       </div>`
                }
                <span class="lib-card-cover-type">${cs.type || 'doc'}</span>
                <button class="lib-card-info-btn" title="Details" tabindex="-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                </button>
                <button class="lib-card-extra-btn btn-worth-it" title="Is it worth it?" tabindex="-1" style="bottom: 54px; right: 8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                </button>
                <button class="lib-card-extra-btn btn-add-shelf" title="Add to Shelf" tabindex="-1" data-lib-item-id="${item.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <div class="lib-shelf-dropdown">
                    <div class="lib-shelf-dropdown-header">
                        <span>Add to Shelf</span>
                        <button title="Create Shelf" class="btn-create-shelf-inline">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                    </div>
                    <div class="lib-shelf-dropdown-list"></div>
                </div>
            </div>
            <div class="lib-card-body">
                <div class="lib-card-title" title="${esc(cs.title)}">${esc(cs.title)}</div>
                ${tagsHtml}
                <div class="lib-card-status">${statusHtml}</div>
            </div>
        `;

        card.querySelector('.lib-card-info-btn').addEventListener('click', e => {
            e.stopPropagation();
            openDetailsModal(cs, item);
        });

        card.querySelector('.btn-worth-it').addEventListener('click', e => {
            e.stopPropagation();
            openWorthItModal(item);
        });

        const extraBtn = card.querySelector('.btn-add-shelf');
        const dropdown = card.querySelector('.lib-shelf-dropdown');
        const list = dropdown.querySelector('.lib-shelf-dropdown-list');

        extraBtn.addEventListener('click', async e => {
            e.stopPropagation();
            // Close other open dropdowns
            document.querySelectorAll('.lib-shelf-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            
            const isOpen = dropdown.classList.contains('open');
            if (isOpen) {
                dropdown.classList.remove('open');
            } else {
                dropdown.classList.add('open');
                // Ensure shelves are loaded
                if (shelves.length === 0) {
                    try {
                        const res = await api.get('/shelves');
                        shelves = res.items || res || [];
                    } catch (_) {}
                }
                // Populate list
                list.innerHTML = '';
                if (shelves.length === 0) {
                    list.innerHTML = '<div style="padding:8px 12px;font-size:0.8rem;color:var(--text-light);">No shelves</div>';
                } else {
                    shelves.forEach(shelf => {
                        const sItem = document.createElement('div');
                        sItem.className = 'lib-shelf-dropdown-item';
                        sItem.textContent = shelf.name;
                        sItem.addEventListener('click', async (ev) => {
                            ev.stopPropagation();
                            try {
                                await api.post(`/shelves/${shelf.id}/items`, { library_item_id: item.id });
                                toast(`Added to "${shelf.name}"`);
                            } catch (error) {
                                if (error.message.includes("already exists")) {
                                    toast(`Already in "${shelf.name}"`);
                                }
                            }
                            dropdown.classList.remove('open');
                        });
                        list.appendChild(sItem);
                    });
                }
            }
        });

        // Inline create shelf
        dropdown.querySelector('.btn-create-shelf-inline').addEventListener('click', async e => {
            e.stopPropagation();
            const name = prompt('Enter new shelf name:');
            if (!name) return;
            try {
                await api.post('/shelves', { name, sort_order: 0 });
                dropdown.classList.remove('open');
                await loadShelves();
                // Reopen to show new shelf
                extraBtn.click();
            } catch (_) {}
        });

        return card;
    }

    function buildGlobalCard(cs) {
        const card = document.createElement('div');
        card.className = 'lib-card';

        // Double-click to add
        card.title = 'Double-click to add to your library';
        card.addEventListener('dblclick', () => addToLibrary(cs.id, cs.title));

        card.innerHTML = `
            <div class="lib-card-cover">
                ${cs.cover_image_url
                    ? `<img src="${esc(cs.cover_image_url)}" alt="${esc(cs.title)}" loading="lazy">`
                    : `<div class="lib-card-cover-placeholder">
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                               <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                           </svg>
                       </div>`
                }
                <span class="lib-card-cover-type">${cs.type || 'doc'}</span>
                <button class="lib-card-info-btn" title="Details" tabindex="-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                </button>
                <button class="lib-card-extra-btn btn-add-library" title="Add to Library" tabindex="-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                </button>
            </div>
            <div class="lib-card-body">
                <div class="lib-card-title" title="${esc(cs.title)}">${esc(cs.title)}</div>
                <div class="lib-card-status" style="color:var(--accent);font-size:0.75rem;">Double-click to add</div>
            </div>
        `;

        card.querySelector('.lib-card-info-btn').addEventListener('click', e => {
            e.stopPropagation();
            openDetailsModal(cs, null);
        });

        card.querySelector('.btn-add-library').addEventListener('click', e => {
            e.stopPropagation();
            addToLibrary(cs.id, cs.title);
        });

        return card;
    }

    // ─── Worth It Modal ───────────────────────────────────────────────────
    async function openWorthItModal(item) {
        const modal = document.getElementById('worth-it-modal');
        const contentDiv = document.getElementById('worth-it-content');
        
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        
        contentDiv.innerHTML = `
            <div class="lib-loading-container">
                <div class="lib-spinner"></div>
                <span id="worth-it-loading-text">Requesting analysis...</span>
            </div>
        `;
        
        try {
            // 1. Trigger the background job
            const res = await api.post('/ai/worth-reading', { content_id: item.content_id });
            const jobId = res.request_id;
            
            document.getElementById('worth-it-loading-text').textContent = 'Analyzing article (this may take a moment)...';
            
            // 2. Poll for completion
            let result = null;
            let attempts = 0;
            while (true) {
                await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
                const jobRes = await api.get(`/ai/jobs/${jobId}`);
                
                if (jobRes.status === 'completed') {
                    result = jobRes.result;
                    break;
                } else if (jobRes.status === 'failed') {
                    throw new Error('Analysis failed.');
                }
                attempts++;
            }
            
            if (!result) throw new Error('Analysis timed out.');
            
            // 3. Render results
            let takeawaysHtml = '';
            if (result.key_takeaways && result.key_takeaways.length > 0) {
                takeawaysHtml = '<ul style="margin: 4px 0 12px 20px; font-size: 0.9rem; color: var(--text-secondary);">';
                result.key_takeaways.forEach(t => {
                    takeawaysHtml += `<li>${esc(t)}</li>`;
                });
                takeawaysHtml += '</ul>';
            }
            
            contentDiv.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Main Idea</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4;">${esc(result.main_idea || 'N/A')}</div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Key Takeaways</div>
                    ${takeawaysHtml}
                </div>
                
                <div style="display: flex; gap: 16px; margin-top: 16px;">
                    <div style="flex: 1; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 600; color: #22c55e; margin-bottom: 4px; font-size: 0.85rem; text-transform: uppercase;">Who should read</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${esc(result.who_should_read || '-')}</div>
                    </div>
                    <div style="flex: 1; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 600; color: #ef4444; margin-bottom: 4px; font-size: 0.85rem; text-transform: uppercase;">Who should skip</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${esc(result.who_should_skip || '-')}</div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error("AI Worth It Error:", error);
            contentDiv.innerHTML = `
                <div style="color: #ef4444; padding: 16px; text-align: center;">
                    Failed to get analysis: ${esc(error.message)}
                </div>
            `;
        }
    }

    // ─── Book Details Modal ───────────────────────────────────────────────
    function openDetailsModal(cs, libItem) {
        currentDetailContent = cs;
        currentDetailLibItem = libItem;

        // Reset
        document.getElementById('btn-worth-it').style.display = (cs.type === 'article' ? '' : 'none');
        document.getElementById('btn-worth-it').onclick = () => openWorthItModal(cs);

        // Cover
        const coverImg = document.getElementById('detail-cover-img');
        const coverPlaceholder = document.getElementById('detail-cover-placeholder');
        if (cs.cover_image_url) {
            coverImg.src = cs.cover_image_url;
            coverImg.style.display = '';
            coverPlaceholder.style.display = 'none';
        } else {
            coverImg.style.display = 'none';
            coverPlaceholder.style.display = '';
        }

        // Title / author
        document.getElementById('detail-title').textContent = cs.title || '';
        document.getElementById('detail-author').textContent = cs.author || '';
        showTitleView();

        // Delete button visibility
        const deleteBtn = document.getElementById('btn-detail-delete');
        const editBtn = document.getElementById('btn-detail-edit');
        const isOwner = cs.owner_id === currentUserId;
        const inLocalLib = libItem !== null;
        
        if (isOwner || inLocalLib) {
            deleteBtn.style.display = '';
            deleteBtn.title = isOwner ? 'Delete content for everyone' : 'Remove from my library';
        } else {
            deleteBtn.style.display = 'none';
        }

        // Hide edit button for global items (not owned and not in local lib, or simply if currentMode == 'global')
        if (currentMode === 'global') {
            editBtn.style.display = 'none';
        } else {
            editBtn.style.display = '';
        }

        // Metadata grid
        populateMetaGrid(cs);

        // Series grid
        populateSeriesGrid(cs);

        // Description
        const descEl = document.getElementById('detail-desc');
        const descSection = document.getElementById('section-desc');
        if (cs.description) {
            descEl.textContent = cs.description;
            descSection.style.display = '';
        } else {
            descSection.style.display = 'none';
        }

        openModal('book-details-modal');
    }

    function populateMetaGrid(cs) {
        const grid = document.getElementById('meta-grid');
        grid.innerHTML = '';

        // Fields to skip in the main loop (handled elsewhere or internal)
        const skipFields = ['id', 'owner_id', 'file_path', 'cover_image_url', 'raw_text', 'word_count', 'series', 'description', 'title', 'author'];
        
        let hasFields = false;

        for (const [key, value] of Object.entries(cs)) {
            if (value === null || value === undefined || value === '') continue;
            if (skipFields.includes(key)) continue;

            hasFields = true;
            const cell = document.createElement('div');
            cell.className = 'lib-meta-cell';

            // Format label (e.g. file_size_bytes -> File Size Bytes, or custom)
            let label = key.replace(/_/g, ' ').replace(/bw/g, l => l.toUpperCase());
            let displayValue = value;

            if (key === 'file_size_bytes') {
                label = 'File Size';
                displayValue = fmtBytes(value);
            } else if (key === 'created_at' || key === 'updated_at') {
                displayValue = fmtDate(value);
            } else if (key === 'format' && typeof value === 'string') {
                displayValue = value.toUpperCase();
            }

            let valueHtml;
            if (key === 'tags' && Array.isArray(value)) {
                valueHtml = value.map(t => `<span class="lib-tag-chip">${esc(t)}</span>`).join('');
            } else {
                valueHtml = `<span class="lib-meta-value">${esc(String(displayValue))}</span>`;
            }

            cell.innerHTML = `<div class="lib-meta-label">${esc(label)}</div>${valueHtml}`;
            grid.appendChild(cell);
        }

        if (!hasFields) {
            grid.innerHTML = '<p style="color:var(--text-light);font-size:0.82rem;grid-column:1/-1;">No metadata available.</p>';
        }
    }

    function populateSeriesGrid(cs) {
        const grid = document.getElementById('series-grid');
        const section = document.getElementById('section-series');
        grid.innerHTML = '';

        if (!cs.series) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        const cell = document.createElement('div');
        cell.className = 'lib-meta-cell';
        cell.innerHTML = `<div class="lib-meta-label">Series</div><span class="lib-meta-value">${esc(cs.series)}</span>`;
        grid.appendChild(cell);
    }

    // Collapsible sections
    document.querySelectorAll('.lib-section-header').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const body = document.getElementById(targetId);
            const chevron = btn.querySelector('.lib-chevron');
            if (!body) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            chevron?.classList.toggle('collapsed', !isHidden);
        });
    });

    // Edit title / cover
    document.getElementById('btn-detail-edit').addEventListener('click', () => {
        if (!currentDetailContent) return;
        document.getElementById('edit-title-input').value = currentDetailContent.title || '';
        showTitleEdit();
    });

    document.getElementById('btn-cancel-title').addEventListener('click', () => {
        // Reset file input if canceled
        document.getElementById('cover-upload-hidden').value = '';
        document.getElementById('btn-upload-cover').textContent = 'Upload Cover Image';
        showTitleView();
    });

    // Cover upload button triggers file picker
    document.getElementById('btn-upload-cover').addEventListener('click', () => {
        document.getElementById('cover-upload-hidden').click();
    });

    document.getElementById('cover-upload-hidden').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('btn-upload-cover').textContent = file.name;
        }
    });

    document.getElementById('btn-save-title').addEventListener('click', async () => {
        if (!currentDetailContent) return;
        const btn = document.getElementById('btn-save-title');
        const newTitle = document.getElementById('edit-title-input').value.trim();
        const coverFile = document.getElementById('cover-upload-hidden').files[0];
        if (!newTitle) return;

        btn.textContent = 'Saving…'; btn.disabled = true;
        try {
            // Update title first if it changed
            if (newTitle !== currentDetailContent.title) {
                const updated = await api.patch(`/content/${currentDetailContent.id}`, { title: newTitle });
                currentDetailContent.title = updated.title;
                document.getElementById('detail-title').textContent = updated.title;
            }

            // Upload cover if provided
            if (coverFile) {
                const fd = new FormData();
                fd.append('file', coverFile);
                const updatedContent = await api.post(`/content/${currentDetailContent.id}/cover`, fd);
                currentDetailContent.cover_image_url = updatedContent.cover_image_url;
            }

            // Update UI cover
            const coverImg = document.getElementById('detail-cover-img');
            const coverPh = document.getElementById('detail-cover-placeholder');
            if (currentDetailContent.cover_image_url) {
                coverImg.src = currentDetailContent.cover_image_url;
                coverImg.style.display = ''; coverPh.style.display = 'none';
            } else {
                coverImg.style.display = 'none'; coverPh.style.display = '';
            }

            // Reset file input
            document.getElementById('cover-upload-hidden').value = '';
            document.getElementById('btn-upload-cover').textContent = 'Upload Cover Image';

            showTitleView();
            await loadLocalLibrary();
        } catch (_) {}
        btn.textContent = 'Save'; btn.disabled = false;
    });

    function showTitleView() {
        document.getElementById('detail-title-view').style.display = '';
        document.getElementById('detail-title-edit').style.display = 'none';
    }
    function showTitleEdit() {
        document.getElementById('detail-title-view').style.display = 'none';
        document.getElementById('detail-title-edit').style.display = '';
    }

    // Delete button
    document.getElementById('btn-detail-delete').addEventListener('click', async () => {
        if (!currentDetailContent) return;
        const cs = currentDetailContent;
        const isOwner = cs.owner_id === currentUserId;
        const libItem = currentDetailLibItem;

        if (isOwner) {
            if (!confirm(`Delete "${cs.title}" for everyone? This cannot be undone.`)) return;
            try {
                await api.delete(`/content/${cs.id}`);
                closeModal('book-details-modal');
                toast('✓ Content deleted');
                await loadLocalLibrary();
            } catch (_) {}
        } else if (libItem) {
            if (!confirm(`Remove "${cs.title}" from your library?`)) return;
            try {
                await api.delete(`/library/${libItem.id}`);
                closeModal('book-details-modal');
                toast('✓ Removed from library');
                await loadLocalLibrary();
            } catch (_) {}
        }
    });

    // ─── Add global item to library ──────────────────────────────────────
    async function addToLibrary(contentId, title) {
        try {
            await api.post('/library', { content_id: contentId });
            toast(`✓ "${title}" added to your library`);
            currentMode = 'local';
            await loadLocalLibrary();
        } catch (_) {}
    }

    // ─── UI helpers ───────────────────────────────────────────────────────
    function showLoading() {
        document.getElementById('lib-grid').innerHTML = `
            <div class="lib-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite;">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
            </div>`;
    }

    function showError(msg) {
        document.getElementById('lib-grid').innerHTML =
            `<div class="lib-empty"><p>${msg}</p></div>`;
    }

    function updateSearchPlaceholder(n) {
        const count = n !== undefined ? n : (currentMode === 'local' ? allItems.length : 0);
        searchInput.placeholder = `Search in ${count} book${count !== 1 ? 's' : ''}…`;
    }

    function toast(msg) {
        const el = document.getElementById('error-toast');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => { el.style.display = 'none'; }, 300);
        }, 3500);
    }

    function getUserIdFromToken() {
        const token = localStorage.getItem('access_token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.sub ? parseInt(payload.sub, 10) : null;
        } catch (_) { return null; }
    }

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function fmtBytes(b) {
        if (!b) return '';
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} kB`;
        return `${(b / 1024 / 1024).toFixed(2)} MB`;
    }

    function fmtDate(iso) {
        try {
            return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch (_) { return iso; }
    }

    // ─── Spinner keyframe (inline) ────────────────────────────────────────
    const spinStyle = document.createElement('style');
    spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(spinStyle);

    // ─── Bootstrap ────────────────────────────────────────────────────────
    updateSearchPlaceholder(0);
    loadLocalLibrary();

    // ─── Guilt Banner ────────────────────────────────────────────────────
    async function loadGuiltBanner() {
        const banner = document.getElementById('guilt-banner');
        const textSpan = document.getElementById('guilt-banner-text');
        const btnClose = document.getElementById('btn-close-guilt');
        
        if (localStorage.getItem('folio_guilt_dismissed')) return;

        try {
            const res = await api.post('/ai/guilt', { threshold_days: 30 });
            const jobId = res.request_id;
            
            let result = null;
            while (true) {
                await new Promise(r => setTimeout(r, 2000));
                const jobRes = await api.get(`/ai/jobs/${jobId}`);
                if (jobRes.status === 'completed') { result = jobRes.result; break; }
                if (jobRes.status === 'failed') break;
            }
            
            if (result && result.prompt) {
                banner.style.display = 'flex';
                textSpan.textContent = result.prompt;
            }
        } catch (e) {
            console.error("AI Guilt Banner Error:", e);
        }

        btnClose.addEventListener('click', () => {
            banner.style.display = 'none';
            localStorage.setItem('folio_guilt_dismissed', 'true');
        });
    }
    loadGuiltBanner();

    // ─── Queue Optimizer Modal ───────────────────────────────────────────
    document.getElementById('btn-do-optimize').addEventListener('click', async () => {
        const minutes = parseInt(document.getElementById('optimize-minutes').value) || 30;
        const inputView = document.getElementById('optimize-input-view');
        const loadingView = document.getElementById('optimize-loading-view');
        const resultsView = document.getElementById('optimize-results-view');
        
        inputView.style.display = 'none';
        resultsView.style.display = 'none';
        loadingView.style.display = 'block';
        
        try {
            const res = await api.post('/ai/queue/optimize', { available_minutes: minutes });
            
            loadingView.style.display = 'none';
            resultsView.style.display = 'block';
            
            const queueList = document.getElementById('optimize-queue-list');
            queueList.innerHTML = '';
            if (res.queue && res.queue.length > 0) {
                res.queue.forEach(item => {
                    const el = document.createElement('div');
                    el.style.border = '1px solid var(--lib-border)';
                    el.style.borderRadius = '8px';
                    el.style.padding = '8px 12px';
                    el.style.cursor = 'pointer';
                    el.innerHTML = `
                        <div style="font-weight: 600; color: var(--text-primary); display:flex; justify-content:space-between;">
                            <span>${esc(item.title)}</span>
                            <span style="color:var(--text-light); font-weight:normal; font-size: 0.8rem;">${Math.round(item.reading_time_minutes)}m</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${esc(item.reason)}</div>
                    `;
                    el.addEventListener('click', () => window.location.href = `/reader?id=${item.id}`);
                    queueList.appendChild(el);
                });
            } else {
                queueList.innerHTML = '<div style="color:var(--text-light); font-size:0.9rem;">No suitable articles found.</div>';
            }
            
            const skippedList = document.getElementById('optimize-skipped-list');
            skippedList.innerHTML = '';
            if (res.skipped && res.skipped.length > 0) {
                res.skipped.forEach(item => {
                    const el = document.createElement('div');
                    el.style.fontSize = '0.8rem';
                    el.innerHTML = `<span style="color:var(--text-primary);">Item #${item.id}</span>: ${esc(item.reason)}`;
                    skippedList.appendChild(el);
                });
            }
            
        } catch (e) {
            console.error("AI Optimizer Error:", e);
            loadingView.style.display = 'none';
            inputView.style.display = 'block';
            toast('Failed to optimize queue: ' + e.message);
        }
    });

    // Reset optimize modal on close
    document.querySelector('[data-close="optimize-modal"]').addEventListener('click', () => {
        document.getElementById('optimize-input-view').style.display = 'block';
        document.getElementById('optimize-loading-view').style.display = 'none';
        document.getElementById('optimize-results-view').style.display = 'none';
    });

    // ─── Backlog Bankruptcy Modal ─────────────────────────────────────────
    let bankruptcyResult = null;

    async function openBankruptcyModal() {
        openModal('bankruptcy-modal');
        
        const loadingView = document.getElementById('bankruptcy-loading-view');
        const resultsView = document.getElementById('bankruptcy-results-view');
        
        loadingView.style.display = 'block';
        resultsView.style.display = 'none';
        
        try {
            const res = await api.post('/ai/bankruptcy', {});
            const jobId = res.request_id;
            
            let attempts = 0;
            let result = null;
            while (true) {
                await new Promise(r => setTimeout(r, 2000));
                const jobRes = await api.get(`/ai/jobs/${jobId}`);
                if (jobRes.status === 'completed') { result = jobRes.result; break; }
                if (jobRes.status === 'failed') throw new Error('Analysis failed.');
                attempts++;
            }
            if (!result) throw new Error('Analysis timed out.');
            
            bankruptcyResult = result;
            loadingView.style.display = 'none';
            resultsView.style.display = 'block';
            
            document.getElementById('bankruptcy-summary').textContent = result.summary || '';
            
            const renderList = (containerId, items) => {
                const container = document.getElementById(containerId);
                container.innerHTML = '';
                if (!items || items.length === 0) {
                    container.innerHTML = '<div style="color:var(--text-light); font-size:0.85rem;">None</div>';
                    return;
                }
                items.forEach(it => {
                    container.innerHTML += `
                        <div style="background: var(--bg-hover); padding: 8px; border-radius: 6px;">
                            <div style="font-weight: 500; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 2px;">${esc(it.title)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${esc(it.reason)}</div>
                        </div>
                    `;
                });
            };
            
            renderList('bankruptcy-keep-list', result.keep);
            
            // result.remove is an object {outdated:[], low_roi:[], redundant:[], topic_mismatch:[]}
            // Flatten all sub-arrays into one list
            const removeFlat = result.remove && typeof result.remove === 'object' && !Array.isArray(result.remove)
                ? Object.values(result.remove).flat()
                : (Array.isArray(result.remove) ? result.remove : []);
            renderList('bankruptcy-remove-list', removeFlat);
            // Store flattened remove list so confirm-delete works correctly
            bankruptcyResult._removeFlat = removeFlat;
            
        } catch (e) {
            console.error("AI Bankruptcy Error:", e);
            closeModal('bankruptcy-modal');
            toast('Bankruptcy analysis failed: ' + e.message);
        }
    }

    document.getElementById('btn-confirm-bankruptcy').addEventListener('click', async () => {
        if (!bankruptcyResult) return;
        
        const removeList = bankruptcyResult._removeFlat || [];
        const idsToRemove = removeList.map(r => r.id || r.article_id).filter(Boolean);
        if (idsToRemove.length === 0) { closeModal('bankruptcy-modal'); return; }
        
        for (const id of idsToRemove) {
            try {
                await api.delete(`/library/${id}`);
            } catch (e) { console.error('Failed to remove item', id); }
        }
        
        closeModal('bankruptcy-modal');
        loadLocalLibrary();
    });

}); // end DOMContentLoaded

