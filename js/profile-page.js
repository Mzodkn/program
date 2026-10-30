// Phase 6: public profile page (#/u/:username), WhatsApp contact and reports.
import { t, getLang } from './i18n.js';
import { escapeHTML, showToast, describeDataError } from './ui.js';
import { fetchProfileByUsername, fetchContact, reportProfile } from './profile-data.js';
import { avatarHtml, bannerImageUrl } from './assets.js';
import { formatDate } from './format.js';
import {
  primaryActionClass,
  secondaryActionClass,
  emptyPanel,
  loadingPanel,
  errorPanel,
} from './cards.js';

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';
const LABEL_CLASS = 'block text-xs mono text-brand-500 font-bold mb-1.5';
const HINT_CLASS = 'text-[11px] text-dark-muted mt-1.5 leading-relaxed';
const DISABLED_CLASS = 'disabled:opacity-60 disabled:cursor-not-allowed';

function bannerHtml(profile) {
  const url = bannerImageUrl(profile, { animated: true });
  if (url) {
    return `<img src="${escapeHTML(url)}" alt="" class="absolute inset-0 w-full h-full object-cover">`;
  }
  return `<div class="absolute inset-0 bg-gradient-to-br from-brand-500/25 via-sky-500/10 to-dark-base" aria-hidden="true"></div>`;
}

function whatsappAction(contact, isMe) {
  const number = String(contact?.whatsapp_e164 || '');
  const visible = number && (contact?.show_whatsapp || isMe);
  if (!visible) return '';

  const digits = number.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return `<a href="https://wa.me/${escapeHTML(digits)}" target="_blank" rel="noopener noreferrer"
    class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-bold text-sm transition">
    <span aria-hidden="true">💬</span>${escapeHTML(t('whatsappContact'))}
  </a>`;
}

function reportPanel() {
  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-dark-muted">${escapeHTML(t('reportProfileHint'))}</p>
      <button type="button" data-action="toggle-report" class="${secondaryActionClass}">
        <span aria-hidden="true">⚑</span>${escapeHTML(t('reportProfile'))}
      </button>
    </div>
    <div data-report-panel class="hidden mt-3">
      <form id="reportProfileForm" novalidate>
        <label class="${LABEL_CLASS}" for="profileReportReason">${escapeHTML(t('reportReason'))}</label>
        <textarea id="profileReportReason" name="reason" rows="3" required maxlength="500" class="${INPUT_CLASS}"
          placeholder="${escapeHTML(t('reportReasonHint'))}"></textarea>
        <p class="${HINT_CLASS}">${escapeHTML(t('reportReasonHint'))}</p>
        <div class="flex flex-wrap gap-2 mt-3">
          <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('sendReport'))}</button>
          <button type="button" data-action="close-report" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
        </div>
      </form>
    </div>
  </section>`;
}

function guestReportPanel(username) {
  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
    <a href="#/signin" data-return-to="#/u/${escapeHTML(username)}" class="${secondaryActionClass}">
      <span aria-hidden="true">⚑</span>${escapeHTML(t('signInToReport'))}
    </a>
  </section>`;
}

