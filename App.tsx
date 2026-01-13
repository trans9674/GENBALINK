import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage, Attachment, CallStatus } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>("");
  const [userName, setUserName] = useState<string>(""); 
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingAlert, setIncomingAlert] = useState(false);
  
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

  // --- メッセージ受信処理 (共通) ---
  const handleDataReceived = useCallback((data: any) => {
    console.log("Data received:", data);
    const { type, payload } = data;
    
    if (type === 'CHAT') {
       setMessages(prev => {
         const incomingMsg = { ...payload, timestamp: new Date(payload.timestamp) };
         if (prev.some(m => m.id === incomingMsg.id)) return prev;
         return [...prev, incomingMsg];
       });
    } else if (type === 'ALERT') {
       setIncomingAlert(true);
       setTimeout(() => setIncomingAlert(false), 5000);
    } else if (type === 'REQUEST_STREAM') {
       // 現場側: 映像要求を受け取ったらトリガーイベント発火
       window.dispatchEvent(new CustomEvent('TRIGGER_CALL_ADMIN'));
    } else if (type === 'CALL_START') {
        setCallStatus('incoming');
    } else if (type === 'CALL_ACCEPT') {
        setCallStatus('connected');
    } else if (type === 'CALL_END') {
        setCallStatus('idle');
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

      // 既存のリスナーを削除
      conn.off('data');
      conn.off('close');
      conn.off('error');

      conn.on('data', handleDataReceived);
      
      conn.on('close', () => {
         console.log("Connection closed remote");
         setPeerStatus('切断: 再接続待機中...');
         connRef.current = null;
         setCallStatus('idle');
         startConnectionRetry();
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
      // 即時実行
      connectToTarget();
      // 定期実行
      retryIntervalRef.current = setInterval(() => {
          if (!connRef.current || !connRef.current.open) {
              connectToTarget();
          }
      }, 3000);
  }, [connectToTarget]);


  // --- Peer初期化 ---
  useEffect(() => {
    if (!siteId || currentRole === UserRole.NONE) return;

    if (peerRef.current) peerRef.current.destroy();

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
      // すでにOpenしている場合のハンドリング (ここが重要)
      if (conn.open) {
          setupConnection(conn);
      } else {
          conn.on('open', () => setupConnection(conn));
      }
    });

    // 映像着信処理
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
         // エラーログのみ
      }
    });

    peer.on('disconnected', () => {
       setPeerStatus('サーバー切断: 再接続中...');
       peer.reconnect();
    });

    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      peer.destroy();
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
        console.log(`Calling Admin (${adminId}) with stream...`);
        const call = peerRef.current.call(adminId, localStream);
        mediaConnRef.current = call;
    };

    window.addEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
    return () => window.removeEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
  }, [currentRole, siteId, localStream]);


  // --- 管理者用: ストリーム更新処理 (カメラ or 画面共有) ---
  const handleAdminStreamChange = useCallback((stream: MediaStream | null) => {
      // 既存のストリームがあれば停止
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
      }
      if (mediaConnRef.current) {
          mediaConnRef.current.close();
          mediaConnRef.current = null;
      }

      setLocalStream(stream);

      // 新しいストリームがあれば発信
      if (stream && peerRef.current) {
          const targetId = siteId;
          console.log(`Calling Field (${targetId}) with updated stream...`);
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
          
          // Ensure we are sending video/audio if not already
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


  // --- UI Actions ---
  const handleLogin = (role: UserRole, id: string, name: string) => {
    setSiteId(id);
    setCurrentRole(role);
    
    // Name Logic: Field is always "現地", Admin uses input or defaults to "管理者"
    const effectiveName = role === UserRole.FIELD ? "現地" : (name || "管理者");
    setUserName(effectiveName);

    setMessages([{
      id: 'welcome',
      sender: 'AI',
      text: `システム起動: ID [${id}]`,
      timestamp: new Date(),
      isRead: true
    }]);
  };

  const sendMessageToPeer = (message: ChatMessage) => {
    if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'CHAT', payload: message });
    }
  };

  const handleSendMessage = (text: string, attachment?: Attachment) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      sender: userName, // Use the stored user name
      text,
      timestamp: new Date(),
      isRead: false,
      attachment // Add attachment if exists
    };
    setMessages(prev => [...prev, newMessage]);
    sendMessageToPeer(newMessage);
  };

  const handleMarkRead = (messageId: string) => {
    setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
            return { ...msg, isRead: true };
        }
        return msg;
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
        onMarkRead={handleMarkRead} // Pass function to AdminDashboard
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
    />
  );
};

export default App;