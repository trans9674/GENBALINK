import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection } from 'peerjs';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingAlert, setIncomingAlert] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStatus, setPeerStatus] = useState<string>('未接続');

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
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
    }
  }, []);

  // --- 接続確立後のセットアップ ---
  const setupConnection = useCallback((conn: DataConnection) => {
      if (connRef.current?.open) return; // 既に接続済みなら無視

      console.log("Connection Established!");
      connRef.current = conn;
      setPeerStatus('接続完了');
      
      // リトライ停止
      if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
      }

      conn.on('data', handleDataReceived);
      
      conn.on('close', () => {
         console.log("Connection closed remote");
         setPeerStatus('切断: 再接続待機中...');
         connRef.current = null;
         // 切断されたらリトライ再開
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
    if (connRef.current?.open) return; // 接続済みなら何もしない

    // 接続先ID決定: 
    // Admin -> Field (ID: siteId)
    // Field -> Admin (ID: siteId-admin)
    const targetId = currentRole === UserRole.ADMIN ? siteId : `${siteId}-admin`;
    
    // 自分自身への接続を防ぐ
    if (targetId === peerRef.current.id) return;

    console.log(`Connecting to ${targetId}...`);
    setPeerStatus(`接続試行中...`);

    const conn = peerRef.current.connect(targetId, {
        reliable: true
    });

    // 相手が見つかって接続が開いたとき
    conn.on('open', () => {
        setupConnection(conn);
    });

    conn.on('error', (err) => {
        // 接続失敗はよくあるのでログだけ出してリトライに任せる
        console.log("Connect attempt failed (retrying...):", err);
    });

  }, [siteId, currentRole, setupConnection]);

  const startConnectionRetry = useCallback(() => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      
      // 即時実行
      connectToTarget();
      
      // 3秒ごとにリトライ (双方向から攻めるので短めに)
      retryIntervalRef.current = setInterval(() => {
          if (!connRef.current || !connRef.current.open) {
              connectToTarget();
          }
      }, 3000);
  }, [connectToTarget]);


  // --- Peer初期化 ---
  useEffect(() => {
    if (!siteId || currentRole === UserRole.NONE) return;

    // 既存の接続があればクリーンアップ
    if (peerRef.current) peerRef.current.destroy();

    const myPeerId = currentRole === UserRole.FIELD ? siteId : `${siteId}-admin`;
    console.log(`Initializing Peer with ID: ${myPeerId}`);
    setPeerStatus('初期化中...');

    const peer = new Peer(myPeerId, {
      debug: 1,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer Open. My ID:', id);
      setPeerStatus('待機中: 相手を探しています...');
      // ID取得でき次第、接続試行開始 (Admin/Field両方)
      startConnectionRetry();
    });

    // 相手から接続が来た場合 (受動接続)
    peer.on('connection', (conn) => {
      console.log('Incoming Data Connection from:', conn.peer);
      conn.on('open', () => {
          setupConnection(conn);
      });
    });

    peer.on('call', (call) => {
      console.log('Incoming Call from:', call.peer);
      call.answer(); 
      call.on('stream', (stream) => {
        console.log("Stream Received");
        setRemoteStream(stream);
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
         setPeerStatus('ID重複エラー: 既にログイン中です');
      } else if (err.type === 'peer-unavailable') {
         // 相手がまだいないだけなので無視してリトライ継続
      } else {
         setPeerStatus(`エラー: ${err.type}`);
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
            console.warn("Cannot call admin: Peer or Stream not ready");
            alert("カメラ準備中または通信エラーです");
            return;
        }
        const adminId = `${siteId}-admin`;
        console.log(`Calling Admin (${adminId}) with stream...`);
        
        const call = peerRef.current.call(adminId, localStream);
        call.on('error', (e) => console.error("Call error", e));
    };

    window.addEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
    return () => window.removeEventListener('TRIGGER_CALL_ADMIN', handleTriggerCall);
  }, [currentRole, siteId, localStream]);


  // --- UI Actions ---
  const handleLogin = (role: UserRole, id: string) => {
    setSiteId(id);
    setCurrentRole(role);
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

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      sender: currentRole === UserRole.ADMIN ? 'Admin' : 'Field',
      text,
      timestamp: new Date(),
      isRead: false
    };
    setMessages(prev => [...prev, newMessage]);
    sendMessageToPeer(newMessage);
  };

  const handleTranscription = (text: string, type: 'user' | 'model') => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender: type === 'user' ? 'User' : 'AI', 
      text,
      timestamp: new Date(),
      isRead: true
    };
    setMessages(prev => [...prev, newMessage]);
    sendMessageToPeer(newMessage);
  };

  const handleAdminAlert = () => {
    alert(`現場端末 (${siteId}) へアラート信号を送信しました`);
    if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'ALERT' });
    }
  };

  const requestStream = () => {
      if (connRef.current && connRef.current.open) {
          console.log("Requesting stream from Field...");
          connRef.current.send({ type: 'REQUEST_STREAM' });
      } else {
          alert("現場端末とデータ接続されていません。接続完了までお待ちください。");
          // 手動リトライも兼ねる
          connectToTarget();
      }
  };

  // 手動再接続用
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
        connectionStatus={peerStatus}
        onRequestStream={requestStream}
      />
    );
  }

  return (
    <FieldDashboard 
      siteId={siteId}
      messages={messages} 
      onSendMessage={handleSendMessage} 
      onTranscription={handleTranscription}
      incomingAlert={incomingAlert}
      onClearAlert={() => setIncomingAlert(false)}
      onStreamReady={(stream) => setLocalStream(stream)}
      connectionStatus={peerStatus}
      onReconnect={handleManualReconnect}
    />
  );
};

export default App;