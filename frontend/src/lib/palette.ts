/**
 * Shared pastel palette for colours that are applied inline (SVG charts, status
 * dots, calendar events) rather than through Tailwind classes. Keeps inline
 * colours consistent with the theme tokens in `styles/index.css` and with the
 * seeded vocabulary colours in the backend.
 */
export const PASTEL = {
  lavender: '#8280e9',
  lavenderDark: '#6d5fd3',
  lilac: '#a976e0',
  mint: '#66c294',
  butter: '#e3b23c',
  coral: '#e57373',
  peach: '#e8a06a',
  sky: '#55abdb',
  teal: '#6fc2b0',
  slate: '#9d9db8',
  slateLight: '#c9c9dd',
} as const;
