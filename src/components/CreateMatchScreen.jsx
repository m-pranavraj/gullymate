import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useMatch } from '../context/MatchContext'
import { useGroups } from '../context/GroupContext'
import { generateShareCode } from '../utils/matchUtils'
import { generateAIPlayerNames } from '../utils/groq'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
const PLAYER_SUGGESTIONS_A = ['Virat', 'Rohit', 'Dhoni', 'Sachin', 'Bumrah', 'Jadeja', 'Shami', 'Kohli', 'Pant', 'Hardik']
const PLAYER_SUGGESTIONS_B = ['Sai', 'Santosh', 'Rahul', 'Vamsi', 'Arjun', 'Karthik', 'Surya', 'Rishabh', 'Ishan', 'Ravi']

export default function CreateMatchScreen({ onNavigate, rematchData }) {
  const { createMatch, rules: globalRules } = useMatch()
  const { groups } = useGroups()

  // Pre-fill from rematch if provided
  const [teamA, setTeamA] = useState(rematchData?.teamA || '')
  const [teamB, setTeamB] = useState(rematchData?.teamB || '')
  const [playersA, setPlayersA] = useState(rematchData?.playersA || [])
  const [playersB, setPlayersB] = useState(rematchData?.playersB || [])
  const [ground, setGround] = useState(rematchData?.ground || '')
  const [tossWinner, setTossWinner] = useState(null)
  const [tossChoice, setTossChoice] = useState('bat')
  const [tossAnimating, setTossAnimating] = useState(false)
  const [error, setError] = useState('')
  const [voiceMode, setVoiceMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [playerInput, setPlayerInput] = useState('')
  const [currentTeam, setCurrentTeam] = useState('A')
  const [dragIndex, setDragIndex] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [matchType, setMatchType] = useState(rematchData?.matchType || 'individual')
  const [selectedGroupId, setSelectedGroupId] = useState(rematchData?.groupId || '')
  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editingPlayerName, setEditingPlayerName] = useState('')
  const [selectedGroupPlayers, setSelectedGroupPlayers] = useState(new Set())
  const [localRules, setLocalRules] = useState(rematchData?.rules || globalRules || null)
  const [showRules, setShowRules] = useState(!!rematchData)
  const [jokerName, setJokerName] = useState(rematchData?.jokerName || '')
  const addPlayerInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)

  const handleVoiceInput = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Voice not supported. Use Chrome.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    recognitionRef.current = recognition
    setIsListening(true)
    setAiResult(null)
    setVoiceTranscript('')

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
        setIsListening(false)
      }, 7000)
    }

    resetSilenceTimer()

    recognition.onresult = async (event) => {
      resetSilenceTimer()

      // Show latest utterance text (interim or final) for real-time display
      const latestResult = event.results[event.results.length - 1]
      if (latestResult) {
        setVoiceTranscript(latestResult[0].transcript)
      }

      // Process final utterances immediately (fast, no AI)
      if (latestResult?.isFinal) {
        let text = latestResult[0].transcript
        for (let j = 1; j < latestResult.length; j++) {
          if (latestResult[j].confidence > latestResult[0].confidence) {
            text = latestResult[j].transcript
          }
        }
        if (!text.trim() || text.length < 3) return
        fallbackParsing(text)
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
      setAiThinking(false)
    }
    recognition.onend = () => setIsListening(false)
    recognition.start()
  }, [playersA, playersB, currentTeam, teamA, teamB, isListening, matchType, selectedGroupId, groups])

  function fallbackParsing(text) {
    const lower = text.toLowerCase()

    // Team reference detection — lenient: "team be" → Team B, "team a" → Team A
    const teamWordMatch = lower.match(/\bteam\s+(\S+)/i)
    const teamRef = teamWordMatch ? teamWordMatch[1].toLowerCase() : ''
    const isTeamA = teamRef.startsWith('a') || (teamA && lower.includes(teamA.toLowerCase()))
    const isTeamB = teamRef.startsWith('b') || (teamB && lower.includes(teamB.toLowerCase()))
    const isSet = lower.includes('players are') || lower.includes('players:') || lower.includes('are')

    if (lower.includes('create match') || lower.includes('start match')) {
      handleStart()
      return
    }
    if (lower.includes('toss') || lower.includes('bat') || lower.includes('bowl')) {
      if (isTeamA) {
        setTossWinner('A')
        if (lower.includes('bowl')) setTossChoice('bowl')
        else setTossChoice('bat')
      } else if (isTeamB) {
        setTossWinner('B')
        if (lower.includes('bowl')) setTossChoice('bowl')
        else setTossChoice('bat')
      } else {
        if (!tossWinner) setTossWinner(Math.random() > 0.5 ? 'A' : 'B')
      }
      return
    }
    if (lower.includes('random team') || lower.includes('shuffle')) {
      randomTeams()
      return
    }

    // Handle "Team ? name is X" — set team name
    if (teamRef && text.match(/name\s+is\s+(.+)/i)) {
      const nameMatch = text.match(/name\s+is\s+(.+)/i)
      const name = nameMatch[1].trim()
      if (name) {
        if (isTeamA) setTeamA(name)
        else if (isTeamB) setTeamB(name)
        setAiResult({ action: `setTeam${isTeamA ? 'A' : 'B'}`, details: `Team name set to "${name}"` })
      }
      return
    }

    // Handle "Team ? is X" — set team name (only when not setting players)
    if (teamRef && !isSet && !lower.includes('players') && text.match(/\bis\s+(.+)/i) && !lower.includes('bat') && !lower.includes('bowl')) {
      const isMatch = text.match(/\bis\s+(.+)/i)
      const name = isMatch[1].trim()
      if (name && !name.toLowerCase().includes('players') && !name.toLowerCase().includes('are')) {
        if (isTeamA) setTeamA(name)
        else if (isTeamB) setTeamB(name)
        setAiResult({ action: `setTeam${isTeamA ? 'A' : 'B'}`, details: `Team name set to "${name}"` })
        return
      }
    }

    const resolveNames = (names) => {
      if (!groupPlayers) return names
      return names.map(n => matchGroupPlayer(n, groupPlayers)).filter(n =>
        groupPlayers.some(p => p.name.toLowerCase() === n.toLowerCase())
      )
    }
    const makePlayers = (names) =>
      names.map((name, i) => ({ id: Date.now().toString() + Math.random(), name, color: COLORS[i % COLORS.length] }))

    let rawNames
    if (text.includes(',') || text.includes(';') || text.includes('और') || lower.includes(' and ')) {
      rawNames = text.split(/[,;और,and]+/)
    } else if (isSet) {
      // Strip known prefixes — \S{1,5} matches "be", "the", "a", "b", etc after "team"
      let cleaned = text.replace(/^(team\s+\S{1,5}\s+players?\s+(are|is)\s*)/i, '')
        .replace(/^(team\s+\S{1,5}\s+(are|is)\s*)/i, '')
        .replace(/^(players?\s+(are|is)\s*)/i, '')
        .replace(/^(add\s+)/i, '')
        .trim()
      rawNames = cleaned.split(/\s+/)
    } else {
      rawNames = text.replace(/^add\s+/i, '').split(/[,;और,and]+/)
    }
    rawNames = rawNames.map(n => n.trim()).filter(n => n.length > 1 && n.length < 30)
    if (rawNames.length === 0) return
    const names = resolveNames(rawNames)

    if ((isTeamA || !isTeamB) && isSet) {
      setPlayersA(makePlayers(names))
      setAiResult({ action: 'setTeamA', details: `Team A set: ${names.join(', ')}` })
    } else if (isTeamB && isSet) {
      setPlayersB(makePlayers(names))
      setAiResult({ action: 'setTeamB', details: `Team B set: ${names.join(', ')}` })
    } else if (isTeamA || (!isTeamB && currentTeam === 'A')) {
      const existing = new Set(playersA.map(p => p.name.toLowerCase()))
      const newNames = names.filter(n => !existing.has(n.toLowerCase()))
      if (newNames.length > 0) {
        setPlayersA(prev => [...prev, ...makePlayers(newNames)])
        setAiResult({ action: 'addToTeamA', details: `Added to Team A: ${newNames.join(', ')}` })
      }
    } else {
      const existing = new Set(playersB.map(p => p.name.toLowerCase()))
      const newNames = names.filter(n => !existing.has(n.toLowerCase()))
      if (newNames.length > 0) {
        setPlayersB(prev => [...prev, ...makePlayers(newNames)])
        setAiResult({ action: 'addToTeamB', details: `Added to Team B: ${newNames.join(', ')}` })
      }
    }
  }

  const groupPlayers = useMemo(() => {
    if (matchType !== 'group' || !selectedGroupId) return null
    const g = groups.find(g => g.id === selectedGroupId)
    return g?.players || null
  }, [matchType, selectedGroupId, groups])

  function applyAIResult(result) {
    if (result.teamA && result.teamA !== teamA) setTeamA(result.teamA)
    if (result.teamB && result.teamB !== teamB) setTeamB(result.teamB)
    if (result.ground) setGround(result.ground)

    const resolveNames = (names) => {
      if (!groupPlayers) return names
      // Only keep names that actually match a group player (don't create new names)
      return names.map(n => matchGroupPlayer(n, groupPlayers)).filter(n =>
        groupPlayers.some(p => p.name.toLowerCase() === n.toLowerCase())
      )
    }
    const makePlayers = (names, existing) =>
      names.map((name, i) => ({ id: Date.now().toString() + Math.random(), name, color: COLORS[(existing.length + i) % COLORS.length] }))

    if (result.action === 'setTeamA' && result.playersA?.length > 0) {
      setPlayersA(makePlayers(resolveNames(result.playersA), []))
    } else if (result.action === 'addToTeamA' && result.playersA?.length > 0) {
      setPlayersA(prev => {
        const existing = new Set(prev.map(p => p.name.toLowerCase()))
        const newPlayers = resolveNames(result.playersA).filter(n => !existing.has(n.toLowerCase()))
        return [...prev, ...makePlayers(newPlayers, prev)]
      })
    } else if (result.playersA?.length > 0) {
      setPlayersA(prev => {
        const existing = new Set(prev.map(p => p.name.toLowerCase()))
        const newPlayers = resolveNames(result.playersA).filter(n => !existing.has(n.toLowerCase()))
        return [...prev, ...makePlayers(newPlayers, prev)]
      })
    }

    if (result.action === 'setTeamB' && result.playersB?.length > 0) {
      setPlayersB(makePlayers(resolveNames(result.playersB), []))
    } else if (result.action === 'addToTeamB' && result.playersB?.length > 0) {
      setPlayersB(prev => {
        const existing = new Set(prev.map(p => p.name.toLowerCase()))
        const newPlayers = resolveNames(result.playersB).filter(n => !existing.has(n.toLowerCase()))
        return [...prev, ...makePlayers(newPlayers, prev)]
      })
    } else if (result.playersB?.length > 0) {
      setPlayersB(prev => {
        const existing = new Set(prev.map(p => p.name.toLowerCase()))
        const newPlayers = resolveNames(result.playersB).filter(n => !existing.has(n.toLowerCase()))
        return [...prev, ...makePlayers(newPlayers, prev)]
      })
    }

    if (result.tossWinner) setTossWinner(result.tossWinner)
    if (result.tossChoice) setTossChoice(result.tossChoice)

    if (result.matchType) setMatchType(result.matchType)
    if (result.groupId) setSelectedGroupId(result.groupId)
    if (result.groupName) {
      const match = groups.find(g => g.name.toLowerCase().includes(result.groupName.toLowerCase()))
      if (match) setSelectedGroupId(match.id)
    }

    if (result.action === 'create' || result.action === 'start') {
      setTimeout(() => handleStart(), 500)
    }
  }

  const addPlayer = useCallback((team, name) => {
    const n = name || playerInput.trim()
    if (!n) return
    const target = team === 'A' ? playersA : playersB
    const setter = team === 'A' ? setPlayersA : setPlayersB
    if (target.length >= 15) { setError('Max 15 players'); return }
    if (target.find(p => p.name.toLowerCase() === n.toLowerCase())) { setError('Player exists'); return }
    setter(prev => [...prev, { id: Date.now().toString() + Math.random(), name: n, color: COLORS[prev.length % COLORS.length] }])
    setPlayerInput('')
    setError('')
    setShowSuggestions(false)
  }, [playerInput, playersA, playersB])

  const addBulkPlayers = useCallback((team, names) => {
    const setter = team === 'A' ? setPlayersA : setPlayersB
    const target = team === 'A' ? playersA : playersB
    const existing = new Set(target.map(p => p.name.toLowerCase()))
    const newNames = names.filter(n => !existing.has(n.toLowerCase()))
    if (newNames.length > 0) {
      setter(prev => [...prev, ...newNames.map(name => ({ id: Date.now().toString() + Math.random(), name, color: COLORS[(prev.length + newNames.indexOf(name)) % COLORS.length] }))])
    }
  }, [playersA, playersB])

  const removePlayer = useCallback((team, id) => {
    if (team === 'A') setPlayersA(prev => prev.filter(p => p.id !== id))
    else setPlayersB(prev => prev.filter(p => p.id !== id))
  }, [])

  // Find closest matching name from group players (fuzzy match)
  const matchGroupPlayer = useCallback((spokenName, groupPlayers) => {
    if (!groupPlayers || groupPlayers.length === 0) return spokenName
    const lower = spokenName.toLowerCase()
    // Exact match first
    const exact = groupPlayers.find(p => p.name.toLowerCase() === lower)
    if (exact) return exact.name
    // Starts with match
    const starts = groupPlayers.find(p => p.name.toLowerCase().startsWith(lower) || lower.startsWith(p.name.toLowerCase()))
    if (starts) return starts.name
    // Contains match
    const contains = groupPlayers.find(p => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
    if (contains) return contains.name
    return spokenName
  }, [])

  const startEditPlayer = useCallback((id, name) => {
    setEditingPlayerId(id)
    setEditingPlayerName(name)
  }, [])

  const saveEditPlayer = useCallback((team) => {
    const name = editingPlayerName.trim()
    if (!name) { setEditingPlayerId(null); return }
    const setter = team === 'A' ? setPlayersA : setPlayersB
    setter(prev => prev.map(p => p.id === editingPlayerId ? { ...p, name } : p))
    setEditingPlayerId(null)
  }, [editingPlayerId, editingPlayerName])

  const handleDragStart = (e, idx, team) => { setDragIndex(idx); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (e, idx, team) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === idx) return
    const setter = team === 'A' ? setPlayersA : setPlayersB
    const list = team === 'A' ? [...playersA] : [...playersB]
    const [moved] = list.splice(dragIndex, 1)
    list.splice(idx, 0, moved)
    setter(list)
    setDragIndex(null)
  }

  const handleToss = () => {
    setTossAnimating(true)
    setTimeout(() => {
      const winner = Math.random() > 0.5 ? 'A' : 'B'
      setTossWinner(winner)
      setTossAnimating(false)
      if (navigator.vibrate) navigator.vibrate(50)
    }, 1200)
  }

  const randomTeams = () => {
    const all = [...playersA, ...playersB]
    if (all.length < 2) { setError('Add at least 2 players'); return }
    const shuffled = [...all].sort(() => Math.random() - 0.5)
    const mid = Math.ceil(shuffled.length / 2)
    setPlayersA(shuffled.slice(0, mid))
    setPlayersB(shuffled.slice(mid))
  }

  const handleStart = () => {
    const nameA = teamA.trim() || 'Team A'
    const nameB = teamB.trim() || 'Team B'
    if (playersA.length < 1 || playersB.length < 1) { setError('Each team needs at least 1 player'); return }
    const shareCode = generateShareCode()
    const activeRules = localRules || globalRules || undefined
    createMatch({
      teamA: nameA, teamB: nameB,
      playersA, playersB,
      playerCount: Math.max(playersA.length, playersB.length),
      ground: ground.trim() || 'Gully Ground',
      shareCode, nickname,
      rules: activeRules,
      jokerName: activeRules?.jokerEnabled ? jokerName.trim() || null : null,
      tossWinner: tossWinner === 'A' ? nameA : tossWinner === 'B' ? nameB : null,
      tossChoice: tossWinner ? tossChoice : null,
      scoreA: 0, scoreB: 0, wicketsA: 0, wicketsB: 0, ballsA: 0, ballsB: 0,
      currentBatting: 'A', timeline: [],
      battingStatsA: playersA.map(p => ({ name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, status: 'yetToBat' })),
      battingStatsB: playersB.map(p => ({ name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, status: 'yetToBat' })),
      bowlingStatsA: [], bowlingStatsB: [],
      extrasA: 0, extrasB: 0, boundariesA: 0, boundariesB: 0,
      currentBatsman: null, currentBowler: null,
      innings: [], currentInnings: 1, ballHistory: [],
      matchType: matchType || 'individual',
      groupId: matchType === 'group' ? selectedGroupId : null,
    })
    onNavigate('live')
  }

  const suggestions = currentTeam === 'A' ? PLAYER_SUGGESTIONS_A : PLAYER_SUGGESTIONS_B

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => onNavigate('home')} className="text-2xl hover:scale-110 transition-transform">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Create Match</h1>
        </div>
        <button
          onClick={() => setVoiceMode(!voiceMode)}
          className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-300 ${
            voiceMode ? 'bg-neon-green text-black shadow-lg shadow-neon-green/30 scale-105' : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          🎤 AI Voice
        </button>
      </div>

      {/* Match Type Toggle */}
      <div className="px-4 pt-3 max-w-lg mx-auto">
        <div className="flex bg-zinc-800/50 rounded-2xl p-1 border border-zinc-700/50">
          <button onClick={() => setMatchType('individual')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${matchType === 'individual' ? 'bg-neon-green text-black shadow-lg' : 'text-zinc-400'}`}>
            ◈ Individual
          </button>
          <button onClick={() => setMatchType('group')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${matchType === 'group' ? 'bg-purple-500 text-white shadow-lg' : 'text-zinc-400'}`}>
            ⊞ Group Match
          </button>
        </div>
        {matchType === 'group' && (
          <div className="mt-2 animate-fade-up">
            <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white text-sm outline-none appearance-none cursor-pointer">
              <option value="">Select a group...</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.players.length} players)</option>)}
            </select>
            {!selectedGroupId && groups.length === 0 && (
              <p className="text-[10px] text-zinc-500 mt-1">No groups yet. Create one from the Groups screen.</p>
            )}
          </div>
        )}
      </div>

      {/* AI Voice Panel */}
      {voiceMode && (
        <div className="mx-3 mt-3 card-glass p-4 border border-neon-green/20 animate-fade-up">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isListening ? 'bg-red-500 animate-pulse' : aiThinking ? 'bg-yellow-500 animate-spin' : 'bg-neon-green/20'}`}>
              {isListening ? '🎤' : aiThinking ? '🤔' : '🤖'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gradient">
                {isListening ? 'Listening...' : aiThinking ? 'AI Understanding...' : 'AI Voice Mode'}
              </p>
              <p className="text-[10px] text-gray-500">
                Say anything naturally - "Team A is VK Boys" or "Add Sai, Santosh, Rahul" or "Team A won toss and chose to bat"
              </p>
            </div>
          </div>

          {voiceTranscript && (
            <div className="bg-white/5 rounded-xl p-2 mb-2 text-sm text-gray-300 italic">
              "{voiceTranscript}"
            </div>
          )}

          {aiResult && !isListening && !aiThinking && (
            <div className="bg-neon-green/10 border border-neon-green/20 rounded-xl p-3 mb-2 animate-fade-up">
              <p className="text-xs text-neon-green font-bold mb-1">✓ AI Understood</p>
              <p className="text-sm text-gray-300">
                {aiResult.action?.startsWith('set') ? '🔄 ' : '➕ '}
                {aiResult.details ? aiResult.details :
                 aiResult.teamA ? `Team A: ${aiResult.teamA}` : ''}
                {aiResult.teamB ? `${aiResult.teamA ? ' | ' : ''}Team B: ${aiResult.teamB}` : ''}
                {aiResult.tossWinner ? ` | ${aiResult.tossWinner === 'A' ? (teamA || 'Team A') : (teamB || 'Team B')} won toss` : ''}
                {aiResult.tossChoice ? ` & chose to ${aiResult.tossChoice}` : ''}
                {aiResult.ground ? ` | Ground: ${aiResult.ground}` : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleVoiceInput}
              disabled={isListening || aiThinking}
              className={`py-3 rounded-2xl font-bold text-sm transition-all ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-neon-green text-black active:scale-95'
              } disabled:opacity-50`}
            >
              {isListening ? '🎤 Tap to Stop' : '🎤 Start Speaking'}
            </button>
            <button
              onClick={() => { setVoiceMode(false); setAiResult(null); setVoiceTranscript('') }}
              className="py-3 rounded-2xl font-bold text-sm bg-white/10 text-white active:scale-95 transition-all"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Team Names */}
        <div className="card-glass p-5 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-neon-green to-neon-blue" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-neon-green font-bold mb-1.5 block">Team A</label>
              <input
                type="text" placeholder="e.g. VK Boys"
                value={teamA} onChange={e => setTeamA(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-base outline-none focus:border-neon-green/50 focus:bg-white/10 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-neon-blue font-bold mb-1.5 block">Team B</label>
              <input
                type="text" placeholder="e.g. Titans"
                value={teamB} onChange={e => setTeamB(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-base outline-none focus:border-neon-blue/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5 block">Ground (optional)</label>
            <input
              type="text" placeholder="e.g. Terrace 3rd Floor"
              value={ground} onChange={e => setGround(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-base outline-none focus:border-white/20 transition-all"
            />
          </div>
        </div>

        {/* Toss */}
        <div className="card-glass p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-yellow-400 to-orange-500" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">🪙 Toss</p>
              {tossWinner ? (
                <p className="text-xs text-neon-green mt-0.5 flex items-center gap-1">
                  <span>✓</span>
                  {tossWinner === 'A' ? teamA || 'Team A' : teamB || 'Team B'} won & chose to {tossChoice}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">Tap to flip the coin</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {tossWinner && (
                <div className="flex bg-white/10 rounded-xl p-0.5">
                  <button
                    onClick={() => setTossChoice('bat')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tossChoice === 'bat' ? 'bg-neon-green text-black' : 'text-gray-400'}`}
                  >
                    🏏 Bat
                  </button>
                  <button
                    onClick={() => setTossChoice('bowl')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tossChoice === 'bowl' ? 'bg-neon-blue text-black' : 'text-gray-400'}`}
                  >
                    ⚾ Bowl
                  </button>
                </div>
              )}
              <button
                onClick={handleToss}
                disabled={tossAnimating}
                className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
                  tossAnimating ? 'bg-yellow-500/50' : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black active:scale-90'
                }`}
              >
                {tossAnimating ? '🪙 ...' : '🪙 Toss'}
              </button>
            </div>
          </div>
          {tossAnimating && (
            <div className="mt-2 text-center">
              <span className="inline-block text-3xl animate-bounce">🪙</span>
            </div>
          )}
        </div>

        {/* Players */}
        <div className="card-glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base">
              <span className={currentTeam === 'A' ? 'text-neon-green' : 'text-neon-blue'}>
                {currentTeam === 'A' ? (teamA || 'Team A') : (teamB || 'Team B')}
              </span>
              <span className="text-gray-400 text-sm ml-2">
                ({currentTeam === 'A' ? playersA.length : playersB.length})
              </span>
            </h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowSuggestions(!showSuggestions); addPlayerInputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-medium active:scale-90 transition-all">
                💡 Suggest
              </button>
              <button onClick={randomTeams}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-medium active:scale-90 transition-all">
                🔀 Shuffle
              </button>
              <button
                onClick={() => setCurrentTeam(currentTeam === 'A' ? 'B' : 'A')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  currentTeam === 'A' ? 'bg-neon-green/20 text-neon-green' : 'bg-neon-blue/20 text-neon-blue'
                }`}
              >
                Switch
              </button>
            </div>
          </div>

          {/* Quick Suggestions */}
          {showSuggestions && (
            <div className="mb-3 animate-fade-up">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {suggestions.map(name => {
                  const exists = (currentTeam === 'A' ? playersA : playersB).find(p => p.name === name)
                  return (
                    <button
                      key={name}
                      onClick={() => !exists && addPlayer(currentTeam, name)}
                      disabled={exists}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        exists ? 'bg-white/5 text-gray-600 line-through' : 'bg-white/10 text-white hover:bg-white/20 active:scale-90'
                      }`}
                    >
                      + {name}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={async () => {
                  const names = await generateAIPlayerNames(currentTeam === 'A' ? teamA : teamB)
                  if (names) addBulkPlayers(currentTeam, names)
                }}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400 text-xs font-medium active:scale-95 transition-all"
              >
                🤖 AI Auto-generate Players
              </button>
            </div>
          )}

          {/* Add Player Input */}
          <div className="flex gap-2 mb-3">
            <input
              ref={addPlayerInputRef}
              type="text"
              placeholder="Add player name (or comma-separated: Sai, Raj, Ram)"
              value={playerInput}
              onChange={e => setPlayerInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (playerInput.includes(',') || playerInput.includes(';')) {
                    const names = playerInput.split(/[,;]+/).map(n => n.trim()).filter(Boolean)
                    addBulkPlayers(currentTeam, names)
                    setPlayerInput('')
                  } else {
                    addPlayer(currentTeam)
                  }
                }
              }}
              className="flex-1 px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-sm outline-none focus:border-neon-green/50 transition-all"
            />
            <button
              onClick={() => {
                if (playerInput.includes(',') || playerInput.includes(';')) {
                  const names = playerInput.split(/[,;]+/).map(n => n.trim()).filter(Boolean)
                  addBulkPlayers(currentTeam, names)
                  setPlayerInput('')
                } else {
                  addPlayer(currentTeam)
                }
              }}
              className="px-5 py-3 rounded-xl bg-neon-green text-black font-bold text-lg active:scale-90 transition-all"
            >
              +
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm mb-3 animate-fade-up">
              {error}
            </div>
          )}

          {/* Group Player Multi-Select */}
          {matchType === 'group' && selectedGroupId && (() => {
            const group = groups.find(g => g.id === selectedGroupId)
            if (!group || group.players.length === 0) return null
            const currentPlayers = currentTeam === 'A' ? playersA : playersB
            const currentNames = new Set(currentPlayers.map(p => p.name.toLowerCase()))
            const available = group.players.filter(p => !currentNames.has(p.name.toLowerCase()))
            return (
              <div className="mb-4 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 animate-fade-up">
                <p className="text-[10px] uppercase tracking-wider text-purple-400 font-bold mb-2 flex items-center gap-2">
                  <span>From Group · {group.name}</span>
                  <span className="text-zinc-500">({available.length} available)</span>
                </p>
                {available.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto mb-2">
                      {available.map(p => (
                          <label key={p.name}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all border ${
                              selectedGroupPlayers.has(p.name)
                                ? 'bg-purple-500/20 border-purple-400/50 text-white'
                                : 'bg-purple-500/5 border-purple-500/20 text-purple-300 hover:bg-purple-500/15'
                            }`}>
                            <input type="checkbox" checked={selectedGroupPlayers.has(p.name)}
                              onChange={() => {
                                const next = new Set(selectedGroupPlayers)
                                if (next.has(p.name)) next.delete(p.name)
                                else next.add(p.name)
                                setSelectedGroupPlayers(next)
                              }}
                              className="sr-only" />
                            <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] transition-all ${
                              selectedGroupPlayers.has(p.name) ? 'bg-purple-500 border-purple-400 text-white' : 'border-zinc-600'
                            }`}>
                              {selectedGroupPlayers.has(p.name) ? '✓' : ''}
                            </span>
                            {p.name}
                          </label>
                      ))}
                    </div>
                    {selectedGroupPlayers.size > 0 && (
                      <button onClick={() => {
                        const names = Array.from(selectedGroupPlayers)
                        addBulkPlayers(currentTeam, names)
                        setSelectedGroupPlayers(new Set())
                      }}
                        className="w-full py-2 rounded-xl bg-purple-600 text-white text-xs font-bold active:scale-95 transition-all shadow-lg shadow-purple-500/20">
                        ＋ Add {selectedGroupPlayers.size} player{selectedGroupPlayers.size > 1 ? 's' : ''} to {currentTeam === 'A' ? (teamA || 'Team A') : (teamB || 'Team B')}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] text-zinc-600 italic">All group players already added to this team</p>
                )}
              </div>
            )
          })()}

          {/* Team A Players */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-bold">{teamA || 'Team A'} ({playersA.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {playersA.length === 0 ? (
                <p className="text-gray-600 text-xs italic py-1">No players yet. Tap + or use voice!</p>
              ) : (
                playersA.map((p, idx) => (
                  <div
                    key={p.id}
                    draggable={editingPlayerId !== p.id}
                    onDragStart={e => handleDragStart(e, idx, 'A')}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, idx, 'A')}
                    className="group flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium cursor-grab active:cursor-grabbing transition-all hover:scale-105"
                    style={{ background: p.color + '25', border: `1px solid ${p.color}40` }}
                  >
                    <span className="text-[10px] opacity-40 cursor-grab">⠿</span>
                    {editingPlayerId === p.id ? (
                      <input
                        type="text" value={editingPlayerName}
                        onChange={e => setEditingPlayerName(e.target.value)}
                        onBlur={() => {
                          const name = editingPlayerName.trim()
                          if (name) setPlayersA(prev => prev.map(p2 => p2.id === editingPlayerId ? { ...p2, name } : p2))
                          setEditingPlayerId(null)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.target.blur()
                          if (e.key === 'Escape') setEditingPlayerId(null)
                        }}
                        autoFocus
                        className="w-20 bg-white/10 rounded px-1 text-sm outline-none"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span onClick={() => startEditPlayer(p.id, p.name)} className="cursor-text hover:bg-white/10 rounded px-0.5">{p.name}</span>
                    )}
                    <button onClick={() => removePlayer('A', p.id)}
                      className="text-red-400/60 hover:text-red-400 text-xs ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Team B Players */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-bold">{teamB || 'Team B'} ({playersB.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {playersB.length === 0 ? (
                <p className="text-gray-600 text-xs italic py-1">No players yet. Tap + or use voice!</p>
              ) : (
                playersB.map((p, idx) => (
                  <div
                    key={p.id}
                    draggable={editingPlayerId !== p.id}
                    onDragStart={e => handleDragStart(e, idx, 'B')}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, idx, 'B')}
                    className="group flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium cursor-grab active:cursor-grabbing transition-all hover:scale-105"
                    style={{ background: p.color + '25', border: `1px solid ${p.color}40` }}
                  >
                    <span className="text-[10px] opacity-40 cursor-grab">⠿</span>
                    {editingPlayerId === p.id ? (
                      <input
                        type="text" value={editingPlayerName}
                        onChange={e => setEditingPlayerName(e.target.value)}
                        onBlur={() => {
                          const name = editingPlayerName.trim()
                          if (name) setPlayersB(prev => prev.map(p2 => p2.id === editingPlayerId ? { ...p2, name } : p2))
                          setEditingPlayerId(null)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.target.blur()
                          if (e.key === 'Escape') setEditingPlayerId(null)
                        }}
                        autoFocus
                        className="w-20 bg-white/10 rounded px-1 text-sm outline-none"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span onClick={() => startEditPlayer(p.id, p.name)} className="cursor-text hover:bg-white/10 rounded px-0.5">{p.name}</span>
                    )}
                    <button onClick={() => removePlayer('B', p.id)}
                      className="text-red-400/60 hover:text-red-400 text-xs ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* AI Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!teamA.trim() && !teamB.trim()) {
                setTeamA('VK Boys'); setTeamB('Titans')
              }
              if (playersA.length === 0) {
                const names = await generateAIPlayerNames(teamA || 'VK Boys')
                if (names) addBulkPlayers('A', names)
              }
              if (playersB.length === 0) {
                const names = await generateAIPlayerNames(teamB || 'Titans')
                if (names) addBulkPlayers('B', names)
              }
            }}
            className="flex-1 py-3 rounded-2xl font-bold text-xs bg-gradient-to-r from-purple-600 to-pink-600 text-white active:scale-95 transition-all"
          >
            🤖 AI Auto Setup
          </button>
          <button
            onClick={() => { setTeamA(''); setTeamB(''); setPlayersA([]); setPlayersB([]); setGround(''); setTossWinner(null); setError('') }}
            className="flex-1 py-3 rounded-2xl font-bold text-xs bg-white/10 text-gray-400 active:scale-95 transition-all"
          >
            ✕ Clear All
          </button>
        </div>

        {/* Per-Match Rules */}
        <div className="card-glass p-4">
          <button onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <span className="text-neon-blue">⚙</span> Match Rules
              {localRules && (localRules.lastManStanding || localRules.jokerEnabled || localRules.directSixOut) && (
                <span className="text-[10px] text-neon-green font-normal">({[
                  localRules.lastManStanding && 'Last Man',
                  localRules.jokerEnabled && 'Joker',
                  localRules.directSixOut && 'Six=Out',
                ].filter(Boolean).join(', ')})</span>
              )}
            </h2>
            <span className={`text-gray-500 transition-transform ${showRules ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {showRules && (
            <div className="mt-3 space-y-2 animate-fade-up">
              {/* Total Overs */}
              <div className="pt-1 pb-2 border-b border-white/10">
                <p className="text-xs font-medium mb-2">📊 Overs per Innings</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[0, 1, 5, 10, 20, 50].map(n => (
                    <button key={n} onClick={() => setLocalRules(prev => ({ ...(prev || {}), totalOvers: n }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${(localRules?.totalOvers ?? 0) === n ? 'bg-neon-green text-black' : 'bg-white/10 text-white'}`}>
                      {n === 0 ? 'Unlimited' : `${n}`}
                    </button>
                  ))}
                </div>
              </div>
              {/* Single Batsman Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <div className="flex-1 pr-3">
                  <p className="text-xs font-medium">🏏 Single Batsman</p>
                  <p className="text-[10px] text-gray-500">Only striker bats (no non-striker). Turn off for paired running.</p>
                </div>
                <button onClick={() => setLocalRules(prev => ({ ...(prev || {}), singleBatsman: !(prev?.singleBatsman ?? true) }))}
                  className={`w-12 h-7 rounded-full transition-all shrink-0 ${(localRules?.singleBatsman ?? true) ? 'bg-neon-green' : 'bg-white/20'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-transform ${(localRules?.singleBatsman ?? true) ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {[
                { key: 'lastManStanding', label: '🏃 Last Man Standing', desc: 'Last player bats alone — innings ends only when all out' },
                { key: 'directSixOut', label: '🚀 Direct Six = Out', desc: 'Hit a six and you\'re out' },
                { key: 'oneTipOneHand', label: '✋ One-tip One-hand', desc: 'Catch with one hand after one tip = out' },
                { key: 'noBallTwoRuns', label: '⛔ No Ball = 2 Runs', desc: 'No ball gives 2 runs instead of 1' },
                { key: 'twoBounceRetire', label: '🔄 Two Bounce Retire', desc: 'Retire after 2 bounce catches' },
                { key: 'rebattingAllowed', label: '🔄 Re-batting', desc: 'Batsmen can bat again after dismissal' },
                { key: 'trackWickets', label: '🎯 Track Wicket Types', desc: 'Ask bowled/caught/run out etc. on each wicket' },
              ].map(rule => (
                <div key={rule.key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex-1 pr-3">
                    <p className="text-xs font-medium">{rule.label}</p>
                    <p className="text-[10px] text-gray-500">{rule.desc}</p>
                  </div>
                  <button onClick={() => setLocalRules(prev => ({ ...(prev || {}), [rule.key]: !(prev?.[rule.key] || false) }))}
                    className={`w-12 h-7 rounded-full transition-all shrink-0 ${(localRules?.[rule.key]) ? 'bg-neon-green' : 'bg-white/20'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-transform ${(localRules?.[rule.key]) ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
              {/* Joker Player */}
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1 pr-3">
                    <p className="text-xs font-medium">🎭 Joker Player</p>
                    <p className="text-[10px] text-gray-500">One player who can bat & bowl for both teams</p>
                  </div>
                  <button onClick={() => setLocalRules(prev => ({ ...(prev || {}), jokerEnabled: !(prev?.jokerEnabled || false) }))}
                    className={`w-12 h-7 rounded-full transition-all shrink-0 ${localRules?.jokerEnabled ? 'bg-purple-500' : 'bg-white/20'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-transform ${localRules?.jokerEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {localRules?.jokerEnabled && (
                  <input type="text" placeholder="Enter joker player name" value={jokerName} onChange={e => setJokerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-purple-500/30 text-white text-xs outline-none focus:border-purple-500 placeholder:text-gray-600" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="w-full py-5 rounded-2xl font-bold text-xl bg-gradient-to-r from-neon-green to-emerald-500 text-black shadow-lg shadow-neon-green/20 active:scale-[0.97] transition-all hover:shadow-neon-green/40"
        >
          🏏 Start Match →
        </button>

        <div className="h-12" />
      </div>
    </div>
  )
}
