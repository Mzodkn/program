// Phase 7: admin panel for items, events and reports.
import { t, getLang } from './i18n.js';
import { escapeHTML, showToast, describeDataError } from './ui.js';
import { fetchItems, fetchEvents, invalidateDataCache } from './data.js';
import {
  checkIsAdmin,
  createItem,
  updateItem,
  deleteItem,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchReports,
  setReportHandled,
} from './admin-data.js';
import { rpcErrorMessage } from './groups-data.js';
import { avatarLinkHtml } from './assets.js';
import { formatDateTime, formatRelative } from './format.js';
import {
  pageHero,
  sectionHeader,
  itemTypeLabel,
  emptyPanel,
  loadingPanel,
  errorPanel,
  primaryActionClass,
  secondaryActionClass,
} from './cards.js';

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';
const LABEL_CLASS = 'block text-xs mono text-brand-500 font-bold mb-1.5';
const HINT_CLASS = 'text-[11px] text-dark-muted mt-1.5 leading-relaxed';
const DISABLED_CLASS = 'disabled:opacity-60 disabled:cursor-not-allowed';
const REPORT_TYPES = ['homework', 'assignment', 'presentation'];

let activeTab = 'items';
let editor = null;

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function field(label, inputHtml, hintHtml = '') {
  return `<div class="mb-3">
    <label class="${LABEL_CLASS}">${escapeHTML(label)}</label>
    ${inputHtml}
    ${hintHtml ? `<p class="${HINT_CLASS}">${escapeHTML(hintHtml)}</p>` : ''}
  </div>`;
}

function tabButton(id, label, icon, count) {
  const active = activeTab === id;
  const classes = active
    ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-500/60 bg-brand-500/15 text-brand-500 font-bold text-sm transition'
    : secondaryActionClass;
  return `<button type="button" data-action="admin-tab" data-tab="${id}" class="${classes}">
    <span aria-hidden="true">${icon}</span>${escapeHTML(label)}
    <span class="rounded-md border border-current/30 px-1.5 py-0.5 text-[10px] mono">${count}</span>
  </button>`;
}

function typeOptions(selected) {
  return REPORT_TYPES.map((type) =>
    `<option value="${type}" ${selected === type ? 'selected' : ''}>${escapeHTML(itemTypeLabel(type))}</option>`
  ).join('');
}

function itemForm(item) {
  const editing = !!item;
  return `<section class="rounded-2xl border border-brand-500/35 bg-dark-surface/95 p-4 sm:p-6">
    ${sectionHeader(editing ? t('editItem') : t('newItem'), { icon: '📌' })}
    <form id="adminItemForm" data-id="${escapeHTML(item?.id || '')}" novalidate>
      <div class="grid sm:grid-cols-2 gap-x-4">
        ${field(t('titleLabel'),
          `<input name="title" type="text" required maxlength="120" value="${escapeHTML(item?.title || '')}" class="${INPUT_CLASS}">`)}
        ${field(t('typeLabel'),
          `<select name="type" class="${INPUT_CLASS}">${typeOptions(item?.type || 'homework')}</select>`)}
        ${field(t('subjectLabel'),
          `<input name="subject" type="text" maxlength="30" value="${escapeHTML(item?.subject_label || '')}" class="${INPUT_CLASS}">`)}
        ${field(t('dueAt'),
          `<input name="dueAt" type="datetime-local" required value="${escapeHTML(toDateTimeLocal(item?.due_at))}" class="${INPUT_CLASS}">`)}
        ${field(t('maxGroupSize'),
          `<input name="maxGroupSize" type="number" min="1" max="20" step="1" required value="${escapeHTML(String(item?.max_group_size ?? 5))}" class="${INPUT_CLASS}">`,
          t('maxGroupSizeHint'))}
      </div>
      ${field(t('details'),
        `<textarea name="details" rows="4" maxlength="5000" class="${INPUT_CLASS}">${escapeHTML(item?.details || '')}</textarea>`)}
      <div class="flex flex-wrap gap-2 mt-2">
        <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(editing ? t('saveItem') : t('newItem'))}</button>
        <button type="button" data-action="cancel-editor" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
      </div>
    </form>
  </section>`;
}

