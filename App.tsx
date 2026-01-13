import React, { useState, useEffect } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // In a real app, this would be a socket event.
  // For this demo, we simulate the "alert" state passing from Admin to Field component if they were connected.
  // Since we switch views, we can't easily show Admin pressing button AND Field waking up simultaneously 
  // without a backend or split screen. 
  // However, we will maintain the state variable to show how it's wired.
  const [incomingAlert, setIncomingAlert] = useState(false);

  // Load initial welcome message
  useEffect(() => {
    setMessages([{
      id: 'welcome',
      sender: 'AI',
      text: 'システム初期化完了。GenbaLink稼働中。',
      timestamp: new Date(),
      isRead: true
    }]);
  }, []);

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: currentRole === UserRole.ADMIN ? 'Admin' : 'Field',
      text,
      timestamp: new Date(),
      isRead: false
    };
    setMessages(prev => [...prev, newMessage]);

    // Simulate Read Receipt after 2 seconds
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, isRead: true } : m));
    }, 2000);
  };

  const handleTranscription = (text: string, type: 'user' | 'model') => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender: type === 'user' ? 'User' : 'AI', // 'User' here effectively means 'Field Worker Voice'
      text,
      timestamp: new Date(),
      isRead: true
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleAdminAlert = () => {
    // In a real app, send socket event to field unit
    alert("現場端末へアラート信号を送信しました（シミュレーション）");
    setIncomingAlert(true);
    // Reset alert state after a few seconds so it can be triggered again
    setTimeout(() => setIncomingAlert(false), 5000);
  };

  if (currentRole === UserRole.NONE) {
    return <Login onSelectRole={setCurrentRole} />;
  }

  if (currentRole === UserRole.ADMIN) {
    return (
      <AdminDashboard 
        messages={messages} 
        onSendMessage={handleSendMessage} 
        onTriggerAlert={handleAdminAlert}
      />
    );
  }

  return (
    <FieldDashboard 
      messages={messages} 
      onSendMessage={handleSendMessage} 
      onTranscription={handleTranscription}
      incomingAlert={incomingAlert}
      onClearAlert={() => setIncomingAlert(false)}
    />
  );
};

export default App;