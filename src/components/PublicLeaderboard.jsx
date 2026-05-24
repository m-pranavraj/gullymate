import { useState, useEffect, useMemo } from 'react'
import { getSupabase } from '../lib/supabase'

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

export default function PublicLeaderboard({ shareCode, onBack }) {
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeStatTab, setActiveStatTab] = useState('batting')
  const [sortBy, setSortBy] = useState('runs')

  useEffect(() => {
    if (!shareCode) { setError('No share code provided'); setLoading(false); return }
    const load = async () => {
      const sb = getSupabase()
      if (!sb) { setError('Database not configured'); setLoading(false); return }
      try {
        const { data, error } = await sb
          .from('groups')
          .select('name, share_code, snapshot')
          .eq('share_code', shareCode.toUpperCase())
          .maybeSingle()
        if (error) throw error
        if (!data) { setError('Group not found'); setLoading(false); return }
        const snapshot = data.snapshot || {}
        setGroup({
          name: data.name,
          shareCode: data.share_code,
          players: snapshot.players || [],
          matches: snapshot.matches || [],
        })
      } catch (e) {
        console.warn('Public leaderboard load error:', e)
        setError('Failed to load leaderboard. Try again later.')
      }
      setLoading(false)
    }
    load()
  }, [shareCode])

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

  const sortedPlayers = useMemo(() => sortPlayers(group?.players || [], activeStatTab, sortBy), [group?.players, activeStatTab, sortBy])

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

  const totalRuns = (group?.players || []).reduce((a, p) => a + (p.stats.runs || 0), 0)
  const totalWickets = (group?.players || []).reduce((a, p) => a + (p.stats.wickets || 0), 0)

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      {loading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-neon-green" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-5xl mb-4 opacity-30">◈</div>
          <p className="text-gray-400 mb-2 font-medium">{error}</p>
          <p className="text-zinc-600 text-xs mb-6">Check the code and try again</p>
          <button onClick={onBack}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-neon-green to-emerald-500 text-black font-bold shadow-lg shadow-neon-green/20 active:scale-95 transition-all">
            ← Back
          </button>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="text-xl hover:scale-110 transition-all">‹</button>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-zinc-100 truncate">{group.name}</h1>
                <p className="text-[10px] text-gray-500 flex items-center gap-2">
                  <span>✦ {group.players.length} players</span>
                  <span>◇ {group.matches.length} matches</span>
                  <span className="text-blue-400">Public Leaderboard</span>
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl p-4 border border-zinc-800/30 text-center" style={{ background: 'rgba(17,17,34,0.6)' }}>
                <p className="text-2xl font-black text-white">{group.players.length}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Players</p>
              </div>
              <div className="rounded-2xl p-4 border border-zinc-800/30 text-center" style={{ background: 'rgba(17,17,34,0.6)' }}>
                <p className="text-2xl font-black text-emerald-400">{totalRuns}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Total Runs</p>
              </div>
              <div className="rounded-2xl p-4 border border-zinc-800/30 text-center" style={{ background: 'rgba(17,17,34,0.6)' }}>
                <p className="text-2xl font-black text-red-400">{totalWickets}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Wickets</p>
              </div>
            </div>

            <div className="flex gap-2">
              {Object.entries(STAT_CATEGORIES).map(([key, cat]) => (
                <button key={key} onClick={() => { setActiveStatTab(key); setSortBy(cat[0].key) }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all ${activeStatTab === key ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20' : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/30'}`}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {currentCat.map(rule => (
                <button key={rule.key} onClick={() => setSortBy(rule.key)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-all ${sortBy === rule.key ? 'bg-zinc-700 text-white' : 'bg-zinc-800/50 text-zinc-500'}`}>
                  {rule.label} {sortBy === rule.key ? (rule.sort === 'desc' ? '↓' : '↑') : ''}
                </button>
              ))}
            </div>

            <div className="rounded-2xl overflow-hidden border border-zinc-800/30" style={{ background: 'rgba(17,17,34,0.5)' }}>
              {sortedPlayers.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-zinc-500 text-sm">No players yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 border-b border-zinc-800/50">
                        <th className="px-3 py-2.5 w-8">#</th>
                        <th className="px-2 py-2.5">Player</th>
                        <th className="px-2 py-2.5 text-right">M</th>
                        {currentCat.map(rule => (
                          <th key={rule.key} className="px-2 py-2.5 text-right">{rule.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((player, i) => (
                        <tr key={player.name}
                          className="border-b border-zinc-800/20 hover:bg-white/5 transition-colors">
                          <td className="px-3 py-2.5 text-xs text-zinc-600 font-mono">{i + 1}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                                {player.name[0]?.toUpperCase() || '?'}
                              </span>
                              <span className="text-xs font-medium text-zinc-200 truncate max-w-[100px]">{player.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-zinc-400 text-right">{player.stats.matches || 0}</td>
                          {currentCat.map(rule => (
                            <td key={rule.key} className="px-2 py-2.5 text-xs text-zinc-200 text-right font-mono">
                              {getStatValue(player, rule.key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {group.matches.length > 0 && (
              <div className="rounded-2xl p-4 border border-zinc-800/30" style={{ background: 'rgba(17,17,34,0.5)' }}>
                <h3 className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-400" />
                  Recent Matches
                </h3>
                <div className="space-y-2">
                  {group.matches.slice(0, 10).map((m, i) => (
                    <div key={m.id || i} className="flex items-center justify-between text-xs py-2 border-b border-zinc-800/20 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-zinc-300 font-medium">{m.teamA}</span>
                        <span className="text-zinc-600 mx-1">vs</span>
                        <span className="text-zinc-300 font-medium">{m.teamB}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-zinc-200">{m.scoreA}/{m.wicketsA}</span>
                        <span className="text-zinc-600 mx-1">-</span>
                        <span className="text-zinc-200">{m.scoreB}/{m.wicketsB}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center pb-4">
              <p className="text-[9px] text-zinc-600">Made with Gully Cricket OS</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}