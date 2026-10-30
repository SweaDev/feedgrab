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

/** `:host { --fd-*: … }` block for a (partial) theme. */
export function themeToCss(theme: OverlayTheme = {}): string {
  const t = resolveTheme(theme);
  const vars = [
    ...Object.entries(t.colors).map(([k, v]) => `--fd-color-${kebab(k)}: ${v};`),
    `--fd-outline-width: ${t.outlineWidth};`,
    `--fd-outline-style: ${t.outlineStyle};`,
    `--fd-font-family: ${t.fontFamily};`,
    `--fd-font-size: ${t.fontSize};`,
    `--fd-z: ${t.zIndex};`,
  ];
  return `:host {\n  ${vars.join('\n  ')}\n}`;
}
