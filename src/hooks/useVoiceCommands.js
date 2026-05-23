import { useState, useCallback, useRef } from 'react'

const COMMANDS = {
  runs: ['single', 'double', 'triple', 'four', 'six', 'one', 'two', 'three', '4', '6'],
  action: ['out', 'wicket', 'bowled', 'caught', 'run out', 'stumping', 'lbw'],
  extras: ['wide', 'no ball', 'noball', 'no'],
  undo: ['undo', 'back', 'reverse', 'cancel last'],
  changeBatsman: ['change batsman', 'new batsman', 'swap batsman', 'batsman change'],
  changeBowler: ['change bowler', 'new bowler', 'bowler change'],
  zero: ['zero', 'dot', 'dot ball', '0', 'no run'],
}

function normalize(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '')
}

function matchCommand(text, commandList) {
  const n = normalize(text)
  for (const cmd of commandList) {
    if (n.includes(cmd)) return true
  }
  return false
}

export function useVoiceCommands() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)
  const callbackRef = useRef(null)

  const startListening = useCallback((onCommand) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice recognition not supported in this browser. Please use Chrome or Edge.')
      return
    }

    callbackRef.current = onCommand

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-IN'

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript
      setTranscript(text)
      processCommand(text, callbackRef.current)
    }

    recognition.onerror = (event) => {
      console.warn('Voice error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    setIsListening(false)
  }, [])

  const processCommand = useCallback((text, onCommand) => {
    if (!onCommand) return
    const n = normalize(text)

    if (matchCommand(n, COMMANDS.undo)) { onCommand('undo'); return }
    if (matchCommand(n, COMMANDS.action)) { onCommand('wicket'); return }
    if (matchCommand(n, COMMANDS.extras)) {
      if (n.includes('no') || n.includes('noball')) { onCommand('noball'); return }
      onCommand('wide'); return
    }
    if (matchCommand(n, COMMANDS.changeBatsman)) { onCommand('changeBatsman'); return }
    if (matchCommand(n, COMMANDS.changeBowler)) { onCommand('changeBowler'); return }
    if (matchCommand(n, COMMANDS.zero)) { onCommand('0'); return }
    if (matchCommand(n, COMMANDS.runs)) {
      if (n.includes('six') || n === '6') { onCommand('6'); return }
      if (n.includes('four') || n === '4') { onCommand('4'); return }
      if (n.includes('triple') || n.includes('three') || n === '3') { onCommand('3'); return }
      if (n.includes('double') || n.includes('two') || n === '2') { onCommand('2'); return }
      if (n.includes('single') || n.includes('one') || n === '1') { onCommand('1'); return }
    }

    onCommand('unknown')
  }, [])

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.9
    utterance.pitch = 1.1
    utterance.lang = 'en-IN'
    window.speechSynthesis.speak(utterance)
  }, [])

  return { isListening, transcript, startListening, stopListening, speak, processCommand }
}
