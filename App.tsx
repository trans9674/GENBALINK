import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage, SiteSession } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [inputSiteId, setInputSiteId] = useState<string>("");
  
  // Admin State for Multiple Sites
  const [sites, setSites] = useState<Record<string, SiteSession>>({});
  
  // Field State
  const [fieldMessages, setFieldMessages] = useState<ChatMessage[]>([]);
  const [fieldIncomingAlert, setFieldIncomingAlert] = useState(false);
  const [fieldRemoteStream, setFieldRemoteStream] = useState<MediaStream | null>(null);
  const [fieldStatus, setFieldStatus] = useState('未接続');
  
  // Common State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Refs
  const peerRef = useRef<Peer | null>(null);
  
  // Admin Refs (Map of SiteID -> Connection)
  const adminConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const adminMediaConnsRef = useRef<Map<string, MediaConnection>>(new Map());
  
  // Field Refs
  const fieldConnRef = useRef<DataConnection | null>(null);
  const fieldMediaConnRef = useRef<MediaConnection | null>(null);
  const retryIntervalRef = useRef<any>(null);

  // --- Utility to parse Site IDs ---
  const getTargetSiteIds = useCallback(() => {
    return inputSiteId.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }, [inputSiteId]);

  // ==========================================
  // COMMON: PEER SETUP
  // ==========================================
  useEffect(() => {
    if (!inputSiteId || currentRole === UserRole.NONE) return;

    if (peerRef.current) peerRef.current.destroy();

    // Determine My Peer ID
    // If Field: Use the exact ID (e.g., "001")
    // If Admin: Use "admin-master" (simplified for this demo, assumes only 1 admin active per system or unique enough)
    // To support multiple admins, we might use "admin-" + random.
    const myPeerId = currentRole === UserRole.FIELD 
        ? inputSiteId 
        : `admin-${Math.random().toString(36).substr(2, 5)}`; 

    console.log(`Initializing Peer with ID: ${myPeerId}`);
    if (currentRole === UserRole.FIELD) setFieldStatus('初期化中...');

    const peer = new Peer(myPeerId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer Open. My ID:', id);
      if (currentRole === UserRole.FIELD) {
          setFieldStatus('待機中...');
          // Field waits for connection usually, OR connects to a known admin. 
          // For this multi-site logic, Admin initiates connection to Sites.
      } else {
          // Admin immediately tries to connect to all target sites
          connectToAllSites();
      }
    });

    peer.on('connection', (conn) => {
      console.log('Incoming Data Connection from:', conn.peer);
      if (currentRole === UserRole.FIELD) {
          setupFieldConnection(conn);
      } else {
          // Admin receiving connection (maybe restart)
          setupAdminConnection(conn, conn.peer);
      }
    });

    peer.on('call', (call) => {
      console.log('Incoming Video Call from:', call.peer);
      call.answer();
      
      if (currentRole === UserRole.FIELD) {
          // Admin calling Field (Admin Camera Feed)
          call.on('stream', stream => setFieldRemoteStream(stream));
          fieldMediaConnRef.current = call;
      } else {
          // Field calling Admin (Site Camera Feed)
          call.on('stream', stream => {
              updateSiteSession(call.peer, { stream });
          });
          adminMediaConnsRef.current.set(call.peer, call);
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (currentRole === UserRole.FIELD) setFieldStatus(`エラー: ${err.type}`);
    });

    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      peer.destroy();
      peerRef.current = null;
    };
  }, [inputSiteId, currentRole]);

  // ==========================================
  // ADMIN LOGIC
  // ==========================================
  
  const updateSiteSession = (id: string, updates: Partial<SiteSession>) => {
      setSites(prev => ({
          ...prev,
          [id]: { ...(prev[id] || { id, status: 'unknown', stream: null, lastPing: Date.now(), hasAlert: false }), ...updates }
      }));
  };

  const connectToAllSites = useCallback(() => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      
      const targetIds = getTargetSiteIds();
      // Initialize Site State
      setSites(prev => {
          const next = { ...prev };
          targetIds.forEach(id => {
              if (!next[id]) {
                  next[id] = { id, status: 'connecting', stream: null, lastPing: Date.now(), hasAlert: false };
              }
          });
          return next;
      });

      targetIds.forEach(targetId => {
          if (adminConnsRef.current.has(targetId) && adminConnsRef.current.get(targetId)?.open) return;
          
          console.log(`Admin connecting to ${targetId}...`);
          const conn = peerRef.current!.connect(targetId, { reliable: true });
          
          conn.on('open', () => setupAdminConnection(conn, targetId));
          conn.on('error', () => updateSiteSession(targetId, { status: 'error' }));
          conn.on('close', () => {
              updateSiteSession(targetId, { status: 'disconnected', stream: null });
              adminConnsRef.current.delete(targetId);
              adminMediaConnsRef.current.delete(targetId);
          });
      });
  }, [getTargetSiteIds]);

  const setupAdminConnection = (conn: DataConnection, siteId: string) => {
      console.log(`Connected to Site: ${siteId}`);
      adminConnsRef.current.set(siteId, conn);
      updateSiteSession(siteId, { status: 'connected' });
      
      // Request Stream immediately
      setTimeout(() => {
          conn.send({ type: 'REQUEST_STREAM' });
      }, 500);

      conn.on('data', (data: any) => {
          if (data.type === 'ALERT') {
             updateSiteSession(siteId, { hasAlert: true });
             setTimeout(() => updateSiteSession(siteId, { hasAlert: false }), 5000);
          }
      });
  };

  const requestSiteStream = (targetId: string) => {
      const conn = adminConnsRef.current.get(targetId);
      if (conn && conn.open) {
          conn.send({ type: 'REQUEST_STREAM' });
      } else {
          // Try reconnecting
          if (peerRef.current) {
               const newConn = peerRef.current.connect(targetId);
               newConn.on('open', () => setupAdminConnection(newConn, targetId));
          }
      }
  };

  const toggleAdminCamera = async () => {
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
          setLocalStream(null);
          adminMediaConnsRef.current.forEach(conn => conn.close());
          adminMediaConnsRef.current.clear();
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
              setLocalStream(stream);
              // Call all connected sites
              const targetIds = getTargetSiteIds();
              targetIds.forEach(id => {
                  if (peerRef.current) {
                      console.log(`Calling Site ${id}`);
                      const call = peerRef.current.call(id, stream);
                      // We don't need to store this call for receiving, but for closing later
                      // Note: PeerJS handles existing media connections loosely
                  }
              });
          } catch(e) {
              alert("カメラエラー");
          }
      }
  };

  const sendAdminAlert = (targetId: string) => {
      const conn = adminConnsRef.current.get(targetId);
      if (conn && conn.open) {
          conn.send({ type: 'ALERT' });
          alert(`${targetId} に呼出し信号を送信しました`);
      } else {
          alert(`${targetId} は未接続です`);
      }
  };


  // ==========================================
  // FIELD LOGIC
  // ==========================================
  
  const setupFieldConnection = (conn: DataConnection) => {
      fieldConnRef.current = conn;
      setFieldStatus('接続完了');
      
      conn.on('data', (data: any) => {
          if (data.type === 'CHAT') {
              setFieldMessages(prev => [...prev, data.payload]);
          } else if (data.type === 'ALERT') {
              setFieldIncomingAlert(true);
              setTimeout(() => setFieldIncomingAlert(false), 5000);
          } else if (data.type === 'REQUEST_STREAM') {
              window.dispatchEvent(new CustomEvent('TRIGGER_CALL_ADMIN'));
          }
      });

      conn.on('close', () => {
          setFieldStatus('切断されました');
          fieldConnRef.current = null;
      });
  };

  // Field: Trigger Video Call to Admin (whoever is connected via DataConnection)
  useEffect(() => {
    if (currentRole !== UserRole.FIELD) return;

    const handleTriggerCall = () => {
        if (!peerRef.current || !localStream || !fieldConnRef.current) return;
        
        const adminPeerId = fieldConnRef.current.peer;
        console.log(`Field sending stream to Admin: ${adminPeerId}`);
        const call = peerRef.current.call(adminPeerId, localStream);
        fieldMediaConnRef.current = call;
    };

    window.addEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
    return () => window.removeEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
  }, [currentRole, localStream]);


  // ==========================================
  // RENDER
  // ==========================================

  const handleLogin = (role: UserRole, idInput: string) => {
    setInputSiteId(idInput);
    setCurrentRole(role);
    if (role === UserRole.FIELD) {
        setFieldMessages([{
            id: 'welcome',
            sender: 'AI',
            text: `システム起動: ID [${idInput}]`,
            timestamp: new Date(),
            isRead: true
        }]);
    }
  };

  const handleFieldSendMessage = (text: string) => {
      const msg: ChatMessage = {
          id: Date.now().toString(), sender: 'Field', text, timestamp: new Date(), isRead: false
      };
      setFieldMessages(p => [...p, msg]);
      if (fieldConnRef.current?.open) fieldConnRef.current.send({ type: 'CHAT', payload: msg });
  };

  if (currentRole === UserRole.NONE) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentRole === UserRole.ADMIN) {
    return (
      <AdminDashboard 
        sites={sites}
        localStream={localStream}
        onToggleCamera={toggleAdminCamera}
        onTriggerAlert={sendAdminAlert}
        onRequestStream={requestSiteStream}
      />
    );
  }

  return (
    <FieldDashboard 
      siteId={inputSiteId}
      messages={fieldMessages} 
      onSendMessage={handleFieldSendMessage} 
      onTranscription={(text, type) => {
          // Simple local echo for now
          const msg: ChatMessage = { id: Date.now().toString(), sender: type === 'user' ? 'User' : 'AI', text, timestamp: new Date() };
          setFieldMessages(p => [...p, msg]);
      }}
      incomingAlert={fieldIncomingAlert}
      onClearAlert={() => setFieldIncomingAlert(false)}
      onStreamReady={(stream) => setLocalStream(stream)}
      adminStream={fieldRemoteStream} 
      connectionStatus={fieldStatus}
      onReconnect={() => window.location.reload()} // Simplified reconnect
    />
  );
};

export default App;