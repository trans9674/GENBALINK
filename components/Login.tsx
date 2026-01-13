import React, { useState } from 'react';
import { UserRole } from '../types';

interface LoginProps {
  onLogin: (role: UserRole, siteId: string, name: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [siteId, setSiteId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (role: UserRole) => {
    const cleanId = siteId.trim();
    const cleanName = name.trim();
    
    if (!cleanId || !password.trim()) {
      setError('現場IDとパスワードを入力してください');
      return;
    }
    
    // For Admin, name is required or recommended? 
    // Requirement says "Admin -> Display login name". 
    // Let's allow empty and default to 'Admin' in App if not provided, 
    // but better to encourage input.
    // However, for Field, the name is forced to '現地' later, so input is optional/ignored.
    
    onLogin(role, cleanId, cleanName);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600 rounded-full blur-[128px]"></div>
      </div>

      <div className="z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">GENBA<span className="text-orange-500">LINK</span></h1>
          <p className="text-slate-400">セキュア現場接続ゲートウェイ</p>
        </div>
        
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">現場ID (Site ID)</label>
              <input 
                type="text" 
                value={siteId}
                onChange={(e) => { setSiteId(e.target.value); setError(''); }}
                placeholder="例: GENBA-001"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">接続パスワード</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">お名前 (Display Name)</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="例: 松岡 (現場側は自動で「現地」になります)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/50 p-3 rounded flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800">
              <p className="text-center text-slate-500 text-xs mb-4">接続モードを選択してください</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleLogin(UserRole.ADMIN)}
                  className="group flex flex-col items-center justify-center p-4 rounded-xl border border-slate-700 hover:border-blue-500 bg-slate-800 hover:bg-slate-800/80 transition-all"
                >
                   <svg className="w-6 h-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-bold text-slate-200">管理者 (PC)</span>
                </button>

                <button 
                  onClick={() => handleLogin(UserRole.FIELD)}
                  className="group flex flex-col items-center justify-center p-4 rounded-xl border border-slate-700 hover:border-orange-500 bg-slate-800 hover:bg-slate-800/80 transition-all"
                >
                   <svg className="w-6 h-6 text-orange-400 mb-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-bold text-slate-200">現場端末</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center text-slate-600 text-xs">
          GenbaLink v2.1 &bull; Auto-Retry Enabled
        </div>
      </div>
    </div>
  );
};

export default Login;