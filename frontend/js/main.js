class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('theme-toggle');
        this.themeIcon = document.getElementById('theme-icon');

        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.applyTheme(savedTheme);

        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (this.themeIcon) {
            this.themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        this.applyTheme(next);
    }
}

function showError(message) {
    const toast = document.getElementById('error-toast');
    if (!toast) { console.error(message); return; }
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.classList.add('show'); }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 5000);
}

class AuthManager {
    constructor() {
        this.signinForm = document.getElementById('signin-form');
        this.signupForm = document.getElementById('signup-form');
        this.otpGroup = document.getElementById('otp-group');
        this.signupOtpInput = document.getElementById('signup-otp');
        this.isOtpSent = false;

        if (this.signinForm) {
            this.signinForm.addEventListener('submit', (e) => this.handleSignIn(e));
        }
        if (this.signupForm) {
            this.signupForm.addEventListener('submit', (e) => this.handleSignUp(e));
        }
        this.fetchUserCount();
        this.fetchItemCount();
    }

    async handleSignIn(e) {
        e.preventDefault();
        const email = document.getElementById('signin-email').value;
        const password = document.getElementById('signin-password').value;

        try {
            const response = await fetch(`http://127.0.0.1:8000/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Login failed');
            localStorage.setItem('access_token', data.access_token);
            window.location.href = 'library.html';
        } catch (error) {
            showError(error.message);
        }
    }

    async handleSignUp(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm').value;

        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        if (!this.isOtpSent) {
            try {
                const response = await fetch(`http://127.0.0.1:8000/auth/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'Failed to send OTP');

                this.isOtpSent = true;
                if (this.otpGroup) this.otpGroup.style.display = 'block';
                if (this.signupOtpInput) this.signupOtpInput.disabled = false;

                const button = this.signupForm.querySelector('button[type="submit"]');
                if (button) button.textContent = 'Verify & Sign Up';
                showError('OTP sent to your email.');
            } catch (error) {
                showError(error.message);
            }
        } else {
            const otp = this.signupOtpInput.value;
            try {
                const response = await fetch(`http://127.0.0.1:8000/auth/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, otp })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'Sign up failed');
                localStorage.setItem('access_token', data.access_token);
                window.location.href = 'library.html';
            } catch (error) {
                showError(error.message);
            }
        }
    }

    async fetchUserCount() {
        const userNumberEl = document.getElementById('user-number');
        if (!userNumberEl) return;
        try {
            const response = await fetch(`http://127.0.0.1:8000/auth/users/count`);
            const data = await response.json();
            if (response.ok) {
                userNumberEl.textContent = `${data.count}\n`;
            } else {
                console.error('Failed to fetch user count:', data);
            }
        } catch (error) {
            console.error('Error fetching user count:', error);
        }
    }

    async fetchItemCount(){
        const itemNumberEl = document.getElementById('books-uploaded');
        if(!itemNumberEl) return;
        try {
            const response = await fetch(`http://127.0.0.1:8000/auth/users/items`);
            const data = await response.json();
            if (response.ok) {
                itemNumberEl.textContent = data.count;
            } else {
                console.error('Error fetching user count:', data);
            }  
            
        } catch(error){
            console.error("Error fetching item number:", error)
        }
    }
    
}

// Initialize safely after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
    window.authManager = new AuthManager();
    window.getUsers = new GetUsers();
});