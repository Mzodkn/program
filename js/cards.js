// Shared presentation pieces: page headers, item/event cards, stats and states.
// Every value that comes from the database is passed through escapeHTML.
import { t, tf } from './i18n.js';
import { escapeHTML } from './ui.js';
import {
  formatDateTime,
  formatRelative,
  formatEventRange,
  formatEventCountdown,
  formatDayNumber,
  formatMonthShort,
  getItemUrgency,
} from './format.js';

const TYPE_STYLES = {
  homework: 'bg-brand-500/15 text-brand-500 border-brand-500/35',
  assignment: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  presentation: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
};

const URGENCY_STYLES = {
  critical: {
    badge: 'bg-red-500/15 text-red-300 border-red-500/40',
    panel: 'border-red-500/35 bg-red-500/10',
    text: 'text-red-300',
    border: 'border-s-4 border-red-500',
    dot: 'bg-red-500',
  },
  soon: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    panel: 'border-amber-500/35 bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-s-4 border-amber-500',
    dot: 'bg-amber-400',
  },
  past: {
    badge: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    panel: 'border-slate-500/35 bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-s-4 border-slate-500',
    dot: 'bg-slate-400',
  },
  normal: {
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    panel: 'border-sky-500/35 bg-sky-500/10',
    text: 'text-sky-300',
    border: 'border-s-4 border-sky-500',
    dot: 'bg-sky-400',
  },
};

export const primaryActionClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ' +
  'bg-gradient-to-r from-brand-600 to-amber-500 hover:from-brand-500 hover:to-amber-400 ' +
  'text-white font-bold text-xs sm:text-sm transition shadow-lg shadow-brand-600/20';

export const secondaryActionClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ' +
  'bg-dark-elevated border border-dark-border hover:border-brand-500/60 ' +
  'text-white font-bold text-xs sm:text-sm transition';

export function itemTypeLabel(type) {
  const labels = {
    homework: t('typeHomework'),
    assignment: t('typeAssignment'),
    presentation: t('typePresentation'),
  };
  return labels[type] || t('typeItem');
}

export function urgencyStyle(urgency) {
  return URGENCY_STYLES[urgency] || URGENCY_STYLES.normal;
}

export function urgencyLabel(urgency) {
  const labels = {
    critical: t('urgencyCritical'),
    soon: t('urgencySoon'),
    past: t('urgencyPast'),
  };
  return labels[urgency] || t('urgencyNormal');
}

export function typeBadge(type) {
  const style = TYPE_STYLES[type] || 'bg-dark-elevated text-dark-muted border-dark-border';
  return `<span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold mono ${style}">${escapeHTML(itemTypeLabel(type))}</span>`;
}

export function urgencyBadge(urgency) {
  const style = urgencyStyle(urgency);
  return `<span class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold ${style.badge}">
    <span class="inline-block w-1.5 h-1.5 rounded-full ${style.dot}"></span>
    ${escapeHTML(urgencyLabel(urgency))}
  </span>`;
}

function excerpt(value, max = 170) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function itemCard(item) {
  const urgency = getItemUrgency(item);
  const style = urgencyStyle(urgency);
  const id = encodeURIComponent(String(item?.id || ''));
  const title = escapeHTML(item?.title || '');
  const subject = String(item?.subject_label || '').trim();
  const details = excerpt(item?.details);
  const groupSize = Number(item?.max_group_size);
  const groupText = groupSize === 1
    ? t('individualWork')
    : tf('groupUpTo', { n: Number.isFinite(groupSize) ? groupSize : '' });

  return `<a href="#/items/${id}" data-item-id="${escapeHTML(item?.id || '')}" data-urgency="${urgency}"
    class="group block rounded-xl border border-dark-border ${style.border} bg-dark-base/60 hover:bg-dark-elevated/65 hover:border-brand-500/40 transition focus:outline-none focus:ring-2 focus:ring-brand-500/40">
    <div class="p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        ${typeBadge(item?.type)}
        ${subject ? `<span class="inline-flex max-w-[12rem] truncate rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] sm:text-[11px] mono text-dark-muted">${escapeHTML(subject)}</span>` : ''}
        ${urgencyBadge(urgency)}
        <span class="ms-auto text-[10px] sm:text-[11px] mono text-dark-muted whitespace-nowrap">${escapeHTML(formatRelative(item?.due_at))}</span>
      </div>
      <h3 class="text-base sm:text-lg font-extrabold text-white group-hover:text-brand-500 transition leading-snug break-words">${title}</h3>
      ${details ? `<p class="mt-1.5 text-xs sm:text-sm text-dark-muted leading-relaxed break-words">${escapeHTML(details)}</p>` : ''}
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-dark-muted">
        <span class="inline-flex items-center gap-1.5"><span aria-hidden="true">📅</span><span>${escapeHTML(t('deadline'))}: ${escapeHTML(formatDateTime(item?.due_at))}</span></span>
        <span class="inline-flex items-center gap-1.5"><span aria-hidden="true">👥</span><span>${escapeHTML(groupText)}</span></span>
      </div>
    </div>
  </a>`;
}

