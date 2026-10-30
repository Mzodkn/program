// Item detail page. Read-only in Phase 3; groups arrive in Phase 4.
import { t, tf, getLang } from './i18n.js';
import { describeDataError, escapeHTML, showToast } from './ui.js';
import { fetchItem } from './data.js';
import { renderItemGroups } from './groups.js';
import { formatDateTime, formatRelative, getItemUrgency } from './format.js';
import {
  pageHero,
  typeBadge,
  urgencyBadge,
  urgencyStyle,
  emptyPanel,
  loadingPanel,
  errorPanel,
  primaryActionClass,
} from './cards.js';

function calendarAction() {
  return `<a href="#/calendar" class="${primaryActionClass}"><span aria-hidden="true">📅</span>${escapeHTML(t('calendar'))}</a>`;
}

function itemShell(id, bodyHtml, actionsHtml, title = t('item')) {
  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/items/' + String(id || ''),
      title,
      subtitle: '',
      actionsHtml,
    })}
    <div class="space-y-5">${bodyHtml}</div>
  </div>`;
}

function itemDetail(item) {
  const urgency = getItemUrgency(item);
  const style = urgencyStyle(urgency);
  const groupSize = Number(item.max_group_size);
  const groupText = groupSize === 1
    ? t('individualWork')
    : tf('groupUpTo', { n: Number.isFinite(groupSize) ? groupSize : '' });
  const subject = String(item.subject_label || '').trim();
  const details = String(item.details || '').trim();
  const dueAt = formatDateTime(item.due_at);
  const relative = formatRelative(item.due_at);

  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 overflow-hidden">
    <div class="p-5 sm:p-7">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        ${typeBadge(item.type)}
        ${urgencyBadge(urgency)}
        ${subject ? `<span class="inline-flex max-w-[14rem] truncate rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] sm:text-[11px] mono text-dark-muted">${escapeHTML(subject)}</span>` : ''}
      </div>
      <h1 class="text-2xl sm:text-4xl font-extrabold text-white leading-tight break-words">${escapeHTML(item.title || '')}</h1>
      <div class="mt-5 grid sm:grid-cols-2 gap-3">
        <div class="rounded-xl border ${style.panel} p-4">
          <div class="flex items-center gap-2 text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1.5">
            <span aria-hidden="true">📅</span>${escapeHTML(t('deadline'))}
          </div>
          <div class="text-sm sm:text-base font-bold text-white break-words">${escapeHTML(dueAt)}</div>
          <div class="mt-1.5 flex items-center gap-1.5 text-[11px] sm:text-xs ${style.text}">
            <span class="inline-block w-1.5 h-1.5 rounded-full ${style.dot}"></span>
            <span>${escapeHTML(relative)}</span>
          </div>
        </div>
        <div class="rounded-xl border border-dark-border bg-dark-base/40 p-4">
          <div class="flex items-center gap-2 text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1.5">
            <span aria-hidden="true">👥</span>${escapeHTML(t('groups'))}
          </div>
          <div class="text-sm sm:text-base font-bold text-white">${escapeHTML(groupText)}</div>
          <div class="mt-1.5 text-[11px] sm:text-xs text-dark-muted">${escapeHTML(groupSize === 1 ? t('groupsDisabledForItem') : t('groupsAvailable'))}</div>
        </div>
      </div>
    </div>
    <div class="border-t border-dark-border p-5 sm:p-7">
      <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white mb-3">
        <span class="text-brand-500 mono" aria-hidden="true">❯</span>${escapeHTML(t('details'))}
      </h2>
      ${details
        ? `<p class="text-sm sm:text-base text-dark-muted leading-relaxed whitespace-pre-line break-words">${escapeHTML(details)}</p>`
        : `<p class="text-sm text-dark-muted">${escapeHTML(t('noDetails'))}</p>`}
    </div>
  </section>`;
}

export async function renderItemPage(root, ctx = {}) {
  const id = String(ctx.route?.params?.id || '');
  let generation = 0;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  function notFound() {
    document.title = `${t('itemNotFound')} | IT Study Hub`;
    root.innerHTML = itemShell(
      id,
      `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-6 sm:p-8">
        ${emptyPanel('📭', t('itemNotFoundText'))}
      </section>`,
      calendarAction(),
      t('itemNotFound')
    );
  }

  function paint(item) {
    document.title = `${item.title || t('item')} | IT Study Hub`;
    root.innerHTML = itemShell(
      id,
      itemDetail(item) + '<div id="itemGroups"></div>',
      calendarAction()
    );

    const groupsRoot = root.querySelector('#itemGroups');
    if (groupsRoot) {
      renderItemGroups(groupsRoot, item, ctx).catch((error) => {
        if (isStale()) return;
        const info = describeDataError(error, getLang());
        showToast(info.message, 'error');
      });
    }
  }

  async function load(force = false) {
    const current = ++generation;
    root.innerHTML = itemShell(id, loadingPanel());

    try {
      const item = await fetchItem(id, { force });
      if (isStale() || current !== generation) return;
      if (!item) {
        notFound();
        return;
      }
      paint(item);
    } catch (error) {
      if (isStale() || current !== generation) return;
      if (error?.code === '22P02') {
        notFound();
        return;
      }
      const info = describeDataError(error, getLang());
      showToast(info.message, 'error');
      root.innerHTML = itemShell(id, errorPanel(info, 'itemRetry'));
      root.querySelector('#itemRetry')?.addEventListener('click', () => load(true));
    }
  }

  await load();
}
