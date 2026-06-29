import { describe, it, expect } from 'vitest';
import { isPreviewable } from '../preview';

describe('isPreviewable', () => {
  describe('正常场景', () => {
    it('jpg 应返回 true', () => {
      expect(isPreviewable('jpg')).toBe(true);
    });

    it('jpeg 应返回 true', () => {
      expect(isPreviewable('jpeg')).toBe(true);
    });

    it('png 应返回 true', () => {
      expect(isPreviewable('png')).toBe(true);
    });

    it('gif 应返回 true', () => {
      expect(isPreviewable('gif')).toBe(true);
    });

    it('pdf 应返回 true', () => {
      expect(isPreviewable('pdf')).toBe(true);
    });

    it('带点的后缀如 .jpg 应返回 true', () => {
      expect(isPreviewable('.jpg')).toBe(true);
    });

    it('大写后缀如 JPG 应返回 true', () => {
      expect(isPreviewable('JPG')).toBe(true);
    });
  });

  describe('边界/异常', () => {
    it('空字符串应返回 false', () => {
      expect(isPreviewable('')).toBe(false);
    });

    it('undefined 应返回 false', () => {
      expect(isPreviewable(undefined)).toBe(false);
    });

    it('不支持的格式如 docx 应返回 false', () => {
      expect(isPreviewable('docx')).toBe(false);
    });

    it('不支持的格式如 mp4 应返回 false', () => {
      expect(isPreviewable('mp4')).toBe(false);
    });

    it('不支持的格式如 zip 应返回 false', () => {
      expect(isPreviewable('zip')).toBe(false);
    });
  });
});
