import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { storage } from '../utils/storage'
import { getSupabase, isSupabaseConfigured, STORAGE_KEYS } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { generateShareCode } from '../utils/matchUtils'

const GroupContext = createContext(null)

export function GroupProvider({ children }) {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [sharedGroups, setSharedGroups] = useState([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const migrationAttempted = useRef(false)
  const syncQueued = useRef(false)

  const activeGroup = useMemo(() =>
    groups.find(g => g.id === activeGroupId) ||
    sharedGroups.find(g => g.id === activeGroupId) ||
    null,
    [groups, sharedGroups, activeGroupId]
  )

  // ── Load data on mount ──────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setGroups([])
      setGroupsLoaded(true)
      return
    }

    if (user.isGuest) {
      const saved = storage.get(STORAGE_KEYS.GROUPS) || []
      setGroups(saved)
      const active = storage.get(STORAGE_KEYS.ACTIVE_GROUP)
      if (active?.id) setActiveGroupId(active.id)
      setGroupsLoaded(true)
      return
    }

    const sb = getSupabase()
    if (!sb) {
      const saved = storage.get(STORAGE_KEYS.GROUPS) || []
      setGroups(saved)
      setGroupsLoaded(true)
      return
    }

    ;(async () => {
      try {
        const { data, error } = await sb
          .from('groups')
          .select('*, group_players(*)')
          .eq('owner_id', user.id)
        if (error) throw error

        const loaded = (data || []).map(g => {
          const snapshot = g.snapshot || {}
          const snapPlayers = snapshot.players || []
          return {
            id: g.id,
            name: g.name,
            shareCode: g.share_code || null,
            createdAt: new Date(g.created_at).getTime(),
            ownerId: g.owner_id,
            players: (g.group_players || []).map(gp => {
              const snap = snapPlayers.find(sp => sp.name === gp.name)
              return {
                name: gp.name,
                userId: gp.user_id,
                claimed: gp.claimed,
                claimedByName: null,
                stats: snap?.stats || { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
                history: snap?.history || [],
              }
            }),
            matches: snapshot.matches || [],
            activityLog: [],
          }
        })

        // Merge with localStorage groups (handles offline guest data that was never synced)
        const local = storage.get(STORAGE_KEYS.GROUPS) || []
        const merged = [...loaded]
        let hasLocalOnly = false
        for (const lg of local) {
          if (!merged.find(m => m.id === lg.id || m.shareCode === lg.shareCode)) {
            const migrated = {
              ...lg,
              id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lg.id) ? lg.id : crypto.randomUUID(),
            }
            merged.push(migrated)
            hasLocalOnly = true
          }
        }
        setGroups(merged)
        if (hasLocalOnly) {
          storage.set(STORAGE_KEYS.GROUPS, merged)
          syncQueued.current = true
        }
        const active = storage.get(STORAGE_KEYS.ACTIVE_GROUP)
        if (active?.id && loaded.find(g => g.id === active.id)) setActiveGroupId(active.id)
      } catch (e) {
        console.warn('Failed to load groups from Supabase, using localStorage:', e)
        const saved = storage.get(STORAGE_KEYS.GROUPS) || []
        // Migrate old TEXT IDs to UUIDs and sync to Supabase so data isn't lost
        const migrated = saved.map(g => ({
          ...g,
          id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g.id) ? g.id : crypto.randomUUID(),
        }))
        setGroups(migrated)
        storage.set(STORAGE_KEYS.GROUPS, migrated)
        syncQueued.current = true
      }
      setGroupsLoaded(true)
    })()
  }, [user])

  // ── Sync localStorage groups to Supabase after fallback ────
  useEffect(() => {
    if (!syncQueued.current || !user?.id || user?.isGuest) return
    syncQueued.current = false
    const sb = getSupabase()
    if (!sb) return
    ;(async () => {
      for (const g of groups) {
        try {
          await sb.from('groups').upsert({
            id: g.id,
            owner_id: user.id,
            name: g.name,
            share_code: g.shareCode || null,
            snapshot: { players: g.players, matches: g.matches },
            created_at: new Date(g.createdAt).toISOString(),
          }).select().single()
          for (const p of g.players) {
            await sb.from('group_players').upsert({
              group_id: g.id, name: p.name, user_id: p.userId || null, claimed: p.claimed || false,
            }, { onConflict: 'group_id, name' })
          }
        } catch (_) {}
      }
    })()
  }, [groups, user?.id, user?.isGuest])

  // ── Persist to localStorage (guests only) ───────────────────
  useEffect(() => {
    if (user?.isGuest) storage.set(STORAGE_KEYS.GROUPS, groups)
  }, [groups, user?.isGuest])

  useEffect(() => {
    storage.set(STORAGE_KEYS.ACTIVE_GROUP, activeGroup ? { id: activeGroup.id } : null)
  }, [activeGroup])

  // ── Schema migration ────────────────────────────────────────
  useEffect(() => {
    if (migrationAttempted.current) return
    migrationAttempted.current = true
    const sb = getSupabase()
    if (!sb) return
    ;(async () => {
      try {
        await sb.rpc('gully_migrate_v1')
        setNeedsMigration(false)
      } catch (_) {
        try {
          await sb.from('groups').select('share_code').limit(1)
          setNeedsMigration(false)
        } catch (err) {
          if (err?.message?.includes('share_code') && err?.message?.includes('column')) {
            setNeedsMigration(true)
          }
        }
      }
    })()
  }, [])

  // ── Sync helper ─────────────────────────────────────────────
  const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const syncGroupToSupabase = useCallback(async (group) => {
    const sb = getSupabase()
    if (!sb || !user?.id || user?.isGuest) return

    let effectiveId = group.id
    // Migrate old non-UUID IDs (from localStorage) to UUID for Supabase compatibility
    if (!isUUID(group.id)) {
      effectiveId = crypto.randomUUID()
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, id: effectiveId } : g))
      if (activeGroupId === group.id) setActiveGroupId(effectiveId)
    }

    try {
      await sb.from('groups').upsert({
        id: effectiveId,
        owner_id: user.id,
        name: group.name,
        share_code: group.shareCode || null,
        snapshot: { players: group.players, matches: group.matches },
        created_at: new Date(group.createdAt).toISOString(),
      }).select().single()
      for (const p of group.players) {
        await sb.from('group_players').upsert({
          group_id: effectiveId,
          name: p.name,
          user_id: p.userId || null,
          claimed: p.claimed || false,
        }, { onConflict: 'group_id, name' })
      }
    } catch (e) {
      console.warn('Supabase sync error:', e)
    }
  }, [user?.id, user?.isGuest, activeGroupId])

  // ── Group CRUD ──────────────────────────────────────────────
  const createGroup = useCallback((name) => {
    const group = {
      id: crypto.randomUUID(),
      name: name.trim(),
      shareCode: generateShareCode(),
      createdAt: Date.now(),
      ownerId: user?.id || null,
      players: [],
      matches: [],
      activityLog: [],
    }
    setGroups(prev => [...prev, group])
    addActivityToGroup(group.id, 'System', `Group "${name}" created`)
    syncGroupToSupabase(group)
    return group
  }, [user, syncGroupToSupabase])

  const deleteGroup = useCallback(async (groupId) => {
    setGroups(prev => prev.filter(g => g.id !== groupId))
    setActiveGroupId(prev => prev === groupId ? null : prev)
    const sb = getSupabase()
    if (sb && !user?.isGuest) await sb.from('groups').delete().eq('id', groupId)
  }, [user])

  const ensureGroupShareCode = useCallback((groupId) => {
    let code = null
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      if (g.shareCode) { code = g.shareCode; return g }
      code = generateShareCode()
      const updated = { ...g, shareCode: code }
      syncGroupToSupabase(updated)
      return updated
    }))
    return code
  }, [syncGroupToSupabase])

  // ── Player management ───────────────────────────────────────
  const makePlayer = (name) => ({
    name,
    userId: null,
    claimed: false,
    stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
    history: [],
  })

  const addPlayerToGroup = useCallback((groupId, playerName) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      if (g.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())) return g
      const updated = { ...g, players: [...g.players, makePlayer(playerName)] }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `Player "${playerName}" added`)
  }, [syncGroupToSupabase])

  const removePlayerFromGroup = useCallback((groupId, playerName) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const updated = { ...g, players: g.players.filter(p => p.name !== playerName) }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `Player "${playerName}" removed`)
  }, [syncGroupToSupabase])

  const addBulkPlayersToGroup = useCallback((groupId, names) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const existing = new Set(g.players.map(p => p.name.toLowerCase()))
      const newPlayers = names.filter(n => !existing.has(n.toLowerCase())).map(makePlayer)
      const updated = { ...g, players: [...g.players, ...newPlayers] }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `${names.length} players added`)
  }, [syncGroupToSupabase])

  const claimPlayerInGroup = useCallback((groupId, playerName, userId, userName) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const updated = {
        ...g,
        players: g.players.map(p =>
          p.name === playerName ? { ...p, userId, claimed: true, claimedByName: userName } : p
        ),
      }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `Player "${playerName}" claimed by ${userName}`)
  }, [syncGroupToSupabase])

  // ── Match recording ─────────────────────────────────────────
  const recordMatchForGroup = useCallback((groupId, matchData, battingStatsA, battingStatsB, ballHistory) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g

      const updatedPlayers = g.players.map(p => {
        const stats = { ...p.stats }
        const battedA = (battingStatsA || []).find(s => s.name === p.name)
        const battedB = (battingStatsB || []).find(s => s.name === p.name)
        const batted = battedA || battedB
        const bowledIn = (ballHistory || []).filter(b => b.bowler === p.name)

        const historyEntry = {
          matchId: matchData.id || crypto.randomUUID(),
          date: matchData.date || Date.now(),
          teamA: matchData.teamA, teamB: matchData.teamB,
          runs: batted?.runs || 0,
          balls: batted?.balls || 0,
          fours: batted?.fours || 0,
          sixes: batted?.sixes || 0,
          out: batted?.out || false,
          wickets: bowledIn.filter(b => b.type === 'wicket').length,
          runsConceded: bowledIn.reduce((a, b) => a + (b.runs || 0), 0),
          overs: bowledIn.filter(b => b.label !== 'WD' && b.label !== 'NB').length,
        }

        if (batted) {
          stats.matches += 1
          stats.runs += batted.runs || 0
          stats.balls += batted.balls || 0
          stats.fours += batted.fours || 0
          stats.sixes += batted.sixes || 0
          if (!batted.out) stats.notOuts += 1
          if (batted.runs >= 100) stats.hundreds += 1
          else if (batted.runs >= 50) stats.fifties += 1
          if (batted.runs === 0 && batted.out) stats.ducks += 1
          if (batted.runs > stats.highestScore) stats.highestScore = batted.runs
        }
        if (bowledIn.length > 0) {
          if (!batted) stats.matches += 1
          const legalBalls = bowledIn.filter(b => b.label !== 'WD' && b.label !== 'NB').length
          stats.overs += legalBalls
          stats.runsConceded += bowledIn.reduce((a, b) => a + (b.runs || 0), 0)
          stats.wickets += bowledIn.filter(b => b.type === 'wicket').length
        }
        return { ...p, stats, history: [...(p.history || []), historyEntry] }
      })

      const matchRecord = {
        id: matchData.id || crypto.randomUUID(),
        date: Date.now(),
        teamA: matchData.teamA, teamB: matchData.teamB,
        scoreA: matchData.scoreA, wicketsA: matchData.wicketsA,
        scoreB: matchData.scoreB, wicketsB: matchData.wicketsB,
        winner: matchData.winner, ground: matchData.ground,
      }

      const updated = { ...g, players: updatedPlayers, matches: [matchRecord, ...g.matches].slice(0, 200) }
      syncGroupToSupabase(updated)

      const recSb = getSupabase()
      if (recSb && user?.id && !user?.isGuest) {
        recSb.from('activities').insert({
          group_id: groupId, user_id: user.id, user_name: user.name,
          action: `Match recorded: ${matchData.teamA} vs ${matchData.teamB}`,
        }).then().catch(() => {})
      }

      return updated
    }))
    addActivityToGroup(groupId, 'System', `Match recorded: ${matchData.teamA} vs ${matchData.teamB}`)
  }, [user])

  // ── Activity ────────────────────────────────────────────────
  const addActivityToGroup = useCallback((groupId, userName, action) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const activity = { id: Date.now().toString() + Math.random(), user: userName, action, timestamp: Date.now() }
      return { ...g, activityLog: [activity, ...g.activityLog].slice(0, 200) }
    }))
  }, [])

  // ── Utilities ───────────────────────────────────────────────
  const getGroup = useCallback((id) => groups.find(g => g.id === id) || sharedGroups.find(g => g.id === id) || null, [groups, sharedGroups])

  const setActiveGroupById = useCallback((id) => { setActiveGroupId(id) }, [])

  const resetGroupStats = useCallback((groupId) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const updated = {
        ...g,
        players: g.players.map(p => ({ ...p, stats: makePlayer('').stats, history: [] })),
        matches: [],
      }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', 'All stats reset')
  }, [syncGroupToSupabase])

  // ── Share code lookup ───────────────────────────────────────
  const getGroupByShareCode = useCallback(async (shareCode) => {
    if (!shareCode) return null
    const localMatch = [...groups, ...sharedGroups].find(g => g.shareCode === shareCode)
    if (localMatch) return localMatch
    const sb = getSupabase()
    if (sb) {
      try {
        const { data, error } = await sb
          .from('groups')
          .select('*, group_players(*)')
          .eq('share_code', shareCode)
          .maybeSingle()
        if (error) throw error
        if (data) {
          const snapshot = data.snapshot || {}
          const g = {
            id: data.id,
            name: data.name,
            shareCode: data.share_code,
            createdAt: new Date(data.created_at).getTime(),
            ownerId: data.owner_id,
            players: (data.group_players || []).map(p => {
              const snapPlayer = (snapshot.players || []).find(sp => sp.name === p.name)
              return {
                name: p.name, userId: p.user_id, claimed: p.claimed, claimedByName: null,
                stats: snapPlayer?.stats || { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
                history: snapPlayer?.history || [],
              }
            }),
            matches: snapshot.matches || [],
            activityLog: [],
          }
          setSharedGroups(prev => { if (prev.find(x => x.id === g.id)) return prev; return [...prev, g] })
          return g
        }
      } catch (e) {
        console.warn('Supabase group lookup failed:', e)
      }
    }
    return null
  }, [groups, sharedGroups])

  const getGroupByShareCodePublic = useCallback(async (shareCode) => {
    if (!shareCode) return null
    const sb = getSupabase()
    if (!sb) return null
    try {
      const { data, error } = await sb
        .from('groups')
        .select('name, share_code, snapshot')
        .eq('share_code', shareCode.toUpperCase())
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const snapshot = data.snapshot || {}
      return { name: data.name, shareCode: data.share_code, players: snapshot.players || [], matches: snapshot.matches || [] }
    } catch (e) {
      console.warn('Public leaderboard lookup failed:', e)
      return null
    }
  }, [])

  if (!groupsLoaded) {
    return (
      <div className="min-h-screen bg-pitch-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🏏</div>
          <p className="text-gray-400 text-sm">Loading groups...</p>
        </div>
      </div>
    )
  }

  return (
    <GroupContext.Provider value={{
      groups, activeGroup, sharedGroups, needsMigration,
      createGroup, deleteGroup, getGroup,
      addPlayerToGroup, removePlayerFromGroup, addBulkPlayersToGroup,
      recordMatchForGroup, addActivityToGroup,
      setActiveGroupById, resetGroupStats,
      claimPlayerInGroup, getGroupByShareCode, getGroupByShareCodePublic,
      ensureGroupShareCode,
    }}>
      {children}
    </GroupContext.Provider>
  )
}

export const useGroups = () => {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useGroups must be used within GroupProvider')
  return ctx
}
