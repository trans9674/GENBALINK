import React from 'react';
import { UserRole } from '../types';

interface LoginProps {
  onSelectRole: (role: UserRole) => void;
}

const Login: React.FC<LoginProps> = ({ onSelectRole }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-black text-white mb-2 tracking-tighter">GENBA<span className="text-orange-500">LINK</span></h1>
        <p className="text-slate-500 text-lg">セキュア遠隔現場管理システム</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <button 
          onClick={() => onSelectRole(UserRole.ADMIN)}
          className="group relative bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-blue-500 p-8 rounded-2xl transition-all duration-300 flex flex-col items-center text-center"
        >
          <div className="w-20 h-20 bg-slate-800 rounded-full mb-6 flex items-center justify-center group-hover:bg-blue-900/30 transition-colors">
            <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">管理者コンソール</h2>
          <p className="text-slate-400 text-sm">PC / デスクトップ</p>
          <p className="text-slate-500 text-xs mt-4">現場の監視、レポート作成、作業員管理へのフルアクセス。</p>
        </button>

        <button 
          onClick={() => onSelectRole(UserRole.FIELD)}
          className="group relative bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-orange-500 p-8 rounded-2xl transition-all duration-300 flex flex-col items-center text-center"
        >
          <div className="w-20 h-20 bg-slate-800 rounded-full mb-6 flex items-center justify-center group-hover:bg-orange-900/30 transition-colors">
            <svg className="w-10 h-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">現場端末</h2>
          <p className="text-slate-400 text-sm">タブレット / モバイル</p>
          <p className="text-slate-500 text-xs mt-4">エコモード搭載、大きなボタン配置、AI音声アシスタント機能。</p>
        </button>
      </div>
      
      <div className="mt-16 text-slate-600 text-xs">
        v1.0.0 &bull; Powered by Google Gemini Live API
      </div>
    </div>
  );
};

export default Login;