// Month calendar with Sunday-start weeks and a selected-day panel.
// Items appear on their local due day; multi-day events appear on each day
// they cover. Urgency colors match the dashboard cards.
import { t, tf, getLang } from './i18n.js';
import { describeDataError, escapeHTML, showToast } from './ui.js';
import { fetchItems, fetchEvents } from './data.js';
import {
  addDays,
  dateKey,
  formatDayNumber,
  formatFullDate,
  formatMonthYear,
  formatWeekdayShort,
  getItemUrgency,
  parseDateKey,
  startOfDay,
} from './format.js';
import {
  pageHero,
  sectionHeader,
  itemCard,
  eventCard,
  emptyPanel,
  loadingPanel,
  errorPanel,
  urgencyStyle,
} from './cards.js';

const view = {
  year: null,
  month: null,
  selectedKey: null,
};

function ensureView() {
  if (view.year != null && view.month != null && view.selectedKey) return;
  const now = new Date();
  view.year = now.getFullYear();
  view.month = now.getMonth();
  view.selectedKey = dateKey(now);
}

function pushToDay(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function itemsByDay(items) {
  const map = new Map();
  items.forEach((item) => pushToDay(map, dateKey(item.due_at), item));
  map.forEach((list) => list.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()));
  return map;
}

function eventsByDay(events) {
  const map = new Map();
  const MAX_SPAN = 370;

  events.forEach((event) => {
    const start = startOfDay(event.starts_at);
    if (!start) return;

    const rawEnd = startOfDay(event.ends_at);
    const end = rawEnd && rawEnd >= start ? rawEnd : start;

    let cursor = start;
    let guard = 0;
    while (cursor && cursor <= end && guard < MAX_SPAN) {
      pushToDay(map, dateKey(cursor), event);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  });

  map.forEach((list) => list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
  return map;
}

function calendarShell(bodyHtml, actionsHtml) {
  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/calendar',
      title: t('calendar'),
      subtitle: t('calendarIntro'),
      actionsHtml,
    })}
    <div class="space-y-5">${bodyHtml}</div>
  </div>`;
}

function calendarCell({ cell, month, selectedKey, todayKey, dayItems, dayEvents }) {
  const key = dateKey(cell);
  const inMonth = cell.getMonth() === month;
  const selected = key === selectedKey;
  const today = key === todayKey;

  const classes = [
    'relative flex min-h-[4.6rem] sm:min-h-[6.4rem] flex-col rounded-lg border p-1.5 text-start transition overflow-hidden',
    'focus:outline-none focus:ring-2 focus:ring-brand-500/50',
    selected
      ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/25'
      : inMonth
        ? 'border-dark-border bg-dark-base/55 hover:border-brand-500/45 hover:bg-dark-elevated/50'
        : 'border-dark-border/40 bg-dark-base/20 text-dark-muted/55 hover:border-brand-500/25',
    today && !selected ? 'ring-1 ring-sky-400/50' : '',
  ].filter(Boolean).join(' ');

  const chips = [];

  dayItems.slice(0, 2).forEach((item) => {
    const style = urgencyStyle(getItemUrgency(item));
    chips.push(`<span class="flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] leading-tight ${style.badge}" title="${escapeHTML(item.title)}">
      <span class="inline-block w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}"></span>
      <span class="truncate hidden sm:inline">${escapeHTML(item.title)}</span>
    </span>`);
  });

  if (chips.length < 2) {
    dayEvents.slice(0, 2 - chips.length).forEach((event) => {
      chips.push(`<span class="flex items-center gap-1 rounded border border-purple-500/35 bg-purple-500/10 px-1 py-0.5 text-[9px] leading-tight text-purple-300" title="${escapeHTML(event.title)}">
        <span class="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-purple-400"></span>
        <span class="truncate hidden sm:inline">${escapeHTML(event.title)}</span>
      </span>`);
    });
  }

  const remaining = dayItems.length + dayEvents.length - chips.length;
  const more = remaining > 0
    ? `<span class="block text-[9px] mono text-dark-muted ps-0.5">${escapeHTML(tf('calendarMore', { n: remaining }))}</span>`
    : '';

  return `<button type="button" data-calendar-day="${key}" aria-pressed="${selected ? 'true' : 'false'}"
    ${today ? 'aria-current="date"' : ''} aria-label="${escapeHTML(formatFullDate(cell))}" class="${classes}">
    <div class="flex items-center justify-between gap-1">
      <span class="text-[10px] sm:text-xs mono font-bold ${today ? 'text-sky-300' : 'text-dark-muted'}">${escapeHTML(formatDayNumber(cell))}</span>
      ${today ? `<span class="hidden sm:inline text-[8px] font-bold text-sky-400/80">${escapeHTML(t('calendarToday'))}</span>` : ''}
    </div>
    <div class="mt-1 space-y-0.5 min-w-0">${chips.join('')}${more}</div>
  </button>`;
}

export async function renderCalendar(root, ctx = {}) {
  ensureView();

  let generation = 0;
  let latestItems = [];
  let latestEvents = [];

  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  function paint(items, events) {
    latestItems = items;
    latestEvents = events;

    const itemMap = itemsByDay(items);
    const eventMap = eventsByDay(events);

    const monthStart = new Date(view.year, view.month, 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    const todayKey = dateKey(new Date());
    const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

    const weekdays = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(2024, 0, 7 + index); // a Sunday
      return `<div class="text-center text-[9px] sm:text-[11px] mono font-bold text-dark-muted py-1.5 truncate">${escapeHTML(formatWeekdayShort(day))}</div>`;
    }).join('');

    const dayButtons = cells.map((cell) => {
      const key = dateKey(cell);
      return calendarCell({
        cell,
        month: view.month,
        selectedKey: view.selectedKey,
        todayKey,
        dayItems: itemMap.get(key) || [],
        dayEvents: eventMap.get(key) || [],
      });
    }).join('');

    const selectedDate = parseDateKey(view.selectedKey) || new Date();
    const selectedKey = dateKey(selectedDate);
    const selectedItems = itemMap.get(selectedKey) || [];
    const selectedEvents = eventMap.get(selectedKey) || [];
    const total = selectedItems.length + selectedEvents.length;

    const prevIcon = getLang() === 'ar' ? '›' : '‹';
    const nextIcon = getLang() === 'ar' ? '‹' : '›';

    const toolbar = `<div class="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-dark-border bg-dark-base/40">
      <button id="calendarPrev" type="button" aria-label="${escapeHTML(t('calendarPrev'))}"
        class="w-10 h-10 shrink-0 rounded-xl border border-dark-border bg-dark-elevated hover:border-brand-500/60 text-white text-xl font-bold transition">${prevIcon}</button>
      <div class="text-center min-w-0">
        <h2 class="text-base sm:text-xl font-extrabold text-white truncate" data-calendar-month>${escapeHTML(formatMonthYear(monthStart))}</h2>
        <button id="calendarToday" type="button" class="mt-1 text-[10px] sm:text-[11px] mono font-bold text-brand-500 hover:text-amber-400 transition">${escapeHTML(t('calendarToday'))}</button>
      </div>
      <button id="calendarNext" type="button" aria-label="${escapeHTML(t('calendarNext'))}"
        class="w-10 h-10 shrink-0 rounded-xl border border-dark-border bg-dark-elevated hover:border-brand-500/60 text-white text-xl font-bold transition">${nextIcon}</button>
    </div>`;

    const grid = `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 overflow-hidden">
      ${toolbar}
      <div class="p-2 sm:p-4">
        <div class="grid grid-cols-7 gap-1 mb-1">${weekdays}</div>
        <div class="grid grid-cols-7 gap-1" aria-label="${escapeHTML(t('calendarGrid'))}">${dayButtons}</div>
      </div>
    </section>`;

    const selectedPanel = `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 overflow-hidden" aria-live="polite">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-4 border-b border-dark-border bg-dark-base/40">
        <div>
          <p class="text-[10px] mono text-brand-500 mb-1">${escapeHTML(t('calendarSelectedDay'))}</p>
          <h2 class="text-base sm:text-lg font-extrabold text-white">${escapeHTML(formatFullDate(selectedDate))}</h2>
        </div>
        <span class="inline-flex items-center gap-1.5 rounded-md border border-dark-border bg-dark-elevated px-2 py-1 text-[10px] mono text-dark-muted">
          <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>${total}
        </span>
      </div>
      <div class="p-4 sm:p-5 space-y-5">
        ${total === 0 ? emptyPanel('🗓️', t('calendarEmptyDay')) : ''}
        ${selectedItems.length
          ? `<div>
              ${sectionHeader(t('calendarItems'), { count: selectedItems.length, icon: '📌' })}
              <div class="space-y-3">${selectedItems.map(itemCard).join('')}</div>
            </div>`
          : ''}
        ${selectedEvents.length
          ? `<div>
              ${sectionHeader(t('calendarEvents'), { count: selectedEvents.length, icon: '🗓️' })}
              <div class="space-y-3">${selectedEvents.map(eventCard).join('')}</div>
            </div>`
          : ''}
      </div>
    </section>`;

    root.innerHTML = calendarShell(
      grid + selectedPanel,
      ''
    );

    wire();
  }

  function moveMonth(delta) {
    const next = new Date(view.year, view.month + delta, 1);
    view.year = next.getFullYear();
    view.month = next.getMonth();

    const now = new Date();
    view.selectedKey = now.getFullYear() === view.year && now.getMonth() === view.month
      ? dateKey(now)
      : dateKey(next);

    paint(latestItems, latestEvents);
  }

  function selectDay(key) {
    const date = parseDateKey(key);
    if (!date) return;

    view.selectedKey = key;
    if (date.getFullYear() !== view.year || date.getMonth() !== view.month) {
      view.year = date.getFullYear();
      view.month = date.getMonth();
    }
    paint(latestItems, latestEvents);
  }

  function wire() {
    root.querySelector('#calendarPrev')?.addEventListener('click', () => moveMonth(-1));
    root.querySelector('#calendarNext')?.addEventListener('click', () => moveMonth(1));
    root.querySelector('#calendarToday')?.addEventListener('click', () => {
      const now = new Date();
      view.year = now.getFullYear();
      view.month = now.getMonth();
      view.selectedKey = dateKey(now);
      paint(latestItems, latestEvents);
    });
    root.querySelectorAll('[data-calendar-day]').forEach((button) => {
      button.addEventListener('click', () => selectDay(button.dataset.calendarDay));
    });
    root.querySelector('#calendarRetry')?.addEventListener('click', () => load(true));
  }

  async function load(force = false) {
    const current = ++generation;
    root.innerHTML = calendarShell(loadingPanel());

    try {
      const [items, events] = await Promise.all([
        fetchItems({ force }),
        fetchEvents({ force }),
      ]);
      if (isStale() || current !== generation) return;
      paint(items, events);
    } catch (error) {
      if (isStale() || current !== generation) return;
      const info = describeDataError(error, getLang());
      showToast(info.message, 'error');
      root.innerHTML = calendarShell(errorPanel(info, 'calendarRetry'));
      wire();
    }
  }

  await load();
}
