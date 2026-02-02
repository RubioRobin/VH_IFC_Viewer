import './style.css';
import './admin-styles.css';

const API_URL = 'http://localhost:3000';

// Check authentication
async function checkAuth() {
    const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include'
    });

    if (response.ok) {
        window.location.href = '/admin.html';
    }
}

checkAuth();

// Login form HTML
const loginHTML = `
<div class="login-container">
    <div class="login-card glass-panel">
        <div class="login-header">
            <h1>BIM Admin</h1>
            <p>VH Engineering Portal</p>
        </div>
        
        <form id="login-form" class="login-form">
            <div class="form-group">
                <label for="username">Gebruikersnaam</label>
                <input 
                    type="text" 
                    id="username" 
                    name="username" 
                    required 
                    autocomplete="username"
                    placeholder="admin"
                />
            </div>
            
            <div class="form-group">
                <label for="password">Wachtwoord</label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    required 
                    autocomplete="current-password"
                    placeholder="••••••••"
                />
            </div>
            
            <div id="error-message" class="error-message"></div>
            
            <button type="submit" class="btn-primary" id="login-btn">
                <span class="btn-text">Inloggen</span>
                <span class="btn-loader" style="display: none;">
                    <span class="spinner"></span>
                </span>
            </button>
        </form>
        
        <div class="login-footer">
            <p>Default: admin / admin123</p>
        </div>
    </div>
</div>
`;

const app = document.getElementById('login-app');
if (app) {
    app.innerHTML = loginHTML;
}

// Handle login
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    // Show loading state
    const btnText = loginBtn.querySelector('.btn-text') as HTMLElement;
    const btnLoader = loginBtn.querySelector('.btn-loader') as HTMLElement;
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    loginBtn.disabled = true;
    errorMessage.textContent = '';

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Redirect to admin dashboard
            window.location.href = '/admin.html';
        } else {
            errorMessage.textContent = data.error || 'Login mislukt';
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
            loginBtn.disabled = false;
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Kan geen verbinding maken met de server';
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
        loginBtn.disabled = false;
    }
});
