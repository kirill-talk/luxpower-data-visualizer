import React, { useState, useRef, useEffect } from 'react';
import { Battery, X, Info } from 'lucide-react';
import { formatDateHuman } from '../utils/dateFormat';

/**
 * Interactive popover showing per-module battery health, cycles, SOH, and discharged energy.
 * Replaces verbose native HTML `title` tooltips on desktop and mobile.
 */
export default function BatteryModulesPopup({
  batteryHealth,
  lang = 'uk',
  children,
  align = 'center',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const isEn = lang === 'en';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';

  const {
    isSplitModules = false,
    model: batteryModel = 'LiFePO4',
    bat1Cycles = 0,
    bat2Cycles = 0,
    bat3Cycles = 0,
    avgCycles = 0,
    bat1Soh = '100.0',
    bat2Soh = '100.0',
    bat3Soh = '100.0',
    avgSoh = '100.0',
    bat1Kwh = 0,
    bat2Kwh = 0,
    bat3Kwh = 0,
    totalDisChgKwh = 0,
    totalChgKwh = 0,
  } = batteryHealth || {};

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const modules = [
    {
      id: 'B1',
      date: formatDateHuman('2025-11-16', lang),
      cycles: bat1Cycles,
      soh: bat1Soh,
      kwh: bat1Kwh,
      accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      bar: 'bg-emerald-500',
    },
    {
      id: 'B2',
      date: formatDateHuman('2026-02-14', lang),
      cycles: bat2Cycles,
      soh: bat2Soh,
      kwh: bat2Kwh,
      accent: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25',
      bar: 'bg-sky-500',
    },
    {
      id: 'B3',
      date: formatDateHuman('2026-11-24', lang),
      cycles: bat3Cycles,
      soh: bat3Soh,
      kwh: bat3Kwh,
      accent: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25',
      bar: 'bg-violet-500',
    },
  ];

  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="inline-flex items-center gap-1 whitespace-nowrap cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors focus:outline-none"
        aria-expanded={isOpen}
      >
        {children}
        <Info className="w-2.5 h-2.5 text-slate-400 opacity-75 shrink-0" />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-full ${alignClass} mb-2.5 z-50 w-[290px] sm:w-[320px] rounded-xl bg-white/98 dark:bg-[#111827]/98 backdrop-blur-md border border-slate-200 dark:border-white/[0.12] shadow-[0_12px_36px_rgba(15,23,42,0.22)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.55)] p-3 text-left`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-white/[0.07]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Battery className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {batteryModel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              aria-label={isEn ? 'Close' : 'Закрити'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Summary badges */}
          <div className="grid grid-cols-3 gap-1.5 mb-2.5 text-[10px] font-mono">
            <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] px-2 py-1 border border-slate-100 dark:border-white/[0.05]">
              <div className="text-[9px] text-slate-400 uppercase">
                {isEn ? 'Avg SOH' : 'Сер. SOH'}
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-100">{avgSoh}%</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] px-2 py-1 border border-slate-100 dark:border-white/[0.05]">
              <div className="text-[9px] text-slate-400 uppercase">
                {isEn ? 'Avg Cyc' : 'Сер. цик.'}
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-100">{avgCycles}</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-white/[0.04] px-2 py-1 border border-slate-100 dark:border-white/[0.05]">
              <div className="text-[9px] text-slate-400 uppercase">
                {isEn ? 'Dischg' : 'Розряд'}
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-100">
                {totalDisChgKwh} <span className="text-[8px] font-normal text-slate-400">{unitKwh}</span>
              </div>
            </div>
          </div>

          {/* Per-module breakdown */}
          {isSplitModules ? (
            <div className="space-y-1.5">
              {modules.map((mod) => {
                const sohWidth = Math.max(0, Math.min(100, parseFloat(mod.soh) || 0));
                return (
                  <div
                    key={mod.id}
                    className="rounded-lg bg-slate-50/80 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${mod.accent}`}>
                          {mod.id}
                        </span>
                        <span className="text-[9px] text-slate-400 truncate">{mod.date}</span>
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-200 shrink-0">
                        {mod.soh}%
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden my-1">
                      <div
                        className={`h-full rounded-full ${mod.bar}`}
                        style={{ width: `${sohWidth}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 dark:text-slate-400">
                      <span>
                        <strong className="text-slate-700 dark:text-slate-200">{mod.cycles}</strong>{' '}
                        {isEn ? 'cycles' : 'циклів'}
                      </span>
                      <span>
                        <strong className="text-slate-700 dark:text-slate-200">{mod.kwh}</strong> {unitKwh}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-1 pt-1">
              <div className="flex justify-between">
                <span>{isEn ? 'Lifetime charge:' : 'Загальний заряд:'}</span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {totalChgKwh} {unitKwh}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>{isEn ? 'Lifetime discharge:' : 'Загальний розряд:'}</span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {totalDisChgKwh} {unitKwh}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
