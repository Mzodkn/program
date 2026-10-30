// Phase 6: profile page with avatar/banner uploads, WhatsApp visibility and
// view/edit modes. Images are processed in the browser before upload.
import { t, getLang, setLang } from './i18n.js';
import { escapeHTML, showToast } from './ui.js';
import {
  updateProfile,
  savePreferredLang,
  signOut,
  validateUsername,
  validateDisplayName,
} from './auth.js';
import {
  normalizeWhatsapp,
  validateWhatsapp,
  fetchContact,
  saveContact,
} from './profile-data.js';
import {
  avatarHtml,
  avatarUrl,
  bannerImageUrl,
  processAvatar,
  processBanner,
  uploadProfileAsset,
  deleteProfileAssets,
  profileUrl,
} from './assets.js';
import {
  pageHero,
  sectionHeader,
  primaryActionClass,
  secondaryActionClass,
} from './cards.js';

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';
const LABEL_CLASS = 'block text-xs mono text-brand-500 font-bold mb-1.5';
const HINT_CLASS = 'text-[11px] text-dark-muted mt-1.5 leading-relaxed';
const DISABLED_CLASS = 'disabled:opacity-60 disabled:cursor-not-allowed';
const FILE_LABEL_CLASS =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-dark-border bg-dark-elevated ' +
  'hover:border-brand-500 text-white font-bold text-xs cursor-pointer transition';

const IMAGE_ERROR_KEYS = new Set([
  'imageMissing',
  'imageTypeNotAllowed',
  'imageTooLarge',
  'imageDecodeFailed',
  'imageEncodeFailed',
  'imageUploadFailed',
  'bannerTooNarrow',
  'bannerBadRatio',
]);

function imageErrorKey(error) {
  const code = String(error?.code || error?.message || '');
  return IMAGE_ERROR_KEYS.has(code) ? code : 'imageUploadFailed';
}

function field(label, inputHtml, hintHtml = '') {
  return `<div class="mb-3">
    <label class="${LABEL_CLASS}">${escapeHTML(label)}</label>
    ${inputHtml}
    ${hintHtml ? `<p class="${HINT_CLASS}">${escapeHTML(hintHtml)}</p>` : ''}
  </div>`;
}

function languageButton(lang, label) {
  const active = getLang() === lang;
  const classes = active
    ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-brand-500/60 bg-brand-500/15 text-brand-500 font-bold text-sm transition'
    : secondaryActionClass;
  return `<button type="button" data-action="set-lang" data-lang="${lang}"
    aria-pressed="${active ? 'true' : 'false'}"
    class="${classes} ${DISABLED_CLASS}">${escapeHTML(label)}</button>`;
}

function profileRow(label, valueHtml, { ltr = false } = {}) {
  return `<div class="flex flex-col gap-1 border-t border-dark-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
    <span class="shrink-0 text-[11px] mono font-bold text-brand-500 sm:w-28">${escapeHTML(label)}</span>
    <span class="min-w-0 break-words text-sm font-semibold text-white"${ltr ? ' dir="ltr"' : ''}>${valueHtml}</span>
  </div>`;
}

