export enum UserRole {
  NONE = 'NONE',
  ADMIN = 'ADMIN',
  FIELD = 'FIELD'
}

export interface Attachment {
  type: 'image' | 'pdf';
  url: string; // Base64 Data URI
  name: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isRead?: boolean;
  attachment?: Attachment;
}

export interface LiveState {
  isConnected: boolean;
  isSpeaking: boolean;
  volume: number;
}

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connected';