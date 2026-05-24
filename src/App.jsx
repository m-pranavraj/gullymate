import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MatchProvider } from './context/MatchContext'
import { GroupProvider } from './context/GroupContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import LoginScreen from './components/LoginScreen'
import SignupScreen from './components/SignupScreen'
import HomeScreen from './components/HomeScreen'
import CreateMatchScreen from './components/CreateMatchScreen'
import LiveMatchScreen from './components/LiveMatchScreen'
import MatchSummaryScreen from './components/MatchSummaryScreen'
import GullyRules from './components/GullyRules'
import CollaborativeAccess from './components/CollaborativeAccess'
import GroupScreen from './components/GroupScreen'
import GroupDashboard from './components/GroupDashboard'
import PublicLeaderboard from './components/PublicLeaderboard'

function AppContent() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const parseHash = () => {
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('leaderboard/')) {
      return { screen: 'publicLeaderboard', params: { shareCode: hash.split('/')[1] } }
    }
    return null
  }

  const [screen, setScreen] = useState(() => {
    const deep = parseHash()
    if (deep) return deep.screen
    const savedUser = localStorage.getItem('gully_os_current_user')
    return savedUser ? 'home' : 'login'
  })
  const [params, setParams] = useState(() => {
    const deep = parseHash()
    if (deep) return deep.params
    return {}
  })

  // Listen for hash changes (e.g. pasting a leaderboard URL while app is open)
  useEffect(() => {
    const onHashChange = () => {
      const deep = parseHash()
      if (deep) { setScreen(deep.screen); setParams(deep.params) }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Don't override when viewing a public leaderboard
  useEffect(() => {
    if (screen === 'publicLeaderboard') return
    if (user) setScreen('home')
    else setScreen('login')
  }, [user])

  const navigate = (s, ...args) => {
    setScreen(s)
    if (args.length > 0) setParams({ matchId: args[0] })
    else setParams({})
  }

  const screens = {
    login: <LoginScreen onNavigate={navigate} />,
    signup: <SignupScreen onNavigate={navigate} />,
    home: <HomeScreen onNavigate={navigate} />,
    create: <CreateMatchScreen onNavigate={navigate} />,
    live: <LiveMatchScreen onNavigate={navigate} />,
    summary: <MatchSummaryScreen matchId={params.matchId} onNavigate={navigate} />,
    rules: <GullyRules onBack={() => navigate('home')} />,
    collab: <CollaborativeAccess onBack={() => navigate('home')} />,
    profile: <ProfileScreen onBack={() => navigate('home')} />,
    logout: <LogoutScreen onBack={() => navigate('login')} />,
    groups: <GroupScreen onNavigate={navigate} />,
    groupDashboard: <GroupDashboard onNavigate={navigate} />,
    publicLeaderboard: <PublicLeaderboard shareCode={params.shareCode} onBack={() => navigate(user ? 'home' : 'login')} />,
  }

  return screens[screen] || screens.home
}

function ProfileScreen({ onBack }) {
  const { user, logout, updateProfile, signup } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [showClaim, setShowClaim] = useState(false)
  const [claimEmail, setClaimEmail] = useState('')
  const [claimPassword, setClaimPassword] = useState('')
  const [claimError, setClaimError] = useState('')
  const [claiming, setClaiming] = useState(false)

  const handleSave = () => {
    if (name.trim()) { updateProfile({ name: name.trim() }); setEditing(false) }
  }

  const handleClaim = async (e) => {
    e.preventDefault()
    setClaimError('')
    if (!claimEmail.trim() || !claimPassword.trim()) { setClaimError('Fill in all fields'); return }
    if (claimPassword.length < 4) { setClaimError('Password min 4 chars'); return }
    setClaiming(true)
    try {
      await signup(user?.name || 'Player', claimEmail.trim().toLowerCase(), claimPassword)
      setShowClaim(false)
    } catch (err) { setClaimError(err.message) }
    setClaiming(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-pitch-dark to-blue-950 pb-8">
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-zinc-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-xl">‹</button>
        <h1 className="text-base font-bold text-zinc-100">◉ Profile</h1>
      </div>
      <div className="px-4 pt-8 max-w-sm mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neon-green to-neon-blue mx-auto flex items-center justify-center text-3xl font-black shadow-lg shadow-neon-green/20">
          {user?.name?.[0]?.toUpperCase() || '👤'}
        </div>

        {editing ? (
          <div className="space-y-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white text-center text-lg outline-none focus:border-neon-green/50" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm active:scale-95">Cancel</button>
              <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-neon-green text-black font-bold text-sm active:scale-95">Save</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xl font-bold text-zinc-100">{user?.name || 'Player'}</p>
            <p className="text-sm text-zinc-500">{user?.isGuest ? '👤 Guest Player' : user?.supabase ? '☁ Synced to cloud' : user?.email || '● Local account'}</p>
            <button onClick={() => setEditing(true)}
              className="px-6 py-3 rounded-xl bg-zinc-800/80 text-zinc-300 text-sm font-medium active:scale-90 transition-all border border-zinc-700/50">
              ✎ Edit Name
            </button>
          </>
        )}

        {/* Guest Claim Account */}
        {user?.isGuest && !showClaim && (
          <div className="rounded-2xl p-5 border border-orange-500/20 animate-fade-up" style={{ background: 'linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,100,0,0.03))' }}>
            <p className="text-sm font-bold text-orange-300 mb-1">💾 Save Your Data</p>
            <p className="text-[10px] text-zinc-500 mb-4">Create a free account to keep your stats, groups, and matches forever.</p>
            <button onClick={() => setShowClaim(true)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-orange-500 to-red-500 text-white active:scale-[0.97] transition-all shadow-lg shadow-orange-500/20">
              Create Free Account
            </button>
          </div>
        )}

        {showClaim && (
          <form onSubmit={handleClaim} className="rounded-2xl p-5 border border-neon-green/20 animate-fade-up" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.05), rgba(0,0,0,0.2))' }}>
            <p className="text-sm font-bold text-neon-green mb-3">⊞ Create Account (keeps all your data)</p>
            <div className="space-y-2">
              <input type="email" placeholder="Email" value={claimEmail} onChange={e => setClaimEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-sm outline-none focus:border-neon-green/50" />
              <input type="password" placeholder="Password (min 4 chars)" value={claimPassword} onChange={e => setClaimPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-sm outline-none focus:border-neon-green/50" />
              {claimError && <p className="text-red-400 text-xs">{claimError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowClaim(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm active:scale-95">Cancel</button>
                <button type="submit" disabled={claiming}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-neon-green to-emerald-500 text-black font-bold text-sm active:scale-95 disabled:opacity-50">
                  {claiming ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Cloud sync status */}
        {user?.supabase && (
          <div className="rounded-2xl p-4 border border-emerald-500/20" style={{ background: 'rgba(57,255,20,0.03)' }}>
            <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-2">
              <span>☁</span> Cloud sync enabled · Data saved across devices
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-zinc-800/50">
          <button onClick={logout}
            className="w-full py-4 rounded-2xl font-bold bg-red-500/10 text-red-400 border border-red-500/20 active:scale-[0.97] transition-all hover:bg-red-500/15">
            ✕ Logout
          </button>
        </div>
      </div>
    </div>
  )
}

function LogoutScreen({ onBack }) {
  const { logout } = useAuth()
  useEffect(() => { logout() }, [logout])
  useEffect(() => { onBack() }, [])
  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MatchProvider>
          <GroupProvider>
            <div className="min-h-screen bg-pitch-dark max-w-md mx-auto relative">
              <AppContent />
            </div>
          </GroupProvider>
        </MatchProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
