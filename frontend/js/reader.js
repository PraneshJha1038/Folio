console.log("reader.js script loaded into browser.");

// --- State Variables ---
let contentId = null;
let libraryItemId = null;
let contentData = null;
let totalPages = 1;
let currentPage = 1;
let annotations = [];
let bookmarks = [];
let pseudoTOC = [];
let sessionStartTime = null;
let isVerticalMode = false;

// --- DOM Elements ---
const DOM = {
    // Ribbons
    topRibbon: document.getElementById('top-ribbon'),
    bottomRibbon: document.getElementById('bottom-ribbon'),
    
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    sidebarCover: document.getElementById('sidebar-cover'),
    sidebarTitle: document.getElementById('sidebar-title'),
    sidebarAuthor: document.getElementById('sidebar-author'),
    
    // Sidebar Lists
    listHyperlinks: document.getElementById('list-hyperlinks'),
    listAnnotations: document.getElementById('list-annotations'),
    listBookmarks: document.getElementById('list-bookmarks'),
    
    // Reading Surface
    contentContainer: document.getElementById('content-container'),
    
    // Progress
    ribbonProgress: document.getElementById('ribbon-progress'),
    fixedProgressFill: document.getElementById('progress-fill'),
    statPages: document.getElementById('stat-pages'),
    statTime: document.getElementById('stat-time'),
    statPercent: document.getElementById('stat-percent'),
    
    // Modals
    settingsModal: document.getElementById('settings-modal'),
    themeDropdown: document.getElementById('theme-dropdown'),
    customThemeModal: document.getElementById('custom-theme-modal'),
    
    // Ribbon buttons
    btnSidebarToggleTop: document.getElementById('btn-ribbon-sidebar'),
    btnSidebarToggleSide: document.getElementById('btn-sidebar-toggle'),
    btnSettings: document.getElementById('btn-settings'),
    btnTheme: document.getElementById('btn-theme'),
    btnPageFirst: document.getElementById('btn-page-first'),
    btnPagePrev: document.getElementById('btn-page-prev'),
    btnPageNext: document.getElementById('btn-page-next'),
    btnPageLast: document.getElementById('btn-page-last'),
    selReadingMode: document.getElementById('sel-reading-mode'),
    btnAiUnderstand: document.getElementById('btn-ai-understand'),
    btnSidebarInfo: document.getElementById('btn-sidebar-info'),
    
    // AI Modal
    aiUnderstandModal: document.getElementById('ai-understand-modal'),
    btnCloseAi: document.getElementById('btn-close-ai'),
    aiUnderstandText: document.getElementById('ai-understand-text'),
    
    // Details Modal
    bookDetailsModal: document.getElementById('book-details-modal'),
    btnCloseDetails: document.getElementById('btn-close-details'),
    detailsText: document.getElementById('details-text'),
};

// --- Initialization ---
async function initReader() {
    console.log("initReader started");
    const params = new URLSearchParams(window.location.search);
    contentId = parseInt(params.get('id'));
    console.log("Parsed contentId:", contentId);
    
    if (!contentId) {
        console.error("No content ID provided in URL!");
        document.getElementById('reader-title').textContent = "No book selected";
        DOM.sidebarTitle.textContent = "No book selected";
        DOM.sidebarAuthor.textContent = "Please open a book from the library.";
        DOM.contentContainer.innerHTML = '<div style="padding: 40px; text-align: center;"><h2>No book selected.</h2><p>Please return to the library and select a book to read.</p></div>';
        return;
    }

    loadSettings();
    applySettingsToCSS();
    
    sessionStartTime = Date.now();
    
    document.getElementById('reader-title').textContent = "Loading book...";
    
    try {
        // Find library item for this content
        console.log("Fetching library items to find libItem...");
        const libRes = await api.get('/library?limit=80');
        console.log("libRes:", libRes);
        const items = libRes.items || libRes || [];
        const libItem = items.find(i => i.content_source && i.content_source.id === contentId);
        
        if (libItem) {
            console.log("Found local library item:", libItem.id);
            libraryItemId = libItem.id;
            contentData = libItem.content_source;
            window.initialProgress = libItem.progress_percent || 0;
        } else {
            console.log("Item not in local library. Fetching global items...");
            // Might be a global item, but we can't save reading sessions or bookmarks without a library_item_id
            // For this implementation, we require it to be in local library, but let's try to fetch it from global just in case
            const globRes = await api.get('/content/global?limit=80');
            console.log("globRes:", globRes);
            const globItems = globRes.items || globRes || [];
            contentData = globItems.find(c => c.id === contentId);
            if (!contentData) {
                console.error("Content not found globally either.");
                throw new Error("Content not found.");
            }
        }
        
        console.log("contentData resolved:", contentData.title);
        document.getElementById('reader-title').textContent = contentData.title;
        DOM.sidebarTitle.textContent = contentData.title;
        DOM.sidebarAuthor.textContent = contentData.author || 'Unknown Author';
        if (contentData.cover_image_url) {
            DOM.sidebarCover.src = contentData.cover_image_url;
            DOM.sidebarCover.classList.remove('hidden');
        }

        console.log("Calling renderContent()...");
        renderContent();
        
        if (libraryItemId) {
            console.log("Fetching annotations...");
            await fetchAnnotationsAndBookmarks();
            // Start listening for page unload to save session
            window.addEventListener('beforeunload', saveReadingSession);
        }
        console.log("initReader completed successfully.");
        
    } catch (e) {
        console.error("Error inside initReader try-catch:", e);
        document.getElementById('reader-title').textContent = "Error loading book.";
    }
}

