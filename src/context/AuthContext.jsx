import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { storage } from '../utils/storage'
import { getSupabase, isSupabaseConfigured, STORAGE_KEYS } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => storage.get(STORAGE_KEYS.CURRENT_USER))
  const [users, setUsers] = useState(() => storage.get(STORAGE_KEYS.USERS) || [])
  const [initialized, setInitialized] = useState(false)

  // Init Supabase auth listener
  useEffect(() => {
    if (!isSupabaseConfigured()) { setInitialized(true); return }

    const sb = getSupabase()
    if (!sb) { setInitialized(true); return }
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {}
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: meta.name || session.user.email?.split('@')[0] || 'Player',
          isGuest: false,
          supabase: true,
        })
      }
      setInitialized(true)
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {}
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: meta.name || session.user.email?.split('@')[0] || 'Player',
          isGuest: false,
          supabase: true,
        })
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) storage.set(STORAGE_KEYS.CURRENT_USER, user)
    else storage.remove(STORAGE_KEYS.CURRENT_USER)
  }, [user])

  const login = useCallback(async (email, password) => {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Invalid email or password' : error.message)
      if (!data.user) throw new Error('Login failed. Try again.')
      const meta = data.user?.user_metadata || {}
      const u = { id: data.user.id, email: data.user.email, name: meta.name || email.split('@')[0], isGuest: false, supabase: true }
      setUser(u)
      return u
    }
    // localStorage fallback
    const found = users.find(u => u.email === email && u.password === password)
    if (!found) throw new Error('Invalid email or password')
    const u = { email: found.email, name: found.name, isGuest: false }
    setUser(u)
    return u
  }, [users])

  const signup = useCallback(async (name, email, password) => {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { name } }
      })
      if (error) {
        if (error.message.includes('already registered')) throw new Error('Email already registered')
        throw new Error(error.message)
      }
      if (data.user?.identities?.length === 0) throw new Error('Email already registered')
      if (!data.user) throw new Error('Account created! Check your email to confirm.')
      const u = { id: data.user.id, email: data.user.email, name, isGuest: false, supabase: true }
      setUser(u)

      // Migrate guest data if coming from guest mode
      const localMatches = storage.get(STORAGE_KEYS.MATCHES) || []
      if (localMatches.length > 0 && sb) {
        try {
          const { error: matchErr } = await sb.from('matches').insert(
            localMatches.map(m => ({
              owner_id: data.user.id,
              team_a: m.teamA, team_b: m.teamB,
              score_a: m.scoreA || 0, score_b: m.scoreB || 0,
              wickets_a: m.wicketsA || 0, wickets_b: m.wicketsB || 0,
              status: m.status || 'completed',
              winner: m.winner, ground: m.ground,
              match_data: m,
              share_code: m.shareCode,
              created_at: new Date(m.createdAt || Date.now()).toISOString(),
            }))
          )
          if (matchErr) console.warn('Match migration failed:', matchErr)
        } catch (e) { console.warn('Migration error:', e) }
      }
      return u
    }
    // localStorage fallback
    if (users.find(u => u.email === email)) throw new Error('Email already registered')
    const newUser = { name, email, password, id: Date.now().toString() }
    const updated = [...users, newUser]
    setUsers(updated)
    storage.set(STORAGE_KEYS.USERS, updated)
    const u = { email: newUser.email, name: newUser.name, isGuest: false }
    setUser(u)
    return u
  }, [users])

  const guestLogin = useCallback(async (guestName) => {
    const name = guestName || `Player${Math.floor(Math.random() * 1000)}`
    const u = { name, email: null, isGuest: true }
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    const sb = getSupabase()
    if (sb) await sb.auth.signOut()
    setUser(null)
    storage.remove(STORAGE_KEYS.CURRENT_USER)
  }, [])

  const updateProfile = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }))
  }, [])

  const claimAccount = useCallback(async (email, password) => {
    if (!getSupabase()) return { needsSignup: true }
    return await signup(user?.name || 'Player', email, password)
  }, [signup, user])

  if (!initialized && isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-pitch-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🏏</div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      user, login, signup, guestLogin, logout, updateProfile, claimAccount
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
