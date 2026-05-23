// Thin OpenAI-compatible client for the Hermes local gateway.
import fs from 'node:fs';
import path from 'node:path';
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, UPLOADS_DIR } from './config.js';

// Image MIME types we forward to the vision model.
const VISION_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);
export function isVisionMime(m) { return VISION_MIME.has(String(m || '').toLowerCase()); }

// Resolve a /uploads/<file> URL to an absolute path inside UPLOADS_DIR.
// Returns null if the path escapes the directory or doesn't exist.
function resolveUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const name = path.basename(url.slice('/uploads/'.length));
  const abs = path.join(UPLOADS_DIR, name);
  if (!abs.startsWith(UPLOADS_DIR + path.sep)) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

// Encode an attachment {url, mime} as an OpenAI-style image_url data URL part.
// Returns null on failure (caller falls back to text-only).
export function encodeImagePart(att) {
  try {
    const abs = resolveUpload(att?.url);
    if (!abs) return null;
    const mime = (att.mime || 'image/png').toLowerCase();
    if (!VISION_MIME.has(mime)) return null;
    const b64 = fs.readFileSync(abs).toString('base64');
    return { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } };
  } catch { return null; }
}

const SCREENSHOT_NOTE =
  `\n\nWhen the user asks you to look at, screenshot, or "send a picture of" a ` +
  `website, append a marker on its own line in this exact format:\n` +
  `[!screenshot:https://example.com]\n` +
  `The server will fetch the screenshot and attach it to your reply. ` +
  `Use this only when the user clearly wants the page captured. Up to 2 markers ` +
  `per reply. Do not add other commentary inside the marker.`;

const SYSTEM_PROMPT = (name, role, projectName, projectDesc) =>
  `You are Hermes, the AI assistant inside Nexcollab — an internal team ` +
  `workspace for the enowX team. You are talking privately with ${name} ` +
  `(role: ${role}). Be direct, concise, and action-oriented. Reply in the ` +
  `user's language (default Indonesian if mixed). Keep replies short unless ` +
  `the user explicitly asks for depth. When the user says 'send to chat all' ` +
  `or similar, treat that as a UI action — do not echo it.\n\n` +
  `Project context: ${projectName} — ${projectDesc || '(no description)'}` +
  SCREENSHOT_NOTE;

const GENERAL_PROMPT = (name, role) =>
  `You are Hermes, the AI assistant inside Nexcollab. This is ${name}'s ` +
  `general (out-of-project) chat — a free-form scratchpad for whatever they ` +
  `want to think through that isn't tied to a specific project. Their team ` +
  `role is ${role}, but treat this space as personal: no project scope, no ` +
  `team context. Be direct, concise, and reply in the user's language ` +
  `(default Indonesian if mixed).` + SCREENSHOT_NOTE;

const CHAT_ALL_PROMPT = (name, role, projectName, projectDesc) =>
  `You are Hermes, the AI assistant inside Nexcollab — an internal team ` +
  `workspace for the enowX team. You are now speaking inside the shared ` +
  `Chat All decision log of project "${projectName}". The team can read ` +
  `everything you say here. ${name} (role: ${role}) just @-mentioned you. ` +
  `Each prior user message is prefixed with [#id · author (role)] and may ` +
  `include [↪ replying to msg #N] — use that to track the discussion thread. ` +
  `Address whoever tagged you, ground your answer in the entire conversation ` +
  `history visible to you, and keep replies concise, action-oriented, and in ` +
  `the user's language (default Indonesian if mixed). Do not echo @hermes back.\n\n` +
  `Project context: ${projectName} — ${projectDesc || '(no description)'}` +
  SCREENSHOT_NOTE;

// Appended to the system prompt whenever the user message carries one or more
// image attachments. Keep it light: describe what's in the image briefly,
// then answer whatever the user actually asked — no rigid template.
const VISION_NOTE =
  `\n\nThe user attached one or more images. Open your reply with a short, ` +
  `natural description of what the image actually shows (1–3 kalimat — what ` +
  `it is, key visible elements, any obvious text/error/status). Then respond ` +
  `to whatever the user is asking in their message, in your normal ` +
  `conversational style. No fixed headings, no bullet template, no forced ` +
  `bug-report format — match the depth and shape of the user's question. ` +
  `Ground every claim in what is actually visible; never invent text, ` +
  `numbers, or UI elements that aren't there. If the image is too blurry, ` +
  `cropped, or low-res to be sure, say so and ask for a clearer shot ` +
  `instead of guessing.`;

