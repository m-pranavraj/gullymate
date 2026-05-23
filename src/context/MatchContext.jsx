import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { storage } from '../utils/storage'

const MatchContext = createContext(null)

export function MatchProvider({ children }) {
  const [matches, setMatches] = useState(() => storage.get('matches') || [])
  const [liveMatch, setLiveMatch] = useState(() => storage.get('live_match') || null)
  const [activities, setActivities] = useState(() => storage.get('activities') || [])
  const [rules, setRules] = useState(() => storage.get('rules') || null)
  const [collaborators, setCollaborators] = useState(() => storage.get('collaborators') || [])

  useEffect(() => {
    storage.set('matches', matches)
  }, [matches])

  useEffect(() => {
    if (liveMatch) {
      storage.set('live_match', liveMatch)
    } else {
      storage.remove('live_match')
    }
  }, [liveMatch])

  useEffect(() => {
    storage.set('activities', activities)
  }, [activities])

  useEffect(() => {
    storage.set('rules', rules)
  }, [rules])

  useEffect(() => {
    storage.set('collaborators', collaborators)
  }, [collaborators])

  const createMatch = useCallback((matchData) => {
    const newMatch = {
      id: Date.now().toString(),
      ...matchData,
      status: 'live',
      createdAt: Date.now(),
      innings: [],
      currentInnings: 0,
      timeline: [],
    }
    setLiveMatch(newMatch)
    setMatches(prev => [newMatch, ...prev])
    addActivity('system', 'Match created')
    return newMatch
  }, [])

  const updateLiveMatch = useCallback((updates) => {
    setLiveMatch(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      setMatches(matches => {
        const idx = matches.findIndex(m => m.id === prev.id)
        if (idx >= 0) {
          const newMatches = [...matches]
          newMatches[idx] = updated
          return newMatches
        }
        return matches
      })
      return updated
    })
  }, [])

  const endMatch = useCallback(() => {
    if (!liveMatch) return
    const ended = { ...liveMatch, status: 'completed', endedAt: Date.now() }
    setMatches(prev => prev.map(m => m.id === ended.id ? ended : m))
    setLiveMatch(null)
    addActivity('system', 'Match ended')
    return ended
  }, [liveMatch])

  const endMatchWithWinner = useCallback((winner) => {
    setLiveMatch(prev => {
      if (!prev) return null
      const ended = { ...prev, winner, status: 'completed', endedAt: Date.now() }
      setMatches(matches => matches.map(m => m.id === ended.id ? ended : m))
      addActivity('system', 'Match ended')
      return null
    })
  }, [])

  const deleteMatch = useCallback((id) => {
    setMatches(prev => prev.filter(m => m.id !== id))
    if (liveMatch?.id === id) setLiveMatch(null)
  }, [liveMatch])

  const resumeMatch = useCallback((matchId) => {
    const match = matches.find(m => m.id === matchId)
    if (match) {
      setLiveMatch(match)
      return true
    }
    return false
  }, [matches])

  const addActivity = useCallback((user, action, details) => {
    const activity = {
      id: Date.now().toString() + Math.random(),
      user: user || 'System',
      action,
      details,
      timestamp: Date.now()
    }
    setActivities(prev => [activity, ...prev].slice(0, 200))
    return activity
  }, [])

  const joinMatch = useCallback((code) => {
    const found = matches.find(m => m.shareCode === code && m.status === 'live')
    if (found) {
      setLiveMatch(found)
      addActivity('system', `Joined match ${found.teamA.name} vs ${found.teamB.name}`)
      return found
    }
    return null
  }, [matches])

  const saveRules = useCallback((newRules) => {
    setRules(newRules)
    addActivity('system', 'Rules updated')
  }, [])

  const addCollaborator = useCallback((name, role = 'scorer') => {
    const collab = {
      id: Date.now().toString(),
      name,
      role,
      joinedAt: Date.now(),
      active: true,
    }
    setCollaborators(prev => [...prev, collab])
    addActivity(name, `Joined as ${role}`)
    return collab
  }, [])

  const removeCollaborator = useCallback((id) => {
    setCollaborators(prev => prev.filter(c => c.id !== id))
  }, [])

  const getMatch = useCallback((id) => {
    return matches.find(m => m.id === id) || null
  }, [matches])

  const updateMatchDate = useCallback((id, newDate) => {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, createdAt: newDate } : m))
    if (liveMatch?.id === id) setLiveMatch(prev => prev ? { ...prev, createdAt: newDate } : null)
  }, [liveMatch])

  const updateMatchMOTM = useCallback((id, motm) => {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, motm } : m))
    if (liveMatch?.id === id) setLiveMatch(prev => prev ? { ...prev, motm } : null)
  }, [liveMatch])

  return (
    <MatchContext.Provider value={{
      matches, liveMatch, activities, rules, collaborators,
      createMatch, updateLiveMatch, endMatch, endMatchWithWinner, deleteMatch,
      resumeMatch, addActivity, joinMatch, saveRules,
      addCollaborator, removeCollaborator, getMatch,
      updateMatchDate, updateMatchMOTM
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
