import { extractDeepLink, InboxApiError, InboxClient, type InboxItem, type InboxStatusFilter } from './api';
import { STYLES } from './styles';
import { relativeTime } from './time';

const DEFAULT_POLL_INTERVAL = 30_000;
const DEFAULT_PAGE_SIZE = 20;

const TEMPLATE = `
<style>${STYLES}</style>
<div class="nk-root">
  <button type="button" class="nk-trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications">
    <svg class="nk-bell" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a5 5 0 0 0-5 5v2.6c0 .5-.16 1-.46 1.4L5 14.7V16h14v-1.3l-1.54-1.7c-.3-.4-.46-.9-.46-1.4V8a5 5 0 0 0-5-5Z"/>
      <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0"/>
    </svg>
    <span class="nk-badge" hidden></span>
  </button>
  <div class="nk-live" aria-live="polite" role="status"></div>
  <div class="nk-panel" role="dialog" aria-modal="false" aria-labelledby="nk-title" hidden>
    <div class="nk-header">
      <div class="nk-header-row">
        <h2 class="nk-title" id="nk-title">Notifications</h2>
        <button type="button" class="nk-mark-all">Mark all read</button>
      </div>
      <div class="nk-tabs" role="tablist" aria-label="Filter notifications">
        <button type="button" class="nk-tab" role="tab" data-filter="unread" aria-selected="true">Unread</button>
        <button type="button" class="nk-tab" role="tab" data-filter="all" aria-selected="false">All</button>
      </div>
    </div>
    <div class="nk-list"></div>
    <div class="nk-footer" hidden>
      <button type="button" class="nk-load-more" hidden>Load more</button>
    </div>
  </div>
</div>
`;

const BASE_ELEMENT: typeof HTMLElement = typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

let warnedMissingToken = false;

/**
 * `<notifykit-inbox>` — a self-contained, shadow-DOM notification bell + popover.
 * Emits `notifykit:open`, `notifykit:select`, and `notifykit:count` on itself (see README).
 */
export class NotifykitInboxElement extends BASE_ELEMENT {
  static get observedAttributes(): string[] {
    return ['token', 'base-url', 'poll-interval', 'theme', 'page-size'];
  }

  #client: InboxClient;
  #items: InboxItem[] = [];
  #nextCursor: string | null = null;
  #filter: Exclude<InboxStatusFilter, 'read'> = 'unread';
  #open = false;
  #loading = false;
  #loadingMore = false;
  #error: string | null = null;
  #unreadCount = 0;
  #totalCount = 0;
  #hasLoadedList = false;
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #countInFlight: Promise<void> | null = null;
  #listAbort: AbortController | null = null;
  #lastFocused: HTMLElement | null = null;

