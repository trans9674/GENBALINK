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

  const [incomingAlert, setIncomingAlert] = useState(false);
  const [isFieldCameraOff, setIsFieldCameraOff] = useState(false); // New state for Camera Off message
  const [fieldAlertVolume, setFieldAlertVolume] = useState<number>(1.0); // State for Alert Volume on Field device
  
  // Sites Management (For Admin)
  const [sites, setSites] = useState<Site[]>([]);

  // Unread Sites Management (Set of Site IDs)
  const [unreadSites, setUnreadSites] = useState<Set<string>>(new Set());
  
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

  // --- Helper: Check Unread Status for a Site ---
  const checkSiteUnreadStatus = useCallback(async (targetSiteId: string) => {
      const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', targetSiteId)
          .eq('is_read', false);
      
      setUnreadSites(prev => {
          const next = new Set(prev);
          if (count === 0) {
              next.delete(targetSiteId);
          } else {
              next.add(targetSiteId);
          }
          return next;
      });
  }, []);

  // --- Manage Unread Sites (Global Subscription for Admin) ---
  useEffect(() => {
    if (currentRole !== UserRole.ADMIN) return;

    // 1. Initial Fetch of all sites with unread messages
    const fetchUnread = async () => {
        const { data } = await supabase
            .from('messages')
            .select('site_id')
            .eq('is_read', false);
        
        if (data) {
            const unreadSet = new Set(data.map(m => m.site_id));
            setUnreadSites(unreadSet);
        }
    };
    fetchUnread();

    // 2. Subscribe to ALL messages to detect unread status changes globally
    const channel = supabase.channel('global_unread_tracker')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const newMsg = payload.new;
            // If message is unread and NOT from me (Admin), add to unread list
            // Note: We check sender !== userName to avoid self-messages triggering notifications
            if (newMsg.is_read === false && newMsg.sender !== userName) {
                setUnreadSites(prev => new Set(prev).add(newMsg.site_id));
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
            // When a message is updated (e.g., marked read), re-check that site's status
            const updatedMsg = payload.new;
            checkSiteUnreadStatus(updatedMsg.site_id);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
             // When deleted, re-check (payload.old contains the ID, but we need site_id which might be in old record depending on replica identity, usually simpler to just check active site or reload)
             // Supabase delete payload usually only has ID unless FULL replica identity.
             // For simplicity, if we are viewing the site, we handle it locally. 
             // Global delete updates are harder without FULL replica identity, but we can rely on manual checks.
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRole, userName, checkSiteUnreadStatus]);


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
                 // Supabase Realtime sends `old` with PK on delete
                 const deletedId = payload.old.id;
                 if (deletedId) {
                     setMessages(prev => prev.filter(msg => msg.id !== deletedId));
                 }
             }
        })
        .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [siteId]);


  // --- メッセージ受信処理 (PeerJS: Signaling Only) ---
  const handleDataReceived = useCallback(async (data: any) => {
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
    } else if (type === 'STREAM_STOP') {
        // [Field Side] Admin stopped stream (screen share or camera)
        setRemoteStream(null);
    } else if (type === 'CAMERA_STATUS') {
        // [Admin Side] Received camera status update from Field
        setIsFieldCameraOff(payload.isOff);
    } else if (type === 'SET_VOLUME') {
        // [Field Side] Received volume setting from Admin
        setFieldAlertVolume(payload.volume);
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
         setIsFieldCameraOff(false); // Reset status on disconnect
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
        setIsFieldCameraOff(false);
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
      } else {
          // Explicitly signal stream stop
          if (connRef.current && connRef.current.open) {
              connRef.current.send({ type: 'STREAM_STOP' });
          }
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

  // --- Field Camera Status Handling ---
  const handleSetCameraStatus = (isOff: boolean) => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'CAMERA_STATUS', payload: { isOff } });
      }
  };

  // --- Remote Volume Control Handling ---
  const handleSetRemoteVolume = (volume: number) => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ 
              type: 'SET_VOLUME', 
              payload: { volume } 
          });
      }
  };

  // --- UI Actions ---
  const handleLogin = (role: UserRole, id: string, name: string, initialSites?: Site[]) => {
    setSiteId(id);
    setCurrentRole(role);
    const effectiveName = role === UserRole.FIELD ? "現地" : (name || "管理者");
    setUserName(effectiveName);
  };

  const handleSwitchSite = (newSiteId: string) => {
      setSiteId(newSiteId);
      setIsFieldCameraOff(false); // Reset when switching sites
      setFieldAlertVolume(1.0); // Reset volume expectation
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

  const handleBroadcastMessage = async (targetSiteIds: string[], text: string, isNotice: boolean) => {
      const messagesToInsert = targetSiteIds.map(sid => ({
          site_id: sid,
          sender: userName,
          text: isNotice ? `【共通連絡事項】\n${text}` : text,
          is_read: false,
          created_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('messages').insert(messagesToInsert);
      
      if (error) {
          console.error("Error broadcasting messages", error);
          alert("一斉送信に失敗しました");
      } else {
          alert(`${targetSiteIds.length}件の現場へ送信しました`);
      }
  };

  const handleDeleteMessage = async (id: string) => {
     setMessages(prev => prev.filter(m => m.id !== id));
     const { error } = await supabase.from('messages').delete().eq('id', id);
     
     if (error) {
         console.error("Error deleting message", error);
     } else {
         if (currentRole === UserRole.ADMIN && siteId) {
             checkSiteUnreadStatus(siteId);
         }
     }
  };

  const handleMarkRead = async (messageId: string) => {
    const { error } = await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
    if (error) console.error("Error marking read", error);
    if (currentRole === UserRole.ADMIN && siteId) {
        checkSiteUnreadStatus(siteId);
    }
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
        onDeleteMessage={handleDeleteMessage}
        unreadSites={Array.from(unreadSites)} // Pass unread sites as array
        isFieldCameraOff={isFieldCameraOff} // Pass Camera Off status
        onBroadcastMessage={handleBroadcastMessage} 
        onSetRemoteVolume={handleSetRemoteVolume} // Pass volume handler
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
      onSetCameraStatus={handleSetCameraStatus}
      alertVolume={fieldAlertVolume} // Pass volume state
    />
  );
};

export default App;