function renderContent() {
    const rawText = contentData.raw_text || "No text available.";
    pseudoTOC = [];
    
    const isHtml = contentData.type === 'epub' || contentData.type === 'pdf' || rawText.trim().startsWith('<') || /<[a-z][\s\S]*>/i.test(rawText);
    
    if (isHtml) {
        DOM.contentContainer.innerHTML = rawText;
        
        // Scan for headings to populate TOC
        const headings = DOM.contentContainer.querySelectorAll('h1, h2, h3, h4, .pdf-outline');
        headings.forEach((h, index) => {
            if (!h.id) {
                h.id = `heading-${index}`;
            }
            const label = h.textContent.trim();
            if (label) {
                pseudoTOC.push({ label: label, id: h.id });
            }
        });
    } else {
        // Plain text parsing
        const paragraphs = rawText.split('\n\n').filter(p => p.trim());
        let html = '';
        paragraphs.forEach((p, index) => {
            if (/^chapter\s+\d+/i.test(p.trim()) || /^part\s+\d+/i.test(p.trim())) {
                html += `<h2 id="chap-${index}">${p.trim()}</h2>`;
                pseudoTOC.push({ label: p.trim(), id: `chap-${index}` });
            } else {
                html += `<p>${p.trim()}</p>`;
            }
        });
        DOM.contentContainer.innerHTML = html;
    }
    
    // Need a slight delay to allow CSS multi-column to calculate layout
    setTimeout(() => {
        calculatePagination();
        renderTOC();
        
        if (window.initialProgress) {
            const targetPage = Math.max(1, Math.min(totalPages, Math.round((window.initialProgress / 100) * (totalPages - 1)) + 1));
            goToPage(targetPage);
            window.initialProgress = null; // Clear it so we don't jump again on resize
        }
    }, 100);
}

// --- Layout & Pagination ---
function calculatePagination() {
    const container = DOM.contentContainer;
    if (isVerticalMode) {
        totalPages = Math.ceil(container.scrollHeight / container.clientHeight) || 1;
    } else {
        totalPages = Math.ceil(container.scrollWidth / container.clientWidth) || 1;
    }
    
    // Keep current page in bounds
    if (currentPage > totalPages) currentPage = totalPages;
    
    updateProgressUI();
}

function goToPage(pageIndex) {
    if (pageIndex < 1) pageIndex = 1;
    if (pageIndex > totalPages) pageIndex = totalPages;
    currentPage = pageIndex;
    
    const container = DOM.contentContainer;
    
    if (isVerticalMode) {
        const clientHeight = container.clientHeight;
        const maxScroll = container.scrollHeight - clientHeight;
        let targetScroll = (currentPage - 1) * clientHeight;
        targetScroll = Math.min(targetScroll, maxScroll);
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    } else {
        const clientWidth = container.clientWidth;
        container.scrollTo({ left: (currentPage - 1) * clientWidth, behavior: 'smooth' });
    }
    
    updateProgressUI();
}

DOM.contentContainer.addEventListener('scroll', () => {
    const container = DOM.contentContainer;
    if (isVerticalMode) {
        const calculatedPage = Math.round(container.scrollTop / container.clientHeight) + 1;
        if (calculatedPage !== currentPage && calculatedPage >= 1 && calculatedPage <= totalPages) {
            currentPage = calculatedPage;
        }
        updateProgressUI();
    } else {
        const calculatedPage = Math.round(container.scrollLeft / container.clientWidth) + 1;
        if (calculatedPage !== currentPage && calculatedPage >= 1 && calculatedPage <= totalPages) {
            currentPage = calculatedPage;
            updateProgressUI();
        }
    }
});

function updateProgressUI() {
    let pct = 0;
    if (isVerticalMode) {
        const { scrollTop, scrollHeight, clientHeight } = DOM.contentContainer;
        pct = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 100;
        DOM.statPages.textContent = "Scroll mode";
    } else {
        pct = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100;
        const remaining = totalPages - currentPage;
        DOM.statPages.textContent = `${remaining} pages left in book`;
    }
    
    // Fixed bottom bar
    DOM.fixedProgressFill.style.width = `${pct}%`;
    DOM.statPercent.textContent = `${Math.round(pct)}%`;
    
    // Ribbon slider
    DOM.ribbonProgress.value = pct;
    
    updateClock();
}

