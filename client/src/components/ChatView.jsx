import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

export default function ChatView({ messages, mode, activeTab, onShare }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  let placeholder;
  if (mode === 'general') placeholder = 'General chat. Start typing anything…';
  else if (activeTab === 'private') placeholder = 'Start a conversation with Hermes…';
  else placeholder = 'No decisions shared in this project yet.';

  const canShare = mode === 'project' && activeTab === 'private';

  return (
    <div
      ref={boxRef}
      className="scrollbar bg-neutral-900/30 border border-neutral-800 rounded-xl
                 p-3 sm:p-4 space-y-3 overflow-y-auto"
      style={{ height: 'calc(100vh - 240px)', minHeight: 380 }}>
      {messages.length === 0
        ? <div className="text-center text-xs text-neutral-600 py-12">{placeholder}</div>
        : messages.map((m) => (
            <MessageBubble key={m.id} msg={m} canShare={canShare} onShare={onShare} />
          ))}
    </div>
  );
}