function eventForm(event) {
  const editing = !!event;
  return `<section class="rounded-2xl border border-brand-500/35 bg-dark-surface/95 p-4 sm:p-6">
    ${sectionHeader(editing ? t('editEvent') : t('newEvent'), { icon: '🗓️' })}
    <form id="adminEventForm" data-id="${escapeHTML(event?.id || '')}" novalidate>
      ${field(t('titleLabel'),
        `<input name="title" type="text" required maxlength="120" value="${escapeHTML(event?.title || '')}" class="${INPUT_CLASS}">`)}
      <div class="grid sm:grid-cols-2 gap-x-4">
        ${field(t('startsAt'),
          `<input name="startsAt" type="datetime-local" required value="${escapeHTML(toDateTimeLocal(event?.starts_at))}" class="${INPUT_CLASS}">`)}
        ${field(t('endsAt'),
          `<input name="endsAt" type="datetime-local" value="${escapeHTML(toDateTimeLocal(event?.ends_at))}" class="${INPUT_CLASS}">`,
          t('endsAtHint'))}
      </div>
      ${field(t('details'),
        `<textarea name="details" rows="4" maxlength="2000" class="${INPUT_CLASS}">${escapeHTML(event?.details || '')}</textarea>`)}
      <div class="flex flex-wrap gap-2 mt-2">
        <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(editing ? t('saveEvent') : t('newEvent'))}</button>
        <button type="button" data-action="cancel-editor" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
      </div>
    </form>
  </section>`;
}

function itemRow(item) {
  return `<article class="rounded-xl border border-dark-border bg-dark-surface/90 p-4">
    <div class="flex flex-wrap items-start gap-2">
      <span class="rounded-md border border-brand-500/40 bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold mono text-brand-500">${escapeHTML(itemTypeLabel(item.type))}</span>
      ${item.subject_label ? `<span class="rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] mono text-dark-muted">${escapeHTML(item.subject_label)}</span>` : ''}
      <span class="ms-auto text-[10px] mono text-dark-muted">${escapeHTML(formatDateTime(item.due_at))}</span>
    </div>
    <h3 class="mt-2 text-base font-extrabold text-white break-words">
      <a href="#/items/${escapeHTML(item.id)}" class="hover:text-brand-500 transition">${escapeHTML(item.title)}</a>
    </h3>
    <div class="mt-1 text-[11px] mono text-dark-muted">${escapeHTML(t('maxGroupSize'))}: <span class="text-white">${escapeHTML(String(item.max_group_size))}</span></div>
    ${item.details ? `<p class="mt-2 text-xs text-dark-muted leading-relaxed whitespace-pre-line break-words line-clamp-3">${escapeHTML(item.details)}</p>` : ''}
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" data-action="edit-item" data-id="${escapeHTML(item.id)}" class="${secondaryActionClass}">${escapeHTML(t('editItem'))}</button>
      <button type="button" data-action="delete-item" data-id="${escapeHTML(item.id)}"
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 font-bold text-sm transition ${DISABLED_CLASS}">
        ${escapeHTML(t('deleteItem'))}
      </button>
    </div>
  </article>`;
}

function eventRow(event) {
  const end = event.ends_at ? formatDateTime(event.ends_at) : '';
  return `<article class="rounded-xl border border-dark-border bg-dark-surface/90 p-4">
    <h3 class="text-base font-extrabold text-white break-words">${escapeHTML(event.title)}</h3>
    <div class="mt-1 text-[11px] mono text-dark-muted">
      ${escapeHTML(formatDateTime(event.starts_at))}${end ? ` — ${escapeHTML(end)}` : ''}
    </div>
    ${event.details ? `<p class="mt-2 text-xs text-dark-muted leading-relaxed whitespace-pre-line break-words line-clamp-3">${escapeHTML(event.details)}</p>` : ''}
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" data-action="edit-event" data-id="${escapeHTML(event.id)}" class="${secondaryActionClass}">${escapeHTML(t('editEvent'))}</button>
      <button type="button" data-action="delete-event" data-id="${escapeHTML(event.id)}"
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 font-bold text-sm transition ${DISABLED_CLASS}">
        ${escapeHTML(t('deleteEvent'))}
      </button>
    </div>
  </article>`;
}

function reportTarget(report) {
  if (report.target_type === 'profile') {
    const profile = report.targetProfile;
    if (profile) {
      return `<a href="#/u/${escapeHTML(profile.username)}" class="text-sky-300 hover:text-brand-500 transition" dir="ltr">@${escapeHTML(profile.username)}</a>`;
    }
  } else if (report.target_type === 'group') {
    const group = report.targetGroup;
    if (group) {
      return `<a href="#/groups/${escapeHTML(group.id)}" class="text-sky-300 hover:text-brand-500 transition">${escapeHTML(group.name)}</a>`;
    }
  }
  return `<span class="text-dark-muted">${escapeHTML(t('reportTargetMissing'))}</span>
    <span class="text-[10px] mono text-dark-muted break-all" dir="ltr">${escapeHTML(report.target_id)}</span>`;
}