function updateClock() {
    const is24h = localStorage.getItem('folio_reader_24h') === 'true';
    const now = new Date();
    let hours = now.getHours();
    let mins = now.getMinutes().toString().padStart(2, '0');
    let timeStr = '';
    
    if (is24h) {
        timeStr = `${hours.toString().padStart(2, '0')}:${mins}`;
    } else {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        timeStr = `${hours}:${mins} ${ampm}`;
    }
    DOM.statTime.textContent = timeStr;
}
setInterval(updateClock, 60000);

// Resize listener recalculates pagination
window.addEventListener('resize', () => {
    calculatePagination();
    goToPage(currentPage);
});

// --- Ribbon Interaction (Hover to show) ---
let ribbonTimeout;
function showRibbons() {
    DOM.topRibbon.classList.remove('hidden');
    DOM.bottomRibbon.classList.remove('hidden');
    
    clearTimeout(ribbonTimeout);
    ribbonTimeout = setTimeout(() => {
        // Auto hide after 3 seconds if not interacting
        hideRibbons();
    }, 3000);
}

function hideRibbons() {
    // Don't hide if settings or theme popup is open
    if (!DOM.settingsModal.classList.contains('hidden') || !DOM.themeDropdown.classList.contains('hidden')) {
        return;
    }
    DOM.topRibbon.classList.add('hidden');
    DOM.bottomRibbon.classList.add('hidden');
}

document.addEventListener('mousemove', (e) => {
    // Only show ribbons if hovering near top (60px) or bottom (60px)
    if (e.clientY < 60 || e.clientY > window.innerHeight - 60) {
        showRibbons();
    }
});
document.addEventListener('click', showRibbons);

[DOM.topRibbon, DOM.bottomRibbon].forEach(rib => {
    rib.addEventListener('mouseenter', () => clearTimeout(ribbonTimeout));
    rib.addEventListener('mouseleave', () => ribbonTimeout = setTimeout(hideRibbons, 2000));
});

// --- Sidebar Interaction ---
let isSidebarOpen = true;

function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    if (isSidebarOpen) {
        DOM.sidebar.classList.add('docked');
        document.body.classList.add('sidebar-open');
        DOM.btnSidebarToggleTop.style.display = 'none'; // Hide from ribbon
    } else {
        DOM.sidebar.classList.remove('docked');
        document.body.classList.remove('sidebar-open');
        DOM.btnSidebarToggleTop.style.display = 'inline-flex'; // Show in ribbon
    }
    // Need to recalculate pages since width changed
    setTimeout(() => {
        calculatePagination();
        goToPage(currentPage);
    }, 350);
}

DOM.btnSidebarToggleTop.addEventListener('click', toggleSidebar);
DOM.btnSidebarToggleSide.addEventListener('click', toggleSidebar);

// Initialize sidebar state
if (isSidebarOpen) {
    document.body.classList.add('sidebar-open');
    DOM.btnSidebarToggleTop.style.display = 'none';
}

// Sidebar Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sidebar-list').forEach(l => l.classList.add('hidden'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.remove('hidden');
    });
});

// --- Settings & Themes ---
function loadSettings() {
    // Theme
    const savedTheme = localStorage.getItem('folio_reader_theme') || 'default';
    document.body.setAttribute('data-theme', savedTheme);
    
    // Custom theme variables
    if (savedTheme === 'custom') {
        document.body.style.setProperty('--custom-bg', localStorage.getItem('folio_custom_bg') || '#1F1F1E');
        document.body.style.setProperty('--custom-text', localStorage.getItem('folio_custom_text') || '#FFF');
        document.body.style.setProperty('--custom-link', localStorage.getItem('folio_custom_link') || '#AFA9EC');
    }

    // Typography & Layout
    const getS = (k, def) => localStorage.getItem('folio_reader_' + k) || def;
    
    document.getElementById('val-font-size').textContent = getS('fontsize', '18') + 'px';
    document.getElementById('val-font-weight').textContent = getS('fontweight', '400');
    document.getElementById('sel-font-face').value = getS('fontface', 'Lora');
    
    document.getElementById('val-pmargin').textContent = getS('pmargin', '1.2');
    document.getElementById('val-lspace').textContent = getS('lspace', '1.6');
    document.getElementById('val-tmargin').textContent = getS('tmargin', '60') + 'px';
    document.getElementById('val-bmargin').textContent = getS('bmargin', '60') + 'px';
    document.getElementById('val-lmargin').textContent = getS('lmargin', '80') + 'px';
    document.getElementById('val-rmargin').textContent = getS('rmargin', '80') + 'px';
    
    document.getElementById('chk-24h').checked = getS('24h', 'false') === 'true';
    
    if (DOM.selReadingMode) DOM.selReadingMode.value = getS('mode', 'horizontal');
    const savedWidth = getS('sidebar_width', '320px');
    document.documentElement.style.setProperty('--sidebar-width', savedWidth);
}

