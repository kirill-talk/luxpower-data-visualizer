import React from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import { translations } from '../../utils/i18n';
import DatePicker from '../DatePicker';

/**
 * MobileStatusBar
 * Compact quick status bar placed at top of mobile/tablet screens (< xl):
 * - Model & Serial Number
 * - Last update timestamp
 * - Custom Monday-first DatePicker & manual refresh button
 */
export default function MobileStatusBar({
  serialNumber = '—',
  lastUpdated,
  selectedDate,
  onDateChange,
  onRefresh,
  loading = false,
  isGridOnline = true,
  lang = 'uk',
}) {
  const t = translations[lang] || translations.uk;

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-white dark:bg-[#171b26] rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isGridOnline
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
            }`}
          />
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tracking-wider truncate">
            SNA 6K
          </span>
          <span className="text-slate-300 dark:text-slate-600 text-xs">•</span>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
            SN: {serialNumber}
          </span>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#262a35] text-slate-500 dark:text-slate-300 shrink-0">
            <Clock className="w-3 h-3 text-cyan-500" />
            <span className="font-mono text-[10px]">{lastUpdated}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
        {/* Date Selector */}
        <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1c1f2a] text-slate-700 dark:text-slate-200">
          <DatePicker
            value={selectedDate}
            onChange={onDateChange}
            lang={lang}
          />
        </div>

        {/* Manual Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t.refresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#262a35] active:bg-emerald-500/20 text-slate-700 dark:text-slate-200 hover:text-emerald-500 text-xs font-medium transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
          <span>{t.refresh}</span>
        </button>
      </div>
    </div>
  );
}
