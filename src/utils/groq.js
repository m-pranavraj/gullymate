const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_MODEL = 'llama-3.1-8b-instant'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

let lastCallTime = 0
const MIN_INTERVAL = 600

async function groqCompletion(messages, maxTokens = 256) {
  const now = Date.now()
  const waitTime = Math.max(0, MIN_INTERVAL - (now - lastCallTime))
  if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime))
  lastCallTime = Date.now()

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

export async function parseVoiceCreateMatch(text, groupContext = null) {
  const groupInfo = groupContext ? `Available group players: ${JSON.stringify(groupContext)}` : ''
  const systemPrompt = `You are Gully AI, a voice parser for a gully cricket match creation app.
Parse the user's speech and extract structured data. Return ONLY valid JSON with these fields:
- teamA: string or null
- teamB: string or null
- ground: string or null
- playersA: array of strings (player names for team A)
- playersB: array of strings (player names for team B)
- tossWinner: "A" or "B" or null (which team won toss)
- tossChoice: "bat" or "bowl" or null
- action: "setTeamA" | "setTeamB" | "addToTeamA" | "addToTeamB" | "setGround" | "toss" | "randomTeams" | "create" | "start" | null
- matchType: "individual" | "group" | null
- groupName: string or null

CRITICAL distinction - SET vs ADD:
- "Team A players ARE X, Y, Z" or "Team A is X, Y, Z" → action:"setTeamA", playersA:[...] (REPLACE all existing players)
- "ADD X, Y, Z to Team A" → action:"addToTeamA", playersA:[...] (APPEND to existing players)
- "Team B players ARE X, Y, Z" or "Team B is X, Y, Z" → action:"setTeamB", playersB:[...] (REPLACE all existing players)  
- "ADD X, Y, Z to Team B" → action:"addToTeamB", playersB:[...] (APPEND to existing players)

Understand Hinglish, Telugu-English mix, and casual cricket talk.
Examples:
- "Team A is VK Boys and Team B is Titans" → {teamA:"VK Boys", teamB:"Titans"}
- "Team A players are Sai, Santosh, Rahul" → {action:"setTeamA", playersA:["Sai","Santosh","Rahul"]}
- "Add Rahul to Team A" → {action:"addToTeamA", playersA:["Rahul"]}
- "Add players Sai, Santosh to Team B" → {action:"addToTeamB", playersB:["Sai","Santosh"]}
- "Team A won the toss and chose to bat" → {tossWinner:"A", tossChoice:"bat"}
- "VK Boys vs Titans at Terrace" → {teamA:"VK Boys", teamB:"Titans", ground:"Terrace"}
- "Create match and start" → {action:"create"}
- "This is a group match for Weekend Warriors" → {matchType:"group", groupName:"Weekend Warriors"}
- "Individual match between VK and Titans" → {matchType:"individual"}

${groupInfo}
Return ONLY the JSON object, no other text.`

  try {
    const result = await groqCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], 300)

    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch (err) {
    console.warn('Groq parseVoiceCreateMatch failed:', err)
    return null
  }
}

export async function parseVoiceLiveCommand(text, matchContext) {
  const contextStr = matchContext ? JSON.stringify(matchContext) : '{}'

  const systemPrompt = `You are Gully AI, a voice command parser for a live gully cricket scoring app.
Parse the user's speech and return a structured command.
Match context: ${contextStr}

Return ONLY valid JSON with these fields:
- command: "runs" | "wicket" | "wide" | "noball" | "undo" | "changeBatsman" | "changeBowler" | "endInnings" | "endMatch" | null
- runs: number (0-6, only if command is "runs")
- playerName: string or null (if a specific player is mentioned)
- details: string or null (any extra info)

Understand Hinglish, casual cricket talk:
- "six maar diya" → {command:"runs", runs:6}
- "woh out ho gaya" → {command:"wicket"}
- "wide daala" → {command:"wide"}
- "batsman change karo" → {command:"changeBatsman"}
- "gol do" or "single" or "ek run" → {command:"runs", runs:1}
- "chauka" (Hindi), "four" → {command:"runs", runs:4}
- "chakka" (Hindi), "six" → {command:"runs", runs:6}
- "noball" or "no ball" → {command:"noball"}
- "undo karo" or "pichla wapas" → {command:"undo"}
- "bowler change" → {command:"changeBowler"}
- "pavelli" (Telugu for six/4) → {command:"runs", runs:4 or 6}

Return ONLY the JSON object.`

  try {
    const result = await groqCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], 200)

    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch (err) {
    console.warn('Groq parseVoiceLiveCommand failed:', err)
    return null
  }
}

export async function parseVoiceMatchSummary(text) {
  const systemPrompt = `You are Gully AI. Parse the user's speech about match summary or social features.
Return ONLY valid JSON:
- intent: "share" | "rematch" | "save" | "nickname" | "commentary" | null
- text: string (extracted meaningful text)
- emotion: "excited" | "happy" | "angry" | "neutral" | null

Return ONLY JSON.`

  try {
    const result = await groqCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ], 150)

    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

export async function generateAIPlayerNames(teamName, count = 5) {
  const systemPrompt = `Generate ${count} realistic Indian gully cricket player names for a team called "${teamName}".
Return ONLY a JSON array of strings like ["Rahul Sharma", "Virat Singh", "Sai Kumar", ...].
Names should feel like real street cricket players, mix of first names and full names.
Return ONLY the JSON array.`

  try {
    const result = await groqCompletion([
      { role: 'system', content: systemPrompt },
    ], 200)

    const cleaned = result.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

export async function getAITaunt(battingTeam, bowlingTeam, score, wickets, balls) {
  const systemPrompt = `You are a hilarious Indian gully cricket commentator. Generate 1 short funny taunt line (max 60 chars) for a street cricket match.
Context: ${battingTeam} batting, ${bowlingTeam} bowling. Score: ${score}/${wickets} in ${balls} balls.
Make it sound like Indian street trash talk, Hinglish mixed, fun. Example: "BC, kya batting hai yaar! 😂" or "Gend ko khelna seekh pehle!"
Return ONLY the taunt text.`

  try {
    return await groqCompletion([
      { role: 'system', content: systemPrompt },
    ], 100)
  } catch {
    return 'Arena mein ek dum for! 🔥'
  }
}
