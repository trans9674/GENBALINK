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