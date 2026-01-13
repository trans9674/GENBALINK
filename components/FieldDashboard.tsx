import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import ChatInterface from './ChatInterface';
import { useGenAiLive } from '../hooks/useGenAiLive';

interface FieldDashboardProps {
  siteId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTranscription: (text: string, type: 'user' | 'model') => void;
  incomingAlert: boolean;
  onClearAlert: () => void;
}

const FieldDashboard: React.FC<FieldDashboardProps> = ({ 
  siteId,
  messages, 
  onSendMessage, 
  onTranscription,
  incomingAlert,
  onClearAlert
}) => {
  const [ecoMode, setEcoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'chat'>('camera');
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const { connect, disconnect, isConnected, isSpeaking, volume } = useGenAiLive({
    apiKey: process.env.API_KEY,
    systemInstruction: "あなたは建設現場の安全管理を行うプロフェッショナルなAIアシスタントです。日本語で簡潔に話してください。安全違反や危険な状況を検知したら直ちに警告してください。",
    onTranscription: (text, type) => {
        // Exit Eco Mode on AI interaction
        if (ecoMode) setEcoMode(false); 
        onTranscription(text, type);
    }
  });

  // Handle Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock active');
          wakeLockRef.current.addEventListener('release', () => {
            console.log('Wake Lock released');
          });
        }
      } catch (err) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  // Handle Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, // Back camera for field work
            audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error("Camera failed", e);
      }
    };
    startCamera();
  }, []);

  // Handle Incoming Alert/Wake from Eco Mode
  useEffect(() => {
    if (incomingAlert && ecoMode) {
      setEcoMode(false);
      onClearAlert();
      // Play a sound or vibrate here in a real app
    }
  }, [incomingAlert, ecoMode, onClearAlert]);

  // Eco Mode Overlay
  if (ecoMode) {
    return (
      <div 
        className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-green-500 font-mono"
        onClick={() => setEcoMode(false)}
      >
        <div className="text-6xl font-bold animate-pulse mb-8">ECO MODE</div>
        <div className="text-xl">画面をタッチして復帰</div>
        <div className="mt-8 text-sm text-green-900">{siteId} 監視中</div>
        <div className="absolute bottom-10 animate-bounce">
            {incomingAlert ? "⚠️ 緊急アラート着信" : "システム正常"}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Top Bar */}
      <div className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white tracking-wider">GENBA<span className="text-orange-500">LINK</span></h1>
            <span className="px-3 py-1 bg-blue-900 text-blue-200 text-xs rounded-full border border-blue-700">{siteId}</span>
        </div>
        <div className="flex items-center gap-4">
            <button 
                onClick={() => setEcoMode(true)}
                className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-400 px-6 py-2 rounded-lg font-bold flex items-center gap-2"
            >
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                エコモード
            </button>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 relative bg-black">
          {activeTab === 'camera' && (
            <div className="relative h-full w-full">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                />
                
                {/* AI Visualizer Overlay */}
                <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                    <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 max-w-md">
                         <div className="text-xs text-slate-400 mb-1">AIアシスタント ステータス</div>
                         <div className="flex items-center gap-4">
                             <button
                                onClick={isConnected ? disconnect : connect}
                                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                                    isConnected ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                             >
                                {isConnected ? (
                                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : (
                                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                )}
                             </button>
                             <div className="flex-1">
                                 <div className="text-white font-medium mb-1">
                                    {isConnected ? (isSpeaking ? "AI発話中..." : "聞き取り中...") : "AI未接続"}
                                 </div>
                                 {/* Volume Visualizer */}
                                 <div className="flex items-end gap-1 h-8">
                                    {[...Array(5)].map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="w-2 bg-blue-500 transition-all duration-75 rounded-t"
                                            style={{ 
                                                height: isConnected ? `${Math.max(10, Math.min(100, volume * 1000 * (Math.random() + 0.5)))}%` : '10%',
                                                opacity: isConnected ? 1 : 0.3
                                            }}
                                        />
                                    ))}
                                 </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
          )}
          {activeTab === 'chat' && (
             <ChatInterface messages={messages} onSendMessage={onSendMessage} role="Field" />
          )}
        </div>

        {/* Sidebar Tabs (Thumb friendly) */}
        <div className="w-24 bg-slate-900 border-l border-slate-700 flex flex-col">
            <button 
                onClick={() => setActiveTab('camera')}
                className={`flex-1 flex flex-col items-center justify-center gap-2 border-b border-slate-700 ${activeTab === 'camera' ? 'bg-slate-800 text-blue-400' : 'text-slate-400'}`}
            >
                 <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-bold">ライブ</span>
            </button>
            <button 
                onClick={() => setActiveTab('chat')}
                className={`flex-1 flex flex-col items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-slate-800 text-blue-400' : 'text-slate-400'}`}
            >
                <div className="relative">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    {messages.some(m => !m.isRead && m.sender !== 'Field') && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
                    )}
                </div>
                <span className="text-xs font-bold">チャット</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default FieldDashboard;