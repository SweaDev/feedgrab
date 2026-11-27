/** Highlight states. */
export type HighlightKind = 'feed' | 'item' | 'excluded' | 'pending' | 'part';

/** Overlay theme; applied as `--fd-*` custom properties inside the shadow root. */
export type OverlayTheme = {
  colors?: Partial<Record<HighlightKind | 'panelBg' | 'panelFg' | 'accent', string>>;
  outlineWidth?: string;
  outlineStyle?: string;
  fontFamily?: string;
  fontSize?: string;
  panelPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  zIndex?: number;
  /**
   * `light`, `dark`, or `auto` (default): follow the page's `prefers-color-scheme`. Colors given in
   * `colors` win in both schemes.
   */
  colorScheme?: 'light' | 'dark' | 'auto';
};

/** A theme with every value filled in. */
export type ResolvedTheme = Required<Omit<OverlayTheme, 'colors'>> & {
  colors: Required<NonNullable<OverlayTheme['colors']>>;
};

/** Default overlay theme. */
export const DEFAULT_THEME: ResolvedTheme = Object.freeze({
  colors: Object.freeze({
    feed: '#2563eb',
    item: '#16a34a',
    excluded: '#dc2626',
    pending: '#d97706',
    part: '#9333ea',
    panelBg: '#ffffff',
    panelFg: '#111827',
    accent: '#2563eb',
  }),
  outlineWidth: '2px',
  outlineStyle: 'solid',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
  panelPosition: 'top-right',
  zIndex: 2147483646,
  colorScheme: 'auto',
}) as ResolvedTheme;

/** Colors of the dark scheme. */
const DARK_COLORS: ResolvedTheme['colors'] = Object.freeze({
  feed: '#60a5fa',
  item: '#4ade80',
  excluded: '#f87171',
  pending: '#fbbf24',
  part: '#c084fc',
  panelBg: '#18181b',
  panelFg: '#f4f4f5',
  accent: '#60a5fa',
});

/** Dark overlay theme (`colorScheme: 'dark'`); pass it, or a part of it, as `theme`. */
export const DARK_THEME: ResolvedTheme = Object.freeze({
  ...DEFAULT_THEME,
  colors: DARK_COLORS,
  colorScheme: 'dark',
}) as ResolvedTheme;

/** Merges a partial theme over the defaults. */
export function resolveTheme(theme: OverlayTheme = {}): ResolvedTheme {
  return {
    ...DEFAULT_THEME,
    ...theme,
    colors: { ...DEFAULT_THEME.colors, ...theme.colors },
  } as ResolvedTheme;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const colorVars = (colors: Record<string, string>) =>
  Object.entries(colors).map(([k, v]) => `--fd-color-${kebab(k)}: ${v};`);

/**
 * `:host { --fd-*: … }` block for a (partial) theme; with `colorScheme: 'auto'` also a
 * `prefers-color-scheme: dark` block with the dark colors the theme doesn't set itself.
 */
export function themeToCss(theme: OverlayTheme = {}): string {
  const t = resolveTheme(theme);
  const dark = t.colorScheme === 'dark';
  const colors = dark ? { ...DARK_COLORS, ...theme.colors } : t.colors;
  const vars = [
    ...colorVars(colors),
    `--fd-color-scheme: ${dark ? 'dark' : 'light'};`,
    `--fd-outline-width: ${t.outlineWidth};`,
    `--fd-outline-style: ${t.outlineStyle};`,
    `--fd-font-family: ${t.fontFamily};`,
    `--fd-font-size: ${t.fontSize};`,
    `--fd-z: ${t.zIndex};`,
  ];
  let css = `:host {\n  ${vars.join('\n  ')}\n}`;
  if (t.colorScheme === 'auto') {
    const own = new Set(Object.keys(theme.colors ?? {}));
    const darkVars = [
      ...colorVars(Object.fromEntries(Object.entries(DARK_COLORS).filter(([k]) => !own.has(k)))),
      '--fd-color-scheme: dark;',
    ];
    css += `\n@media (prefers-color-scheme: dark) {\n  :host {\n    ${darkVars.join('\n    ')}\n  }\n}`;
  }
  return css;
}
