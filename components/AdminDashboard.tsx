import React from 'react';
import { ChatMessage } from '../types';
import ChatInterface from './ChatInterface';

interface AdminDashboardProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTriggerAlert: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ messages, onSendMessage, onTriggerAlert }) => {
  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shadow-md z-10">
        <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-widest">GENBA<span className="text-orange-500">LINK</span> <span className="text-slate-500 text-sm ml-2 font-normal">管理者コンソール</span></h1>
            <nav className="hidden md:flex space-x-4">
                <button className="text-slate-300 hover:text-white text-sm font-medium">ダッシュボード</button>
                <button className="text-blue-400 border-b-2 border-blue-400 text-sm font-medium pb-4 -mb-4">ライブ監視</button>
                <button className="text-slate-300 hover:text-white text-sm font-medium">レポート</button>
            </nav>
        </div>
        <div className="flex items-center gap-3">
             <button 
                onClick={onTriggerAlert}
                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded text-sm font-bold shadow-lg shadow-orange-900/20 active:scale-95 transition-all"
             >
                現場への警告 / 起動
             </button>
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">管理者</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Video Grid */}
        <div className="flex-1 p-4 bg-slate-950 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                {/* Simulated Remote Feed */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                            <span className="text-sm font-mono text-slate-300">現場ユニット04 - ライブ中</span>
                        </div>
                        <span className="text-xs text-slate-500">1080p | 30fps</span>
                    </div>
                    <div className="flex-1 bg-black relative flex items-center justify-center group">
                        {/* Placeholder for video feed */}
                        <img 
                            src="https://picsum.photos/800/600?grayscale" 
                            alt="Site Feed" 
                            className="w-full h-full object-cover opacity-60" 
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                            <span className="text-white border border-white px-4 py-2 rounded uppercase tracking-widest text-sm">画面拡大</span>
                        </div>
                    </div>
                </div>

                {/* AI Transcription Log */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 flex flex-col">
                     <div className="p-3 border-b border-slate-800 bg-slate-800/50">
                        <span className="text-sm font-bold text-slate-300">AIアシスタント 文字起こしログ</span>
                    </div>
                    <div className="flex-1 p-4 space-y-3 overflow-y-auto font-mono text-sm">
                        {messages.filter(m => m.sender === 'User' || m.sender === 'AI').length === 0 ? (
                            <div className="text-slate-600 text-center mt-10 italic">音声アクティビティ待機中...</div>
                        ) : (
                            messages.filter(m => m.sender === 'User' || m.sender === 'AI').map(msg => (
                                <div key={msg.id} className="flex gap-2">
                                    <span className={`w-16 shrink-0 text-xs font-bold uppercase ${msg.sender === 'AI' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                        [{msg.sender === 'User' ? '現場' : 'AIボット'}]
                                    </span>
                                    <span className="text-slate-300">{msg.text}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Right Chat Sidebar */}
        <div className="w-96 border-l border-slate-800">
          <ChatInterface messages={messages} onSendMessage={onSendMessage} role="Admin" />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;