/** Where the overlay panel sits, in viewport px (its left and top edges). */
export type PanelPosition = { left: number; top: number };

/** Options for `framePanel`. */
export type FrameOptions = {
  /** Header text. */
  title?: string;
  /** Start here instead of the theme's corner (kept inside the viewport). */
  position?: PanelPosition;
  /** Called after the user moved the panel (drag or arrow keys), e.g. to remember it. */
  onMove?(p: PanelPosition): void;
};

/** Pixels an arrow key moves the panel. */
const KEY_STEP = 24;
/** Header height that must stay on screen. */
const MIN_VISIBLE = 32;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Gives the overlay panel a header that drags it (pointer or arrow keys, kept inside the
 * viewport) and a collapse button. Returns the body to render into and a cleanup.
 */
export function framePanel(
  panel: HTMLElement,
  opts: FrameOptions = {},
): { body: HTMLElement; destroy(): void } {
  const doc = panel.ownerDocument;
  const win = doc.defaultView;
  const bar = doc.createElement('div');
  bar.className = 'fd-bar';
  bar.tabIndex = 0;
  bar.title = 'Drag to move (or use the arrow keys)';
  const grip = doc.createElement('span');
  grip.className = 'fd-grip';
  grip.textContent = '⋮⋮';
  const title = doc.createElement('span');
  title.className = 'fd-title';
  title.textContent = opts.title ?? 'Feeds';
  const fold = doc.createElement('button');
  fold.type = 'button';
  fold.className = 'fd-fold';
  fold.setAttribute('data-fd-action', 'collapse');
  bar.append(grip, title, fold);
  const body = doc.createElement('div');
  body.className = 'fd-body';
  panel.replaceChildren(bar, body);

  const setFolded = (folded: boolean) => {
    panel.classList.toggle('fd-collapsed', folded);
    fold.textContent = folded ? '+' : '–';
    fold.setAttribute('aria-label', folded ? 'Expand panel' : 'Collapse panel');
    fold.setAttribute('aria-expanded', String(!folded));
  };
  setFolded(false);
  fold.addEventListener('click', () => setFolded(!panel.classList.contains('fd-collapsed')));

  let moved = false;
  const place = (left: number, top: number): PanelPosition => {
    const r = panel.getBoundingClientRect();
    const p = {
      left: clamp(left, 0, Math.max(0, (win?.innerWidth ?? 0) - r.width)),
      top: clamp(top, 0, Math.max(0, (win?.innerHeight ?? 0) - MIN_VISIBLE)),
    };
    Object.assign(panel.style, {
      left: `${p.left}px`,
      top: `${p.top}px`,
      right: 'auto',
      bottom: 'auto',
    });
    moved = true;
    return p;
  };
  if (opts.position) place(opts.position.left, opts.position.top);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element | null)?.closest?.('button')) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last: PanelPosition = { left: r.left, top: r.top };
    bar.setPointerCapture?.(e.pointerId);
    bar.classList.add('fd-dragging');
    const move = (ev: PointerEvent) => {
      last = place(ev.clientX - dx, ev.clientY - dy);
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      bar.classList.remove('fd-dragging');
      opts.onMove?.(last);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };
  const onKey = (e: KeyboardEvent) => {
    const d = ARROWS[e.key];
    if (!d || e.target !== bar) return;
    e.preventDefault();
    e.stopPropagation();
    const r = panel.getBoundingClientRect();
    opts.onMove?.(place(r.left + d[0] * KEY_STEP, r.top + d[1] * KEY_STEP));
  };
  // A moved panel stays on screen when the window shrinks.
  const onResize = () => {
    if (!moved) return;
    const r = panel.getBoundingClientRect();
    place(r.left, r.top);
  };
  bar.addEventListener('pointerdown', onDown);
  bar.addEventListener('keydown', onKey);
  win?.addEventListener('resize', onResize);
  return {
    body,
    destroy: () => win?.removeEventListener('resize', onResize),
  };
}
