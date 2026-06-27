import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { useViewStore } from '../useViewStore';

describe('useViewStore', () => {
  beforeEach(() => {
    act(() => {
      useViewStore.setState({ viewMode: 'list' });
    });
  });

  it('默认视图为 list', () => {
    expect(useViewStore.getState().viewMode).toBe('list');
  });

  it('setViewMode 切换视图到 grid', () => {
    act(() => {
      useViewStore.getState().setViewMode('grid');
    });
    expect(useViewStore.getState().viewMode).toBe('grid');
  });

  it('toggleView 切换视图', () => {
    act(() => {
      useViewStore.getState().setViewMode('list');
    });
    act(() => {
      useViewStore.getState().toggleView();
    });
    expect(useViewStore.getState().viewMode).toBe('grid');

    act(() => {
      useViewStore.getState().toggleView();
    });
    expect(useViewStore.getState().viewMode).toBe('list');
  });
});
