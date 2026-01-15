import React, { useState, useEffect } from 'react';
import { UserRole, Site } from '../types';

interface LoginProps {
  onLogin: (role: UserRole, siteId: string, name: string, sites?: Site[]) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<UserRole>(UserRole.ADMIN);
  
  // Field Inputs
  const [fieldSiteId, setFieldSiteId] = useState('');
  const [fieldPassword, setFieldPassword] = useState('');
  const [fieldName, setFieldName] = useState('');
  
  // Admin Inputs
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [newSiteId, setNewSiteId] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [showAddSite, setShowAddSite] = useState(false);

  const [error, setError] = useState('');

  // Load saved sites on mount
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
  }, []);

  const handleAddSite = () => {
    if (!newSiteId.trim() || !newSiteName.trim()) {
      setError('現場IDと現場名を入力してください');
      return;
    }
    if (sites.some(s => s.id === newSiteId.trim())) {
      setError('この現場IDは既に登録されています');
      return;
    }
    const newSite: Site = { id: newSiteId.trim(), name: newSiteName.trim() };
    const updatedSites = [...sites, newSite];
    setSites(updatedSites);
    localStorage.setItem('genbalink_sites', JSON.stringify(updatedSites));
    
    setNewSiteId('');
    setNewSiteName('');
    setShowAddSite(false);
    setError('');
  };

  const handleAdminLogin = (siteId: string) => {
    if (!adminPassword.trim()) { // Simplified password check
       setError('パスワードを入力してください');
       return;
    }
    localStorage.setItem('genbalink_admin_name', adminName || '管理者');
    onLogin(UserRole.ADMIN, siteId, adminName || '管理者', sites);
  };

  const handleFieldLogin = () => {
    if (!fieldSiteId.trim() || !fieldPassword.trim()) {
       setError('現場IDとパスワードを入力してください');
       return;
    }
    onLogin(UserRole.FIELD, fieldSiteId.trim(), fieldName.trim());
  };

  const handleDeleteSite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = sites.filter(s => s.id !== id);
    setSites(updated);
    localStorage.setItem('genbalink_sites', JSON.stringify(updated));
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
        
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
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

          <div className="p-8">
            {activeTab === UserRole.ADMIN ? (
              // ADMIN VIEW
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

                <div className="border-t border-slate-800 pt-4">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">登録済みの現場</label>
                        <button 
                            onClick={() => setShowAddSite(!showAddSite)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
                        >
                            {showAddSite ? 'キャンセル' : '+ 現場を追加'}
                        </button>
                    </div>

                    {showAddSite && (
                        <div className="mb-4 p-4 bg-slate-800 rounded-lg border border-slate-700 animate-in slide-in-from-top-2">
                             <div className="space-y-3">
                                <input 
                                    type="text" 
                                    value={newSiteName}
                                    onChange={(e) => setNewSiteName(e.target.value)}
                                    placeholder="現場名 (例: 山田邸)"
                                    className="w-full bg-slate-950 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                />
                                <input 
                                    type="text" 
                                    value={newSiteId}
                                    onChange={(e) => setNewSiteId(e.target.value)}
                                    placeholder="現場ID (例: GENBA-001)"
                                    className="w-full bg-slate-950 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                />
                                <button 
                                    onClick={handleAddSite}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm font-bold"
                                >
                                    保存
                                </button>
                             </div>
                        </div>
                    )}

                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {sites.length === 0 && !showAddSite && (
                            <div className="text-center text-slate-600 text-sm py-4">登録された現場はありません</div>
                        )}
                        {sites.map(site => (
                            <div 
                                key={site.id}
                                onClick={() => handleAdminLogin(site.id)}
                                className="group flex justify-between items-center p-3 bg-slate-950 border border-slate-700 hover:border-blue-500 rounded-lg cursor-pointer transition-all hover:bg-slate-800"
                            >
                                <div>
                                    <div className="font-bold text-white group-hover:text-blue-400">{site.name}</div>
                                    <div className="text-xs text-slate-500">{site.id}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-blue-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">接続 &rarr;</span>
                                    <button 
                                        onClick={(e) => handleDeleteSite(e, site.id)}
                                        className="text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="削除"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
              </div>
            ) : (
              // FIELD VIEW
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
              <div className="mt-4 text-red-400 text-sm bg-red-900/20 border border-red-900/50 p-3 rounded flex items-center gap-2">
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