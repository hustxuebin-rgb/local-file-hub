import { createBrowserRouter, Navigate } from 'react-router-dom';
import AuthGuard from '@/components/layout/AuthGuard';
import MainLayout from '@/components/layout/MainLayout';
import UserCenterLayout from '@/components/layout/UserCenterLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import LoginPage from '@/components/pages/login/LoginPage';
import FileManager from '@/components/pages/files/FileManager';
import UploadPage from '@/components/pages/upload/UploadPage';
import ShareMyPage from '@/components/pages/share/ShareMyPage';
import ShareReceivedPage from '@/components/pages/share/ShareReceivedPage';
import RecyclePage from '@/components/pages/recycle/RecyclePage';
import UserManagePage from '@/components/pages/admin/UserManagePage';
import DiskManagePage from '@/components/pages/admin/DiskManagePage';
import ShareAuditPage from '@/components/pages/admin/ShareAuditPage';
import SyncLogsPage from '@/components/pages/admin/SyncLogsPage';
import AlertsPage from '@/components/pages/admin/AlertsPage';
import ProfilePage from '@/components/pages/center/ProfilePage';
import StoragePage from '@/components/pages/center/StoragePage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/files" replace />,
          },
          {
            path: 'files',
            element: <FileManager />,
          },
          {
            path: 'upload',
            element: <UploadPage />,
          },
          {
            path: 'share/my',
            element: <ShareMyPage />,
          },
          {
            path: 'share/received',
            element: <ShareReceivedPage />,
          },
          {
            path: 'recycle',
            element: <RecyclePage />,
          },
        ],
      },
      {
        path: 'user-center',
        element: <UserCenterLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/user-center/profile" replace />,
          },
          {
            path: 'profile',
            element: <ProfilePage />,
          },
          {
            path: 'storage',
            element: <StoragePage />,
          },
        ],
      },
      {
        path: 'admin-panel',
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/admin-panel/users" replace />,
          },
          {
            path: 'users',
            element: <UserManagePage />,
          },
          {
            path: 'disks',
            element: <DiskManagePage />,
          },
          {
            path: 'shares',
            element: <ShareAuditPage />,
          },
          {
            path: 'sync-logs',
            element: <SyncLogsPage />,
          },
          {
            path: 'alerts',
            element: <AlertsPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/files" replace />,
  },
]);

export default router;