function applySettingsToCSS() {
    try {
        const root = document.documentElement;
        const getV = (id) => parseFloat(document.getElementById(id).textContent);
        
        root.style.setProperty('--u-font-size', getV('val-font-size') + 'px');
        root.style.setProperty('--u-font-weight', getV('val-font-weight'));
        
        let fontFace = document.getElementById('sel-font-face').value;
        root.style.setProperty('--u-font-family', `"${fontFace}", serif`);
        
        root.style.setProperty('--u-p-margin', getV('val-pmargin') + 'em');
        root.style.setProperty('--u-line-height', getV('val-lspace'));
        
        root.style.setProperty('--u-t-margin', getV('val-tmargin') + 'px');
        root.style.setProperty('--u-b-margin', getV('val-bmargin') + 'px');
        root.style.setProperty('--u-l-margin', getV('val-lmargin') + 'px');
        root.style.setProperty('--u-r-margin', getV('val-rmargin') + 'px');
        
        // Save to local storage
        localStorage.setItem('folio_reader_fontsize', getV('val-font-size'));
        localStorage.setItem('folio_reader_fontweight', getV('val-font-weight'));
        localStorage.setItem('folio_reader_fontface', fontFace);
        localStorage.setItem('folio_reader_pmargin', getV('val-pmargin'));
        localStorage.setItem('folio_reader_lspace', getV('val-lspace'));
        localStorage.setItem('folio_reader_tmargin', getV('val-tmargin'));
        localStorage.setItem('folio_reader_bmargin', getV('val-bmargin'));
        localStorage.setItem('folio_reader_lmargin', getV('val-lmargin'));
        localStorage.setItem('folio_reader_rmargin', getV('val-rmargin'));
        localStorage.setItem('folio_reader_24h', document.getElementById('chk-24h').checked);
        
        if (DOM.selReadingMode) {
            const readingMode = DOM.selReadingMode.value;
            if (readingMode === 'vertical') {
                DOM.contentContainer.classList.add('vertical-mode');
                isVerticalMode = true;
            } else {
                DOM.contentContainer.classList.remove('vertical-mode');
                isVerticalMode = false;
            }
            localStorage.setItem('folio_reader_mode', readingMode);
        }
        
        // Capture current relative progress
        const pct = totalPages > 1 ? (currentPage - 1) / (totalPages - 1) : 0;
        
        // Recalculate pagination after a delay
        setTimeout(() => {
            calculatePagination();
            const targetPage = Math.max(1, Math.min(totalPages, Math.round(pct * (totalPages - 1)) + 1));
            goToPage(targetPage);
        }, 100);
    } catch(e) {
        console.error("Error applying settings", e);
    }
}

// Stepper setup helper
function setupStepper(decBtnId, incBtnId, valId, step, min, max) {
    const valSpan = document.getElementById(valId);
    document.getElementById(decBtnId).addEventListener('click', () => {
        let val = parseFloat(valSpan.textContent);
        val = Math.max(min, val - step);
        valSpan.textContent = step < 1 ? val.toFixed(1) : Math.round(val);
        applySettingsToCSS();
    });
    document.getElementById(incBtnId).addEventListener('click', () => {
        let val = parseFloat(valSpan.textContent);
        val = Math.min(max, val + step);
        valSpan.textContent = step < 1 ? val.toFixed(1) : Math.round(val);
        applySettingsToCSS();
    });
}

setupStepper('btn-font-dec', 'btn-font-inc', 'val-font-size', 1, 10, 48);
setupStepper('btn-weight-dec', 'btn-weight-inc', 'val-font-weight', 100, 100, 900);
document.getElementById('sel-font-face').addEventListener('change', applySettingsToCSS);

setupStepper('btn-pmargin-dec', 'btn-pmargin-inc', 'val-pmargin', 0.1, 0, 4);
setupStepper('btn-lspace-dec', 'btn-lspace-inc', 'val-lspace', 0.1, 1, 3);
setupStepper('btn-tmargin-dec', 'btn-tmargin-inc', 'val-tmargin', 5, 0, 200);
setupStepper('btn-bmargin-dec', 'btn-bmargin-inc', 'val-bmargin', 5, 0, 200);
setupStepper('btn-lrmargin-dec', 'btn-lrmargin-inc', 'val-lmargin', 5, 0, 200);
setupStepper('btn-rrmargin-dec', 'btn-rrmargin-inc', 'val-rmargin', 5, 0, 200);
document.getElementById('chk-24h').addEventListener('change', () => {
    applySettingsToCSS();
    updateClock();
});
if (DOM.selReadingMode) {
    DOM.selReadingMode.addEventListener('change', applySettingsToCSS);
}

// Modals
DOM.btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.settingsModal.classList.toggle('hidden');
    DOM.themeDropdown.classList.add('hidden');
});

DOM.btnTheme.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.themeDropdown.classList.toggle('hidden');
    DOM.settingsModal.classList.add('hidden');
});

