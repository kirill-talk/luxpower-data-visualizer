import React, { useState } from 'react';
import { X, Lock, User, Key, Server, CheckCircle2, AlertCircle, LogOut, Globe } from 'lucide-react';
import { translations } from '../utils/i18n';
import { setCustomApiUrl, apiFetch } from '../utils/config';

/**
 * AuthModal
 * Provides login interface for entering Luxpowertek Cloud credentials.
 * Handles authentication, saving session to localStorage, and logging out.
 */
export default function AuthModal({
  isOpen,
  onClose,
  authStatus,
  onLoginSuccess,
  onLogout,
  onApiUrlSaved,
  lang = 'uk'
}) {
  const t = translations[lang] || translations.uk;
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('https://eu.luxpowertek.com');
  const [apiUrl, setApiUrl] = useState(() => {
    try {
      return localStorage.getItem('luxpower-custom-api-url') || '';
    } catch {
      return '';
    }
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiSavedMsg, setApiSavedMsg] = useState(null);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!account.trim() || !password.trim()) {
      setError(lang === 'en' ? 'Please fill in both account and password.' : 'Будь ласка, заповніть акаунт та пароль.');
      return;
    }

    setLoading(true);
    try {
      // Save custom API Proxy URL if specified
      setCustomApiUrl(apiUrl);

      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: account.trim(),
          password: password.trim(),
          server: server.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (lang === 'en' ? 'Login failed' : 'Помилка авторизації'));
      }

      onLoginSuccess({
        account: data.account,
        cookie: data.cookie,
        defaultSerial: data.defaultSerial,
        server: server.trim(),
        apiUrl: apiUrl.trim(),
        remember
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = authStatus?.connected;
  const isCustomSession = !!authStatus?.isCustomSession;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#121929] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Lock className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {t.authTitle}
              </h3>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                {isConnected ? t.authStatusConnected : t.authStatusLoginRequired}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {isConnected && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex flex-col text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {t.authConnectedAs}: <strong className="font-mono">{authStatus.account || 'Active Session'}</strong>
                  </span>
                  <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                    {isCustomSession ? t.authCustomSession : t.authEnvDefault}
                  </span>
                </div>
              </div>
              {isCustomSession && (
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-500/20 transition-all shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t.authSignOut}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Hide login form when user is already authenticated */}
          {!isConnected && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.authSub}
              </p>

              {/* Account / Email */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.authAccount}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder={t.authAccountPlaceholder}
                    className="w-full bg-slate-50 dark:bg-[#0c121e] border border-slate-200 dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.authPassword}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.authPasswordPlaceholder}
                    className="w-full bg-slate-50 dark:bg-[#0c121e] border border-slate-200 dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono"
                    required
                  />
                </div>
              </div>

              {/* Server selection */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.authServer}
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#0c121e] border border-slate-200 dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono cursor-pointer"
                  >
                    <option value="https://eu.luxpowertek.com">eu.luxpowertek.com (Europe / Default)</option>
                    <option value="https://server.luxpowertek.com">server.luxpowertek.com (Global)</option>
                    <option value="https://us.luxpowertek.com">us.luxpowertek.com (US)</option>
                  </select>
                </div>
              </div>

              {/* Toggle Advanced Proxy URL */}
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline self-start flex items-center gap-1"
                >
                  <span>{showAdvanced ? '▼' : '▶'}</span>
                  <span>{lang === 'en' ? 'API Proxy / Worker URL (Optional)' : 'URL проксі / Cloudflare Worker (Опціонально)'}</span>
                </button>

                {showAdvanced && (
                  <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-[#0c121e]/80 border border-slate-200 dark:border-white/[0.06] flex flex-col gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {lang === 'en'
                        ? 'Point to your self-hosted API / Cloudflare Worker URL (e.g. https://your-server.example/api). Leave empty for default.'
                        : 'Вкажіть URL вашого сервера або Cloudflare Worker (наприклад https://your-server.example/api). Залиште порожнім за замовчуванням.'}
                    </span>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={apiUrl}
                        onChange={(e) => {
                          setApiUrl(e.target.value);
                          setApiSavedMsg(null);
                        }}
                        placeholder="https://your-server.example/api"
                        className="w-full bg-white dark:bg-[#151c2e] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
                        {apiSavedMsg || ''}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {apiUrl.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setApiUrl('');
                              setCustomApiUrl('');
                              setApiSavedMsg(lang === 'en' ? 'Reset to default' : 'Скинуто');
                              if (onApiUrlSaved) onApiUrlSaved('');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.1] transition-colors"
                          >
                            {lang === 'en' ? 'Reset' : 'Скинути'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCustomApiUrl(apiUrl);
                            setApiSavedMsg(lang === 'en' ? 'API URL saved' : 'API URL збережено');
                            if (onApiUrlSaved) onApiUrlSaved(apiUrl.trim());
                            onClose();
                          }}
                          className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                        >
                          {lang === 'en' ? 'Save API URL' : 'Зберегти API URL'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Remember Me */}
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 border-slate-300 dark:border-slate-700 focus:ring-emerald-500 bg-slate-50 dark:bg-[#0c121e]"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {t.authRemember}
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
                >
                  {lang === 'en' ? 'Cancel' : 'Скасувати'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t.authSigningIn}</span>
                    </>
                  ) : (
                    <span>{t.authSignIn}</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {isConnected && (
            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 dark:bg-white/[0.1] dark:hover:bg-white/[0.15] transition-colors"
              >
                {lang === 'en' ? 'Close' : 'Закрити'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
