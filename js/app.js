// App shell: guest browsing, auth gating, profile setup and routing.
// Signed out        -> public pages render read-only; account pages ask to sign in
// Signed in, no row -> profile setup form (username + display name)
// Signed in + row   -> the routed app pages
import { supabase } from './supabase.js';
import { initLang, setLang, getLang, t } from './i18n.js';
import { formatEventCountdown } from './format.js';
import { startRouter } from './router.js';
import { escapeHTML, showToast, describeDataError } from './ui.js';
import { renderDashboard } from './dashboard.js';
import { renderCalendar } from './calendar.js';
import { renderItemPage } from './item-page.js';
import { renderGroups, renderGroupPage } from './groups.js';
import { renderSettings } from './settings.js';
import { renderProfilePage } from './profile-page.js';
import { renderUsersPage } from './users.js';
import { renderAdmin } from './admin.js';
import { checkIsAdmin } from './admin-data.js';
import {
  signIn,
  signUp,
  signInWithGoogle,
  sendReset,
  updatePassword,
  fetchProfile,
  createProfile,
  validateUsername,
  validateDisplayName,
  mapAuthError,
} from './auth.js';

const app = document.getElementById('app');
const nav = document.getElementById('mainNav');
const userChip = document.getElementById('userChip');
const signInChip = document.getElementById('signInChip');
const langBtn = document.getElementById('langBtn');
const guestBanner = document.getElementById('guestBanner');

// Pages with a renderer below are real. The remaining entries are placeholders
// until their build phase.
const pageMeta = {
  dashboard: { titleKey: 'dashboard', phase: null, icon: '🏠', nav: 'dashboard' },
  calendar:  { titleKey: 'calendar',  phase: null, icon: '📅', nav: 'calendar' },
  groups:    { titleKey: 'groups',    phase: null, icon: '👥', nav: 'groups' },
  group:     { titleKey: 'group',     phase: null, icon: '👥', nav: 'groups' },
  item:      { titleKey: 'item',      phase: null, icon: '📌', nav: 'dashboard' },
  users:     { titleKey: 'users',     phase: null, icon: '🔎', nav: 'users' },
  user:      { titleKey: 'profile',   phase: null, icon: '🙂', nav: null },
  settings:  { titleKey: 'settings',  phase: null, icon: '⚙️', nav: 'settings' },
  admin:     { titleKey: 'admin',     phase: null, icon: '🛡️', nav: 'admin' },
  signin:    { titleKey: 'signIn',    phase: null, icon: '🔐', nav: null },
  signup:    { titleKey: 'signUp',    phase: null, icon: '✨', nav: null },
  reset:     { titleKey: 'resetPassword', phase: null, icon: '🔑', nav: null },
  notFound:  { titleKey: 'notFound',  phase: null, icon: '❓', nav: null },
};

// Pages that need an account. Guests see the sign-in form instead.
const AUTH_REQUIRED_ROUTES = new Set(['settings', 'admin']);
const AUTH_ROUTES = new Set(['signin', 'signup', 'reset']);

let viewSerial = 0;

const state = {
  booted: false,
  session: null,
  profile: null,
  isAdmin: false,
  recoveryMode: false,
  notice: null,       // checkEmail | resetSent
  returnTo: null,     // hash to open after a successful sign-in
  authReason: null,   // shown above the sign-in form
  currentRoute: { name: 'dashboard', params: {}, path: '' },
};

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';

const primaryBtnClass =
  'w-full px-4 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-amber-500 hover:from-brand-500 ' +
  'hover:to-amber-400 text-white font-bold text-sm transition shadow-lg shadow-brand-600/25 ' +
  'disabled:opacity-60 disabled:cursor-wait';

const linkBtnClass = 'text-brand-500 hover:text-amber-400 text-xs sm:text-sm font-bold transition';

