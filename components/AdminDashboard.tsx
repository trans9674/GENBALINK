import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import ChatInterface from './ChatInterface';

interface AdminDashboardProps {
  siteId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTriggerAlert: () => void;
  remoteStream: MediaStream | null;
  connectionStatus: string;
  onRequestStream: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    siteId, 
    messages, 
    onSendMessage, 
    onTriggerAlert,
    remoteStream,
    connectionStatus,
    onRequestStream
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shadow-md z-10">
        <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-widest">GENBA<span className="text-orange-500">LINK</span> <span className="text-slate-500 text-sm ml-2 font-normal">管理者コンソール</span></h1>
            <nav className="hidden md:flex space-x-4">
                <button className="text-slate-300 hover:text-white text-sm font-medium">ダッシュボード</button>
                <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                     <span className="text-blue-400 text-sm font-medium">現場ID: {siteId}</span>
                </div>
            </nav>
        </div>
        <div className="flex items-center gap-3">
             <div className="text-xs text-slate-400 mr-2">
                状態: <span className={connectionStatus.includes('完了') ? 'text-green-400' : 'text-yellow-400'}>{connectionStatus}</span>
             </div>
             <button 
                onClick={onTriggerAlert}
                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded text-sm font-bold shadow-lg shadow-orange-900/20 active:scale-95 transition-all"
             >
                現場への警告 / 起動
             </button>
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">A</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Video Grid */}
        <div className="flex-1 p-4 bg-slate-950 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                {/* Real Remote Feed */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col">
                    <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${remoteStream ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
                            <span className="text-sm font-mono text-slate-300">{siteId} - リアルタイム映像</span>
                        </div>
                        {!remoteStream && (
                            <button 
                                onClick={onRequestStream}
                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                            >
                                映像接続
                            </button>
                        )}
                    </div>
                    <div className="flex-1 bg-black relative flex items-center justify-center group">
                        {remoteStream ? (
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline 
                                className="w-full h-full object-contain bg-black"
                            />
                        ) : (
                            <div className="text-center">
                                <p className="text-slate-500 mb-2">映像信号なし</p>
                                <p className="text-xs text-slate-600">現場端末のカメラが起動するのを待機しています...</p>
                                <button 
                                    onClick={onRequestStream}
                                    className="mt-4 px-4 py-2 border border-slate-700 rounded text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                                >
                                    再接続を試みる
                                </button>
                            </div>
                        )}
                        
                        {remoteStream && (
                            <div className="absolute top-4 right-4 bg-black/50 px-2 py-1 rounded text-xs text-white">
                                LIVE
                            </div>
                        )}
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