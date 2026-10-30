// Supabase project settings.
export const SUPABASE_URL = 'https://apyvmhdpfbmublftihju.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweXZtaGRwZmJtdWJsZnRpaGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNDM5NTksImV4cCI6MjEwODkxOTk1OX0.09aHnsZtTT5GMouzK62-rnEkqDg-QxI65-fC12Bs1k0';

// Product constants. Keep these in sync with the database functions/triggers:
// a rejection blocks the same group for 10 hours and groups stay visible for
// 3 days after the item deadline.
export const REJECT_COOLDOWN_HOURS = 10;
export const GROUP_RETENTION_DAYS = 3;

// Public Supabase Storage bucket for avatars and banners.
export const ASSETS_BUCKET = 'student-assets';

// External study platform linked from the dashboard card.
export const STUDY_HUB_URL = 'https://unilec.vercel.app/';
