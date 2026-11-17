import React, { useState } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, Eye, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { translations } from '../utils/i18n';

export default function DataTable({ rows, lang = 'uk' }) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitV = isEn ? 'V' : 'В';
  const unitHz = isEn ? 'Hz' : 'Гц';

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [expandedIndex, setExpandedIndex] = useState(null);
  const pageSize = 20;

  if (!rows || !rows.length) {
    return <div className="text-center py-10 text-slate-500 text-sm font-mono">{t.noRows}</div>;
  }

  const columns = Object.keys(rows[0]);

  const filteredRows = rows.filter(r => {
    if (!search) return true;
    return Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
  });

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportCsv = () => {
    const header = columns.join(',');
    const body = filteredRows
      .map(row => columns.map(col => `"${(row[col] ?? '').toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inverter_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter & View Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 dark:bg-[#0c121e]/80 rounded-xl p-3 border border-slate-100 dark:border-white/[0.05]">
        {/* Search Bar with count badge */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white dark:bg-[#161d2f] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-9 pr-24 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.05] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.08]">
            {filteredRows.length} {t.recordsSuffix}
          </span>
        </div>

        {/* Segmented View Switcher & CSV Download */}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-white/[0.06] p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-all ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-[#1e273d] text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t.viewCards}</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-[#1e273d] text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>{t.viewTable}</span>
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-mono font-semibold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Cards View (Adaptive) */}
      {viewMode === 'cards' && (
        <div className="flex flex-col gap-3">
          {pageRows.map((r, idx) => {
            const isExpanded = expandedIndex === idx;
            return (
              <div
                key={idx}
                className="bg-slate-50/70 dark:bg-[#0c121e]/80 rounded-xl p-4 border border-slate-200/70 dark:border-white/[0.06] flex flex-col gap-3 hover:border-slate-300 dark:hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 font-tabular">
                      {r.time || t.time}
                    </span>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/[0.06] text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    {r.statusText || t.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-[#111827] rounded-lg p-3 border border-slate-100 dark:border-white/[0.05] flex flex-col">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t.solarPv}
                    </span>
                    <span className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 mt-1 font-tabular">
                      {r.ppv || 0} {unitW}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-[#111827] rounded-lg p-3 border border-slate-100 dark:border-white/[0.05] flex flex-col">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t.batterySocV}
                    </span>
                    <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-tabular">
                      {r.soc || '0%'} ({r.vBat}{unitV})
                    </span>
                  </div>
                  <div className="bg-white dark:bg-[#111827] rounded-lg p-3 border border-slate-100 dark:border-white/[0.05] flex flex-col">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t.grid220}
                    </span>
                    <span className="font-mono text-base font-bold text-slate-700 dark:text-slate-200 mt-1 font-tabular">
                      {r.vacr > 0 ? `${r.vacr}${unitV} (${r.fac}${unitHz})` : (r.vepsr > 0 ? `${r.vepsr}${unitV} EPS` : `0${unitV}`)}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-[#111827] rounded-lg p-3 border border-slate-100 dark:border-white/[0.05] flex flex-col">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t.loadHome}
                    </span>
                    <span className="font-mono text-base font-bold text-cyan-600 dark:text-cyan-400 mt-1 font-tabular">
                      {r.peps || r.pLoad || 0} {unitW}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  className="inline-flex items-center justify-center gap-1.5 pt-1 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-mono transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isExpanded ? t.hideParams : t.showAllParams}</span>
                </button>

                {isExpanded && (
                  <div className="mt-2 pt-3 border-t border-slate-200/70 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px] font-mono max-h-72 overflow-y-auto">
                    {columns.map(c => (
                      <div key={c} className="bg-white/80 dark:bg-[#111827] p-2 rounded border border-slate-200/50 dark:border-white/[0.04] truncate">
                        <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase tracking-wider truncate">{c}:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold">{r[c] !== null && r[c] !== undefined ? String(r[c]) : '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto max-h-[550px] rounded-xl border border-slate-200/80 dark:border-white/[0.08]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 dark:bg-[#0c121e] sticky top-0 border-b border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300">
              <tr>
                {columns.map(c => (
                  <th key={c} className="p-2.5 font-mono text-[10px] uppercase font-bold tracking-wider whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/[0.05] bg-white dark:bg-[#111827]/60 text-slate-700 dark:text-slate-300">
              {pageRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition">
                  {columns.map(c => (
                    <td key={c} className="p-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400 font-tabular text-[11px]">
                      {r[c] !== null && r[c] !== undefined ? String(r[c]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06]">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {t.pageOf} <b>{currentPage}</b> {t.ofPages} <b>{totalPages}</b>
        </span>
        <div className="inline-flex items-center gap-1">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.1] disabled:opacity-40 transition-all"
            title={t.prev}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.1] disabled:opacity-40 transition-all"
            title={t.next}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