function headerCard(profile, email, pending) {
  const bannerUrl = pending.bannerPreview || bannerImageUrl(profile, { animated: true });
  const displayName = String(profile?.display_name || profile?.username || '');
  const username = String(profile?.username || '');

  const banner = bannerUrl
    ? `<img src="${escapeHTML(bannerUrl)}" alt="" class="absolute inset-0 w-full h-full object-cover">`
    : `<div class="absolute inset-0 bg-gradient-to-br from-brand-500/25 via-sky-500/10 to-dark-base" aria-hidden="true"></div>`;

  const avatar = pending.avatarPreview
    ? `<img src="${escapeHTML(pending.avatarPreview)}" alt=""
        class="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border border-dark-border bg-dark-elevated">`
    : avatarHtml(profile, 'xl', { alt: displayName });

  return `<section class="rounded-2xl overflow-hidden border-2 border-brand-500/40 bg-dark-surface/95 shadow-2xl">
    <div class="relative h-36 sm:h-48 bg-dark-base overflow-hidden">
      ${banner}
      <div class="absolute inset-0 bg-gradient-to-t from-dark-surface via-dark-surface/20 to-transparent" aria-hidden="true"></div>
    </div>
    <div class="px-4 sm:px-7 pb-5">
      <div class="relative z-10 -mt-12 sm:-mt-16 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div class="relative z-10 rounded-full ring-4 ring-dark-surface bg-dark-surface shrink-0 self-start sm:self-auto">${avatar}</div>
        <div class="min-w-0 pb-1">
          <div class="text-xl sm:text-2xl font-extrabold text-white truncate">${escapeHTML(displayName)}</div>
          <div class="text-[11px] sm:text-xs mono text-dark-muted truncate" dir="ltr">@${escapeHTML(username)}</div>
          ${email ? `<div class="text-[11px] text-dark-muted truncate" dir="ltr">${escapeHTML(email)}</div>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function imageEditor(pending, profile) {
  const avatarPreview = pending.avatarPreview
    || avatarUrl(profile?.avatar_path);
  const bannerPreview = pending.bannerPreview
    || bannerImageUrl(profile);
  const banner = bannerPreview
    ? `<img src="${escapeHTML(bannerPreview)}" alt="" class="absolute inset-0 w-full h-full object-cover">`
    : `<div class="absolute inset-0 bg-gradient-to-br from-brand-500/20 to-dark-base" aria-hidden="true"></div>`;

  return `<div class="mb-5 space-y-4 rounded-xl border border-dark-border bg-dark-base/40 p-3 sm:p-4">
    <div>
      <span class="${LABEL_CLASS}">${escapeHTML(t('banner'))}</span>
      <div class="relative h-28 sm:h-36 rounded-lg overflow-hidden border border-dark-border bg-dark-base">
        ${banner}
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <label class="${FILE_LABEL_CLASS}" for="bannerInput">
          <span aria-hidden="true">🖼️</span>${escapeHTML(t('chooseImage'))}
        </label>
        <input id="bannerInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only">
      </div>
      <p class="${HINT_CLASS}">${escapeHTML(t('bannerHint'))}</p>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-dark-border pt-4">
      <div class="shrink-0">
        ${avatarPreview
          ? `<img src="${escapeHTML(avatarPreview)}" alt="" class="w-16 h-16 rounded-full object-cover border border-dark-border bg-dark-elevated">`
          : avatarHtml(profile, 'lg')}
      </div>
      <div class="min-w-0">
        <span class="${LABEL_CLASS}">${escapeHTML(t('avatar'))}</span>
        <label class="${FILE_LABEL_CLASS}" for="avatarInput">
          <span aria-hidden="true">🙂</span>${escapeHTML(t('chooseImage'))}
        </label>
        <input id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only">
        <p class="${HINT_CLASS}">${escapeHTML(t('avatarHint'))}</p>
      </div>
    </div>
  </div>`;
}

function profileViewHtml(profile, contact) {
  const username = String(profile?.username || '');
  const displayName = String(profile?.display_name || '');
  const bio = String(profile?.bio || '').trim();
  const number = String(contact?.whatsapp_e164 || '');
  const show = !!contact?.show_whatsapp;
  const publicUrl = profileUrl(profile);

  const whatsappValue = number
    ? `<span dir="ltr">${escapeHTML(number)}</span>
       <span class="ms-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold mono ${
         show
           ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
           : 'border-dark-border bg-dark-elevated text-dark-muted'
       }">${escapeHTML(show ? t('whatsappVisible') : t('whatsappHidden'))}</span>`
    : `<span class="text-dark-muted">${escapeHTML(t('whatsappNotSet'))}</span>`;

  return `<div>
    ${profileRow(t('username'), username ? `@${escapeHTML(username)}` : '—', { ltr: true })}
    ${profileRow(t('displayName'), displayName ? escapeHTML(displayName) : '—')}
    ${profileRow(t('bio'), bio ? escapeHTML(bio) : '—')}
    ${profileRow(t('whatsapp'), whatsappValue)}
    ${publicUrl
      ? `<div class="pt-3 border-t border-dark-border">
          <a href="${escapeHTML(publicUrl)}" class="${secondaryActionClass}">
            <span aria-hidden="true">🔗</span>${escapeHTML(t('publicProfile'))}
          </a>
        </div>`
      : ''}
  </div>`;
}

function profileEditHtml(profile, contact, pending) {
  const username = String(profile?.username || '');
  const displayName = String(profile?.display_name || '');
  const bio = String(profile?.bio || '');
  const number = String(contact?.whatsapp_e164 || '');
  const show = !!contact?.show_whatsapp;

  return `<form id="settingsProfileForm" novalidate>
    ${imageEditor(pending, profile)}
    ${field(t('username'),
      `<input name="username" type="text" dir="ltr" autocomplete="username" required maxlength="20"
        pattern="[a-z0-9_]{3,20}" value="${escapeHTML(username)}" class="${INPUT_CLASS}">`,
      t('usernameHint'))}
    ${field(t('displayName'),
      `<input name="displayName" type="text" required maxlength="50" value="${escapeHTML(displayName)}" class="${INPUT_CLASS}">`,
      t('displayNameHint'))}
    ${field(t('bio'),
      `<textarea name="bio" rows="4" maxlength="200" class="${INPUT_CLASS}">${escapeHTML(bio)}</textarea>`,
      t('bioHint'))}

    <div class="rounded-xl border border-dark-border bg-dark-base/40 p-3 sm:p-4 mb-4">
      <div class="text-xs font-extrabold text-white mb-3">${escapeHTML(t('whatsappSection'))}</div>
      ${field(t('whatsapp'),
        `<input name="whatsapp" type="tel" dir="ltr" autocomplete="tel" maxlength="20"
          placeholder="+249912345678" value="${escapeHTML(number)}" class="${INPUT_CLASS}">`,
        t('whatsappHint'))}
      <label class="flex items-start gap-2.5 cursor-pointer select-none">
        <input name="showWhatsapp" type="checkbox" ${show ? 'checked' : ''}
          class="mt-0.5 h-4 w-4 rounded border-dark-border bg-dark-base text-brand-500 focus:ring-brand-500/40">
        <span class="min-w-0">
          <span class="block text-sm font-bold text-white">${escapeHTML(t('showWhatsapp'))}</span>
          <span class="block ${HINT_CLASS}">${escapeHTML(t('showWhatsappHint'))}</span>
        </span>
      </label>
    </div>

    <div class="flex flex-wrap gap-2">
      <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('saveProfile'))}</button>
      <button type="button" data-action="cancel-edit-profile" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
    </div>
  </form>`;
}

function settingsHtml(profile, email, editing, contact, pending) {
  const publicUrl = profileUrl(profile);

  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/settings',
      title: t('profile'),
      subtitle: t('settingsIntro'),
    })}

    ${headerCard(profile, email, pending)}

    <div class="grid lg:grid-cols-3 gap-5 items-start">
      <section class="lg:col-span-2 rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-6">
        ${sectionHeader(t('profileDetails'), {
          icon: '👤',
          actionHtml: editing
            ? ''
            : `<div class="flex flex-wrap items-center gap-2">
                ${publicUrl
                  ? `<a href="${escapeHTML(publicUrl)}" class="${secondaryActionClass}">${escapeHTML(t('publicProfile'))}</a>`
                  : ''}
                <button type="button" data-action="edit-profile" class="${secondaryActionClass}">${escapeHTML(t('edit'))}</button>
              </div>`,
        })}
        ${editing ? profileEditHtml(profile, contact, pending) : profileViewHtml(profile, contact)}
      </section>

      <div class="space-y-5">
        <section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
          ${sectionHeader(t('language'), { icon: '🌐' })}
          <p class="text-xs text-dark-muted leading-relaxed mb-3">${escapeHTML(t('languageHint'))}</p>
          <div class="grid grid-cols-2 gap-2">
            ${languageButton('ar', t('arabic'))}
            ${languageButton('en', t('english'))}
          </div>
        </section>

        <section class="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
          ${sectionHeader(t('account'), { icon: '🔐' })}
          ${email ? `<div class="text-[11px] mono text-dark-muted break-all mb-3" dir="ltr">${escapeHTML(email)}</div>` : ''}
          <button type="button" data-action="sign-out"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 font-bold text-xs sm:text-sm transition ${DISABLED_CLASS}">
            ${escapeHTML(t('signOut'))}
          </button>
          <p class="${HINT_CLASS}">${escapeHTML(t('signOutHint'))}</p>
        </section>
      </div>
    </div>
  </div>`;
}

export async function renderSettings(root, ctx = {}) {
  const me = ctx.profile;
  if (!me) return;

  root.innerHTML = '<div id="settingsPage" class="fade"></div>';
  const page = root.querySelector('#settingsPage');
  const email = ctx.session?.user?.email || '';
  let profile = me;
  let contact = { whatsapp_e164: '', show_whatsapp: false };
  let editing = false;
  let pending = { avatar: null, banner: null, avatarPreview: '', bannerPreview: '' };

  try {
    const stored = await fetchContact(profile.id);
    if (stored) {
      contact = {
        whatsapp_e164: String(stored.whatsapp_e164 || ''),
        show_whatsapp: !!stored.show_whatsapp,
      };
    }
  } catch (error) {
    // Keep empty defaults; the rest of the profile still works.
  }

  function revokePreviews() {
    for (const url of [pending.avatarPreview, pending.bannerPreview]) {
      if (url && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch (error) { /* ignore */ }
      }
    }
  }

  function clearPending() {
    revokePreviews();
    pending = { avatar: null, banner: null, avatarPreview: '', bannerPreview: '' };
  }

  function paint() {
    page.innerHTML = settingsHtml(profile, email, editing, contact, pending);
  }

  paint();

  page.addEventListener('change', async (event) => {
    const input = event.target.closest('input[type="file"]');
    if (!input || !input.files?.[0]) return;

    const file = input.files[0];
    const kind = input.id === 'avatarInput' ? 'avatar' : 'banner';
    input.value = '';

    try {
      if (kind === 'avatar') {
        const processed = await processAvatar(file);
        if (pending.avatarPreview) URL.revokeObjectURL(pending.avatarPreview);
        pending.avatar = processed;
        pending.avatarPreview = URL.createObjectURL(file);
      } else {
        const processed = await processBanner(file);
        if (pending.bannerPreview) URL.revokeObjectURL(pending.bannerPreview);
        pending.banner = processed;
        pending.bannerPreview = URL.createObjectURL(processed.isAnimated ? file : processed.blob);
      }
      paint();
    } catch (error) {
      showToast(t(imageErrorKey(error)), 'error');
    }
  });

  page.addEventListener('click', async (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || actionEl.disabled) return;
    const action = actionEl.dataset.action;

    if (action === 'edit-profile') {
      editing = true;
      paint();
      page.querySelector('input[name="displayName"]')?.focus();
      return;
    }

    if (action === 'cancel-edit-profile') {
      clearPending();
      editing = false;
      paint();
      return;
    }

    if (action === 'set-lang') {
      const next = actionEl.dataset.lang === 'en' ? 'en' : 'ar';
      if (next === getLang()) return;

      actionEl.disabled = true;
      try {
        await savePreferredLang(profile.id, next);
        const updated = { ...profile, preferred_lang: next };
        profile = updated;
        ctx.onProfileUpdated?.(updated);
        setLang(next);
        showToast(t('languageUpdated'), 'success');
      } catch (error) {
        showToast(t('genericError'), 'error');
        if (actionEl.isConnected) actionEl.disabled = false;
      }
      return;
    }

    if (action === 'sign-out') {
      if (!window.confirm(t('signOutConfirm'))) return;
      actionEl.disabled = true;
      try {
        await signOut();
        showToast(t('signedOut'), 'success');
      } catch (error) {
        showToast(t('genericError'), 'error');
        if (actionEl.isConnected) actionEl.disabled = false;
      }
    }
  });

  page.addEventListener('submit', async (event) => {
    const form = event.target.closest('#settingsProfileForm');
    if (!form) return;
    event.preventDefault();

    const username = String(form.querySelector('input[name="username"]')?.value || '').trim().toLowerCase();
    const displayName = String(form.querySelector('input[name="displayName"]')?.value || '').trim();
    const bio = String(form.querySelector('textarea[name="bio"]')?.value || '').trim();
    const whatsapp = normalizeWhatsapp(form.querySelector('input[name="whatsapp"]')?.value || '');
    const showWhatsapp = !!form.querySelector('input[name="showWhatsapp"]')?.checked;

    if (!validateUsername(username)) {
      showToast(t('usernameInvalid'), 'warning');
      return;
    }
    if (!validateDisplayName(displayName)) {
      showToast(t('displayNameInvalid'), 'warning');
      return;
    }
    if (bio.length > 200) {
      showToast(t('bioInvalid'), 'warning');
      return;
    }
    if (whatsapp && !validateWhatsapp(whatsapp)) {
      showToast(t('whatsappInvalid'), 'warning');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    const uploaded = [];
    let savedContact = null;

    try {
      savedContact = await saveContact(profile.id, {
        whatsappE164: whatsapp || null,
        showWhatsapp,
      });

      const assetFields = {};
      const oldPaths = [];

      if (pending.avatar) {
        const avatarPath = await uploadProfileAsset(profile.id, {
          blob: pending.avatar.blob,
          ext: pending.avatar.ext,
          contentType: pending.avatar.contentType,
          kind: 'avatar',
        });
        uploaded.push(avatarPath);
        assetFields.avatarPath = avatarPath;
        oldPaths.push(profile.avatar_path);
      }

      if (pending.banner) {
        const bannerPath = await uploadProfileAsset(profile.id, {
          blob: pending.banner.blob,
          ext: pending.banner.ext,
          contentType: pending.banner.contentType,
          kind: 'banner',
        });
        uploaded.push(bannerPath);
        assetFields.bannerPath = bannerPath;
        assetFields.bannerIsAnimated = pending.banner.isAnimated;
        oldPaths.push(profile.banner_path);

        if (pending.banner.isAnimated) {
          const posterPath = await uploadProfileAsset(profile.id, {
            blob: pending.banner.posterBlob,
            ext: pending.banner.posterExt,
            contentType: 'image/webp',
            kind: 'banner-poster',
          });
          uploaded.push(posterPath);
          assetFields.bannerPosterPath = posterPath;
        } else {
          assetFields.bannerPosterPath = null;
        }
        oldPaths.push(profile.banner_poster_path);
      }

      const updated = await updateProfile(profile.id, {
        username,
        displayName,
        bio,
        ...assetFields,
      });

      profile = updated;
      contact = {
        whatsapp_e164: String(savedContact?.whatsapp_e164 || ''),
        show_whatsapp: !!savedContact?.show_whatsapp,
      };
      clearPending();
      editing = false;
      ctx.onProfileUpdated?.(updated);
      showToast(t('profileSaved'), 'success');
      paint();

      deleteProfileAssets(oldPaths.filter((path) => path && !uploaded.includes(path)));
    } catch (error) {
      if (uploaded.length) deleteProfileAssets(uploaded);
      if (error?.code === '23505') {
        showToast(t('usernameTaken'), 'error');
      } else if (IMAGE_ERROR_KEYS.has(String(error?.code || error?.message || ''))) {
        showToast(t(imageErrorKey(error)), 'error');
      } else {
        showToast(t('genericError'), 'error');
      }
      if (submit?.isConnected) submit.disabled = false;
    }
  });
}
