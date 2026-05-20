// Authorization helper: load a chat doc & enforce access rules.
import { cC, cPM } from './db.js';

/**
 * Returns the chat doc if `user` may access it, else writes a 4xx response
 * to `res` and returns null. Caller should `if (!chat) return;`.
 */
export async function loadChatOr403(chatId, user, res) {
  const chat = await cC().findOne({ _id: chatId });
  if (!chat) { res.status(404).json({ detail: 'chat_not_found' }); return null; }

  if (chat.kind === 'general') {
    if (chat.owner_id !== user._id) {
      res.status(403).json({ detail: 'not_your_general_chat' }); return null;
    }
    return chat;
  }

  const member = await cPM().findOne({
    project_id: chat.project_id, user_id: user._id,
  });
  if (!member) { res.status(403).json({ detail: 'not_a_member' }); return null; }
  if (chat.kind === 'private' && chat.owner_id !== user._id) {
    res.status(403).json({ detail: 'not_your_private_chat' }); return null;
  }
  return chat;
}
