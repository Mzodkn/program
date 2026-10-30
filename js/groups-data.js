// Phase 4 data access for groups.
// Reads rely on row level security; every write goes through one of the RPC
// functions from the schema so the database stays the source of truth.
import { supabase } from './supabase.js';
import { fetchItem } from './data.js';
import { getLang } from './i18n.js';
import { errorMessage, describeDataError } from './ui.js';

const GROUP_FIELDS = 'id,item_id,owner_id,name,description,max_size,is_open,created_at';
const MEMBER_FIELDS = 'group_id,user_id,item_id,role,joined_at';
const REQUEST_FIELDS = 'id,group_id,user_id,message,status,retry_after,created_at,decided_at';
const PROFILE_FIELDS = 'id,username,display_name,avatar_path';

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueIds(value) {
  return [...new Set((value || []).filter(Boolean))];
}

export async function fetchAllGroups({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('groups')
    .select(GROUP_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return rows(data);
}

export async function fetchGroupsForItem(itemId) {
  const id = String(itemId || '').trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from('groups')
    .select(GROUP_FIELDS)
    .eq('item_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return rows(data);
}

export async function fetchGroup(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('groups')
    .select(GROUP_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchMembersForGroups(groupIds) {
  const ids = uniqueIds(groupIds);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select(MEMBER_FIELDS)
    .in('group_id', ids)
    .order('joined_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return rows(data);
}

export async function fetchProfilesByIds(userIds) {
  const ids = uniqueIds(userIds);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('id', ids);
  if (error) throw error;
  return rows(data);
}

export async function fetchMyMemberships(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select(MEMBER_FIELDS)
    .eq('user_id', id);
  if (error) throw error;
  return rows(data);
}

// Newest first, so the first row per group is the request state to show.
export async function fetchMyRequests(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from('join_requests')
    .select(REQUEST_FIELDS)
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return rows(data);
}

export async function fetchRequestsForGroup(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from('join_requests')
    .select(REQUEST_FIELDS)
    .eq('group_id', id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return rows(data);
}

// RLS returns no row for non-members; treat permission errors the same way.
export async function fetchGroupSecret(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('group_secrets')
    .select('group_id,whatsapp_link')
    .eq('group_id', id)
    .maybeSingle();

  if (error) {
    if (error.code === '42501' || /permission|row-level security/i.test(String(error.message || ''))) {
      return null;
    }
    throw error;
  }
  return data || null;
}

export function latestRequestForGroup(requests, groupId) {
  const id = String(groupId || '');
  return (requests || []).find((request) => String(request.group_id) === id) || null;
}

export async function fetchGroupBundle(groupId, userId) {
  const group = await fetchGroup(groupId);
  if (!group) return null;

  const [item, members, secret, requests, memberships, myRequests] = await Promise.all([
    fetchItem(group.item_id),
    fetchMembersForGroups([group.id]),
    fetchGroupSecret(group.id),
    fetchRequestsForGroup(group.id).catch(() => []),
    fetchMyMemberships(userId),
    fetchMyRequests(userId),
  ]);

  const profiles = await fetchProfilesByIds([
    group.owner_id,
    ...members.map((member) => member.user_id),
    ...requests.map((request) => request.user_id),
  ]);

  return {
    group,
    item,
    members,
    secret,
    requests,
    profiles,
    profileMap: new Map(profiles.map((profile) => [profile.id, profile])),
    myMembership: memberships.find((membership) => membership.item_id === group.item_id) || null,
    myRequest: latestRequestForGroup(myRequests, group.id),
  };
}

async function callRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export function createGroup(itemId, name, description, maxSize, whatsappLink) {
  return callRpc('create_group', {
    p_item_id: itemId,
    p_name: name,
    p_description: description || null,
    p_max_size: Number(maxSize),
    p_whatsapp_link: whatsappLink || null,
  });
}

export function requestJoin(groupId, message) {
  return callRpc('request_join', {
    p_group_id: groupId,
    p_message: message || null,
  });
}

export function cancelRequest(requestId) {
  return callRpc('cancel_request', { p_request_id: requestId });
}

export function decideRequest(requestId, accept) {
  return callRpc('decide_request', {
    p_request_id: requestId,
    p_accept: !!accept,
  });
}

export function leaveGroup(groupId) {
  return callRpc('leave_group', { p_group_id: groupId });
}

export function removeMember(groupId, userId) {
  return callRpc('remove_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
}

export function transferOwnership(groupId, newOwnerId) {
  return callRpc('transfer_ownership', {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });
}

export function updateGroup(groupId, { name, description, isOpen, maxSize, whatsappLink }) {
  return callRpc('update_group', {
    p_group_id: groupId,
    p_name: name,
    p_description: description || null,
    p_is_open: !!isOpen,
    p_max_size: Number(maxSize),
    p_whatsapp_link: whatsappLink || null,
  });
}

export function deleteGroup(groupId) {
  return callRpc('delete_group', { p_group_id: groupId });
}

export async function reportGroup(groupId, reporterId, reason) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    target_type: 'group',
    target_id: groupId,
    reason: String(reason || '').trim() || null,
  });
  if (error) throw error;
}

// Turn an RPC error into a readable Arabic/English message. The database sends
// the error code in error.message (for example GROUP_FULL).
export function rpcErrorMessage(error, lang = getLang()) {
  const raw = String(error?.message || '');
  const mapped = errorMessage(raw, lang);
  if (mapped) return mapped;

  if (error?.code === '23505') {
    return errorMessage('PENDING_REQUEST_EXISTS', lang) || raw;
  }

  const info = describeDataError(error, lang);
  if (info.code === 'DATA_LOAD_FAILED' && raw) return raw;
  return info.message;
}
