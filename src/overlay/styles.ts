/** Base overlay CSS; uses only `--fd-*` variables. Followed by `customCss`. */
export const BASE_CSS = `
:host { all: initial; }
.fd-layer { position: fixed; inset: 0; pointer-events: none; }
.fd-box {
  position: fixed; box-sizing: border-box; pointer-events: none;
  outline: var(--fd-outline-width) var(--fd-outline-style) var(--fd-color-item);
}
.fd-box.fd-feed { outline-color: var(--fd-color-feed); }
.fd-box.fd-item { outline-color: var(--fd-color-item); }
.fd-box.fd-excluded { outline-color: var(--fd-color-excluded); }
.fd-box.fd-pending { outline-color: var(--fd-color-pending); }
.fd-box.fd-part { outline-color: var(--fd-color-part); }
.fd-box.fd-hover { outline-color: var(--fd-color-accent); outline-style: dashed; }
.fd-label {
  position: absolute; top: 0; left: 0; transform: translateY(-100%);
  font: 11px/1.4 var(--fd-font-family); color: #fff; background: var(--fd-color-feed);
  padding: 0 4px; white-space: nowrap;
}
.fd-panel {
  position: fixed; pointer-events: auto; width: 340px; max-height: 80vh; overflow: auto;
  background: var(--fd-color-panel-bg); color: var(--fd-color-panel-fg);
  font-family: var(--fd-font-family); font-size: var(--fd-font-size);
  border: 1px solid var(--fd-color-accent); border-radius: 8px; padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.fd-panel:empty { display: none; }
.fd-pos-top-right { top: 12px; right: 12px; }
.fd-pos-top-left { top: 12px; left: 12px; }
.fd-pos-bottom-right { bottom: 12px; right: 12px; }
.fd-pos-bottom-left { bottom: 12px; left: 12px; }
.fd-panel h2 { font-size: 1.1em; margin: 0 0 8px; }
.fd-panel h3 { font-size: 1em; margin: 10px 0 4px; }
.fd-panel button {
  font: inherit; border: 1px solid var(--fd-color-accent); background: transparent;
  color: var(--fd-color-accent); border-radius: 4px; padding: 2px 8px; margin: 2px; cursor: pointer;
}
.fd-panel button.fd-primary { background: var(--fd-color-accent); color: var(--fd-color-panel-bg); }
.fd-panel input[type="text"], .fd-panel select { font: inherit; width: 100%; box-sizing: border-box; margin: 2px 0; }
.fd-row { display: flex; gap: 4px; align-items: center; }
.fd-feed-row.fd-selected { font-weight: bold; }
.fd-count { opacity: 0.75; font-size: 0.9em; }
.fd-error { color: var(--fd-color-excluded); }
.fd-rules li { display: flex; justify-content: space-between; gap: 4px; }
`;
