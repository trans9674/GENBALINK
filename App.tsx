import React, { useState, useEffect, useRef } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';
import { Peer } from 'peerjs';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingAlert, setIncomingAlert] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStatus, setPeerStatus] = useState<string>('切断');

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  // PeerJS接続ロジック
  useEffect(() => {
    if (!siteId || currentRole === UserRole.NONE) return;

    // PeerIDの生成ルール: 
    // 現場: {siteId}
    // 管理者: {siteId}-admin
    const myPeerId = currentRole === UserRole.FIELD ? siteId : `${siteId}-admin`;
    const targetPeerId = currentRole === UserRole.FIELD ? `${siteId}-admin` : siteId;

    const peer = new Peer(myPeerId, {
      debug: 1,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      setPeerStatus('待機中...');
      
      // 管理者の場合、現場へ接続を試みる
      if (currentRole === UserRole.ADMIN) {
        connectToField(targetPeerId);
      }
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      connRef.current = conn;
      setPeerStatus('データ接続完了');
      setupDataConnection(conn);
    });

    peer.on('call', (call) => {
      console.log('Incoming call from:', call.peer);
      // 現場側: 着信があったら自分の映像（あれば）を返して応答
      call.answer(localStream || undefined);
      
      call.on('stream', (stream: MediaStream) => {
        // 双方向通話の場合は相手の映像も受け取るが、今回は現場→管理が主
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setPeerStatus(`エラー: ${err.type}`);
    });

    return () => {
      peer.destroy();
    };
  }, [siteId, currentRole]);

  // ローカルストリーム（現場カメラ）が準備できたら、既存のコールがあれば更新、または待機
  useEffect(() => {
    if (currentRole === UserRole.FIELD && localStream && peerRef.current) {
        // ここでは能動的にコールせず、管理者からのコールを待つ設計にする
        // もし必要ならここで peer.call(adminId, localStream) も可能
    }
  }, [localStream, currentRole]);

  const connectToField = (targetId: string) => {
    if (!peerRef.current) return;
    
    setPeerStatus('接続試行中...');

    // 1. データ接続（チャット用）
    const conn = peerRef.current.connect(targetId);
    conn.on('open', () => {
        console.log("Connected to Field via Data");
        connRef.current = conn;
        setPeerStatus('接続完了');
        setupDataConnection(conn);
    });

    // 2. メディア接続（映像受信リクエスト）
    // ダミーのストリームを送って相手のストリームを引き出すか、単にReceive onlyにする
    // PeerJSの仕様上、callするにはMediaStreamが必要な場合が多いが、受信専用なら相手にかけてもらうか、
    // あるいは空のストリームでかける等の工夫が必要。
    // 今回は「管理者が電話をかける」→「現場が応答する」フローにする。
    // 管理者側は映像を送らないので、createMediaStreamSource等でダミーを作るか、nullでcallして相手に制約させるか。
    // PeerJSはstreamなしのcallをサポートしていない場合があるため、
    // 簡略化のため「現場の映像準備ができたら、管理者がCallボタンを押す」UIにするか、
    // あるいは現場側からAdminへCallさせる方が安定する。
    
    // 方針変更: 現場端末は「admin」を見つけたら（あるいは接続が来たら）、自分のストリームでCallバックする
  };

  const setupDataConnection = (conn: any) => {
    conn.on('data', (data: any) => {
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
         // 管理者から映像要求が来た場合、現場は電話をかける
         if (currentRole === UserRole.FIELD && localStream && peerRef.current) {
             const call = peerRef.current.call(`${siteId}-admin`, localStream);
             console.log("Calling Admin with stream...");
         }
      }
    });
  };

  // 管理者から映像取得をリクエストする関数
  const requestStream = () => {
      if (connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'REQUEST_STREAM' });
      }
  };

  // 管理者側でCallを受け取る処理の追加（useEffect内だとclosure問題があるのでrefを使うか、再定義が必要）
  // 簡略化のため、Peer定義のEffect内で `peer.on('call')` を定義済み。
  // Admin側の `peer.on('call')` をここで補強する。
  useEffect(() => {
    if (currentRole === UserRole.ADMIN && peerRef.current) {
        peerRef.current.off('call'); // 重複防止
        peerRef.current.on('call', (call) => {
            console.log("Receiving video stream call...");
            call.answer(); // 映像なしで応答（受信専用）
            call.on('stream', (remoteStream) => {
                console.log("Stream received!");
                setRemoteStream(remoteStream);
            });
        });
    }
  }, [currentRole, peerRef.current]);


  const handleLogin = (role: UserRole, id: string) => {
    setSiteId(id);
    setCurrentRole(role);
    setMessages([{
      id: 'welcome',
      sender: 'AI',
      text: `接続ID: ${id}。${role === UserRole.FIELD ? 'カメラ起動中...' : '現場へ接続中...'}`,
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
    
    // 既読シミュレーション
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, isRead: true } : m));
    }, 2000);
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