import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Attachment, CallStatus, UserRole } from '../types';
import ChatInterface from './ChatInterface';

interface FieldDashboardProps {
  siteId: string;
  siteName?: string;
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
  alertVolume?: number; 
}

type VideoSourceType = 'front' | 'environment' | 'screen';

const FieldDashboard: React.FC<FieldDashboardProps> = ({ 
  siteId,
  siteName,
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
  onSetCameraStatus,
  alertVolume = 1.0 
}) => {
  const [ecoMode, setEcoMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adminVideoRef = useRef<HTMLVideoElement>(null); 
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Privacy Mode
  const [cameraOffEndTime, setCameraOffEndTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState('');

  // Video Source State
  const localStreamRef = useRef<MediaStream | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSourceType>('front');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false); // To track if we are intentionally streaming

  // Attendance State
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceStep, setAttendanceStep] = useState<'menu' | 'input' | 'result'>('menu');
  const [attendanceType, setAttendanceType] = useState<'start' | 'end'>('start');
  const [workerName, setWorkerName] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  const [urgentNotice, setUrgentNotice] = useState<string | null>(null);

  // Initialize Audio
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtxRef.current = new AudioContext();
        }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(e => console.error("Audio resume failed", e));
    }
  }, []);

  // Eco Mode & Inactivity
  const resetInactivityTimer = useCallback(() => {
    if (ecoMode) setEcoMode(false);
    initAudio();
    
    if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = window.setTimeout(() => {
        setEcoMode(true);
    }, 120000); 
  }, [ecoMode, initAudio]);

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

  useEffect(() => {
    if (messages.length > 0 || incomingAlert || callStatus === 'incoming') {
        if (ecoMode) {
            setEcoMode(false);
            resetInactivityTimer();
        }
    }
  }, [messages.length, incomingAlert, callStatus, resetInactivityTimer]);

  useEffect(() => {
      if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.sender !== userName && lastMsg.text.startsWith('【共通連絡事項】')) {
              setUrgentNotice(lastMsg.text.replace('【共通連絡事項】', '').trim());
              resetInactivityTimer();
          }
      }
  }, [messages, userName, resetInactivityTimer]);

  // Wake Lock
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

  // Privacy Timer
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
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, [cameraOffEndTime, onSetCameraStatus]);

  useEffect(() => {
      if (connectionStatus.includes('完了') && cameraOffEndTime && onSetCameraStatus) {
          onSetCameraStatus(true);
      }
  }, [connectionStatus, cameraOffEndTime, onSetCameraStatus]);

  // --- Local Camera / Screen Share Logic ---
  const stopCurrentStream = () => {
     if (localStreamRef.current) {
         localStreamRef.current.getTracks().forEach(track => track.stop());
         localStreamRef.current = null;
     }
     if (videoRef.current) videoRef.current.srcObject = null;
     onStreamReady(null);
     setIsScreenSharing(false);
     setIsStreamActive(false);
  };

  const startStream = async (type: VideoSourceType) => {
    if (cameraOffEndTime && Date.now() < cameraOffEndTime) return;
    
    // Stop previous stream ONLY if source type is different or restarting
    // But for simplicity in this implementation, we restart.
    stopCurrentStream();

    try {
      let stream: MediaStream;

      if (type === 'screen') {
          // Screen Share
          stream = await navigator.mediaDevices.getDisplayMedia({
              video: { cursor: "always" } as any,
              audio: false // Screen audio not supported on all mobile browsers
          });
          setIsScreenSharing(true);
          
          // Detect stop sharing (e.g. from system UI)
          stream.getVideoTracks()[0].onended = () => {
              console.log("Screen share ended by system");
              setVideoSource('front'); // Revert to front camera
              startStream('front');
          };

      } else {
          // Camera (Front or Environment)
          const facingMode = type === 'front' ? 'user' : 'environment';
          stream = await navigator.mediaDevices.getUserMedia({ 
              video: { 
                  facingMode: facingMode,
                  width: { ideal: 1280 },
                  height: { ideal: 720 }
              }, 
              audio: true 
          });
          setIsScreenSharing(false);
      }

      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }
      
      onStreamReady(stream);
      setVideoSource(type);
      setIsStreamActive(true);

    } catch (e) {
      console.error("Stream start failed", e);
      // Fallback or error handling
      if (type !== 'front') {
          setVideoSource('front');
          startStream('front');
      }
    }
  };

  // Switch Handler
  const handleSourceSwitch = (type: VideoSourceType) => {
      startStream(type);
  };

  // --- MODIFIED: Stream Persistence Logic ---
  // Previously, we stopped stream when callStatus changed to idle.
  // Now, we ONLY stop if privacy mode is active. We allow manual start/stop.
  useEffect(() => {
      if (cameraOffEndTime) {
          stopCurrentStream();
      }
      // REMOVED: else { stopCurrentStream() } logic. 
      // Stream persists until Privacy Mode or User explicitly stops (via UI we might add later, or browser refresh)
  }, [cameraOffEndTime]);


  // Handle Admin Stream (CRITICAL for iPad Screen Sharing)
  useEffect(() => {
    if (adminVideoRef.current) {
        if (adminStream) {
            console.log("Setting Admin Stream to Video Element", adminStream.id);
            adminVideoRef.current.srcObject = adminStream;
            // IMPORTANT: 'muted' is required for autoPlay on iOS Safari even if stream has no audio
            adminVideoRef.current.muted = true; 
            adminVideoRef.current.playsInline = true;
            adminVideoRef.current.play().catch(e => console.log("Admin video play error", e));
        } else {
            adminVideoRef.current.srcObject = null;
        }
    }
  }, [adminStream]);

  // Alert Sound
  useEffect(() => {
    if (incomingAlert || callStatus === 'incoming') {
      if (ecoMode) setEcoMode(false);
      initAudio();
      try {
        const ctx = audioCtxRef.current;
        if (ctx) {
          if (ctx.state === 'suspended') ctx.resume();
          const playTone = (freq: number, time: number, duration: number) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, time);
              
              const volumeMultiplier = 5.0; 
              const finalVolume = alertVolume * volumeMultiplier;

              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(finalVolume, time + 0.05); 
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
  }, [incomingAlert, callStatus, ecoMode, alertVolume, initAudio]);

  // Attendance Clock
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

  const renderCallWidget = () => {
      const buttonBaseClass = "w-28 h-24 rounded-xl flex flex-col items-center justify-center gap-1 shadow-xl transition-all active:scale-95 border-2";
      
      // Video Source Switcher (Always visible now to allow manual start)
      const sourceSwitcher = (
           <div className="flex gap-1 mt-2 w-full bg-slate-800 p-1 rounded-lg border border-slate-700">
               <button 
                 onClick={() => handleSourceSwitch('front')}
                 className={`flex-1 py-2 rounded flex items-center justify-center ${videoSource === 'front' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                 title="自撮り"
               >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
               </button>
               <button 
                 onClick={() => handleSourceSwitch('environment')}
                 className={`flex-1 py-2 rounded flex items-center justify-center ${videoSource === 'environment' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                 title="外向きカメラ"
               >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               </button>
               <button 
                 onClick={() => handleSourceSwitch('screen')}
                 className={`flex-1 py-2 rounded flex items-center justify-center ${videoSource === 'screen' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                 title="Reolink画面共有"
               >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
               </button>
           </div>
      );

      switch (callStatus) {
          case 'incoming':
              return (
                  <div className="flex flex-col gap-2 animate-bounce w-full items-center">
                      <div className="text-white font-bold bg-red-600 px-2 py-1 rounded-full text-xs mb-1 shadow-lg w-full text-center">着信中...</div>
                      <button onClick={onAcceptCall} className={`${buttonBaseClass} bg-green-600 hover:bg-green-500 border-white text-white`}>
                          <span className="font-bold text-sm">応答</span>
                      </button>
                      <button onClick={onEndCall} className="w-full bg-red-600 hover:bg-red-500 py-2 rounded-xl text-white font-bold text-sm border border-white/20">拒否</button>
                  </div>
              );
          case 'outgoing':
               return (
                  <div className="flex flex-col items-center gap-2 w-full">
                       <div className="text-white font-bold animate-pulse text-xs mb-1">呼出中...</div>
                       <button onClick={onEndCall} className={`${buttonBaseClass} bg-red-600 hover:bg-red-500 border-white text-white`}>
                           <span className="font-bold text-sm">取消</span>
                       </button>
                       {sourceSwitcher}
                  </div>
               );
          case 'connected':
               return (
                  <div className="flex flex-col items-center gap-2 w-full">
                       <div className="text-green-400 font-bold text-xs mb-1 border border-green-500/50 bg-green-900/50 px-2 py-0.5 rounded">通話中</div>
                       <button onClick={onEndCall} className={`${buttonBaseClass} bg-red-600 hover:bg-red-500 border-white text-white animate-pulse`}>
                           <span className="font-bold text-sm">終了</span>
                       </button>
                       {sourceSwitcher}
                  </div>
               );
          default:
               // IDLE STATE
               return (
                   <div className="flex flex-col gap-2">
                        {isStreamActive ? (
                            <div className="flex flex-col gap-1 w-full">
                                <div className="text-center text-[10px] text-orange-400 font-bold bg-orange-900/30 border border-orange-500/30 rounded py-1 animate-pulse">
                                    映像送信中 (待機)
                                </div>
                                <button onClick={stopCurrentStream} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1 rounded">停止</button>
                            </div>
                        ) : (
                            <div className="text-center text-[10px] text-slate-500 mb-1">
                                映像停止中
                            </div>
                        )}

                        <button onClick={onStartCall} className={`${buttonBaseClass} bg-blue-600 hover:bg-blue-500 border-blue-400 text-white`}>
                                <span className="font-bold text-sm">会話</span>
                        </button>
                        
                        {/* Always show switcher to allow pre-flight setup or "Always On" setup */}
                        {sourceSwitcher}
                   </div>
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
      {urgentNotice && (
          <div className="absolute inset-0 z-[100] bg-yellow-950/90 flex flex-col items-center justify-center p-8 backdrop-blur animate-in fade-in zoom-in duration-300">
              <div className="w-full max-w-2xl bg-slate-900 border-2 border-yellow-500 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-2 bg-yellow-500 animate-pulse"></div>
                   <h2 className="text-3xl font-black text-yellow-500 tracking-widest mb-2">共通連絡事項</h2>
                   <p className="text-2xl md:text-4xl font-bold text-white leading-relaxed mb-8 whitespace-pre-wrap">{urgentNotice}</p>
                   <button onClick={() => { setUrgentNotice(null); resetInactivityTimer(); }} className="bg-white hover:bg-slate-200 text-slate-900 font-black text-xl px-12 py-4 rounded-xl shadow-xl transition-transform active:scale-95">確認しました</button>
              </div>
          </div>
      )}

      {showAttendanceModal && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
                <button onClick={() => { setShowAttendanceModal(false); resetInactivityTimer(); }} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white tracking-wider">勤怠管理</h2>
                    <div className="text-sm text-slate-400 mt-1">{siteName || siteId}</div>
                </div>
                {attendanceStep === 'menu' && (
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setAttendanceType('start'); setAttendanceStep('input'); resetInactivityTimer(); }} className="aspect-square bg-blue-600 hover:bg-blue-500 rounded-xl flex flex-col items-center justify-center gap-2">
                             <span className="font-bold text-lg text-white">作業開始</span>
                        </button>
                        <button onClick={() => { setAttendanceType('end'); setAttendanceStep('input'); resetInactivityTimer(); }} className="aspect-square bg-orange-600 hover:bg-orange-500 rounded-xl flex flex-col items-center justify-center gap-2">
                             <span className="font-bold text-lg text-white">作業終了</span>
                        </button>
                    </div>
                )}
                {attendanceStep === 'input' && (
                    <div className="space-y-6">
                         <div className="text-center"><div className="text-4xl font-mono font-bold text-white">{currentTime}</div></div>
                         <input type="text" value={workerName} onChange={(e) => { setWorkerName(e.target.value); resetInactivityTimer(); }} placeholder="名前を入力してください" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-4 text-lg text-white text-center" />
                         <button onClick={handleSubmitAttendance} disabled={!workerName.trim()} className="w-full py-4 rounded-lg font-bold text-white text-lg bg-blue-600 hover:bg-blue-500">記録する</button>
                    </div>
                )}
                {attendanceStep === 'result' && (
                    <div className="text-center space-y-6 py-4">
                        <h3 className="text-xl font-bold text-white">記録しました</h3>
                        <button onClick={() => { setShowAttendanceModal(false); resetInactivityTimer(); }} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold">閉じる</button>
                    </div>
                )}
            </div>
        </div>
      )}

      <div className="h-16 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white tracking-wider">GENBA<span className="text-orange-500">LINK</span></h1>
            <span className="px-3 py-1 bg-blue-900 text-blue-200 text-xs rounded-full border border-blue-700">{siteName || siteId}</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
            <button 
                onClick={onReconnect}
                className={`hidden md:flex items-center gap-2 px-3 py-1 rounded border text-xs font-bold transition-all border-yellow-600 bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40 cursor-pointer active:scale-95`}
            >
                <span className={`w-2 h-2 rounded-full ${connectionStatus.includes('完了') ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></span>
                {connectionStatus === '未接続' || connectionStatus.includes('切断') ? '再接続 (タップ)' : connectionStatus}
            </button>

            <button onClick={() => setEcoMode(true)} className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-400 px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm">
                エコモード
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-32 bg-slate-900 border-r border-slate-800 flex flex-col pt-6 items-center gap-6 shrink-0 z-40 overflow-y-auto pb-4">
             <button 
                onClick={() => { setShowAttendanceModal(true); setAttendanceStep('menu'); resetInactivityTimer(); }}
                className="w-28 h-24 rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-transform active:scale-95 shadow-xl bg-slate-800 border-slate-600 text-slate-300 hover:text-white"
            >
                <span className="text-lg font-bold">入退場</span>
            </button>

            {renderCallWidget()}

            <div className="w-28 flex flex-col gap-2 mt-4 border-t border-slate-800 pt-4">
                {cameraOffEndTime ? (
                    <div className="w-full bg-red-900/30 border border-red-500/50 rounded-xl p-2 text-center animate-pulse">
                         <div className="text-xs text-red-400 font-bold mb-1">カメラ停止中</div>
                         <div className="text-xl font-mono text-white font-bold mb-2">{remainingTime}</div>
                         <button onClick={handleClearPrivacy} className="w-full py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded">解除</button>
                    </div>
                ) : (
                    <div className="w-full bg-slate-800 rounded-xl p-2 border border-slate-700">
                         <div className="text-[10px] text-slate-400 font-bold text-center mb-2">カメラ一時停止</div>
                         <div className="grid grid-cols-1 gap-2">
                             {[10, 30, 60].map(min => (
                                 <button key={min} onClick={() => handleSetPrivacy(min)} className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-bold rounded border border-slate-600">{min}分 オフ</button>
                             ))}
                         </div>
                    </div>
                )}
            </div>
        </div>

        <div className="flex-1 relative bg-black min-w-0 flex flex-col">
             
             {/* CHAT LAYER */}
             <div className={`absolute inset-0 bg-slate-900 z-10 transition-opacity duration-300 flex flex-col ${adminStream ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                 <ChatInterface 
                    messages={messages} 
                    onSendMessage={onSendMessage} 
                    userName={userName}
                    onMarkRead={onMarkRead}
                    userRole={userRole}
                    onDeleteMessage={onDeleteMessage} 
                    chatTitle={`${siteName || siteId} 現場チャット`}
                    largeMode={true}
                 />
             </div>

             {/* ADMIN VIDEO LAYER */}
             <div className={`absolute inset-0 bg-black flex items-center justify-center transition-opacity duration-300 ${adminStream ? 'z-20 opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}>
                <video 
                    ref={adminVideoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-contain"
                />
             </div>

             {/* LOCAL CAMERA (PiP) */}
             {(isStreamActive && !cameraOffEndTime) && (
                 <div className="absolute bottom-4 right-4 w-48 aspect-video rounded-lg overflow-hidden border-2 border-slate-600 shadow-2xl z-30 bg-black">
                     <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                     <div className={`absolute bottom-0 left-0 w-full py-0.5 backdrop-blur-sm text-[10px] text-center text-white ${isScreenSharing ? 'bg-orange-600/80' : 'bg-black/60'}`}>
                         {isScreenSharing ? '画面共有中 (監視中)' : 'カメラ送信中'}
                     </div>
                 </div>
             )}
             
             {/* Privacy Overlay */}
             {cameraOffEndTime && (
                 <div className="absolute bottom-4 right-4 w-48 aspect-video rounded-lg overflow-hidden border-2 border-red-900/50 shadow-2xl z-30 bg-black/80 flex flex-col items-center justify-center">
                     <span className="text-xs text-slate-400">カメラ停止中</span>
                 </div>
             )}

             {/* Incoming Alert Overlay */}
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