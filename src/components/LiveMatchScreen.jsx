import { useState, useEffect, useCallback, useRef } from 'react'
import { useMatch } from '../context/MatchContext'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { getRandomLine } from '../utils/commentary'
import { defaultRules, selectMOTM } from '../utils/matchUtils'
import { parseVoiceLiveCommand, getAITaunt, correctTranscript } from '../utils/groq'

const BALL_TYPES = {
  '0': '#FF6B6B', '1': '#4ECDC4', '2': '#45B7D1',
  '3': '#96CEB4', '4': '#39FF14', '6': '#FF1493',
  'W': '#FFD700', 'WD': '#FFA500', 'NB': '#FF69B4',
}

export default function LiveMatchScreen({ onNavigate, collabMatchId }) {
  const { user } = useAuth()
  const { liveMatch, updateLiveMatch, endMatchWithWinner, addActivity, updateMatchMOTM, loadMatchById } = useMatch()
  const { groups, activeGroup, recordMatchForGroup } = useGroups()
  const [commentary, setCommentary] = useState('')
  const [showCelebration, setShowCelebration] = useState(null)
  const [showInningsBreak, setShowInningsBreak] = useState(false)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [showSuperOverDialog, setShowSuperOverDialog] = useState(false)
  const [showBatsmanPicker, setShowBatsmanPicker] = useState(false)
  const [showBowlerPicker, setShowBowlerPicker] = useState(false)
  const [showScoreCard, setShowScoreCard] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [aiTaunt, setAiTaunt] = useState('')
  const [pickMode, setPickMode] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showWicketDialog, setShowWicketDialog] = useState(false)
  const [showFielderPicker, setShowFielderPicker] = useState(false)
  const wicketPendingRef = useRef(null)
  const timelineRef = useRef(null)
  const recognitionRef = useRef(null)
  const scriptEndRef = useRef(false)

  // Load collab match by ID when opened via share link
  useEffect(() => {
    if (collabMatchId) loadMatchById(collabMatchId)
  }, [collabMatchId])

  if (!liveMatch) return null

  const match = liveMatch
  const battingTeam = match.currentBatting || 'A'
  const isBattingA = battingTeam === 'A'
  const scoreKey = isBattingA ? 'scoreA' : 'scoreB'
  const wicketKey = isBattingA ? 'wicketsA' : 'wicketsB'
  const ballKey = isBattingA ? 'ballsA' : 'ballsB'
  const extrasKey = isBattingA ? 'extrasA' : 'extrasB'
  const boundariesKey = isBattingA ? 'boundariesA' : 'boundariesB'
  const battingStatsKey = isBattingA ? 'battingStatsA' : 'battingStatsB'

  const currentRules = match.rules || defaultRules
  const currentScore = match[scoreKey] || 0
  const currentWickets = match[wicketKey] || 0
  const currentBalls = match[ballKey] || 0
  const playersCount = isBattingA ? match.playersA?.length : match.playersB?.length || 5
  const maxWickets = currentRules.lastManStanding ? playersCount : playersCount - 1
  const isChasing = match.currentInnings > 1
  const currentBatsman = match.currentBatsman
  const currentBowler = match.currentBowler
  const ballHistory = match.ballHistory || []
  const opponentScore = isBattingA ? (match.scoreB || 0) : (match.scoreA || 0)
  const targetNeeded = isChasing ? opponentScore + 1 : Infinity
  const targetCompleted = isChasing && currentScore >= targetNeeded
  const isSuperOver = match.currentInnings >= 3
  const maxBallsPerInnings = isSuperOver
    ? (match.superOver?.maxBalls || 6)
    : (currentRules.totalOvers > 0 ? currentRules.totalOvers * currentRules.maxBalls : Infinity)

  const jokerName = (currentRules.jokerEnabled && match.jokerName) || null

  const battingPlayers = match[battingStatsKey] || []
  const availableBatsmen = battingPlayers.filter(p => !p.out)
  // If joker exists and isn't already in batting stats, add a virtual entry
  const jokerBattingEntry = jokerName && !availableBatsmen.find(p => p.name === jokerName)
    ? { name: jokerName, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, status: 'yetToBat' }
    : null
  const allAvailableBatsmen = jokerBattingEntry ? [...availableBatsmen, jokerBattingEntry] : availableBatsmen
  // Build bowlers list; include joker in bowling options
  const bowlingTeamPlayers = (isBattingA ? match.playersB : match.playersA) || []
  const bowlersList = jokerName
    ? [...bowlingTeamPlayers.filter(p => p.name !== jokerName), ...(isBattingA ? match.playersA : match.playersB)?.filter(p => p.name === jokerName) || []]
    : bowlingTeamPlayers

  // AI Taunt every 6 balls
  useEffect(() => {
    if (currentBalls > 0 && currentBalls % 6 === 0 && !targetCompleted) {
      getAITaunt(
        isBattingA ? match.teamA : match.teamB,
        isBattingA ? match.teamB : match.teamA,
        currentScore, currentWickets, currentBalls
      ).then(setAiTaunt)
    }
  }, [currentBalls])

  // Auto-dismiss celebration after 1.5s
  useEffect(() => {
    if (showCelebration) {
      const t = setTimeout(() => setShowCelebration(null), 1500)
      return () => clearTimeout(t)
    }
  }, [showCelebration])

  // Check target completion after each score change
  useEffect(() => {
    if (targetCompleted && !showTargetDialog && !showEndDialog) {
      setShowTargetDialog(true)
      setCommentary(`🏆 ${isBattingA ? match.teamA : match.teamB} reached the target!`)
      setTimeout(() => setCommentary(''), 3000)
    }
  }, [currentScore])

  // Auto-end innings when overs limit reached
  useEffect(() => {
    if (maxBallsPerInnings !== Infinity && currentBalls >= maxBallsPerInnings && !showInningsBreak && !showEndDialog && !scriptEndRef.current) {
      scriptEndRef.current = true
      setTimeout(() => { scriptEndRef.current = false; setCommentary('Overs complete!'); handleEndInnings() }, 300)
    }
  }, [currentBalls])

  // Auto-prompt batsman pick if none selected
  useEffect(() => {
    if (!currentBatsman && availableBatsmen.length > 0 && !showBatsmanPicker && !showBowlerPicker && !showEndDialog) {
      setPickMode('batsman')
      setShowBatsmanPicker(true)
    }
  }, [currentBatsman, liveMatch?.id])

  // Auto-prompt bowler pick if batsman selected but no bowler
  useEffect(() => {
    if (currentBatsman && !currentBowler && bowlersList.length > 0 && !showBatsmanPicker && !showBowlerPicker && !showEndDialog) {
      setPickMode('bowler')
      setShowBowlerPicker(true)
    }
  }, [currentBatsman, currentBowler, liveMatch?.id])

  const addEvent = useCallback((type, runs = 0) => {
    setShowCelebration(null)
    setAiTaunt('')

    if (!currentBatsman && type !== 'wide' && type !== 'noball') {
      setCommentary('Select a batsman first!')
      setPickMode('batsman')
      setShowBatsmanPicker(true)
      setTimeout(() => setCommentary(''), 2000)
      return
    }

    const ballEvent = {
      id: Date.now().toString() + Math.random(), type, runs,
      timestamp: Date.now(), batsman: currentBatsman, bowler: currentBowler,
    }

    let newScore = currentScore, newWickets = currentWickets, newBalls = currentBalls
    let newExtras = match[extrasKey] || 0, newBoundaries = match[boundariesKey] || 0
    let newStats = [...battingPlayers]
    let commentaryLine = ''
    let isLegal = true

    if (type === 'wicket') {
      if (currentRules.trackWickets) {
        wicketPendingRef.current = { ballEvent }
        setShowWicketDialog(true)
        return
      }
      newWickets += 1
      commentaryLine = getRandomLine('wicket') || 'Wicket!'
      if (currentBatsman) {
        newStats = newStats.map(s =>
          s.name === currentBatsman ? { ...s, out: true, balls: (s.balls || 0) + 1, status: 'out' } : s
        )
      }
      if (navigator.vibrate) navigator.vibrate(100)

      // All out? End innings
      if (newWickets >= maxWickets) {
        setTimeout(() => {
          setCommentary('All out!')
          handleEndInnings()
        }, 500)
      } else {
        // Prompt to pick next batsman
        setTimeout(() => {
          setPickMode('batsman')
          setShowBatsmanPicker(true)
        }, 300)
      }
    } else if (type === 'wide') {
      newScore += runs + 1; newExtras += 1; isLegal = false
      commentaryLine = getRandomLine('wide') || 'Wide!'
    } else if (type === 'noball') {
      const nbRuns = currentRules.noBallTwoRuns ? Math.max(runs, 2) : runs + 1
      newScore += nbRuns; newExtras += 1; isLegal = false
      commentaryLine = getRandomLine('noBall') || 'No ball!'
    } else {
      newScore += runs
      if (runs === 4) { newBoundaries += 1; commentaryLine = getRandomLine('four') || 'Four!' }
      else if (runs === 6) {
        newBoundaries += 1; commentaryLine = getRandomLine('six') || 'Six!'; setShowCelebration('six'); if (navigator.vibrate) navigator.vibrate([50, 50, 50])
        // Direct six = out
        if (currentRules.directSixOut) {
          newWickets += 1
          if (currentBatsman) {
            newStats = newStats.map(s =>
              s.name === currentBatsman ? { ...s, out: true, balls: (s.balls || 0) + 1, sixes: (s.sixes || 0) + 1, status: 'out' } : s
            )
          }
          commentaryLine = 'Six and OUT! 🔥'
          if (newWickets >= maxWickets) {
            setTimeout(() => { setCommentary('All out!'); handleEndInnings() }, 500)
          } else {
            setTimeout(() => { setPickMode('batsman'); setShowBatsmanPicker(true) }, 300)
          }
          // Don't proceed to normal stats update below
          const newHistory = [...ballHistory, { type, runs: 6, label: '6', bowler: currentBowler, batsman: currentBatsman, innings: match.currentInnings || 1 }]
          updateLiveMatch({
            [scoreKey]: newScore, [wicketKey]: newWickets, [ballKey]: isLegal ? newBalls + 1 : newBalls,
            [extrasKey]: newExtras, [boundariesKey]: newBoundaries, [battingStatsKey]: newStats,
            timeline: [...(match.timeline || []), { ...ballEvent, runs: 6 }], ballHistory: newHistory,
          })
          setCommentary(commentaryLine)
          addActivity(user?.name || 'Player', '6 & OUT')
          setTimeout(() => setCommentary(''), 2500)
          return
        }
      }
      else commentaryLine = runs === 0 ? 'Dot ball!' : `${runs} run${runs > 1 ? 's' : ''}!`
      if (currentBatsman) {
        newStats = newStats.map(s =>
          s.name === currentBatsman
            ? { ...s, runs: (s.runs || 0) + runs, balls: (s.balls || 0) + 1, fours: (s.fours || 0) + (runs === 4 ? 1 : 0), sixes: (s.sixes || 0) + (runs === 6 ? 1 : 0) }
            : s
        )
      }
    }

    if (isLegal) newBalls += 1
    const newHistory = [...ballHistory, { type, runs: ballEvent.runs, label: type === 'wicket' ? 'W' : type === 'wide' ? 'WD' : type === 'noball' ? 'NB' : String(runs), bowler: currentBowler, batsman: currentBatsman, innings: match.currentInnings || 1 }]

    updateLiveMatch({
      [scoreKey]: newScore, [wicketKey]: newWickets, [ballKey]: newBalls,
      [extrasKey]: newExtras, [boundariesKey]: newBoundaries, [battingStatsKey]: newStats,
      timeline: [...(match.timeline || []), ballEvent], ballHistory: newHistory,
    })
    setCommentary(commentaryLine)
    addActivity(user?.name || 'Player', `${type} ${type === 'wicket' ? '' : runs}`)
    setTimeout(() => setCommentary(''), 2500)
  }, [match, currentBatsman, currentBowler, currentScore, currentWickets, currentBalls, user, updateLiveMatch, addActivity, scoreKey, wicketKey, ballKey, extrasKey, boundariesKey, battingStatsKey, ballHistory, battingPlayers, maxWickets, targetNeeded])

  const handleUndo = useCallback(() => {
    const timeline = match.timeline || []
    const history = match.ballHistory || []
    if (history.length === 0) return
    const prevBall = history[history.length - 1]
    const prevEvent = timeline[timeline.length - 1]

    let newStats = [...battingPlayers]
    if (prevEvent?.batsman) {
      newStats = newStats.map(s => {
        if (s.name !== prevEvent.batsman) return s
        if (prevEvent.type === 'wicket') {
          return { ...s, out: false, balls: Math.max(0, (s.balls || 0) - 1), status: 'yetToBat' }
        }
        if (prevEvent.type === 'wide' || prevEvent.type === 'noball') return s
        return {
          ...s,
          runs: Math.max(0, (s.runs || 0) - (prevEvent.runs || 0)),
          balls: Math.max(0, (s.balls || 0) - 1),
          fours: Math.max(0, (s.fours || 0) - (prevEvent.runs === 4 ? 1 : 0)),
          sixes: Math.max(0, (s.sixes || 0) - (prevEvent.runs === 6 ? 1 : 0)),
        }
      })
    }

    updateLiveMatch({
      [scoreKey]: Math.max(0, currentScore - (prevBall.runs || 0)),
      [wicketKey]: prevBall.label === 'W' ? Math.max(0, currentWickets - 1) : currentWickets,
      [ballKey]: prevBall.label === 'WD' || prevBall.label === 'NB' ? currentBalls : Math.max(0, currentBalls - 1),
      [extrasKey]: prevBall.label === 'WD' || prevBall.label === 'NB' ? Math.max(0, (match[extrasKey] || 0) - 1) : (match[extrasKey] || 0),
      [boundariesKey]: (prevEvent?.runs === 4 || prevEvent?.runs === 6) ? Math.max(0, (match[boundariesKey] || 0) - 1) : (match[boundariesKey] || 0),
      [battingStatsKey]: newStats,
      timeline: timeline.slice(0, -1),
      ballHistory: history.slice(0, -1),
    })
    setCommentary('↩️ Undone!')
    addActivity(user?.name || 'Player', 'undo')
    if (navigator.vibrate) navigator.vibrate(30)
    setTimeout(() => setCommentary(''), 1500)
  }, [match, currentScore, currentWickets, currentBalls, user, updateLiveMatch, addActivity, scoreKey, wicketKey, ballKey, extrasKey, boundariesKey, battingStatsKey, battingPlayers])

  const selectBatsman = useCallback((name) => {
    // If joker isn't in batting stats yet, add them
    if (jokerName === name && !battingPlayers.find(p => p.name === name)) {
      const newStats = [...battingPlayers, { name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, status: 'batting' }]
      updateLiveMatch({ currentBatsman: name, [battingStatsKey]: newStats })
    } else {
      updateLiveMatch({ currentBatsman: name })
    }
    setShowBatsmanPicker(false)
    setCommentary(`🏏 ${name} is batting`)
    addActivity(user?.name || 'Player', `${name} came to bat`)
    setTimeout(() => setCommentary(''), 1500)
    if (navigator.vibrate) navigator.vibrate(30)
  }, [updateLiveMatch, addActivity, user, jokerName, battingPlayers, battingStatsKey])

  const selectBowler = useCallback((name) => {
    updateLiveMatch({ currentBowler: name })
    setShowBowlerPicker(false)
    setCommentary(`🎯 ${name} is bowling`)
    addActivity(user?.name || 'Player', `${name} bowling`)
    setTimeout(() => setCommentary(''), 1500)
    if (navigator.vibrate) navigator.vibrate(30)
  }, [updateLiveMatch, addActivity, user])

  const confirmEndInningsSO = useCallback(() => {
    setShowInningsBreak(false)
    // Super Over: after Team B bats, Team A bats. After that, end match.
    const nextInnings = (match.currentInnings || 1) + 1
    if (match.currentInnings >= 4) {
      // Both super over innings done
      const soData = match.superOver || {}
      const soScores = soData.scores || []
      const scoreTeamB = soScores[0] || 0
      const scoreTeamA = soScores[1] || 0
      const soWinner = scoreTeamA > scoreTeamB ? match.teamA : scoreTeamB > scoreTeamA ? match.teamB : null
      updateLiveMatch({
        status: 'completed',
        winner: soWinner,
        superOver: { ...soData, active: false, winner: soWinner },
      })
      addActivity('system', `Super Over complete! ${soWinner ? `${soWinner} wins!` : 'Still tied!'}`)
      setTimeout(() => setShowEndDialog(true), 300)
      return
    }
    // Second super over innings — Team A bats
    updateLiveMatch({
      currentInnings: nextInnings,
      currentBatting: 'A',
      currentBatsman: null,
      currentBowler: null,
    })
    addActivity('system', `Super Over — ${match.teamA} to bat`)
  }, [match, updateLiveMatch, addActivity])

  const handleEndInnings = useCallback(() => {
    if (match.currentInnings <= 1) setShowInningsBreak(true)
    else if (match.currentInnings === 2 && !match.superOver?.active) setShowEndDialog(true)
    else if (match.superOver?.active) {
      // Super Over innings break
      const soScores = match.superOver?.scores || []
      const currentSOInnings = (match.currentInnings || 1) - 3 // 0 for Team B, 1 for Team A
      const battingScore = currentScore
      const newSoScores = [...soScores]
      newSoScores[currentSOInnings] = battingScore
      const isTeamBBatting = match.currentBatting === 'B'
      updateLiveMatch({
        superOver: { ...match.superOver, scores: newSoScores },
      })
      if (isTeamBBatting) {
        setShowInningsBreak(true)
      } else {
        // Both done — auto-compute winner
        const totalA = (newSoScores[1] || 0)
        const totalB = (newSoScores[0] || 0)
        const soWinner = totalA > totalB ? match.teamA : totalB > totalA ? match.teamB : null
        updateLiveMatch({
          status: 'completed',
          winner: soWinner,
          superOver: { ...match.superOver, scores: newSoScores, active: false, winner: soWinner },
        })
        addActivity('system', `Super Over complete! ${soWinner ? `${soWinner} wins!` : 'Still tied!'}`)
        setTimeout(() => setShowEndDialog(true), 300)
      }
    } else setShowEndDialog(true)
  }, [match, currentScore, updateLiveMatch, addActivity])

  const confirmEndInnings = useCallback(() => {
    setShowInningsBreak(false)
    if (match.superOver?.active) {
      confirmEndInningsSO()
      return
    }
    const newBatting = match.currentBatting === 'A' ? 'B' : 'A'
    updateLiveMatch({ currentBatting: newBatting, currentInnings: (match.currentInnings || 1) + 1, currentBatsman: null, currentBowler: null })
    addActivity('system', `Innings break! ${newBatting === 'A' ? match.teamA : match.teamB} to bat`)
  }, [match, updateLiveMatch, addActivity, confirmEndInningsSO])

  const startSuperOver = useCallback(() => {
    setShowSuperOverDialog(false)
    setShowEndDialog(false)
    setShowTargetDialog(false)
    // Reset for super over: both teams get 6 balls (1 over)
    const maxSOBalls = currentRules.maxBalls || 6
    const newInnings = (match.currentInnings || 1) + 1
    // Team that batted second now bowls first in super over
    // Track super over runs separately on the match
    updateLiveMatch({
      currentInnings: newInnings,
      currentBatting: 'B',  // Team B bats first in super over
      currentBatsman: null,
      currentBowler: null,
      scoreA: match.scoreA || 0,
      scoreB: match.scoreB || 0,
      ballsA: 0,
      ballsB: 0,
      wicketsA: 0,
      wicketsB: 0,
      extrasA: 0,
      extrasB: 0,
      boundariesA: 0,
      boundariesB: 0,
      superOver: {
        active: true,
        maxBalls: maxSOBalls,
        innings: newInnings,
        scores: [],
      },
      // Swap which team bats so B bats first in super over
      battingStatsA: match.battingStatsA,
      battingStatsB: match.battingStatsB,
    })
    addActivity('system', 'Super Over! Each team gets 1 over')
  }, [match, updateLiveMatch, addActivity, currentRules.maxBalls])

  const handleEndMatch = useCallback(() => {
    const winner = isChasing
      ? (currentScore > opponentScore ? (isBattingA ? match.teamA : match.teamB) : currentScore < opponentScore ? (isBattingA ? match.teamB : match.teamA) : null)
      : (currentScore > opponentScore ? (isBattingA ? match.teamA : match.teamB) : currentScore < opponentScore ? (isBattingA ? match.teamB : match.teamA) : null)

    // If tied and not already a super over, offer super over
    if (!winner && !isSuperOver && !match.superOver?.active) {
      setShowSuperOverDialog(true)
      setShowEndDialog(false)
      setShowTargetDialog(false)
      return
    }

    // Compute MOTM
    const allBattingStats = [...(match.battingStatsA || []), ...(match.battingStatsB || [])]
    const allPlayers = [...(match.playersA || []), ...(match.playersB || [])]
    const motm = selectMOTM(allPlayers, allBattingStats) || winner || 'Unknown'

    endMatchWithWinner(winner)

    // Store MOTM on match
    updateMatchMOTM(match.id, motm)

    // Auto-record to group if match is linked to a group or active group exists
    const targetGroupId = match.groupId || activeGroup?.id
    if (targetGroupId) {
      try {
        recordMatchForGroup(targetGroupId, {
          id: match.id,
          teamA: match.teamA, teamB: match.teamB,
          scoreA: match.scoreA || 0, wicketsA: match.wicketsA || 0,
          scoreB: match.scoreB || 0, wicketsB: match.wicketsB || 0,
          winner, ground: match.ground, motm,
        }, match.battingStatsA || [], match.battingStatsB || [], match.ballHistory || [])
      } catch (e) { console.warn('Auto group record failed:', e) }
    }

    setShowEndDialog(false)
    setShowTargetDialog(false)
    onNavigate('summary')
  }, [match, currentScore, isChasing, isSuperOver, opponentScore, isBattingA, endMatchWithWinner, updateMatchMOTM,
      activeGroup, recordMatchForGroup, onNavigate])

  const handleContinueAfterTarget = useCallback(() => {
    setShowTargetDialog(false)
    setCommentary('Extra runs! Keep going! 🔥')
    setTimeout(() => setCommentary(''), 1500)
  }, [])

  const confirmWicket = useCallback((wicketType, fielder) => {
    setShowWicketDialog(false)
    setShowFielderPicker(false)
    const pending = wicketPendingRef.current
    wicketPendingRef.current = null
    if (!pending) return

    let newScore = currentScore, newWickets = currentWickets, newBalls = currentBalls
    let newExtras = match[extrasKey] || 0, newBoundaries = match[boundariesKey] || 0
    let newStats = [...battingPlayers]
    const commentaryLine = wicketType === 'caught' ? `Caught${fielder ? ` by ${fielder}` : ''}!`
      : wicketType === 'bowled' ? 'Bowled!'
      : wicketType === 'stumped' ? 'Stumped!'
      : wicketType === 'runOut' ? 'Run Out!'
      : wicketType === 'lbw' ? 'LBW!'
      : wicketType === 'hitWicket' ? 'Hit Wicket!'
      : wicketType === 'retired' ? 'Retired Hurt!'
      : 'Wicket!'

    newWickets += 1
    if (currentBatsman) {
      newStats = newStats.map(s =>
        s.name === currentBatsman ? { ...s, out: true, balls: (s.balls || 0) + 1, status: 'out' } : s
      )
    }
    if (navigator.vibrate) navigator.vibrate(100)

    const ballEvent = { ...pending.ballEvent, wicketType, fielder }
    const newHistory = [...ballHistory, {
      type: 'wicket', runs: 0, label: 'W',
      wicketType, fielder,
      bowler: currentBowler, batsman: currentBatsman,
      innings: match.currentInnings || 1,
    }]

    updateLiveMatch({
      [scoreKey]: newScore, [wicketKey]: newWickets, [ballKey]: newBalls + 1,
      [extrasKey]: newExtras, [boundariesKey]: newBoundaries, [battingStatsKey]: newStats,
      timeline: [...(match.timeline || []), ballEvent], ballHistory: newHistory,
    })
    setCommentary(commentaryLine)
    addActivity(user?.name || 'Player', `wicket (${wicketType}${fielder ? ` c. ${fielder}` : ''})`)
    setTimeout(() => setCommentary(''), 2500)

    if (newWickets >= maxWickets) {
      setTimeout(() => { setCommentary('All out!'); handleEndInnings() }, 500)
    } else {
      setTimeout(() => { setPickMode('batsman'); setShowBatsmanPicker(true) }, 300)
    }
  }, [match, currentBatsman, currentScore, currentWickets, currentBalls, battingPlayers, ballHistory,
      scoreKey, wicketKey, ballKey, extrasKey, boundariesKey, battingStatsKey, maxWickets,
      user, updateLiveMatch, addActivity, handleEndInnings, currentBowler])

  const selectWicketType = useCallback((wicketType) => {
    if (wicketType === 'caught') {
      setShowWicketDialog(false)
      setShowFielderPicker(true)
    } else {
      confirmWicket(wicketType, null)
    }
  }, [confirmWicket])

  const selectFielder = useCallback((fielder) => {
    setShowFielderPicker(false)
    confirmWicket('caught', fielder)
  }, [confirmWicket])

  // Voice commands
  const silenceTimerRef = useRef(null)
  const toggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Voice not supported'); return }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 3
    recognitionRef.current = recognition
    setIsListening(true); setVoiceTranscript('')

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
        setIsListening(false)
      }, 7000)
    }
    resetSilenceTimer()

    let bestTranscript = ''

    recognition.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          let topChoice = result[0].transcript
          for (let j = 1; j < result.length; j++) {
            if (result[j].confidence > result[0].confidence) {
              topChoice = result[j].transcript
            }
          }
          bestTranscript = bestTranscript ? bestTranscript + ' ' + topChoice : topChoice
        }
      }
      setVoiceTranscript(bestTranscript)
      resetSilenceTimer()

      if (!event.results[event.results.length - 1]?.isFinal) return
      let text = bestTranscript
      if (!text.trim()) return

      // Correct transcript before processing
      const corrected = await correctTranscript(text, { groupPlayers: null })
      if (corrected && corrected !== text) {
        setVoiceTranscript(corrected)
        text = corrected
      }

      const lower = text.toLowerCase().trim()

      if (lower.includes('chakka') || lower.includes('six') || lower === '6' || lower.includes('pavelli') || lower.includes('chekka')) { addEvent('normal', 6); return }
      if (lower.includes('chauka') || lower.includes('four') || lower === '4') { addEvent('normal', 4); return }
      if (lower.includes('triple') || lower.includes('three') || lower === '3') { addEvent('normal', 3); return }
      if (lower.includes('double') || lower.includes('two') || lower === '2' || lower.includes('dunna')) { addEvent('normal', 2); return }
      if (lower.includes('single') || lower.includes('one') || lower === '1' || lower.includes('okati')) { addEvent('normal', 1); return }
      if (lower.includes('zero') || lower.includes('dot') || lower.includes('gol') || lower === '0') { addEvent('normal', 0); return }

      if (lower.includes('undo') || lower.includes('pichla') || lower.includes('back')) { handleUndo(); return }
      if (lower.includes('wicket') || lower.includes('out') || lower.includes('bowled') || lower.includes('caught') || lower.includes('howzat')) { addEvent('wicket'); return }
      if (lower.includes('wide')) { addEvent('wide', 0); return }
      if (lower.includes('no ball') || lower.includes('noball')) { addEvent('noball', 0); return }
      if (lower.includes('batsman change') || lower.includes('change batsman') || lower.includes('new batsman') || lower.includes('next batsman')) { setPickMode('batsman'); setShowBatsmanPicker(true); return }
      if (lower.includes('bowler change') || lower.includes('change bowler') || lower.includes('new bowler')) { setPickMode('bowler'); setShowBowlerPicker(true); return }
      if (lower.includes('end innings') || lower.includes('innings over')) { handleEndInnings(); return }
      if (lower.includes('end match') || lower.includes('match over')) { setShowEndDialog(true); return }
      if (lower.includes('score card') || lower.includes('scorecard') || lower.includes('batting stats') || lower.includes('show score')) { setShowScoreCard(true); return }

      // AI fallback for fuzzy commands
      setAiThinking(true)
      const aiResult = await parseVoiceLiveCommand(text, {
        battingTeam: isBattingA ? match.teamA : match.teamB,
        bowlingTeam: isBattingA ? match.teamB : match.teamA,
        score: currentScore, wickets: currentWickets, balls: currentBalls
      })
      setAiThinking(false)
      if (aiResult?.command) {
        const cmd = aiResult.command
        if (cmd === 'runs') addEvent('normal', aiResult.runs || 0)
        else if (cmd === 'wicket') addEvent('wicket')
        else if (cmd === 'wide') addEvent('wide', 0)
        else if (cmd === 'noball') addEvent('noball', 0)
        else if (cmd === 'undo') handleUndo()
        else if (cmd === 'changeBatsman') { setPickMode('batsman'); setShowBatsmanPicker(true) }
        else if (cmd === 'changeBowler') { setPickMode('bowler'); setShowBowlerPicker(true) }
        else if (cmd === 'endInnings') handleEndInnings()
        else if (cmd === 'endMatch') setShowEndDialog(true)
      }
      bestTranscript = ''
    }
    recognition.onerror = () => { setIsListening(false); setAiThinking(false); bestTranscript = '' }
    recognition.onend = () => { setIsListening(false); bestTranscript = '' }
    recognition.start()
  }

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollLeft = timelineRef.current.scrollWidth
  }, [ballHistory])

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-dark via-[#0b0b20] to-blue-950 pb-2 flex flex-col max-w-lg mx-auto relative">

      {/* ====== Super Over Dialog ====== */}
      {showSuperOverDialog && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 animate-fade-up">
          <div className="card-glass p-8 text-center max-w-sm w-full border border-orange-500/40">
            <div className="text-7xl mb-3 animate-bounce">🔥</div>
            <h2 className="text-2xl font-black mb-2 text-gradient">Super Over!</h2>
            <p className="text-lg font-bold mb-1">Match is tied!</p>
            <p className="text-sm text-gray-400 mb-6">Each team gets 1 over. Highest scorer wins!</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowSuperOverDialog(false); setShowEndDialog(true) }}
                className="flex-1 py-4 rounded-2xl font-bold border-2 border-white/20 text-white active:scale-[0.97] transition-all">Draw</button>
              <button onClick={startSuperOver}
                className="flex-1 py-4 rounded-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30 active:scale-[0.97] transition-all">
                🔥 Super Over →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Wicket Type Picker ====== */}
      {showWicketDialog && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
          <div className="card-glass p-5 w-full max-w-sm mx-auto">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="text-yellow-400">🪀</span> Wicket Type
            </h2>
            <p className="text-[10px] text-gray-500 mb-4">How was the batsman dismissed?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'bowled', label: '🪃 Bowled' },
                { type: 'caught', label: '🧤 Caught' },
                { type: 'runOut', label: '🏃 Run Out' },
                { type: 'stumped', label: '🔨 Stumped' },
                { type: 'lbw', label: '🦵 LBW' },
                { type: 'hitWicket', label: '🏏 Hit Wicket' },
                { type: 'retired', label: '🩹 Retired Hurt' },
              ].map(o => (
                <button key={o.type} onClick={() => selectWicketType(o.type)}
                  className="py-4 rounded-2xl font-bold text-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-[0.97] transition-all text-center">
                  {o.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowWicketDialog(false); wicketPendingRef.current = null }}
              className="w-full mt-3 py-3 rounded-2xl font-bold text-sm text-gray-400 border border-white/10 active:scale-[0.97] transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ====== Fielder Picker ====== */}
      {showFielderPicker && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
          <div className="card-glass p-5 w-full max-w-sm mx-auto max-h-[70vh] overflow-y-auto">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="text-neon-green">🧤</span> Who Caught It?
            </h2>
            <p className="text-[10px] text-gray-500 mb-4">Select the fielder</p>
            <div className="space-y-1">
              {bowlersList.map((p, i) => (
                <button key={i} onClick={() => selectFielder(p.name)}
                  className="w-full text-left px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 active:scale-[0.97] transition-all flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-green to-neon-blue flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name[0]?.toUpperCase() || '?'}
                  </span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowFielderPicker(false); confirmWicket('caught', null) }}
              className="w-full mt-3 py-3 rounded-2xl font-bold text-sm bg-white/5 text-gray-400 border border-white/10 active:scale-[0.97] transition-all">
              Unknown fielder
            </button>
          </div>
        </div>
      )}

      {/* ====== Batsman Picker Modal ====== */}
      {showBatsmanPicker && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
          <div className="card-glass p-5 w-full max-w-sm mx-auto max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">
                <span className="text-neon-green">🏏</span> Select Batsman
              </h2>
              {currentBatsman && availableBatsmen.length > 0 && (
                <button onClick={() => setShowBatsmanPicker(false)} className="text-gray-400 text-sm">✕</button>
              )}
            </div>
            {allAvailableBatsmen.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400">All players are out!</p>
                <button onClick={() => { setShowBatsmanPicker(false); setShowEndDialog(true) }}
                  className="mt-4 py-3 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm active:scale-95 transition-all">
                  End Innings
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {allAvailableBatsmen.map((p, i) => (
                  <button key={i}
                    onClick={() => selectBatsman(p.name)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all active:scale-[0.97] flex items-center gap-3 ${
                      p.name === currentBatsman ? 'bg-neon-green/15 border border-neon-green/30 text-neon-green' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                    }`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${p.name === currentBatsman ? 'bg-neon-green text-black' : 'bg-white/10'}`}>
                      {p.name[0]}
                    </span>
                    <span className="flex-1">{p.name}</span>
                    {p.name === currentBatsman && <span className="text-[10px] text-neon-green">Batting</span>}
                    {(p.runs > 0 || (p.balls || 0) > 0) && (
                      <span className="text-xs text-gray-400">{p.runs || 0}({p.balls || 0})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== Bowler Picker Modal ====== */}
      {showBowlerPicker && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
          <div className="card-glass p-5 w-full max-w-sm mx-auto max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">
                <span className="text-neon-blue">🎯</span> Select Bowler
              </h2>
              <button onClick={() => setShowBowlerPicker(false)} className="text-gray-400 text-sm">✕</button>
            </div>
            <div className="space-y-1.5">
              {bowlersList.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No bowlers available</p>
              ) : (
                bowlersList.map((p, i) => (
                  <button key={i}
                    onClick={() => selectBowler(p.name)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all active:scale-[0.97] flex items-center gap-3 ${
                      p.name === currentBowler ? 'bg-neon-blue/15 border border-neon-blue/30 text-neon-blue' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                    }`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${p.name === currentBowler ? 'bg-neon-blue text-black' : 'bg-white/10'}`}>
                      {p.name[0]}
                    </span>
                    <span className="flex-1">{p.name}</span>
                    {p.name === currentBowler && <span className="text-[10px] text-neon-blue">Bowling</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== Score Card Modal ====== */}
      {showScoreCard && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center p-4 animate-slide-up">
          <div className="card-glass p-5 w-full max-w-sm mx-auto max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">
                <span className="text-gradient">📊</span> Scorecard
              </h2>
              <button onClick={() => setShowScoreCard(false)} className="text-gray-400 text-sm">✕</button>
            </div>
            <div className="text-center mb-4 pb-3 border-b border-white/10">
              <p className="text-2xl font-black text-gradient">
                {isBattingA ? match.teamA : match.teamB}: {currentScore}/{currentWickets}
              </p>
              <p className="text-xs text-gray-400">{currentBalls} balls | Extras: {match[extrasKey] || 0}</p>
            </div>
            <div className="space-y-1">
              <div className="flex text-[10px] text-gray-500 font-bold pb-1.5 border-b border-white/5">
                <span className="flex-1">Batsman</span>
                <span className="w-8 text-center">R</span>
                <span className="w-8 text-center">B</span>
                <span className="w-8 text-center">4s</span>
                <span className="w-8 text-center">6s</span>
                <span className="w-8 text-center">SR</span>
              </div>
              {battingPlayers.map((s, i) => (
                <div key={i} className={`flex items-center text-xs py-2 border-b border-white/5 last:border-0 ${s.name === currentBatsman ? 'bg-neon-green/5 rounded-lg' : ''}`}>
                  <span className="flex-1 truncate">
                    {s.name} {s.out ? <span className="text-red-400">†</span> : s.name === currentBatsman ? <span className="text-neon-green text-[10px]">*</span> : ''}
                  </span>
                  <span className="w-8 text-center font-bold">{s.runs || 0}</span>
                  <span className="w-8 text-center text-gray-500">{s.balls || 0}</span>
                  <span className="w-8 text-center text-emerald-400">{s.fours || 0}</span>
                  <span className="w-8 text-center text-neon-green">{s.sixes || 0}</span>
                  <span className="w-8 text-center text-gray-500">{s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(0) : '-'}</span>
                </div>
              ))}
            </div>

            {/* Bowling Summary */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-neon-blue">🎯</span>
                <span className="font-bold text-xs">Bowling</span>
                <span className="text-[10px] text-gray-500">({currentBowler || 'No bowler selected'})</span>
              </div>
              <div className="flex text-[10px] text-gray-500 font-bold pb-1.5 border-b border-white/5">
                <span className="flex-1">Bowler</span>
                <span className="w-8 text-center">O</span>
                <span className="w-8 text-center">R</span>
                <span className="w-8 text-center">W</span>
                <span className="w-10 text-center">Econ</span>
              </div>
              <div className="text-xs">
                {(() => {
                  const bowlStats = {}
                  const bowlTeam = isBattingA ? (match.playersB || []) : (match.playersA || [])
                  bowlTeam.forEach(p => { bowlStats[p.name] = { name: p.name, legalBalls: 0, runs: 0, wkts: 0, overs: 0 } })
                  let cumLegal = 0
                  ballHistory.forEach(b => {
                    if (!bowlStats[b.bowler]) return
                    const isLegal = b.label !== 'WD' && b.label !== 'NB'
                    if (isLegal) { bowlStats[b.bowler].legalBalls++; cumLegal++ }
                    bowlStats[b.bowler].runs += b.runs || 0
                    if (b.type === 'wicket') bowlStats[b.bowler].wkts++
                    if (isLegal && cumLegal % 6 === 0) bowlStats[b.bowler].overs++
                  })
                  return Object.values(bowlStats).filter(s => s.legalBalls > 0 || s.runs > 0).map((s, i) => (
                    <div key={i} className={`flex items-center py-1.5 border-b border-white/5 last:border-0 ${s.name === currentBowler ? 'bg-neon-blue/5 rounded-lg' : ''}`}>
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="w-8 text-center text-gray-400">{s.overs > 0 ? `${s.overs}.0` : s.legalBalls > 0 ? `0.${s.legalBalls}` : '-'}</span>
                      <span className="w-8 text-center">{s.runs}</span>
                      <span className="w-8 text-center text-yellow-400 font-bold">{s.wkts}</span>
                      <span className="w-10 text-center text-gray-400">{s.legalBalls > 0 ? ((s.runs / s.legalBalls) * 6).toFixed(1) : '-'}</span>
                    </div>
                  ))
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Six Celebration */}
      {showCelebration === 'six' && (
        <>
          <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
            <div className="text-9xl animate-[celebration_0.8s_ease-out]">🚀</div>
          </div>
          <div className="fixed inset-0 z-30 pointer-events-none bg-gradient-to-t from-neon-green/10 to-transparent animate-fade-up" />
        </>
      )}

      {/* Innings Break */}
      {showInningsBreak && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 animate-fade-up">
          <div className="card-glass p-8 text-center max-w-sm w-full border border-neon-green/30">
            <div className="text-6xl mb-3 animate-bounce">{match.superOver?.active ? '🔥' : '🔄'}</div>
            <h2 className="text-2xl font-black mb-1 text-gradient">{match.superOver?.active ? 'Super Over — Switch!' : 'Innings Break!'}</h2>
            {match.superOver?.active ? (
              <>
                <p className="text-lg font-bold text-white mb-1">{match.currentBatting === 'B' ? match.teamB : match.teamA}: {currentScore}/{currentWickets}</p>
                <p className="text-gray-400 mb-6">Now {match.currentBatting === 'B' ? match.teamA : match.teamB} to bat!</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-black text-white mb-1">{match.teamA}: {match.scoreA}/{match.wicketsA}</p>
                <p className="text-gray-400 mb-6">{match.teamB} needs {match.scoreA} to win</p>
              </>
            )}
            <button onClick={confirmEndInnings}
              className="w-full py-5 rounded-2xl font-bold text-lg bg-gradient-to-r from-neon-green to-emerald-500 text-black shadow-lg shadow-neon-green/30 active:scale-[0.97] transition-all">
              {match.superOver?.active ? '🔥 Start Super Over Bat →' : '🔥 Start 2nd Innings →'}
            </button>
          </div>
        </div>
      )}

      {/* Target Achieved Dialog */}
      {showTargetDialog && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 animate-fade-up">
          <div className="card-glass p-8 text-center max-w-sm w-full border border-neon-green/40">
            <div className="text-7xl mb-3 animate-bounce">🏆</div>
            <h2 className="text-2xl font-black mb-2 text-gradient">Match Won!</h2>
            <p className="text-lg font-bold">{isBattingA ? match.teamA : match.teamB} reached the target!</p>
            <p className="text-3xl font-black text-white my-2">{currentScore}/{currentWickets}</p>
            <p className="text-xs text-gray-400 mb-6">Target was {opponentScore + 1} runs</p>
            <div className="flex gap-3">
              <button onClick={handleContinueAfterTarget}
                className="flex-1 py-4 rounded-2xl font-bold border-2 border-white/20 text-white active:scale-[0.97] transition-all">
                Continue Playing
              </button>
              <button onClick={handleEndMatch}
                className="flex-1 py-4 rounded-2xl font-bold bg-gradient-to-r from-neon-green to-emerald-500 text-black shadow-lg shadow-neon-green/30 active:scale-[0.97] transition-all">
                Declare Winner 🏆
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Match Dialog */}
      {showEndDialog && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 animate-fade-up">
          <div className="card-glass p-8 text-center max-w-sm w-full">
            <div className="text-6xl mb-3">{match.superOver?.active ? '🔥' : '🏆'}</div>
            <h2 className="text-2xl font-black mb-3">{match.superOver?.active ? 'Super Over Done!' : 'End Match?'}</h2>
            <p className="text-lg font-bold mb-1">{match.teamA}: {match.scoreA}/{match.wicketsA}</p>
            <p className="text-lg font-bold mb-5">{match.teamB}: {match.scoreB}/{match.wicketsB}</p>
            {match.winner && <p className="text-sm text-neon-green font-bold mb-3">🏆 {match.winner} wins!</p>}
            {!match.winner && match.superOver?.active && <p className="text-sm text-orange-400 font-bold mb-3">Still tied!</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowEndDialog(false)}
                className="flex-1 py-4 rounded-2xl font-bold border-2 border-white/20 text-white active:scale-[0.97] transition-all">
                {match.superOver?.active ? 'Close' : 'Cancel'}
              </button>
              <button onClick={handleEndMatch}
                className="flex-1 py-4 rounded-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white active:scale-[0.97] transition-all">
                {match.winner || match.superOver?.active ? 'Finish Match' : 'End Match'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 bg-pitch-dark/90 backdrop-blur-xl border-b border-white/5 px-3 py-2.5 flex items-center justify-between">
        <button onClick={() => onNavigate('home')} className="text-xl hover:scale-110 transition-transform">←</button>
        <div className="text-center flex-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
            {match.currentInnings >= 3 ? '🔥 Super Over' : match.currentInnings > 1 ? '2nd Innings' : '1st Innings'} • {match.ground}
          </p>
          {isChasing && !targetCompleted && (
            <p className="text-[10px] text-orange-400 font-bold">
              Need {targetNeeded - currentScore} to win
            </p>
          )}
          {targetCompleted && (
            <p className="text-[10px] text-neon-green font-bold animate-pulse">🏆 Target Reached!</p>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/live/${liveMatch.id}`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="px-2.5 py-1.5 rounded-xl bg-neon-green/15 text-neon-green text-[10px] font-bold border border-neon-green/30 hover:bg-neon-green/25 transition-all">
            {copied ? '✅' : '🔗'}
          </button>
          <button onClick={() => setShowScoreCard(true)}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 text-white text-[10px] font-bold hover:bg-white/20 transition-all">
            📊
          </button>
          <button onClick={() => setShowEndDialog(true)}
            className="px-2.5 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/20 hover:bg-red-500/25 transition-all">
            ✕ End
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="px-3 pt-2">
        <div className="card-glass p-4 border-t-2 border-t-neon-green/30">
          <div className="flex items-center justify-between mb-2">
            <div className={`flex-1 ${isBattingA ? '' : 'opacity-50'}`}>
              <p className="text-xs font-bold text-gray-400">{match.teamA}</p>
              <div className="flex items-end gap-1">
                <p className={`text-4xl font-black ${isBattingA ? 'text-gradient' : 'text-gray-500'}`}>{match.scoreA || 0}</p>
                <p className="text-lg text-gray-400 mb-1">/{match.wicketsA || 0}</p>
                {isBattingA && <span className="text-neon-green text-xs mb-2 ml-1 animate-pulse">●</span>}
              </div>
            </div>
            <div className="px-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-green/20 to-neon-blue/20 flex items-center justify-center border border-white/10">
                <span className="text-xs font-bold text-gray-300">VS</span>
              </div>
            </div>
            <div className={`flex-1 text-right ${!isBattingA ? '' : 'opacity-50'}`}>
              <p className="text-xs font-bold text-gray-400">{match.teamB}</p>
              <div className="flex items-end justify-end gap-1">
                <p className={`text-4xl font-black ${!isBattingA ? 'text-gradient' : 'text-gray-500'}`}>{match.scoreB || 0}</p>
                <p className="text-lg text-gray-400 mb-1">/{match.wicketsB || 0}</p>
                {!isBattingA && <span className="text-neon-blue text-xs mb-2 ml-1 animate-pulse">●</span>}
              </div>
            </div>
          </div>

          {/* Info bar */}
          <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-white/5 pt-2.5">
            <span className="font-medium">Balls: <span className="text-white">{currentBalls}</span></span>
            <span className="font-medium">Extras: <span className="text-orange-400">{match[extrasKey] || 0}</span></span>
            <span className="font-medium">4s/6s: <span className="text-emerald-400">{match[boundariesKey] || 0}</span></span>
            <span className="font-medium">RR: <span className="text-neon-blue">{currentBalls > 0 ? (currentScore / currentBalls * currentRules.maxBalls).toFixed(1) : '0.0'}</span></span>
          </div>

          {/* Current Players - Single batsman layout */}
          <div className="flex items-center justify-between mt-2 text-xs bg-white/5 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-neon-green shrink-0">🏏</span>
              {currentBatsman ? (
                <button onClick={() => { setPickMode('batsman'); setShowBatsmanPicker(true) }}
                  className="font-bold text-white truncate hover:text-neon-green transition-colors max-w-[120px]">
                  {currentBatsman}
                </button>
              ) : (
                <button onClick={() => { setPickMode('batsman'); setShowBatsmanPicker(true) }}
                  className="text-gray-500 italic text-[10px] border-b border-dashed border-gray-600">
                  Tap to select batsman
                </button>
              )}
              {availableBatsmen.length > 0 && availableBatsmen.length <= 2 && currentBatsman && (
                <button onClick={() => { setPickMode('batsman'); setShowBatsmanPicker(true) }}
                  className="text-[10px] text-gray-500 ml-1 hover:text-neon-green">↻</button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-neon-blue">🎯</span>
              {currentBowler ? (
                <button onClick={() => { setPickMode('bowler'); setShowBowlerPicker(true) }}
                  className="font-bold text-white hover:text-neon-blue transition-colors">
                  {currentBowler}
                </button>
              ) : (
                <button onClick={() => { setPickMode('bowler'); setShowBowlerPicker(true) }}
                  className="text-gray-500 italic text-[10px] border-b border-dashed border-gray-600">
                  Tap to select
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Taunt */}
      {aiTaunt && (
        <div className="mx-3 mt-1.5 card-glass p-2 text-center animate-fade-up border border-purple-500/20">
          <p className="text-xs text-purple-400 italic">🔥 {aiTaunt}</p>
        </div>
      )}

      {/* Commentary Bar */}
      {commentary && (
        <div className="mx-3 mt-1.5 card-glass p-2.5 text-center animate-bounce-in border border-neon-green/20">
          <p className="text-sm font-bold text-gradient">{commentary}</p>
        </div>
      )}

      {/* Score Buttons */}
      <div className="px-3 pt-2">
        <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
          {[
            { label: '0', runs: 0, cls: 'score-btn bg-red-500/15 border-red-500/40 text-red-400' },
            { label: '1', runs: 1, cls: 'score-btn bg-blue-500/15 border-blue-500/40 text-blue-400' },
            { label: '2', runs: 2, cls: 'score-btn bg-cyan-500/15 border-cyan-500/40 text-cyan-400' },
            { label: '3', runs: 3, cls: 'score-btn bg-green-500/15 border-green-500/40 text-green-400' },
            { label: '4', runs: 4, cls: 'score-btn bg-emerald-500/15 border-emerald-500/40 text-emerald-400 text-2xl' },
            { label: '🚀', runs: 6, cls: 'score-btn bg-neon-green/15 border-neon-green/50 text-neon-green text-3xl shadow-lg shadow-neon-green/10' },
          ].map(btn => (
            <button key={btn.runs} onClick={() => addEvent('normal', btn.runs)} className={btn.cls}>{btn.label}</button>
          ))}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-4 gap-1.5 mt-1.5 max-w-sm mx-auto">
          <button onClick={() => addEvent('wicket')}
            className="py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-br from-yellow-600/90 to-orange-600/90 text-white border border-yellow-500/30 active:scale-90 transition-all shadow-lg">
            🪀 Wicket
          </button>
          <button onClick={() => addEvent('wide', 0)}
            className="py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-br from-orange-600/90 to-red-600/90 text-white border border-orange-500/30 active:scale-90 transition-all shadow-lg">
            ↗️ Wide
          </button>
          <button onClick={() => addEvent('noball', 0)}
            className="py-3.5 rounded-2xl font-bold text-[11px] bg-gradient-to-br from-pink-600/90 to-purple-600/90 text-white border border-pink-500/30 active:scale-90 transition-all shadow-lg">
            ⛔ No Ball
          </button>
          <button onClick={handleUndo}
            className="py-3.5 rounded-2xl font-bold text-xl bg-gradient-to-br from-gray-600/90 to-gray-700/90 text-white border border-white/10 active:scale-90 transition-all shadow-lg">
            ↩️
          </button>
        </div>

        {/* Change Players */}
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 max-w-sm mx-auto">
          <button onClick={() => { setPickMode('batsman'); setShowBatsmanPicker(true) }}
            className="py-2.5 rounded-2xl font-bold text-xs bg-white/10 text-white border border-white/10 active:scale-90 transition-all hover:bg-white/15">
            🏏 Change Batsman
          </button>
          <button onClick={() => { setPickMode('bowler'); setShowBowlerPicker(true) }}
            className="py-2.5 rounded-2xl font-bold text-xs bg-white/10 text-white border border-white/10 active:scale-90 transition-all hover:bg-white/15">
            🎯 Change Bowler
          </button>
        </div>

        {/* Voice + Scorecard + End Innings */}
        <div className="grid grid-cols-3 gap-1.5 mt-1.5 max-w-sm mx-auto">
          <button onClick={toggleVoice}
            className={`py-3 rounded-2xl font-bold text-sm active:scale-90 transition-all shadow-lg ${
              isListening ? 'bg-neon-green text-black animate-pulse shadow-neon-green/30' : aiThinking ? 'bg-yellow-500/50 text-white' : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
            }`}>
            🎤 {isListening ? 'Listening...' : aiThinking ? '🤔 AI...' : 'AI Voice'}
          </button>
          <button onClick={() => setShowScoreCard(true)}
            className="py-3 rounded-2xl font-bold text-sm bg-white/10 text-white border border-white/10 active:scale-90 transition-all hover:bg-white/15">
            📊 Stats
          </button>
          <button onClick={handleEndInnings}
            className="py-3 rounded-2xl font-bold text-sm bg-white/10 text-white border border-white/10 active:scale-90 transition-all hover:bg-white/15">
            🔚 End
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-3 mt-2">
        <div className="card-glass p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Ball-by-ball</p>
            <p className="text-[10px] text-gray-500">Over {Math.floor(currentBalls / currentRules.maxBalls)}.{currentBalls % currentRules.maxBalls}</p>
          </div>
          <div ref={timelineRef} className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {ballHistory.length === 0 ? (
              <p className="text-gray-600 text-xs italic">Waiting for first ball... 🏏</p>
            ) : (
              ballHistory.map((ball, i) => {
                const color = BALL_TYPES[ball.label] || '#fff'
                return (
                  <div key={i}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 animate-bounce-in border"
                    style={{ background: color + '20', color, borderColor: color + '40' }}>
                    {ball.label}
                  </div>
                )
              })
            )}
          </div>
          {ballHistory.length > 0 && (
            <p className="text-[10px] text-gray-600 mt-1.5">
              This over: {ballHistory.slice(-currentRules.maxBalls).map(b => b.label).join(' • ')}
            </p>
          )}
        </div>
      </div>

      {/* Voice Transcript */}
      {voiceTranscript && !isListening && (
        <div className="mx-3 mt-1.5 card-glass p-2 text-center animate-fade-up border border-neon-blue/20">
          <p className="text-[10px] text-gray-500">🗣 {voiceTranscript}</p>
        </div>
      )}

      <div className="h-2" />
    </div>
  )
}
