/** Picks a readable foreground (dark or light) for the given hex background. */
export function readableTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  // Perceived luminance (sRGB-weighted) is enough to choose black vs white.
  // The threshold is tuned for the pastel palette so light tints get dark text.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#ffffff';
}
