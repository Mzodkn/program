// Public student directory. Anyone, including signed-out guests, can search
// profiles by display name or username and open the public profile page.
import { t, tf, getLang } from './i18n.js';
import { escapeHTML, showToast, describeDataError } from './ui.js';
import { searchProfiles } from './profile-data.js';
import { avatarHtml, profileUrl } from './assets.js';
import { pageHero, emptyPanel, loadingPanel, errorPanel } from './cards.js';

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';

function excerpt(value, max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function profileCard(profile) {
  const name = String(profile?.display_name || profile?.username || t('unknownUser'));
  const username = String(profile?.username || '');
  const bio = excerpt(profile?.bio);
  const href = profileUrl(profile);

  const body = `<div class="flex items-start gap-3">
    ${avatarHtml(profile, 'lg', { alt: name })}
    <div class="min-w-0 flex-1">
      <h3 class="text-sm sm:text-base font-extrabold text-white truncate group-hover:text-brand-500 transition">${escapeHTML(name)}</h3>
      ${username ? `<div class="text-[11px] mono text-dark-muted truncate" dir="ltr">@${escapeHTML(username)}</div>` : ''}
      ${bio ? `<p class="mt-2 text-xs text-dark-muted leading-relaxed break-words">${escapeHTML(bio)}</p>` : ''}
    </div>
  </div>`;

  if (!href) {
    return `<div class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4">${body}</div>`;
  }

  return `<a href="${escapeHTML(href)}"
    class="group block rounded-2xl border border-dark-border bg-dark-surface/90 p-4 hover:border-brand-500/50 hover:bg-dark-elevated/40 transition">${body}</a>`;
}

export async function renderUsersPage(root, ctx = {}) {
  let generation = 0;
  let debounce = null;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  root.innerHTML = `<div class="fade space-y-5">
    ${pageHero({
      path: '#/users',
      title: t('users'),
      subtitle: t('usersIntro'),
    })}

    <section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
      <form id="userSearchForm" role="search" novalidate>
        <label for="userSearch" class="block text-xs mono text-brand-500 font-bold mb-1.5">${escapeHTML(t('searchUsers'))}</label>
        <input id="userSearch" name="q" type="search" autocomplete="off"
          placeholder="${escapeHTML(t('searchUsersPlaceholder'))}" class="${INPUT_CLASS}">
        <p class="text-[11px] text-dark-muted mt-1.5 leading-relaxed">${escapeHTML(t('searchUsersHint'))}</p>
      </form>
    </section>

    <section>
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white">
          <span class="text-brand-500 mono" aria-hidden="true">🔎</span>
          <span>${escapeHTML(t('allUsers'))}</span>
        </h2>
        <span id="userCount" class="text-[11px] mono text-dark-muted" aria-live="polite"></span>
      </div>
      <div id="usersResults" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-live="polite"></div>
    </section>
  </div>`;

  const page = root.firstElementChild;
  const results = page.querySelector('#usersResults');
  const countEl = page.querySelector('#userCount');
  const input = page.querySelector('#userSearch');

  async function load(query = '') {
    const current = ++generation;
    results.innerHTML = loadingPanel();
    if (countEl) countEl.textContent = '';

    try {
      const profiles = await searchProfiles(query);
      if (isStale() || current !== generation) return;

      if (countEl) countEl.textContent = tf('usersResults', { n: profiles.length });
      results.innerHTML = profiles.length
        ? profiles.map(profileCard).join('')
        : emptyPanel('👤', query.trim() ? t('noUsersFound') : t('noUsersYet'));
    } catch (error) {
      if (isStale() || current !== generation) return;
      const info = describeDataError(error, getLang());
      showToast(info.message, 'error');
      results.innerHTML = errorPanel(info, 'usersRetry');
    }
  }

  page.addEventListener('click', (event) => {
    if (event.target.closest('#usersRetry')) {
      load(input?.value || '');
    }
  });

  page.querySelector('#userSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    load(input?.value || '');
  });

  input?.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      load(input.value || '');
    }, 300);
  });

  await load('');
}
