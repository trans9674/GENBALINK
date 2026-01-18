import React, { useState, useEffect } from 'react';
import { UserRole, Site } from '../types';
import { supabase } from '../lib/supabaseClient';

interface LoginProps {
  onLogin: (role: UserRole, siteId: string, name: string, sites?: Site[]) => void;
}

const MOCK_2FA_CODE = "8888"; // Demo purposes
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour

// Extracted names from the provided images
const SEED_USERS = [
  // Image 1
  "折本 日菜子", "松岡 弘之", "桝田 健広", "花岡 恭平", "鈴木 良", "高橋 理沙",
  // Image 2
  "東 智也", "迫本 崇幸", "入江 智代子", "入江 正靖",
  // Image 3
  "山中 美紗", "山本 春香", "柏 朱美", "白石 紗季子", "面本 由美", "鳥飼 美咲希",
  // Image 4
  "光元 弥生", "周藤 かんな", "正壽 秀夫",
  // Image 5
  "永岡 典子", "佃 淳子", "西嶋 伸一", "坂本 友稀", "山本 寛也", "岡部 淳子", 
  "川本 誉", "木建 孝司", "河名 純一", "清水 隆志", "滝本 賢司"
];

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<UserRole>(UserRole.ADMIN);
  
  // Login Steps: 'input' (password) -> 'verify' (2FA)
  const [loginStep, setLoginStep] = useState<'input' | 'verify'>('input');
  const [verificationCode, setVerificationCode] = useState('');

  // Registration State
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Field Inputs
  const [fieldSiteId, setFieldSiteId] = useState('');
  const [fieldPassword, setFieldPassword] = useState('');
  
  // Admin Inputs
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  
  const [error, setError] = useState('');

  // Lockout State
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // System Admin Modal State
  const [showSystemAdmin, setShowSystemAdmin] = useState(false);
  const [sysAdminPass, setSysAdminPass] = useState('');
  const [isSysAdminAuthenticated, setIsSysAdminAuthenticated] = useState(false);
  const [sysAdminTab, setSysAdminTab] = useState<'users' | 'sites'>('users');
  
  // Data for System Admin
  const [allUsers, setAllUsers] = useState<{name: string, password: string}[]>([]);
  const [sitePasswords, setSitePasswords] = useState<Record<string, string>>({});

  // Load saved sites and check lockout on mount
  useEffect(() => {
    // 1. Load Sites
    const fetchSites = async () => {
        const { data } = await supabase.from('sites').select('*');
        if (data) {
            setSites(data.map((s: any) => ({ id: s.id, name: s.name })));
        }
    };
    fetchSites();

    // 2. Load Admin Name
    const savedName = localStorage.getItem('genbalink_admin_name');
    if (savedName) setAdminName(savedName);

    // 3. Check Lockout
    const storedLockout = localStorage.getItem('genbalink_auth_lockout');
    if (storedLockout) {
        const lockoutTime = parseInt(storedLockout, 10);
        if (lockoutTime > Date.now()) {
            setLockoutUntil(lockoutTime);
        } else {
            localStorage.removeItem('genbalink_auth_lockout');
            localStorage.removeItem('genbalink_auth_attempts');
        }
    }

    // 4. Seed Users (Merge Logic)
    const storedUsersStr = localStorage.getItem('genbalink_users');
    let currentUsers = storedUsersStr ? JSON.parse(storedUsersStr) : [];
    
    let changed = false;
    SEED_USERS.forEach(seedName => {
        if (!currentUsers.some((u: any) => u.name === seedName)) {
            // Default password for seeded users is 'password' or similar. 
            // The prompt says "Set username and password yourself", but for seeded users we need a default.
            currentUsers.push({ name: seedName, password: 'password' }); 
            changed = true;
        }
    });

    if (changed) {
        localStorage.setItem('genbalink_users', JSON.stringify(currentUsers));
    }
    setAllUsers(currentUsers);

    // 5. Load Site Passwords
    const storedSitePass = localStorage.getItem('genbalink_site_passwords');
    if (storedSitePass) {
        setSitePasswords(JSON.parse(storedSitePass));
    }
  }, []);

  const isLocked = lockoutUntil !== null && lockoutUntil > Date.now();

  const executeAdminLogin = () => {
     localStorage.setItem('genbalink_admin_name', adminName || '管理者');
     const initialSiteId = sites.length > 0 ? sites[0].id : '';
     onLogin(UserRole.ADMIN, initialSiteId, adminName || '管理者', sites);
  };

  const handleRegister = () => {
      if (!regName.trim() || !regPassword.trim()) {
          setError('ユーザー名とパスワードを入力してください');
          return;
      }
      
      const users = JSON.parse(localStorage.getItem('genbalink_users') || '[]');
      if (users.some((u: any) => u.name === regName.trim())) {
          setError('このユーザー名は既に使用されています');
          return;
      }

      const newUser = { name: regName.trim(), password: regPassword.trim() };
      const newUsers = [...users, newUser];
      localStorage.setItem('genbalink_users', JSON.stringify(newUsers));
      setAllUsers(newUsers);
      
      alert('登録が完了しました。ログインしてください。');
      setAdminName(regName.trim());
      setAdminPassword('');
      setIsRegisterMode(false);
      setRegName('');
      setRegPassword('');
      setError('');
  };

  const handleAdminLoginAttempt = () => {
    if (isLocked) return;

    if (!adminPassword.trim()) { 
       setError('パスワードを入力してください');
       return;
    }

    const users = JSON.parse(localStorage.getItem('genbalink_users') || '[]');
    
    // Validate against stored users
    if (users.length > 0) {
        const user = users.find((u: any) => u.name === adminName.trim());
        if (!user || user.password !== adminPassword.trim()) {
            setError('ユーザー名またはパスワードが間違っています');
            return;
        }
    } else {
        // Fallback demo mode if something went wrong with seeding
        if(adminPassword !== 'password') { // minimal check
             setError('パスワードが間違っています');
             return;
        }
    }
    
    const isTrusted = localStorage.getItem('genbalink_is_trusted_device');
    if (isTrusted === 'true') {
        executeAdminLogin();
    } else {
        setError('');
        setLoginStep('verify');
    }
  };

  const handleVerifyCode = () => {
      if (isLocked) return;

      if (verificationCode === MOCK_2FA_CODE) {
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
    
    // Check Site Password
    const storedPass = sitePasswords[fieldSiteId.trim()];
    if (storedPass && storedPass !== fieldPassword.trim()) {
        setError('接続パスワードが間違っています');
        return;
    }
    
    onLogin(UserRole.FIELD, fieldSiteId.trim(), "現場端末");
  };

  // --- System Admin Functions ---
  const handleSysAdminLogin = () => {
      if (sysAdminPass === 'admin') {
          setIsSysAdminAuthenticated(true);
      } else {
          alert('マスターパスワードが違います');
      }
  };

  const handleSitePasswordChange = (siteId: string, newPass: string) => {
      const newPasswords = { ...sitePasswords, [siteId]: newPass };
      setSitePasswords(newPasswords);
      localStorage.setItem('genbalink_site_passwords', JSON.stringify(newPasswords));
  };

  const handleDeleteUser = (targetName: string) => {
      if(!confirm(`${targetName} を削除しますか？`)) return;
      const newUsers = allUsers.filter(u => u.name !== targetName);
      setAllUsers(newUsers);
      localStorage.setItem('genbalink_users', JSON.stringify(newUsers));
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
          
          {/* Header / Tabs - Hide tabs during 2FA verify step or Lockout or Registration */}
          {loginStep === 'input' && !isLocked && !isRegisterMode && (
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

          {isRegisterMode && (
             <div className="bg-slate-800/50 p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-white">新規ユーザー登録</span>
                <button onClick={() => { setIsRegisterMode(false); setError(''); }} className="text-xs text-slate-400 hover:text-white">キャンセル</button>
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
              ) : isRegisterMode ? (
                  // Registration Form
                  <div className="space-y-6 animate-in slide-in-from-right duration-300">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ユーザー名設定</label>
                        <input 
                            type="text" 
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="ユーザー名"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">パスワード設定</label>
                        <input 
                            type="password" 
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="パスワード"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <button 
                        onClick={handleRegister}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-95"
                      >
                        登録する
                      </button>
                  </div>
              ) : loginStep === 'input' ? (
                // Step 1: Password Input
                <div className="space-y-6">
                    <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ユーザー名</label>
                    <input 
                        type="text" 
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="管理者"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    />
                    </div>
                    <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ユーザーパスワード</label>
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
                    ログイン
                    </button>
                    
                    <div className="border-t border-slate-800 pt-4 mt-2">
                        <button 
                            onClick={() => { setIsRegisterMode(true); setError(''); }}
                            className="w-full py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            新規ユーザー登録はこちら
                        </button>
                    </div>

                    <div className="text-xs text-center text-slate-500">
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
        
        {/* System Admin Button */}
        <div className="mt-6 flex justify-end">
            <button 
                onClick={() => setShowSystemAdmin(true)}
                className="text-[10px] text-slate-600 hover:text-slate-400 border border-slate-800 hover:border-slate-600 px-3 py-1 rounded bg-slate-900/50"
            >
                システム管理 (Admin Only)
            </button>
        </div>
        
        <div className="mt-4 text-center text-slate-600 text-xs">
          GenbaLink v2.1 &bull; Multi-Site Supported
        </div>
      </div>

      {/* --- SYSTEM ADMIN MODAL --- */}
      {showSystemAdmin && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          <span className="text-slate-500">🛠</span> システム管理
                      </h2>
                      <button onClick={() => { setShowSystemAdmin(false); setIsSysAdminAuthenticated(false); setSysAdminPass(''); }} className="text-slate-400 hover:text-white">✕</button>
                  </div>

                  {!isSysAdminAuthenticated ? (
                      <div className="flex-1 flex flex-col items-center justify-center">
                          <p className="text-slate-400 mb-4">マスターパスワードを入力してください (初期値: admin)</p>
                          <input 
                              type="password" 
                              value={sysAdminPass}
                              onChange={e => setSysAdminPass(e.target.value)}
                              className="bg-slate-950 border border-slate-700 rounded px-4 py-2 text-white mb-4 w-64 text-center"
                              placeholder="Master Password"
                          />
                          <button onClick={handleSysAdminLogin} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded font-bold">ロック解除</button>
                      </div>
                  ) : (
                      <div className="flex-1 flex flex-col overflow-hidden">
                          <div className="flex border-b border-slate-800 mb-4">
                              <button onClick={() => setSysAdminTab('users')} className={`px-4 py-2 font-bold ${sysAdminTab === 'users' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>ユーザーリスト</button>
                              <button onClick={() => setSysAdminTab('sites')} className={`px-4 py-2 font-bold ${sysAdminTab === 'sites' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500 hover:text-slate-300'}`}>現場パスワード</button>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto custom-scrollbar">
                              {sysAdminTab === 'users' ? (
                                  <table className="w-full text-left text-sm">
                                      <thead className="text-slate-500 border-b border-slate-800">
                                          <tr>
                                              <th className="p-2">ユーザー名</th>
                                              <th className="p-2">ユーザーパスワード</th>
                                              <th className="p-2 text-right">操作</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {allUsers.map((u, i) => (
                                              <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                                  <td className="p-2 text-white font-bold">{u.name}</td>
                                                  <td className="p-2 text-slate-300 font-mono">{u.password}</td>
                                                  <td className="p-2 text-right">
                                                      <button onClick={() => handleDeleteUser(u.name)} className="text-red-500 hover:text-red-400 text-xs border border-red-900/50 px-2 py-1 rounded">削除</button>
                                                  </td>
                                              </tr>
                                          ))}
                                          {allUsers.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-600">ユーザーがいません</td></tr>}
                                      </tbody>
                                  </table>
                              ) : (
                                  <div className="space-y-4">
                                      <p className="text-xs text-slate-500 mb-2">※ 現場IDごとに接続用パスワードを設定してください。</p>
                                      <table className="w-full text-left text-sm">
                                          <thead className="text-slate-500 border-b border-slate-800">
                                              <tr>
                                                  <th className="p-2">現場名</th>
                                                  <th className="p-2">現場ID</th>
                                                  <th className="p-2">接続パスワード</th>
                                              </tr>
                                          </thead>
                                          <tbody>
                                              {sites.map(site => (
                                                  <tr key={site.id} className="border-b border-slate-800/50">
                                                      <td className="p-2 text-white">{site.name}</td>
                                                      <td className="p-2 text-slate-400 font-mono text-xs">{site.id}</td>
                                                      <td className="p-2">
                                                          <input 
                                                              type="text" 
                                                              value={sitePasswords[site.id] || ''}
                                                              onChange={(e) => handleSitePasswordChange(site.id, e.target.value)}
                                                              placeholder="未設定"
                                                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-orange-300 w-32 focus:border-orange-500 outline-none font-mono"
                                                          />
                                                      </td>
                                                  </tr>
                                              ))}
                                              {sites.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-600">現場が登録されていません</td></tr>}
                                          </tbody>
                                      </table>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default Login;