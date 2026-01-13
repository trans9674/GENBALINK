import React, { useState, useEffect, useRef } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingAlert, setIncomingAlert] = useState(false);
  
  // 通信チャンネルの参照
  const channelRef = useRef<BroadcastChannel | null>(null);

  // ログインしてSiteIDが決まったらチャンネルを開設
  useEffect(() => {
    if (!siteId) return;

    // 同じSiteIDを入力したタブ同士で通信するチャンネルを作成
    // ※注意: これは同一ブラウザ内でのみ有効です。物理的に離れた端末間通信には別途サーバーが必要です。
    const channel = new BroadcastChannel(`genbalink_v2_${siteId}`);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      const { type, payload } = event.data;
      
      if (type === 'CHAT') {
        // メッセージ受信（重複チェック含む）
        setMessages(prev => {
          // 日付文字列をDateオブジェクトに復元
          const incomingMsg = {
            ...payload,
            timestamp: new Date(payload.timestamp)
          };
          if (prev.some(m => m.id === incomingMsg.id)) return prev;
          return [...prev, incomingMsg];
        });
      } else if (type === 'ALERT') {
        // アラート受信
        console.log("Alert received via channel");
        setIncomingAlert(true);
        // 5秒後にアラート状態を解除
        setTimeout(() => setIncomingAlert(false), 5000);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [siteId]);

  const handleLogin = (role: UserRole, id: string) => {
    setSiteId(id);
    setCurrentRole(role);
    
    // Welcome message with Site ID
    setMessages([{
      id: 'welcome',
      sender: 'AI',
      text: `接続完了: ${id}。システム正常稼働中。`,
      timestamp: new Date(),
      isRead: true
    }]);
  };

  const broadcastMessage = (message: ChatMessage) => {
    channelRef.current?.postMessage({ type: 'CHAT', payload: message });
  };

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString().slice(2, 5),
      sender: currentRole === UserRole.ADMIN ? 'Admin' : 'Field',
      text,
      timestamp: new Date(),
      isRead: false
    };
    
    // 自分の画面に反映
    setMessages(prev => [...prev, newMessage]);
    // 相手（別タブ）に送信
    broadcastMessage(newMessage);

    // 擬似的な既読処理
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
    // 文字起こしも管理者に送信して共有
    broadcastMessage(newMessage);
  };

  const handleAdminAlert = () => {
    // 自身のUIへフィードバック
    alert(`現場端末 (${siteId}) へアラート信号を送信しました`);
    // 通信相手へアラート信号を送信
    channelRef.current?.postMessage({ type: 'ALERT' });
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
    />
  );
};

export default App;