document.addEventListener('click', (e) => {
    if (!DOM.settingsModal.contains(e.target) && !DOM.btnSettings.contains(e.target)) {
        DOM.settingsModal.classList.add('hidden');
    }
    if (!DOM.themeDropdown.contains(e.target) && !DOM.btnTheme.contains(e.target)) {
        DOM.themeDropdown.classList.add('hidden');
    }
    if (DOM.aiUnderstandModal && !DOM.aiUnderstandModal.contains(e.target) && !DOM.btnAiUnderstand.contains(e.target)) {
        DOM.aiUnderstandModal.classList.add('hidden');
    }
    if (DOM.bookDetailsModal && !DOM.bookDetailsModal.contains(e.target) && !DOM.btnSidebarInfo.contains(e.target)) {
        DOM.bookDetailsModal.classList.add('hidden');
    }
});

// Settings Tabs
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.remove('hidden');
    });
});

// Theme Selection
document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        if (theme === 'custom') {
            DOM.customThemeModal.classList.remove('hidden');
            DOM.themeDropdown.classList.add('hidden');
        } else {
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('folio_reader_theme', theme);
        }
    });
});

document.getElementById('btn-close-custom-theme').addEventListener('click', () => {
    DOM.customThemeModal.classList.add('hidden');
});

if (DOM.btnCloseAi) {
    DOM.btnCloseAi.addEventListener('click', () => DOM.aiUnderstandModal.classList.add('hidden'));
}
if (DOM.btnCloseDetails) {
    DOM.btnCloseDetails.addEventListener('click', () => DOM.bookDetailsModal.classList.add('hidden'));
}

if (DOM.btnSidebarInfo) {
    DOM.btnSidebarInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!contentData) return;
        DOM.bookDetailsModal.classList.remove('hidden');
        
        let tagsHtml = '';
        if (contentData.topics && contentData.topics.length) {
            tagsHtml = '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">' + 
                       contentData.topics.map(t => `<span style="background:var(--r-chrome-hover); padding:4px 8px; border-radius:4px; font-size:0.8rem;">${t}</span>`).join('') +
                       '</div>';
        }
        
        DOM.detailsText.innerHTML = `
            <div style="display:flex; gap:16px; margin-bottom:16px;">
                ${contentData.cover_image_url ? `<img src="${contentData.cover_image_url}" style="width:100px; height:150px; object-fit:cover; border-radius:4px;">` : ''}
                <div>
                    <h2 style="margin:0 0 8px; font-size:1.2rem;">${contentData.title}</h2>
                    <h3 style="margin:0 0 12px; color:var(--text-secondary); font-size:0.95rem;">${contentData.author || 'Unknown'}</h3>
                    <div style="font-size:0.85rem; color:var(--text-secondary);">Source: ${contentData.source_type || 'Uploaded'}</div>
                    <div style="font-size:0.85rem; color:var(--text-secondary);">Added: ${new Date(contentData.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <div style="line-height:1.5; font-size:0.95rem;">${contentData.summary || 'No summary available.'}</div>
            ${tagsHtml}
        `;
    });
}