  #root: ShadowRoot;
  #triggerEl!: HTMLButtonElement;
  #badgeEl!: HTMLSpanElement;
  #liveEl!: HTMLElement;
  #panelEl!: HTMLElement;
  #markAllEl!: HTMLButtonElement;
  #tabEls!: HTMLButtonElement[];
  #listEl!: HTMLElement;
  #footerEl!: HTMLElement;
  #loadMoreEl!: HTMLButtonElement;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = TEMPLATE;
    this.#client = new InboxClient(this.baseUrl, this.token);
    this.#wireDom();
  }

  // --- reflected configuration (attribute is the source of truth; properties are sugar) ---

  get token(): string { return this.getAttribute('token') ?? ''; }
  set token(value: string) { this.setAttribute('token', value); }

  get baseUrl(): string { return this.getAttribute('base-url') ?? ''; }
  set baseUrl(value: string) { this.setAttribute('base-url', value); }

  get theme(): 'light' | 'dark' | 'auto' {
    const value = this.getAttribute('theme');
    return value === 'light' || value === 'dark' ? value : 'auto';
  }
  set theme(value: 'light' | 'dark' | 'auto') { this.setAttribute('theme', value); }

  get pollInterval(): number {
    const raw = Number(this.getAttribute('poll-interval'));
    return Number.isFinite(raw) && this.hasAttribute('poll-interval') ? raw : DEFAULT_POLL_INTERVAL;
  }
  set pollInterval(value: number) { this.setAttribute('poll-interval', String(value)); }

  get pageSize(): number {
    const raw = Number(this.getAttribute('page-size'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PAGE_SIZE;
  }
  set pageSize(value: number) { this.setAttribute('page-size', String(value)); }

  // --- lifecycle ---

  connectedCallback(): void {
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);
    void this.#refreshCount();
    this.#startPolling();
  }

  disconnectedCallback(): void {
    this.#stopPolling();
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    document.removeEventListener('click', this.#handleOutsideClick, true);
    this.#listAbort?.abort();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'token') this.#client.setToken(this.token);
    if (name === 'base-url') this.#client.setBaseUrl(this.baseUrl);
    if (!this.isConnected) return;
    if (name === 'token' || name === 'base-url') {
      void this.#refreshCount();
      if (this.#open) void this.#loadList({ reset: true });
    }
    if (name === 'poll-interval') this.#startPolling();
  }

  // --- DOM wiring (structure is static; only content/state mutates afterward) ---

  #wireDom(): void {
    const root = this.#root;
    this.#triggerEl = root.querySelector('.nk-trigger')!;
    this.#badgeEl = root.querySelector('.nk-badge')!;
    this.#liveEl = root.querySelector('.nk-live')!;
    this.#panelEl = root.querySelector('.nk-panel')!;
    this.#markAllEl = root.querySelector('.nk-mark-all')!;
    this.#tabEls = Array.from(root.querySelectorAll('.nk-tab'));
    this.#listEl = root.querySelector('.nk-list')!;
    this.#footerEl = root.querySelector('.nk-footer')!;
    this.#loadMoreEl = root.querySelector('.nk-load-more')!;

    this.#triggerEl.addEventListener('click', () => this.#setOpen(!this.#open));
    this.#panelEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.#setOpen(false);
      }
    });
    this.#markAllEl.addEventListener('click', () => void this.#markAllRead());
    for (const tab of this.#tabEls) {
      tab.addEventListener('click', () => this.#setFilter(tab.dataset.filter === 'all' ? 'all' : 'unread'));
    }
    this.#loadMoreEl.addEventListener('click', () => void this.#loadList({ reset: false }));
    this.#listEl.addEventListener('click', (event) => this.#handleListClick(event));
    this.#listEl.addEventListener('keydown', (event) => this.#handleListKeydown(event));
  }

  // --- open/close ---

  #setOpen(next: boolean): void {
    if (next === this.#open) return;
    this.#open = next;
    this.#panelEl.hidden = !next;
    this.#triggerEl.setAttribute('aria-expanded', String(next));
    if (next) {
      this.#lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener('click', this.#handleOutsideClick, true);
      this.#emit('notifykit:open', { unread: this.#unreadCount, total: this.#totalCount });
      this.#tabEls.find((tab) => tab.dataset.filter === this.#filter)?.focus();
      if (!this.#hasLoadedList) void this.#loadList({ reset: true });
    } else {
      document.removeEventListener('click', this.#handleOutsideClick, true);
      const returnTo = this.#lastFocused?.isConnected ? this.#lastFocused : this.#triggerEl;
      returnTo.focus();
    }
  }

  #handleOutsideClick = (event: MouseEvent): void => {
    if (!event.composedPath().includes(this)) this.#setOpen(false);
  };

  #handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.#stopPolling();
    } else {
      void this.#refreshCount();
      this.#startPolling();
    }
  };

  // --- polling ---

  #startPolling(): void {
    this.#stopPolling();
    if (this.pollInterval <= 0 || document.hidden) return;
    this.#pollTimer = setInterval(() => void this.#refreshCount(), this.pollInterval);
  }

  #stopPolling(): void {
    if (this.#pollTimer !== undefined) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
  }

  // --- data loading ---

  async #refreshCount(): Promise<void> {
    if (!this.token) {
      if (!warnedMissingToken) {
        warnedMissingToken = true;
        console.warn('notifykit-inbox: no `token` attribute set; the widget will stay idle until one is provided.');
      }
      return;
    }
    if (this.#countInFlight) return this.#countInFlight;
    const promise = (async () => {
      try {
        const result = await this.#client.count();
        this.#unreadCount = result.unread;
        this.#totalCount = result.total;
        this.#updateBadge();
        this.#emit('notifykit:count', { unread: result.unread, total: result.total });
      } catch (error) {
        console.warn('notifykit-inbox: failed to refresh unread count', error);
      } finally {
        this.#countInFlight = null;
      }
    })();
    this.#countInFlight = promise;
    return promise;
  }

  async #loadList({ reset }: { reset: boolean }): Promise<void> {
    if (!this.token) return;
    this.#listAbort?.abort();
    const controller = new AbortController();
    this.#listAbort = controller;
    if (reset) {
      this.#loading = true;
      this.#error = null;
      this.#items = [];
      this.#nextCursor = null;
    } else {
      this.#loadingMore = true;
    }
    this.#renderList();
    try {
      const response = await this.#client.list(
        { limit: this.pageSize, cursor: reset ? undefined : this.#nextCursor ?? undefined, status: this.#filter },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.#items = reset ? response.items : [...this.#items, ...response.items];
      this.#nextCursor = response.next_cursor;
      this.#hasLoadedList = true;
    } catch (error) {
      if (controller.signal.aborted) return; // a newer request superseded this one; it owns the state now.
      this.#error = error instanceof InboxApiError ? error.message : 'Unable to load notifications.';
    } finally {
      if (!controller.signal.aborted) {
        this.#loading = false;
        this.#loadingMore = false;
        this.#renderList();
      }
    }
  }

  #setFilter(filter: Exclude<InboxStatusFilter, 'read'>): void {
    if (filter === this.#filter) return;
    this.#filter = filter;
    for (const tab of this.#tabEls) tab.setAttribute('aria-selected', String(tab.dataset.filter === filter));
    void this.#loadList({ reset: true });
  }

  async #markAllRead(): Promise<void> {
    this.#markAllEl.disabled = true;
    try {
      await this.#client.readAll();
      this.#items = this.#items.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() }));
      this.#renderList();
      await this.#refreshCount();
    } catch (error) {
      this.#error = error instanceof InboxApiError ? error.message : 'Unable to mark notifications as read.';
      this.#renderList();
    } finally {
      this.#markAllEl.disabled = false;
    }
  }

  async #archiveItem(id: string): Promise<void> {
    const previous = this.#items;
    this.#items = this.#items.filter((item) => item.id !== id);
    this.#renderList();
    try {
      await this.#client.archive(id);
      void this.#refreshCount();
    } catch (error) {
      this.#items = previous; // roll back: the server never confirmed the archive.
      this.#error = error instanceof InboxApiError ? error.message : 'Unable to archive that notification.';
      this.#renderList();
    }
  }

  #selectItem(id: string): void {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item) return;
    const event = this.#emit('notifykit:select', item, { cancelable: true });
    if (!item.read_at) {
      item.read_at = new Date().toISOString();
      this.#renderList();
      void this.#client.markRead(id).then(() => void this.#refreshCount()).catch(() => {
        /* best-effort: the item already reads as read locally; a background refresh will reconcile it. */
      });
    }
    if (event.defaultPrevented) return;
    const url = extractDeepLink(item.data);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  #handleListClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const archiveButton = target.closest<HTMLElement>('.nk-item-archive');
    if (archiveButton) {
      event.stopPropagation();
      const id = archiveButton.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) void this.#archiveItem(id);
      return;
    }
    const retryButton = target.closest<HTMLElement>('.nk-retry');
    if (retryButton) {
      void this.#loadList({ reset: true });
      return;
    }
    const row = target.closest<HTMLElement>('.nk-item');
    if (row?.dataset.id) this.#selectItem(row.dataset.id);
  }

  #handleListKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('.nk-item');
    if (!row?.dataset.id) return;
    event.preventDefault();
    this.#selectItem(row.dataset.id);
  }

  // --- rendering ---

  #updateBadge(): void {
    const count = this.#unreadCount;
    this.#badgeEl.textContent = count > 99 ? '99+' : String(count);
    this.#badgeEl.hidden = count === 0;
    this.#triggerEl.setAttribute('aria-label', count > 0 ? `Notifications, ${count} unread` : 'Notifications');
    this.#liveEl.textContent = count > 0 ? `${count} unread notification${count === 1 ? '' : 's'}` : 'No unread notifications';
  }

  #renderList(): void {
    this.#listEl.replaceChildren();
    this.#markAllEl.disabled = this.#unreadCount === 0;

    if (this.#loading) {
      this.#listEl.append(this.#buildState('Loading notifications…'));
      this.#footerEl.hidden = true;
      return;
    }
    if (this.#error) {
      const state = this.#buildState(this.#error, 'error');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'nk-retry';
      retry.textContent = 'Retry';
      state.append(retry);
      this.#listEl.append(state);
      this.#footerEl.hidden = true;
      return;
    }
    if (!this.#items.length) {
      this.#listEl.append(this.#buildState(this.#filter === 'unread' ? "You're all caught up." : 'No notifications yet.'));
      this.#footerEl.hidden = true;
      return;
    }
    for (const item of this.#items) this.#listEl.append(this.#buildItemRow(item));
    this.#footerEl.hidden = !this.#nextCursor;
    this.#loadMoreEl.hidden = !this.#nextCursor;
    this.#loadMoreEl.disabled = this.#loadingMore;
    this.#loadMoreEl.textContent = this.#loadingMore ? 'Loading…' : 'Load more';
  }

  #buildState(message: string, tone?: 'error'): HTMLElement {
    const state = document.createElement('div');
    state.className = 'nk-state';
    state.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    if (tone) state.dataset.tone = tone;
    const text = document.createElement('p');
    text.textContent = message;
    state.append(text);
    return state;
  }

  #buildItemRow(item: InboxItem): HTMLElement {
    const unread = !item.read_at;
    const row = document.createElement('div');
    row.className = `nk-item${unread ? ' nk-item--unread' : ''}`;
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.dataset.id = item.id;
    row.setAttribute('aria-label', `${unread ? 'Unread. ' : ''}${item.title}`);

    const dot = document.createElement('span');
    dot.className = 'nk-item-dot';
    dot.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.className = 'nk-item-content';
    const title = document.createElement('p');
    title.className = 'nk-item-title';
    title.textContent = item.title;
    const body = document.createElement('p');
    body.className = 'nk-item-body';
    body.textContent = item.body;
    const time = document.createElement('time');
    time.className = 'nk-item-time';
    time.dateTime = item.created_at;
    time.textContent = relativeTime(item.created_at);
    content.append(title, body, time);

    const archive = document.createElement('button');
    archive.type = 'button';
    archive.className = 'nk-item-archive';
    archive.setAttribute('aria-label', `Archive "${item.title}"`);
    archive.textContent = '✕';

    row.append(dot, content, archive);
    return row;
  }

  #emit<T>(name: string, detail: T, options: { cancelable?: boolean } = {}): CustomEvent<T> {
    const event = new CustomEvent<T>(name, { detail, bubbles: true, composed: true, cancelable: options.cancelable ?? false });
    this.dispatchEvent(event);
    return event;
  }
}

export function defineInboxWidget(tagName = 'notifykit-inbox'): void {
  if (typeof customElements === 'undefined') return; // SSR/non-browser import: defining is meaningless, not an error.
  if (!customElements.get(tagName)) customElements.define(tagName, NotifykitInboxElement);
}
