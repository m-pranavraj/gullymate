import { useState, useEffect } from 'react'
import { useMatch } from '../context/MatchContext'
import { defaultRules } from '../utils/matchUtils'

export default function GullyRules({ onBack }) {
  const { rules, saveRules } = useMatch()
  const [localRules, setLocalRules] = useState(rules || defaultRules)
  const [saved, setSaved] = useState(false)

  const toggle = (key) => {
    setLocalRules(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  const setValue = (key, value) => {
    setLocalRules(prev => ({ ...prev, [key]: Number(value) }))
    setSaved(false)
  }

  const handleSave = () => {
    saveRules(localRules)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const resetRules = () => {
    setLocalRules(defaultRules)
    setSaved(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-pitch-dark to-blue-950 pb-8">
      <div className="sticky top-0 z-50 bg-pitch-dark/95 backdrop-blur-lg border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-2xl">←</button>
        <h1 className="text-lg font-bold">Gully Rules</h1>
      </div>

      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {/* Basic Settings */}
        <div className="card-glass p-4">
          <h2 className="font-bold text-neon-green mb-3">Basic Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Balls per over</span>
              <div className="flex gap-2">
                {[3, 4, 5, 6, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setValue('maxBalls', n)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      localRules.maxBalls === n
                        ? 'bg-neon-green text-black'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Toggle Rules */}
        <div className="card-glass p-4">
          <h2 className="font-bold text-neon-blue mb-3">Street Cricket Rules</h2>
          <div className="space-y-1">
            {[
              { key: 'ballBased', label: 'Ball-based tracking', desc: 'Track by balls not overs' },
              { key: 'overMode', label: 'Over mode', desc: 'Traditional over-based tracking' },
              { key: 'jokerEnabled', label: 'Joker player', desc: 'One designated joker player' },
              { key: 'jokerDoubleRuns', label: 'Joker double runs', desc: 'Joker runs count double' },
              { key: 'lastManStanding', label: 'Last man standing', desc: 'Last player bats alone' },
              { key: 'rebattingAllowed', label: 'Re-batting', desc: 'Batsmen can bat again' },
              { key: 'oneTipOneHand', label: 'One-tip one-hand', desc: 'Catch with one hand after one tip = out' },
              { key: 'directSixOut', label: 'Direct six = out', desc: 'Hit six directly = you\'re out' },
              { key: 'noBallTwoRuns', label: 'No ball = 2 runs', desc: 'No ball gives 2 runs + free hit' },
              { key: 'twoBounceRetire', label: 'Two bounce retire', desc: 'Retire after 2 bounce catches' },
            ].map(rule => (
              <div
                key={rule.key}
                className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
              >
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium">{rule.label}</p>
                  <p className="text-xs text-gray-500">{rule.desc}</p>
                </div>
                <button
                  onClick={() => toggle(rule.key)}
                  className={`w-14 h-8 rounded-full transition-all ${
                    localRules[rule.key] ? 'bg-neon-green' : 'bg-white/20'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white shadow-lg transition-transform ${
                    localRules[rule.key] ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={resetRules}
            className="flex-1 py-4 rounded-2xl font-bold text-base border-2 border-white/10 text-gray-300 active:scale-[0.98] transition-all"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-neon-green to-emerald-500 text-black neon-glow active:scale-[0.98] transition-all"
          >
            {saved ? '✅ Saved!' : 'Save Rules'}
          </button>
        </div>

        {/* Quick Presets */}
        <div className="card-glass p-4">
          <h2 className="font-bold text-orange-400 mb-3">Quick Presets</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Standard', rules: defaultRules },
              { label: 'Tape Ball', rules: { ...defaultRules, maxBalls: 8, ballBased: true } },
              { label: 'Terrace', rules: { ...defaultRules, maxBalls: 4, directSixOut: true } },
              { label: 'College', rules: { ...defaultRules, lastManStanding: true, jokerDoubleRuns: true } },
              { label: 'Night Match', rules: { ...defaultRules, noBallTwoRuns: true } },
              { label: 'Chaos Mode', rules: { ...defaultRules, oneTipOneHand: true, directSixOut: true, jokerDoubleRuns: true, twoBounceRetire: true } },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  setLocalRules(preset.rules)
                  setSaved(false)
                }}
                className="px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium active:scale-95 transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  )
}
