document.addEventListener('DOMContentLoaded', () => {
    // Topbar
    document.getElementById('btn-home').addEventListener('click', () => {
        window.location.href = '/library';
    });

    const body = document.documentElement;
    const btnTheme = document.getElementById('btn-theme');
    const themeSun = document.getElementById('theme-sun');
    const themeMoon = document.getElementById('theme-moon');

    function applyTheme(theme) {
        body.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            themeSun.style.display = 'none';
            themeMoon.style.display = 'block';
        } else {
            themeSun.style.display = 'block';
            themeMoon.style.display = 'none';
        }
        localStorage.setItem('folio_theme', theme);
    }
    applyTheme(localStorage.getItem('folio_theme') || 'dark');
    
    btnTheme.addEventListener('click', () => {
        const curr = body.getAttribute('data-theme');
        applyTheme(curr === 'dark' ? 'light' : 'dark');
    });

    // Start loading insights
    loadInsights();
});

// Helper for polling AI jobs — no time limit, waits until completed/failed
async function pollJob(jobId, label) {
    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const jobRes = await api.get(`/ai/jobs/${jobId}`);
        console.log(`[pollJob:${label}] status=${jobRes.status}`);
        if (jobRes.status === 'completed') return jobRes.result;
        if (jobRes.status === 'failed') {
            console.error(`[pollJob:${label}] Job failed. Full response:`, jobRes);
            throw new Error(`${label} job failed`);
        }
    }
}

// Escaper
function esc(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function openModal(id) {
    const m = document.getElementById(id);
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('.lib-modal-close, [data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-close');
        if (targetId) closeModal(targetId);
    });
});

async function loadInsights() {
    const main = document.getElementById('insights-main');
    const loading = document.getElementById('insights-loading');
    
    try {
        // Fire all three requests in parallel
        console.log('[loadInsights] Firing all three AI requests...');
        const [hRes, gRes, rRes] = await Promise.all([
            api.post('/ai/heatmap', {}),
            api.post('/ai/graveyard', {}),
            api.post('/ai/recommendations', {})
        ]);
        console.log('[loadInsights] Job IDs — heatmap:', hRes.request_id, 'graveyard:', gRes.request_id, 'recs:', rRes.request_id);
        
        // Poll each job independently — graveyard failure won't kill the whole page
        const [heatmap, graveyard, recs] = await Promise.all([
            pollJob(hRes.request_id, 'heatmap').catch(e => { console.error('Heatmap failed:', e); return null; }),
            pollJob(gRes.request_id, 'graveyard').catch(e => { console.error('Graveyard failed:', e); return null; }),
            pollJob(rRes.request_id, 'recs').catch(e => { console.error('Recs failed:', e); return null; })
        ]);
        
        loading.style.display = 'none';
        main.style.display = 'block';
        
        if (heatmap) renderHeatmap(heatmap);
        if (graveyard) renderGraveyard(graveyard);
        if (recs) renderRecommendations(recs);
        
    } catch (e) {
        console.error('[loadInsights] Fatal error:', e);
        loading.innerHTML = `<div style="color:#ef4444;">Failed to load insights: ${esc(e.message)}</div>`;
    }
}

function renderHeatmap(data) {
    // AI engine returns {heatmap: [...], insight: "..."}
    document.getElementById('heatmap-insight').textContent = data.insight || data.insight_summary || '';
    const list = document.getElementById('heatmap-list');
    list.innerHTML = '';
    
    const topics = data.heatmap || data.topics || [];
    if (topics.length === 0) {
        list.innerHTML = '<div style="color:var(--text-light);">No data available yet. Keep reading!</div>';
        return;
    }
    
    // Find max score for relative scaling
    const maxScore = Math.max(...topics.map(t => t.score));
    
    topics.forEach(t => {
        const pct = (t.score / (maxScore || 1)) * 100;
        
        let trendIcon = '<span style="color:var(--text-light);">-</span>';
        if (t.trend === 'up') trendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="width:16px;height:16px;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
        else if (t.trend === 'down') trendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="width:16px;height:16px;"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>';
        
        const row = document.createElement('div');
        row.className = 'heatmap-row';
        row.innerHTML = `
            <div class="heatmap-label" title="${esc(t.topic)}">${esc(t.topic)}</div>
            <div class="heatmap-bar-container">
                <div class="heatmap-bar" style="width: ${pct}%"></div>
            </div>
            <div class="heatmap-trend">${trendIcon}</div>
        `;
        
        row.addEventListener('click', () => openLearningPath(t.topic));
        list.appendChild(row);
    });
}

