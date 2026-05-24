import { useState, useMemo, useCallback, useRef } from 'react'
import { useGroups } from '../context/GroupContext'
import { useAuth } from '../context/AuthContext'

const STAT_CATEGORIES = {
  batting: [
    { key: 'runs', label: 'Runs', sort: 'desc' },
    { key: 'average', label: 'Avg', sort: 'desc' },
    { key: 'strikeRate', label: 'SR', sort: 'desc' },
    { key: 'balls', label: 'Balls', sort: 'desc' },
    { key: 'fours', label: '4s', sort: 'desc' },
    { key: 'sixes', label: '6s', sort: 'desc' },
    { key: 'highestScore', label: 'HS', sort: 'desc' },
    { key: 'fifties', label: '50s', sort: 'desc' },
    { key: 'hundreds', label: '100s', sort: 'desc' },
    { key: 'notOuts', label: 'NO', sort: 'desc' },
    { key: 'matches', label: 'M', sort: 'desc' },
  ],
  bowling: [
    { key: 'wickets', label: 'Wkts', sort: 'desc' },
    { key: 'economy', label: 'Econ', sort: 'asc' },
    { key: 'runsConceded', label: 'Runs', sort: 'desc' },
    { key: 'overs', label: 'Balls', sort: 'desc' },
    { key: 'matches', label: 'M', sort: 'desc' },
  ],
  fielding: [
    { key: 'catches', label: 'Ct', sort: 'desc' },
    { key: 'stumpings', label: 'St', sort: 'desc' },
    { key: 'matches', label: 'M', sort: 'desc' },
  ],
}

