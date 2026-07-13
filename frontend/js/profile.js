document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('access_token')) {
        window.location.href = 'index.html';
        return;
    }

    const ALL_GENRES = [
        'Action & Adventure', 'Academic Paper', 'Agriculture', 'Anthropology', 
        'Archaeology', 'Architecture', 'Art & Photography', 'Astronomy', 
        'Biography & Memoir', 'Biology', 'Business & Finance', 'Chemistry', 
        'Childrens Literature', 'Classics', 'Crafts & Hobbies', 'Current Affairs', 
        'Cybersecurity', 'Drama & Plays', 'Dystopian', 'Earth Sciences', 
        'Economics', 'Education', 'Engineering', 'Environment & Ecology', 
        'Epic Fantasy', 'Essays & Anthologies', 'Fashion & Beauty', 'Fiction', 
        'General Knowledge', 'Geography', 'Graphic Novels & Manga', 'Health & Wellness', 
        'Historical Fiction', 'History', 'Horror', 'Humor & Comedy', 
        'Interviews & Profiles', 'Investigative Journalism', 'Law & Jurisprudence', 
        'Linguistics', 'Literary Fiction', 'Magical Realism', 'Mathematics', 
        'Medical Sciences', 'Metaphysics', 'Military & Warfare', 'Music & Performing Arts', 
        'Mystery & Crime', 'Mythology & Folklore', 'Nature & Wildlife', 'News Reporting', 
        'Non-Fiction', 'Opinion & Editorial', 'Parenting & Family', 'Philosophy', 
        'Physics', 'Poetry', 'Political Science', 'Psychology', 'Public Policy', 
        'Reference & Dictionaries', 'Religion & Spirituality', 'Romance', 'Satire', 
        'Science Fiction', 'Self-Help', 'Sociology', 'Sports & Recreation', 
        'Technology & Computing', 'Thriller & Suspense', 'Travel & Tourism', 
        'True Crime', 'Utopian Fiction', 'Westerns', 'Young Adult'
    ];

    const genreDropdown = document.getElementById('genre-dropdown');
    ALL_GENRES.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        genreDropdown.appendChild(opt);
    });

    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('access_token');
        window.location.href = 'index.html';
    });

    async function loadProfile() {
        try {
            const user = await api.get('/auth/users/me');
            document.getElementById('profile-name').textContent = user.display_name || 'My Profile';
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('stat-wpm').textContent = user.current_wpm || user.default_wpm || 200;

            const stats = await api.get('/profile/stats');
            document.getElementById('stat-words').textContent = (stats.total_words_read || 0).toLocaleString();
            
            const hours = ((stats.total_time_read_sec || 0) / 3600).toFixed(1);
            document.getElementById('stat-time').textContent = hours + 'h';
        } catch (err) {}
    }

    async function loadGenres() {
        try {
            const res = await api.get('/profile/genres');
            renderGenres(res.genres || []);
        } catch (err) {}
    }

    function renderGenres(genres) {
        const container = document.getElementById('genre-chips-container');
        container.innerHTML = '';
        genres.forEach(g => {
            const chip = document.createElement('div');
            chip.className = 'genre-chip';
            chip.innerHTML = `
                ${g}
                <i data-lucide="x" style="width:14px;height:14px;" onclick="removeGenre('${g}')"></i>
            `;
            container.appendChild(chip);
        });
        lucide.createIcons();
    }

    document.getElementById('add-genre-btn').addEventListener('click', async () => {
        const genre = genreDropdown.value;
        if (!genre) return;
        try {
            await api.post('/profile/genres', { genre });
            genreDropdown.value = '';
            loadGenres();
        } catch (err) {}
    });

    window.removeGenre = async (genre) => {
        try {
            await api.delete(`/profile/genres/${encodeURIComponent(genre)}`);
            loadGenres();
        } catch (err) {}
    };

    loadProfile();
    loadGenres();
});
