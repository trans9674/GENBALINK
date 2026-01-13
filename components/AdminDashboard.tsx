import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, Attachment, CallStatus, UserRole } from '../types';
import ChatInterface from './ChatInterface';

interface AdminDashboardProps {
  siteId: string;
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment?: Attachment) => void;
  onTriggerAlert: () => void;
  remoteStream: MediaStream | null; 
  localStream: MediaStream | null;  
  onStreamReady: (stream: MediaStream | null) => void; 
  connectionStatus: string;
  onRequestStream: () => void;
  callStatus: CallStatus;
  onStartCall: () => void;
  onAcceptCall: () => void;
  onEndCall: () => void;
  userName: string;
  userRole: UserRole;
  onMarkRead: (id: string) => void;
}

// Annotation types
type Tool = 'cursor' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'text';
type Color = '#ef4444' | '#3b82f6' | '#eab308' | '#22c55e'; // Red, Blue, Yellow, Green

interface Shape {
  id: string;
  tool: Tool;
  color: string;
  startX: number;
  startY: number;
  endX?: number;
  endY?: number;
  points?: {x: number, y: number}[]; // For freehand pen
  text?: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    siteId, 
    messages, 
    onSendMessage, 
    onTriggerAlert,
    remoteStream, 
    localStream,
    onStreamReady,
    connectionStatus,
    onRequestStream,
    callStatus,
    onStartCall,
    onAcceptCall,
    onEndCall,
    userName,
    userRole,
    onMarkRead
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  // Screen Share & Annotation State
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenVideoRef = useRef<HTMLVideoElement>(null); // Hidden video for raw screen
  const displayStreamRef = useRef<MediaStream | null>(null); // Ref to hold the stream
  const canvasRef = useRef<HTMLCanvasElement>(null); // Visible canvas for composition
  
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [activeColor, setActiveColor] = useState<Color>('#ef4444');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Text Input State
  const [textInput, setTextInput] = useState<{visible: boolean, x: number, y: number, value: string} | null>(null);