function renderGraveyard(data) {
    const stats = data.stats || data.patterns || {};
    document.getElementById('graveyard-topics').textContent = stats.never_finished_topics || stats.never_finish_topics?.length || '0';
    document.getElementById('graveyard-lengths').textContent = stats.never_finished_lengths || stats.never_finish_lengths || '0';
    
    const list = document.getElementById('graveyard-insights');
    list.innerHTML = '';
    if (data.insights && data.insights.length > 0) {
        data.insights.forEach(ins => {
            const li = document.createElement('li');
            li.textContent = ins;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li style="color:var(--text-light);">No patterns detected yet.</li>';
    }
    
    document.getElementById('graveyard-recommendation').textContent = data.recommendation || '';
}

function renderRecommendations(data) {
    const list = document.getElementById('recs-list');
    list.innerHTML = '';
    
    // AI engine returns {recommendations: [...], explore_suggestion: {...}}
    const items = data.recommendations || data.recommended_items || [];
    
    if (items.length > 0) {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'lib-card recs-card';
            card.innerHTML = `
                <div class="lib-card-cover" style="cursor:pointer;" onclick="window.location.href='/reader?id=${item.content_id}'">
                    <div class="lib-card-cover-placeholder">
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                               <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                           </svg>
                    </div>
                </div>
                <div class="lib-card-body">
                    <div class="lib-card-title" title="${esc(item.title)}">${esc(item.title)}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${esc(item.reason)}</div>
                </div>
            `;
            list.appendChild(card);
        });
    }
    
    if (data.explore_suggestion) {
        const ec = document.createElement('div');
        ec.className = 'explore-card';
        // explore_suggestion is an object {topic, reason}
        const expText = typeof data.explore_suggestion === 'string'
            ? data.explore_suggestion
            : `${data.explore_suggestion.topic || ''} — ${data.explore_suggestion.reason || ''}`;
        ec.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>
            <div class="explore-title">Explore New Territory</div>
            <div class="explore-desc">${esc(expText)}</div>
        `;
        list.appendChild(ec);
    }
}

// ─── Learning Path Modal ──────────────────────────────────────────────
async function openLearningPath(topic) {
    document.getElementById('lp-title').textContent = `Path: ${topic}`;
    document.getElementById('lp-desc').textContent = '';
    document.getElementById('lp-steps').innerHTML = '';
    
    document.getElementById('lp-loading').style.display = 'block';
    document.getElementById('lp-results').style.display = 'none';
    
    openModal('learning-path-modal');
    
    try {
        const res = await api.post('/ai/learning-path', { topic });
        const data = await pollJob(res.request_id);
        
        document.getElementById('lp-loading').style.display = 'none';
        document.getElementById('lp-results').style.display = 'block';
        
        document.getElementById('lp-desc').textContent = data.path_summary || '';
        
        const steps = document.getElementById('lp-steps');
        if (data.steps && data.steps.length > 0) {
            data.steps.forEach((step, idx) => {
                const el = document.createElement('div');
                el.style.padding = '12px';
                el.style.background = 'var(--bg-hover)';
                el.style.borderRadius = '8px';
                
                const artHtml = step.article_id 
                    ? `<button class="lib-primary-btn" style="padding: 4px 12px; font-size: 0.8rem; margin-top: 8px;" onclick="window.location.href='/reader?id=${step.article_id}'">Read "${esc(step.article_title)}"</button>`
                    : `<div style="font-size: 0.8rem; color: var(--text-light); margin-top: 8px;">Find an article about: "${esc(step.article_title)}"</div>`;

                el.innerHTML = `
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${idx + 1}. ${esc(step.step_title)}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">${esc(step.reason)}</div>
                    ${artHtml}
                `;
                steps.appendChild(el);
            });
        }
    } catch (e) {
        document.getElementById('lp-loading').style.display = 'none';
        document.getElementById('lp-results').style.display = 'block';
        document.getElementById('lp-desc').textContent = `Error generating path: ${e.message}`;
    }
}
