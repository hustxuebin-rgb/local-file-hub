/**
 * @jest-environment jsdom
 *
 * 任务中心页面单元测试
 *
 * 测试范围：
 * - 初始加载态（Loading）
 * - 空任务列表（Empty 态）
 * - 上传/下载任务正常展示
 * - 进度条百分比计算
 * - 下拉刷新
 * - API 异常处理
 */

// React 18 act() 需要此标志
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

// ====== Mocks ======

let didShowCallback: (() => void) | null = null;
let pullDownRefreshCallback: (() => Promise<void>) | null = null;

const mockStopPullDownRefresh = jest.fn();

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    stopPullDownRefresh: mockStopPullDownRefresh,
  },
  useDidShow: (fn: () => void) => {
    didShowCallback = fn;
  },
  usePullDownRefresh: (fn: () => Promise<void>) => {
    pullDownRefreshCallback = fn;
  },
  stopPullDownRefresh: mockStopPullDownRefresh,
}));

jest.mock('@tarojs/components', () => {
  const React = require('react');
  const createMockComponent = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ...props, ref }, props.children),
    );
  return {
    View: createMockComponent('view'),
    Text: createMockComponent('text'),
  };
});

// Mock NutUI - 包含 Progress 组件
jest.mock('@nutui/nutui-react-taro', () => ({
  Loading: ({ children }: { children?: React.ReactNode }) =>
    `[Loading]${children}[/Loading]`,
  Empty: ({ description }: { description?: string }) =>
    `[Empty: ${description}]`,
  Progress: ({ percent, showText }: { percent: number; showText?: boolean }) =>
    `[Progress: ${percent}%${showText ? ` (${percent}%)` : ''}]`,
}));

// Mock API
const mockGetTasksList = jest.fn();

jest.mock('../../../utils/api', () => ({
  __esModule: true,
  getTasksList: mockGetTasksList,
}));

// ====== Imports ======
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { act } = require('react-dom/test-utils') as { act: (callback: () => void) => void };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRoot } = require('react-dom/client') as { createRoot: (container: HTMLElement) => { render: (el: React.ReactElement) => void; unmount: () => void } };

import TasksPage from '../index';

// ====== Helpers ======

function createTestContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'test-root';
  document.body.appendChild(container);
  return container;
}

interface RootLike {
  render: (el: React.ReactElement) => void;
  unmount: () => void;
}

let root: RootLike | null = null;
let container: HTMLDivElement | null = null;

function renderPage(): void {
  container = createTestContainer();
  root = createRoot(container);
  act(() => {
    root!.render(React.createElement(TasksPage));
  });
}

function unmountPage(): void {
  if (root) {
    act(() => { root!.unmount(); });
    root = null;
  }
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
}