export function eventCard(event) {
  const title = escapeHTML(event?.title || '');
  const details = excerpt(event?.details, 180);
  const countdown = formatEventCountdown(event);
  const startAttr = escapeHTML(String(event?.starts_at || ''));
  const endAttr = escapeHTML(String(event?.ends_at || ''));

  return `<article data-event-id="${escapeHTML(event?.id || '')}"
    class="rounded-xl border border-dark-border bg-dark-base/60 p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
    <div class="shrink-0 w-14 sm:w-16 rounded-xl border border-sky-500/30 bg-sky-500/10 text-center py-2">
      <div class="text-xl sm:text-2xl font-extrabold text-sky-300 mono leading-none">${escapeHTML(formatDayNumber(event?.starts_at))}</div>
      <div class="mt-1 text-[10px] sm:text-[11px] font-bold text-sky-400/80 truncate px-1">${escapeHTML(formatMonthShort(event?.starts_at))}</div>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex items-center rounded-md border border-purple-500/35 bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold mono text-purple-300">${escapeHTML(t('event'))}</span>
        <h3 class="text-sm sm:text-base font-extrabold text-white leading-snug break-words">${title}</h3>
      </div>
      <p class="mt-1.5 text-[11px] sm:text-xs text-sky-300/90 mono leading-relaxed break-words">${escapeHTML(formatEventRange(event))}</p>
      ${countdown
        ? `<p class="mt-2">
            <span class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-amber-200">
              <span aria-hidden="true">⏳</span>
              <span data-countdown-start="${startAttr}" data-countdown-end="${endAttr}">${escapeHTML(countdown)}</span>
            </span>
          </p>`
        : ''}
      ${details ? `<p class="mt-2 text-xs sm:text-sm text-dark-muted leading-relaxed break-words">${escapeHTML(details)}</p>` : ''}
    </div>
  </article>`;
}

export function pageHero({ path, title, subtitle = '', actionsHtml = '', eyebrow = '' }) {
  return `<section class="rounded-2xl bg-dark-surface/95 backdrop-blur border-2 border-brand-500/40 shadow-2xl overflow-hidden">
    <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-base/60">
      <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
      <span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
      <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
      <span class="text-[11px] mono text-dark-muted ms-2 truncate" dir="ltr">${escapeHTML(path)}</span>
    </div>
    <div class="p-5 sm:p-7">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div class="min-w-0">
          ${eyebrow ? `<p class="text-[11px] mono text-brand-500 mb-1.5" dir="ltr">${escapeHTML(eyebrow)}</p>` : ''}
          <h1 class="text-2xl sm:text-3xl font-extrabold text-white leading-tight">${escapeHTML(title)}</h1>
          ${subtitle ? `<p class="mt-2 text-sm text-dark-muted leading-relaxed max-w-xl">${escapeHTML(subtitle)}</p>` : ''}
        </div>
        ${actionsHtml ? `<div class="flex flex-wrap items-center gap-2 shrink-0">${actionsHtml}</div>` : ''}
      </div>
    </div>
  </section>`;
}

export function sectionHeader(title, { count = null, actionHtml = '', icon = '❯' } = {}) {
  const countHtml = count == null
    ? ''
    : `<span class="inline-flex min-w-6 items-center justify-center rounded-md border border-dark-border bg-dark-elevated px-1.5 py-0.5 text-[10px] mono text-dark-muted">${escapeHTML(count)}</span>`;

  return `<div class="flex items-center justify-between gap-3 mb-3">
    <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white">
      <span class="text-brand-500 mono" aria-hidden="true">${escapeHTML(icon)}</span>
      <span>${escapeHTML(title)}</span>
      ${countHtml}
    </h2>
    ${actionHtml || ''}
  </div>`;
}

const STAT_TONES = {
  brand: 'border-brand-500/35 bg-brand-500/10 text-brand-500',
  red: 'border-red-500/35 bg-red-500/10 text-red-300',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
};

export function statCard({ label, value, icon, tone = 'brand' }) {
  const style = STAT_TONES[tone] || STAT_TONES.brand;
  return `<div class="rounded-xl border ${style} bg-dark-base/40 p-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="text-2xl sm:text-3xl font-extrabold mono text-white leading-none">${escapeHTML(value)}</div>
        <div class="mt-2 text-[11px] sm:text-xs font-bold text-dark-muted">${escapeHTML(label)}</div>
      </div>
      <span class="text-xl sm:text-2xl opacity-80" aria-hidden="true">${escapeHTML(icon)}</span>
    </div>
  </div>`;
}

export function emptyPanel(icon, message) {
  return `<div class="rounded-xl border border-dashed border-dark-border bg-dark-base/35 px-5 py-8 text-center">
    <div class="text-3xl mb-2" aria-hidden="true">${escapeHTML(icon)}</div>
    <p class="text-sm text-dark-muted">${escapeHTML(message)}</p>
  </div>`;
}

export function loadingPanel(message = t('loading')) {
  return `<div class="rounded-2xl border border-dark-border bg-dark-surface/80 p-6 flex items-center justify-center gap-3 text-sm text-dark-muted" aria-live="polite">
    <span class="inline-block w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></span>
    <span>${escapeHTML(message)}</span>
  </div>`;
}

export function errorPanel(info, retryId = '') {
  return `<div class="rounded-2xl border border-red-500/35 bg-red-500/10 p-5 sm:p-6 text-center" role="alert">
    <div class="text-3xl mb-2" aria-hidden="true">⚠️</div>
    <p class="text-sm font-bold text-red-200">${escapeHTML(info?.message || t('genericError'))}</p>
    ${info?.code ? `<p class="mt-1.5 text-[10px] mono text-red-300/70 break-all" dir="ltr">${escapeHTML(info.code)}</p>` : ''}
    ${retryId ? `<button id="${escapeHTML(retryId)}" type="button" class="mt-4 px-4 py-2 rounded-lg border border-red-400/40 bg-red-500/15 hover:bg-red-500/25 text-red-100 text-xs font-bold transition">${escapeHTML(t('retry'))}</button>` : ''}
  </div>`;
}
