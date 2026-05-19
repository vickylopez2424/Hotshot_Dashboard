import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Demo mode: explicitly requested, OR Supabase simply isn't configured.
// In demo mode the dashboard runs with no login. NEVER ship this to production.
export const DEMO_MODE =
  process.env.REACT_APP_DEMO_MODE === 'true' || !supabaseUrl;

// Skip building a real client in demo mode — createClient() throws on a blank URL.
export const supabase = DEMO_MODE
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);