/** 等待 useDidShow → loadTasks 全链路完成 */
async function waitForLoadComplete(): Promise<void> {
  if (didShowCallback) {
    act(() => {
      didShowCallback!();
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

// ====== Fixtures ======

const MOCK_UPLOAD_PROCESSING = {
  taskId: 'upload-task-1',
  fileName: 'vacation.jpg',
  totalSize: 12.5 * 1024 * 1024,
  finishedSize: 5.6 * 1024 * 1024,
  status: 1,
  taskType: 'upload' as const,
  createTime: '2026-06-28T10:00:00',
  updateTime: '2026-06-28T10:05:00',
};

const MOCK_UPLOAD_COMPLETED = {
  taskId: 'upload-task-2',
  fileName: 'report.pdf',
  totalSize: 2.1 * 1024 * 1024,
  finishedSize: 2.1 * 1024 * 1024,
  status: 3,
  taskType: 'upload' as const,
  createTime: '2026-06-28T09:00:00',
  updateTime: '2026-06-28T09:15:00',
};

const MOCK_DOWNLOAD_PROCESSING = {
  taskId: 'download-task-1',
  fileName: 'data.zip',
  totalSize: 500 * 1024 * 1024,
  finishedSize: 150 * 1024 * 1024,
  status: 1,
  taskType: 'download' as const,
  createTime: '2026-06-28T11:00:00',
  updateTime: '2026-06-28T11:20:00',
};

// ====== Tests ======

describe('TasksPage 任务中心页面', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    didShowCallback = null;
    pullDownRefreshCallback = null;
  });

  afterEach(() => {
    unmountPage();
  });

  // ====== 初始加载 ======

  describe('初始加载', () => {
    it('加载中应显示 Loading 组件', () => {
      mockGetTasksList.mockReturnValue(new Promise(() => {}));

      renderPage();
      act(() => { if (didShowCallback) didShowCallback(); });

      expect(container!.innerHTML).toContain('加载中');
    });

    it('API 加载成功后应展示数据', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING, MOCK_UPLOAD_COMPLETED],
        downloadTasks: [MOCK_DOWNLOAD_PROCESSING],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('vacation.jpg');
      expect(container!.innerHTML).toContain('report.pdf');
      expect(container!.innerHTML).toContain('data.zip');
    });
  });

  // ====== 空状态 ======

  describe('空任务列表', () => {
    it('无任务时应显示 "没有进行中的任务"', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('没有进行中的任务');
    });
  });

  // ====== 正常展示 ======

  describe('任务展示', () => {
    it('应分别展示上传任务和下载任务 Section', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING],
        downloadTasks: [MOCK_DOWNLOAD_PROCESSING],
      });

      renderPage();
      await waitForLoadComplete();

      const html = container!.innerHTML;
      expect(html).toContain('上传任务');
      expect(html).toContain('下载任务');
      expect(html).toContain('📤');
      expect(html).toContain('📥');
    });

    it('应展示文件名和进度条', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING, MOCK_UPLOAD_COMPLETED],
        downloadTasks: [MOCK_DOWNLOAD_PROCESSING],
      });

      renderPage();
      await waitForLoadComplete();

      const html = container!.innerHTML;
      // 进度条百分比
      expect(html).toContain('[Progress: 45% (45%)]');   // 5.6/12.5 ≈ 45%
      expect(html).toContain('[Progress: 100% (100%)]'); // 已完成
      expect(html).toContain('[Progress: 30% (30%)]');   // 150/500 = 30%
    });

    it('应展示状态标签（进行中/已完成）', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING, MOCK_UPLOAD_COMPLETED],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      const html = container!.innerHTML;
      expect(html).toContain('进行中');
      expect(html).toContain('已完成');
    });

    it('应显示任务数量', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING, MOCK_UPLOAD_COMPLETED],
        downloadTasks: [MOCK_DOWNLOAD_PROCESSING],
      });

      renderPage();
      await waitForLoadComplete();

      const html = container!.innerHTML;
      expect(html).toContain('(2)'); // 上传任务数量
      expect(html).toContain('(1)'); // 下载任务数量
    });
  });

  // ====== Section 条件渲染 ======

  describe('Section 条件渲染', () => {
    it('仅上传任务时不展示下载 Section', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [MOCK_UPLOAD_PROCESSING],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('上传任务');
      expect(container!.innerHTML).not.toContain('下载任务');
    });

    it('仅下载任务时不展示上传 Section', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [],
        downloadTasks: [MOCK_DOWNLOAD_PROCESSING],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('下载任务');
      expect(container!.innerHTML).not.toContain('上传任务');
    });
  });

  // ====== 下拉刷新 ======

  describe('下拉刷新', () => {
    it('下拉刷新应重新加载任务并调用 stopPullDownRefresh', async () => {
      mockGetTasksList
        .mockResolvedValueOnce({ uploadTasks: [], downloadTasks: [] })
        .mockResolvedValueOnce({
          uploadTasks: [MOCK_UPLOAD_PROCESSING],
          downloadTasks: [],
        });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('没有进行中的任务');

      // 触发下拉刷新
      await act(async () => {
        await pullDownRefreshCallback?.();
      });

      // 等待刷新完成
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(container!.innerHTML).toContain('vacation.jpg');
      expect(mockStopPullDownRefresh).toHaveBeenCalled();
    });
  });

  // ====== 异常处理 ======

  describe('API 异常处理', () => {
    it('API 异常时应显示空状态', async () => {
      mockGetTasksList.mockRejectedValue(new Error('Network error'));

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('没有进行中的任务');
    });

    it('API 返回 null 字段时应使用空数组', async () => {
      mockGetTasksList.mockResolvedValue({ uploadTasks: null, downloadTasks: null });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('没有进行中的任务');
    });
  });

  // ====== 边界条件 ======

  describe('边界条件', () => {
    it('totalSize 为 0 时进度应为 0%', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [{
          taskId: 'zero-size',
          fileName: 'empty.txt',
          totalSize: 0,
          finishedSize: 0,
          status: 1,
          taskType: 'upload' as const,
          createTime: '2026-06-28T10:00:00',
          updateTime: '2026-06-28T10:00:00',
        }],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('[Progress: 0% (0%)]');
    });

    it('finishedSize 超过 totalSize 时进度不应超过 100%', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [{
          taskId: 'overflow',
          fileName: 'overflow.bin',
          totalSize: 100,
          finishedSize: 200,
          status: 1,
          taskType: 'upload' as const,
          createTime: '2026-06-28T10:00:00',
          updateTime: '2026-06-28T10:00:00',
        }],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      expect(container!.innerHTML).toContain('[Progress: 100% (100%)]');
    });

    it('status 为未知值时应回退到默认标签', async () => {
      mockGetTasksList.mockResolvedValue({
        uploadTasks: [{
          taskId: 'unknown-status',
          fileName: 'unknown.dat',
          totalSize: 1024,
          finishedSize: 512,
          status: 99,
          taskType: 'upload' as const,
          createTime: '2026-06-28T10:00:00',
          updateTime: '2026-06-28T10:00:00',
        }],
        downloadTasks: [],
      });

      renderPage();
      await waitForLoadComplete();

      // 应回退到 status 0 的标签（等待中）
      expect(container!.innerHTML).toContain('等待中');
    });
  });
});
