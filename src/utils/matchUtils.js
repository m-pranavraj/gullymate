export const RUNS = [0, 1, 2, 3, 4, 6]

export function createBall(runs, type = 'normal') {
  const ball = { type, runs, timestamp: Date.now() }
  if (type === 'wide') ball.runs = runs + 1
  else if (type === 'noball') ball.runs = runs + 1
  if (type === 'wicket') { ball.runs = 0; ball.isWicket = true }
  return ball
}

export function isOverComplete(balls, maxBalls) {
  const legalBalls = balls.filter(b => b.type !== 'wide' && b.type !== 'noball')
  return legalBalls.length >= maxBalls
}

export function calculateExtras(balls) {
  return balls.filter(b => b.type === 'wide' || b.type === 'noball').length
}

export function countBoundaries(balls) {
  return balls.filter(b => b.runs >= 4 && (b.type === 'normal' || b.type === 'noball')).length
}

export function getBattingOrder(batters, currentIndex) {
  return batters.map((b, i) => ({
    ...b,
    status: i === 0 ? 'batting' : i < currentIndex ? 'out' : 'yetToBat'
  }))
}

export function selectMOTM(team, battingStats) {
  let bestPlayer = null, bestScore = -1
  battingStats.forEach((s) => {
    const total = s.runs * 2 + (s.boundaries || 0) * 2 - s.balls * 0.5
    if (total > bestScore) {
      bestScore = total
      bestPlayer = s.name || 'Unknown'
    }
  })
  return bestPlayer
}

export function getMostChaosPlayer(players, ballEvents) {
  let chaosScores = {}
  ballEvents.forEach(ball => {
    if (ball.runs === 6) {
      const p = ball.batsman || 'Unknown'
      chaosScores[p] = (chaosScores[p] || 0) + 3
    }
    if (ball.isWicket) {
      const p = ball.bowler || 'Unknown'
      chaosScores[p] = (chaosScores[p] || 0) + 2
    }
  })
  let maxChaos = -1, chaosPlayer = 'Unknown'
  Object.entries(chaosScores).forEach(([p, s]) => {
    if (s > maxChaos) { maxChaos = s; chaosPlayer = p }
  })
  return maxChaos > 0 ? chaosPlayer : null
}

export function getEndingMessage(winner, margin) {
  const msgs = {
    close: [
      'Thrilling finish! Nail-biter till the end!',
      'What a match! Could\'ve gone either way!',
      'Edge of the seat stuff! Brilliant game!',
    ],
    dominant: [
      'Complete domination! No contest today!',
      'Absolutely crushed it! Total boss move!',
      'Schooled! That was a masterclass!',
    ],
    default: [
      'Match over! Great game everyone!',
      'That\'s it! Wonderful gully cricket!',
      'And the crowd goes wild! What a match!',
    ]
  }
  const category = margin < 5 ? 'close' : margin > 20 ? 'dominant' : 'default'
  const list = msgs[category]
  return list[Math.floor(Math.random() * list.length)]
}

export function generateShareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export const defaultRules = {
  maxBalls: 6,
  inningsPerTeam: 1,
  jokerEnabled: false,
  jokerMultiplier: 2,
  lastManStanding: false,
  rebattingAllowed: false,
  ballBased: true,
  overMode: false,
  oneTipOneHand: false,
  directSixOut: false,
  jokerDoubleRuns: false,
  twoBounceRetire: false,
  noBallTwoRuns: false,
  totalOvers: 0,
  singleBatsman: true,
}
