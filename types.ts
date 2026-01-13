export enum UserRole {
  NONE = 'NONE',
  ADMIN = 'ADMIN',
  FIELD = 'FIELD'
}

export interface ChatMessage {
  id: string;
  sender: 'User' | 'AI' | 'Admin' | 'Field';
  text: string;
  timestamp: Date;
  isRead?: boolean;
}

export interface LiveState {
  isConnected: boolean;
  isSpeaking: boolean;
  volume: number;
}

export interface SiteSession {
  id: string;
  status: string; // 'connected', 'disconnected', 'connecting'
  stream: MediaStream | null;
  lastPing: number;
  hasAlert: boolean;
}