import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './admin.css'
import { AdminLayout } from './components/layout/AdminLayout'
import { Dashboard } from './pages/Dashboard'
import { UsersPage } from './pages/Users'
import { ProjectsPage } from './pages/Projects'
import { ProjectDetailsPage } from './pages/ProjectDetails'
import { ProfilePage } from './pages/Profile'
import { Statistics } from './pages/Statistics'
import { ToastProvider } from './components/ui/toast'

ReactDOM.createRoot(document.getElementById('admin-app')!).render(
    <React.StrictMode>
        <ToastProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<AdminLayout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="projects" element={<ProjectsPage />} />
                        <Route path="projects/:id" element={<ProjectDetailsPage />} />
                        <Route path="users" element={<UsersPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="statistics" element={<Statistics />} />
                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Router>
        </ToastProvider>
    </React.StrictMode>,
)
