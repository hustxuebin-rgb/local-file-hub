const PREVIEW_SUFFIXES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'pdf']);

/**
 * 判断文件后缀是否支持浏览器预览（图片+PDF）
 * @param fileSuffix 文件后缀（可带点，如 ".jpg" 或 "jpg"）
 */
export function isPreviewable(fileSuffix?: string): boolean {
  if (!fileSuffix) return false;
  return PREVIEW_SUFFIXES.has(fileSuffix.replace(/^\./, '').toLowerCase());
}
