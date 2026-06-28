import { create } from 'zustand';
import {
  getFriendList as getFriendListApi,
  deleteFriend as deleteFriendApi,
  getReceivedRequests as getReceivedRequestsApi,
} from '@/api';
import type { FriendInfo } from '@/types';

interface FriendState {
  friends: FriendInfo[];
  total: number;
  pendingRequestsCount: number;
  loading: boolean;

  fetchFriends: () => Promise<void>;
  fetchPendingCount: () => Promise<void>;
  deleteFriend: (friendId: number) => Promise<void>;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  total: 0,
  pendingRequestsCount: 0,
  loading: false,

  fetchFriends: async () => {
    set({ loading: true });
    try {
      const res = await getFriendListApi();
      if (res.data) {
        set({ friends: res.data.list, total: res.data.total });
      }
    } finally {
      set({ loading: false });
    }
  },

  fetchPendingCount: async () => {
    try {
      const res = await getReceivedRequestsApi(0); // status=0 待处理
      if (res.data) {
        set({ pendingRequestsCount: res.data.total });
      }
    } catch {
      // ignore
    }
  },

  deleteFriend: async (friendId: number) => {
    try {
      await deleteFriendApi(friendId);
      get().fetchFriends();
    } catch (err) {
      throw err;
    }
  },
}));
