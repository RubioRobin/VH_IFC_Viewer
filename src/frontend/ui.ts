// ui.ts - UI Helpers (Toasts, Modals, Loading)

// Toast System
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Create container if missing
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(div);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EN' : '#3B82F6'};
        display: flex;
        align-items: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
        font-family: 'Inter', sans-serif;
    `;

    // Fix color for Error (typo above)
    if (type === 'error') toast.style.backgroundColor = '#EF4444';

    toast.innerText = message;
    document.getElementById('toast-container')?.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Loading Overlay
export function setLoading(isLoading: boolean, message: string = 'Laden...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 10000; display: none; place-items: center; color: white; flex-direction: column; gap: 15px;';
        overlay.innerHTML = '<div class="spinner"></div><div id="loading-text"></div>';
        // Add spinner CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .spinner { width: 40px; height: 40px; border: 4px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }

    if (isLoading) {
        const text = overlay.querySelector('#loading-text');
        if (text) text.textContent = message;
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

// Modal Helper
export function toggleModal(modalId: string, show: boolean) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    if (show) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    } else {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
