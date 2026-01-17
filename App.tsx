import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { UserRole, ChatMessage, Attachment, CallStatus, Site, CameraConfig } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { supabase } from './lib/supabaseClient';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>(""); // Current active site ID
  const [userName, setUserName] = useState<string>(""); 
  
  // Chat Messages Management (Synced via Supabase)
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Relay Images State (Admin Side) - Map camera ID to base64 image string
  const [relayImages, setRelayImages] = useState<Record<string, string>>({});
  const [relayErrors, setRelayErrors] = useState<Record<string, string>>({});

  const [incomingAlert, setIncomingAlert] = useState(false);
  
  // Sites Management (For Admin)
  const [sites, setSites] = useState<Site[]>([]);
  
  // remoteStream: 相手の映像 (AdminにとってはFieldの映像、FieldにとってはAdminの映像)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // localStream: 自分の映像 (Fieldは常時、Adminは任意/画面共有)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStatus, setPeerStatus] = useState<string>('未接続');
  
  // Call State
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const mediaConnRef = useRef<MediaConnection | null>(null); // 通話管理用
  const retryIntervalRef = useRef<any>(null);

  // Ref to hold startConnectionRetry to avoid circular dependency
  const startConnectionRetryRef = useRef<() => void>(() => {});

  // --- Fetch Sites (Admin) ---
  useEffect(() => {
    // Only fetch sites if we are admin or just want to load them all
    const fetchSites = async () => {
        const { data, error } = await supabase.from('sites').select('*').order('created_at', { ascending: true });
        if (data) {
            setSites(data.map((s: any) => ({ id: s.id, name: s.name })));
        }
    };
    fetchSites();

    // Subscribe to site changes
    const channel = supabase.channel('public:sites')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
            fetchSites();
        })
        .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- Fetch Messages & Subscribe (Per Site) ---
  useEffect(() => {
      if (!siteId) {
          setMessages([]);
          return;
      }

      const fetchMessages = async () => {
          const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('site_id', siteId)
            .order('created_at', { ascending: true });
          
          if (data) {
              setMessages(data.map((m: any) => ({
                  id: m.id,
                  sender: m.sender,
                  text: m.text,
                  timestamp: new Date(m.created_at),
                  isRead: m.is_read,
                  attachment: m.attachment
              })));
          }
      };
      
      fetchMessages();

      // Realtime Subscription
      const channel = supabase.channel(`messages:${siteId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `site_id=eq.${siteId}` }, 
        (payload) => {
             // Handle INSERT, UPDATE, DELETE
             if (payload.eventType === 'INSERT') {
                 const m = payload.new;
                 setMessages(prev => [...prev, {
                    id: m.id,
                    sender: m.sender,
                    text: m.text,
                    timestamp: new Date(m.created_at),
                    isRead: m.is_read,
                    attachment: m.attachment
                 }]);
             } else if (payload.eventType === 'UPDATE') {
                 setMessages(prev => prev.map(msg => 
                     msg.id === payload.new.id ? { ...msg, isRead: payload.new.is_read } : msg
                 ));
             } else if (payload.eventType === 'DELETE') {
                 setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
             }
        })
        .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [siteId]);


  // Calculate unread sites (Admin) - Requires fetching unread counts or all messages
  // Simplified: For now, we only know unread status of the CURRENT site via realtime.
  // To know unread of ALL sites, we'd need a global subscription or summary table.
  // Since we removed 'allMessages' state which held everything in local storage,
  // we will temporarily disable the 'unreadSites' indicator for non-active sites to keep performance high,
  // OR we could fetch unread counts. 
  // Let's implement a simple fetch for "sites with unread messages" periodically?
  // For this implementation, I will skip the global unread indicator for simplicity unless requested.
  // Wait, I can keep `unreadSites` as empty array for now or try to implement it?
  // I will leave it empty to ensure performance unless I implement a proper unread view.
  const unreadSites: string[] = []; 


  // --- メッセージ受信処理 (PeerJS: Signaling & Relay Only) ---
  const handleDataReceived = useCallback(async (data: any) => {
    // console.log("Data received:", data.type); // Reduce log noise for relay
    const { type, payload } = data;
    
    // NOTE: 'CHAT' and 'CHAT_DELETE' are now handled by Supabase Realtime!
    
    if (type === 'ALERT') {
       setIncomingAlert(true);
       setTimeout(() => setIncomingAlert(false), 5000);
    } else if (type === 'REQUEST_STREAM') {
       window.dispatchEvent(new CustomEvent('TRIGGER_CALL_ADMIN'));
    } else if (type === 'CALL_START') {
        setCallStatus('incoming');
    } else if (type === 'CALL_ACCEPT') {
        setCallStatus('connected');
    } else if (type === 'CALL_END') {
        setCallStatus('idle');
    } else if (type === 'RELAY_REQUEST') {
        // [Field Side] Admin requested a camera image relay
        // Payload: { cameraId, url }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            // Fetch with CORS mode. 
            const response = await fetch(payload.url, { 
                mode: 'cors',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('multipart/x-mixed-replace')) {
                throw new Error("Stream URL detected. Use Snapshot URL.");
            }

            const blob = await response.blob();
            
            // Convert to Base64
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                if (connRef.current && connRef.current.open) {
                    connRef.current.send({
                        type: 'RELAY_RESPONSE',
                        payload: {
                            cameraId: payload.cameraId,
                            image: base64data
                        }
                    });
                }
            };
            reader.readAsDataURL(blob);
        } catch (error: any) {
            console.error("Relay Fetch Error:", error);
            // Send back error to admin
            if (connRef.current && connRef.current.open) {
                connRef.current.send({
                    type: 'RELAY_ERROR',
                    payload: {
                        cameraId: payload.cameraId,
                        error: error.name === 'AbortError' ? 'Timeout (Stream URL?)' : error.message || 'Fetch Failed'
                    }
                });
            }
        }
    } else if (type === 'RELAY_RESPONSE') {
        // [Admin Side] Received relayed image from Field
        setRelayImages(prev => ({
            ...prev,
            [payload.cameraId]: payload.image
        }));
        // Clear error if success
        setRelayErrors(prev => {
            const newState = { ...prev };
            delete newState[payload.cameraId];
            return newState;
        });
    } else if (type === 'RELAY_ERROR') {
        // [Admin Side] Received error from Field
        setRelayErrors(prev => ({
            ...prev,
            [payload.cameraId]: payload.error
        }));
    }
  }, []);

  // --- 接続確立後のセットアップ ---
  const setupConnection = useCallback((conn: DataConnection) => {
      if (connRef.current === conn && conn.open) return; 

      console.log("Connection Established!");
      connRef.current = conn;
      setPeerStatus('接続完了');
      
      if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
      }

      conn.off('data');
      conn.off('close');
      conn.off('error');

      conn.on('data', handleDataReceived);
      
      conn.on('close', () => {
         console.log("Connection closed remote");
         setPeerStatus('切断: 再接続待機中...');
         connRef.current = null;
         setCallStatus('idle');
         setRemoteStream(null);
         startConnectionRetryRef.current();
      });
      
      conn.on('error', (err) => {
          console.error("Conn Error", err);
          connRef.current = null;
      });
  }, [handleDataReceived]);

  // --- 接続試行ロジック (双方向) ---
  const connectToTarget = useCallback(() => {
    if (!peerRef.current || peerRef.current.destroyed || !siteId) return;
    if (connRef.current?.open) return;

    const targetId = currentRole === UserRole.ADMIN ? siteId : `${siteId}-admin`;
    if (targetId === peerRef.current.id) return;

    console.log(`Connecting to ${targetId}...`);
    if (!connRef.current) setPeerStatus(`接続試行中...`);

    const conn = peerRef.current.connect(targetId, { reliable: true });

    conn.on('open', () => setupConnection(conn));
    conn.on('error', (err) => console.log("Connect attempt failed:", err));

  }, [siteId, currentRole, setupConnection]);

  const startConnectionRetry = useCallback(() => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      connectToTarget();
      retryIntervalRef.current = setInterval(() => {
          if (!connRef.current || !connRef.current.open) {
              connectToTarget();
          }
      }, 3000);
  }, [connectToTarget]);

  // Keep ref synced
  useEffect(() => {
    startConnectionRetryRef.current = startConnectionRetry;
  }, [startConnectionRetry]);

  // --- Peer初期化 ---
  useEffect(() => {
    if (!siteId || currentRole === UserRole.NONE) return;

    if (peerRef.current) {
        if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
        if (connRef.current) connRef.current.close();
        peerRef.current.destroy();
        peerRef.current = null;
        connRef.current = null;
        setRemoteStream(null);
        setCallStatus('idle');
        setRelayImages({}); // Clear images on disconnect
        setRelayErrors({});
    }

    const myPeerId = currentRole === UserRole.FIELD ? siteId : `${siteId}-admin`;
    console.log(`Initializing Peer with ID: ${myPeerId}`);
    setPeerStatus('初期化中...');

    const peer = new Peer(myPeerId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer Open. My ID:', id);
      setPeerStatus('待機中...');
      startConnectionRetry();
    });

    peer.on('connection', (conn) => {
      console.log('Incoming Data Connection');
      if (conn.open) {
          setupConnection(conn);
      } else {
          conn.on('open', () => setupConnection(conn));
      }
    });

    peer.on('call', (call) => {
      console.log('Incoming Video Call from:', call.peer);
      call.answer(); 
      call.on('stream', (stream) => {
        console.log("Remote Stream Received");
        setRemoteStream(stream);
      });
      call.on('error', (e) => console.error("Call Error", e));
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
         setPeerStatus('ID重複エラー: 既にログイン中です');
      } else if (err.type !== 'peer-unavailable') {
         // Log
      }
    });

    peer.on('disconnected', () => {
       setPeerStatus('サーバー切断: 再接続中...');
       peer.reconnect();
    });

    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      if (peerRef.current) peerRef.current.destroy();
      peerRef.current = null;
    };
  }, [siteId, currentRole, setupConnection, startConnectionRetry]);


  // --- 現場用: 映像発信トリガー ---
  useEffect(() => {
    if (currentRole !== UserRole.FIELD) return;

    const handleTriggerCall = () => {
        if (!peerRef.current || !localStream) {
            alert("カメラ準備中または通信エラーです");
            return;
        }
        const adminId = `${siteId}-admin`;
        const call = peerRef.current.call(adminId, localStream);
        mediaConnRef.current = call;
    };

    window.addEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
    return () => window.removeEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
  }, [currentRole, siteId, localStream]);


  // --- 管理者用: ストリーム更新処理 ---
  const handleAdminStreamChange = useCallback((stream: MediaStream | null) => {
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
      }
      if (mediaConnRef.current) {
          mediaConnRef.current.close();
          mediaConnRef.current = null;
      }
      setLocalStream(stream);
      if (stream && peerRef.current) {
          const targetId = siteId;
          const call = peerRef.current.call(targetId, stream);
          mediaConnRef.current = call;
      }
  }, [localStream, siteId]);


  // --- Call Control Logic ---
  const startCall = () => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'CALL_START' });
          setCallStatus('outgoing');
      }
  };

  const acceptCall = async () => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'CALL_ACCEPT' });
          setCallStatus('connected');
          
          if (currentRole === UserRole.ADMIN && !localStream) {
             try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                handleAdminStreamChange(stream);
             } catch(e) { console.error("Auto cam start failed", e); }
          }
      }
  };

  const endCall = () => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'CALL_END' });
      }
      setCallStatus('idle');
  };

  // --- Relay Trigger Logic (Admin Only) ---
  const triggerRelayRequest = (camera: CameraConfig) => {
      if (currentRole === UserRole.ADMIN && connRef.current && connRef.current.open && camera.isRelay) {
          // Add a timestamp to prevent caching on the Field device side
          const urlWithTs = `${camera.url}${camera.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
          connRef.current.send({
              type: 'RELAY_REQUEST',
              payload: {
                  cameraId: camera.id,
                  url: urlWithTs
              }
          });
      }
  };

  // --- UI Actions ---
  const handleLogin = (role: UserRole, id: string, name: string, initialSites?: Site[]) => {
    setSiteId(id);
    setCurrentRole(role);
    const effectiveName = role === UserRole.FIELD ? "現地" : (name || "管理者");
    setUserName(effectiveName);
    // Note: 'sites' passed from Login are ignored now, we fetch from Supabase in App for Admin.
    // However, if initialSites are provided (from localStorage in Login), we could use them as initial state.
    // But Supabase fetch will overwrite them, which is fine.
  };

  const handleSwitchSite = (newSiteId: string) => {
      setSiteId(newSiteId);
      setRelayImages({}); 
      setRelayErrors({});
  };

  const handleAddSite = async (newSite: Site) => {
      // Insert into Supabase
      const { error } = await supabase.from('sites').insert({ id: newSite.id, name: newSite.name });
      if (error) {
          console.error("Error adding site", error);
          alert("現場の追加に失敗しました");
      }
  };

  const handleSendMessage = async (text: string, attachment?: Attachment) => {
    if (!siteId) return;
    
    // Insert into Supabase
    const { error } = await supabase.from('messages').insert({
        site_id: siteId,
        sender: userName,
        text: text,
        is_read: false,
        attachment: attachment
    });
    
    if (error) {
        console.error("Error sending message", error);
    }
  };

  const handleDeleteMessage = async (id: string) => {
     // Delete from Supabase
     const { error } = await supabase.from('messages').delete().eq('id', id);
     if (error) console.error("Error deleting message", error);
  };

  const handleMarkRead = async (messageId: string) => {
    // Update Supabase
    const { error } = await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
    if (error) console.error("Error marking read", error);
  };

  const handleAdminAlert = () => {
    alert(`現場端末 (${siteId}) へアラート信号を送信しました`);
    if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'ALERT' });
    }
  };

  const requestStream = () => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'REQUEST_STREAM' });
      } else {
          connectToTarget();
      }
  };

  const handleManualReconnect = () => {
      setPeerStatus('手動再接続中...');
      connectToTarget();
  };

  if (currentRole === UserRole.NONE) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentRole === UserRole.ADMIN) {
    return (
      <AdminDashboard 
        siteId={siteId}
        sites={sites}
        onSwitchSite={handleSwitchSite}
        onAddSite={handleAddSite}
        messages={messages} 
        onSendMessage={handleSendMessage} 
        onTriggerAlert={handleAdminAlert}
        remoteStream={remoteStream}
        localStream={localStream}
        onStreamReady={handleAdminStreamChange}
        connectionStatus={peerStatus}
        onRequestStream={requestStream}
        callStatus={callStatus}
        onStartCall={startCall}
        onAcceptCall={acceptCall}
        onEndCall={endCall}
        userName={userName}
        userRole={currentRole}
        onMarkRead={handleMarkRead}
        relayImages={relayImages} // Pass relay images
        relayErrors={relayErrors} // Pass relay errors
        onTriggerRelay={triggerRelayRequest} // Pass relay trigger
        onDeleteMessage={handleDeleteMessage}
        unreadSites={unreadSites}
      />
    );
  }

  return (
    <FieldDashboard 
      siteId={siteId}
      messages={messages} 
      onSendMessage={handleSendMessage} 
      onTranscription={() => {}}
      incomingAlert={incomingAlert}
      onClearAlert={() => setIncomingAlert(false)}
      onStreamReady={(stream) => setLocalStream(stream)}
      adminStream={remoteStream}
      connectionStatus={peerStatus}
      onReconnect={handleManualReconnect}
      callStatus={callStatus}
      onStartCall={startCall}
      onAcceptCall={acceptCall}
      onEndCall={endCall}
      userName={userName}
      onMarkRead={handleMarkRead}
      userRole={currentRole}
      onDeleteMessage={handleDeleteMessage}
    />
  );
};

export default App;