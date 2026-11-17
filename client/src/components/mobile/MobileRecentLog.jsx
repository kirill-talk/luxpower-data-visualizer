import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { translations } from '../../utils/i18n';

/**
 * MobileRecentLog
 * Compact preview card showing the most recent telemetry record
 * and quick link to the complete data table.
 */
export default function MobileRecentLog({ latestRow, totalRows = 0, onShowAll, lang = 'uk' }) {
  if (!latestRow) return null;

  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitV = isEn ? 'V' : 'В';
  const unitW = isEn ? 'W' : 'Вт';

  const statusText = latestRow.statusText || 'Normal';
  const isWarning = statusText.toLowerCase().includes('off') || statusText.toLowerCase().includes('fault');

  return (
    <div className="flex flex-col p-4 bg-white dark:bg-[#171b26] rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-sm gap-2.5 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
            {t.recentLogs}
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
          {t.latestRecord}
        </span>
      </div>

      <div className="flex flex-col p-2.5 bg-slate-50 dark:bg-[#1c1f2a] rounded-lg gap-2 border border-slate-100 dark:border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isWarning ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
            />
            <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              {statusText}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {latestRow.time || latestRow.serverTime || '--'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-1 text-center bg-white dark:bg-[#0a0e18]/60 rounded p-1.5 border border-slate-100 dark:border-white/[0.02]">
          <div className="flex flex-col items-center">
            <span className="font-mono text-[8px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-semibold">{t.nodeBattery}</span>
            <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400">
              {latestRow.soc}%
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">{t.nodeGrid}</span>
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {latestRow.vacr || '0'} {unitV}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-mono text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">{t.nodeHome}</span>
            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
              {latestRow.peps || latestRow.pLoad || '0'} {unitW}
            </span>
          </div>
        </div>
      </div>

      {onShowAll && (
        <button
          onClick={onShowAll}
          type="button"
          className="w-full py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#1c1f2a] hover:bg-slate-200 dark:hover:bg-[#262a35] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
        >
          <span>{t.showAllRecordsBtn} ({totalRows})</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
