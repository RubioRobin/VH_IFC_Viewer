import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './admin.css'
import { AdminLayout } from './components/layout/AdminLayout'
import { Dashboard } from './pages/Dashboard'
import { UsersPage } from './pages/Users'
import { ProjectsPage } from './pages/Projects'
import { ProjectDetailsPage } from './pages/ProjectDetails'
import { SettingsPage } from './pages/Settings'
import { ToastProvider } from './components/ui/toast'
import { LoginPage } from './pages/Login'

ReactDOM.createRoot(document.getElementById('admin-app')!).render(
    <React.StrictMode>
        <ToastProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<AdminLayout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="projects" element={<ProjectsPage />} />
                        <Route path="projects/:id" element={<ProjectDetailsPage />} />
                        <Route path="users" element={<UsersPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Router>
        </ToastProvider>
    </React.StrictMode>,
)
