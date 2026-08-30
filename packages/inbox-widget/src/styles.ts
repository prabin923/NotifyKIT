// Scoped entirely inside the shadow root: the host page's CSS can never leak in here,
// and nothing here can leak out onto the host page. No Tailwind, no external stylesheet.
export const STYLES = `
:host {
  all: initial;
  display: inline-block;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.4;
  --nk-bg: #ffffff;
  --nk-fg: #0f172a;
  --nk-muted: #64748b;
  --nk-border: #e2e8f0;
  --nk-hover: #f1f5f9;
  --nk-accent: #4f46e5;
  --nk-accent-fg: #ffffff;
  --nk-danger: #dc2626;
  --nk-focus: #6366f1;
  --nk-unread-dot: #4f46e5;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --nk-bg: #0f172a;
    --nk-fg: #f1f5f9;
    --nk-muted: #94a3b8;
    --nk-border: #1e293b;
    --nk-hover: #1e293b;
    --nk-accent: #818cf8;
    --nk-accent-fg: #0f172a;
    --nk-danger: #f87171;
    --nk-focus: #818cf8;
    --nk-unread-dot: #818cf8;
    color-scheme: dark;
  }
}

:host([theme="dark"]) {
  --nk-bg: #0f172a;
  --nk-fg: #f1f5f9;
  --nk-muted: #94a3b8;
  --nk-border: #1e293b;
  --nk-hover: #1e293b;
  --nk-accent: #818cf8;
  --nk-accent-fg: #0f172a;
  --nk-danger: #f87171;
  --nk-focus: #818cf8;
  --nk-unread-dot: #818cf8;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }

.nk-root { position: relative; }

.nk-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--nk-border);
  border-radius: 999px;
  background: var(--nk-bg);
  color: var(--nk-fg);
  cursor: pointer;
}
.nk-trigger:hover { background: var(--nk-hover); }
.nk-trigger:focus-visible,
.nk-tab:focus-visible,
.nk-mark-all:focus-visible,
.nk-load-more:focus-visible,
.nk-item:focus-visible,
.nk-item-archive:focus-visible,
.nk-retry:focus-visible {
  outline: 2px solid var(--nk-focus);
  outline-offset: 2px;
}

.nk-bell { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; }

.nk-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--nk-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.nk-badge[hidden] { display: none; }

.nk-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.nk-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 340px;
  max-width: calc(100vw - 24px);
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: var(--nk-bg);
  color: var(--nk-fg);
  border: 1px solid var(--nk-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  z-index: 2147483000;
  overflow: hidden;
}
.nk-panel[hidden] { display: none; }

.nk-header { padding: 12px 14px 8px; border-bottom: 1px solid var(--nk-border); }
.nk-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nk-title { margin: 0; font-size: 14px; font-weight: 600; }

.nk-mark-all {
  border: none;
  background: none;
  color: var(--nk-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.nk-mark-all:hover:not(:disabled) { background: var(--nk-hover); }
.nk-mark-all:disabled { color: var(--nk-muted); cursor: not-allowed; }

.nk-tabs { display: flex; gap: 4px; margin-top: 8px; }
.nk-tab {
  border: none;
  background: none;
  color: var(--nk-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.nk-tab:hover { background: var(--nk-hover); }
.nk-tab[aria-selected="true"] { background: var(--nk-accent); color: var(--nk-accent-fg); }

.nk-list { overflow-y: auto; flex: 1 1 auto; min-height: 80px; }

.nk-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--nk-border);
  cursor: pointer;
}
.nk-item:hover { background: var(--nk-hover); }
.nk-item-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: transparent;
}
.nk-item--unread .nk-item-dot { background: var(--nk-unread-dot); }
.nk-item-content { flex: 1 1 auto; min-width: 0; }
.nk-item-title { margin: 0; font-size: 13px; font-weight: 600; }
.nk-item--unread .nk-item-title { font-weight: 700; }
.nk-item-body {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--nk-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nk-item-time { display: block; margin-top: 4px; font-size: 11px; color: var(--nk-muted); }

.nk-item-archive {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--nk-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.nk-item-archive:hover { background: var(--nk-hover); color: var(--nk-fg); }

.nk-state { padding: 24px 16px; text-align: center; font-size: 13px; color: var(--nk-muted); }
.nk-state[data-tone="error"] { color: var(--nk-danger); }
.nk-retry {
  margin-top: 8px;
  border: 1px solid var(--nk-border);
  background: var(--nk-bg);
  color: var(--nk-fg);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.nk-retry:hover { background: var(--nk-hover); }

.nk-footer { padding: 8px 14px; border-top: 1px solid var(--nk-border); }
.nk-footer[hidden] { display: none; }
.nk-load-more {
  width: 100%;
  border: 1px solid var(--nk-border);
  background: var(--nk-bg);
  color: var(--nk-fg);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.nk-load-more:hover:not(:disabled) { background: var(--nk-hover); }
.nk-load-more:disabled { cursor: not-allowed; opacity: 0.6; }
.nk-load-more[hidden] { display: none; }
`;
