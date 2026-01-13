import React, { useEffect } from 'react';
import { SiteSession } from '../types';

interface AdminDashboardProps {
  sites: Record<string, SiteSession>;
  localStream: MediaStream | null;
  onToggleCamera: () => void;
  onTriggerAlert: (siteId: string) => void;
  onRequestStream: (siteId: string) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    sites, 
    localStream,
    onToggleCamera,
    onTriggerAlert,
    onRequestStream
}) => {
  
  const siteList: SiteSession[] = Object.values(sites);
  const siteCount = siteList.length;

  // Grid logic
  let gridClass = 'grid-cols-1';
  if (siteCount >= 2) gridClass = 'grid-cols-2'; 
  // For 3 or 4 sites, 2x2 grid is handled by the mapped items wrapping naturally in grid-cols-2 
  // but if we want strictly 2 rows max for 4 items, flex/grid combo works.
  // Let's use auto-fit for robustness or explicit logic.
  
  // Refined explicit logic:
  // 1 site: full
  // 2 sites: split vertical (col-2)
  // 3-4 sites: 2x2 grid
  
  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-white tracking-widest">GENBA<span className="text-orange-500">LINK</span> <span className="text-slate-500 text-sm ml-2 font-normal">マルチサイト管理</span></h1>
            <div className="flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                 <span className="text-blue-400 text-sm font-medium">接続数: {siteCount}</span>
            </div>
        </div>
        <div className="flex items-center gap-3">
             <button 
                onClick={onToggleCamera}
                className={`px-4 py-1.5 rounded text-sm font-bold shadow-lg transition-all border ${
                    localStream 
                    ? 'bg-red-600 border-red-500 text-white hover:bg-red-700 animate-pulse' 
                    : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                }`}
             >
                {localStream ? '全現場へ配信停止' : '全現場へカメラ配信'}
             </button>
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">A</div>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className={`flex-1 p-2 bg-slate-950 overflow-hidden grid gap-2 ${siteCount <= 1 ? 'grid-cols-1' : 'grid-cols-2'} ${siteCount > 2 ? 'grid-rows-2' : ''}`}>
        {siteList.length === 0 && (
             <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-500">
                <div className="animate-spin w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full mb-4"></div>
                <p>現場への接続を待機中...</p>
             </div>
        )}

        {siteList.map((site) => (
            <SiteCard 
                key={site.id} 
                site={site} 
                onTriggerAlert={() => onTriggerAlert(site.id)}
                onRequestStream={() => onRequestStream(site.id)}
            />
        ))}

        {/* Admin Self View (Floating PiP) - only if streaming */}
        {localStream && (
            <div className="absolute bottom-4 right-4 w-48 aspect-video bg-black rounded-lg border border-slate-600 overflow-hidden shadow-2xl z-50">
                <video
                    ref={video => { if(video) video.srcObject = localStream }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                />
                <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] px-1">配信中</div>
            </div>
        )}
      </div>
    </div>
  );
};

const SiteCard: React.FC<{ 
    site: SiteSession; 
    onTriggerAlert: () => void;
    onRequestStream: () => void;
}> = ({ site, onTriggerAlert, onRequestStream }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && site.stream) {
            videoRef.current.srcObject = site.stream;
            videoRef.current.play().catch(e => console.error("Play error", e));
        }
    }, [site.stream]);

    return (
        <div className={`relative bg-slate-900 rounded-lg border border-slate-800 overflow-hidden group flex flex-col`}>
             {/* Site Header Overlay */}
             <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start pointer-events-none">
                 <div className="pointer-events-auto">
                     <span className="bg-blue-600/90 text-white px-2 py-1 rounded text-xs font-bold shadow-sm backdrop-blur-sm">
                        ID: {site.id}
                     </span>
                     <span className={`ml-2 text-xs font-mono shadow-sm ${site.status === 'connected' ? 'text-green-400' : 'text-slate-400'}`}>
                         {site.status === 'connected' ? '● ONLINE' : '○ CONNECTING...'}
                     </span>
                 </div>
                 <div className="flex gap-2 pointer-events-auto">
                     {!site.stream && (
                         <button 
                            onClick={onRequestStream}
                            className="bg-slate-700 hover:bg-slate-600 text-white p-1 rounded transition-colors"
                            title="再接続/映像要求"
                         >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                         </button>
                     )}
                     <button 
                         onClick={onTriggerAlert}
                         className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold shadow-lg transition-all flex items-center gap-1 active:scale-95"
                     >
                         <span>🔔</span> 呼出し
                     </button>
                 </div>
             </div>

             {/* Video Area */}
             <div className="flex-1 relative bg-black flex items-center justify-center">
                 {site.stream ? (
                     <video 
                        ref={videoRef}
                        className="w-full h-full object-contain" // Use contain to see full FOV
                        autoPlay
                        playsInline
                        muted // Mute by default to prevent echo in control room
                     />
                 ) : (
                     <div className="text-slate-600 flex flex-col items-center">
                         <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                         <span className="text-xs">NO SIGNAL</span>
                     </div>
                 )}
                 
                 {/* Audio Visualizer (Fake) if connected */}
                 {site.status === 'connected' && site.stream && (
                     <div className="absolute bottom-2 left-2 flex gap-0.5 z-10">
                         {[...Array(3)].map((_, i) => (
                             <div key={i} className="w-1 bg-green-500 animate-pulse" style={{height: '12px', animationDelay: `${i*0.1}s`}}></div>
                         ))}
                     </div>
                 )}
             </div>

             {/* Visual Alert Overlay (Echo for Admin) */}
             {site.hasAlert && (
                 <div className="absolute inset-0 pointer-events-none border-4 border-blue-500 flex items-center justify-center bg-blue-900/10 animate-pulse z-20">
                     <span className="bg-blue-600 text-white px-4 py-2 rounded-full font-bold animate-bounce shadow-lg">
                         呼出し中...
                     </span>
                 </div>
             )}
        </div>
    );
};

export default AdminDashboard;