import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, Attachment, UserRole } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment?: Attachment) => void;
  userName: string;
  onMarkRead?: (id: string) => void;
  userRole?: UserRole;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, userName, onMarkRead, userRole }) => {
  const [input, setInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    // Reset input
    e.target.value = '';
  };

  const processFile = (file: File) => {
    if (file.type !== 'image/jpeg' && file.type !== 'application/pdf') {
        alert('JPEG画像またはPDFファイルのみ添付可能です');
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        alert('ファイルサイズが大きすぎます（上限2MB）');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const attachment: Attachment = {
            type: file.type === 'application/pdf' ? 'pdf' : 'image',
            url: dataUrl,
            name: file.name
        };
        onSendMessage(`${file.name} を送信しました`, attachment);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
        {/* Image Preview Modal */}
        {previewImage && (
            <div 
                className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setPreviewImage(null)}
            >
                <div className="relative max-w-full max-h-full flex flex-col items-center">
                    <button 
                        className="absolute -top-12 right-0 md:right-auto md:absolute md:-top-12 md:-right-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(null);
                        }}
                    >
                        <svg className="w-8 h-8 shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img 
                        src={previewImage} 
                        alt="Preview"
                        className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl border border-white/10"
                        onClick={(e) => e.stopPropagation()} 
                    />
                </div>
            </div>
        )}

        <div 
            className="flex flex-col h-full bg-slate-900 border-l border-slate-700"
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processFile(file);
            }}
        >
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
            <h3 className="font-semibold text-slate-200 text-lg">現場チャット</h3>
            {isDragOver && <span className="text-xs text-blue-400 font-bold animate-pulse">ファイルをドロップして送信</span>}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isMe = msg.sender === userName;
              const isAI = msg.sender === 'AI';
              const isUnread = !isMe && !msg.isRead;
              const isRead = msg.isRead;
              
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    onClick={() => isUnread && onMarkRead && onMarkRead(msg.id)}
                    className={`max-w-[85%] rounded-lg p-3 text-base transition-all cursor-pointer ${
                      isMe 
                        ? 'bg-blue-600 text-white' 
                        : isAI 
                          ? 'bg-emerald-700 text-emerald-50 border border-emerald-600'
                          : 'bg-slate-700 text-slate-200'
                    } ${isUnread ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
                  >
                    <div className="flex justify-between items-baseline mb-1 opacity-80 text-xs">
                        <span className="font-bold mr-2">{msg.sender}</span>
                        <span>{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    
                    {/* Text Content */}
                    <div className={`whitespace-pre-wrap ${isUnread ? 'font-bold text-yellow-100' : ''}`}>
                        {isUnread && <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>}
                        {msg.text}
                    </div>

                    {/* Attachment Content */}
                    {msg.attachment && (
                        <div className="mt-2 p-2 bg-black/20 rounded overflow-hidden">
                            {msg.attachment.type === 'image' ? (
                                <div className="space-y-1">
                                    <img 
                                        src={msg.attachment.url} 
                                        alt="attachment" 
                                        className="max-w-full rounded border border-white/10 cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewImage(msg.attachment!.url);
                                            if(isUnread && onMarkRead) onMarkRead(msg.id);
                                        }}
                                    />
                                    <div className="text-[10px] opacity-70 truncate">{msg.attachment.name}</div>
                                </div>
                            ) : (
                                <a 
                                    href={msg.attachment.url} 
                                    download={msg.attachment.name}
                                    onClick={(e) => {
                                        if(isUnread && onMarkRead) onMarkRead(msg.id);
                                    }}
                                    className="flex items-center gap-3 p-2 hover:bg-white/10 rounded transition-colors group"
                                >
                                    <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0">PDF</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate font-medium text-xs group-hover:underline">{msg.attachment.name}</div>
                                        <div className="text-[10px] opacity-70">タップしてダウンロード</div>
                                    </div>
                                </a>
                            )}
                        </div>
                    )}

                    {/* Status Labels */}
                    {/* 自分の送信メッセージが既読になった場合 */}
                    {isMe && isRead && (
                      <div className="text-[10px] text-right mt-1 opacity-70">既読</div>
                    )}
                    
                    {/* 相手からのメッセージを自分が既読にした場合（追加） */}
                    {!isMe && isRead && (
                       <div className="text-[10px] text-right mt-1 opacity-70 text-green-300">既読</div>
                    )}

                    {/* Unread Action Prompt */}
                    {isUnread && (
                      <div className="text-[10px] text-right mt-1 text-yellow-300 font-bold">
                        {userRole === UserRole.ADMIN ? '【クリックで既読】' : 'タップして既読'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900">
            <div className="flex gap-2 items-center">
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg,application/pdf"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
                title="ファイルを添付 (JPEG/PDF)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="メッセージを入力..."
                className="flex-1 bg-slate-800 border-slate-700 border rounded-md px-3 py-2 text-base text-white focus:outline-none focus:border-blue-500"
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
    </>
  );
};

export default ChatInterface;