function googleButtonHtml() {
  return `<button id="googleBtn" type="button"
    class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white text-gray-800 font-bold text-sm hover:bg-gray-100 transition shadow-lg">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="w-5 h-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
    <span>${t('continueWithGoogle')}</span>
  </button>`;
}

function authDividerHtml() {
  return `<div class="flex items-center gap-3 my-5">
    <span class="h-px flex-1 bg-dark-border"></span>
    <span class="text-[11px] mono text-dark-muted">${t('orDivider')}</span>
    <span class="h-px flex-1 bg-dark-border"></span>
  </div>`;
}

function wireGoogleButton() {
  const btn = document.getElementById('googleBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await signInWithGoogle();
      // The browser redirects to Google; nothing else to do here.
    } catch (err) {
      showToast(mapAuthError(err), 'error');
      btn.disabled = false;
    }
  });
}

function suggestUsernameFromEmail(email) {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const candidate = local.slice(0, 20);
  return candidate.length >= 3 ? candidate : '';
}

function cardShell(title, icon, bodyHtml, tag = 'it_study_hub.auth') {
  return `<div class="fade">
    <section class="max-w-md mx-auto rounded-2xl bg-dark-surface/95 backdrop-blur border-2 border-brand-500/40 shadow-2xl overflow-hidden">
      <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-base/60">
        <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
        <span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
        <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
        <span class="text-[11px] mono text-dark-muted ms-2" dir="ltr">${escapeHTML(tag)}</span>
      </div>
      <div class="p-6 sm:p-8">
        <div class="text-center mb-6">
          <div class="text-4xl mb-3" aria-hidden="true">${icon}</div>
          <h1 class="text-2xl font-extrabold text-white">${escapeHTML(title)}</h1>
        </div>
        ${bodyHtml}
      </div>
    </section>
  </div>`;
}

function field(label, inputHtml, hintHtml = '') {
  return `<div class="mb-4">
    <label class="block text-xs mono text-brand-500 font-bold mb-1.5">${label}</label>
    ${inputHtml}
    ${hintHtml ? `<p class="text-[11px] text-dark-muted mt-1.5 leading-relaxed">${hintHtml}</p>` : ''}
  </div>`;
}

function setBusy(form, busy) {
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = busy;
  form.querySelectorAll('input').forEach((input) => { input.disabled = busy; });
}

function setHeaderVisibility() {
  const signedIn = !!(state.session && state.profile);
  const guest = !state.session;
  const authPage = AUTH_ROUTES.has(state.currentRoute.name);
  const gatePage = !state.session && AUTH_REQUIRED_ROUTES.has(state.currentRoute.name);
  const showGuestChrome = guest && state.booted && !state.recoveryMode && !authPage && !gatePage;
  const showNav = state.booted && !state.recoveryMode && (signedIn || guest);

  nav.style.display = showNav ? 'flex' : 'none';
  userChip.style.display = signedIn ? 'inline-flex' : 'none';
  if (signInChip) signInChip.style.display = showGuestChrome ? 'inline-flex' : 'none';
  if (langBtn) langBtn.style.display = signedIn ? 'none' : 'inline-block';
  if (guestBanner) guestBanner.style.display = showGuestChrome ? '' : 'none';

  if (signedIn) {
    userChip.textContent = '@' + state.profile.username;
    userChip.title = state.profile.display_name || '';
  }

  const settingsLink = document.getElementById('settingsNavLink');
  if (settingsLink) settingsLink.style.display = signedIn ? '' : 'none';

  const adminLink = document.getElementById('adminNavLink');
  if (adminLink) {
    adminLink.style.display = signedIn && state.isAdmin ? '' : 'none';
  }
}

