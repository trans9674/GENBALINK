import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer, DataConnection, MediaConnection } from 'peerjs';

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
       // 現場側: 映像要求を受け取ったら、管理者に電話をかける
       // 注意: localStreamはRefではなくStateだが、Callback内で最新を参照するために依存配列に注意するか、
       // ここではイベント発火させるだけにする。
       // シンプルにするため、CustomEventを発火させてuseEffectで拾う
       window.dispatchEvent(new CustomEvent('TRIGGER_CALL_ADMIN'));
    }
  }, []);

  // --- Peer初期化とイベントリスナー ---
  useEffect(() => {
    if (!siteId || currentRole === UserRole.NONE) return;

    // ID生成: 現場=そのもの、管理者=admin付き
    const myPeerId = currentRole === UserRole.FIELD ? siteId : `${siteId}-admin`;
    
    console.log(`Initializing Peer with ID: ${myPeerId}`);
    setPeerStatus('Peer初期化中...');

    const peer = new Peer(myPeerId, {
      debug: 2,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Peer Open. ID:', id);
      setPeerStatus(`ID待機中: ${id}`);

      // 管理者の場合、現場へ自動接続を開始
      if (currentRole === UserRole.ADMIN) {
        startConnectionRetry();
      }
    });

    peer.on('connection', (conn) => {
      console.log('Incoming Data Connection:', conn.peer);
      connRef.current = conn;
      setPeerStatus('チャット接続完了');
      
      conn.on('data', handleDataReceived);
      conn.on('close', () => {
         setPeerStatus('チャット切断');
         connRef.current = null;
      });
      conn.on('error', (err) => console.error("Conn Error", err));
    });

    peer.on('call', (call) => {
      console.log('Incoming Call (Video) from:', call.peer);
      // 管理者: 映像を受け取る
      // 現場: 通常かかってこないが、双方向ならここで応答
      
      call.answer(); // 映像を送らずに応答（受信専用）
      
      call.on('stream', (stream) => {
        console.log("Stream Received");
        setRemoteStream(stream);
      });
      call.on('error', (e) => console.error("Call Error", e));
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      // ID重複などの致命的エラーの場合
      if (err.type === 'unavailable-id') {
         setPeerStatus('ID重複エラー: 別タブを閉じてください');
      } else {
         setPeerStatus(`エラー: ${err.type}`);
      }
    });

    peer.on('disconnected', () => {
       setPeerStatus('Peerサーバー切断: 再接続中...');
       peer.reconnect();
    });

    return () => {
      stopConnectionRetry();
      peer.destroy();
      peerRef.current = null;
    };
  }, [siteId, currentRole, handleDataReceived]);


  // --- 管理者用: 接続リトライロジック ---
  const connectToField = () => {
    if (!peerRef.current || currentRole !== UserRole.ADMIN) return;
    const targetId = siteId; // 現場のID

    console.log(`Connecting to Field (${targetId})...`);
    const conn = peerRef.current.connect(targetId, {
        reliable: true
    });

    conn.on('open', () => {
        console.log("Connected to Field!");
        connRef.current = conn;
        setPeerStatus('現場接続完了');
        stopConnectionRetry(); // 成功したらリトライ停止
        
        // メッセージ受信設定
        conn.on('data', handleDataReceived);
        conn.on('close', () => {
            console.log("Connection closed");
            setPeerStatus('現場切断');
            connRef.current = null;
            // 切断されたら再試行再開？ 必要に応じて
        });
    });

    conn.on('error', (err) => {
        console.log("Connection attempt failed:", err);
        // リトライはintervalに任せる
    });
  };

  const startConnectionRetry = () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      // 即時実行
      connectToField();
      // 5秒ごとにリトライ
      retryIntervalRef.current = setInterval(() => {
          if (!connRef.current || !connRef.current.open) {
              connectToField();
          }
      }, 5000);
  };

  const stopConnectionRetry = () => {
      if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
      }
  };


  // --- 現場用: "REQUEST_STREAM" イベントハンドリング ---
  useEffect(() => {
    if (currentRole !== UserRole.FIELD) return;

    const handleTriggerCall = () => {
        if (!peerRef.current || !localStream) {
            console.warn("Cannot call admin: Peer or Stream not ready");
            return;
        }
        const adminId = `${siteId}-admin`;
        console.log(`Calling Admin (${adminId}) with stream...`);
        const call = peerRef.current.call(adminId, localStream);
        
        call.on('close', () => console.log("Call closed"));
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
    } else {
        console.warn("Connection not open, message not sent");
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
      }
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
    />
  );
};

export default App;