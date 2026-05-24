import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { storage } from '../utils/storage'
import { getSupabase, isSupabaseConfigured, STORAGE_KEYS } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { generateShareCode } from '../utils/matchUtils'

const GroupContext = createContext(null)

export function GroupProvider({ children }) {
  const { user } = useAuth()
  const [groups, setGroups] = useState(() => storage.get(STORAGE_KEYS.GROUPS) || [])
  const [activeGroupId, setActiveGroupId] = useState(() => {
    const saved = storage.get(STORAGE_KEYS.ACTIVE_GROUP)
    return saved?.id || null
  })

  const [sharedGroups, setSharedGroups] = useState(() => storage.get('gully_os_shared_groups') || [])
  const [needsMigration, setNeedsMigration] = useState(false)
  const migrationAttempted = useRef(false)

  // Derive activeGroup from owned groups OR shared groups
  const activeGroup = useMemo(() =>
    groups.find(g => g.id === activeGroupId) ||
    sharedGroups.find(g => g.id === activeGroupId) ||
    null,
    [groups, sharedGroups, activeGroupId]
  )

  // Persist to localStorage
  useEffect(() => { storage.set(STORAGE_KEYS.GROUPS, groups) }, [groups])
  useEffect(() => { storage.set(STORAGE_KEYS.ACTIVE_GROUP, activeGroup ? { id: activeGroup.id } : null) }, [activeGroup])
  useEffect(() => { storage.set('gully_os_shared_groups', sharedGroups) }, [sharedGroups])

  // Schema auto-migration on startup: try to add missing columns
  useEffect(() => {
    if (migrationAttempted.current) return
    migrationAttempted.current = true
    const sb = getSupabase()
    if (!sb) return

    const runMigration = async () => {
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
            console.warn('Supabase schema needs migration.')
          }
        }
      }
    }
    runMigration()
  }, [])

  // Backfill: after schema is OK and groups are populated, push all local groups
  // to Supabase so share_code exists in the DB for share-code lookups.
  const backfillRan = useRef(false)
  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !user?.id || user?.isGuest || needsMigration) return
    if (backfillRan.current || groups.length === 0) return
    backfillRan.current = true
    ;(async () => {
      for (const g of groups) {
        try {
          await sb.from('groups').upsert({
            id: g.id,
            owner_id: user.id,
            name: g.name,
            share_code: g.shareCode || null,
            created_at: new Date(g.createdAt).toISOString(),
          }, { onConflict: 'id' })
          for (const p of g.players) {
            await sb.from('group_players').upsert({
              group_id: g.id,
              name: p.name,
              user_id: p.userId || null,
              claimed: p.claimed || false,
            }, { onConflict: 'group_id, name' })
          }
        } catch (_) {}
      }
    })()
  }, [groups, needsMigration, user?.id, user?.isGuest])

  // Sync from Supabase on mount for logged-in users
  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !user?.id || user?.isGuest) return

    const loadGroups = async () => {
      try {
        const { data: remoteGroups, error } = await sb
          .from('groups')
          .select('*, group_players(*)')
          .eq('owner_id', user.id)

        if (error) throw error
        if (remoteGroups && remoteGroups.length > 0) {
          const local = remoteGroups.map(g => ({
            id: g.id,
            name: g.name,
            shareCode: g.share_code || null,
            createdAt: new Date(g.created_at).getTime(),
            ownerId: g.owner_id,
            players: (g.group_players || []).map(p => ({
              name: p.name,
              userId: p.user_id,
              claimed: p.claimed,
              stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
              history: [],
            })),
            matches: [],
            activityLog: [],
          }))
          setGroups(prev => {
            const merged = [...local]
            prev.forEach(lg => {
              const existing = merged.find(m => m.id === lg.id)
              if (existing) {
                existing.shareCode = existing.shareCode || lg.shareCode
                existing.name = existing.name || lg.name
                existing.createdAt = existing.createdAt || lg.createdAt
                existing.ownerId = existing.ownerId || lg.ownerId
                existing.matches = lg.matches || []
                existing.activityLog = lg.activityLog || []
                existing.players = existing.players.map(ep => {
                  const lp = lg.players.find(p => p.name === ep.name)
                  return lp ? { ...ep, stats: lp.stats, history: lp.history } : ep
                })
              } else {
                merged.push(lg)
              }
            })
            return merged
          })
        }
      } catch (e) {
        console.warn('Supabase group sync failed, using local:', e)
      }
    }
    loadGroups()
  }, [user?.id, user?.isGuest])

  const syncGroupToSupabase = useCallback(async (group) => {
    const sb = getSupabase()
    if (!sb || !user?.id || user?.isGuest) return
    try {
      await sb.from('groups').upsert({
        id: group.id,
        owner_id: user.id,
        name: group.name,
        share_code: group.shareCode || null,
        snapshot: {
          players: group.players,
          matches: group.matches,
        },
        created_at: new Date(group.createdAt).toISOString(),
      }).select().single()
      for (const p of group.players) {
        await sb.from('group_players').upsert({
          group_id: group.id,
          name: p.name,
          user_id: p.userId || null,
          claimed: p.claimed || false,
        }, { onConflict: 'group_id, name' })
      }
    } catch (e) {
      console.warn('Supabase group sync error:', e)
    }
  }, [user?.id, user?.isGuest])

  const createGroup = useCallback((name) => {
    const group = {
      id: Date.now().toString(),
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

  const addPlayerToGroup = useCallback((groupId, playerName) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      if (g.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())) return g
      const player = {
        name: playerName,
        userId: null,
        claimed: false,
        stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
        history: [],
      }
      const updated = { ...g, players: [...g.players, player] }
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
      const newPlayers = names
        .filter(n => !existing.has(n.toLowerCase()))
        .map(name => ({
          name,
          userId: null,
          claimed: false,
          stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
          history: [],
        }))
      const updated = { ...g, players: [...g.players, ...newPlayers] }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `${names.length} players added`)
  }, [syncGroupToSupabase])

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
          matchId: matchData.id || Date.now().toString(),
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
        id: matchData.id || Date.now().toString(),
        date: Date.now(),
        teamA: matchData.teamA, teamB: matchData.teamB,
        scoreA: matchData.scoreA, wicketsA: matchData.wicketsA,
        scoreB: matchData.scoreB, wicketsB: matchData.wicketsB,
        winner: matchData.winner, ground: matchData.ground,
      }

      const updated = { ...g, players: updatedPlayers, matches: [matchRecord, ...g.matches].slice(0, 200) }

      // Also log to Supabase activities
      const recSb = getSupabase()
      if (recSb && user?.id && !user?.isGuest) {
        recSb.from('activities').insert({
          group_id: groupId,
          user_id: user.id,
          user_name: user.name,
          action: `Match recorded: ${matchData.teamA} vs ${matchData.teamB}`,
        }).then().catch(() => {})
      }

      return updated
    }))
    addActivityToGroup(groupId, 'System', `Match recorded: ${matchData.teamA} vs ${matchData.teamB}`)
  }, [user])

  const addActivityToGroup = useCallback((groupId, userName, action) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const activity = { id: Date.now().toString() + Math.random(), user: userName, action, timestamp: Date.now() }
      return { ...g, activityLog: [activity, ...g.activityLog].slice(0, 200) }
    }))
  }, [])

  const getGroup = useCallback((id) => groups.find(g => g.id === id) || sharedGroups.find(g => g.id === id) || null, [groups, sharedGroups])

  const setActiveGroupById = useCallback((id) => {
    setActiveGroupId(id)
  }, [])

  const resetGroupStats = useCallback((groupId) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        players: g.players.map(p => ({
          ...p,
          stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
          history: [],
        })),
        matches: [],
      }
    }))
    addActivityToGroup(groupId, 'System', 'All stats reset')
  }, [])

  const claimPlayerInGroup = useCallback((groupId, playerName, userId, userName) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const updated = {
        ...g,
        players: g.players.map(p =>
          p.name === playerName
            ? { ...p, userId, claimed: true, claimedByName: userName }
            : p
        ),
      }
      syncGroupToSupabase(updated)
      return updated
    }))
    addActivityToGroup(groupId, 'System', `Player "${playerName}" claimed by ${userName}`)
  }, [syncGroupToSupabase])

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
                name: p.name,
                userId: p.user_id,
                claimed: p.claimed,
                claimedByName: null,
                stats: snapPlayer?.stats || { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, stumpings: 0, fifties: 0, hundreds: 0, notOuts: 0, ducks: 0, highestScore: 0 },
                history: snapPlayer?.history || [],
              }
            }),
            matches: snapshot.matches || [],
            activityLog: [],
          }
          setSharedGroups(prev => {
            if (prev.find(x => x.id === g.id)) return prev
            return [...prev, g]
          })
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
      return {
        name: data.name,
        shareCode: data.share_code,
        players: snapshot.players || [],
        matches: snapshot.matches || [],
      }
    } catch (e) {
      console.warn('Public leaderboard lookup failed:', e)
      return null
    }
  }, [])

  return (
    <GroupContext.Provider value={{
      groups, activeGroup, sharedGroups, needsMigration,
      createGroup, deleteGroup, getGroup,
      addPlayerToGroup, removePlayerFromGroup, addBulkPlayersToGroup,
      recordMatchForGroup, addActivityToGroup,
      setActiveGroupById, resetGroupStats,
      claimPlayerInGroup, getGroupByShareCode, getGroupByShareCodePublic,
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
