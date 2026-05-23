import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMatch } from '../context/MatchContext'
import { useTheme } from '../context/ThemeContext'
import { getRandomNickname } from '../utils/commentary'

export default function HomeScreen({ onNavigate }) {
  const { user } = useAuth()
  const { matches, liveMatch, resumeMatch, deleteMatch } = useMatch()
  const { theme, toggleTheme } = useTheme()
  const [showMenu, setShowMenu] = useState(false)

  const recentMatches = matches.filter(m => m.status === 'completed').slice(0, 15)

  const handleResume = (id) => { resumeMatch(id); onNavigate('live') }
  const handleDelete = (id) => { if (confirm('Delete this match?')) deleteMatch(id) }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-zinc-800/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl opacity-80">◈</span>
          <div>
            <h1 className="text-base font-black tracking-tight">
              <span className="bg-gradient-to-r from-neon-green via-emerald-400 to-neon-blue bg-clip-text text-transparent">Gully Cricket</span>
            </h1>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)}
            className="w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform border border-zinc-700/50">
            {user?.name?.[0]?.toUpperCase() || '◉'}
          </button>
          {showMenu && (
            <div className="absolute right-0 top-12 w-56 rounded-2xl border border-zinc-800 p-2 z-50 animate-fade-up shadow-2xl" style={{ background: 'rgba(10,10,26,0.98)', backdropFilter: 'blur(20px)' }}>
              <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800 mb-1">
                {user?.name}{user?.isGuest ? ' · Guest' : ''}
              </div>
              <button onClick={() => { toggleTheme(); setShowMenu(false) }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800/50 text-sm text-zinc-300 transition-colors flex items-center gap-2">
                  <span className="text-zinc-500">{theme === 'dark' ? '☀' : '☾'}</span> {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button onClick={() => { setShowMenu(false); onNavigate('profile') }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800/50 text-sm text-zinc-300 transition-colors flex items-center gap-2">
                  <span className="text-zinc-500">◉</span> Profile
                </button>
              <button onClick={() => { setShowMenu(false); onNavigate('groups') }}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800/50 text-sm text-zinc-300 transition-colors flex items-center gap-2">
                <span className="text-zinc-500">⊞</span> My Groups
              </button>
              <button onClick={() => { setShowMenu(false); onNavigate('rules') }}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800/50 text-sm text-zinc-300 transition-colors flex items-center gap-2">
                <span className="text-zinc-500">⚙</span> Gully Rules
              </button>
              <button onClick={() => { setShowMenu(false); onNavigate('collab') }}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800/50 text-sm text-zinc-300 transition-colors flex items-center gap-2">
                <span className="text-zinc-500">⌗</span> Join Match
              </button>
              <div className="border-t border-zinc-800 mt-1 pt-1">
                <button onClick={() => { setShowMenu(false); onNavigate('logout') }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-sm text-red-400 transition-colors flex items-center gap-2">
                  <span className="text-red-400/60">✕</span> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Live Match Resume */}
        {liveMatch && (
          <button onClick={() => handleResume(liveMatch.id)}
            className="w-full rounded-2xl p-4 text-left border border-emerald-500/30 animate-pulse-neon group"
            style={{ background: 'linear-gradient(135deg, rgba(5,50,30,0.4), rgba(10,10,26,0.9))' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
                  <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Live</span>
                </div>
                <p className="text-base font-bold text-zinc-100">{liveMatch.teamA} ⚡ {liveMatch.teamB}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black bg-gradient-to-r from-emerald-400 to-neon-green bg-clip-text text-transparent">
                  {liveMatch.scoreA || 0}<span className="text-zinc-500 text-base">/{liveMatch.wicketsA || 0}</span>
                </p>
                <p className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">tap to resume ›</p>
              </div>
            </div>
          </button>
        )}

        {/* Guest -> Signup Banner */}
        {user?.isGuest && (
          <div className="rounded-2xl p-4 border border-orange-500/20 animate-fade-up cursor-pointer group"
            style={{ background: 'linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,100,0,0.03))' }}
            onClick={() => onNavigate('signup')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-lg shrink-0">💾</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-orange-300 group-hover:text-orange-200 transition-colors">Save your progress</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Create a free account — your stats, groups & matches stay forever</p>
              </div>
              <span className="text-orange-400 text-lg group-hover:translate-x-1 transition-transform">›</span>
            </div>
          </div>
        )}

        {/* Primary Actions */}
        <div className="flex gap-3">
          <button onClick={() => onNavigate('create')}
            className="flex-1 py-5 rounded-2xl font-bold text-base bg-gradient-to-r from-emerald-500 to-neon-green text-black shadow-lg shadow-emerald-500/20 active:scale-[0.97] transition-all">
            ◈ New Match
          </button>
          <button onClick={() => onNavigate('groups')}
            className="flex-1 py-5 rounded-2xl font-bold text-base bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20 active:scale-[0.97] transition-all">
            ⊞ Groups
          </button>
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl p-4 border border-zinc-800/50" style={{ background: 'rgba(17,17,34,0.6)' }}>
          <div className="flex items-center gap-4 justify-around text-center">
            <div>
              <p className="text-2xl font-black bg-gradient-to-br from-zinc-200 to-zinc-400 bg-clip-text text-transparent">{recentMatches.length}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-0.5">Played</p>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div>
              <p className="text-2xl font-black bg-gradient-to-br from-emerald-400 to-neon-green bg-clip-text text-transparent">
                {matches.filter(m => m.status === 'completed' && m.winner).length}
              </p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-0.5">Won</p>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div>
              <p className="text-2xl font-black bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent">⌘</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-0.5">Gully</p>
            </div>
          </div>
        </div>

        {/* Recent Matches */}
        <div>
          <h2 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-[0.15em] flex items-center gap-2">
            <span className="w-1 h-3 rounded-full bg-gradient-to-b from-zinc-400 to-zinc-600" />
            Recent Matches
          </h2>
          {recentMatches.length === 0 ? (
            <div className="rounded-2xl p-8 text-center border border-zinc-800/30" style={{ background: 'rgba(17,17,34,0.4)' }}>
              <div className="text-3xl mb-3 opacity-20">◈</div>
              <p className="text-zinc-500 text-sm font-medium">No matches yet</p>
              <p className="text-zinc-600 text-xs mt-1">Create your first match to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map(match => (
                <div key={match.id}
                  className="rounded-2xl p-4 border border-zinc-800/30 flex items-center justify-between group transition-all hover:border-zinc-700/50"
                  style={{ background: 'rgba(17,17,34,0.5)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-zinc-200 truncate">{match.teamA} <span className="text-zinc-600 font-light">vs</span> {match.teamB}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-bold text-emerald-400">{match.scoreA}/{match.wicketsA}</span>
                      <span className="text-zinc-700 text-[10px]">–</span>
                      <span className="text-xs font-bold text-orange-400">{match.scoreB}/{match.wicketsB}</span>
                      {match.winner && <span className="text-[9px] text-zinc-600">· ◉ {match.winner}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <button onClick={() => onNavigate('summary', match.id)}
                      className="px-4 py-2 rounded-xl bg-zinc-800/80 text-zinc-300 text-xs font-medium active:scale-90 transition-all hover:bg-zinc-700/80">
                      View
                    </button>
                    <button onClick={() => handleDelete(match.id)}
                      className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium active:scale-90 transition-all opacity-30 hover:opacity-100">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="h-20" />
    </div>
  )
}
