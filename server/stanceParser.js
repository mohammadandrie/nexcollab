// stanceParser — extract a single stance tag from agent reply text.
// Tag MUST appear on its own final line. We look at the LAST non-empty
// line. Falls back to NOTE if no recognized tag found.
//
// Recognized:
//   💡 PROPOSE #N <text>      → { tag:'propose', proposalRef:N, text }
//   👍 AGREE #N               → { tag:'agree',   proposalRef:N }
//   👎 PUSHBACK #N <text>     → { tag:'pushback',proposalRef:N, text }
//   ❓ ASK <text>             → { tag:'ask', text }
//   📝 NOTE <text>            → { tag:'note', text }
//
// We accept either emoji or plain ASCII forms (PROPOSE, AGREE, etc.)
// because some local models drop emojis under quantization.

const TAG_PATTERNS = [
  { re: /(?:💡\s*)?PROPOSE\s*#?(\d+)\b\s*(.*)/i,  tag: 'propose'  },
  { re: /(?:👍\s*)?AGREE\s*#?(\d+)\b\s*(.*)/i,    tag: 'agree'    },
  { re: /(?:👎\s*)?PUSHBACK\s*#?(\d+)\b\s*(.*)/i, tag: 'pushback' },
  { re: /(?:❓\s*)?ASK\s+(.*)/i,                   tag: 'ask'      },
  { re: /(?:📝\s*)?NOTE\s+(.*)/i,                  tag: 'note'     },
];

export function parseStance(reply) {
  const text = String(reply || '').trim();
  if (!text) return { tag: 'note', text: '', proposalRef: null, fallback: true };

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return { tag: 'note', text: '', proposalRef: null, fallback: true };

  const last = lines[lines.length - 1];
  for (const p of TAG_PATTERNS) {
    const m = last.match(p.re);
    if (!m) continue;
    if (p.tag === 'ask' || p.tag === 'note') {
      return { tag: p.tag, text: m[1] || '', proposalRef: null, fallback: false, raw: last };
    }
    return {
      tag: p.tag,
      proposalRef: parseInt(m[1], 10),
      text: m[2] || '',
      fallback: false,
      raw: last,
    };
  }
  // No tag detected → fallback NOTE with full text.
  return { tag: 'note', text: last, proposalRef: null, fallback: true, raw: last };
}

// Strip the stance tag line from the reply so the body can be displayed
// without the trailing marker. Keeps everything except the last matching line.
export function stripStanceLine(reply) {
  const text = String(reply || '').trimEnd();
  const lines = text.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return '';
  const last = lines[lines.length - 1].trim();
  for (const p of TAG_PATTERNS) {
    if (p.re.test(last)) { lines.pop(); break; }
  }
  return lines.join('\n').trimEnd();
}

// Validate a stance is allowed for the agent's role context.
// Cross-stage @mentioned agents may ONLY use NOTE or ASK.
export function isStanceAllowed(stance, isStageAgent) {
  if (isStageAgent) return true;  // current-stage agent: any tag allowed
  return stance.tag === 'note' || stance.tag === 'ask';
}