export const buildSystemPrompt = SYSTEM_PROMPT;
export const buildGeneralPrompt = GENERAL_PROMPT;
export const buildChatAllPrompt = CHAT_ALL_PROMPT;
export const VISION_SYSTEM_NOTE = VISION_NOTE;

export async function chatComplete(messages, { model = LLM_MODEL, timeoutMs = 60_000, maxTokens = 1024 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model, messages, stream: false,
        max_tokens: maxTokens, temperature: 0.7,
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`gateway ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return data.choices[0].message.content.trim();
  } finally {
    clearTimeout(t);
  }
}

// Transient-error patterns we retry. 401/403/400 are PERMANENT (auth/payload) —
// retry won't help. 429/5xx/timeout/abort are transient.
const TRANSIENT = /(^429|^5\d\d|timeout|aborted|ECONNRESET|ETIMEDOUT|ENOTFOUND|gateway 502|gateway 503|gateway 504)/i;
const PERMANENT = /(^40[01345]|invalid_api_key|authentication)/i;

// Streaming chat completion. Async generator that yields:
//   { type: 'delta', content: string }   for each token chunk
//   { type: 'final', content: string }   once when stream ends
// On transient errors, retries up to `retries` times with exponential backoff.
// On permanent errors, throws immediately. Caller is responsible for emitting
// SSE heartbeats to the browser; this generator only produces real content.
export async function* chatCompleteStream(messages, {
  model = LLM_MODEL,
  maxTokens = 1024,
  // Total wall-clock budget; the agent's own gateway also has limits but we
  // keep this generous for thinking-heavy models that pause before emitting.
  timeoutMs = 600_000,
  retries = 3,
  onAttempt = null,    // optional callback (attempt, delayMs) — used for SSE notice
} = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      onAttempt?.(attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model, messages, stream: true,
          max_tokens: maxTokens, temperature: 0.7,
        }),
        signal: ctl.signal,
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        const msg = `gateway ${r.status}: ${body}`;
        if (PERMANENT.test(msg) || (r.status >= 400 && r.status < 429)) {
          throw new Error(msg);  // bail without retry
        }
        lastErr = new Error(msg);
        if (TRANSIENT.test(msg) || r.status >= 500 || r.status === 429) continue;
        throw lastErr;
      }
      // Parse SSE: split on \n, look for "data: <json>" lines, "data: [DONE]" ends.
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let json;
          try { json = JSON.parse(payload); } catch { continue; }
          const delta = json?.choices?.[0]?.delta?.content
            ?? json?.choices?.[0]?.message?.content;
          if (typeof delta === 'string' && delta.length) {
            acc += delta;
            yield { type: 'delta', content: delta };
          }
        }
      }
      yield { type: 'final', content: acc.trim() };
      return;
    } catch (e) {
      lastErr = e;
      const m = `${e.name}: ${e.message}`;
      if (PERMANENT.test(m)) throw e;
      if (!TRANSIENT.test(m) && attempt === retries) throw e;
      // else: loop and retry
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error('chatCompleteStream: exhausted retries');
}

// History compaction helper — keeps last `keep` messages verbatim, replaces
// older ones with a single synthetic system note so context stays small even
// in long-running chats. Caller passes the fully-built llm messages array
// (with system prompt already at index 0); we preserve [0] and trim the body.
export function compactHistory(llmMessages, keep = 20) {
  if (!Array.isArray(llmMessages) || llmMessages.length <= keep + 1) return llmMessages;
  const sys = llmMessages[0];
  const body = llmMessages.slice(1);
  if (body.length <= keep) return llmMessages;
  const dropped = body.length - keep;
  const tail = body.slice(-keep);
  const summary = {
    role: 'system',
    content: `[Earlier ${dropped} message${dropped === 1 ? '' : 's'} from this chat have been omitted to keep context light. Continue the conversation based on the recent messages below.]`,
  };
  return [sys, summary, ...tail];
}
