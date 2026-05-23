import { useState } from 'react'
import { useMatch } from '../context/MatchContext'
import { useAuth } from '../context/AuthContext'
import { generateShareCode } from '../utils/matchUtils'

export default function CollaborativeAccess({ onBack }) {
  const { user } = useAuth()
  const { matches, liveMatch, joinMatch, addActivity, activities } = useMatch()
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [copied, setCopied] = useState(null)
  const [viewActivity, setViewActivity] = useState(false)
  const [activeTab, setActiveTab] = useState('join')

  const allMatches = matches.filter(m => m.shareCode)
  const completedMatches = allMatches.filter(m => m.status === 'completed')
  const liveMatches = allMatches.filter(m => m.status === 'live')
  const recentActivities = activities.slice(0, 50)

  const handleCopy = (code, matchId) => {
    navigator.clipboard.writeText(code)
    setCopied(matchId)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleJoin = () => {
    setJoinError('')
    if (!joinCode.trim()) { setJoinError('Enter a match code'); return }
    const match = joinMatch(joinCode.trim().toUpperCase())
    if (!match) { setJoinError('Invalid code or match not found') }
    else {
      setJoinError('Joined! Match is now active.')
      addActivity(user?.name || 'Guest', 'joined match via code')
      setTimeout(() => setJoinError(''), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-zinc-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-xl hover:scale-110 transition-transform">‹</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-zinc-100">⌗ Collaborate</h1>
          <p className="text-[10px] text-zinc-500">Share & join matches in real-time</p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Tabs */}
        <div className="flex bg-zinc-800/50 rounded-2xl p-1 border border-zinc-700/50">
          {[
            { key: 'join', icon: '⌗', label: 'Join Match' },
            { key: 'share', icon: '◈', label: 'My Codes' },
            { key: 'activity', icon: '◇', label: 'Activity' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.key ? 'bg-zinc-700 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Join Match Tab */}
        {activeTab === 'join' && (
          <div className="rounded-2xl p-5 border border-zinc-800/50 animate-fade-up" style={{ background: 'rgba(17,17,34,0.6)' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-neon-blue to-cyan-400" />
              <h2 className="font-bold text-sm text-zinc-200">Join a Match</h2>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="Enter 6-digit code"
                value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
                className="flex-1 px-5 py-4 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-lg tracking-[0.3em] font-bold text-center outline-none focus:border-neon-blue/50 transition-all uppercase" />
              <button onClick={handleJoin}
                className="px-6 py-4 rounded-xl bg-gradient-to-r from-neon-blue to-cyan-500 text-black font-bold text-sm active:scale-90 transition-all shadow-lg shadow-neon-blue/20">
                Join
              </button>
            </div>
            {joinError && (
              <p className={`text-xs mt-3 text-center font-medium ${joinError.includes('Joined') ? 'text-neon-green' : 'text-red-400'}`}>
                {joinError}
              </p>
            )}
            {liveMatches.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2">Active Matches</p>
                <div className="space-y-1.5">
                  {liveMatches.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-200 truncate">{m.teamA} ⚡ {m.teamB}</p>
                        <p className="text-[9px] text-emerald-400 mt-0.5">● Live · Code: {m.shareCode}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share Codes Tab */}
        {activeTab === 'share' && (
          <div className="space-y-3 animate-fade-up">
            {allMatches.length === 0 ? (
              <div className="rounded-2xl p-10 text-center border border-zinc-800/30 animate-fade-up" style={{ background: 'rgba(17,17,34,0.5)' }}>
                <div className="text-4xl mb-3 opacity-20">⌗</div>
                <p className="text-zinc-400 font-bold text-sm">No matches yet</p>
                <p className="text-zinc-600 text-xs mt-1">Create a match to get a share code!</p>
              </div>
            ) : (
              <>
                {/* Live matches */}
                {liveMatches.length > 0 && (
                  <div>
                    <h3 className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 rounded-full bg-emerald-400" />
                      Live Matches
                    </h3>
                    {liveMatches.map(m => (
                      <div key={m.id} className="rounded-2xl p-4 border border-emerald-500/20 mb-2 animate-fade-up" style={{ background: 'rgba(5,50,30,0.3)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-zinc-200 truncate">{m.teamA} vs {m.teamB}</p>
                            <p className="text-[10px] text-zinc-500">{m.ground || 'Gully Ground'}</p>
                          </div>
                          <span className="text-[9px] text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10 shrink-0 ml-2">● LIVE</span>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-900/50 rounded-xl px-4 py-3 border border-zinc-800">
                          <code className="flex-1 text-lg font-black tracking-[0.3em] text-neon-green select-all">{m.shareCode}</code>
                          <button onClick={() => handleCopy(m.shareCode, m.id)}
                            className="px-4 py-2 rounded-lg bg-neon-green/20 text-neon-green text-xs font-bold active:scale-90 transition-all whitespace-nowrap">
                            {copied === m.id ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-1.5">Share this code so others can join as scorers</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed matches */}
                {completedMatches.length > 0 && (
                  <div>
                    <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-2 mt-3">
                      <span className="w-1 h-3 rounded-full bg-zinc-600" />
                      Completed Matches
                    </h3>
                    <div className="space-y-1.5">
                      {completedMatches.slice(0, 20).map(m => (
                        <div key={m.id} className="rounded-xl p-3 border border-zinc-800/30 flex items-center gap-3 animate-fade-up" style={{ background: 'rgba(17,17,34,0.4)' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-300 truncate">{m.teamA} vs {m.teamB}</p>
                            <p className="text-[9px] text-zinc-600">{m.scoreA}/{m.wicketsA} - {m.scoreB}/{m.wicketsB}</p>
                          </div>
                          <code className="text-xs font-bold tracking-wider text-zinc-400 select-all">{m.shareCode}</code>
                          <button onClick={() => handleCopy(m.shareCode, m.id)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-[9px] font-bold active:scale-90 transition-all whitespace-nowrap">
                            {copied === m.id ? '✓' : 'Copy'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="rounded-2xl p-4 border border-zinc-800/50 animate-fade-up" style={{ background: 'rgba(17,17,34,0.6)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-400 to-cyan-400" />
              <h2 className="font-bold text-xs text-zinc-300">Activity Log</h2>
              <span className="text-[9px] text-zinc-600">({recentActivities.length})</span>
            </div>
            <div className="space-y-0.5 max-h-96 overflow-y-auto">
              {recentActivities.length === 0 ? (
                <p className="text-zinc-600 text-xs italic py-4 text-center">No activity yet</p>
              ) : (
                recentActivities.map(a => (
                  <div key={a.id} className="flex items-start gap-2.5 py-2 border-b border-zinc-800/30 last:border-0">
                    <span className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-300">
                        <span className="text-cyan-400 font-medium">{a.user}</span>
                        <span className="text-zinc-500"> {a.action}</span>
                      </p>
                      <p className="text-[9px] text-zinc-600 mt-0.5">{new Date(a.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
