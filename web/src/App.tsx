import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import AppRoutes from '@/router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWebSocketStore } from '@/stores/useWebSocketStore';

const RootApp: React.FC = () => {
  const token = useAuthStore((s) => s.token);
  const wsConnect = useWebSocketStore((s) => s.connect);

  useEffect(() => {
    if (token) {
      wsConnect();
    }
  }, [token, wsConnect]);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default RootApp;
