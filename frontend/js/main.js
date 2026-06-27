class ThemeManager{
    constructor(){
        this.themeIcon = document.getElementById("theme-icon");
        this.themeToggle = document.getElementById("theme-toggle");
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme);
        this.themeToggle?.addEventListener('click', ()=>this.toggleTheme());

    }
    setTheme(theme){
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
    toggleTheme(){
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }
}
const API_BASE = 'http://127.0.0.1:8000';

function showError(message) {
    const toast = document.getElementById('error-toast');
    if (!toast) return;
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
        this.signinForm = document.getElementById("signin-form");
        this.signupForm = document.getElementById("signup-form");
        this.otpGroup = document.getElementById("otp-group");
        this.signupOtpInput = document.getElementById("signup-otp");
        this.isOtpSent = false;

        if (this.signinForm) {
            this.signinForm.addEventListener('submit', (e) => this.handleSignIn(e));
        }
        if (this.signupForm) {
            this.signupForm.addEventListener('submit', (e) => this.handleSignUp(e));
        }
    }

    async handleSignIn(e) {
        e.preventDefault();
        const email = document.getElementById("signin-email").value;
        const password = document.getElementById("signin-password").value;

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
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
        const name = document.getElementById("signup-name").value;
        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;
        const confirmPassword = document.getElementById("signup-confirm").value;

        if (password !== confirmPassword) {
            showError("Passwords do not match");
            return;
        }

        if (!this.isOtpSent) {
            try {
                const response = await fetch(`${API_BASE}/auth/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'Failed to send OTP');
                
                this.isOtpSent = true;
                this.otpGroup.style.display = 'block';
                this.signupOtpInput.disabled = false;
                
                const button = this.signupForm.querySelector('button[type="submit"]');
                button.textContent = "Verify & Sign Up";
                showError("OTP sent to your email.");
            } catch (error) {
                showError(error.message);
            }
        } else {
            const otp = this.signupOtpInput.value;
            try {
                const response = await fetch(`${API_BASE}/auth/verify-otp`, {
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
}

this.themeManager = new ThemeManager();
this.authManager = new AuthManager();