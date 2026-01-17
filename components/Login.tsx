import React, { useState, useEffect } from 'react';
import { UserRole, Site } from '../types';

interface LoginProps {
  onLogin: (role: UserRole, siteId: string, name: string, sites?: Site[]) => void;
}

const MOCK_2FA_CODE = "8888"; // Demo purposes
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<UserRole>(UserRole.ADMIN);
  
  // Login Steps: 'input' (password) -> 'verify' (2FA)
  const [loginStep, setLoginStep] = useState<'input' | 'verify'>('input');
  const [verificationCode, setVerificationCode] = useState('');

  // Field Inputs
  const [fieldSiteId, setFieldSiteId] = useState('');
  const [fieldPassword, setFieldPassword] = useState('');
  const [fieldName, setFieldName] = useState('');
  
  // Admin Inputs
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  
  const [error, setError] = useState('');

  // Lockout State
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Load saved sites and check lockout on mount
  useEffect(() => {
    const saved = localStorage.getItem('genbalink_sites');
    if (saved) {
      try {
        setSites(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load sites", e);
      }
    }
    const savedName = localStorage.getItem('genbalink_admin_name');
    if (savedName) setAdminName(savedName);

    // Check Lockout
    const storedLockout = localStorage.getItem('genbalink_auth_lockout');
    if (storedLockout) {
        const lockoutTime = parseInt(storedLockout, 10);
        if (lockoutTime > Date.now()) {
            setLockoutUntil(lockoutTime);
        } else {
            // Expired
            localStorage.removeItem('genbalink_auth_lockout');
            localStorage.removeItem('genbalink_auth_attempts');
        }
    }
  }, []);

  const isLocked = lockoutUntil !== null && lockoutUntil > Date.now();

  const executeAdminLogin = () => {
     localStorage.setItem('genbalink_admin_name', adminName || '管理者');
     // Default to first site or empty
     const initialSiteId = sites.length > 0 ? sites[0].id : '';
     onLogin(UserRole.ADMIN, initialSiteId, adminName || '管理者', sites);
  };

  const handleAdminLoginAttempt = () => {
    if (isLocked) return;

    if (!adminPassword.trim()) { 
       setError('パスワードを入力してください');
       return;
    }

    // 1. Check Password (Mock check)
    // Assuming "password ok" if not empty for this demo structure.
    
    // 2. Check Trusted Device
    const isTrusted = localStorage.getItem('genbalink_is_trusted_device');
    
    if (isTrusted === 'true') {
        // Trusted device -> Login directly
        executeAdminLogin();
    } else {
        // Untrusted device -> Require 2FA
        setError('');
        setLoginStep('verify');
    }
  };

  const handleVerifyCode = () => {
      if (isLocked) return;

      if (verificationCode === MOCK_2FA_CODE) {
          // Success
          localStorage.setItem('genbalink_is_trusted_device', 'true');
          localStorage.removeItem('genbalink_auth_attempts');
          localStorage.removeItem('genbalink_auth_lockout');
          executeAdminLogin();
      } else {
          const currentAttempts = parseInt(localStorage.getItem('genbalink_auth_attempts') || '0', 10) + 1;
          localStorage.setItem('genbalink_auth_attempts', currentAttempts.toString());
          
          if (currentAttempts >= MAX_ATTEMPTS) {
              const lockTime = Date.now() + LOCKOUT_DURATION;
              localStorage.setItem('genbalink_auth_lockout', lockTime.toString());
              setLockoutUntil(lockTime);
          } else {
              setError('認証コードが間違っています');
          }
      }
  };

  const handleFieldLogin = () => {
    if (!fieldSiteId.trim() || !fieldPassword.trim()) {
       setError('現場IDとパスワードを入力してください');
       return;
    }
    onLogin(UserRole.FIELD, fieldSiteId.trim(), fieldName.trim());
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
        
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300">
          
          {/* Header / Tabs - Hide tabs during 2FA verify step or Lockout */}
          {loginStep === 'input' && !isLocked && (
            <div className="flex border-b border-slate-800">
                <button 
                onClick={() => { setActiveTab(UserRole.ADMIN); setError(''); }}
                className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === UserRole.ADMIN ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                管理者 (PC)
                </button>
                <button 
                onClick={() => { setActiveTab(UserRole.FIELD); setError(''); }}
                className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === UserRole.FIELD ? 'bg-slate-800 text-orange-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                現場端末 (iPad)
                </button>
            </div>
          )}

          <div className="p-8">
            {activeTab === UserRole.ADMIN ? (
              // --- ADMIN LOGIN FLOW ---
              isLocked ? (
                  <div className="flex flex-col items-center justify-center py-12 animate-in fade-in">
                      <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mb-6 border border-red-900/50">
                          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                      </div>
                      <h3 className="text-xl font-bold text-red-500">ロックされました。</h3>
                  </div>
              ) : loginStep === 'input' ? (
                // Step 1: Password Input
                <div className="space-y-6">
                    <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">管理者名</label>
                    <input 
                        type="text" 
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="管理者"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                    <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">共通パスワード</label>
                    <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>

                    <button 
                    onClick={handleAdminLoginAttempt}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                    >
                    管理者としてログイン
                    </button>
                    
                    <div className="text-xs text-center text-slate-500 mt-4">
                        ※ 現場の追加・編集はログイン後に行えます
                    </div>
                </div>
              ) : (
                // Step 2: 2FA Verification
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-white">新しいデバイスを検出</h3>
                        <p className="text-sm text-slate-400 mt-2">
                            セキュリティ保護のため、2段階認証が必要です。<br/>
                            管理者用認証コードを入力してください。
                        </p>
                    </div>

                    <div>
                        <input 
                            type="text" 
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            placeholder="認証コード (例: 8888)"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-4 text-center text-xl tracking-widest text-white focus:outline-none focus:border-blue-500"
                            maxLength={6}
                        />
                    </div>

                    <button 
                        onClick={handleVerifyCode}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                    >
                        認証してデバイスを登録
                    </button>

                    <button 
                        onClick={() => { setLoginStep('input'); setError(''); setVerificationCode(''); }}
                        className="w-full text-slate-500 text-sm hover:text-slate-300 py-2"
                    >
                        戻る
                    </button>
                </div>
              )
            ) : (
              // --- FIELD LOGIN FLOW ---
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">現場ID (Site ID)</label>
                  <input 
                    type="text" 
                    value={fieldSiteId}
                    onChange={(e) => setFieldSiteId(e.target.value)}
                    placeholder="例: GENBA-001"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">接続パスワード</label>
                  <input 
                    type="password" 
                    value={fieldPassword}
                    onChange={(e) => setFieldPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">お名前</label>
                  <input 
                    type="text" 
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    placeholder="例：山田"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>

                <button 
                  onClick={handleFieldLogin}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-orange-900/20 transition-all active:scale-95"
                >
                  現場端末として接続
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 text-red-400 text-sm bg-red-900/20 border border-red-900/50 p-3 rounded flex items-center gap-2 animate-bounce">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-8 text-center text-slate-600 text-xs">
          GenbaLink v2.1 &bull; Multi-Site Supported
        </div>
      </div>
    </div>
  );
};

export default Login;