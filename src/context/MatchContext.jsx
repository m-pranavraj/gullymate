import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { storage } from '../utils/storage'
import { getSupabase, STORAGE_KEYS } from '../lib/supabase'
import { useAuth } from './AuthContext'

const MatchContext = createContext(null)

const parseMatchFromDB = (m) => {
  const md = m.match_data || {}
  const { match_data: _, ...cleanMd } = md
  return {
    id: m.id,
    ...cleanMd,
    ownerId: m.owner_id,
    motm: m.motm || md.motm || null,
    createdAt: new Date(m.created_at).getTime(),
    status: m.status || 'completed',
    endedAt: m.ended_at ? new Date(m.ended_at).getTime() : undefined,
  }
}

export function MatchProvider({ children }) {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [matchesLoaded, setMatchesLoaded] = useState(false)
  const [liveMatch, setLiveMatch] = useState(null)
  const [activities, setActivities] = useState(() => storage.get('activities') || [])
  const [rules, setRules] = useState(() => storage.get('rules') || null)
  const [collaborators, setCollaborators] = useState(() => storage.get('collaborators') || [])
  const ownUpdateRef = useRef(false)
  const collabSubRef = useRef(null)

  // ── Load matches on mount ───────────────────────────────────
  useEffect(() => {
    if (!user || user.isGuest) {
      const saved = storage.get('matches') || []
      setMatches(saved)
      const live = storage.get('live_match') || null
      if (live) setLiveMatch(live)
      setMatchesLoaded(true)
      return
    }

    const sb = getSupabase()
    if (!sb) {
      const saved = storage.get('matches') || []
      setMatches(saved)
      setMatchesLoaded(true)
      return
    }

    ;(async () => {
      try {
        const { data, error } = await sb
          .from('matches')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        const loaded = (data || []).map(parseMatchFromDB)
        setMatches(loaded)
        // Restore live match from Supabase so progress isn't lost on tab close
        const live = loaded.find(m => m.status === 'live')
        if (live) setLiveMatch(live)
      } catch (e) {
        console.warn('Failed to load matches from Supabase:', e)
        const saved = storage.get('matches') || []
        setMatches(saved)
      }
      setMatchesLoaded(true)
    })()
  }, [user])

  // ── Load a match by ID (used by collab link guests) ────────
  const loadMatchById = useCallback(async (matchId) => {
    // Try localStorage first
    let match = matches.find(m => m.id === matchId)
    if (match) { setLiveMatch(match); return match }

    // Try Supabase
    const sb = getSupabase()
    if (!sb) return null
    try {
      const { data, error } = await sb.from('matches').select('*').eq('id', matchId).single()
      if (error) throw error
      if (data) {
        match = parseMatchFromDB(data)
        setLiveMatch(match)
        return match
      }
    } catch (e) { console.warn('Failed to load match by ID:', e) }
    return null
  }, [matches])

  // ── Realtime subscription for live match collaboration ─────
  useEffect(() => {
    if (!liveMatch?.id) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb.channel(`match-collab-${liveMatch.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${liveMatch.id}` },
        (payload) => {
          if (ownUpdateRef.current) { ownUpdateRef.current = false; return }
          const updated = parseMatchFromDB(payload.new)
          setLiveMatch(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
        }
      )
      .subscribe()

    collabSubRef.current = channel
    return () => { sb.removeChannel(channel); collabSubRef.current = null }
  }, [liveMatch?.id])

  // ── Persist to localStorage (guests/no-Supabase only) ──────
  useEffect(() => {
    if (!user || user.isGuest || !getSupabase()) {
      storage.set('matches', matches)
    }
  }, [matches, user])

  useEffect(() => {
    if (liveMatch) storage.set('live_match', liveMatch)
    else storage.remove('live_match')
  }, [liveMatch])

  useEffect(() => { storage.set('activities', activities) }, [activities])
  useEffect(() => { storage.set('rules', rules) }, [rules])
  useEffect(() => { storage.set('collaborators', collaborators) }, [collaborators])

  // ── Sync match to Supabase ──────────────────────────────────
  const syncMatchToSupabase = useCallback((match) => {
    const sb = getSupabase()
    if (!sb || !match?.id) return
    const ownerId = match.ownerId || user?.id
    // Strip any nested match_data to prevent exponential bloat
    const { match_data: _, ...cleanState } = match
    ownUpdateRef.current = true
    const data = {
      id: match.id,
      team_a: match.teamA,
      team_b: match.teamB,
      score_a: match.scoreA || 0,
      score_b: match.scoreB || 0,
      wickets_a: match.wicketsA || 0,
      wickets_b: match.wicketsB || 0,
      balls_a: match.ballsA || 0,
      balls_b: match.ballsB || 0,
      status: match.status || 'live',
      winner: match.winner,
      motm: match.motm || null,
      ground: match.ground,
      share_code: match.shareCode,
      group_id: match.groupId || null,
      match_data: cleanState,
      created_at: new Date(match.createdAt || Date.now()).toISOString(),
      ended_at: match.endedAt ? new Date(match.endedAt).toISOString() : null,
    }
    // owner_id references auth.users — only set when available (logged-in users / DB-loaded matches)
    if (ownerId) data.owner_id = ownerId
    sb.from('matches').upsert(data)
      .then()
      .catch(e => console.warn('Match sync error:', e))
  }, [user?.id])

  // ── Match CRUD ──────────────────────────────────────────────
  const createMatch = useCallback((matchData) => {
    const newMatch = {
      id: crypto.randomUUID(),
      currentInnings: 1,
      ...matchData,
      status: 'live',
      createdAt: Date.now(),
      innings: matchData.innings || [],
      timeline: matchData.timeline || [],
    }
    setLiveMatch(newMatch)
    setMatches(prev => [newMatch, ...prev])
    syncMatchToSupabase(newMatch)
    addActivity('system', 'Match created')
    return newMatch
  }, [syncMatchToSupabase, addActivity])

  const updateLiveMatch = useCallback((updates) => {
    setLiveMatch(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      setMatches(ms => {
        const idx = ms.findIndex(m => m.id === prev.id)
        if (idx >= 0) {
          const next = [...ms]
          next[idx] = updated
          return next
        }
        return ms
      })
      syncMatchToSupabase(updated)
      return updated
    })
  }, [syncMatchToSupabase])

  const endMatch = useCallback(() => {
    if (!liveMatch) return
    const ended = { ...liveMatch, status: 'completed', endedAt: Date.now() }
    setMatches(prev => prev.map(m => m.id === ended.id ? ended : m))
    setLiveMatch(null)
    syncMatchToSupabase(ended)
    addActivity('system', 'Match ended')
    return ended
  }, [liveMatch, syncMatchToSupabase])

  const endMatchWithWinner = useCallback((winner) => {
    setLiveMatch(prev => {
      if (!prev) return null
      const ended = { ...prev, winner, status: 'completed', endedAt: Date.now() }
      setMatches(ms => ms.map(m => m.id === ended.id ? ended : m))
      syncMatchToSupabase(ended)
      addActivity('system', 'Match ended')
      return null
    })
  }, [syncMatchToSupabase])

  const deleteMatch = useCallback((id) => {
    setMatches(prev => prev.filter(m => m.id !== id))
    if (liveMatch?.id === id) setLiveMatch(null)
    const sb = getSupabase()
    if (sb && !user?.isGuest) sb.from('matches').delete().eq('id', id).then().catch(() => {})
  }, [user?.isGuest, liveMatch])

  const resumeMatch = useCallback((matchId) => {
    const match = matches.find(m => m.id === matchId)
    if (match) { setLiveMatch(match); return true }
    return false
  }, [matches])

  const addActivity = useCallback((userName, action, details) => {
    const activity = { id: Date.now().toString() + Math.random(), user: userName || 'System', action, details, timestamp: Date.now() }
    setActivities(prev => [activity, ...prev].slice(0, 200))
    return activity
  }, [])

  const joinMatch = useCallback((code) => {
    const found = matches.find(m => m.shareCode === code && m.status === 'live')
    if (found) { setLiveMatch(found); addActivity('system', `Joined match ${found.teamA} vs ${found.teamB}`); return found }
    return null
  }, [matches])

  const saveRules = useCallback((newRules) => { setRules(newRules); addActivity('system', 'Rules updated') }, [])
  const addCollaborator = useCallback((name, role = 'scorer') => {
    const collab = { id: Date.now().toString(), name, role, joinedAt: Date.now(), active: true }
    setCollaborators(prev => [...prev, collab])
    addActivity(name, `Joined as ${role}`)
    return collab
  }, [])
  const removeCollaborator = useCallback((id) => { setCollaborators(prev => prev.filter(c => c.id !== id)) }, [])

  const getMatch = useCallback((id) => matches.find(m => m.id === id) || null, [matches])
  const updateMatchDate = useCallback((id, newDate) => {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, createdAt: newDate } : m))
    if (liveMatch?.id === id) setLiveMatch(prev => prev ? { ...prev, createdAt: newDate } : null)
  }, [liveMatch])
  const updateMatchMOTM = useCallback((id, motm) => {
    setMatches(prev => { const m = prev.find(x => x.id === id); if (m) syncMatchToSupabase({ ...m, motm }); return prev.map(x => x.id === id ? { ...x, motm } : x) })
    if (liveMatch?.id === id) setLiveMatch(prev => prev ? { ...prev, motm } : null)
  }, [liveMatch, syncMatchToSupabase])

  if (!matchesLoaded) {
    return (
      <div className="min-h-screen bg-pitch-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🏏</div>
          <p className="text-gray-400 text-sm">Loading matches...</p>
        </div>
      </div>
    )
  }

  return (
    <MatchContext.Provider value={{
      matches, liveMatch, activities, rules, collaborators,
      createMatch, updateLiveMatch, endMatch, endMatchWithWinner, deleteMatch,
      resumeMatch, addActivity, joinMatch, saveRules,
      addCollaborator, removeCollaborator, getMatch,
      updateMatchDate, updateMatchMOTM, loadMatchById
    }}>
      {children}
    </MatchContext.Provider>
  )
}

export const useMatch = () => {
  const ctx = useContext(MatchContext)
  if (!ctx) throw new Error('useMatch must be used within MatchProvider')
  return ctx
}