if (DOM.btnAiUnderstand) {
    DOM.btnAiUnderstand.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!contentId) return;
        
        DOM.aiUnderstandModal.classList.remove('hidden');
        DOM.aiUnderstandText.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><i data-lucide="loader" class="spin"></i> Requesting AI Analysis...</div>';
        lucide.createIcons();
        
        try {
            // First call understand route
            const res = await api.post('/ai/understand', { content_id: contentId });
            const jobId = res.request_id || res.job_id;
            
            if (jobId) {
                DOM.aiUnderstandText.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><i data-lucide="loader" class="spin"></i> AI is thinking (Job ' + jobId + ')...</div>';
                lucide.createIcons();
                
                const checkJob = async () => {
                    try {
                        const jobRes = await api.get('/ai/jobs/' + jobId);
                        if (jobRes.status === 'completed') {
                            const r = jobRes.result || {};
                            let html = '';

                            // ── Summary ──────────────────────────────────────
                            if (r.summary) {
                                html += `<div style="margin-bottom:16px;">
                                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:6px;">Summary</div>
                                    <div style="line-height:1.6;">${r.summary}</div>
                                </div>`;
                            }

                            // ── Difficulty ───────────────────────────────────
                            if (r.difficulty) {
                                html += `<div style="margin-bottom:16px;">
                                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:6px;">Difficulty</div>
                                    <span style="background:var(--r-chrome-hover);padding:3px 10px;border-radius:12px;font-size:0.85rem;">${r.difficulty}</span>
                                </div>`;
                            }

                            // ── Key Concepts (interactive tags) ──────────────
                            if (r.key_concepts && r.key_concepts.length) {
                                if (!document.getElementById('concept-tag-style')) {
                                    const s = document.createElement('style');
                                    s.id = 'concept-tag-style';
                                    s.textContent = `
                                        .concept-tag{position:relative;display:inline-flex;align-items:center;justify-content:center;background:var(--r-chrome-hover);padding:4px 12px;border-radius:14px;font-size:0.82rem;cursor:pointer;border:1px solid transparent;transition:border-color .18s;user-select:none;overflow:hidden;}
                                        .concept-tag:hover{border-color:var(--accent);}
                                        .concept-tag-label{transition:filter .18s,opacity .18s;}
                                        .concept-tag:hover .concept-tag-label{filter:blur(3px);opacity:.35;}
                                        .concept-tag-arrow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s;color:var(--accent);font-size:1rem;}
                                        .concept-tag:hover .concept-tag-arrow{opacity:1;}
                                        .concept-popup{position:fixed;z-index:9999;background:var(--bg-secondary,#1a1a2e);border:1px solid var(--accent);border-radius:10px;padding:14px 16px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-size:0.83rem;line-height:1.55;color:var(--text-primary);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s;}
                                        .concept-popup.visible{opacity:1;transform:translateY(0);pointer-events:auto;}
                                        .concept-popup-title{font-weight:600;margin-bottom:6px;color:var(--text-primary);font-size:0.85rem;}
                                    `;
                                    document.head.appendChild(s);
                                }
                                const tagsHtml = r.key_concepts.map(c => {
                                    const label = (typeof c === 'object' && c !== null) ? (c.concept || c.name || '') : String(c);
                                    const explanation = (typeof c === 'object' && c !== null) ? (c.explanation || c.description || '') : '';
                                    const sl = label.replace(/"/g, '&quot;');
                                    const se = explanation.replace(/"/g, '&quot;');
                                    return `<span class="concept-tag" data-concept="${sl}" data-explanation="${se}"><span class="concept-tag-label">${label}</span><span class="concept-tag-arrow"><i data-lucide="arrow-right" style="width:14px;height:14px;"></i></span></span>`;
                                }).join('');
                                html += `<div style="margin-bottom:16px;">
                                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:8px;">Key Concepts</div>
                                    <div style="display:flex;flex-wrap:wrap;gap:8px;">${tagsHtml}</div>
                                </div>`;
                            }

                            // ── Topics ───────────────────────────────────────
                            if (r.topics && r.topics.length) {
                                html += `<div style="margin-bottom:16px;">
                                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:8px;">Topics</div>
                                    <div style="display:flex;flex-wrap:wrap;gap:6px;">${r.topics.map(t => `<span style="background:var(--r-chrome-hover);padding:3px 10px;border-radius:12px;font-size:0.82rem;">${t}</span>`).join('')}</div>
                                </div>`;
                            }

                            // ── Category ─────────────────────────────────────
                            if (r.category) {
                                html += `<div>
                                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);margin-bottom:6px;">Category</div>
                                    <span style="background:var(--r-chrome-hover);padding:3px 10px;border-radius:12px;font-size:0.85rem;">${r.category}</span>
                                </div>`;
                            }

                            // ── Render once, then wire listeners ─────────────
                            DOM.aiUnderstandText.innerHTML = html || '<span style="color:var(--text-secondary)">No details returned.</span>';
                            lucide.createIcons({ root: DOM.aiUnderstandText });

                            let activePopup = null;
                            const closePopup = () => {
                                if (activePopup) {
                                    activePopup.classList.remove('visible');
                                    setTimeout(() => { if (activePopup) { activePopup.remove(); activePopup = null; } }, 160);
                                }
                            };
                            DOM.aiUnderstandText.querySelectorAll('.concept-tag').forEach(tag => {
                                tag.addEventListener('click', e => {
                                    e.stopPropagation();
                                    const concept = tag.dataset.concept;
                                    const explanation = tag.dataset.explanation;
                                    if (!explanation) return;
                                    if (activePopup && activePopup.dataset.for === concept) { closePopup(); return; }
                                    closePopup();

                                    const popup = document.createElement('div');
                                    popup.className = 'concept-popup';
                                    popup.dataset.for = concept;
                                    popup.innerHTML = `<div class="concept-popup-title">${concept}</div><div>${explanation}</div>`;
                                    document.body.appendChild(popup);
                                    activePopup = popup;

                                    const rect = tag.getBoundingClientRect();
                                    const popupW = 280;
                                    let left = rect.left + rect.width / 2 - popupW / 2;
                                    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
                                    popup.style.left = left + 'px';
                                    popup.style.top = '-9999px';
                                    requestAnimationFrame(() => {
                                        const top = Math.max(8, rect.top - popup.offsetHeight - 10);
                                        popup.style.top = top + 'px';
                                        popup.classList.add('visible');
                                    });
                                });
                            });
                            document.addEventListener('click', closePopup);
                        } else if (jobRes.status === 'failed') {
                            DOM.aiUnderstandText.innerHTML = '<span style="color:#f56565">AI Analysis failed.</span>';
                        } else {
                            setTimeout(checkJob, 2000);
                        }
                    } catch (e) {
                        DOM.aiUnderstandText.innerHTML = '<span style="color:#f56565">Error checking status: ' + e.message + '</span>';
                    }
                };
                setTimeout(checkJob, 2000);
            } else {
                DOM.aiUnderstandText.innerHTML = res.message || JSON.stringify(res);
            }
        } catch (e) {
            DOM.aiUnderstandText.innerHTML = '<span style="color:#f56565">Error: ' + e.message + '</span>';
        }
    });
}

