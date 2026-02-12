import './style.css';
import './admin-styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://vh-ifc-backend.onrender.com';

interface User {
    id: string;
    username: string;
    role: string;
}

interface Project {
    id: string;
    name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    file_count: number;
    total_size: number;
}

interface IFCFile {
    id: string;
    project_id: string;
    filename: string;
    filepath: string;
    size: number;
    upload_date: string;
    project_name?: string;
}

interface QRCode {
    id: string;
    project_id: string;
    file_id: string;
    element_id: string;
    qr_code_url: string;
    qr_image_path: string;
    created_at: string;
    filename?: string;
    project_name?: string;
}

interface Statistics {
    total_projects: number;
    active_projects: number;
    total_files: number;
    total_storage: number;
    total_qr_codes: number;
}

interface Activity {
    id: number;
    user_id: string;
    action: string;
    details: string;
    timestamp: string;
    username: string;
}

let currentUser: User | null = null;
let currentTab = 'projects';
let projects: Project[] = [];
let files: IFCFile[] = [];
let qrCodes: QRCode[] = [];
let statistics: Statistics | null = null;
let activity: Activity[] = [];

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
            credentials: 'include'
        });

        if (!response.ok) {
            window.location.href = '/login.html';
            return false;
        }

        currentUser = await response.json();
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
    }
}

// Logout
async function logout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    window.location.href = '/login.html';
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Fetch data
async function fetchProjects() {
    const response = await fetch(`${API_URL}/api/projects`, { credentials: 'include' });
    projects = await response.json();
}

async function fetchFiles() {
    const response = await fetch(`${API_URL}/api/files?t=${Date.now()}`, { credentials: 'include' });
    files = await response.json();
}

async function fetchQRCodes() {
    const response = await fetch(`${API_URL}/api/qr`, { credentials: 'include' });
    qrCodes = await response.json();
}

async function fetchStatistics() {
    const response = await fetch(`${API_URL}/api/statistics`, { credentials: 'include' });
    statistics = await response.json();
}

async function fetchActivity() {
    const response = await fetch(`${API_URL}/api/activity?limit=20`, { credentials: 'include' });
    activity = await response.json();
}

// Render functions
function renderHeader() {
    return `
        <header class="admin-header glass-panel">
            <div class="header-left">
                <h1>BIM Admin Dashboard</h1>
                <p>VH Engineering Portal</p>
            </div>
            <div class="header-right">
                <span class="user-info">${currentUser?.username}</span>
                <button class="btn-secondary" onclick="window.logout()">Uitloggen</button>
            </div>
        </header>
    `;
}

function renderTabs() {
    const tabs = [
        { id: 'projects', label: 'Projecten' },
        { id: 'files', label: 'Bestanden' },
        { id: 'statistics', label: 'Statistieken' },
        { id: 'qr', label: 'QR Codes' }
    ];

    return `
        <nav class="admin-tabs">
            ${tabs.map(tab => `
                <button 
                    class="tab-button ${currentTab === tab.id ? 'active' : ''}" 
                    onclick="window.switchTab('${tab.id}')"
                >
                    <span class="tab-label">${tab.label}</span>
                </button>
            `).join('')}
        </nav>
    `;
}

