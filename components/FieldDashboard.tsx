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
  onSetCameraStatus?: (isOff: boolean) => void;
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
  onDeleteMessage,
  onSetCameraStatus
}) => {
  const [ecoMode, setEcoMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adminVideoRef = useRef<HTMLVideoElement>(null); 
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  
  // Camera Off (Privacy) Mode
  const [cameraOffEndTime, setCameraOffEndTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState('');

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

  // --- Privacy Mode Timer Logic ---
  useEffect(() => {
      if (!cameraOffEndTime) return;

      const updateTimer = () => {
          const diff = cameraOffEndTime - Date.now();
          if (diff <= 0) {
              setCameraOffEndTime(null);
              if (onSetCameraStatus) onSetCameraStatus(false);
              return;
          }
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setRemainingTime(`${m}:${s.toString().padStart(2, '0')}`);
      };

      updateTimer(); // Initial
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, [cameraOffEndTime, onSetCameraStatus]);

  // Resend status on reconnect
  useEffect(() => {
      if (connectionStatus.includes('完了') && cameraOffEndTime && onSetCameraStatus) {
          onSetCameraStatus(true);
      }
  }, [connectionStatus, cameraOffEndTime, onSetCameraStatus]);

  // --- Handle Local Camera (Controlled by Call Status) ---
  const startCamera = async () => {
    // Block if privacy mode is active
    if (cameraOffEndTime && Date.now() < cameraOffEndTime) {
        console.log("Camera blocked by privacy mode");
        return;
    }

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

  // Sync Camera with Call Status & Privacy Mode
  useEffect(() => {
      if (cameraOffEndTime) {
          stopCamera();
          return;
      }

      if (callStatus === 'connected') {
          startCamera();
      } else {
          stopCamera();
      }
      // Cleanup on unmount
      return () => {
          stopCamera();
      };
  }, [callStatus, cameraOffEndTime]);


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

  const handleSetPrivacy = (minutes: number) => {
      const endTime = Date.now() + minutes * 60 * 1000;
      setCameraOffEndTime(endTime);
      if (onSetCameraStatus) onSetCameraStatus(true);
      resetInactivityTimer();
  };

  const handleClearPrivacy = () => {
      setCameraOffEndTime(null);
      if (onSetCameraStatus) onSetCameraStatus(false);
      resetInactivityTimer();
  };

  // --- Render Call Widget (Smaller Buttons for Sidebar) ---
  const renderCallWidget = () => {
      // Reduced size: w-28 h-24
      const buttonBaseClass = "w-28 h-24 rounded-xl flex flex-col items-center justify-center gap-1 shadow-xl transition-all active:scale-95 border-2";
      const iconClass = "w-8 h-8";
      const textClass = "font-bold text-sm leading-tight text-center px-1";

      switch (callStatus) {
          case 'incoming':
              return (
                  <div className="flex flex-col gap-2 animate-bounce w-full items-center">
                      <div className="text-white font-bold bg-red-600 px-2 py-1 rounded-full text-xs mb-1 shadow-lg w-full text-center">着信中...</div>
                      <button 
                          onClick={onAcceptCall}
                          className={`${buttonBaseClass} bg-green-600 hover:bg-green-500 border-white text-white`}
                      >
                          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          <span className={textClass}>応答</span>
                      </button>
                      <button 
                          onClick={onEndCall}
                          className="w-full bg-red-600 hover:bg-red-500 py-2 rounded-xl text-white font-bold text-sm border border-white/20"
                      >
                          拒否
                      </button>
                  </div>
              );
          case 'outgoing':
               return (
                  <div className="flex flex-col items-center gap-2 w-full">
                       <div className="text-white font-bold animate-pulse text-xs mb-1">呼出中...</div>
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
                       <div className="text-green-400 font-bold text-xs mb-1 border border-green-500/50 bg-green-900/50 px-2 py-0.5 rounded">通話中</div>
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
                        <span className={textClass}>会話</span>
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

  return (
    <div className="h-screen flex flex-col bg-slate-950 relative">
      {/* Attendance Modal (Unchanged) */}
      {showAttendanceModal && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                {/* ... existing modal content ... */}
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
                {/* ... rest of attendance logic ... */}
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
        {/* SIDEBAR: Controls (Narrower width: w-32) */}
        <div className="w-32 bg-slate-900 border-r border-slate-800 flex flex-col pt-6 items-center gap-6 shrink-0 z-40 overflow-y-auto pb-4">
             {/* 1. Entry/Exit Button */}
             <button 
                onClick={() => {
                    setShowAttendanceModal(true);
                    setAttendanceStep('menu');
                    resetInactivityTimer();
                }}
                className={`w-28 h-24 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-transform active:scale-95 shadow-xl ${
                    showAttendanceModal 
                    ? 'bg-slate-800 border-blue-500 text-blue-400' 
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500'
                }`}
            >
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="text-lg font-bold">入退場</span>
            </button>

            {/* 2. Call Widget */}
            {renderCallWidget()}

            {/* 3. Camera Off (Privacy) Widget */}
            <div className="w-28 flex flex-col gap-2 mt-4 border-t border-slate-800 pt-4">
                {cameraOffEndTime ? (
                    <div className="w-full bg-red-900/30 border border-red-500/50 rounded-xl p-2 text-center animate-pulse">
                         <div className="text-xs text-red-400 font-bold mb-1">カメラ停止中</div>
                         <div className="text-xl font-mono text-white font-bold mb-2">{remainingTime}</div>
                         <button 
                            onClick={handleClearPrivacy}
                            className="w-full py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded"
                         >
                            解除
                         </button>
                    </div>
                ) : (
                    <div className="w-full bg-slate-800 rounded-xl p-2 border border-slate-700">
                         <div className="text-[10px] text-slate-400 font-bold text-center mb-2">カメラ一時停止</div>
                         <div className="grid grid-cols-1 gap-2">
                             {[10, 30, 60].map(min => (
                                 <button
                                    key={min}
                                    onClick={() => handleSetPrivacy(min)}
                                    className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-bold rounded border border-slate-600"
                                 >
                                     {min}分 オフ
                                 </button>
                             ))}
                         </div>
                    </div>
                )}
            </div>
        </div>

        {/* Main Content Area (Merged) */}
        <div className="flex-1 relative bg-black min-w-0">
             
             {/* 1. CHAT INTERFACE (Takes FULL Space when no screen share) */}
             {!adminStream && (
                 <div className="absolute inset-0 z-10 bg-slate-900">
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

             {/* 2. ADMIN VIDEO (Screen Share - Takes FULL Space when active) */}
             {adminStream && (
                 <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                    <video 
                        ref={adminVideoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-contain"
                    />
                 </div>
             )}

             {/* 3. LOCAL CAMERA (PiP - Always floating on bottom right) */}
             {callStatus === 'connected' && !cameraOffEndTime && (
                 <div className="absolute bottom-4 right-4 w-48 aspect-video rounded-lg overflow-hidden border-2 border-slate-600 shadow-2xl z-20 bg-black">
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
             
             {/* 4. Privacy Mode Overlay (In PiP location if active) */}
             {cameraOffEndTime && (
                 <div className="absolute bottom-4 right-4 w-48 aspect-video rounded-lg overflow-hidden border-2 border-red-900/50 shadow-2xl z-20 bg-black/80 flex flex-col items-center justify-center">
                     <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                     </svg>
                     <span className="text-xs text-slate-400">カメラ停止中</span>
                 </div>
             )}

             {/* 5. Incoming Alert Overlay */}
             {(incomingAlert || callStatus === 'incoming') && (
                 <div className="absolute inset-0 z-50 pointer-events-none border-[8px] border-blue-500/80 animate-pulse flex items-center justify-center bg-blue-900/20">
                     <div className="bg-blue-600 text-white font-black text-2xl px-6 py-6 rounded-2xl shadow-2xl animate-bounce tracking-widest border-4 border-white flex flex-col items-center gap-2">
                         <span className="text-4xl">🔔</span>
                         <span>呼出し</span>
                     </div>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default FieldDashboard;