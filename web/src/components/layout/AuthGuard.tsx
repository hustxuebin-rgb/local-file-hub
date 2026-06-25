import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * 认证守卫组件
 * 检查用户是否已登录，未登录时重定向到 /login
 */
function AuthGuard(): React.ReactNode {
  const isLoggedIn = useAuthStore((state) => !!state.token);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default AuthGuard;