document.getElementById('btn-save-theme').addEventListener('click', () => {
    const bg = document.getElementById('color-bg').value;
    const text = document.getElementById('color-text').value;
    const link = document.getElementById('color-link').value;
    
    document.body.style.setProperty('--custom-bg', bg);
    document.body.style.setProperty('--custom-text', text);
    document.body.style.setProperty('--custom-link', link);
    
    document.body.setAttribute('data-theme', 'custom');
    localStorage.setItem('folio_reader_theme', 'custom');
    localStorage.setItem('folio_custom_bg', bg);
    localStorage.setItem('folio_custom_text', text);
    localStorage.setItem('folio_custom_link', link);
    
    DOM.customThemeModal.classList.add('hidden');
});

// Live preview custom theme
['color-bg', 'color-text', 'color-link'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        const prev = document.getElementById('theme-preview');
        if (id === 'color-bg') prev.style.backgroundColor = document.getElementById(id).value;
        if (id === 'color-text') prev.style.color = document.getElementById(id).value;
        if (id === 'color-link') prev.querySelector('a').style.color = document.getElementById(id).value;
    });
});

// --- Pagination Buttons ---
DOM.btnPageFirst.addEventListener('click', () => goToPage(1));
DOM.btnPagePrev.addEventListener('click', () => goToPage(currentPage - 1));
DOM.btnPageNext.addEventListener('click', () => goToPage(currentPage + 1));
DOM.btnPageLast.addEventListener('click', () => goToPage(totalPages));

DOM.ribbonProgress.addEventListener('input', (e) => {
    const pct = parseFloat(e.target.value);
    const targetPage = Math.max(1, Math.round((pct / 100) * totalPages));
    goToPage(targetPage);
});