function renderProjectsTab() {
    return `
        <div class="tab-content">
            <div class="content-header">
                <h2>Projecten</h2>
                <button class="btn-primary" onclick="window.showCreateProjectModal()">
                    + Nieuw Project
                </button>
            </div>
            
            <div class="projects-grid">
                ${projects.map(project => `
                    <div class="project-card glass-panel">
                        <div class="project-header">
                            <h3>${project.name}</h3>
                            <span class="status-badge status-${project.status}">${project.status}</span>
                        </div>
                        <p class="project-description">${project.description || 'Geen beschrijving'}</p>
                        <div class="project-stats">
                            <div class="stat">
                                <span class="stat-label">Bestanden</span>
                                <span class="stat-value">${project.file_count}</span>
                            </div>
                            <div class="stat">
                                <span class="stat-label">Opslag</span>
                                <span class="stat-value">${formatBytes(project.total_size)}</span>
                            </div>
                        </div>
                        <div class="project-footer">
                            <span class="project-date">Bijgewerkt: ${formatDate(project.updated_at || project.created_at)}</span>
                            <div class="project-actions">
                                <button class="btn-icon" onclick="window.editProject('${project.id}')" title="Bewerken">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon" onclick="window.deleteProject('${project.id}')" title="Verwijderen">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                
                ${projects.length === 0 ? '<p class="empty-state">Geen projecten gevonden. Maak je eerste project aan!</p>' : ''}
            </div>
        </div>
    `;
}

function renderFilesTab() {
    return `
        <div class="tab-content">
            <div class="content-header">
                <h2>Bestanden</h2>
                <button class="btn-primary" onclick="window.showUploadModal()">
                    Bestand Uploaden
                </button>
            </div>
            
            <div class="files-table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Bestandsnaam</th>
                            <th>Project</th>
                            <th>Grootte</th>
                            <th>Upload Datum</th>
                            <th>Acties</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${files.map(file => `
                            <tr>
                                <td><strong>${file.filename}</strong></td>
                                <td>${file.project_name || 'Onbekend'}</td>
                                <td>${formatBytes(file.size)}</td>
                                <td>${formatDate(file.upload_date)}</td>
                                <td>
                                    <button class="btn-icon" onclick='window.viewInViewer(${JSON.stringify(file)})' title="Bekijken">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                    <button class="btn-icon" onclick="window.deleteFile('${file.id}')" title="Verwijderen">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                ${files.length === 0 ? '<p class="empty-state">Geen bestanden gevonden.</p>' : ''}
            </div>
        </div>
    `;
}

function renderStatisticsTab() {
    if (!statistics) return '<p>Laden...</p>';

    return `
        <div class="tab-content">
            <div class="content-header">
                <h2>Statistieken</h2>
                <button class="btn-secondary" onclick="window.resetStatistics()">
                    Statistieken Resetten
                </button>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card glass-panel">
                    <div class="stat-icon">P</div>
                    <div class="stat-info">
                        <h3>${statistics.total_projects}</h3>
                        <p>Totaal Projecten</p>
                    </div>
                </div>
                
                <div class="stat-card glass-panel">
                    <div class="stat-icon">A</div>
                    <div class="stat-info">
                        <h3>${statistics.active_projects}</h3>
                        <p>Actieve Projecten</p>
                    </div>
                </div>
                
                <div class="stat-card glass-panel">
                    <div class="stat-icon">F</div>
                    <div class="stat-info">
                        <h3>${statistics.total_files}</h3>
                        <p>IFC Bestanden</p>
                    </div>
                </div>
                
                <div class="stat-card glass-panel">
                    <div class="stat-icon">S</div>
                    <div class="stat-info">
                        <h3>${formatBytes(statistics.total_storage)}</h3>
                        <p>Totale Opslag</p>
                    </div>
                </div>
                
                <div class="stat-card glass-panel">
                    <div class="stat-icon">Q</div>
                    <div class="stat-info">
                        <h3>${statistics.total_qr_codes}</h3>
                        <p>QR Codes</p>
                    </div>
                </div>
            </div>
            
            <div class="activity-section">
                <h3>Recente Activiteit</h3>
                <div class="activity-feed glass-panel">
                    ${activity.map(act => `
                        <div class="activity-item">
                            <div class="activity-icon">•</div>
                            <div class="activity-content">
                                <p><strong>${act.username}</strong> - ${act.action}</p>
                                <p class="activity-details">${act.details || ''}</p>
                                <span class="activity-time">${formatDate(act.timestamp)}</span>
                            </div>
                        </div>
                    `).join('')}
                    
                    ${activity.length === 0 ? '<p class="empty-state">Geen recente activiteit.</p>' : ''}
                </div>
            </div>
        </div>
    `;
}

function renderQRTab() {
    return `
        <div class="tab-content">
            <div class="content-header">
                <h2>QR Codes</h2>
                <button class="btn-primary" onclick="window.showGenerateQRModal()">
                    + QR Code Koppelen
                </button>
                <button class="btn-primary" onclick="window.showReserveQRModal()">
                    + QR Code Reserveren
                </button>
            </div>
            
            <div class="qr-grid">
                ${qrCodes.map(qr => `
                    <div class="qr-card glass-panel">
                        <div class="qr-image">
                            <img src="${API_URL}/qr-codes/${qr.id}.png" alt="QR Code" />
                        </div>
                        <div class="qr-info">
                            <p><strong>Project:</strong> ${qr.project_name || 'Onbekend'}</p>
                            <p><strong>Bestand:</strong> ${qr.filename || 'Onbekend'}</p>
                            <p><strong>Element ID:</strong> ${qr.element_id}</p>
                            <p class="qr-date">Aangemaakt: ${formatDate(qr.created_at)}</p>
                        </div>
                        <div class="qr-actions">
                            <a href="${API_URL}/qr-codes/${qr.id}.png" download class="btn-secondary">Download</a>
                            <button class="btn-icon" onclick="window.deleteQR('${qr.id}')" title="Verwijderen">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
                
                ${qrCodes.length === 0 ? '<p class="empty-state">Geen QR codes gevonden.</p>' : ''}
            </div>
        </div>
    `;
}

function render() {
    const app = document.getElementById('admin-app');
    if (!app) return;

    let content = '';

    switch (currentTab) {
        case 'projects':
            content = renderProjectsTab();
            break;
        case 'files':
            content = renderFilesTab();
            break;
        case 'statistics':
            content = renderStatisticsTab();
            break;
        case 'qr':
            content = renderQRTab();
            break;
    }

    app.innerHTML = `
        <div class="admin-container">
            ${renderHeader()}
            ${renderTabs()}
            <main class="admin-main">
                ${content}
            </main>
        </div>
        <div id="modal-container"></div>
    `;
}

// Tab switching
(window as any).switchTab = async (tab: string) => {
    currentTab = tab;

    // Fetch data for the tab
    switch (tab) {
        case 'projects':
            await fetchProjects();
            break;
        case 'files':
            await fetchFiles();
            break;
        case 'statistics':
            await fetchStatistics();
            await fetchActivity();
            break;
        case 'qr':
            await fetchQRCodes();
            break;
    }

    render();
};

// Project actions
(window as any).showCreateProjectModal = () => {
    showModal('Nieuw Project', `
        <form id="project-form">
            <div class="form-group">
                <label for="project-name">Naam *</label>
                <input type="text" id="project-name" required />
            </div>
            <div class="form-group">
                <label for="project-description">Beschrijving</label>
                <textarea id="project-description" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label for="project-status">Status</label>
                <select id="project-status">
                    <option value="active">Actief</option>
                    <option value="archived">Gearchiveerd</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="window.closeModal()">Annuleren</button>
                <button type="submit" class="btn-primary">Aanmaken</button>
            </div>
        </form>
    `, async (e: Event) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const name = (form.querySelector('#project-name') as HTMLInputElement).value;
        const description = (form.querySelector('#project-description') as HTMLTextAreaElement).value;
        const status = (form.querySelector('#project-status') as HTMLSelectElement).value;

        await fetch(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, status })
        });

        closeModal();
        await fetchProjects();
        render();
    });
};

(window as any).editProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    showModal('Project Bewerken', `
        <form id="project-form">
            <div class="form-group">
                <label for="project-name">Naam *</label>
                <input type="text" id="project-name" value="${project.name}" required />
            </div>
            <div class="form-group">
                <label for="project-description">Beschrijving</label>
                <textarea id="project-description" rows="3">${project.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="project-status">Status</label>
                <select id="project-status">
                    <option value="active" ${project.status === 'active' ? 'selected' : ''}>Actief</option>
                    <option value="archived" ${project.status === 'archived' ? 'selected' : ''}>Gearchiveerd</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="window.closeModal()">Annuleren</button>
                <button type="submit" class="btn-primary">Opslaan</button>
            </div>
        </form>
    `, async (e: Event) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const name = (form.querySelector('#project-name') as HTMLInputElement).value;
        const description = (form.querySelector('#project-description') as HTMLTextAreaElement).value;
        const status = (form.querySelector('#project-status') as HTMLSelectElement).value;

        await fetch(`${API_URL}/api/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, status })
        });

        closeModal();
        await fetchProjects();
        render();
    });
};

