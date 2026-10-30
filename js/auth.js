// Auth and profile data access for IT Study Hub (Phase 2).
// Auth calls go through supabase-js; the profiles row is inserted by the
// browser after the first sign-in, as required by the schema.
import { supabase } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { t } from './i18n.js';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateUsername(value) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
}

export function validateDisplayName(value) {
  const text = String(value || '').trim();
  return text.length >= 1 && text.length <= 50;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Google OAuth uses a full-page redirect, so a provider that is not enabled
// would show Supabase's raw JSON error page. Check the public auth settings
// first and show a clear message instead.
async function isProviderEnabled(provider) {
  try {
    const response = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/settings', {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return true;
    const data = await response.json();
    const external = data?.external;
    if (!external || typeof external !== 'object') return true;
    return external[provider] === true;
  } catch (err) {
    // If settings cannot be read, let the redirect attempt speak for itself.
    return true;
  }
}

export async function signInWithGoogle() {
  const enabled = await isProviderEnabled('google');
  if (!enabled) {
    const error = new Error('provider is not enabled');
    error.code = 'provider_not_enabled';
    throw error;
  }

  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendReset(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_path, banner_path, banner_poster_path, banner_is_animated, preferred_lang, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile(userId, username, displayName, preferredLang) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      username: normalizeUsername(username),
      display_name: String(displayName || '').trim(),
      preferred_lang: preferredLang === 'en' ? 'en' : 'ar',
    })
    .select('id, username, display_name, bio, avatar_path, banner_path, banner_poster_path, banner_is_animated, preferred_lang, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function savePreferredLang(userId, lang) {
  const { error } = await supabase
    .from('profiles')
    .update({ preferred_lang: lang === 'en' ? 'en' : 'ar' })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfile(userId, {
  username,
  displayName,
  bio,
  avatarPath,
  bannerPath,
  bannerPosterPath,
  bannerIsAnimated,
}) {
  const payload = {
    username: normalizeUsername(username),
    display_name: String(displayName || '').trim(),
    bio: String(bio || '').trim() || null,
  };

  if (avatarPath !== undefined) payload.avatar_path = avatarPath || null;
  if (bannerPath !== undefined) payload.banner_path = bannerPath || null;
  if (bannerPosterPath !== undefined) payload.banner_poster_path = bannerPosterPath || null;
  if (bannerIsAnimated !== undefined) payload.banner_is_animated = !!bannerIsAnimated;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, username, display_name, bio, avatar_path, banner_path, banner_poster_path, banner_is_animated, preferred_lang, created_at')
    .single();
  if (error) throw error;
  return data;
}

// Translate Supabase auth errors into clear Arabic/English messages.
export function mapAuthError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const m = message.toLowerCase();

  if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return t('invalidCredentials');
  if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return t('emailNotConfirmed');
  if (code === 'user_already_exists' || m.includes('already registered')) return t('userExists');
  if (code === 'weak_password' || m.includes('password should be at least')) return t('weakPassword');
  if (code === 'validation_failed' || m.includes('invalid email')) return t('invalidEmail');
  if (code === 'over_email_send_rate_limit' || m.includes('rate limit') || m.includes('too many')) return t('rateLimit');
  if (code === 'provider_not_enabled' || m.includes('provider is not enabled') || m.includes('unsupported provider')) return t('googleNotEnabled');
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return t('genericError');

  return message || t('genericError');
}