// --- TOC / Bookmarks ---
function renderTOC() {
    DOM.listHyperlinks.innerHTML = '';
    if (pseudoTOC.length === 0) {
        DOM.listHyperlinks.innerHTML = '<div style="padding:20px; color:var(--text-light)">No chapters found.</div>';
        return;
    }
    
    pseudoTOC.forEach(toc => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        
        // Find the page number by getting element offset
        const el = document.getElementById(toc.id);
        let pageNum = 1;
        if (el) {
            if (isVerticalMode) {
                pageNum = Math.floor(el.offsetTop / DOM.contentContainer.clientHeight) + 1;
            } else {
                pageNum = Math.floor(el.offsetLeft / DOM.contentContainer.clientWidth) + 1;
            }
        }
        
        item.innerHTML = `
            <div class="sidebar-item-label">${toc.label}</div>
            <div class="sidebar-item-page">${pageNum}</div>
        `;
        item.addEventListener('click', () => {
            goToPage(pageNum);
            document.querySelectorAll('#list-hyperlinks .sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
        DOM.listHyperlinks.appendChild(item);
    });
}

async function fetchAnnotationsAndBookmarks() {
    try {
        const res = await api.get(`/library/${libraryItemId}/bookmarks`);
        const items = res.items || res || [];
        
        annotations = items.filter(i => ['highlight', 'underline', 'strikethrough'].includes(i.type));
        bookmarks = items.filter(i => i.type === 'bookmark');
        
        renderAnnotations();
        renderBookmarks();
    } catch (e) {
        console.error("Failed to fetch annotations/bookmarks:", e);
    }
}

function renderAnnotations() {
    DOM.listAnnotations.innerHTML = '';
    if (annotations.length === 0) {
        DOM.listAnnotations.innerHTML = '<div style="padding:20px; color:var(--text-light)">No annotations.</div>';
        return;
    }
    
    annotations.forEach(ann => {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        
        // Truncate highlighted text
        let text = ann.highlighted_text || 'No text';
        const words = text.split(' ');
        if (words.length > 15) text = words.slice(0, 15).join(' ') + '...';
        
        item.innerHTML = `
            <div class="annotation-text">${text}</div>
            <div class="annotation-actions">
                <button class="btn-delete-annotation" title="Delete" data-id="${ann.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        
        // Jump to annotation logic
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-annotation')) return;
            // Fake jump since we don't have exact coordinates in this pseudo DOM
            // We could parse ann.position if it's stored, e.g. "page: 5"
            let pageNum = 1; 
            if (ann.position && ann.position.startsWith('page:')) {
                pageNum = parseInt(ann.position.split(':')[1]) || 1;
            }
            goToPage(pageNum);
        });
        
        // Delete
        item.querySelector('.btn-delete-annotation').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this annotation?')) return;
            try {
                await api.delete(`/bookmarks/${ann.id}`);
                item.remove();
            } catch (err) {}
        });
        
        DOM.listAnnotations.appendChild(item);
    });
    lucide.createIcons();
}

function timeSince(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "just now";
}

function renderBookmarks() {
    DOM.listBookmarks.innerHTML = '';
    if (bookmarks.length === 0) {
        DOM.listBookmarks.innerHTML = '<div style="padding:20px; color:var(--text-light)">No bookmarks.</div>';
        return;
    }
    
    bookmarks.forEach(bm => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        
        let pageNum = 1;
        if (bm.position && bm.position.startsWith('page:')) {
            pageNum = parseInt(bm.position.split(':')[1]) || 1;
        }
        
        const relativeTime = timeSince(bm.created_at);
        
        item.innerHTML = `
            <div class="sidebar-item-label">Page ${pageNum} &bull; <span style="font-size:0.8em; color:#a0aec0">${relativeTime}</span></div>
            <div class="annotation-actions" style="opacity: 0;">
                <button class="btn-delete-annotation" title="Delete" data-id="${bm.id}" style="color: #fc8181; background: none; border: none; cursor: pointer;">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
        `;
        
        item.addEventListener('mouseenter', () => { item.querySelector('.annotation-actions').style.opacity = '1'; });
        item.addEventListener('mouseleave', () => { item.querySelector('.annotation-actions').style.opacity = '0'; });
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-annotation')) return;
            goToPage(pageNum);
        });
        
        item.querySelector('.btn-delete-annotation').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this bookmark?')) return;
            try {
                await api.delete(`/bookmarks/${bm.id}`);
                item.remove();
            } catch (err) {}
        });
        
        DOM.listBookmarks.appendChild(item);
    });
    lucide.createIcons();
}

async function saveReadingSession() {
    if (!libraryItemId || !sessionStartTime) return;
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (duration < 10) return; // Too short to record
    
    // Very naive word counting: assume 250 words per page
    const words = Math.max(1, Math.floor(totalPages > 0 ? (contentData.word_count || 5000) * (1 / totalPages) : 0));
    
    const pct = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100;
    
    try {
        await api.post('/reading/sessions', {
            library_item_id: libraryItemId,
            duration_sec: duration,
            words_covered: words,
            progress_pct: Math.min(100, Math.max(0, pct))
        }, { keepalive: true });
    } catch(e) {
        console.error("Failed to save reading session", e);
    }
}

// --- Sidebar Resizer ---
const sidebarResizer = document.getElementById('sidebar-resizer');
let isSidebarResizing = false;

sidebarResizer.addEventListener('mousedown', (e) => {
    isSidebarResizing = true;
    document.body.style.cursor = 'ew-resize';
});
document.addEventListener('mousemove', (e) => {
    if (!isSidebarResizing) return;
    const newWidth = Math.max(200, Math.min(e.clientX, window.innerWidth - 200));
    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
});
document.addEventListener('mouseup', () => {
    if (isSidebarResizing) {
        isSidebarResizing = false;
        document.body.style.cursor = '';
        localStorage.setItem('folio_sidebar_width', getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim());
        calculatePagination();
        goToPage(currentPage);
    }
});

// Start
console.log("reader.js parsing complete. Calling initReader()...");
try {
    initReader().then(() => {
        if (contentId) {
            loadFutureSelfPrediction(contentId);
        }
    }).catch(e => console.error("Async error in initReader:", e));
    console.log("Called initReader(). Calling lucide.createIcons()...");
    lucide.createIcons();
    setTimeout(() => lucide.createIcons(), 1000); // Try again after 1s just in case
} catch (e) {
    console.error("Error at startup:", e);
    document.getElementById('error-toast').textContent = "Startup Error: " + e.message;
    document.getElementById('error-toast').style.display = 'block';
}

async function loadFutureSelfPrediction(cid) {
    const toast = document.getElementById('prediction-toast');
    const textDiv = document.getElementById('prediction-text');
    
    // Don't show again if dismissed or previously shown for this session
    if (sessionStorage.getItem('folio_predicted_' + cid)) return;

    try {
        const res = await api.post('/ai/predict-read', { content_id: cid });
        const jobId = res.request_id;
        
        let attempts = 0;
        let result = null;
        while (attempts < 20) {
            await new Promise(r => setTimeout(r, 2000));
            const jobRes = await api.get(`/ai/jobs/${jobId}`);
            if (jobRes.status === 'completed') { result = jobRes.result; break; }
            if (jobRes.status === 'failed') break;
            attempts++;
        }
        
        if (result && result.prediction) {
            textDiv.textContent = result.prediction;
            toast.style.display = 'block';
            
            // Fade in
            setTimeout(() => { toast.style.opacity = '1'; }, 100);
            
            sessionStorage.setItem('folio_predicted_' + cid, 'true');
            
            // Auto hide after 8 seconds
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => { toast.style.display = 'none'; }, 500);
            }, 8000);
        }
    } catch (e) {
        console.error("Failed to load prediction", e);
    }
}
