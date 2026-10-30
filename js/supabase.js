// Supabase initialization for IT Study Hub
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  window.SUPABASE_PROJECT_URL,
  window.SUPABASE_ANON_KEY
);