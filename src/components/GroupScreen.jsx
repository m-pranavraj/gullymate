import { useState, useRef, useCallback } from 'react'
import { useGroups } from '../context/GroupContext'
import { useAuth } from '../context/AuthContext'

export default function GroupScreen({ onNavigate }) {
  const { groups, createGroup, deleteGroup, setActiveGroupById } = useGroups()
  const { user } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const voiceRef = useRef(null)

  const handleVoiceCreate = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Voice not supported'); return }
    if (voiceListening) { voiceRef.current?.stop(); setVoiceListening(false); return }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'; recognition.interimResults = true; recognition.continuous = false
    voiceRef.current = recognition
    setVoiceListening(true); setVoiceTranscript('')

    recognition.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript
      setVoiceTranscript(text)
      if (!event.results[0].isFinal) return
      recognition.stop(); setVoiceListening(false)
      if (text.trim()) { setGroupName(text.trim()); setShowCreate(true) }
    }
    recognition.onerror = () => setVoiceListening(false)
    recognition.onend = () => setVoiceListening(false)
    recognition.start()
  }, [voiceListening])

  const handleCreate = () => {
    if (!groupName.trim()) { setError('Enter a group name'); return }
    createGroup(groupName.trim())
    setGroupName(''); setShowCreate(false); setError('')
  }

  const handleOpenGroup = (id) => {
    setActiveGroupById(id)
    onNavigate('groupDashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0d0d25] to-blue-950 pb-8">
      <div className="sticky top-0 z-50 bg-pitch-dark/90 backdrop-blur-xl border-b border-zinc-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => onNavigate('home')} className="text-xl hover:scale-110 transition-transform">‹</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-zinc-100">⊞ Groups</h1>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs active:scale-90 transition-all shadow-lg shadow-purple-500/20">
          ＋ Create
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Create Form */}
        {showCreate && (
          <div className="rounded-2xl p-4 border border-purple-500/20 animate-fade-up" style={{ background: 'rgba(88,28,135,0.15)' }}>
            <h2 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-pink-400" />
              New Private Group
            </h2>
            <div className="flex gap-2">
              <input type="text" placeholder="Enter group name"
                value={groupName} onChange={e => setGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 text-sm outline-none focus:border-purple-500/50 transition-colors" />
              <button onClick={handleVoiceCreate}
                className={`px-3 py-3 rounded-xl font-bold text-sm active:scale-90 transition-all ${voiceListening ? 'bg-neon-green text-black animate-pulse' : 'bg-zinc-700 text-white'}`}>🎤</button>
              <button onClick={handleCreate}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm active:scale-90 transition-all shadow-lg">Create</button>
            </div>
            {voiceTranscript && <p className="text-[10px] text-zinc-500 mt-1 italic">"{voiceTranscript}"</p>}
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        )}

        {/* Guest Signup Wall */}
        {user?.isGuest ? (
          <div className="rounded-2xl p-8 text-center border border-zinc-800/30 animate-fade-up" style={{ background: 'rgba(17,17,34,0.5)' }}>
            <div className="text-5xl mb-4 opacity-30">⊞</div>
            <h2 className="text-xl font-bold text-zinc-200 mb-2">Groups Need an Account</h2>
            <p className="text-zinc-500 text-sm mb-6 max-w-xs mx-auto">Create a free account to save groups, track player stats, and never lose your data.</p>
            <button onClick={() => onNavigate('signup')}
              className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-base active:scale-95 transition-all shadow-lg shadow-purple-500/20 mb-3">
              ⊞ Create Free Account
            </button>
            <p className="text-[9px] text-zinc-600">Guest data is temporary and stored only on this device</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl p-10 text-center border border-zinc-800/30" style={{ background: 'rgba(17,17,34,0.5)' }}>
            <div className="text-4xl mb-4 opacity-20">⊞</div>
            <p className="text-zinc-400 font-bold text-base">No groups yet</p>
            <p className="text-zinc-600 text-sm mt-1">Create a private group to track stats!</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-6 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm active:scale-95 transition-all shadow-lg shadow-purple-500/20">
              ＋ Create Your First Group
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {groups.map(group => {
              const topScorer = group.players.length > 0
                ? [...group.players].sort((a, b) => b.stats.runs - a.stats.runs)[0]
                : null
              return (
                <div key={group.id}
                  onClick={() => handleOpenGroup(group.id)}
                  className="rounded-2xl p-4 border border-zinc-800/30 active:scale-[0.98] transition-all cursor-pointer hover:border-zinc-700/50 group"
                  style={{ background: 'rgba(17,17,34,0.6)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
                        <p className="font-bold text-sm text-zinc-200 truncate">{group.name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-600 mt-1.5 ml-4">
                        <span>✦ {group.players.length} players</span>
                        <span>◇ {group.matches.length} matches</span>
                        <span>{new Date(group.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      {topScorer && (
                        <p className="text-[10px] text-zinc-600 mt-1 ml-4">
                          Top · <span className="text-emerald-400 font-medium">{topScorer.name}</span>
                          <span className="text-zinc-600"> ({topScorer.stats.runs} runs)</span>
                        </p>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this group and all its data?')) deleteGroup(group.id) }}
                      className="text-zinc-600 hover:text-red-400 text-xs px-2 py-1 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
