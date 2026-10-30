// Dashboard: upcoming items and events, quick stats and past items.
// All data is read-only in Phase 3.
import { t, getLang } from './i18n.js';
import { describeDataError, escapeHTML, showToast } from './ui.js';
import { fetchItems, fetchEvents } from './data.js';
import { eventEnd, getItemUrgency } from './format.js';
import { STUDY_HUB_URL } from './config.js';
import {
  pageHero,
  sectionHeader,
  statCard,
  itemCard,
  eventCard,
  emptyPanel,
  loadingPanel,
  errorPanel,
  primaryActionClass,
} from './cards.js';

function calendarAction() {
  return `<a href="#/calendar" class="${primaryActionClass}"><span aria-hidden="true">📅</span>${escapeHTML(t('viewCalendar'))}</a>`;
}

// Prominent quick link to the external study platform.
function studyHubCard() {
  const secondary = getLang() === 'ar' ? 'Study Hub' : 'مركز الدراسة';
  return `<a href="${escapeHTML(STUDY_HUB_URL)}" target="_blank" rel="noopener noreferrer"
    class="group flex items-center gap-3 sm:gap-4 rounded-2xl border-2 border-brand-500/40 bg-gradient-to-br from-brand-500/15 via-dark-surface/95 to-dark-surface/95 p-4 sm:p-5 hover:border-brand-500/70 hover:from-brand-500/25 transition">
    <span class="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl border border-brand-500/40 bg-brand-500/15 text-xl sm:text-2xl" aria-hidden="true">📚</span>
    <span class="min-w-0 flex-1">
      <span class="block text-[10px] sm:text-[11px] mono font-bold uppercase tracking-wider text-brand-500">${escapeHTML(secondary)}</span>
      <span class="block mt-0.5 text-base sm:text-lg font-extrabold text-white">${escapeHTML(t('studyHubTitle'))}</span>
      <span class="block mt-0.5 text-[11px] sm:text-xs text-dark-muted leading-relaxed">${escapeHTML(t('studyHubText'))}</span>
    </span>
    <span class="shrink-0 text-brand-500 text-xl font-bold transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true">↗</span>
  </a>`;
}

function dashboardShell(bodyHtml, actionsHtml) {
  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/dashboard',
      title: t('dashboard'),
      subtitle: t('dashboardIntro'),
      actionsHtml,
    })}
    <div class="space-y-5">${bodyHtml}</div>
  </div>`;
}

function byDueAscending(a, b) {
  return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
}

function byStartAscending(a, b) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

export async function renderDashboard(root, ctx = {}) {
  let generation = 0;

  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  function wire() {
    root.querySelector('#dashboardRetry')?.addEventListener('click', () => {
      load(true);
    });
  }

  function paint(items, events) {
    const now = new Date();
    const upcomingItems = items
      .filter((item) => {
        const due = new Date(item.due_at);
        return !Number.isNaN(due.getTime()) && due > now;
      })
      .sort(byDueAscending);

    const pastItems = items
      .filter((item) => {
        const due = new Date(item.due_at);
        return !Number.isNaN(due.getTime()) && due <= now;
      })
      .sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());

    const upcomingEvents = events
      .filter((event) => {
        const end = eventEnd(event);
        return end && end >= now;
      })
      .sort(byStartAscending);

    const dueSoon = upcomingItems.filter((item) => getItemUrgency(item, now) === 'critical').length;
    const forwardArrow = getLang() === 'ar' ? '←' : '→';

    const stats = `<div class="grid grid-cols-3 gap-2 sm:gap-3">
      ${statCard({ label: t('statUpcomingItems'), value: String(upcomingItems.length), icon: '📌', tone: 'brand' })}
      ${statCard({ label: t('statDueSoon'), value: String(dueSoon), icon: '🔥', tone: 'red' })}
      ${statCard({ label: t('statUpcomingEvents'), value: String(upcomingEvents.length), icon: '🗓️', tone: 'sky' })}
    </div>`;

    const itemsSection = `<section aria-label="${escapeHTML(t('upcomingItems'))}">
      ${sectionHeader(t('upcomingItems'), { count: upcomingItems.length, icon: '📌' })}
      ${upcomingItems.length
        ? `<div class="space-y-3">${upcomingItems.map(itemCard).join('')}</div>`
        : emptyPanel('📭', t('noUpcomingItems'))}
    </section>`;

    const eventsSection = `<section aria-label="${escapeHTML(t('upcomingEvents'))}">
      ${sectionHeader(t('upcomingEvents'), {
        count: upcomingEvents.length,
        icon: '🗓️',
        actionHtml: `<a href="#/calendar" class="text-xs font-bold text-brand-500 hover:text-amber-400 transition">${escapeHTML(t('calendar'))} ${forwardArrow}</a>`,
      })}
      ${upcomingEvents.length
        ? `<div class="space-y-3">${upcomingEvents.map(eventCard).join('')}</div>`
        : emptyPanel('📅', t('noUpcomingEvents'))}
    </section>`;

    const pastSection = pastItems.length
      ? `<details class="group rounded-2xl border border-dark-border bg-dark-surface/80 overflow-hidden">
          <summary class="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 cursor-pointer list-none hover:bg-dark-elevated/40 transition">
            <div class="flex items-center gap-2">
              <span class="text-brand-500 mono" aria-hidden="true">❯</span>
              <span class="text-sm sm:text-base font-extrabold text-white">${escapeHTML(t('pastItems'))}</span>
              <span class="inline-flex min-w-6 items-center justify-center rounded-md border border-dark-border bg-dark-elevated px-1.5 py-0.5 text-[10px] mono text-dark-muted">${pastItems.length}</span>
            </div>
            <span class="text-dark-muted group-open:rotate-180 transition" aria-hidden="true">⌄</span>
          </summary>
          <div class="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
            ${pastItems.map(itemCard).join('')}
          </div>
        </details>`
      : '';

    root.innerHTML = dashboardShell(
      stats + studyHubCard() + itemsSection + eventsSection + pastSection,
      calendarAction()
    );
    wire();
  }

  async function load(force = false) {
    const current = ++generation;
    root.innerHTML = dashboardShell(loadingPanel(), calendarAction());

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
      root.innerHTML = dashboardShell(studyHubCard() + errorPanel(info, 'dashboardRetry'), calendarAction());
      wire();
    }
  }

  await load();
}
