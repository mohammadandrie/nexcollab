// Thin OpenAI-compatible client for the Hermes local gateway.
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } from './config.js';

const SYSTEM_PROMPT = (name, role, projectName, projectDesc) =>
  `You are Hermes, the AI assistant inside Nexcollab — an internal team ` +
  `workspace for the enowX team. You are talking privately with ${name} ` +
  `(role: ${role}). Be direct, concise, and action-oriented. Reply in the ` +
  `user's language (default Indonesian if mixed). Keep replies short unless ` +
  `the user explicitly asks for depth. When the user says 'send to chat all' ` +
  `or similar, treat that as a UI action — do not echo it.\n\n` +
  `Project context: ${projectName} — ${projectDesc || '(no description)'}`;

const GENERAL_PROMPT = (name, role) =>
  `You are Hermes, the AI assistant inside Nexcollab. This is ${name}'s ` +
  `general (out-of-project) chat — a free-form scratchpad for whatever they ` +
  `want to think through that isn't tied to a specific project. Their team ` +
  `role is ${role}, but treat this space as personal: no project scope, no ` +
  `team context. Be direct, concise, and reply in the user's language ` +
  `(default Indonesian if mixed).`;

export const buildSystemPrompt = SYSTEM_PROMPT;
export const buildGeneralPrompt = GENERAL_PROMPT;

export async function chatComplete(messages, { model = LLM_MODEL, timeoutMs = 60_000 } = {}) {
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
        max_tokens: 1024, temperature: 0.7,
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
