import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import ChatInterface from './ChatInterface';

interface AdminDashboardProps {
  siteId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTriggerAlert: () => void;
  remoteStream: MediaStream | null; // 現場の映像
  localStream: MediaStream | null;  // 自分の映像
  onToggleCamera: () => void;
  connectionStatus: string;
  onRequestStream: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    siteId, 
    messages, 
    onSendMessage, 
    onTriggerAlert,
    remoteStream,
    localStream,
    onToggleCamera,
    connectionStatus,
    onRequestStream
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = true; // Auto-play policy
        remoteVideoRef.current.play().catch(e => console.error("Remote Play error:", e));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true; // Always mute self
    }
  }, [localStream]);

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
             <div className="text-xs text-slate-400 mr-2 flex flex-col items-end">
                <span>Status</span>
                <span className={`font-bold ${connectionStatus.includes('完了') ? 'text-green-400' : 'text-yellow-400'}`}>{connectionStatus}</span>
             </div>
             <button 
                onClick={onToggleCamera}
                className={`px-4 py-1.5 rounded text-sm font-bold shadow-lg transition-all border ${
                    localStream 
                    ? 'bg-red-600 border-red-500 text-white hover:bg-red-700 animate-pulse' 
                    : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                }`}
             >
                {localStream ? '配信停止' : 'カメラ配信'}
             </button>
             <button 
                onClick={onTriggerAlert}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center gap-2"
             >
                <span>🔔</span>
                呼出し
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
                        <div className="flex gap-2">
                           {!remoteStream && (
                                <button 
                                    onClick={onRequestStream}
                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-bold transition-colors"
                                >
                                    映像を要求
                                </button>
                           )}
                           {remoteStream && (
                               <button 
                                    onClick={() => {
                                        if (remoteVideoRef.current) {
                                            remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
                                        }
                                    }}
                                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded font-bold transition-colors"
                               >
                                   音声切替
                               </button>
                           )}
                        </div>
                    </div>
                    <div className="flex-1 bg-black relative flex items-center justify-center group">
                        {remoteStream ? (
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline 
                                muted // Default muted
                                className="w-full h-full object-contain bg-black"
                            />
                        ) : (
                            <div className="text-center p-8">
                                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-slate-500 mb-2">映像信号を待機中...</p>
                            </div>
                        )}
                        
                        {/* Admin Self View (PiP) */}
                        {localStream && (
                            <div className="absolute bottom-4 right-4 w-32 md:w-48 aspect-video bg-black rounded-lg border border-slate-600 overflow-hidden shadow-2xl">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] px-1">REC</div>
                            </div>
                        )}
                        
                        {remoteStream && (
                            <div className="absolute top-4 right-4 bg-red-600/80 px-2 py-1 rounded text-xs text-white font-bold animate-pulse">
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