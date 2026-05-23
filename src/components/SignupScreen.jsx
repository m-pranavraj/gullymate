import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function SignupScreen({ onNavigate }) {
  const { signup, guestLogin } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return }
    setLoading(true)
    try { await signup(name.trim(), email.trim().toLowerCase(), password) }
    catch (err) { setError(err.message) }
    setLoading(false)
  }

  const handleGuest = async () => {
    setLoading(true)
    await guestLogin()
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 flex flex-col justify-center p-6">
      <div className="text-center mb-6 animate-fade-up">
        <div className="text-5xl mb-2">🏏</div>
        <h1 className="text-2xl sm:text-3xl font-black text-gradient">Create Your ID</h1>
        <p className="text-zinc-500 mt-1 text-sm">Save your gully cricket legacy</p>
      </div>

      {/* Tab: Login / Signup */}
      <div className="max-w-sm mx-auto w-full mb-6">
        <div className="flex bg-zinc-800/50 rounded-2xl p-1 border border-zinc-700/50">
          <button onClick={() => onNavigate('login')}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-300 transition-colors">Login</button>
          <button className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-zinc-700 text-white shadow-lg">Create Account</button>
        </div>
      </div>

      {/* Benefits */}
      <div className="max-w-sm mx-auto w-full mb-5 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: '💾', label: 'Save Progress' },
          { icon: '⊞', label: 'Private Groups' },
          { icon: '📊', label: 'Full Stats' },
        ].map(b => (
          <div key={b.label} className="rounded-xl p-2.5 bg-emerald-500/5 border border-emerald-500/10">
            <p className="text-lg">{b.icon}</p>
            <p className="text-[8px] text-emerald-400 font-medium mt-0.5 leading-tight">{b.label}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSignup} className="space-y-3 max-w-sm mx-auto w-full">
        <input type="text" placeholder="Your Name" value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-base outline-none focus:border-neon-green/50 transition-all" />
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-base outline-none focus:border-neon-green/50 transition-all" />
        <input type="password" placeholder="Password (min 4 chars)" value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-base outline-none focus:border-neon-green/50 transition-all" />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-2xl text-sm text-center animate-fade-up">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-neon-green to-emerald-500 text-black disabled:opacity-50 active:scale-[0.97] transition-all shadow-lg shadow-neon-green/20">
          {loading ? 'Creating...' : '⊞ Create Account'}
        </button>
      </form>

      <div className="relative max-w-sm mx-auto w-full my-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
        <div className="relative flex justify-center"><span className="px-4 text-xs text-zinc-600 bg-pitch-dark">or continue without account</span></div>
      </div>

      <div className="max-w-sm mx-auto w-full">
        <button onClick={handleGuest} disabled={loading}
          className="w-full py-3.5 rounded-2xl font-bold text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 active:scale-[0.97] transition-all">
          Skip - Guest Mode
        </button>
        <p className="text-[9px] text-zinc-600 text-center mt-2">⚠️ Guest data is temporary and will be lost if you clear browser cache</p>
      </div>

      <div className="mt-6 text-center">
        <button onClick={() => onNavigate('login')}
          className="text-neon-blue hover:text-neon-green transition-colors text-sm font-medium">
          Already have an account? Login
        </button>
      </div>
    </div>
  )
}
