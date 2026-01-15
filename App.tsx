import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage, Attachment, CallStatus, Site, CameraConfig } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>(""); // Current active site ID
  const [userName, setUserName] = useState<string>(""); 
  
  // Chat Messages Management (Persisted per site)
  const [allMessages, setAllMessages] = useState<Record<string, ChatMessage[]>>(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('genbalink_all_messages');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Hydrate dates
                Object.keys(parsed).forEach(key => {
                    parsed[key] = parsed[key].map((m: any) => ({
                        ...m,
                        timestamp: new Date(m.timestamp)
                    }));
                });
                return parsed;
            } catch (e) {
                console.error("Failed to load messages", e);
            }
        }
    }
    return {};
  });

  // Relay Images State (Admin Side) - Map camera ID to base64 image string
  const [relayImages, setRelayImages] = useState<Record<string, string>>({});

  // Save messages to local storage whenever they change
  useEffect(() => {
      localStorage.setItem('genbalink_all_messages', JSON.stringify(allMessages));
  }, [allMessages]);

  // Derived state for current view
  const currentMessages = siteId ? (allMessages[siteId] || []) : [];

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

  // --- メッセージ受信処理 (共通) ---
  const handleDataReceived = useCallback(async (data: any) => {
    // console.log("Data received:", data.type); // Reduce log noise for relay
    const { type, payload } = data;
    
    if (type === 'CHAT') {
       setAllMessages(prev => {
         const siteMsgs = prev[siteId] || [];
         const incomingMsg = { ...payload, timestamp: new Date(payload.timestamp) };
         if (siteMsgs.some(m => m.id === incomingMsg.id)) return prev;
         
         return {
             ...prev,
             [siteId]: [...siteMsgs, incomingMsg]
         };
       });
    } else if (type === 'ALERT') {
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
            // Attempt to fetch the local camera image
            // NOTE: This assumes the camera supports CORS or browser security is permissive
            const response = await fetch(payload.url, { mode: 'cors' });
            if (!response.ok) throw new Error('Network response was not ok');
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
        } catch (error) {
            console.error("Relay Fetch Error (CORS?):", error);
            // Optionally send back an error state
        }
    } else if (type === 'RELAY_RESPONSE') {
        // [Admin Side] Received relayed image from Field
        setRelayImages(prev => ({
            ...prev,
            [payload.cameraId]: payload.image
        }));
    }
  }, [siteId]);

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
    if (initialSites) setSites(initialSites);
    setAllMessages(prev => {
        if (!prev[id] || prev[id].length === 0) {
            return {
                ...prev,
                [id]: [{
                  id: 'welcome',
                  sender: 'AI',
                  text: `システム起動: ID [${id}]`,
                  timestamp: new Date(),
                  isRead: true
                }]
            };
        }
        return prev;
    });
  };

  const handleSwitchSite = (newSiteId: string) => {
      if (newSiteId === siteId) return;
      setAllMessages(prev => {
          if (!prev[newSiteId]) return { ...prev, [newSiteId]: [] };
          return prev;
      });
      setSiteId(newSiteId);
      setRelayImages({}); // Clear relay images
  };

  const handleAddSite = (newSite: Site) => {
      const updated = [...sites, newSite];
      setSites(updated);
      localStorage.setItem('genbalink_sites', JSON.stringify(updated));
  };

  const sendMessageToPeer = (message: ChatMessage) => {
    if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'CHAT', payload: message });
    }
  };

  const handleSendMessage = (text: string, attachment?: Attachment) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      sender: userName,
      text,
      timestamp: new Date(),
      isRead: false,
      attachment
    };
    
    setAllMessages(prev => ({
        ...prev,
        [siteId]: [...(prev[siteId] || []), newMessage]
    }));
    
    sendMessageToPeer(newMessage);
  };

  const handleMarkRead = (messageId: string) => {
    setAllMessages(prev => ({
        ...prev,
        [siteId]: (prev[siteId] || []).map(msg => 
            msg.id === messageId ? { ...msg, isRead: true } : msg
        )
    }));
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
        messages={currentMessages} 
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
        onTriggerRelay={triggerRelayRequest} // Pass relay trigger
      />
    );
  }

  return (
    <FieldDashboard 
      siteId={siteId}
      messages={currentMessages} 
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
    />
  );
};

export default App;