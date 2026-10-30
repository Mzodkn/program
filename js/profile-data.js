// Phase 6 data access: public profiles, WhatsApp visibility and profile reports.
import { supabase } from './supabase.js';

const PROFILE_FIELDS =
  'id,username,display_name,bio,avatar_path,banner_path,banner_poster_path,banner_is_animated,preferred_lang,created_at';

const DIRECTORY_FIELDS =
  'id,username,display_name,bio,avatar_path,banner_path,banner_poster_path,banner_is_animated,created_at';

const CONTACT_FIELDS = 'user_id,whatsapp_e164,show_whatsapp';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeWhatsapp(value) {
  let text = String(value || '').trim().replace(/[\s\-().]/g, '');
  if (!text) return '';
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  if (/^[1-9][0-9]{7,14}$/.test(text)) text = `+${text}`;
  return text;
}

export function validateWhatsapp(value) {
  return /^\+[1-9][0-9]{7,14}$/.test(normalizeWhatsapp(value));
}

export async function fetchProfileByUsername(username) {
  const name = normalizeUsername(username);
  if (!name) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('username', name)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Public student directory. Two simple queries keep search text out of the
// PostgREST filter grammar; results are merged by profile id.
export async function searchProfiles(query = '', { limit = 30 } = {}) {
  const text = String(query || '').trim();
  const max = Number.isFinite(limit) ? Math.max(1, Math.min(60, Number(limit))) : 30;

  if (!text) {
    const { data, error } = await supabase
      .from('profiles')
      .select(DIRECTORY_FIELDS)
      .order('created_at', { ascending: false })
      .limit(max);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  const pattern = `%${text}%`;
  const [byUsername, byName] = await Promise.all([
    supabase.from('profiles').select(DIRECTORY_FIELDS).ilike('username', pattern).limit(max),
    supabase.from('profiles').select(DIRECTORY_FIELDS).ilike('display_name', pattern).limit(max),
  ]);

  if (byUsername.error) throw byUsername.error;
  if (byName.error) throw byName.error;

  const merged = new Map();
  [...(byUsername.data || []), ...(byName.data || [])].forEach((profile) => {
    merged.set(profile.id, profile);
  });

  return [...merged.values()]
    .sort((a, b) => String(a.display_name || a.username || '').localeCompare(String(b.display_name || b.username || '')))
    .slice(0, max);
}

export async function fetchContact(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('profile_contacts')
    .select(CONTACT_FIELDS)
    .eq('user_id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function saveContact(userId, { whatsappE164, showWhatsapp }) {
  const { data, error } = await supabase
    .from('profile_contacts')
    .upsert(
      {
        user_id: userId,
        whatsapp_e164: whatsappE164 || null,
        show_whatsapp: !!showWhatsapp && !!whatsappE164,
      },
      { onConflict: 'user_id' }
    )
    .select(CONTACT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function reportProfile(targetId, reporterId, reason) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    target_type: 'profile',
    target_id: targetId,
    reason: String(reason || '').trim() || null,
  });
  if (error) throw error;
}
