import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Attachment, CallStatus, UserRole } from '../types';
import ChatInterface from './ChatInterface';

interface FieldDashboardProps {
  siteId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment?: Attachment) => void;
  incomingAlert: boolean;
  onClearAlert: () => void;
  onStreamReady: (stream: MediaStream | null) => void;
  adminStream: MediaStream | null; 
  connectionStatus: string;
  onReconnect?: () => void;
  callStatus: CallStatus;
  onStartCall: () => void;
  onAcceptCall: () => void;
  onEndCall: () => void;
  onTranscription: (text: string, type: 'user' | 'model') => void; 
  userName: string;
  onMarkRead: (id: string) => void; 
  userRole: UserRole;
  onDeleteMessage?: (id: string) => void;
}

const FieldDashboard: React.FC<FieldDashboardProps> = ({ 
  siteId,
  messages, 
  onSendMessage, 
  incomingAlert,
  onStreamReady,
  adminStream,
  connectionStatus,
  onReconnect,
  callStatus,
  onStartCall,
  onAcceptCall,
  onEndCall,
  userName,
  onMarkRead,
  userRole,
  onDeleteMessage
}) => {
  const [ecoMode, setEcoMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adminVideoRef = useRef<HTMLVideoElement>(null); 
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  
  // Local stream reference to manage tracks directly
  const localStreamRef = useRef<MediaStream | null>(null);

  // Attendance State
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceStep, setAttendanceStep] = useState<'menu' | 'input' | 'result'>('menu');
  const [attendanceType, setAttendanceType] = useState<'start' | 'end'>('start');
  const [workerName, setWorkerName] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // --- Auto Eco Mode Logic ---
  const resetInactivityTimer = useCallback(() => {
    if (ecoMode) setEcoMode(false);
    
    if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
    }
    // Set timer for 2 minutes (120,000 ms)
    inactivityTimerRef.current = window.setTimeout(() => {
        setEcoMode(true);
    }, 120000); 
  }, [ecoMode]);

  // Initial setup and global events for inactivity
  useEffect(() => {
    resetInactivityTimer();
    
    const events = ['mousedown', 'touchstart', 'mousemove', 'keypress', 'click'];
    const handler = () => resetInactivityTimer();
    
    events.forEach(ev => window.addEventListener(ev, handler));
    
    return () => {
        events.forEach(ev => window.removeEventListener(ev, handler));
        if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  // Wake up on incoming messages or alert or call
  useEffect(() => {
    if (messages.length > 0 || incomingAlert || callStatus === 'incoming') {
        if (ecoMode) {
            setEcoMode(false);
            resetInactivityTimer();
        }
    }
  }, [messages.length, incomingAlert, callStatus, resetInactivityTimer]);


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

  // --- Handle Local Camera (Controlled by Call Status) ---
  const startCamera = async () => {
    try {
      console.log("Starting Camera for Call...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' }, 
          audio: true 
      });
      
      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }
      
      onStreamReady(stream);
    } catch (e) {
      console.error("Camera failed", e);
      alert("カメラへのアクセスを許可してください");
      onEndCall(); // Failed to start camera, end call
    }
  };

  const stopCamera = () => {
     if (localStreamRef.current) {
         console.log("Stopping Camera...");
         localStreamRef.current.getTracks().forEach(track => track.stop());
         localStreamRef.current = null;
         
         if (videoRef.current) {
             videoRef.current.srcObject = null;
         }
         onStreamReady(null);
     }
  };

  // Sync Camera with Call Status
  useEffect(() => {
      if (callStatus === 'connected') {
          startCamera();
      } else {
          stopCamera();
      }
      // Cleanup on unmount
      return () => {
          stopCamera();
      };
  }, [callStatus]);


  // Handle Admin Stream
  useEffect(() => {
    if (adminVideoRef.current && adminStream) {
        adminVideoRef.current.srcObject = adminStream;
        adminVideoRef.current.play().catch(e => console.error("Admin video play error", e));
    }
  }, [adminStream]);

  // Handle Alert Sound & Visuals
  useEffect(() => {
    if (incomingAlert || callStatus === 'incoming') {
      if (ecoMode) setEcoMode(false);

      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const playTone = (freq: number, time: number, duration: number) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, time);
              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
              gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
              osc.start(time);
              osc.stop(time + duration);
          };
          const now = ctx.currentTime;
          playTone(660, now, 0.6);
          playTone(523, now + 0.5, 0.6);
          playTone(784, now + 1.0, 0.6);
          playTone(1046, now + 1.5, 1.2);
        }
      } catch (e) {
        console.error("Audio playback failed", e);
      }
    }
  }, [incomingAlert, callStatus, ecoMode]);

  // Attendance Logic
  useEffect(() => {
    if (showAttendanceModal) {
      const timer = setInterval(() => {
        setCurrentTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      }, 1000);
      setCurrentTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      return () => clearInterval(timer);
    }
  }, [showAttendanceModal]);

  const handleSubmitAttendance = () => {
    if (!workerName.trim()) return;
    resetInactivityTimer();
    
    const now = new Date();
    let logText = '';
    
    if (attendanceType === 'start') {
        logText = `【勤怠:開始】${workerName}さんが作業を開始しました。 (時刻: ${currentTime})`;
    } else {
        const lastStart = [...messages].reverse().find(m => m.text.includes(`【勤怠:開始】${workerName}`));
        let durationInfo = '';
        if (lastStart) {
            const diff = now.getTime() - new Date(lastStart.timestamp).getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            durationInfo = ` [作業時間: ${hours}時間${minutes}分]`;
        }
        logText = `【勤怠:終了】${workerName}さんが作業を終了しました。${durationInfo} (時刻: ${currentTime})`;
    }
    
    onSendMessage(logText);
    setAttendanceStep('result');
  };

  // --- Render Call Widget (Larger Buttons for Sidebar) ---
  const renderCallWidget = () => {
      const buttonBaseClass = "w-44 h-44 rounded-3xl flex flex-col items-center justify-center gap-3 shadow-xl transition-all active:scale-95 border-4";
      const iconClass = "w-20 h-20";
      const textClass = "font-bold text-2xl";

      switch (callStatus) {
          case 'incoming':
              return (
                  <div className="flex flex-col gap-4 animate-bounce w-full items-center">
                      <div className="text-white font-bold bg-red-600 px-4 py-2 rounded-full text-lg mb-2 shadow-lg w-full text-center">着信中...</div>
                      <button 
                          onClick={onAcceptCall}
                          className={`${buttonBaseClass} bg-green-600 hover:bg-green-500 border-white text-white`}
                      >
                          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          <span className={textClass}>応答</span>
                      </button>
                      <button 
                          onClick={onEndCall}
                          className="w-full bg-red-600 hover:bg-red-500 py-3 rounded-xl text-white font-bold text-lg border-2 border-white/20"
                      >
                          拒否
                      </button>
                  </div>
              );
          case 'outgoing':
               return (
                  <div className="flex flex-col items-center gap-2 w-full">
                       <div className="text-white font-bold animate-pulse text-lg mb-1">呼び出し中...</div>
                       <button 
                          onClick={onEndCall}
                          className={`${buttonBaseClass} bg-red-600 hover:bg-red-500 border-white text-white`}
                       >
                           <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                           <span className={textClass}>取消</span>
                       </button>
                  </div>
               );
          case 'connected':
               return (
                  <div className="flex flex-col items-center gap-2 w-full">
                       <div className="text-green-400 font-bold text-lg mb-1 border border-green-500/50 bg-green-900/50 px-3 py-1 rounded">通話中</div>
                       <button 
                          onClick={onEndCall}
                          className={`${buttonBaseClass} bg-red-600 hover:bg-red-500 border-white text-white animate-pulse`}
                       >
                           <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.683A1 1 0 007.28 3H5z" /></svg>
                           <span className={textClass}>終了</span>
                       </button>
                  </div>
               );
          default: // idle
               return (
                   <button 
                       onClick={onStartCall}
                       className={`${buttonBaseClass} bg-blue-600 hover:bg-blue-500 border-blue-400 text-white`}
                   >
                        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span className={textClass}>管理者と会話</span>
                   </button>
               );
      }
  };


  if (ecoMode) {
    return (
      <div 
        className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-green-500 font-mono cursor-pointer"
        onClick={() => resetInactivityTimer()}
      >
        <div className="text-6xl font-bold animate-pulse mb-8">ECO MODE</div>
        <div className="text-xl">画面をタッチして復帰</div>
        <div className="mt-8 text-sm text-green-900">{siteId} 監視中</div>
        <div className="mt-2 text-xs text-green-800">通信状態: {connectionStatus}</div>
        <div className="absolute bottom-10 animate-bounce">
            {(incomingAlert || callStatus === 'incoming') ? "🔔 管理者からの呼出し" : "システム正常"}
        </div>
      </div>
    );
  }

  // Conditions to hide chat
  const shouldHideChat = callStatus === 'connected' || !!adminStream;

  return (
    <div className="h-screen flex flex-col bg-slate-950 relative">
      {/* Attendance Modal (Unchanged) */}
      {showAttendanceModal && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                <button 
                    onClick={() => { setShowAttendanceModal(false); resetInactivityTimer(); }}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white tracking-wider">勤怠管理</h2>
                    <div className="text-sm text-slate-400 mt-1">{siteId}</div>
                </div>

                {attendanceStep === 'menu' && (
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => { setAttendanceType('start'); setAttendanceStep('input'); resetInactivityTimer(); }}
                            className="aspect-square bg-blue-600 hover:bg-blue-500 rounded-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                        >
                             <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                             <span className="font-bold text-lg text-white">作業開始</span>
                        </button>
                        <button 
                            onClick={() => { setAttendanceType('end'); setAttendanceStep('input'); resetInactivityTimer(); }}
                            className="aspect-square bg-orange-600 hover:bg-orange-500 rounded-xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                        >
                             <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                             <span className="font-bold text-lg text-white">作業終了</span>
                        </button>
                    </div>
                )}

                {attendanceStep === 'input' && (
                    <div className="space-y-6">
                         <div className={`text-center py-2 rounded font-bold text-white ${attendanceType === 'start' ? 'bg-blue-600/50' : 'bg-orange-600/50'}`}>
                             {attendanceType === 'start' ? '作業開始' : '作業終了'}
                         </div>
                         
                         <div className="text-center">
                             <div className="text-sm text-slate-400 mb-1">現在時刻</div>
                             <div className="text-4xl font-mono font-bold text-white">{currentTime}</div>
                         </div>

                         <div>
                             <label className="block text-xs font-bold text-slate-400 mb-2">お名前</label>
                             <input 
                                type="text" 
                                value={workerName}
                                onChange={(e) => { setWorkerName(e.target.value); resetInactivityTimer(); }}
                                placeholder="名前を入力してください"
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-4 text-lg text-white text-center focus:border-blue-500 focus:outline-none"
                             />
                         </div>

                         <button 
                            onClick={handleSubmitAttendance}
                            disabled={!workerName.trim()}
                            className={`w-full py-4 rounded-lg font-bold text-white text-lg transition-all ${
                                !workerName.trim() 
                                ? 'bg-slate-700 cursor-not-allowed opacity-50' 
                                : attendanceType === 'start' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                            }`}
                         >
                             記録する
                         </button>
                    </div>
                )}

                {attendanceStep === 'result' && (
                    <div className="text-center space-y-6 py-4">
                        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
                             <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        
                        <h3 className="text-xl font-bold text-white">記録しました</h3>
                        
                        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-slate-200">
                            {attendanceType === 'start' ? (
                                <div>
                                    <p className="font-bold text-blue-400 mb-2">現場から帰られる際にも<br/>入力お願いします</p>
                                    <p className="text-xs text-slate-400">ご安全に！</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="font-bold text-orange-400 mb-2">今日も一日<br/>お疲れ様でした！</p>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => { setShowAttendanceModal(false); resetInactivityTimer(); }}
                            className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold"
                        >
                            閉じる
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Top Bar (Simplified for iPad) */}
      <div className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white tracking-wider">GENBA<span className="text-orange-500">LINK</span></h1>
            <span className="px-3 py-1 bg-blue-900 text-blue-200 text-xs rounded-full border border-blue-700">{siteId}</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
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
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: Controls (Expanded width) */}
        <div className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col pt-6 items-center gap-8 shrink-0 z-40 overflow-y-auto pb-4">
             {/* 1. Entry/Exit Button (Enlarged) */}
             <button 
                onClick={() => {
                    setShowAttendanceModal(true);
                    setAttendanceStep('menu');
                    resetInactivityTimer();
                }}
                className={`w-44 h-44 rounded-3xl flex flex-col items-center justify-center gap-3 border-4 transition-transform active:scale-95 shadow-xl ${
                    showAttendanceModal 
                    ? 'bg-slate-800 border-blue-500 text-blue-400' 
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500'
                }`}
            >
                <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="text-2xl font-bold">入退場</span>
            </button>

            {/* 2. Call Widget (Moved here) */}
            {renderCallWidget()}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex relative bg-black min-w-0">
             {/* Video Area */}
             <div className={`relative bg-black flex items-center justify-center transition-all duration-300 ${shouldHideChat ? 'flex-1' : 'w-[50%] md:w-[45%]'}`}>
                
                {/* 1. Admin Video (Screen Share) - MAIN BACKGROUND LAYER */}
                <video 
                    ref={adminVideoRef} 
                    autoPlay 
                    playsInline 
                    className={`absolute inset-0 w-full h-full z-0 bg-black transition-opacity duration-300 ${
                        adminStream ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ objectFit: 'contain' }}
                />

                {/* 2. Local Camera (Field) */}
                {callStatus === 'connected' && (
                    <div 
                        className={`transition-all duration-500 ease-in-out z-10 ${
                            adminStream 
                            ? 'absolute bottom-24 right-4 w-32 md:w-48 aspect-[3/4] md:aspect-video rounded-lg overflow-hidden border-2 border-slate-600 shadow-2xl' 
                            : 'absolute inset-0 w-full h-full'
                        }`}
                    >
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="w-full h-full object-cover"
                        />
                        {adminStream && (
                            <div className="absolute bottom-0 left-0 w-full bg-black/60 text-white text-[10px] text-center py-0.5 backdrop-blur-sm">
                                自分
                            </div>
                        )}
                    </div>
                )}
                
                {/* Visual Alert Overlay (Calling) - Keeping this for huge visual cue */}
                {(incomingAlert || callStatus === 'incoming') && (
                    <div className="absolute inset-0 z-50 pointer-events-none border-[12px] border-blue-500/80 animate-pulse flex items-center justify-center bg-blue-900/20">
                        <div className="bg-blue-600 text-white font-black text-4xl md:text-5xl px-8 py-8 rounded-2xl shadow-2xl animate-bounce tracking-widest border-4 border-white flex flex-col items-center gap-4">
                            <span className="text-6xl">🔔</span>
                            <span>管理者からの呼出し</span>
                        </div>
                    </div>
                )}
                
                {/* Connection Status Overlay (Mobile/Partial) */}
                {(!connectionStatus.includes('完了') && callStatus !== 'connected' && !adminStream) && (
                    <div className="absolute top-4 left-4 right-4 bg-yellow-900/80 text-yellow-100 p-2 rounded text-center text-sm backdrop-blur border border-yellow-700/50 z-20">
                        <p className="font-bold mb-1">未接続: 管理者端末を探しています...</p>
                        <button 
                            onClick={onReconnect}
                            className="bg-yellow-700 text-white px-3 py-1 rounded text-xs mt-1"
                        >
                            再試行
                        </button>
                    </div>
                )}
             </div>

             {/* Right Chat Sidebar (Expanded & Hideable) */}
             {!shouldHideChat && (
                 <div className="flex-1 border-l border-slate-800 bg-slate-900 flex flex-col min-w-0">
                     <ChatInterface 
                        messages={messages} 
                        onSendMessage={onSendMessage} 
                        userName={userName}
                        onMarkRead={onMarkRead}
                        userRole={userRole}
                        onDeleteMessage={onDeleteMessage} 
                        chatTitle={`${siteId} 現場チャット`}
                        largeMode={true}
                     />
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default FieldDashboard;