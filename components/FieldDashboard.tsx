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
  onStreamReady: (stream: MediaStream) => void;
  adminStream: MediaStream | null; // Added: Admin's video stream
  connectionStatus: string;
  onReconnect?: () => void; 
}

const FieldDashboard: React.FC<FieldDashboardProps> = ({ 
  siteId,
  messages, 
  onSendMessage, 
  onTranscription,
  incomingAlert,
  onClearAlert,
  onStreamReady,
  adminStream,
  connectionStatus,
  onReconnect
}) => {
  const [ecoMode, setEcoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'chat'>('camera');
  const videoRef = useRef<HTMLVideoElement>(null);
  const adminVideoRef = useRef<HTMLVideoElement>(null); // Added
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const { connect, disconnect, isConnected, isSpeaking, volume } = useGenAiLive({
    apiKey: process.env.API_KEY,
    systemInstruction: "あなたは建設現場の安全管理を行うプロフェッショナルなAIアシスタントです。日本語で簡潔に話してください。安全違反や危険な状況を検知したら直ちに警告してください。",
    onTranscription: (text, type) => {
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
        }
      } catch (err) {
        console.error(`${err.name}, ${err.message}`);
      }
    };
    requestWakeLock();
    return () => {
      wakeLockRef.current?.release();
    };
  }, []);

  // Handle Local Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: true 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
        }
        
        onStreamReady(stream);

      } catch (e) {
        console.error("Camera failed", e);
        alert("カメラへのアクセスを許可してください");
      }
    };
    startCamera();
  }, []);

  // Handle Admin Stream
  useEffect(() => {
    if (adminVideoRef.current && adminStream) {
        adminVideoRef.current.srcObject = adminStream;
        // Do NOT mute admin stream, we want to hear them
        // But for testing on same device, it might echo. In production, no mute.
        adminVideoRef.current.play().catch(e => console.error("Admin video play error", e));
    }
  }, [adminStream]);

  // Handle Alert Sound & Visuals
  useEffect(() => {
    if (incomingAlert) {
      // 1. EcoMode解除
      if (ecoMode) {
        setEcoMode(false);
      }

      // 2. Play Chime Sound (Ding-Dong-Dang-Dong)
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          
          const playTone = (freq: number, time: number, duration: number) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              
              osc.connect(gain);
              gain.connect(ctx.destination);
              
              osc.type = 'sine'; // Sine wave for chime
              osc.frequency.setValueAtTime(freq, time);
              
              // Envelope
              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
              gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
              
              osc.start(time);
              osc.stop(time + duration);
          };

          const now = ctx.currentTime;
          // Chime melody: E5, C5, G5, C6 (classic 4-note chime)
          // E5 = 659.25, C5 = 523.25, G5 = 783.99, C6 = 1046.50
          playTone(660, now, 0.6);
          playTone(523, now + 0.5, 0.6);
          playTone(784, now + 1.0, 0.6);
          playTone(1046, now + 1.5, 1.2);

        }
      } catch (e) {
        console.error("Audio playback failed", e);
      }
    }
  }, [incomingAlert, ecoMode]);

  if (ecoMode) {
    return (
      <div 
        className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-green-500 font-mono"
        onClick={() => setEcoMode(false)}
      >
        <div className="text-6xl font-bold animate-pulse mb-8">ECO MODE</div>
        <div className="text-xl">画面をタッチして復帰</div>
        <div className="mt-8 text-sm text-green-900">{siteId} 監視中</div>
        <div className="mt-2 text-xs text-green-800">通信状態: {connectionStatus}</div>
        <div className="absolute bottom-10 animate-bounce">
            {incomingAlert ? "🔔 管理者からの呼出し" : "システム正常"}
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
        <div className="flex items-center gap-2 md:gap-4">
            {/* Connection Status & Reconnect Button */}
            <button 
                onClick={onReconnect}
                className={`hidden md:flex items-center gap-2 px-3 py-1 rounded border text-xs font-bold transition-all ${
                    connectionStatus.includes('完了') 
                    ? 'border-green-800 bg-green-900/20 text-green-400 cursor-default' 
                    : 'border-yellow-600 bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40 animate-pulse'
                }`}
                disabled={connectionStatus.includes('完了')}
            >
                <span className={`w-2 h-2 rounded-full ${connectionStatus.includes('完了') ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {connectionStatus}
            </button>

            <button 
                onClick={() => setEcoMode(true)}
                className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-400 px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm"
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
                {/* Local Camera (Field View) */}
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                />

                {/* Admin Stream Overlay (PiP) */}
                {adminStream && (
                    <div className="absolute top-4 right-4 w-32 md:w-48 aspect-video bg-slate-900 rounded-lg border-2 border-blue-500 overflow-hidden shadow-2xl z-20">
                         <video 
                            ref={adminVideoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 left-0 w-full bg-blue-600/80 text-white text-[10px] text-center">管理者</div>
                    </div>
                )}
                
                {/* Visual Alert Overlay (Calling) */}
                {incomingAlert && (
                    <div className="absolute inset-0 z-50 pointer-events-none border-[12px] border-blue-500/80 animate-pulse flex items-center justify-center bg-blue-900/20">
                        <div className="bg-blue-600 text-white font-black text-4xl md:text-5xl px-8 py-8 rounded-2xl shadow-2xl animate-bounce tracking-widest border-4 border-white flex flex-col items-center gap-4">
                            <span className="text-6xl">🔔</span>
                            <span>管理者からの呼出し</span>
                        </div>
                    </div>
                )}
                
                {/* Connection Status Overlay (Mobile) */}
                {!connectionStatus.includes('完了') && (
                    <div className="absolute top-4 left-4 right-4 bg-yellow-900/80 text-yellow-100 p-2 rounded text-center text-sm backdrop-blur border border-yellow-700/50 z-10">
                        <p className="font-bold mb-1">未接続: 管理者端末を探しています...</p>
                        <button 
                            onClick={onReconnect}
                            className="bg-yellow-700 text-white px-3 py-1 rounded text-xs mt-1"
                        >
                            再試行
                        </button>
                    </div>
                )}
                
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

        {/* Sidebar Tabs */}
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