function safeReturnTo() {
  const target = String(state.returnTo || '');
  if (!target || !target.startsWith('#/')) return '#/dashboard';
  if (/#\/(signin|signup|reset)\/?$/.test(target)) return '#/dashboard';
  return target;
}

function goTo(hash) {
  const target = String(hash || '#/dashboard');
  if (window.location.hash === target) {
    window.dispatchEvent(new Event('hashchange'));
  } else {
    window.location.hash = target;
  }
}

function render() {
  setHeaderVisibility();

  if (!state.booted) {
    app.innerHTML = `<div class="fade text-center py-24 text-dark-muted mono text-sm">${escapeHTML(t('loading'))}</div>`;
    return;
  }

  if (state.recoveryMode) {
    renderRecovery();
    return;
  }

  const routeName = state.currentRoute.name;

  if (!state.session) {
    if (AUTH_REQUIRED_ROUTES.has(routeName)) {
      state.authReason = 'signInToContinue';
      state.returnTo = '#/' + (state.currentRoute.path || routeName);
      renderAuth();
      return;
    }

    if (AUTH_ROUTES.has(routeName)) {
      state.authReason = null;
      renderAuth();
      return;
    }

    // Guests can browse public pages; page renderers hide write actions.
    state.authReason = null;
    renderRoute();
    return;
  }

  if (!state.profile) {
    renderProfileSetup();
    return;
  }

  if (AUTH_ROUTES.has(routeName)) {
    goTo(safeReturnTo());
    return;
  }

  state.authReason = null;
  renderRoute();
}

// ---------- Signed out: sign in / sign up / reset ----------

function renderAuth() {
  const meta = pageMeta[state.currentRoute.name] || pageMeta.signin;
  document.title = `${t(meta.titleKey)} | IT Study Hub`;
  updateNav({ nav: null });

  if (state.notice === 'checkEmail') return renderNotice('checkEmail');
  if (state.notice === 'resetSent') return renderNotice('resetSent');

  const routeName = state.currentRoute.name;
  if (routeName === 'signup') return renderSignUp();
  if (routeName === 'reset') return renderReset();
  return renderSignIn();
}

function renderSignIn() {
  const reasonHtml = state.authReason
    ? `<div class="mb-5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm font-bold text-amber-100 text-center">
        ${escapeHTML(t(state.authReason))}
      </div>`
    : '';

  app.innerHTML = cardShell(
    t('signIn'),
    '🔐',
    `${reasonHtml}${googleButtonHtml()}
    ${authDividerHtml()}
    <form id="signInForm" novalidate>
      ${field(t('email'),
        `<input name="email" type="email" dir="ltr" autocomplete="email" required placeholder="you@example.com" class="${inputClass}">`)}
      ${field(t('password'),
        `<input name="password" type="password" dir="ltr" autocomplete="current-password" required minlength="6" placeholder="••••••••" class="${inputClass}">`)}
      <button type="submit" class="${primaryBtnClass} mt-2">${t('signIn')}</button>
    </form>
    <div class="flex items-center justify-between mt-5">
      <button id="goSignUp" type="button" class="${linkBtnClass}">${t('signUp')}</button>
      <button id="goReset" type="button" class="${linkBtnClass}">${t('forgotPassword')}</button>
    </div>
    <button id="goGuest" type="button" class="${linkBtnClass} mt-5 block mx-auto">${t('browseAsGuest')}</button>`
  );

  const form = document.getElementById('signInForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.querySelector('input[name="email"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;
    if (!email || !password) {
      showToast(t('requiredFields'), 'warning');
      return;
    }
    setBusy(form, true);
    try {
      await signIn(email, password);
      showToast(t('welcomeBack'), 'success');
    } catch (err) {
      showToast(mapAuthError(err), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  document.getElementById('goSignUp').addEventListener('click', () => {
    state.notice = null;
    goTo('#/signup');
  });
  document.getElementById('goReset').addEventListener('click', () => {
    state.notice = null;
    goTo('#/reset');
  });
  document.getElementById('goGuest').addEventListener('click', () => {
    state.returnTo = null;
    goTo('#/dashboard');
  });

  wireGoogleButton();
}

function renderSignUp() {
  app.innerHTML = cardShell(
    t('signUp'),
    '✨',
    `${googleButtonHtml()}
    ${authDividerHtml()}
    <form id="signUpForm" novalidate>
      ${field(t('email'),
        `<input name="email" type="email" dir="ltr" autocomplete="email" required placeholder="you@example.com" class="${inputClass}">`)}
      ${field(t('password'),
        `<input name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="6" placeholder="••••••••" class="${inputClass}">`,
        t('passwordHint'))}
      <button type="submit" class="${primaryBtnClass} mt-2">${t('signUp')}</button>
    </form>
    <button id="goSignIn" type="button" class="${linkBtnClass} mt-5 block mx-auto">${t('backToSignIn')}</button>`
  );

  const form = document.getElementById('signUpForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.querySelector('input[name="email"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;
    if (!email || !password) {
      showToast(t('requiredFields'), 'warning');
      return;
    }
    setBusy(form, true);
    try {
      const data = await signUp(email, password);
      if (!data?.session) {
        // Email confirmation is on: no session until the link is opened.
        state.notice = 'checkEmail';
        render();
      }
      // With a session, onAuthStateChange takes over and shows profile setup.
    } catch (err) {
      showToast(mapAuthError(err), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  document.getElementById('goSignIn').addEventListener('click', () => {
    state.notice = null;
    goTo('#/signin');
  });

  wireGoogleButton();
}

function renderReset() {
  app.innerHTML = cardShell(
    t('resetPassword'),
    '🔑',
    `<form id="resetForm" novalidate>
      ${field(t('email'),
        `<input name="email" type="email" dir="ltr" autocomplete="email" required placeholder="you@example.com" class="${inputClass}">`)}
      <button type="submit" class="${primaryBtnClass} mt-2">${t('sendReset')}</button>
    </form>
    <button id="goSignIn" type="button" class="${linkBtnClass} mt-5 block mx-auto">${t('backToSignIn')}</button>`
  );

  const form = document.getElementById('resetForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.querySelector('input[name="email"]').value.trim();
    if (!email) {
      showToast(t('requiredFields'), 'warning');
      return;
    }
    setBusy(form, true);
    try {
      await sendReset(email);
      state.notice = 'resetSent';
      render();
    } catch (err) {
      showToast(mapAuthError(err), 'error');
    } finally {
      setBusy(form, false);
    }
  });

  document.getElementById('goSignIn').addEventListener('click', () => {
    state.notice = null;
    goTo('#/signin');
  });
}

function renderNotice(kind) {
  const isEmail = kind === 'checkEmail';
  app.innerHTML = cardShell(
    t(isEmail ? 'checkEmailTitle' : 'resetSentTitle'),
    isEmail ? '📧' : '✉️',
    `<p class="text-dark-muted text-sm text-center leading-relaxed">${t(isEmail ? 'checkEmail' : 'resetSent')}</p>
     <button id="backToSignIn" type="button" class="${primaryBtnClass} mt-6">${t('backToSignIn')}</button>`
  );

  document.getElementById('backToSignIn').addEventListener('click', () => {
    state.notice = null;
    goTo('#/signin');
  });
}

// ---------- Password recovery (opened from the email link) ----------

function renderRecovery() {
  app.innerHTML = cardShell(
    t('resetPassword'),
    '🔑',
    `<p class="text-dark-muted text-sm text-center leading-relaxed mb-5">${t('recoveryHint')}</p>
     <form id="recoveryForm" novalidate>
      ${field(t('newPassword'),
        `<input name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="6" placeholder="••••••••" class="${inputClass}">`,
        t('passwordHint'))}
      <button type="submit" class="${primaryBtnClass} mt-2">${t('updatePassword')}</button>
    </form>`
  );

  const form = document.getElementById('recoveryForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = form.querySelector('input[name="password"]').value;
    if (!password || password.length < 6) {
      showToast(t('weakPassword'), 'warning');
      return;
    }
    setBusy(form, true);
    try {
      await updatePassword(password);
      state.recoveryMode = false;
      await refreshSessionAndProfile();
      showToast(t('passwordUpdated'), 'success');
      render();
    } catch (err) {
      showToast(mapAuthError(err), 'error');
      setBusy(form, false);
    }
  });
}

// ---------- Signed in without a profiles row: profile setup ----------

function renderProfileSetup() {
  // Google (or email) sign-up may provide a name we can prefill.
  const meta = state.session?.user?.user_metadata || {};
  const suggestedName = escapeHTML(String(meta.full_name || meta.name || '').trim().slice(0, 50));
  const suggestedUsername = escapeHTML(suggestUsernameFromEmail(state.session?.user?.email));

  app.innerHTML = cardShell(
    t('profileSetup'),
    '👤',
    `<p class="text-dark-muted text-sm text-center leading-relaxed mb-5">${t('profileSetupHint')}</p>
    <form id="profileForm" novalidate>
      ${field(t('username'),
        `<input name="username" type="text" dir="ltr" autocomplete="username" required maxlength="20"
          pattern="[a-z0-9_]{3,20}" placeholder="moaz_2026" value="${suggestedUsername}" class="${inputClass}">`,
        t('usernameHint'))}
      ${field(t('displayName'),
        `<input name="displayName" type="text" required maxlength="50" placeholder="${escapeHTML(t('displayName'))}" value="${suggestedName}" class="${inputClass}">`,
        t('displayNameHint'))}
      <button type="submit" class="${primaryBtnClass} mt-2">${t('createProfile')}</button>
    </form>`,
    'it_study_hub.profile'
  );

  const form = document.getElementById('profileForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = form.querySelector('input[name="username"]').value.trim().toLowerCase();
    const displayName = form.querySelector('input[name="displayName"]').value.trim();

    if (!validateUsername(username)) {
      showToast(t('usernameInvalid'), 'warning');
      return;
    }
    if (!validateDisplayName(displayName)) {
      showToast(t('displayNameInvalid'), 'warning');
      return;
    }

    setBusy(form, true);
    try {
      state.profile = await createProfile(state.session.user.id, username, displayName, getLang());
      showToast(t('welcomeBack'), 'success');
      render();
    } catch (err) {
      if (err?.code === '23505') {
        showToast(t('usernameTaken'), 'error');
      } else {
        showToast(t('genericError'), 'error');
      }
      setBusy(form, false);
    }
  });
}

// ---------- Signed in with a profile: routed pages ----------

function updateNav(meta) {
  document.querySelectorAll('.nav-link[data-route]').forEach((link) => {
    link.classList.toggle('active', meta.nav != null && link.dataset.route === meta.nav);
  });
}

function runPage(renderPage, ctx) {
  Promise.resolve(renderPage(app, ctx)).catch((error) => {
    if (ctx.isStale()) return;
    const info = describeDataError(error, getLang());
    showToast(info.message, 'error');
    app.innerHTML = `<div class="fade rounded-2xl border border-red-500/35 bg-red-500/10 p-6 text-center">
      <p class="text-sm font-bold text-red-200">${escapeHTML(info.message)}</p>
      <p class="mt-2 text-[10px] mono text-red-300/70" dir="ltr">${escapeHTML(info.code)}</p>
      <button id="pageReloadBtn" type="button" class="mt-4 px-4 py-2 rounded-lg border border-red-400/40 bg-red-500/15 text-red-100 text-xs font-bold">${escapeHTML(t('retry'))}</button>
    </div>`;
    document.getElementById('pageReloadBtn')?.addEventListener('click', () => window.location.reload());
  });
}

function renderRoute() {
  const meta = pageMeta[state.currentRoute.name] || pageMeta.notFound;
  const title = t(meta.titleKey);
  const hashPath = state.currentRoute.path ? '#/' + state.currentRoute.path : '';

  document.title = `${title} | IT Study Hub`;
  updateNav(meta);

  // Any earlier async page becomes stale as soon as a new route is rendered.
  const token = ++viewSerial;
  const ctx = {
    route: state.currentRoute,
    profile: state.profile,
    session: state.session,
    isStale: () => token !== viewSerial,
    onProfileUpdated: (profile) => {
      state.profile = profile;
      setHeaderVisibility();
    },
  };

  if (state.currentRoute.name === 'dashboard') {
    runPage(renderDashboard, ctx);
    return;
  }
  if (state.currentRoute.name === 'calendar') {
    runPage(renderCalendar, ctx);
    return;
  }
  if (state.currentRoute.name === 'item') {
    runPage(renderItemPage, ctx);
    return;
  }
  if (state.currentRoute.name === 'groups') {
    runPage(renderGroups, ctx);
    return;
  }
  if (state.currentRoute.name === 'users') {
    runPage(renderUsersPage, ctx);
    return;
  }
  if (state.currentRoute.name === 'group') {
    runPage(renderGroupPage, ctx);
    return;
  }
  if (state.currentRoute.name === 'settings') {
    runPage(renderSettings, ctx);
    return;
  }
  if (state.currentRoute.name === 'user') {
    runPage(renderProfilePage, ctx);
    return;
  }
  if (state.currentRoute.name === 'admin') {
    runPage(renderAdmin, ctx);
    return;
  }

  const params = Object.entries(state.currentRoute.params || {});
  const paramsHtml = params.length
    ? `<div class="inline-flex flex-col gap-1 mt-4 mb-1 text-start bg-dark-base/70 border border-dark-border rounded-xl px-4 py-3">
         ${params.map(([key, value]) =>
           `<div class="text-xs mono"><span class="text-dark-muted">${escapeHTML(key)}</span><span class="text-dark-muted"> = </span><span class="text-sky-400">${escapeHTML(value)}</span></div>`
         ).join('')}
       </div>`
    : '';

  app.innerHTML = `
    <div class="fade">
      <section class="rounded-2xl bg-dark-surface/95 backdrop-blur border-2 border-brand-500/40 shadow-2xl overflow-hidden mb-4">
        <div class="flex items-center gap-1.5 px-4 py-2.5 border-b border-dark-border bg-dark-base/60">
          <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
          <span class="text-[11px] mono text-dark-muted ms-2" dir="ltr">${escapeHTML(hashPath || 'it_study_hub')}</span>
        </div>
        <div class="p-6 sm:p-10 text-center">
          <div class="text-5xl mb-4" aria-hidden="true">${meta.icon}</div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-white mb-2">${escapeHTML(title)}</h1>
          ${hashPath ? `<div class="text-xs sm:text-sm mono text-dark-muted mb-2" dir="ltr">${escapeHTML(hashPath)}</div>` : ''}
          ${paramsHtml}
          <p class="text-dark-muted text-sm mt-4">
            ${meta.phase
              ? `${t('underConstruction')} <span class="text-brand-500 font-bold">${meta.phase}</span>`
              : t('notFoundText')}
          </p>
          ${meta.phase
            ? ''
            : `<a href="#/dashboard" class="inline-block mt-5 px-5 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/40 text-brand-500 font-bold text-sm hover:bg-brand-500/25 transition">${t('backHome')}</a>`}
        </div>
      </section>
    </div>`;
}

// ---------- Session helpers ----------

async function refreshSessionAndProfile() {
  try {
    const { data } = await supabase.auth.getSession();
    state.session = data?.session ?? null;
  } catch (err) {
    state.session = null;
  }

  if (state.session?.user) {
    try {
      state.profile = await fetchProfile(state.session.user.id);
    } catch (err) {
      state.profile = null;
    }
  } else {
    state.profile = null;
  }

  state.isAdmin = false;
  if (state.profile?.id) {
    try {
      state.isAdmin = await checkIsAdmin();
    } catch (err) {
      state.isAdmin = false;
    }
  }
}

async function boot() {
  initLang();
  render(); // loading state

  await refreshSessionAndProfile();

  // Apply the language saved on the profile (syncs a fresh device).
  if (state.profile?.preferred_lang && state.profile.preferred_lang !== getLang()) {
    setLang(state.profile.preferred_lang);
  }

  state.booted = true;

  // Supabase consumes auth tokens from the URL hash on startup.
  // If anything is left over, clean it so the router does not sit on a 404.
  if (/access_token=|error_description=|type=(recovery|signup|invite|magiclink)/.test(window.location.hash)) {
    history.replaceState(null, '', '#/dashboard');
    window.dispatchEvent(new Event('hashchange'));
  }

  render();

  supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user?.id || null;
    const currentUserId = state.session?.user?.id || null;
    const sameUser = !!nextUserId && nextUserId === currentUserId;

    // Token refreshes and focus recovery must not rebuild the current page.
    // Re-rendering here made the app look like it reloaded whenever the tab
    // regained focus.
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (session) state.session = session;
      return;
    }
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && sameUser) {
      state.session = session;
      return;
    }

    // Defer so Supabase's internal lock is released before other calls.
    setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') {
        state.session = session || state.session;
        state.recoveryMode = true;
        state.booted = true;
        render();
        return;
      }

      state.recoveryMode = false;

      if (event === 'SIGNED_OUT') {
        state.session = null;
        state.profile = null;
        state.isAdmin = false;
        state.notice = null;
        state.authReason = null;
        state.returnTo = null;
        state.booted = true;
        // Leave protected pages for the public dashboard, but keep the guest
        // on whatever public page they were reading.
        if (AUTH_REQUIRED_ROUTES.has(state.currentRoute.name)) {
          state.currentRoute = { name: 'dashboard', params: {}, path: '' };
          history.replaceState(null, '', '#/dashboard');
        }
        render();
        return;
      }

      if (session?.user) {
        state.session = session;
        try {
          state.profile = await fetchProfile(session.user.id);
        } catch (err) {
          state.profile = null;
        }
        state.isAdmin = false;
        if (state.profile?.id) {
          try {
            state.isAdmin = await checkIsAdmin();
          } catch (err) {
            state.isAdmin = false;
          }
        }
        if (state.profile?.preferred_lang && state.profile.preferred_lang !== getLang()) {
          setLang(state.profile.preferred_lang);
        }
      } else {
        state.session = null;
        state.profile = null;
        state.isAdmin = false;
      }

      state.booted = true;

      if (AUTH_ROUTES.has(state.currentRoute.name)) {
        const target = safeReturnTo();
        state.returnTo = null;
        goTo(target);
      } else {
        render();
      }
    }, 0);
  });
}

