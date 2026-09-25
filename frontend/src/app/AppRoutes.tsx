import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RequirePermission } from './RequirePermission';

/**
 * Route-level code splitting: the shell, authentication and dashboard load
 * eagerly; heavier pages (board, reports, calendar, admin) load on demand.
 */
const ProjectsPage = lazy(() => import('../pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const ProjectDetailPage = lazy(() =>
  import('../pages/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })),
);
const TaskDetailPage = lazy(() => import('../pages/TaskDetailPage').then((module) => ({ default: module.TaskDetailPage })));
const MyTasksPage = lazy(() => import('../pages/MyTasksPage').then((module) => ({ default: module.MyTasksPage })));
const CalendarPage = lazy(() => import('../pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const TeamPage = lazy(() => import('../pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })),
);
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const AdminUsersPage = lazy(() => import('../pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })));
const AdminAuditPage = lazy(() => import('../pages/AdminAuditPage').then((module) => ({ default: module.AdminAuditPage })));
const AdminVocabulariesPage = lazy(() =>
  import('../pages/AdminVocabulariesPage').then((module) => ({ default: module.AdminVocabulariesPage })),
);
const AdminImportPage = lazy(() => import('../pages/AdminImportPage').then((module) => ({ default: module.AdminImportPage })));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/my-tasks" element={<MyTasksPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/admin/users"
          element={
            <RequirePermission permission="user:manage">
              <AdminUsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequirePermission permission="audit:view">
              <AdminAuditPage />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/vocabularies"
          element={
            <RequirePermission permission="vocabulary:manage">
              <AdminVocabulariesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/import"
          element={
            <RequirePermission permission="import:run">
              <AdminImportPage />
            </RequirePermission>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