export default function GroupDashboard({ onNavigate }) {
  const { groups, activeGroup, setActiveGroupById, addPlayerToGroup, removePlayerFromGroup, addBulkPlayersToGroup, resetGroupStats, claimPlayerInGroup } = useGroups()
  const { user } = useAuth()
  const [activeStatTab, setActiveStatTab] = useState('batting')
  const [sortBy, setSortBy] = useState('runs')
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [voiceInput, setVoiceInput] = useState('')
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const voiceRecognitionRef = useRef(null)

  const group = activeGroup || (groups.length > 0 ? groups[0] : null)

  if (!group) {
    return (
      <div className="min-h-screen bg-pitch-dark flex flex-col items-center justify-center p-6">
        <div className="text-5xl mb-4 opacity-30">◈</div>
        <p className="text-gray-400 mb-6 font-medium">No group selected</p>
        <button onClick={() => onNavigate('groups')}
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-neon-green to-emerald-500 text-black font-bold shadow-lg shadow-neon-green/20 active:scale-95 transition-all">
          ← Back to Groups
        </button>
      </div>
    )
  }

  const sortPlayers = (players, category, sortKey) => {
    const cats = STAT_CATEGORIES[category] || STAT_CATEGORIES.batting
    const rule = cats.find(c => c.key === sortKey) || cats[0]
    return [...players].sort((a, b) => {
      const getComp = (p) => {
        if (sortKey === 'average') return p.stats.matches > 0 ? p.stats.runs / p.stats.matches : 0
        if (sortKey === 'strikeRate') return p.stats.balls > 0 ? (p.stats.runs / p.stats.balls) * 100 : 0
        if (sortKey === 'economy') return p.stats.overs > 0 ? (p.stats.runsConceded / p.stats.overs) * 6 : 999
        return p.stats[sortKey] || 0
      }
      return rule.sort === 'desc' ? getComp(b) - getComp(a) : getComp(a) - getComp(b)
    })
  }

  const sortedPlayers = useMemo(() => sortPlayers(group.players, activeStatTab, sortBy), [group.players, activeStatTab, sortBy])

  const handleVoiceAddPlayer = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Voice not supported. Use Chrome.'); return }
    if (isVoiceListening) { voiceRecognitionRef.current?.stop(); setIsVoiceListening(false); return }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    voiceRecognitionRef.current = recognition
    setIsVoiceListening(true)
    setVoiceInput('')

    let finalText = ''

    recognition.onresult = (event) => {
      // Show interim text for visual feedback
      const last = event.results[event.results.length - 1]
      if (!last?.isFinal) {
        const partial = Array.from(event.results).map(r => r[0].transcript).join(' ')
        setVoiceInput(partial)
        return
      }
      // Pick the best confidence choice from the final result
      let top = last[0].transcript
      for (let j = 1; j < last.length; j++) {
        if (last[j].confidence > last[0].confidence) top = last[j].transcript
      }
      finalText = top
      setVoiceInput(finalText)
    }

    recognition.onend = () => {
      setIsVoiceListening(false)
      if (finalText.trim()) {
        // Split by spoken "comma" word and punctuation commas
        const names = finalText.trim()
          .replace(/\bcomma\b/gi, ',')
          .split(/,/).map(n => n.trim()).filter(n => n.length >= 2 && n.length < 30)
        if (names.length > 0) {
          names.forEach(name => addPlayerToGroup(group.id, name))
        }
        setVoiceInput('')
        finalText = ''
      }
    }

    recognition.onerror = () => { setIsVoiceListening(false) }
    recognition.start()
  }, [group, addPlayerToGroup, addBulkPlayersToGroup, isVoiceListening])

  const handleAddPlayer = () => {
    if (!playerName.trim()) return
    addPlayerToGroup(group.id, playerName.trim())
    setPlayerName('')
    setShowAddPlayer(false)
  }

  const handleBulkAdd = () => {
    const names = bulkNames.split(/[,;\n]+/).map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    addBulkPlayersToGroup(group.id, names)
    setBulkNames('')
    setShowBulkAdd(false)
  }

  const getStatValue = (player, key) => {
    const s = player.stats
    switch (key) {
      case 'average': return s.matches > 0 ? (s.runs / s.matches).toFixed(1) : '-'
      case 'strikeRate': return s.balls > 0 ? (s.runs / s.balls * 100).toFixed(1) : '-'
      case 'economy': return s.overs > 0 ? (s.runsConceded / s.overs * 6).toFixed(1) : '-'
      case 'overs': return s.overs ? `${Math.floor(s.overs / 6)}.${s.overs % 6}` : '0.0'
      case 'highestScore': return s.highestScore || 0
      default: return s[key] || 0
    }
  }

  const currentCat = STAT_CATEGORIES[activeStatTab] || STAT_CATEGORIES.batting

  const handleClaimPlayer = (player) => {
    if (!user || user?.isGuest) { alert('Create an account first to claim a player identity'); return }
    if (player.claimed) return
    if (confirm(`Link this player "${player.name}" to your account (${user.name})?`)) {
      claimPlayerInGroup(group.id, player.name, user.id, user.name)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate('groups')} className="text-xl hover:scale-110 transition-transform shrink-0">‹</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
              <select
                value={group.id}
                onChange={e => setActiveGroupById(e.target.value)}
                className="bg-zinc-800 text-white text-sm font-bold rounded-xl px-3 py-1.5 border border-zinc-700 outline-none appearance-none cursor-pointer max-w-[140px] truncate"
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {group.shareCode && (
                <button onClick={() => { navigator.clipboard.writeText(group.shareCode); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000) }}
                  className="text-[10px] text-zinc-500 hover:text-blue-400 transition-colors px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 shrink-0">
                  {copiedShare ? '✓ Copied' : '🔗'}
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
              <span>✦ {group.players.length} players</span>
              <span>◇ {group.matches.length} matches</span>
            </p>
          </div>
          <button onClick={() => setShowAddPlayer(!showAddPlayer)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs active:scale-90 transition-all shadow-lg shadow-purple-500/20 shrink-0">
            ＋ Player
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Add Player Panel */}
        {showAddPlayer && (
          <div className="rounded-2xl p-4 border border-purple-500/20 animate-fade-up" style={{ background: 'linear-gradient(135deg, rgba(88,28,135,0.2), rgba(15,15,35,0.9))' }}>
            <div className="flex gap-2 mb-2">
              <input type="text" placeholder="Player name" value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-gray-500 text-sm outline-none focus:border-purple-500/50 transition-colors" />
              <button onClick={handleVoiceAddPlayer}
                className={`px-3 py-3 rounded-xl font-bold text-sm active:scale-90 transition-all ${isVoiceListening ? 'bg-neon-green text-black animate-pulse' : 'bg-zinc-700 text-white'}`}>🎤</button>
              <button onClick={handleAddPlayer}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm active:scale-90 transition-all shadow-lg">Add</button>
            </div>
            {voiceInput && <p className="text-[10px] text-zinc-500 mb-2 animate-fade-up italic">"{voiceInput}"</p>}
            <button onClick={() => setShowBulkAdd(!showBulkAdd)} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors">
              {showBulkAdd ? '− Hide bulk add' : '+ Bulk add (comma separated)'}
            </button>
            {showBulkAdd && (
              <div className="mt-2 animate-fade-up">
                <textarea placeholder="Sai, Santosh, Rahul, Vamsi, Arjun"
                  value={bulkNames} onChange={e => setBulkNames(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-gray-500 text-sm outline-none resize-none h-20 focus:border-purple-500/50" />
                <button onClick={handleBulkAdd}
                  className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs active:scale-95 transition-all shadow-lg">
                  ＋ Add All Players
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Players', value: group.players.length, color: 'from-purple-500 to-pink-500' },
            { label: 'Matches', value: group.matches.length, color: 'from-neon-green to-emerald-500' },
            { label: 'Total Runs', value: group.players.reduce((a, p) => a + p.stats.runs, 0), color: 'from-neon-blue to-cyan-500' },
            { label: 'Total Wkts', value: group.players.reduce((a, p) => a + p.stats.wickets, 0), color: 'from-yellow-500 to-orange-500' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl p-3 text-center border border-white/5" style={{ background: 'rgba(17,17,34,0.8)' }}>
              <p className={`text-xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</p>
              <p className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 bg-zinc-900/50 rounded-2xl p-1.5 border border-zinc-800">
          {Object.keys(STAT_CATEGORIES).map(key => (
            <button key={key}
              onClick={() => { setActiveStatTab(key); setSortBy(STAT_CATEGORIES[key][0].key) }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all capitalize tracking-wide ${
                activeStatTab === key ? 'bg-zinc-700 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {key === 'batting' ? '⊛ Bat' : key === 'bowling' ? '◉ Bowl' : '◈ Field'}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[9px] text-zinc-500 uppercase tracking-[0.15em] font-bold">Leaderboard</p>
          <div className="relative">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="bg-zinc-800 text-zinc-300 text-[11px] px-4 py-2 rounded-xl border border-zinc-700 outline-none appearance-none cursor-pointer pr-8">
              {currentCat.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[9px] pointer-events-none">▼</span>
          </div>
        </div>

        {/* Players Leaderboard */}
        <div className="rounded-2xl overflow-hidden border border-zinc-800/50" style={{ background: 'rgba(17,17,34,0.6)' }}>
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="text-4xl mb-3 opacity-20">◈</div>
              <p className="text-zinc-400 text-sm font-medium">No players in this group</p>
              <p className="text-zinc-600 text-xs mt-1">Add players to start tracking stats!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-3 px-3 w-8">#</th>
                    <th className="text-left py-3 pr-2">Player</th>
                    {currentCat.map(c => (
                      <th key={c.key}
                        className={`py-3 text-center w-12 cursor-pointer transition-colors font-medium ${sortBy === c.key ? 'text-white' : 'hover:text-zinc-300'}`}
                        onClick={() => setSortBy(c.key)}>
                        {c.label}
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player, i) => {
                    const rank = i + 1
                    const isTop3 = rank <= 3
                    const medals = ['🥇', '🥈', '🥉']
                    return (
                      <tr key={player.name} className="group border-b border-zinc-800/50 last:border-0 hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-3 text-center">
                          {isTop3 ? <span className="text-sm">{medals[rank - 1]}</span> : <span className="text-zinc-600">{rank}</span>}
                        </td>
                        <td className="py-3 pr-2 font-medium truncate max-w-[90px] text-zinc-200 cursor-pointer hover:text-purple-400 transition-colors"
                          onClick={() => setSelectedPlayer(player)}>{player.name}</td>
                        {currentCat.map(c => {
                          const val = getStatValue(player, c.key)
                          return <td key={c.key} className={`py-3 text-center ${c.key === sortBy ? 'font-bold text-neon-green' : 'text-zinc-400'}`}>{val}</td>
                        })}
                        <td className="py-3 pr-2">
                          <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${player.name}?`)) removePlayerFromGroup(group.id, player.name) }}
                                                         className="text-zinc-600 hover:text-red-400 text-[10px] transition-all opacity-30 hover:opacity-100">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Matches */}
        {group.matches.length > 0 && (
          <div className="rounded-2xl p-4 border border-zinc-800/50" style={{ background: 'rgba(17,17,34,0.6)' }}>
            <h3 className="font-bold text-xs text-zinc-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gradient-to-b from-neon-green to-emerald-500" />
              Recent Matches
            </h3>
            <div className="space-y-2">
              {group.matches.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs py-2.5 border-b border-zinc-800/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-200 truncate">{m.teamA} ⚡ {m.teamB}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {m.ground || 'Gully'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-bold text-zinc-200">{m.scoreA}/{m.wicketsA} – {m.scoreB}/{m.wicketsB}</p>
                    {m.winner && <p className="text-[9px] text-emerald-400 mt-0.5">◉ {m.winner}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player History Modal */}
        {selectedPlayer && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
            <div className="card-glass p-5 w-full max-w-sm mx-auto max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <span className="text-purple-400">◉</span> {selectedPlayer.name}
                </h2>
                <button onClick={() => setSelectedPlayer(null)} className="text-zinc-400 text-lg">✕</button>
              </div>

              {/* Career Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-4">
                {[
                  { label: 'M', value: selectedPlayer.stats.matches },
                  { label: 'Runs', value: selectedPlayer.stats.runs },
                  { label: 'Wkts', value: selectedPlayer.stats.wickets },
                  { label: 'HS', value: selectedPlayer.stats.highestScore || '-' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-2.5 text-center bg-white/5">
                    <p className="text-base font-black text-gradient">{s.value}</p>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-4 text-[10px] text-zinc-400">
                <p>Avg: <span className="text-white font-medium">{selectedPlayer.stats.matches > 0 ? (selectedPlayer.stats.runs / selectedPlayer.stats.matches).toFixed(1) : '-'}</span></p>
                <p>SR: <span className="text-white font-medium">{selectedPlayer.stats.balls > 0 ? (selectedPlayer.stats.runs / selectedPlayer.stats.balls * 100).toFixed(1) : '-'}</span></p>
                <p>4s: <span className="text-white font-medium">{selectedPlayer.stats.fours}</span></p>
                <p>6s: <span className="text-white font-medium">{selectedPlayer.stats.sixes}</span></p>
                <p>Econ: <span className="text-white font-medium">{selectedPlayer.stats.overs > 0 ? (selectedPlayer.stats.runsConceded / selectedPlayer.stats.overs * 6).toFixed(1) : '-'}</span></p>
                <p>50s/100s: <span className="text-white font-medium">{selectedPlayer.stats.fifties}/{selectedPlayer.stats.hundreds}</span></p>
              </div>

              {/* Claim Identity */}
              {!selectedPlayer.claimed ? (
                <button onClick={() => handleClaimPlayer(selectedPlayer)}
                  className="w-full mb-3 py-2.5 rounded-xl border border-dashed border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/10 active:scale-[0.98] transition-all">
                  🔗 Claim this as my identity
                </button>
              ) : (
                <div className="w-full mb-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium text-center flex items-center justify-center gap-1.5">
                  <span>✓</span> Claimed {selectedPlayer.claimedByName ? `by ${selectedPlayer.claimedByName}` : ''}
                </div>
              )}

              {/* Match History */}
              <h3 className="font-bold text-xs text-zinc-300 mb-2 flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-gradient-to-b from-purple-400 to-pink-400" />
                Match History
              </h3>
              {group.matches.length === 0 ? (
                <p className="text-zinc-600 text-xs italic py-3">No matches recorded</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {group.matches.map(m => {
                    const batted = selectedPlayer.history?.find(h => h.matchId === m.id)
                    return (
                      <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/5 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-200 truncate">{m.teamA} vs {m.teamB}</p>
                          <p className="text-[9px] text-zinc-600">{new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-bold text-zinc-200">{m.scoreA}/{m.wicketsA} - {m.scoreB}/{m.wicketsB}</p>
                          {batted && <p className="text-[9px] text-emerald-400">{batted.runs} runs, {batted.wickets} wkts</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div className="rounded-2xl p-4 border border-zinc-800/50" style={{ background: 'rgba(17,17,34,0.6)' }}>
          <button onClick={() => setShowActivity(!showActivity)}
            className="flex items-center justify-between w-full">
            <h3 className="font-bold text-xs text-zinc-300 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-400 to-cyan-400" />
              Activity Log · {group.activityLog.length}
            </h3>
            <span className={`text-zinc-500 text-xs transition-transform ${showActivity ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {showActivity && (
            <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
              {group.activityLog.length === 0 ? (
                <p className="text-zinc-600 text-xs italic py-2">No activity yet</p>
              ) : (
                group.activityLog.slice(0, 50).map(a => (
                  <div key={a.id} className="flex items-start gap-2.5 py-2 border-b border-zinc-800/30 last:border-0">
                    <span className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-300">
                        <span className="text-purple-400 font-medium">{a.user}</span>
                        <span className="text-zinc-500"> {a.action}</span>
                      </p>
                      <p className="text-[9px] text-zinc-600 mt-0.5">{new Date(a.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button onClick={() => { if (confirm('Reset all stats for this group? Cannot be undone.')) resetGroupStats(group.id) }}
            className="flex-1 py-3.5 rounded-2xl font-bold text-xs bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 active:scale-[0.97] transition-all hover:bg-zinc-800">
            ⟲ Reset
          </button>
          <button onClick={() => onNavigate('create')}
            className="flex-1 py-3.5 rounded-2xl font-bold text-xs bg-gradient-to-r from-neon-green to-emerald-500 text-black shadow-lg shadow-neon-green/10 active:scale-[0.97] transition-all">
            ＋ New Match
          </button>
        </div>

        <div className="h-10" />
      </div>
    </div>
  )
}