function reportRow(report) {
  const reporter = report.reporter;
  const reporterName = String(reporter?.display_name || reporter?.username || t('unknownUser'));
  const reporterUsername = reporter?.username ? `@${reporter.username}` : '';
  const handled = !!report.handled;

  return `<article class="rounded-xl border ${handled ? 'border-dark-border bg-dark-base/40' : 'border-amber-500/35 bg-amber-500/5'} p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-md border px-2 py-0.5 text-[10px] font-bold mono ${
        handled
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
      }">${escapeHTML(handled ? t('handled') : t('unhandled'))}</span>
      <span class="rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] mono text-dark-muted">${
        escapeHTML(report.target_type === 'profile' ? t('reportTypeProfile') : t('reportTypeGroup'))
      }</span>
      <span class="ms-auto text-[10px] mono text-dark-muted">${escapeHTML(formatDateTime(report.created_at))}</span>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      ${reporter ? avatarLinkHtml(reporter, 'sm') : ''}
      <div class="min-w-0">
        <div class="text-[10px] mono text-dark-muted">${escapeHTML(t('reporter'))}</div>
        <div class="text-sm font-bold text-white truncate">
          ${report.reporter
            ? `<a href="#/u/${escapeHTML(report.reporter.username)}" class="hover:text-brand-500 transition">${escapeHTML(reporterName)}</a>`
            : escapeHTML(reporterName)}
          ${reporterUsername ? `<span class="ms-1 text-[10px] mono text-dark-muted" dir="ltr">${escapeHTML(reporterUsername)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="mt-3 text-xs">
      <span class="text-[10px] mono text-dark-muted">${escapeHTML(t('target'))}: </span>${reportTarget(report)}
    </div>
    <p class="mt-2 text-sm text-dark-muted leading-relaxed whitespace-pre-line break-words">${escapeHTML(report.reason || t('noReason'))}</p>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" data-action="toggle-report" data-id="${escapeHTML(report.id)}" data-handled="${handled ? 'false' : 'true'}"
        class="${secondaryActionClass} ${DISABLED_CLASS}">
        ${escapeHTML(handled ? t('markUnhandled') : t('markHandled'))}
      </button>
      <span class="text-[10px] mono text-dark-muted">${escapeHTML(formatRelative(report.created_at))}</span>
    </div>
  </article>`;
}

function adminContentHtml(items, events, reports) {
  if (activeTab === 'items') {
    const body = editor?.kind === 'item'
      ? itemForm(editor.id ? items.find((item) => item.id === editor.id) : null)
      : '';
    return `${body}
      <section>
        ${sectionHeader(t('adminItems'), {
          count: items.length,
          icon: '📌',
          actionHtml: `<button type="button" data-action="new-item" class="${primaryActionClass}"><span aria-hidden="true">＋</span>${escapeHTML(t('newItem'))}</button>`,
        })}
        ${items.length
          ? `<div class="space-y-3">${items.map(itemRow).join('')}</div>`
          : emptyPanel('📌', t('noItemsAdmin'))}
      </section>`;
  }

  if (activeTab === 'events') {
    const body = editor?.kind === 'event'
      ? eventForm(editor.id ? events.find((event) => event.id === editor.id) : null)
      : '';
    return `${body}
      <section>
        ${sectionHeader(t('adminEvents'), {
          count: events.length,
          icon: '🗓️',
          actionHtml: `<button type="button" data-action="new-event" class="${primaryActionClass}"><span aria-hidden="true">＋</span>${escapeHTML(t('newEvent'))}</button>`,
        })}
        ${events.length
          ? `<div class="space-y-3">${events.map(eventRow).join('')}</div>`
          : emptyPanel('🗓️', t('noEventsAdmin'))}
      </section>`;
  }

  const sorted = [...reports].sort((a, b) => {
    if (!!a.handled !== !!b.handled) return a.handled ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const pending = reports.filter((report) => !report.handled).length;

  return `<section>
    ${sectionHeader(t('adminReports'), { count: reports.length, icon: '🚩' })}
    <p class="text-xs text-dark-muted mb-3">${escapeHTML(t('adminReportsIntro'))}
      <span class="text-amber-300 font-bold">${escapeHTML(String(pending))}</span>
    </p>
    ${sorted.length
      ? `<div class="space-y-3">${sorted.map(reportRow).join('')}</div>`
      : emptyPanel('🚩', t('noReports'))}
  </section>`;
}

function adminPageHtml(items, events, reports) {
  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/admin',
      title: t('admin'),
      subtitle: t('adminIntro'),
    })}
    <div class="flex flex-wrap items-center gap-2">
      ${tabButton('items', t('adminItems'), '📌', items.length)}
      ${tabButton('events', t('adminEvents'), '🗓️', events.length)}
      ${tabButton('reports', t('adminReports'), '🚩', reports.length)}
    </div>
    ${adminContentHtml(items, events, reports)}
  </div>`;
}

function deniedHtml() {
  return `<div class="fade space-y-5">
    ${pageHero({ path: '#/admin', title: t('admin'), subtitle: t('adminIntro') })}
    <section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-6 sm:p-8 text-center" role="alert">
      <div class="text-4xl mb-3" aria-hidden="true">🛡️</div>
      <h2 class="text-xl font-extrabold text-red-200">${escapeHTML(t('adminDenied'))}</h2>
      <p class="mt-2 text-sm text-dark-muted">${escapeHTML(t('adminDeniedText'))}</p>
      <a href="#/dashboard" class="${primaryActionClass} mt-5">${escapeHTML(t('backHome'))}</a>
    </section>
  </div>`;
}

export async function renderAdmin(root, ctx = {}) {
  const me = ctx.profile;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  root.innerHTML = loadingPanel();
  let allowed = false;
  try {
    allowed = await checkIsAdmin();
  } catch (error) {
    allowed = false;
  }
  if (isStale()) return;

  if (!allowed) {
    document.title = `${t('adminDenied')} | IT Study Hub`;
    root.innerHTML = deniedHtml();
    return;
  }

  root.innerHTML = '<div id="adminPage" class="fade"></div>';
  const page = root.querySelector('#adminPage');
  let items = [];
  let events = [];
  let reports = [];
  let generation = 0;

  async function load(force = true) {
    const current = ++generation;
    page.innerHTML = `<div class="fade space-y-5">
      ${pageHero({ path: '#/admin', title: t('admin'), subtitle: t('adminIntro') })}
      ${loadingPanel()}
    </div>`;

    try {
      const [nextItems, nextEvents, nextReports] = await Promise.all([
        fetchItems({ force }),
        fetchEvents({ force }),
        fetchReports(),
      ]);
      if (isStale() || current !== generation) return;
      items = nextItems;
      events = nextEvents;
      reports = nextReports;
      if (editor?.id) {
        const exists = editor.kind === 'item'
          ? items.some((item) => item.id === editor.id)
          : events.some((event) => event.id === editor.id);
        if (!exists) editor = null;
      }
      paint();
    } catch (error) {
      if (isStale() || current !== generation) return;
      const info = describeDataError(error, getLang());
      page.innerHTML = `<div class="fade space-y-5">
        ${pageHero({ path: '#/admin', title: t('admin'), subtitle: t('adminIntro') })}
        ${errorPanel(info, 'adminRetry')}
      </div>`;
    }
  }

  function paint() {
    page.innerHTML = adminPageHtml(items, events, reports);
  }

  page.addEventListener('click', async (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || actionEl.disabled) return;
    const action = actionEl.dataset.action;

    if (action === 'admin-tab') {
      activeTab = ['events', 'reports'].includes(actionEl.dataset.tab) ? actionEl.dataset.tab : 'items';
      editor = null;
      paint();
      return;
    }

    if (action === 'new-item') {
      activeTab = 'items';
      editor = { kind: 'item', id: null };
      paint();
      page.querySelector('#adminItemForm input[name="title"]')?.focus();
      return;
    }

    if (action === 'new-event') {
      activeTab = 'events';
      editor = { kind: 'event', id: null };
      paint();
      page.querySelector('#adminEventForm input[name="title"]')?.focus();
      return;
    }

    if (action === 'cancel-editor') {
      editor = null;
      paint();
      return;
    }

    if (action === 'edit-item') {
      activeTab = 'items';
      editor = { kind: 'item', id: actionEl.dataset.id };
      paint();
      page.querySelector('#adminItemForm input[name="title"]')?.focus();
      return;
    }

    if (action === 'edit-event') {
      activeTab = 'events';
      editor = { kind: 'event', id: actionEl.dataset.id };
      paint();
      page.querySelector('#adminEventForm input[name="title"]')?.focus();
      return;
    }

    if (action === 'delete-item') {
      if (!window.confirm(t('confirmDeleteItem'))) return;
      actionEl.disabled = true;
      try {
        await deleteItem(actionEl.dataset.id);
        invalidateDataCache();
        showToast(t('itemDeleted'), 'success');
        editor = null;
        await load(true);
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (actionEl.isConnected) actionEl.disabled = false;
      }
      return;
    }

    if (action === 'delete-event') {
      if (!window.confirm(t('confirmDeleteEvent'))) return;
      actionEl.disabled = true;
      try {
        await deleteEvent(actionEl.dataset.id);
        invalidateDataCache();
        showToast(t('eventDeleted'), 'success');
        editor = null;
        await load(true);
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (actionEl.isConnected) actionEl.disabled = false;
      }
      return;
    }

    if (action === 'toggle-report') {
      actionEl.disabled = true;
      try {
        const updated = await setReportHandled(actionEl.dataset.id, actionEl.dataset.handled === 'true');
        reports = reports.map((report) =>
          report.id === updated.id ? { ...report, handled: !!updated.handled } : report
        );
        showToast(t('reportUpdated'), 'success');
        paint();
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (actionEl.isConnected) actionEl.disabled = false;
      }
    }
  });

  page.addEventListener('submit', async (event) => {
    const itemFormEl = event.target.closest('#adminItemForm');
    if (itemFormEl) {
      event.preventDefault();
      const id = itemFormEl.dataset.id || '';
      const title = String(itemFormEl.querySelector('input[name="title"]')?.value || '').trim();
      const type = String(itemFormEl.querySelector('select[name="type"]')?.value || '');
      const subject = String(itemFormEl.querySelector('input[name="subject"]')?.value || '').trim();
      const due = fromDateTimeLocal(itemFormEl.querySelector('input[name="dueAt"]')?.value || '');
      const maxGroupSize = Number(itemFormEl.querySelector('input[name="maxGroupSize"]')?.value);
      const details = String(itemFormEl.querySelector('textarea[name="details"]')?.value || '').trim();

      if (!title || title.length > 120) {
        showToast(t('titleInvalid'), 'warning');
        return;
      }
      if (!REPORT_TYPES.includes(type)) {
        showToast(t('typeInvalid'), 'warning');
        return;
      }
      if (subject.length > 30) {
        showToast(t('subjectInvalid'), 'warning');
        return;
      }
      if (!due) {
        showToast(t('dateRequired'), 'warning');
        return;
      }
      if (!Number.isInteger(maxGroupSize) || maxGroupSize < 1 || maxGroupSize > 20) {
        showToast(t('invalidMaxSize'), 'warning');
        return;
      }
      if (details.length > 5000) {
        showToast(t('detailsTooLong'), 'warning');
        return;
      }

      const submit = itemFormEl.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;

      const payload = {
        type,
        title,
        details,
        subject_label: subject || null,
        due_at: due,
        max_group_size: maxGroupSize,
      };

      try {
        if (id) {
          await updateItem(id, payload);
          showToast(t('itemUpdated'), 'success');
        } else {
          await createItem(me?.id, payload);
          showToast(t('itemCreated'), 'success');
        }
        invalidateDataCache();
        editor = null;
        await load(true);
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (submit?.isConnected) submit.disabled = false;
      }
      return;
    }

    const eventFormEl = event.target.closest('#adminEventForm');
    if (!eventFormEl) return;
    event.preventDefault();

    const id = eventFormEl.dataset.id || '';
    const title = String(eventFormEl.querySelector('input[name="title"]')?.value || '').trim();
    const starts = fromDateTimeLocal(eventFormEl.querySelector('input[name="startsAt"]')?.value || '');
    const ends = fromDateTimeLocal(eventFormEl.querySelector('input[name="endsAt"]')?.value || '');
    const details = String(eventFormEl.querySelector('textarea[name="details"]')?.value || '').trim();

    if (!title || title.length > 120) {
      showToast(t('titleInvalid'), 'warning');
      return;
    }
    if (!starts) {
      showToast(t('dateRequired'), 'warning');
      return;
    }
    if (ends && new Date(ends).getTime() < new Date(starts).getTime()) {
      showToast(t('invalidDateRange'), 'warning');
      return;
    }
    if (details.length > 2000) {
      showToast(t('detailsTooLong'), 'warning');
      return;
    }

    const submit = eventFormEl.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    const payload = {
      title,
      details: details || null,
      starts_at: starts,
      ends_at: ends || null,
    };

    try {
      if (id) {
        await updateEvent(id, payload);
        showToast(t('eventUpdated'), 'success');
      } else {
        await createEvent(me?.id, payload);
        showToast(t('eventCreated'), 'success');
      }
      invalidateDataCache();
      editor = null;
      await load(true);
    } catch (error) {
      showToast(rpcErrorMessage(error, getLang()), 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  await load(true);
}
