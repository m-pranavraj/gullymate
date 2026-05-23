export const funnyLines = {
  six: [
    'Absolute cinema! 🎬',
    'What a six into the next colony! 🏡',
    'Galli ka Baap! 👑',
    'Dhoni finishes off in style!',
    'Miyan bade dhingana hai! 🕺',
    'Chakka! Gend real mein gayab! 🎯',
    'Tera Baap aaya! 💪',
    'Street cricket legend! 🔥',
    'Bowling kar ke pachtayega! 😎',
    'SIX! Neighbors calling the police! 🚨',
  ],
  four: [
    'Shot! Beautifully timed! 👌',
    'Cheeky! 🐐',
    'Mast bro! 🤙',
    'Risky but effective! 😅',
    'Punjabi baazigar! 🏏',
    'Classy shot! 🧐',
    'Tape ball special! 📀',
  ],
  wicket: [
    'Bowled! Stumps flying! 🎯',
    'Howzaaaat! 🗣️',
    'Typical gully catch! 🧤',
    'Umpire ka favourite decision! ⚖️',
    'Andar aaya, bahar gaya! 🚪',
    'Saffron army on fire! 🔥',
  ],
  wide: [
    'Wide! Free run! 🆓',
    'Bowler ko gussa aa raha hai! 😤',
    'Pressure getting to him!',
  ],
  noBall: [
    'No ball! Free hit loading! 🚀',
    'Overstep! Bad idea! 🚶',
    'Free me run! 🆓',
  ],
  over: [
    'Over complete! Change ends! 🔄',
    'Time for strategic time out! ⏸️',
  ],
  matchStart: [
    'Match about to begin! Excitement level: 100 💯',
    'Gully ka kohli vs dhoni scene! 🔥',
    'Let the chaos begin! 🏏',
  ],
  celebration: [
    'What a win! 🏆',
    'Absolutely dominant! 👑',
    'Street cricket supremacy! 💪',
    'Gully champions! 🎉',
    'Mauka mauka! 🫵',
  ],
  hype: [
    'Pressure situation! 😰',
    'Crowd going wild! 🗣️',
    'Kya match hai bhai! 🔥',
    'Edge of the seat stuff! 💺',
    'Turning point loading! ⏳',
  ],
  manOfMatch: [
    'One-man army!',
    'Match winner!',
    'Gully ka Baap!',
    'Saurav Ganguly of the colony!',
    'Street cricket legend!',
  ],
  chaos: [
    'Most Chaos Player: runs kamao, wicket do, catch chhodo! 🤪',
    'Chaos ka king! Ek six, ek wicket, ek over-throw!',
    'Complete package: runs se lekar dropped catch tak!',
  ]
}

export const matchNicknames = [
  'The Gully Classic 🏏',
  'Colony Rivalry 🔥',
  'Terrace Trophy 🏆',
  'Street Fight ⚔️',
  'Tape Ball Wars 💥',
  'Neighborhood Derby 🏡',
  'Concrete Pitch Clash 🧱',
  'Mohalla Showdown 🫵',
  'Rooftop Rumble ☀️',
  'Turf Titans Collide 🌱',
  'The Chappal Chase 🩴',
  'Gully ka World Cup 🌍',
  'Tennis Ball Tussle 🎾',
  'Bhide ka Match 🏠',
]

export function getRandomLine(type) {
  const lines = funnyLines[type]
  if (!lines || !lines.length) return '🔥'
  return lines[Math.floor(Math.random() * lines.length)]
}

export function getRandomNickname() {
  return matchNicknames[Math.floor(Math.random() * matchNicknames.length)]
}

export function generateMOTM(playerName) {
  const titles = funnyLines.manOfMatch
  const title = titles[Math.floor(Math.random() * titles.length)]
  return { player: playerName, title }
}

export const hypeMessages = [
  'Bowler nervous! 😬',
  'Pressure mounting! 💢',
  'Crowd cheering louder! 🗣️',
  'Game on! 🔥',
  'What an over this is!',
  'Carnival atmosphere! 🎪',
  'You miss, I hit! 🎯',
  'Dhamaal mach gaya! 🪩',
]
