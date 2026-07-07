// modules/vrchat/assistant/emotionCues.js
// Lexical cue detection over TRANSCRIBED TEXT only - this is keyword/phrase
// pattern matching on what was said, not real voice-tone/prosody analysis
// (pitch, pace, pauses). That would need raw-audio feature extraction, a
// much bigger undertaking; this is an honest, much smaller first pass:
// catches explicit distress or tiredness language, nothing subtler.
//
// Used for the assistant's "soft check-in" - it never auto-triggers SOS on
// its own. It just asks the user directly if a cue is detected, and the
// user decides whether to escalate.

const DISTRESS_PATTERNS = [
  /\bi (want|wanna) to die\b/i,
  /\bkill myself\b/i,
  /\bsuicid/i,
  /\bcan'?t (take|do) (this|it) anymore\b/i,
  /\bno(t| )one (would care|cares)\b/i,
  /\bhopeless\b/i,
  /\bi hate (my life|myself)\b/i,
  /\bself[- ]harm\b/i,
  /\bi'?m not okay\b/i,
  /\b(worthless|empty inside|numb inside)\b/i
]

const SLEEPY_PATTERNS = [
  /\bso (tired|sleepy|exhausted)\b/i,
  /\bcan(')?t keep my eyes open\b/i,
  /\bgonna fall asleep\b/i,
  /\bfalling asleep\b/i,
  /\byawn/i,
  /\bneed(ing)? (sleep|a nap)\b/i,
  /\bhaven'?t slept\b/i,
  /\bup all night\b/i
]

function detectCue (text) {
  const t = String(text || '')
  if (DISTRESS_PATTERNS.some(re => re.test(t))) return 'distress'
  if (SLEEPY_PATTERNS.some(re => re.test(t))) return 'sleepy'
  return null
}

const CHECK_IN_MESSAGES = {
  distress: 'Hey, that sounded rough. Are you doing okay? I can notify one of your trusted friends if you want - just say the word.',
  sleepy: "You sound pretty worn out. Might be worth calling it and getting some sleep - I'll be here when you're back."
}

module.exports = { detectCue, CHECK_IN_MESSAGES }