  // --- Remote Video Handling ---
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = true; // Ensure muted in JS
        remoteVideoRef.current.play().catch(e => console.error("Remote Play error:", e));
    }
  }, [remoteStream]);

  // --- Local Camera Handling (When NOT screen sharing) ---
  useEffect(() => {
    if (localVideoRef.current && localStream && !isScreenSharing) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true;
    }
  }, [localStream, isScreenSharing]);


  // --- Stop Screen Share ---
  const stopScreenShare = () => {
    if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach(t => t.stop());
        displayStreamRef.current = null;
    }
    if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
    setShapes([]); // Clear annotations
    onStreamReady(null); // Notify App to stop stream
  };

  // --- Toggle Camera (Switch between Camera and Screen Share or Off) ---
  const toggleCamera = async () => {
    const wasScreenSharing = isScreenSharing;

    // 1. If currently sharing screen, stop it first, then start camera
    if (wasScreenSharing) {
        // Internally stop screen share resources
        if (displayStreamRef.current) {
            displayStreamRef.current.getTracks().forEach(t => t.stop());
            displayStreamRef.current = null;
        }
        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
        }
        setIsScreenSharing(false);
        setShapes([]);
        // Note: We do NOT call onStreamReady(null) here because we are about to switch streams immediately.
        // Calling it would cause a flicker or potential race condition with the new stream.
    } else if (localStream) {
        // 2. If camera is on (and not screen sharing), just turn it off
        onStreamReady(null);
        return;
    }

    // 3. Start Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        onStreamReady(stream);
    } catch (e) {
        console.error("Camera Error", e);
        alert("カメラへのアクセスを許可してください");
        // If we switched off screen share but failed to get camera, ensure we clear the stream state
        if (wasScreenSharing) {
            onStreamReady(null);
        }
    }
  };

  // --- Start Screen Share ---
  const startScreenShare = async () => {
    try {
      if (localStream) onStreamReady(null); // Stop current stream first

      // Hint to avoid tabs if browser supports it (displaySurface)
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { 
              cursor: "always",
              displaySurface: "window" // Hint to prefer window over tab
          } as any, 
          audio: false 
      });
      
      displayStreamRef.current = stream;
      setIsScreenSharing(true); // This triggers render, showing the video element
      setActiveTool('pen'); 

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
      };

    } catch (e) {
      console.error("Screen Share Error", e);
    }
  };

  // --- Effect to Attach Stream to Video Element ---
  useEffect(() => {
      if (isScreenSharing && screenVideoRef.current && displayStreamRef.current) {
          screenVideoRef.current.srcObject = displayStreamRef.current;
          // Ensure playback starts for canvas consumption
          screenVideoRef.current.onloadedmetadata = () => {
             screenVideoRef.current?.play().catch(e => console.error("Screen Play Error:", e));
          };
      }
  }, [isScreenSharing]);


  // --- Canvas Composition Loop (Video + Annotations) ---
  useEffect(() => {
    if (!isScreenSharing || !canvasRef.current || !screenVideoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = screenVideoRef.current;
    let animationFrameId: number;

    // Output stream from canvas
    const stream = canvas.captureStream(30);
    onStreamReady(stream);

    const render = () => {
        if (!ctx || !video) return;

        // Match canvas size to video size
        if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // 1. Draw Video Frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Only draw if video has dimensions
        if (video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        // 2. Draw Shapes
        const drawShape = (s: Shape) => {
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            if (s.tool === 'pen' && s.points) {
                if (s.points.length > 0) {
                    ctx.moveTo(s.points[0].x, s.points[0].y);
                    for (let i = 1; i < s.points.length; i++) {
                        ctx.lineTo(s.points[i].x, s.points[i].y);
                    }
                    ctx.stroke();
                }
            } else if (s.startX !== undefined && s.startY !== undefined) {
                const ex = s.endX || s.startX;
                const ey = s.endY || s.startY;

                if (s.tool === 'line') {
                    ctx.moveTo(s.startX, s.startY);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                } else if (s.tool === 'arrow') {
                    const headlen = 20;
                    const angle = Math.atan2(ey - s.startY, ex - s.startX);
                    ctx.moveTo(s.startX, s.startY);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                    
                    // Arrowhead
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.fill();
                } else if (s.tool === 'rect') {
                    ctx.strokeRect(s.startX, s.startY, ex - s.startX, ey - s.startY);
                } else if (s.tool === 'circle') {
                    const radius = Math.sqrt(Math.pow(ex - s.startX, 2) + Math.pow(ey - s.startY, 2));
                    ctx.beginPath();
                    ctx.arc(s.startX, s.startY, radius, 0, 2 * Math.PI);
                    ctx.stroke();
                } else if (s.tool === 'text' && s.text) {
                    ctx.font = 'bold 48px sans-serif';
                    ctx.fillText(s.text, s.startX, s.startY);
                }
            }
        };

        shapes.forEach(drawShape);
        if (currentShape) drawShape(currentShape);

        animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [isScreenSharing, shapes, currentShape]); 


  // --- Mouse Event Handlers for Drawing ---
  const getCanvasCoords = (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
      };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (!isScreenSharing || activeTool === 'cursor') return;
      
      const { x, y } = getCanvasCoords(e);

      if (activeTool === 'text') {
          setTextInput({ visible: true, x: e.clientX, y: e.clientY, value: '' }); 
          setCurrentShape({
              id: Date.now().toString(),
              tool: 'text',
              color: activeColor,
              startX: x,
              startY: y, 
          });
          return;
      }

      setIsDrawing(true);
      setCurrentShape({
          id: Date.now().toString(),
          tool: activeTool,
          color: activeColor,
          startX: x,
          startY: y,
          endX: x,
          endY: y,
          points: activeTool === 'pen' ? [{x, y}] : undefined
      });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDrawing || !currentShape) return;
      const { x, y } = getCanvasCoords(e);

      setCurrentShape(prev => {
          if (!prev) return null;
          if (prev.tool === 'pen') {
              return { ...prev, points: [...(prev.points || []), {x, y}] };
          } else {
              return { ...prev, endX: x, endY: y };
          }
      });
  };

  const handleMouseUp = () => {
      if (isDrawing && currentShape) {
          setShapes(prev => [...prev, currentShape]);
          setIsDrawing(false);
          setCurrentShape(null);
      }
  };

  const confirmText = () => {
      if (textInput && currentShape) {
          setShapes(prev => [...prev, { ...currentShape, text: textInput.value }]);
          setTextInput(null);
          setCurrentShape(null);
      }
  };


  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="h-24 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-10 shadow-md z-10">
        <div className="flex items-center gap-8">
            {/* Logo */}
            <h1 className="text-3xl font-bold text-white tracking-widest">GENBA<span className="text-orange-500">LINK</span> <span className="text-slate-500 text-xl ml-3 font-normal">管理者コンソール ({userName})</span></h1>
            <nav className="hidden md:flex space-x-8">
                <button className="text-slate-300 hover:text-white text-lg font-medium">ダッシュボード</button>
                <div className="flex items-center gap-3">
                     <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span>
                     <span className="text-blue-400 text-lg font-medium">現場ID: {siteId}</span>
                </div>
            </nav>
        </div>
        <div className="flex items-center gap-6">
             <div className="text-base text-slate-400 mr-2 flex flex-col items-end">
                <span>Status</span>
                <span className={`font-bold ${connectionStatus.includes('完了') ? 'text-green-400' : 'text-yellow-400'}`}>{connectionStatus}</span>
             </div>
             
             {/* Call Button */}
             {callStatus === 'incoming' ? (
                 <button onClick={onAcceptCall} className="bg-green-600 hover:bg-green-500 text-white px-8 py-3.5 rounded-xl text-lg font-bold shadow animate-bounce">
                     着信に応答
                 </button>
             ) : callStatus === 'connected' ? (
                 <button onClick={onEndCall} className="bg-red-600 hover:bg-red-500 text-white px-8 py-3.5 rounded-xl text-lg font-bold shadow animate-pulse">
                     通話終了
                 </button>
             ) : (
                 <button 
                     onClick={callStatus === 'outgoing' ? onEndCall : onStartCall} 
                     className={`px-8 py-3.5 rounded-xl text-lg font-bold shadow-lg transition-all border flex items-center gap-3 ${
                        callStatus === 'outgoing' 
                        ? 'bg-red-500/80 border-red-500 text-white hover:bg-red-600 animate-pulse' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                     }`}
                 >
                     <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {callStatus === 'outgoing' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        )}
                     </svg>
                     {callStatus === 'outgoing' ? 'キャンセル' : '通話'}
                 </button>
             )}

             {/* Camera Toggle Button (Renamed to Live Camera) */}
             <button 
                onClick={toggleCamera}
                className={`px-8 py-3.5 rounded-xl text-lg font-bold shadow-lg transition-all border ${
                    localStream && !isScreenSharing
                    ? 'bg-red-600 border-red-500 text-white hover:bg-red-700 animate-pulse' 
                    : isScreenSharing
                        ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700' // Green "Return" button
                        : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                }`}
             >
                {localStream && !isScreenSharing ? '配信停止' : isScreenSharing ? 'カメラに戻る' : 'ライブカメラ'}
             </button>

             {/* Screen Share Toggle */}
             <button 
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`px-8 py-3.5 rounded-xl text-lg font-bold shadow-lg transition-all border flex items-center gap-3 ${
                    isScreenSharing
                    ? 'bg-orange-600 border-orange-500 text-white hover:bg-orange-700' 
                    : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                }`}
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {isScreenSharing ? '共有停止' : '画面共有'}
             </button>

             {/* Alert Button */}
             <button 
                onClick={onTriggerAlert}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl text-lg font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center gap-3"
             >
                <span className="text-2xl">🔔</span>
                呼出し
             </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Video Grid */}
        <div className="flex-1 p-4 bg-slate-950 overflow-y-auto flex flex-col">
            <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col">
                
                {/* Header for Viewport */}
                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${remoteStream ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
                        <span className="text-sm font-mono text-slate-300">
                            {isScreenSharing ? '画面共有 & 指示モード' : `${siteId} - リアルタイム映像`}
                        </span>
                        {callStatus === 'connected' && <span className="text-xs bg-green-500 text-black font-bold px-2 py-0.5 rounded ml-2">通話中</span>}
                    </div>
                    {!isScreenSharing && !remoteStream && (
                         <button 
                             onClick={onRequestStream}
                             className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-bold transition-colors"
                         >
                             映像を要求
                         </button>
                    )}
                </div>

                {/* Viewport Content */}
                <div className="flex-1 bg-black relative flex items-center justify-center group overflow-hidden">
                    
                    {/* Mode 1: Remote Field View (Standard) */}
                    {!isScreenSharing && (
                         <>
                            {remoteStream ? (
                                <video 
                                    ref={remoteVideoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className="w-full h-full object-contain bg-black"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-slate-500 mb-2">映像信号を待機中...</p>
                                </div>
                            )}
                            {localStream && (
                                <div className="absolute bottom-4 right-4 w-32 md:w-48 aspect-video bg-black rounded-lg border border-slate-600 overflow-hidden shadow-2xl z-20">
                                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                    <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] px-1">REC</div>
                                </div>
                            )}
                         </>
                    )}

                    {/* Mode 2: Screen Sharing & Annotation Canvas */}
                    {isScreenSharing && (
                        <div className="relative w-full h-full bg-slate-800 flex items-center justify-center">
                            {/* Hidden Source Video - Using small size and opacity-0 to keep it rendering for canvas */}
                            <video 
                                ref={screenVideoRef} 
                                className="absolute top-0 left-0 w-10 h-10 opacity-0 pointer-events-none -z-10" 
                                muted 
                                autoPlay
                                playsInline 
                            />
                            
                            {/* Annotation Canvas (This is what is streamed) */}
                            <canvas 
                                ref={canvasRef}
                                className={`max-w-full max-h-full shadow-2xl cursor-${activeTool === 'cursor' ? 'default' : 'crosshair'}`}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            />
                            
                            {/* Text Input Overlay */}
                            {textInput && (
                                <div 
                                    className="fixed z-50 bg-white rounded shadow-lg p-1 flex gap-2"
                                    style={{ left: textInput.x, top: textInput.y }}
                                >
                                    <input 
                                        autoFocus
                                        value={textInput.value}
                                        onChange={e => setTextInput({...textInput, value: e.target.value})}
                                        onKeyDown={e => e.key === 'Enter' && confirmText()}
                                        onBlur={confirmText}
                                        className="border-none outline-none text-black px-2 py-1 min-w-[100px]"
                                        placeholder="テキストを入力"
                                    />
                                    <button onClick={confirmText} className="text-blue-600 hover:bg-blue-50 p-1 rounded">✔</button>
                                </div>
                            )}

                            {/* Floating Annotation Toolbar */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-2xl backdrop-blur">
                                {/* Tools */}
                                <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
                                    {[
                                        { id: 'cursor', icon: <path d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /> },
                                        { id: 'pen', icon: <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /> },
                                        { id: 'arrow', icon: <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /> },
                                        { id: 'rect', icon: <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /> },
                                        { id: 'circle', icon: <circle cx="12" cy="12" r="9" /> },
                                        { id: 'text', icon: <path d="M5.25 10l8.72-6.54a.75.75 0 011.06 0l8.72 6.54m-8.72-6.54v16.5m0-16.5l-3.75 4.5m3.75-4.5l3.75 4.5" /> } // Text icon placeholder
                                    ].map(tool => (
                                        <button
                                            key={tool.id}
                                            onClick={() => setActiveTool(tool.id as Tool)}
                                            className={`p-2 rounded-full transition-colors ${activeTool === tool.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{tool.icon}</svg>
                                        </button>
                                    ))}
                                </div>
                                {/* Colors */}
                                <div className="flex items-center gap-2">
                                    {['#ef4444', '#3b82f6', '#eab308', '#22c55e'].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setActiveColor(color as Color)}
                                            className={`w-6 h-6 rounded-full border-2 transition-transform ${activeColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                                {/* Clear */}
                                <div className="border-l border-slate-700 pl-4">
                                     <button 
                                        onClick={() => setShapes([])}
                                        className="text-xs text-red-400 hover:text-red-300 font-bold"
                                     >
                                        消去
                                     </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Chat Sidebar */}
        <div className="w-96 border-l border-slate-800">
          <ChatInterface 
            messages={messages} 
            onSendMessage={onSendMessage} 
            userName={userName} 
            userRole={userRole} 
            onMarkRead={onMarkRead} 
          />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;