(window as any).deleteProject = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen?')) return;

    await fetch(`${API_URL}/api/projects/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });

    await fetchProjects();
    render();
};

// File actions
(window as any).showUploadModal = async () => {
    await fetchProjects();

    showModal('Bestand Uploaden', `
        <form id="upload-form">
            <div class="form-group">
                <label for="upload-project">Project *</label>
                <select id="upload-project" required>
                    <option value="">Selecteer project...</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="upload-file">IFC Bestand *</label>
                <input type="file" id="upload-file" accept=".ifc" required />
            </div>
            <div id="upload-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
                <p id="progress-text">0%</p>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="window.closeModal()">Annuleren</button>
                <button type="submit" class="btn-primary">Uploaden</button>
            </div>
        </form>
    `, async (e: Event) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const projectId = (form.querySelector('#upload-project') as HTMLSelectElement).value;
        const fileInput = form.querySelector('#upload-file') as HTMLInputElement;
        const file = fileInput.files?.[0];

        if (!file) return;

        const progressDiv = document.getElementById('upload-progress')!;
        const progressFill = document.getElementById('progress-fill')!;
        const progressText = document.getElementById('progress-text')!;
        progressDiv.style.display = 'block';
        progressText.textContent = "Laden...";

        try {
            // 1. Get Upload Link (Ticket or New Reservation)
            let uploadUrl, storagePath, fileId;

            // Check for pre-linked ID in filename (Project_GUID.ifc)
            // Regex: anything_UUID.ifc
            const uuidMatch = file.name.match(/_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.ifc$/i);

            if (uuidMatch) {
                fileId = uuidMatch[1];
                console.log("Pre-linked ID found:", fileId);
                progressText.textContent = "Pre-linked ID gevonden. Link ophalen...";

                // Get ticket for existing ID
                const res = await fetch(`${API_URL}/api/upload/ticket`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ projectId, fileId, fileName: file.name })
                });
                if (!res.ok) throw new Error('Kon geen upload link ophalen');
                const data = await res.json();
                uploadUrl = data.uploadUrl;
                storagePath = data.storagePath;

            } else {
                progressText.textContent = "Nieuwe upload reserveren...";
                // New reservation
                const res = await fetch(`${API_URL}/api/upload/reserve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ projectId, fileName: file.name })
                });
                if (!res.ok) throw new Error('Reserveren mislukt');
                const data = await res.json();
                uploadUrl = data.uploadUrl;
                storagePath = data.storagePath;
                fileId = data.fileId;
            }

            // 2. Direct Upload to Supabase
            progressText.textContent = "Uploaden naar Cloud...";

            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressText.textContent = `Uploaden: ${percent}%`;
                }
            });

            await new Promise((resolve, reject) => {
                xhr.open('PUT', uploadUrl);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve(true);
                    else reject(new Error('Upload mislukt: ' + xhr.statusText));
                };
                xhr.onerror = () => reject(new Error('Netwerkfout tijdens upload'));
                xhr.send(file);
            });

            // 3. Confirm
            progressText.textContent = "Verwerken...";
            const confirmRes = await fetch(`${API_URL}/api/upload/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fileId,
                    projectId,
                    fileName: file.name,
                    fileSize: file.size,
                    storagePath
                })
            });

            if (!confirmRes.ok) throw new Error('Bevestigen mislukt');

            closeModal();
            await fetchFiles();
            render();

        } catch (error: any) {
            console.error(error);
            alert('Fout: ' + error.message);
            progressDiv.style.display = 'none';
        }
    });
};

(window as any).showReserveQRModal = async () => {
    await fetchProjects();

    showModal('QR Code Reserveren', `
        <form id="reserve-qr-form">
            <div class="form-group">
                <label for="reserve-project">Project *</label>
                <select id="reserve-project" required>
                    <option value="">Selecteer project...</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="reserve-filename">Toekomstige bestandsnaam *</label>
                <input type="text" id="reserve-filename" placeholder="bijv. Constructie_V1.ifc" required />
            </div>
            
            <div id="reserve-result" style="display: none; margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.1); border-radius: 4px;">
                <p style="margin-bottom: 0.5rem; color: #4ade80; font-weight: bold;">Gereserveerd!</p>
                
                <div style="display: flex; gap: 1rem;">
                    <img id="result-qr-img" src="" style="width: 120px; height: 120px; background: white; padding: 5px; border-radius: 4px;" />
                    <div style="flex: 1;">
                        <p style="font-size: 0.9em; margin-bottom: 5px;"><strong>Bestandsnaam moet worden:</strong></p>
                        <code id="result-filename" style="display: block; padding: 4px; background: #000; color: #eee; border-radius: 3px; word-break: break-all;"></code>
                        <p style="font-size: 0.8em; margin-top: 5px; color: #aaa;">Hernoem je bestand exact zo v-r uploaden.</p>
                        <a id="result-download" href="#" download target="_blank" class="btn-secondary" style="margin-top: 10px; display: inline-block; font-size: 0.8rem;">Download QR</a>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="window.closeModal()">Sluiten</button>
                <button type="submit" class="btn-primary">Genereer</button>
            </div>
        </form>
    `, async (e: Event) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const projectId = (form.querySelector('#reserve-project') as HTMLSelectElement).value;
        const fileName = (form.querySelector('#reserve-filename') as HTMLInputElement).value;

        try {
            const res = await fetch(`${API_URL}/api/upload/reserve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ projectId, fileName })
            });

            if (!res.ok) throw new Error('Reserveren mislukt');
            const data = await res.json();

            const resultDiv = document.getElementById('reserve-result')!;
            const qrImg = document.getElementById('result-qr-img') as HTMLImageElement;
            const filenameCode = document.getElementById('result-filename')!;
            const downloadLink = document.getElementById('result-download') as HTMLAnchorElement;

            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.webUrl)}`;

            // Construct new filename with ID
            // Assuming data.storagePath contains the format projectId/uuid_cleanName
            // We just want to show "uuid_cleanName" or similar.
            // data.webUrl contains the ID.
            const fileId = data.fileId;
            const ext = fileName.split('.').pop() || 'ifc';
            const base = fileName.replace('.' + ext, '');
            const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const targetName = `${safeBase}_${fileId}.${ext}`;

            resultDiv.style.display = 'block';
            qrImg.src = qrUrl;
            filenameCode.textContent = targetName;
            downloadLink.href = qrUrl;

        } catch (error: any) {
            alert('Fout: ' + error.message);
        }
    });
};


(window as any).deleteQR = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze QR code wilt verwijderen?')) return;

    await fetch(`${API_URL} /api/qr / ${id} `, {
        method: 'DELETE',
        credentials: 'include'
    });

    await fetchQRCodes();
    render();
};

// Modal helpers
function showModal(title: string, content: string, onSubmit?: (e: Event) => void) {
    const modalContainer = document.getElementById('modal-container')!;
    modalContainer.innerHTML = `
    < div class="modal-overlay" onclick = "window.closeModal()" >
        <div class="modal glass-panel" onclick = "event.stopPropagation()" >
            <div class="modal-header" >
                <h2>${title} </h2>
                    < button class="modal-close" onclick = "window.closeModal()" >×</button>
                        </div>
                        < div class="modal-body" >
                            ${content}
</div>
    </div>
    </div>
        `;

    if (onSubmit) {
        const form = modalContainer.querySelector('form');
        form?.addEventListener('submit', onSubmit);
    }
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container')!;
    modalContainer.innerHTML = '';
}

(window as any).resetStatistics = async () => {
    if (!confirm('Weet je zeker dat je alle scan statistieken wilt resetten?')) return;

    try {
        const response = await fetch(`${API_URL}/api/statistics/reset`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Statistieken gereset.');
            await fetchStatistics();
            await fetchActivity();
            render();
        } else {
            const error = await response.json();
            alert('Fout bij resetten: ' + (error.error || 'Onbekende fout'));
        }
    } catch (error) {
        console.error('Reset error:', error);
        alert('Netwerkfout bij resetten.');
    }
};

(window as any).closeModal = closeModal;
(window as any).logout = logout;

// Initialize
async function init() {
    const authenticated = await checkAuth();
    if (!authenticated) return;

    await fetchProjects();
    render();
}

init();
