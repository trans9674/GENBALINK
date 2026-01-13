import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  role: 'Admin' | 'Field';
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, role }) => {
  const [input, setInput] = React.useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      <div className="p-4 border-b border-slate-800 bg-slate-900">
        <h3 className="font-semibold text-slate-200">現場チャット</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.sender === role;
          const isAI = msg.sender === 'AI';
          
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] rounded-lg p-3 text-sm ${
                  isMe 
                    ? 'bg-blue-600 text-white' 
                    : isAI 
                      ? 'bg-emerald-700 text-emerald-50 border border-emerald-600'
                      : 'bg-slate-700 text-slate-200'
                }`}
              >
                <div className="flex justify-between items-baseline mb-1 opacity-80 text-xs">
                    <span className="font-bold mr-2">{msg.sender}</span>
                    <span>{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div>{msg.text}</div>
                {isMe && msg.isRead && (
                  <div className="text-[10px] text-right mt-1 opacity-70">既読</div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="メッセージを入力..."
            className="flex-1 bg-slate-800 border-slate-700 border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;