import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MONTHS_FULL,
  WEEKDAYS_SHORT,
  parseLocalDate,
  toDateStr,
  getTodayLocalDate,
  formatDateHuman,
} from '../utils/dateFormat';

/**
 * Custom Calendar DatePicker
 * - Formats selected date as "19 лис 2026" (uk) or "19 Nov 2026" (en)
 * - Always uses Monday as the first day of the week
 * - Keeps popover inside viewport bounds even on 375px screens
 */
export default function DatePicker({
  value,
  onChange,
  lang = 'uk',
  showIcon = true,
  className = '',
  buttonClassName = '',
}) {
  const isEn = lang === 'en';
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});

  const parsedValue = parseLocalDate(value) || new Date();
  const [viewYear, setViewYear] = useState(parsedValue.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedValue.getMonth());

  const containerRef = useRef(null);

  // Sync calendar month/year when external value changes
  useEffect(() => {
    const p = parseLocalDate(value);
    if (p) {
      setViewYear(p.getFullYear());
      setViewMonth(p.getMonth());
    }
  }, [value]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleToggleOpen = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popWidth = 272;
      const vw = window.innerWidth;
      const margin = 12;
      // Compute ideal left coordinate in viewport, clamped to [margin, vw - popWidth - margin]
      let targetLeft = rect.left;
      if (targetLeft + popWidth > vw - margin) {
        targetLeft = vw - popWidth - margin;
      }
      if (targetLeft < margin) {
        targetLeft = margin;
      }
      const relativeLeft = targetLeft - rect.left;
      setPopoverStyle({ left: `${relativeLeft}px` });
    }
    setOpen((prev) => !prev);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (dateStr) => {
    if (onChange) onChange(dateStr);
    setOpen(false);
  };

  const todayStr = getTodayLocalDate();
  const monthsFull = MONTHS_FULL[isEn ? 'en' : 'uk'];
  const weekdays = WEEKDAYS_SHORT[isEn ? 'en' : 'uk'];

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-first offset: Sun (0) -> 6, Mon (1) -> 0, Tue (2) -> 1, ..., Sat (6) -> 5
  const startOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toDateStr(new Date(viewYear, viewMonth, day)));
  }

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white focus:outline-none whitespace-nowrap cursor-pointer ${buttonClassName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {showIcon && <CalendarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span>{formatDateHuman(value, lang)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          style={popoverStyle}
          className="absolute top-full mt-2 z-50 w-[272px] rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl p-3 text-xs font-mono select-none"
        >
          {/* Month / Year Header */}
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-sans font-bold text-xs text-slate-800 dark:text-slate-100">
              {monthsFull[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers (Monday First) */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {weekdays.map((wd, idx) => (
              <span
                key={wd}
                className={`text-[10px] font-bold py-1 ${
                  idx >= 5 ? 'text-rose-500/80 dark:text-rose-400/80' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((dateStr, idx) => {
              if (!dateStr) {
                return <span key={`empty-${idx}`} className="h-8" />;
              }
              const dayNum = Number(dateStr.split('-')[2]);
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => handleSelectDate(dateStr)}
                  className={`h-8 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isToday
                      ? 'border border-emerald-500/60 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Jump to Today */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {formatDateHuman(todayStr, lang)}
            </span>
            <button
              type="button"
              onClick={() => handleSelectDate(todayStr)}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition-colors"
            >
              {isEn ? 'Today' : 'Сьогодні'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
