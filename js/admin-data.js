// Phase 7 data access: admin checks, item/event CRUD and report handling.
// All writes go straight to the tables, which are protected by admin-only RLS.
import { supabase } from './supabase.js';

const REPORT_FIELDS = 'id,reporter_id,target_type,target_id,reason,handled,created_at';
const REPORT_PROFILE_FIELDS = 'id,username,display_name,avatar_path';
const REPORT_GROUP_FIELDS = 'id,name,item_id,owner_id';

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueIds(value) {
  return [...new Set((value || []).filter(Boolean))];
}

export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export async function createItem(adminId, payload) {
  const { data, error } = await supabase
    .from('items')
    .insert({ ...payload, created_by: adminId || null })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, payload) {
  const { data, error } = await supabase
    .from('items')
    .update(payload)
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

export async function createEvent(adminId, payload) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...payload, created_by: adminId || null })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function updateEvent(id, payload) {
  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchReports({ limit = 300 } = {}) {
  const { data, error } = await supabase
    .from('reports')
    .select(REPORT_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const reports = rows(data);
  const profileIds = uniqueIds(
    reports.flatMap((report) => [
      report.reporter_id,
      report.target_type === 'profile' ? report.target_id : null,
    ])
  );
  const groupIds = uniqueIds(
    reports.filter((report) => report.target_type === 'group').map((report) => report.target_id)
  );

  const [profilesResult, groupsResult] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select(REPORT_PROFILE_FIELDS).in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from('groups').select(REPORT_GROUP_FIELDS).in('id', groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const profileMap = new Map(rows(profilesResult.data).map((profile) => [profile.id, profile]));
  const groupMap = new Map(rows(groupsResult.data).map((group) => [group.id, group]));

  return reports.map((report) => ({
    ...report,
    reporter: profileMap.get(report.reporter_id) || null,
    targetProfile: report.target_type === 'profile' ? profileMap.get(report.target_id) || null : null,
    targetGroup: report.target_type === 'group' ? groupMap.get(report.target_id) || null : null,
  }));
}

export async function setReportHandled(id, handled) {
  const { data, error } = await supabase
    .from('reports')
    .update({ handled: !!handled })
    .eq('id', id)
    .select('id,handled')
    .single();
  if (error) throw error;
  return data;
}
