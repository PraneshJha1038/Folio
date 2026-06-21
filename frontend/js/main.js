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
class signInAuth{
    constructor(){
        this.signInForm = document.getElementById("signin-form");
        // this.forgotPassword = document.getElementById("forgot-password")
        this.email = document.getElementById("signin-email");
        this.password = document.getElementById("signin-password");

    }
}
class signUpAuth{
    constructor(){
        this.email = document.getElementById("signup-email");
        this.password = document.getElementById("signup-password");
    }
}
this.themeManager = new ThemeManager();