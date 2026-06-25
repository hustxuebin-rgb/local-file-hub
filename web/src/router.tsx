import { Routes, Route, Navigate } from 'react-router-dom';
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

/**
 * 应用路由定义
 * 使用 <Routes> + <Route> 组件式 API 替代 createBrowserRouter，
 * 以避免 React Router v7 中 pathless layout route 在跨布局导航时的渲染 bug
 */
function AppRoutes(): React.ReactNode {
  return (
    <Routes>
      {/* 登录页 - 无需认证 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 需认证的路由 - AuthGuard 包裹 */}
      <Route element={<AuthGuard />}>
        {/* 个人中心 - 独立页面 */}
        <Route path="user-center" element={<UserCenterLayout />}>
          <Route index element={<Navigate to="/user-center/profile" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="storage" element={<StoragePage />} />
        </Route>

        {/* 后台管理 - 独立页面 */}
        <Route path="admin-panel" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin-panel/users" replace />} />
          <Route path="users" element={<UserManagePage />} />
          <Route path="disks" element={<DiskManagePage />} />
          <Route path="shares" element={<ShareAuditPage />} />
          <Route path="sync-logs" element={<SyncLogsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>

        {/* 主应用 - MainLayout 包裹所有主功能页面 */}
        <Route element={<MainLayout />}>
          <Route path="files" element={<FileManager />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="share/my" element={<ShareMyPage />} />
          <Route path="share/received" element={<ShareReceivedPage />} />
          <Route path="recycle" element={<RecyclePage />} />
        </Route>

        {/* 默认重定向到文件管理 */}
        <Route path="*" element={<Navigate to="/files" replace />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
