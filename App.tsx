import React, { useState, useEffect } from 'react';
import { UserRole, ChatMessage } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import FieldDashboard from './components/FieldDashboard';

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.NONE);
  const [siteId, setSiteId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingAlert, setIncomingAlert] = useState(false);

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
      sender: type === 'user' ? 'User' : 'AI', 
      text,
      timestamp: new Date(),
      isRead: true
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleAdminAlert = () => {
    // In a real app, send socket event to field unit
    alert(`現場端末 (${siteId}) へアラート信号を送信しました`);
    setIncomingAlert(true);
    // Reset alert state after a few seconds so it can be triggered again
    setTimeout(() => setIncomingAlert(false), 5000);
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