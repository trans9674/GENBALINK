import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, Attachment, CallStatus, UserRole, CameraConfig, Site } from '../types';
import ChatInterface from './ChatInterface';
import { supabase } from '../lib/supabaseClient';

interface AdminDashboardProps {
  siteId: string;
  sites: Site[];
  onSwitchSite: (siteId: string) => void;
  onAddSite: (site: Site) => void;
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
  relayImages?: Record<string, string>; // { cameraId: base64 }
  onTriggerRelay?: (config: CameraConfig) => void;
  relayErrors?: Record<string, string>; // { cameraId: errorMessage }
  onDeleteMessage?: (id: string) => void; // New prop
  unreadSites?: string[]; // New prop: List of site IDs with unread messages
  isFieldCameraOff?: boolean; // New prop for camera status
  onBroadcastMessage?: (targetSiteIds: string[], text: string, isNotice: boolean) => void; // New prop
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

const SurveillanceCamera: React.FC<{ 
    config: CameraConfig; 
    onDelete: () => void; 
    relayImage?: string; 
    relayError?: string;
    onTriggerRelay?: (c: CameraConfig) => void;
}> = ({ config, onDelete, relayImage, relayError, onTriggerRelay }) => {
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    // Regular refresh for standard cameras
    if (!config.isRelay && config.type === 'snapshot' && config.refreshInterval) {
      const interval = setInterval(() => {
        setTimestamp(Date.now());
      }, config.refreshInterval);
      return () => clearInterval(interval);
    }
    // Relay Trigger Interval
    if (config.isRelay && config.refreshInterval && onTriggerRelay) {
        const interval = setInterval(() => {
            onTriggerRelay(config);
        }, config.refreshInterval);
        // Trigger immediately on mount
        onTriggerRelay(config);
        return () => clearInterval(interval);
    }
  }, [config, onTriggerRelay]);

  // Determine Source URL
  let srcUrl = '';
  if (config.isRelay) {
      srcUrl = relayImage || ''; 
  } else {
      srcUrl = config.type === 'iframe' 
        ? config.url 
        : `${config.url}${config.url.includes('?') ? '&' : '?'}t=${timestamp}`;
  }

  return (
    <div className="relative w-full h-full bg-black group overflow-hidden">
      {config.type === 'iframe' && !config.isRelay ? (
        <iframe 
          src={srcUrl} 
          className="w-full h-full border-0 pointer-events-none" 
          title={config.name}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-900">
            {srcUrl ? (
                <img 
                    src={srcUrl} 
                    alt={config.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            ) : (
                <div className="text-center px-4 w-full">
                    {relayError ? (
                        <div className="text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50">
                             <div className="text-2xl mb-2">⚠️</div>
                             <div className="text-xs font-bold break-all">{relayError}</div>
                             <div className="text-[9px] mt-1 text-slate-400 leading-tight text-left">
                                考えられる原因:<br/>
                                ・URLが間違っている(Reolinkは認証必須)<br/>
                                ・URLがストリーム形式(.mjpg)<br/>
                                ・カメラがCORSヘッダー非対応<br/>
                                ・Mixed Content (HTTPS→HTTP)
                             </div>
                        </div>
                    ) : (
                        config.isRelay ? (
                            <>
                                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                                <span className="text-[10px] text-slate-500">Connecting via Relay...</span>
                            </>
                        ) : (
                             <div className="flex flex-col items-center justify-center text-slate-500">
                                <div className="animate-pulse w-8 h-8 bg-slate-800 rounded-full mb-2"></div>
                                <span className="text-[10px]">Connecting...</span>
                                <span className="text-[9px] mt-1 text-slate-600">Admin端末から直接アクセス中</span>
                             </div>
                        )
                    )}
                </div>
            )}
        </div>
      )}
      
      {/* Error / Placeholder Fallback for IMG (if failed) */}
      {!srcUrl && !config.isRelay && (
        <div className="absolute inset-0 flex items-center justify-center -z-10 bg-slate-800">
             <span className="text-xs text-slate-500">No Signal</span>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute top-0 left-0 w-full p-2 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <div className="flex flex-col">
            <span className="text-xs font-bold text-white bg-blue-600/80 px-1.5 py-0.5 rounded shadow">{config.name}</span>
            {config.isRelay && <span className="text-[9px] text-yellow-300 mt-0.5">iPad Relay Mode</span>}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-white hover:text-red-400 bg-black/50 hover:bg-black/80 rounded p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-70 z-10">
         <div className={`w-2 h-2 rounded-full animate-pulse ${config.isRelay ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
         <span className="text-[10px] text-white shadow-black drop-shadow-md">LIVE</span>
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    siteId,
    sites,
    onSwitchSite,
    onAddSite, 
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
    onMarkRead,
    relayImages,
    onTriggerRelay,
    relayErrors,
    onDeleteMessage,
    unreadSites = [],
    isFieldCameraOff = false,
    onBroadcastMessage
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  // Screen Share & Annotation State
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenVideoRef = useRef<HTMLVideoElement>(null); 
  const displayStreamRef = useRef<MediaStream | null>(null); 
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [activeColor, setActiveColor] = useState<Color>('#ef4444');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState<{visible: boolean, x: number, y: number, value: string} | null>(null);

  // --- External Cameras State (Per Site) ---
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [newCamera, setNewCamera] = useState<Partial<CameraConfig>>({ type: 'mjpeg', refreshInterval: 1000, isRelay: false });
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteForm, setNewSiteForm] = useState({ id: '', name: '' });

  // --- Broadcast / Multiple Selection State ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [isUrgentNotice, setIsUrgentNotice] = useState(false);


  // --- Fetch Cameras from Supabase ---
  useEffect(() => {
    if (!siteId) {
        setCameras([]);
        return;
    }

    const fetchCameras = async () => {
        const { data, error } = await supabase
            .from('cameras')
            .select('*')
            .eq('site_id', siteId);
        
        if (error) {
            console.error("Error fetching cameras:", error);
            return;
        }

        if (data) {
            // Map Snake_case to CamelCase
            const mappedCameras: CameraConfig[] = data.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                url: c.url,
                refresh_interval: c.refresh_interval,
                isRelay: c.is_relay,
            }));
            setCameras(mappedCameras);
        }
    };

    fetchCameras();
    
    // Subscribe to Camera changes (Optional, if multiple admins)
    const channel = supabase.channel(`cameras:${siteId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cameras', filter: `site_id=eq.${siteId}` }, 
        () => {
            fetchCameras();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [siteId]);


  // --- Remote Video Handling ---
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = true; 
        remoteVideoRef.current.play().catch(e => console.error("Remote Play error:", e));
    }
  }, [remoteStream, isScreenSharing]);

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
    setShapes([]); 
    onStreamReady(null); 
  };

  // --- Toggle Camera (Unused but kept for logic consistency) ---
  const toggleCamera = async () => {
    const wasScreenSharing = isScreenSharing;

    if (wasScreenSharing) {
        if (displayStreamRef.current) {
            displayStreamRef.current.getTracks().forEach(t => t.stop());
            displayStreamRef.current = null;
        }
        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
        }
        setIsScreenSharing(false);
        setShapes([]);
    } else if (localStream) {
        onStreamReady(null);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        onStreamReady(stream);
    } catch (e) {
        console.error("Camera Error", e);
        alert("カメラへのアクセスを許可してください");
        if (wasScreenSharing) {
            onStreamReady(null);
        }
    }
  };

  // --- Start Screen Share ---
  const startScreenShare = async () => {
    try {
      if (localStream) onStreamReady(null); 

      const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { 
              cursor: "always",
              displaySurface: "window" 
          } as any, 
          audio: false 
      });
      
      displayStreamRef.current = stream;
      setIsScreenSharing(true); 
      setActiveTool('pen'); 

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
          screenVideoRef.current.onloadedmetadata = () => {
             screenVideoRef.current?.play().catch(e => console.error("Screen Play Error:", e));
          };
      }
  }, [isScreenSharing]);


  // --- Canvas Composition Loop ---
  useEffect(() => {
    if (!isScreenSharing || !canvasRef.current || !screenVideoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = screenVideoRef.current;
    let animationFrameId: number;

    const stream = canvas.captureStream(30);
    onStreamReady(stream);

    const render = () => {
        if (!ctx || !video) return;

        if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

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


  // --- Mouse Event Handlers ---
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

  // --- Camera Management (Supabase) ---
  const handleAddCamera = async () => {
    if (newCamera.name && newCamera.url && siteId) {
      const cameraPayload = {
          id: Date.now().toString(),
          site_id: siteId,
          name: newCamera.name,
          type: newCamera.type,
          url: newCamera.url,
          refresh_interval: newCamera.refreshInterval || 1000,
          is_relay: newCamera.isRelay || false
      };
      
      const { error } = await supabase.from('cameras').insert(cameraPayload);
      if (error) {
          console.error("Failed to add camera", error);
          alert("カメラの追加に失敗しました");
      } else {
          setNewCamera({ type: 'mjpeg', refreshInterval: 1000, name: '', url: '', isRelay: false });
          setShowCameraModal(false);
      }
    }
  };

  const handleDeleteCamera = async (id: string) => {
      if (!confirm("このカメラを削除しますか？")) return;
      const { error } = await supabase.from('cameras').delete().eq('id', id);
      if (error) console.error("Failed to delete camera", error);
  };

  const handleAddNewSite = () => {
     if(newSiteForm.id && newSiteForm.name) {
         onAddSite({ id: newSiteForm.id, name: newSiteForm.name });
         setShowAddSiteModal(false);
         setNewSiteForm({ id: '', name: '' });
     }
  };

  // Reolink Template Helper (Updated with User provided credentials)
  const applyReolinkTemplate = () => {
      setNewCamera(prev => ({
          ...prev,
          url: 'http://192.168.11.21/cgi-bin/api.cgi?cmd=Snap&channel=0&user=admin&password=genbalink01',
          isRelay: false, // Changed: Disable relay to use direct Wifi connection
          type: 'snapshot',
          refreshInterval: 500
      }));
  };

  // Helper to get site name
  const currentSiteName = sites.find(s => s.id === siteId)?.name || '';

  // --- Broadcast Logic ---
  const toggleSiteSelection = (id: string) => {
      setSelectedSites(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleBroadcastSubmit = () => {
      if (!broadcastText.trim() || selectedSites.size === 0) return;
      if (onBroadcastMessage) {
          onBroadcastMessage(Array.from(selectedSites), broadcastText, isUrgentNotice);
          setShowBroadcastModal(false);
          setBroadcastText('');
          setIsUrgentNotice(false);
          setIsSelectionMode(false);
          setSelectedSites(new Set());
      }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="h-24 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-10 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-8">
            <h1 className="text-3xl font-bold text-white tracking-widest">GENBA<span className="text-orange-500">LINK</span> <span className="text-slate-500 text-xl ml-3 font-normal">管理者コンソール</span></h1>
        </div>
        <div className="flex items-center gap-6">
             <div className="text-base text-slate-400 mr-2 flex flex-col items-end">
                <span>Status</span>
                <span className={`font-bold ${connectionStatus.includes('完了') ? 'text-green-400' : 'text-yellow-400'}`}>{connectionStatus}</span>
             </div>
             
             {/* Call Buttons */}
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

             <button 
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`px-8 py-3.5 rounded-xl text-lg font-bold shadow-lg transition-all border flex items-center gap-3 ${
                    isScreenSharing
                    ? 'bg-orange-600 border-orange-500 text-white hover:bg-orange-700' 
                    : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                }`}
             >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {isScreenSharing ? '共有停止' : '画面共有'}
             </button>

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
        {/* SIDEBAR: Sites List */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-slate-400 font-bold text-sm uppercase tracking-wider">登録現場リスト</h2>
                <div className="flex gap-1">
                    <button 
                        onClick={() => {
                            setIsSelectionMode(!isSelectionMode);
                            setSelectedSites(new Set());
                        }}
                        className={`p-1 rounded transition-colors ${isSelectionMode ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        title="一斉連絡モード"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </button>
                    <button 
                        onClick={() => setShowAddSiteModal(true)}
                        className="text-blue-400 hover:text-white bg-blue-900/30 hover:bg-blue-600 rounded p-1"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                </div>
            </div>
            
            {/* Selection Mode Indicator */}
            {isSelectionMode && (
                <div className="px-4 py-2 bg-orange-900/30 border-b border-orange-500/30 text-orange-300 text-xs font-bold text-center animate-in slide-in-from-top-2">
                    一斉連絡モード
                </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {sites.length === 0 && (
                    <div className="text-center text-slate-600 text-xs py-4">現場が登録されていません</div>
                )}
                {sites.map(site => (
                    <div key={site.id} className="relative flex items-center">
                        {isSelectionMode && (
                             <input 
                                type="checkbox"
                                checked={selectedSites.has(site.id)}
                                onChange={() => toggleSiteSelection(site.id)}
                                className="absolute left-2 z-30 w-5 h-5 accent-orange-500 cursor-pointer"
                             />
                        )}
                        <button
                            onClick={() => {
                                if (isSelectionMode) toggleSiteSelection(site.id);
                                else onSwitchSite(site.id);
                            }}
                            className={`w-full text-left p-3 rounded-lg border transition-all duration-200 relative ${isSelectionMode ? 'pl-10' : ''} ${
                                siteId === site.id && !isSelectionMode
                                ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.6)] scale-105 z-10 border-blue-400 ring-1 ring-blue-300' 
                                : selectedSites.has(site.id)
                                    ? 'bg-orange-900/40 border-orange-500 text-white'
                                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600 text-slate-400'
                            }`}
                        >
                            <div className={`font-bold ${siteId === site.id || selectedSites.has(site.id) ? 'text-white' : 'text-slate-300'}`}>{site.name}</div>
                            <div className={`text-xs mt-1 flex justify-between ${siteId === site.id ? 'text-blue-100' : 'text-slate-500'}`}>
                                <span>{site.id}</span>
                                {siteId === site.id && !isSelectionMode && <span className="text-green-300 animate-pulse font-bold">● 接続中</span>}
                            </div>
                            {/* UNREAD INDICATOR */}
                            {!isSelectionMode && unreadSites.includes(site.id) && (
                                <div className="absolute -top-1 -right-1 z-20">
                                    <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                                    </span>
                                    <div className="absolute top-4 right-0 bg-yellow-500 text-slate-900 text-[9px] font-black px-1.5 py-0.5 rounded border-2 border-slate-900 whitespace-nowrap shadow-lg animate-pulse">
                                        未読メッセージあり
                                    </div>
                                </div>
                            )}
                        </button>
                    </div>
                ))}
            </div>

            {/* Broadcast Action Button */}
            {isSelectionMode && (
                <div className="p-4 border-t border-slate-800 bg-slate-900">
                    <div className="text-xs text-center text-slate-400 mb-2">{selectedSites.size}件 選択中</div>
                    <button 
                        onClick={() => setShowBroadcastModal(true)}
                        disabled={selectedSites.size === 0}
                        className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all ${
                            selectedSites.size > 0 
                            ? 'bg-orange-600 hover:bg-orange-500' 
                            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        メッセージを作成
                    </button>
                </div>
            )}
        </div>

        {/* Main Content Area (Video + Cameras) */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 p-4 relative">
            
            {/* Mode 2: Screen Sharing & Annotation Canvas (Full View) */}
            {isScreenSharing ? (
                 <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col">
                    <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                        <span className="text-sm font-bold text-orange-400 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                             画面共有 & 指示モード
                        </span>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center bg-slate-800">
                         {/* Hidden Video Source */}
                         <video ref={screenVideoRef} className="absolute top-0 left-0 w-10 h-10 opacity-0 pointer-events-none -z-10" muted autoPlay playsInline />
                         
                         {/* Canvas */}
                         <canvas 
                            ref={canvasRef}
                            className={`max-w-full max-h-full shadow-2xl cursor-${activeTool === 'cursor' ? 'default' : 'crosshair'}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                         />
                         
                         {/* Text Input & Toolbar ... (Same as before) */}
                         {textInput && (
                            <div className="fixed z-50 bg-white rounded shadow-lg p-1 flex gap-2" style={{ left: textInput.x, top: textInput.y }}>
                                <input autoFocus value={textInput.value} onChange={e => setTextInput({...textInput, value: e.target.value})} onKeyDown={e => e.key === 'Enter' && confirmText()} onBlur={confirmText} className="border-none outline-none text-black px-2 py-1 min-w-[100px]" placeholder="テキストを入力" />
                                <button onClick={confirmText} className="text-blue-600 hover:bg-blue-50 p-1 rounded">✔</button>
                            </div>
                        )}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-2xl backdrop-blur">
                            {/* Tools ... */}
                             <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
                                {[
                                    { id: 'cursor', icon: <path d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /> },
                                    { id: 'pen', icon: <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /> },
                                    { id: 'arrow', icon: <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /> },
                                    { id: 'rect', icon: <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /> },
                                    { id: 'circle', icon: <circle cx="12" cy="12" r="9" /> },
                                    { id: 'text', icon: <path d="M5.25 10l8.72-6.54a.75.75 0 011.06 0l8.72 6.54m-8.72-6.54v16.5m0-16.5l-3.75 4.5m3.75-4.5l3.75 4.5" /> }
                                ].map(tool => (
                                    <button key={tool.id} onClick={() => setActiveTool(tool.id as Tool)} className={`p-2 rounded-full transition-colors ${activeTool === tool.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{tool.icon}</svg>
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                {['#ef4444', '#3b82f6', '#eab308', '#22c55e'].map(color => (
                                    <button key={color} onClick={() => setActiveColor(color as Color)} className={`w-6 h-6 rounded-full border-2 transition-transform ${activeColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: color }} />
                                ))}
                            </div>
                            <div className="border-l border-slate-700 pl-4">
                                <button onClick={() => setShapes([])} className="text-xs text-red-400 hover:text-red-300 font-bold">消去</button>
                            </div>
                        </div>
                    </div>
                 </div>
            ) : (
                /* Mode 1: 2x2 Grid Monitoring Layout */
                <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 h-full">
                    {/* Top Left: Main iPad Field Stream */}
                    <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col group">
                        <div className="absolute top-0 left-0 w-full p-2 bg-gradient-to-b from-black/60 to-transparent flex justify-between items-start z-10">
                            <span className="text-xs font-bold text-white bg-blue-600/80 px-2 py-0.5 rounded flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                iPad (現場端末)
                            </span>
                            {remoteStream && <span className="text-[10px] text-green-400 bg-green-900/50 px-1.5 py-0.5 rounded border border-green-800 animate-pulse">LIVE</span>}
                            {isFieldCameraOff && !remoteStream && <span className="text-[10px] text-red-400 bg-red-900/50 px-1.5 py-0.5 rounded border border-red-800">OFF</span>}
                        </div>
                        
                        <div className="flex-1 bg-black flex items-center justify-center relative">
                            {remoteStream ? (
                                <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            ) : isFieldCameraOff ? (
                                <div className="text-center p-4">
                                    <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4 border border-red-500/50 animate-pulse">
                                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    </div>
                                    <p className="text-lg font-bold text-red-500">カメラがオフになっています。</p>
                                    <p className="text-xs text-slate-500 mt-2">現場側で一時的に無効化されています</p>
                                </div>
                            ) : (
                                <div className="text-center p-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2">
                                        <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                    </div>
                                    <p className="text-sm text-slate-500 font-bold">待機中</p>
                                    <p className="text-xs text-slate-600 mt-1">iPadカメラは通話中のみ表示されます</p>
                                </div>
                            )}
                            
                            {/* Local Admin Camera PiP (Optional) */}
                            {localStream && (
                                <div className="absolute bottom-2 right-2 w-24 aspect-video bg-black rounded border border-slate-600 overflow-hidden">
                                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Remaining 3 Slots for External Cameras */}
                    {[0, 1, 2].map(index => (
                        <div key={`cam-slot-${index}`} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative flex flex-col group">
                            {cameras[index] ? (
                                <SurveillanceCamera 
                                    config={cameras[index]} 
                                    onDelete={() => handleDeleteCamera(cameras[index].id)} 
                                    relayImage={relayImages ? relayImages[cameras[index].id] : undefined}
                                    relayError={relayErrors ? relayErrors[cameras[index].id] : undefined}
                                    onTriggerRelay={onTriggerRelay}
                                />
                            ) : (
                                <button 
                                    onClick={() => setShowCameraModal(true)}
                                    className="flex-1 w-full flex flex-col items-center justify-center text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors"
                                >
                                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mb-2 group-hover:border-slate-500">
                                        <span className="text-2xl font-light">+</span>
                                    </div>
                                    <span className="text-xs font-bold">カメラを追加</span>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Right Chat Sidebar */}
        <div className="w-96 border-l border-slate-800 shrink-0">
          <ChatInterface 
            key={siteId}
            messages={messages} 
            onSendMessage={onSendMessage} 
            userName={userName} 
            userRole={userRole} 
            onMarkRead={onMarkRead} 
            chatTitle={currentSiteName ? `${currentSiteName} 現場チャット` : '現場チャット'}
            onDeleteMessage={onDeleteMessage} // Pass delete handler
          />
        </div>
        {/* Modals ... (Rest of code is unchanged) */}
        {/* Broadcast Modal */}
        {showBroadcastModal && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-2">一斉送信 ({selectedSites.size}件)</h2>
                    <p className="text-sm text-slate-400 mb-4">選択した現場すべてに同じメッセージを送信します。</p>
                    
                    <textarea 
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-orange-500 min-h-[120px]"
                        placeholder="送信する内容を入力してください..."
                        value={broadcastText}
                        onChange={(e) => setBroadcastText(e.target.value)}
                    />

                    <label className="flex items-start gap-3 mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg cursor-pointer hover:bg-red-900/30 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={isUrgentNotice} 
                            onChange={(e) => setIsUrgentNotice(e.target.checked)}
                            className="w-5 h-5 mt-0.5 accent-red-500"
                        />
                        <div>
                            <div className="text-white font-bold text-sm">【共通連絡事項】として強調表示する</div>
                            <div className="text-slate-400 text-xs mt-1">
                                現場のiPad画面に全画面の警告モーダルを表示し、見落としを防ぎます。<br/>
                                (例：台風対策、緊急の安全指示など)
                            </div>
                        </div>
                    </label>

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowBroadcastModal(false)} className="px-4 py-2 text-slate-400 hover:text-white font-bold">キャンセル</button>
                        <button 
                            onClick={handleBroadcastSubmit} 
                            disabled={!broadcastText.trim()} 
                            className={`px-6 py-2 rounded font-bold text-white ${!broadcastText.trim() ? 'bg-slate-700 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-500'}`}
                        >
                            送信する
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Add Camera Modal */}
        {showCameraModal && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-4">Liveカメラを追加 ({siteId})</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">カメラ名</label>
                            <input type="text" value={newCamera.name || ''} onChange={e => setNewCamera({...newCamera, name: e.target.value})} placeholder="例: 現場入口 (Reolink)" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">映像タイプ</label>
                            <div className="flex gap-4 mb-2">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="camType" checked={newCamera.type === 'mjpeg'} onChange={() => setNewCamera({...newCamera, type: 'mjpeg'})} className="accent-blue-500"/><span className="text-sm text-slate-200">MJPEGストリーム</span></label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="camType" checked={newCamera.type === 'snapshot'} onChange={() => setNewCamera({...newCamera, type: 'snapshot'})} className="accent-blue-500"/><span className="text-sm text-slate-200">定期スナップショット</span></label>
                            </div>
                            
                            {/* Relay Checkbox */}
                            <label className="flex items-center gap-2 cursor-pointer bg-slate-800 p-2 rounded border border-slate-700">
                                <input 
                                    type="checkbox" 
                                    checked={newCamera.isRelay || false} 
                                    onChange={(e) => setNewCamera({...newCamera, isRelay: e.target.checked})} 
                                    className="w-4 h-4 accent-blue-500"
                                />
                                <div>
                                    <div className="text-sm font-bold text-white">現場iPadを経由して接続 (Relay)</div>
                                    <div className="text-[10px] text-slate-400">ルーター設定が不要ですが、iPadが起動している必要があります</div>
                                </div>
                            </label>
                        </div>
                        
                        {/* URL INPUT SECTION */}
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <label className="block text-xs font-bold text-slate-400">
                                    {newCamera.isRelay ? 'Snapshot URL (JPEGのみ)' : 'URL (ローカルIP可)'}
                                </label>
                                <button 
                                    onClick={applyReolinkTemplate}
                                    className="text-[10px] bg-blue-900/50 hover:bg-blue-800 text-blue-300 px-2 py-0.5 rounded border border-blue-800 transition-colors"
                                >
                                    Reolink テンプレート
                                </button>
                            </div>
                            <input 
                                type="text" 
                                value={newCamera.url || ''} 
                                onChange={e => setNewCamera({...newCamera, url: e.target.value})} 
                                placeholder={newCamera.isRelay ? "http://192.168.1.100/api/snapshot.jpg" : "http://192.168.1.100/video.mjpg"} 
                                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none font-mono text-xs" 
                            />
                            {newCamera.isRelay ? (
                                <div className="mt-1 space-y-1">
                                    <div className="text-[10px] text-yellow-500">
                                        ※ Relayモードでは動画ストリームURL(.mjpg)は使用できません。必ず静止画(Snapshot)のURLを入力してください。
                                    </div>
                                    <div className="text-[10px] text-blue-400">
                                        ※ URL内の「user=admin」と「password=...」を実際のカメラ設定に合わせて変更してください。
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1 text-[10px] text-slate-400">
                                    ・カメラは現場に設置したルーターでWifi接続する。PCと同じネットワーク(WiFi)ではない。
                                </div>
                            )}
                        </div>
                        
                        {(newCamera.type === 'snapshot' || newCamera.isRelay) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">更新間隔 (ms)</label>
                                <input type="number" value={newCamera.refreshInterval || 1000} onChange={e => setNewCamera({...newCamera, refreshInterval: Number(e.target.value)})} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none" />
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-8">
                        <button onClick={() => setShowCameraModal(false)} className="px-4 py-2 text-slate-400 hover:text-white font-bold">キャンセル</button>
                        <button onClick={handleAddCamera} disabled={!newCamera.name || !newCamera.url} className={`px-6 py-2 rounded font-bold text-white ${!newCamera.name || !newCamera.url ? 'bg-slate-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}>追加する</button>
                    </div>
                </div>
            </div>
        )}

        {/* Add Site Modal (From Sidebar) */}
        {showAddSiteModal && (
             <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-4">新しい現場を追加</h2>
                    <div className="space-y-4">
                        <input type="text" value={newSiteForm.name} onChange={e => setNewSiteForm({...newSiteForm, name: e.target.value})} placeholder="現場名 (例: 佐藤邸)" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none" />
                        <input type="text" value={newSiteForm.id} onChange={e => setNewSiteForm({...newSiteForm, id: e.target.value})} placeholder="現場ID (例: GENBA-002)" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 outline-none" />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowAddSiteModal(false)} className="px-3 py-2 text-slate-400 hover:text-white text-sm font-bold">キャンセル</button>
                        <button onClick={handleAddNewSite} disabled={!newSiteForm.id || !newSiteForm.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold">保存</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;