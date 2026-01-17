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

export interface CameraConfig {
  id: string;
  name: string;
  type: 'mjpeg' | 'snapshot' | 'iframe';
  url: string;
  refreshInterval?: number; // For snapshot mode (ms)
}

export interface Site {
  id: string;   // GENBA-001
  name: string; // 山田邸
}