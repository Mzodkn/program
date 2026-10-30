// Read-only data access for items and events (Phase 3).
// A short in-memory cache keeps route changes and language switches fast
// without hiding admin edits for long. Refresh buttons bypass the cache.
import { supabase } from './supabase.js';

const CACHE_TTL = 30 * 1000;
const MAX_ROWS = 500;

const ITEM_FIELDS = 'id,type,title,details,subject_label,due_at,max_group_size,created_at';
const EVENT_FIELDS = 'id,title,details,starts_at,ends_at,created_at';

let itemsCache = null;
let itemsInFlight = null;
let eventsCache = null;
let eventsInFlight = null;

function fresh(entry) {
  return entry && Date.now() - entry.at < CACHE_TTL;
}

async function queryItems() {
  const { data, error } = await supabase
    .from('items')
    .select(ITEM_FIELDS)
    .order('due_at', { ascending: true })
    .limit(MAX_ROWS);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function queryEvents() {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_FIELDS)
    .order('starts_at', { ascending: true })
    .limit(MAX_ROWS);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchItems({ force = false } = {}) {
  if (!force && fresh(itemsCache)) return itemsCache.data;
  if (itemsInFlight) return itemsInFlight;

  itemsInFlight = queryItems()
    .then((data) => {
      itemsCache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      itemsInFlight = null;
    });

  return itemsInFlight;
}

export async function fetchEvents({ force = false } = {}) {
  if (!force && fresh(eventsCache)) return eventsCache.data;
  if (eventsInFlight) return eventsInFlight;

  eventsInFlight = queryEvents()
    .then((data) => {
      eventsCache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      eventsInFlight = null;
    });

  return eventsInFlight;
}

export async function fetchItem(id, { force = false } = {}) {
  const itemId = String(id || '').trim();
  if (!itemId) return null;

  if (!force && fresh(itemsCache)) {
    const cached = itemsCache.data.find((item) => item.id === itemId);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from('items')
    .select(ITEM_FIELDS)
    .eq('id', itemId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function invalidateDataCache() {
  itemsCache = null;
  eventsCache = null;
}
