import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage, Attachment, CallStatus, Site } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { supabase } from './lib/supabaseClient';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>(""); 
  const [userName, setUserName] = useState<string>(""); 
  
  // Chat Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [incomingAlert, setIncomingAlert] = useState(false);
  const [isFieldCameraOff, setIsFieldCameraOff] = useState(false);
  const [fieldAlertVolume, setFieldAlertVolume] = useState<number>(1.0);
  
  // Sites
  const [sites, setSites] = useState<Site[]>([]);
  const [unreadSites, setUnreadSites] = useState<Set<string>>(new Set());
  
  // Streams
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStatus, setPeerStatus] = useState<string>('未接続');
  
  // Call State
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const mediaConnRef = useRef<MediaConnection | null>(null);
  
  // Keep track of connection attempts
  const reconnectTimeoutRef = useRef<any>(null);

  // --- Fetch Sites (Admin) ---
  useEffect(() => {
    const fetchSites = async () => {
        const { data } = await supabase.from('sites').select('*').order('created_at', { ascending: true });
        if (data) {
            setSites(data.map((s: any) => ({ id: s.id, name: s.name })));
        }
    };
    fetchSites();

    const channel = supabase.channel('public:sites')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
            fetchSites();
        })
        .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- Unread Status Logic (Admin) ---
  const checkSiteUnreadStatus = useCallback(async (targetSiteId: string) => {
      const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', targetSiteId)
          .eq('is_read', false);
      
      setUnreadSites(prev => {
          const next = new Set(prev);
          if (count === 0) next.delete(targetSiteId);
          else next.add(targetSiteId);
          return next;
      });
  }, []);

  useEffect(() => {
    if (currentRole !== UserRole.ADMIN) return;
    const fetchUnread = async () => {
        const { data } = await supabase.from('messages').select('site_id').eq('is_read', false);
        if (data) {
            const unreadSet = new Set(data.map(m => m.site_id));
            setUnreadSites(unreadSet);
        }
    };
    fetchUnread();

    const channel = supabase.channel('global_unread_tracker')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const newMsg = payload.new;
            if (newMsg.is_read === false && newMsg.sender !== userName) {
                setUnreadSites(prev => new Set(prev).add(newMsg.site_id));
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
            checkSiteUnreadStatus(payload.new.site_id);
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRole, userName, checkSiteUnreadStatus]);


  // --- Fetch Messages (Per Site) ---
  useEffect(() => {
      if (!siteId) {
          setMessages([]);
          return;
      }

      const fetchMessages = async () => {
          const { data } = await supabase
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

      const channel = supabase.channel(`messages:${siteId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `site_id=eq.${siteId}` }, 
        (payload) => {
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
                 const deletedId = payload.old.id;
                 if (deletedId) setMessages(prev => prev.filter(msg => msg.id !== deletedId));
             }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [siteId]);


  // --- Data Connection Handling ---
  const handleDataReceived = useCallback((data: any) => {
    const { type, payload } = data;
    
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
        setRemoteStream(null);
    } else if (type === 'STREAM_STOP') {
        setRemoteStream(null);
    } else if (type === 'CAMERA_STATUS') {
        setIsFieldCameraOff(payload.isOff);
    } else if (type === 'SET_VOLUME') {
        setFieldAlertVolume(payload.volume);
    }
  }, []);

  // --- PeerJS & Connection Logic ---

  const destroyPeer = useCallback(() => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      
      if (mediaConnRef.current) {
          mediaConnRef.current.close();
          mediaConnRef.current = null;
      }
      if (connRef.current) {
          connRef.current.close();
          connRef.current = null;
      }
      if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
      }
      setRemoteStream(null);
      setPeerStatus('切断(リセット)');
  }, []);

  const setupDataConnection = useCallback((conn: DataConnection) => {
      connRef.current = conn;
      setPeerStatus('接続完了');

      conn.on('data', handleDataReceived);
      
      conn.on('close', () => {
         console.log("Data connection closed");
         setPeerStatus('切断: 相手がいません');
         connRef.current = null;
         setCallStatus('idle');
         setRemoteStream(null);
      });
      
      conn.on('error', (err) => {
          console.error("Data Conn Error", err);
      });
  }, [handleDataReceived]);

  const initPeer = useCallback((forceReset = false) => {
      if (!siteId || currentRole === UserRole.NONE) return;

      if (peerRef.current && !forceReset && !peerRef.current.destroyed) {
          // Already active
          return;
      }

      if (forceReset) destroyPeer();

      const myPeerId = currentRole === UserRole.FIELD ? siteId : `${siteId}-admin`;
      console.log(`[PeerJS] Initializing: ${myPeerId}`);
      setPeerStatus('初期化中...');

      const peer = new Peer(myPeerId, { 
          debug: 1, // Reduced debug level for performance
          config: {
              iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' }
              ]
          } 
      });
      peerRef.current = peer;

      peer.on('open', (id) => {
          console.log('[PeerJS] ID Open:', id);
          setPeerStatus('待機中...');
          
          // If we are Admin, we generally wait.
          // If we are Field, we try to connect to Admin aggressively.
          if (currentRole === UserRole.ADMIN) {
              connectToPeer(`${siteId}-admin`); // Try to connect to Field if Admin
          } else {
              connectToPeer(`${siteId}-admin`); // Try to connect to Admin if Field (wait, Field ID is siteId, Admin is siteId-admin)
              // Correction: Field has ID = siteId. Admin has ID = siteId-admin.
              // So Field should connect to `${siteId}-admin`.
          }
      });

      peer.on('connection', (conn) => {
          console.log('[PeerJS] Incoming Data Connection');
          setupDataConnection(conn);
      });

      peer.on('call', (call) => {
          console.log('[PeerJS] Incoming Call');
          
          // Always answer incoming calls.
          // If we have a local stream, send it back.
          call.answer(localStream || undefined);
          mediaConnRef.current = call;

          call.on('stream', (stream) => {
              console.log("[PeerJS] Received Stream");
              setRemoteStream(stream);
          });
          
          call.on('close', () => {
              console.log("[PeerJS] Call Closed");
              // Don't nullify remoteStream immediately if just refreshing
          });
          
          call.on('error', (e) => console.error("[PeerJS] Call Error", e));
      });

      peer.on('error', (err) => {
          console.error('[PeerJS] Error:', err);
          if (err.type === 'unavailable-id') {
              setPeerStatus('ID重複: 他の端末でログイン中');
          } else if (err.type === 'peer-unavailable') {
              // Retry logic for connection
              setPeerStatus('相手が見つかりません');
              reconnectTimeoutRef.current = setTimeout(() => {
                   if (currentRole === UserRole.FIELD) connectToPeer(`${siteId}-admin`);
                   else connectToPeer(siteId); // Admin connects to Field
              }, 3000);
          } else {
              setPeerStatus(`エラー: ${err.type}`);
          }
      });

      peer.on('disconnected', () => {
          setPeerStatus('サーバー切断: 再接続中...');
          // Don't just reconnect, sometimes hard reset is better if stuck
          peer.reconnect();
      });

  }, [siteId, currentRole, destroyPeer, localStream, setupDataConnection]);

  const connectToPeer = (targetId: string) => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      if (connRef.current && connRef.current.open) return;

      console.log(`[PeerJS] Connecting to ${targetId}...`);
      const conn = peerRef.current.connect(targetId, { reliable: true });
      
      conn.on('open', () => setupDataConnection(conn));
      conn.on('error', (e) => console.log("Connect fail", e));
  };

  // Initial Setup
  useEffect(() => {
      initPeer(false);
      return () => destroyPeer();
  }, [initPeer, destroyPeer]);

  // --- Hard Reset / Manual Reconnect ---
  const handleHardReconnect = () => {
      console.log("Triggering Hard Reset...");
      initPeer(true);
  };

  // --- Auto-Call Logic for Field ---
  // If we are Field, Connected status, have Stream, and NO media connection -> Call Admin
  useEffect(() => {
      if (callStatus === 'connected' && currentRole === UserRole.FIELD && localStream && peerRef.current) {
           if (!mediaConnRef.current || !mediaConnRef.current.open) {
               console.log("[Field] Call Status Connected -> Calling Admin with Video");
               const adminId = `${siteId}-admin`;
               const call = peerRef.current.call(adminId, localStream);
               mediaConnRef.current = call;
               call.on('stream', (s) => setRemoteStream(s));
           }
      }
  }, [callStatus, currentRole, localStream, siteId]);

  // --- Admin Stream Switching (Screen Share) ---
  const handleAdminStreamChange = useCallback((stream: MediaStream | null) => {
      // 1. Update Local State
      setLocalStream(stream);

      if (!peerRef.current || !siteId) return;

      // 2. Close existing media connection to force refresh on receiving end
      if (mediaConnRef.current) {
          mediaConnRef.current.close();
          mediaConnRef.current = null;
      }

      // 3. If stream exists, call the Field device immediately
      if (stream) {
          console.log("[Admin] Starting Screen Share / Video Stream...");
          // Slight delay to ensure previous close events propagate if needed, but usually instant is fine with PeerJS
          setTimeout(() => {
            if (peerRef.current) {
                const call = peerRef.current.call(siteId, stream);
                mediaConnRef.current = call;
                // We don't necessarily expect a stream back immediately unless bidirectional, 
                // but setting listener is good practice.
                call.on('stream', (rs) => setRemoteStream(rs));
            }
          }, 100);
      } else {
          // Explicitly signal stop
          if (connRef.current && connRef.current.open) {
              connRef.current.send({ type: 'STREAM_STOP' });
          }
      }
  }, [siteId]);


  // --- Actions ---

  const startCall = () => {
      if (connRef.current?.open) {
          connRef.current.send({ type: 'CALL_START' });
          setCallStatus('outgoing');
      } else {
          alert("相手と接続されていません");
      }
  };

  const acceptCall = () => {
      if (connRef.current?.open) {
          connRef.current.send({ type: 'CALL_ACCEPT' });
          setCallStatus('connected');
      }
  };

  const endCall = () => {
      if (connRef.current?.open) connRef.current.send({ type: 'CALL_END' });
      if (mediaConnRef.current) {
          mediaConnRef.current.close();
          mediaConnRef.current = null;
      }
      setCallStatus('idle');
      setRemoteStream(null);
  };

  const handleSetCameraStatus = (isOff: boolean) => {
      if (connRef.current?.open) connRef.current.send({ type: 'CAMERA_STATUS', payload: { isOff } });
  };

  const handleSetRemoteVolume = (volume: number) => {
      if (connRef.current?.open) connRef.current.send({ type: 'SET_VOLUME', payload: { volume } });
  };

  const handleLogin = (role: UserRole, id: string, name: string) => {
    setSiteId(id);
    setCurrentRole(role);
    setUserName(role === UserRole.FIELD ? "現地" : (name || "管理者"));
  };

  const handleSwitchSite = (newSiteId: string) => {
      setSiteId(newSiteId);
      setIsFieldCameraOff(false); 
      setFieldAlertVolume(1.0);
      setMessages([]); 
      // Trigger peer reset for new ID
      setTimeout(() => initPeer(true), 100);
  };

  const handleSendMessage = async (text: string, attachment?: Attachment) => {
    if (!siteId) return;
    await supabase.from('messages').insert({
        site_id: siteId,
        sender: userName,
        text: text,
        is_read: false,
        attachment: attachment
    });
  };

  const handleBroadcastMessage = async (targetSiteIds: string[], text: string, isNotice: boolean) => {
      const messagesToInsert = targetSiteIds.map(sid => ({
          site_id: sid,
          sender: userName,
          text: isNotice ? `【共通連絡事項】\n${text}` : text,
          is_read: false,
          created_at: new Date().toISOString()
      }));
      await supabase.from('messages').insert(messagesToInsert);
      alert(`${targetSiteIds.length}件の現場へ送信しました`);
  };

  const handleDeleteMessage = async (id: string) => {
     setMessages(prev => prev.filter(m => m.id !== id));
     await supabase.from('messages').delete().eq('id', id);
     if (currentRole === UserRole.ADMIN && siteId) checkSiteUnreadStatus(siteId);
  };

  const handleMarkRead = async (messageId: string) => {
    await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
    if (currentRole === UserRole.ADMIN && siteId) checkSiteUnreadStatus(siteId);
  };

  const handleUpdateSite = async (id: string, newName: string) => {
     await supabase.from('sites').update({ name: newName }).eq('id', id);
  };

  const handleDeleteSite = async (id: string) => {
      // Clean up related data
      await supabase.from('messages').delete().eq('site_id', id);
      await supabase.from('cameras').delete().eq('site_id', id);
      await supabase.from('sites').delete().eq('id', id);
      
      // Update Local State
      setSites(prev => prev.filter(s => s.id !== id));
      if (siteId === id) setSiteId("");
  };

  const handleAdminAlert = () => {
    if (connRef.current?.open) {
        connRef.current.send({ type: 'ALERT' });
        alert(`現場端末 (${siteId}) へアラート信号を送信しました`);
    } else {
        alert("端末と接続されていません");
    }
  };

  const requestStream = () => {
      if (connRef.current?.open) connRef.current.send({ type: 'REQUEST_STREAM' });
      else alert("端末と接続されていません");
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
        onAddSite={async (s) => { await supabase.from('sites').insert(s); }}
        onUpdateSite={handleUpdateSite}
        onDeleteSite={handleDeleteSite}
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
        unreadSites={Array.from(unreadSites)}
        isFieldCameraOff={isFieldCameraOff}
        onBroadcastMessage={handleBroadcastMessage} 
        onSetRemoteVolume={handleSetRemoteVolume}
      />
    );
  }

  return (
    <FieldDashboard 
      siteId={siteId}
      siteName={sites.find(s => s.id === siteId)?.name}
      messages={messages} 
      onSendMessage={handleSendMessage} 
      onTranscription={() => {}}
      incomingAlert={incomingAlert}
      onClearAlert={() => setIncomingAlert(false)}
      onStreamReady={(stream) => setLocalStream(stream)}
      adminStream={remoteStream}
      connectionStatus={peerStatus}
      onReconnect={handleHardReconnect} // Use Hard Reset here
      callStatus={callStatus}
      onStartCall={startCall}
      onAcceptCall={acceptCall}
      onEndCall={endCall}
      userName={userName}
      onMarkRead={handleMarkRead}
      userRole={currentRole}
      onDeleteMessage={handleDeleteMessage}
      onSetCameraStatus={handleSetCameraStatus}
      alertVolume={fieldAlertVolume}
    />
  );
};

export default App;