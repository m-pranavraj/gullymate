import { useState, useRef } from 'react'
import { useMatch } from '../context/MatchContext'
import { useGroups } from '../context/GroupContext'
import { getRandomLine, getRandomNickname } from '../utils/commentary'
import { getMostChaosPlayer, selectMOTM, getEndingMessage } from '../utils/matchUtils'

function BattingCard({ stats, teamName, currentBatsman, extras }) {
  return (
    <div className="card-glass p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-neon-green">🦇</span>
        <h3 className="font-bold text-sm">{teamName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5 pr-2">Batter</th>
              <th className="w-10 text-center">R</th>
              <th className="w-8 text-center">B</th>
              <th className="w-8 text-center">4s</th>
              <th className="w-8 text-center">6s</th>
              <th className="w-10 text-center">SR</th>
            </tr>
          </thead>
          <tbody>
            {(stats || []).length === 0 ? (
              <tr><td colSpan={6} className="text-gray-600 text-center py-4 italic">No data</td></tr>
            ) : (
              stats.map((s, i) => (
                <tr key={i} className={`border-b border-white/5 last:border-0 ${s.name === currentBatsman ? 'bg-neon-green/5' : ''}`}>
                  <td className="py-2 pr-2 truncate max-w-[100px]">
                    {s.name}
                    {s.out ? <span className="text-red-400 ml-1">†</span> : <span className="text-neon-green ml-1">*</span>}
                  </td>
                  <td className="text-center font-bold">{s.runs || 0}</td>
                  <td className="text-center text-gray-400">{s.balls || 0}</td>
                  <td className="text-center text-emerald-400">{s.fours || 0}</td>
                  <td className="text-center text-neon-green">{s.sixes || 0}</td>
                  <td className="text-center text-gray-400">{s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(0) : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[10px] text-gray-500">
        <span>Extras: {extras || 0}</span>
        <span>Total: {(stats?.reduce((a, s) => a + (s.runs || 0), 0) || 0) + (extras || 0)}/{stats?.filter(s => s.out).length || 0}</span>
      </div>
    </div>
  )
}

function BowlingCard({ stats, teamName, balls }) {
  const overs = balls ? `${Math.floor(balls / 6)}.${balls % 6}` : '0.0'
  const runs = stats?.reduce((a, s) => a + (s.runsConceded || 0), 0) || 0
  const wickets = stats?.reduce((a, s) => a + (s.wickets || 0), 0) || 0
  const econ = balls > 0 ? ((runs / balls) * 6).toFixed(1) : '-'

  return (
    <div className="card-glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-neon-blue">🎯</span>
        <h3 className="font-bold text-sm">{teamName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-1.5 pr-2">Bowler</th>
              <th className="w-8 text-center">O</th>
              <th className="w-8 text-center">M</th>
              <th className="w-8 text-center">R</th>
              <th className="w-8 text-center">W</th>
              <th className="w-10 text-center">Econ</th>
            </tr>
          </thead>
          <tbody>
            {(stats || []).length === 0 ? (
              <tr><td colSpan={6} className="text-gray-600 text-center py-4 italic">No bowling data</td></tr>
            ) : (
              stats.map((s, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="py-2 pr-2 truncate max-w-[100px]">{s.name}</td>
                  <td className="text-center">{s.overs ? `${Math.floor(s.overs / 6)}.${s.overs % 6}` : '0.0'}</td>
                  <td className="text-center text-gray-400">{s.maidens || 0}</td>
                  <td className="text-center">{s.runsConceded || 0}</td>
                  <td className="text-center font-bold text-yellow-400">{s.wickets || 0}</td>
                  <td className="text-center text-gray-400">{s.overs > 0 ? ((s.runsConceded || 0) / s.overs * 6).toFixed(1) : '-'}</td>
                </tr>
              ))
            )}
            <tr className="border-t border-white/10 font-bold">
              <td className="py-2 pr-2">Total</td>
              <td className="text-center">{overs}</td>
              <td className="text-center">-</td>
              <td className="text-center">{runs}</td>
              <td className="text-center text-yellow-400">{wickets}</td>
              <td className="text-center">{econ}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MatchSummaryScreen({ matchId, onNavigate }) {
  const { getMatch, matches, deleteMatch, updateMatchDate } = useMatch()
  const { groups, recordMatchForGroup } = useGroups()
  const match = matchId ? getMatch(matchId) : null
  const [activeTab, setActiveTab] = useState('batting')
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [dateStr, setDateStr] = useState('')
  const [savedToGroup, setSavedToGroup] = useState(false)
  const scorecardRef = useRef(null)

  if (!match) {
    const last = matches.filter(m => m.status === 'completed').slice(-1)[0]
    if (!last) return <div className="min-h-screen bg-pitch-dark flex items-center justify-center"><p className="text-gray-500">No match found</p></div>
    return <MatchSummaryScreen matchId={last.id} onNavigate={onNavigate} />
  }

  const motm = match.motm || selectMOTM(
    [...(match.playersA || []), ...(match.playersB || [])],
    [...(match.battingStatsA || []), ...(match.battingStatsB || [])]
  ) || 'Unknown'
  const chaosPlayer = getMostChaosPlayer([...(match.playersA || []), ...(match.playersB || [])], match.timeline || [])
  const endingMessage = match.winner ? getEndingMessage(match.winner, Math.abs((match.scoreA || 0) - (match.scoreB || 0))) : ''
  const nickname = match.nickname || getRandomNickname()
  const ballHistory = match.ballHistory || []
  const createdAt = match.createdAt || match.endedAt || Date.now()

  const handleSaveToGroup = () => {
    if (!selectedGroupId) return
    recordMatchForGroup(selectedGroupId, {
      id: match.id, teamA: match.teamA, teamB: match.teamB,
      scoreA: match.scoreA || 0, wicketsA: match.wicketsA || 0,
      scoreB: match.scoreB || 0, wicketsB: match.wicketsB || 0,
      winner: match.winner, ground: match.ground, motm,
    }, match.battingStatsA || [], match.battingStatsB || [], match.ballHistory || [])
    setSavedToGroup(true)
    setTimeout(() => setSavedToGroup(false), 2000)
    setShowGroupPicker(false)
  }

  const handleExportImage = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default
      const el = scorecardRef.current
      if (!el) return
      const canvas = await html2canvas(el, { backgroundColor: '#0a0a1a', scale: 2 })
      const link = document.createElement('a')
      link.download = `scorecard-${match.teamA}-vs-${match.teamB}.png`
      link.href = canvas.toDataURL()
      link.click()
    } catch (e) {
      alert('Could not export image')
    }
  }

  const handleDateEdit = () => {
    if (editingDate) {
      const ts = new Date(dateStr).getTime()
      if (!isNaN(ts)) updateMatchDate(match.id, ts)
      setEditingDate(false)
    } else {
      setDateStr(new Date(createdAt).toISOString().slice(0, 10))
      setEditingDate(true)
    }
  }

  // Compute bowling stats from ball history
  const computeBowlingStats = (teamPlayers, innings) => {
    const filtered = ballHistory.filter(b => b.innings === innings)
    if (!teamPlayers || filtered.length === 0) return []
    const stats = {}
    teamPlayers.forEach(p => { stats[p.name] = { name: p.name, balls: 0, maidens: 0, runsConceded: 0, wickets: 0, maidenRuns: 0 } })
    filtered.forEach(b => {
      if (!stats[b.bowler]) return
      const isLegal = b.label !== 'WD' && b.label !== 'NB'
      if (isLegal) stats[b.bowler].balls++
      stats[b.bowler].runsConceded += b.runs || 0
      if (isLegal && (b.runs || 0) === 0) stats[b.bowler].maidenRuns += b.runs || 0
      if (b.type === 'wicket') stats[b.bowler].wickets++
    })
    return Object.values(stats).map(s => {
      s.overs = s.balls
      s.maidens = Math.floor(s.balls / 6) === 0 ? 0 : s.balls >= 6 ? Math.floor(s.balls / 6) : 0
      return s
    })
  }

  // Determine who batted first
  const battingFirst = match.battingFirst || 'A'
  const bowlingStatsA = computeBowlingStats(match.playersA, battingFirst === 'A' ? 2 : 1)
  const bowlingStatsB = computeBowlingStats(match.playersB, battingFirst === 'A' ? 1 : 2)

  const shareScorecard = () => {
    const text = `🏏 ${match.teamA} vs ${match.teamB}\n${nickname}\n\n${match.teamA}: ${match.scoreA}/${match.wicketsA}\n${match.teamB}: ${match.scoreB}/${match.wicketsB}\n\n${match.winner ? `🏆 ${match.winner} won!` : 'Match Drawn!'}\n\nMade with Gully Cricket`
    if (navigator.share) navigator.share({ title: 'Gully Cricket Scorecard', text })
    else { navigator.clipboard.writeText(text); alert('Scorecard copied!') }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-pitch-dark to-blue-950 pb-8">
      <div className="sticky top-0 z-50 bg-pitch-dark/95 backdrop-blur-lg border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => onNavigate('home')} className="text-2xl hover:scale-110 transition-transform">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Scorecard</h1>
          <p className="text-[10px] text-gray-500">{new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto animate-fade-up">

        {/* Group Picker Modal */}
        {showGroupPicker && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
            <div className="card-glass p-5 w-full max-w-sm mx-auto">
              <h2 className="font-bold text-base mb-4 flex items-center gap-2">
                <span className="text-purple-400">⊞</span> Save to Group
              </h2>
              {savedToGroup ? (
                <div className="text-center py-6">
                  <p className="text-neon-green font-bold text-lg">✓ Saved!</p>
                </div>
              ) : (
                <>
                  <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white text-sm outline-none appearance-none cursor-pointer mb-4">
                    <option value="">Select group...</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.players.length} players)</option>)}
                  </select>
                  {groups.length === 0 && <p className="text-zinc-500 text-xs mb-4">No groups yet.</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setShowGroupPicker(false)}
                      className="flex-1 py-3.5 rounded-2xl font-bold text-sm border border-white/20 text-white active:scale-[0.97] transition-all">Cancel</button>
                    <button onClick={handleSaveToGroup} disabled={!selectedGroupId}
                      className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white active:scale-[0.97] transition-all disabled:opacity-40">
                      ⊞ Save
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Scorecard Content (export target) */}
        <div ref={scorecardRef}>

        {/* Winner Banner */}
        <div className="card-glass p-5 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-green via-neon-blue to-neon-green" />
          <div className="text-4xl mb-1">{match.winner ? '🏆' : '🤝'}</div>
          <h2 className="text-xl font-black text-gradient">{match.winner || 'Match Drawn'}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{endingMessage}</p>
          <p className="text-[10px] text-gray-500 mt-1">{nickname}</p>
        </div>

        {/* Final Score Summary */}
        <div className="card-glass p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-center flex-1">
              <p className="text-xs font-bold text-gray-400">{match.teamA}</p>
              <p className="text-3xl font-black text-gradient">{match.scoreA || 0}<span className="text-lg text-gray-400">/{match.wicketsA || 0}</span></p>
              <p className="text-[10px] text-gray-500">({match.ballsA || 0} balls)</p>
            </div>
            <div className="text-gray-600 font-bold px-3 text-lg">VS</div>
            <div className="text-center flex-1">
              <p className="text-xs font-bold text-gray-400">{match.teamB}</p>
              <p className="text-3xl font-black text-gradient">{match.scoreB || 0}<span className="text-lg text-gray-400">/{match.wicketsB || 0}</span></p>
              <p className="text-[10px] text-gray-500">({match.ballsB || 0} balls)</p>
            </div>
          </div>
          <div className="flex justify-around text-[10px] text-gray-500 border-t border-white/5 pt-2">
            <span>Extras: <span className="text-orange-400">{match.extrasA || 0}/{match.extrasB || 0}</span></span>
            <span>4s: <span className="text-emerald-400">{match.boundariesA || 0}/{match.boundariesB || 0}</span></span>
            <span>6s: <span className="text-neon-green">{match.battingStatsA?.reduce((a, s) => a + (s.sixes || 0), 0) || 0}/{match.battingStatsB?.reduce((a, s) => a + (s.sixes || 0), 0) || 0}</span></span>
          </div>
        </div>

        {/* Tabs: Batting | Bowling */}
        <div className="flex bg-white/5 rounded-2xl p-1">
          {['batting', 'bowling', 'awards'].map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all capitalize ${activeTab === tab ? 'bg-neon-green text-black' : 'text-gray-400'}`}>
              {tab === 'batting' ? '🦇 Batting' : tab === 'bowling' ? '🎯 Bowling' : '🏅 Awards'}
            </button>
          ))}
        </div>

        {activeTab === 'batting' && (
          <div className="space-y-3">
            <BattingCard stats={match.battingStatsA} teamName={match.teamA} currentBatsman={match.currentBatsman} extras={match.extrasA} />
            <BattingCard stats={match.battingStatsB} teamName={match.teamB} currentBatsman={null} extras={match.extrasB} />
          </div>
        )}

        {activeTab === 'bowling' && (
          <div className="space-y-3">
            <BowlingCard stats={bowlingStatsA.length > 0 ? bowlingStatsA : []} teamName={`${match.teamA} - Bowling`} balls={match.ballsB} />
            <BowlingCard stats={bowlingStatsB.length > 0 ? bowlingStatsB : []} teamName={`${match.teamB} - Bowling`} balls={match.ballsA} />
          </div>
        )}

        {activeTab === 'awards' && (
          <div className="space-y-3">
            {/* MOTM */}
            <div className="card-glass p-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <span className="text-2xl">👑</span>
                <div>
                  <p className="font-bold text-sm">Player of the Match</p>
                  <p className="text-xs text-gray-400">{motm}</p>
                </div>
              </div>
            </div>
            {/* Chaos Player */}
            {chaosPlayer && (
              <div className="card-glass p-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <span className="text-2xl">🤪</span>
                  <div>
                    <p className="font-bold text-sm">Most Chaos Player</p>
                    <p className="text-xs text-gray-400">{chaosPlayer}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Match Info */}
            <div className="card-glass p-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-gray-500">Ground</p>
                  <p className="font-bold mt-0.5">{match.ground || 'Gully Ground'}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 cursor-pointer" onClick={handleDateEdit}>
                  <p className="text-gray-500">Date {editingDate ? '(tap to save)' : '(tap to edit)'}</p>
                  {editingDate ? (
                    <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
                      onBlur={handleDateEdit} autoFocus
                      className="w-full bg-transparent text-white font-bold mt-0.5 text-xs outline-none" />
                  ) : (
                    <p className="font-bold mt-0.5">{new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-gray-500">Toss</p>
                  <p className="font-bold mt-0.5">{match.tossWinner || '-'} ({match.tossChoice || '-'})</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <p className="text-gray-500">Nickname</p>
                  <p className="font-bold mt-0.5 truncate">{nickname}</p>
                </div>
              </div>
            </div>
            {/* Rules Used */}
            {match.rules && (
              <div className="card-glass p-4">
                <h3 className="font-bold text-xs mb-2">⚙️ Rules</h3>
                <div className="flex flex-wrap gap-1">
                  {[
                    match.rules.lastManStanding && '🏃 Last Man',
                    match.rules.jokerEnabled && `🎭 Joker${match.jokerName ? ` (${match.jokerName})` : ''}`,
                    match.rules.directSixOut && '🚀 Six=Out',
                    match.rules.oneTipOneHand && '✋ One-tip',
                    match.rules.noBallTwoRuns && '⛔ NB=2',
                    match.rules.twoBounceRetire && '🔄 2-Bounce',
                    match.rules.rebattingAllowed && '🔄 Re-bat',
                    match.rules.maxBalls !== 6 && `${match.rules.maxBalls}/over`,
                  ].filter(Boolean).map((tag, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-white/5 text-[10px] text-gray-300 border border-white/10">{tag}</span>
                  ))}
                  {!match.rules.lastManStanding && !match.rules.jokerEnabled && !match.rules.directSixOut && !match.rules.oneTipOneHand && !match.rules.noBallTwoRuns && !match.rules.twoBounceRetire && !match.rules.rebattingAllowed && (match.rules.maxBalls === 6 || !match.rules.maxBalls) && (
                    <span className="px-2 py-1 rounded-lg bg-white/5 text-[10px] text-gray-500 italic">Standard rules</span>
                  )}
                </div>
              </div>
            )}
            {/* Timeline */}
            <div className="card-glass p-4">
              <h3 className="font-bold text-xs mb-3">📊 Ball-by-Ball</h3>
              <div className="flex flex-wrap gap-1.5">
                {ballHistory.length === 0 ? <p className="text-gray-600 text-xs italic">No data</p> : (
                  ballHistory.map((ball, i) => (
                    <div key={i}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border text-xs"
                      style={{
                        background: ball.label === '6' ? '#39FF1420' : ball.label === '4' ? '#10B98120' : ball.label === 'W' ? '#FFD70020' : '#ffffff10',
                        color: ball.label === '6' ? '#39FF14' : ball.label === '4' ? '#10B981' : ball.label === 'W' ? '#FFD700' : '#fff',
                      }}>
                      {ball.label}
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Commentary */}
            <div className="card-glass p-4 text-center">
              <p className="text-sm font-bold text-gradient">{getRandomLine('celebration') || '🎉'}</p>
              <p className="text-xs text-gray-400 mt-1">{getRandomLine('hype') || '🔥'}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={shareScorecard}
            className="flex-1 py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white active:scale-[0.97] transition-all shadow-lg shadow-blue-500/20">
            📤 Share
          </button>
          <button onClick={() => onNavigate('create', { rematchData: { teamA: match.teamA, teamB: match.teamB, playersA: match.playersA, playersB: match.playersB, ground: match.ground, rules: match.rules, matchType: match.matchType, groupId: match.groupId, jokerName: match.jokerName } })}
            className="flex-1 py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-neon-green to-emerald-500 text-black active:scale-[0.97] transition-all shadow-lg shadow-neon-green/20">
            🔄 Rematch
          </button>
          <button onClick={handleExportImage}
            className="px-4 py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white active:scale-[0.97] transition-all shadow-lg shadow-cyan-500/20">
            📷
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowGroupPicker(true)}
            className="flex-1 py-3.5 rounded-2xl font-bold text-xs bg-gradient-to-r from-purple-600 to-pink-600 text-white active:scale-[0.97] transition-all shadow-lg shadow-purple-500/20">
            ⊞ Save to Group
          </button>
          <button onClick={() => { if (confirm('Delete this match?')) { deleteMatch(match.id); onNavigate('home') } }}
            className="flex-1 py-3.5 rounded-2xl font-bold text-xs bg-red-500/15 text-red-400 border border-red-500/30 active:scale-[0.97] transition-all">
            🗑️ Delete
          </button>
        </div>

        </div>{/* end scorecardRef */}

        <div className="h-8" />
      </div>
    </div>
  )
}
