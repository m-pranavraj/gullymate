import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

let _supabase = null

export function getSupabase() {
  if (_supabase) return _supabase
  if (!supabaseUrl || !supabaseAnonKey) return null
  try {
    _supabase = createClient(supabaseUrl, supabaseAnonKey)
    return _supabase
  } catch (e) {
    console.warn('Supabase init failed:', e)
    return null
  }
}

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseAnonKey)

export const STORAGE_KEYS = {
  MATCHES: 'matches',
  LIVE_MATCH: 'live_match',
  ACTIVITIES: 'activities',
  GROUPS: 'groups',
  ACTIVE_GROUP: 'active_group',
  USERS: 'users',
  CURRENT_USER: 'current_user',
  RULES: 'rules',
  COLLABORATORS: 'collaborators',
}