function profilePageHtml(profile, contact, me) {
  const displayName = String(profile?.display_name || profile?.username || t('unknownUser'));
  const username = String(profile?.username || '');
  const bio = String(profile?.bio || '').trim();
  const isMe = !!me && me.id === profile.id;
  const joined = profile.created_at ? formatDate(profile.created_at) : '';

  return `<div class="fade space-y-5">
    <section class="rounded-2xl overflow-hidden border-2 border-brand-500/40 bg-dark-surface/95 shadow-2xl">
      <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-base/60">
        <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
        <span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
        <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
        <span class="text-[11px] mono text-dark-muted ms-2 truncate" dir="ltr">${escapeHTML('#/u/' + username)}</span>
      </div>

      <div class="relative h-36 sm:h-52 bg-dark-base overflow-hidden">
        ${bannerHtml(profile)}
        <div class="absolute inset-0 bg-gradient-to-t from-dark-surface via-dark-surface/20 to-transparent" aria-hidden="true"></div>
      </div>

      <div class="px-4 sm:px-7 pb-5 sm:pb-6">
        <div class="relative z-10 -mt-12 sm:-mt-16 flex flex-wrap items-end gap-4">
          <div class="relative z-10 rounded-full ring-4 ring-dark-surface bg-dark-surface shrink-0">
            ${avatarHtml(profile, 'xl', { alt: displayName })}
          </div>
          <div class="min-w-0 pb-1 flex-1">
            <h1 class="text-2xl sm:text-3xl font-extrabold text-white leading-tight break-words">${escapeHTML(displayName)}</h1>
            <div class="text-xs sm:text-sm mono text-dark-muted truncate" dir="ltr">@${escapeHTML(username)}</div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          ${whatsappAction(contact, isMe)}
          ${isMe
            ? `<a href="#/settings" class="${primaryActionClass}">${escapeHTML(t('editMyProfile'))}</a>`
            : ''}
          ${isMe ? `<span class="text-[11px] mono text-brand-500">${escapeHTML(t('thisIsYou'))}</span>` : ''}
          ${!me ? `<span class="text-[11px] text-dark-muted">${escapeHTML(t('guestProfileHint'))}</span>` : ''}
        </div>
      </div>
    </section>

    <div class="grid lg:grid-cols-3 gap-5 items-start">
      <section class="lg:col-span-2 rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-6">
        <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white mb-3">
          <span class="text-brand-500 mono" aria-hidden="true">❯</span>${escapeHTML(t('profileDetails'))}
        </h2>
        <p class="text-sm sm:text-base text-dark-muted leading-relaxed whitespace-pre-line break-words">
          ${bio ? escapeHTML(bio) : escapeHTML(t('noBio'))}
        </p>
        ${joined ? `<div class="mt-4 pt-3 border-t border-dark-border text-[11px] mono text-dark-muted">${escapeHTML(t('joinedOn'))}: <span class="text-white">${escapeHTML(joined)}</span></div>` : ''}
      </section>

      <div class="space-y-5">
        ${contact?.whatsapp_e164 && (contact.show_whatsapp || isMe)
          ? `<section class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
              <h2 class="text-sm font-extrabold text-emerald-200 mb-2">${escapeHTML(t('whatsapp'))}</h2>
              <div class="text-sm mono text-white break-all" dir="ltr">${escapeHTML(contact.whatsapp_e164)}</div>
              <p class="${HINT_CLASS}">${escapeHTML(t('whatsappShowHint'))}</p>
            </section>`
          : ''}
        ${isMe ? '' : (me ? reportPanel() : guestReportPanel(username))}
      </div>
    </div>
  </div>`;
}

export async function renderProfilePage(root, ctx = {}) {
  const username = String(ctx.route?.params?.username || '');
  const me = ctx.profile || null;
  let generation = 0;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  root.innerHTML = '<div id="profilePage" class="fade"></div>';
  const page = root.querySelector('#profilePage');

  async function load(force = false) {
    const current = ++generation;
    page.innerHTML = loadingPanel();

    try {
      const profile = await fetchProfileByUsername(username);
      if (isStale() || current !== generation) return;

      if (!profile) {
        document.title = `${t('profileNotFound')} | IT Study Hub`;
        page.innerHTML = `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-6 sm:p-8">
          ${emptyPanel('👤', t('profileNotFoundText'))}
        </section>`;
        return;
      }

      let contact = null;
      try {
        contact = await fetchContact(profile.id);
      } catch (error) {
        contact = null;
      }
      if (isStale() || current !== generation) return;

      document.title = `${profile.display_name || profile.username} | IT Study Hub`;
      page.innerHTML = profilePageHtml(profile, contact, me);
    } catch (error) {
      if (isStale() || current !== generation) return;
      const info = describeDataError(error, getLang());
      showToast(info.message, 'error');
      page.innerHTML = errorPanel(info, 'profileRetry');
    }
  }

  page.addEventListener('click', (event) => {
    if (event.target.closest('#profileRetry')) {
      load(true);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || actionEl.disabled) return;
    const action = actionEl.dataset.action;

    if (action === 'toggle-report') {
      const panel = page.querySelector('[data-report-panel]');
      panel?.classList.toggle('hidden');
      if (panel && !panel.classList.contains('hidden')) {
        panel.querySelector('textarea')?.focus();
      }
      return;
    }

    if (action === 'close-report') {
      page.querySelector('[data-report-panel]')?.classList.add('hidden');
      page.querySelector('#reportProfileForm')?.reset();
    }
  });

  page.addEventListener('submit', async (event) => {
    const form = event.target.closest('#reportProfileForm');
    if (!form) return;
    event.preventDefault();

    const reason = String(form.querySelector('textarea[name="reason"]')?.value || '').trim();
    if (!reason) {
      showToast(t('reportReasonRequired'), 'warning');
      return;
    }
    if (reason.length > 500) {
      showToast(t('reportReasonTooLong'), 'warning');
      return;
    }
    if (!me?.id) {
      showToast(t('genericError'), 'error');
      return;
    }

    const profile = await fetchProfileByUsername(username).catch(() => null);
    if (!profile) {
      showToast(t('profileNotFound'), 'error');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await reportProfile(profile.id, me.id, reason);
      form.reset();
      form.closest('[data-report-panel]')?.classList.add('hidden');
      showToast(t('reportSent'), 'success');
    } catch (error) {
      const info = describeDataError(error, getLang());
      showToast(info.message, 'error');
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  await load();
}