// ---------- Global wiring ----------

// Guests still need a language switch. Signed-in users change the language
// from #/settings.
langBtn.addEventListener('click', () => {
  const next = getLang() === 'ar' ? 'en' : 'ar';
  setLang(next);
});

// Remember where a guest was before opening sign-in, so they return there.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-return-to], #signInChip, #guestSignIn');
  if (!link) return;

  if (link.dataset.returnTo) {
    state.returnTo = link.dataset.returnTo;
    return;
  }
  if (!AUTH_ROUTES.has(state.currentRoute.name)) {
    state.returnTo = window.location.hash || '#/dashboard';
  }
});

window.addEventListener('languagechange', () => {
  render();
});

// Update countdown badges in place. This never re-renders the page, so coming
// back to the tab only refreshes the numbers that need refreshing.
function refreshEventCountdowns() {
  document.querySelectorAll('[data-countdown-start]').forEach((el) => {
    const text = formatEventCountdown({
      starts_at: el.dataset.countdownStart,
      ends_at: el.dataset.countdownEnd || null,
    });
    if (text && el.textContent !== text) el.textContent = text;
  });
}

setInterval(refreshEventCountdowns, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshEventCountdowns();
});

startRouter((route) => {
  state.currentRoute = route;
  render();
});

boot();
