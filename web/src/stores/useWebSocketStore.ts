import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

interface WSState {
  connected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  send: (msg: object) => void;
}

export const useWebSocketStore = create<WSState>((set, get) => {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  return {
    connected: false,
    error: null,

    connect: () => {
      const token = useAuthStore.getState().token;
      if (!token) return;

      const host = window.location.hostname;
      ws = new WebSocket(`ws://${host}:8080/ws?token=${token}`);

      ws.onopen = () => {
        set({ connected: true });
        retryCount = 0;
      };

      ws.onerror = () => {
        set({
          connected: false,
          error: 'WebSocket 连接失败：请确认服务端已启动且 8080 端口可访问',
        });
      };

      ws.onclose = () => {
        set({ connected: false });
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount++;
        reconnectTimer = setTimeout(() => get().connect(), delay);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        console.log('[WS]', msg.type, msg.data);
      };
    },

    disconnect: () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    },

    send: (msg: object) => {
      ws?.send(JSON.stringify(msg));
    },
  };
});
