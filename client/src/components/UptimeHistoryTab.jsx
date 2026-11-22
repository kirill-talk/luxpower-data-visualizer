import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import {
  Battery,
  BatteryCharging,
  Zap,
  ZapOff,
  Clock,
  Activity,
  BarChart3,
  Filter,
  ArrowRight,
  Timer,
  Calendar,
} from 'lucide-react';
import { translations } from '../utils/i18n';
import { formatDurationHuman } from '../utils/energyMath';
import { formatDateHuman, formatShortDateHuman } from '../utils/dateFormat';

function formatTimeHHMM(timeStr) {
  if (!timeStr) return '--:--';
  const parts = String(timeStr).trim().split(' ');
  const tPart = parts.length > 1 ? parts[1] : parts[0];
  const hhmm = tPart.split(':');
  return hhmm.length >= 2 ? `${hhmm[0]}:${hhmm[1]}` : tPart;
}

const HOUR_TICKS = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];

/**
 * Interactive horizontal 24h timeline bar showing Grid (Emerald) vs Battery (Amber) segments.
 */
function DayTimelineBar({
  intervals = [],
  compact = false,
  isEn = false,
  onSelectInterval = null,
  selectedIntervalKey = null,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const unitW = isEn ? 'W' : 'Вт';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';

  const activeIdx = hoveredIdx !== null ? hoveredIdx : null;
  const activeSeg = activeIdx !== null ? intervals[activeIdx] : null;

  return (
    <div className="relative w-full select-none">
      <div
        className={`relative w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/[0.08] ${
          compact ? 'h-4 sm:h-5' : 'h-9 sm:h-11'
        }`}
      >
        {/* Subtle 3-hour vertical grid lines */}
        {!compact &&
          [12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((pct) => (
            <div
              key={pct}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-slate-300/40 dark:bg-white/[0.06] z-10"
              style={{ left: `${pct}%` }}
            />
          ))}

        {intervals.map((seg, idx) => {
          const segKey = `${seg.date}_${seg.startTime}_${idx}`;
          const isBat = seg.mode === 'battery';
          const isSelected = selectedIntervalKey && selectedIntervalKey === segKey;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={segKey}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectInterval && onSelectInterval(seg, segKey)}
              className={`absolute top-0 bottom-0 transition-opacity ${
                onSelectInterval ? 'cursor-pointer' : ''
              } ${
                isBat
                  ? 'bg-amber-500 dark:bg-amber-500/90 hover:bg-amber-400'
                  : 'bg-emerald-500/85 dark:bg-emerald-500/75 hover:bg-emerald-400'
              } ${isSelected || isHovered ? 'ring-2 ring-white dark:ring-slate-900 z-20 opacity-100' : 'opacity-90'}`}
              style={{
                left: `${seg.startPct}%`,
                width: `${Math.max(compact ? 0.45 : 0.35, seg.widthPct)}%`,
              }}
              title={`${isBat ? (isEn ? 'Battery' : 'Батарея') : (isEn ? 'Grid' : 'Мережа')}: ${formatTimeHHMM(
                seg.startTime
              )} - ${formatTimeHHMM(seg.endTime)} (${formatDurationHuman(seg.durationSec, isEn, false)})`}
            />
          );
        })}
      </div>

      {/* Hour axis labels for full-size 1d bar */}
      {!compact && (
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1.5 px-0.5">
          {HOUR_TICKS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}

      {/* Hover details strip below full bar */}
      {!compact && activeSeg && (
        <div className="mt-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0c121e]/90 border border-slate-200/80 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                activeSeg.mode === 'battery' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {activeSeg.mode === 'battery'
                ? isEn
                  ? 'Battery (EPS)'
                  : 'Від батареї (EPS)'
                : isEn
                  ? 'Grid'
                  : 'Від мережі'}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {formatTimeHHMM(activeSeg.startTime)} — {formatTimeHHMM(activeSeg.endTime)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-slate-700 dark:text-slate-200 font-semibold">
              {formatDurationHuman(activeSeg.durationSec, isEn, false)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              SOC: {activeSeg.startSoc}% → {activeSeg.endSoc}%
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {isEn ? 'Avg' : 'Сер.'}: {activeSeg.avgLoadW} {unitW}
            </span>
            <span
              className={
                activeSeg.mode === 'battery'
                  ? 'text-rose-500 font-semibold'
                  : 'text-emerald-600 dark:text-emerald-400 font-semibold'
              }
            >
              {activeSeg.mode === 'battery'
                ? `-${activeSeg.batteryDischargeKwh} ${unitKwh}`
                : `+${activeSeg.batteryChargeKwh} / ${activeSeg.gridImportKwh} ${unitKwh}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * UptimeHistoryTab
 * Displays single-day (1d) and multi-day (7d, month, custom) Battery vs Grid uptime history,
 * interactive 24h timeline bars, ECharts runtime & SOC/load overlays, and switching session log.
 */
export default function UptimeHistoryTab({
  periodMode = '1d',
  selectedDate,
  singleDayUptime,
  singleDayRows = [],
  periodStats,
  isGridOnline,
  currentUptimeSec = 0,
  estimatedRemainingSec = null,
  timeToFullChargeSec = null,
  battCharge = 0,
  onSelectDate,
  lang = 'uk',
}) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';
  const unitHours = isEn ? 'h' : 'год';

  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'battery' | 'grid'
  const [hideShort, setHideShort] = useState(false);
  const [selectedIntervalKey, setSelectedIntervalKey] = useState(null);

  const singleChartRef = useRef(null);
  const singleChartInstanceRef = useRef(null);
  const multiChartRef = useRef(null);
  const multiChartInstanceRef = useRef(null);

  const [multiSeries, setMultiSeries] = useState({
    battery: true,
    grid: true,
  });

  const isSingleDay = periodMode === '1d';

  // Build unified summary stats for 1d vs multi-day
  const summary = useMemo(() => {
    if (isSingleDay) {
      const s = singleDayUptime || {};
      return {
        daysCount: 1,
        totalBatterySec: s.totalBatterySec || 0,
        totalGridSec: s.totalGridSec || 0,
        totalTrackedSec: s.totalTrackedSec || 0,
        batterySharePct: s.batterySharePct || 0,
        gridSharePct: s.gridSharePct || 0,
        outagesCount: s.outagesCount || 0,
        significantOutagesCount: s.significantOutagesCount || 0,
        longestBatterySec: s.longestBatterySec || 0,
        longestGridSec: s.longestGridSec || 0,
        totalBatteryDischargeKwh: s.totalBatteryDischargeKwh || 0,
        totalGridImportKwh: s.totalGridImportKwh || 0,
        intervals: s.intervals || [],
        dailyList: [],
      };
    }

    const dailyList = periodStats?.dailyList || [];
    const daysCount = periodStats?.daysCount || dailyList.length || 0;
    const totalBatterySec = periodStats?.totalBatterySec || 0;
    const totalGridSec = periodStats?.totalGridSec || 0;
    const totalTrackedSec = totalBatterySec + totalGridSec;
    const batterySharePct = totalTrackedSec > 0 ? Math.round((totalBatterySec / totalTrackedSec) * 100) : 0;
    const gridSharePct = totalTrackedSec > 0 ? 100 - batterySharePct : 0;

    return {
      daysCount,
      totalBatterySec,
      totalGridSec,
      totalTrackedSec,
      batterySharePct,
      gridSharePct,
      outagesCount: periodStats?.totalOutagesCount || 0,
      significantOutagesCount: periodStats?.totalSignificantOutagesCount || 0,
      longestBatterySec: periodStats?.longestBatterySec || 0,
      longestGridSec: periodStats?.longestGridSec || 0,
      totalBatteryDischargeKwh: periodStats?.totalBatteryDischargeKwh || 0,
      totalGridImportKwh: periodStats?.totalGridImportKwh || 0,
      intervals: periodStats?.allIntervals || [],
      dailyList,
    };
  }, [isSingleDay, singleDayUptime, periodStats]);

  const avgDailyBatterySec = summary.daysCount > 0 ? Math.round(summary.totalBatterySec / summary.daysCount) : 0;
  const avgDailyGridSec = summary.daysCount > 0 ? Math.round(summary.totalGridSec / summary.daysCount) : 0;

  // Filter and sort intervals newest-first for the sessions log
  const filteredIntervals = useMemo(() => {
    const list = summary.intervals || [];
    const filtered = list.filter((item) => {
      if (sourceFilter !== 'all' && item.mode !== sourceFilter) return false;
      if (hideShort && item.durationSec < 300) return false;
      return true;
    });
    return [...filtered].reverse();
  }, [summary.intervals, sourceFilter, hideShort]);

  const maxIntervalSec = useMemo(() => {
    return filteredIntervals.reduce((max, item) => Math.max(max, item.durationSec || 0), 0) || 1;
  }, [filteredIntervals]);

  // Single-Day ECharts: Load + SOC with Battery Outage markAreas
  useEffect(() => {
    if (!isSingleDay || !singleChartRef.current) {
      if (singleChartInstanceRef.current) {
        singleChartInstanceRef.current.dispose();
        singleChartInstanceRef.current = null;
      }
      return;
    }

    if (singleChartInstanceRef.current && singleChartInstanceRef.current.getDom() !== singleChartRef.current) {
      singleChartInstanceRef.current.dispose();
      singleChartInstanceRef.current = null;
    }

    if (!singleChartInstanceRef.current) {
      singleChartInstanceRef.current = echarts.init(singleChartRef.current);
    }
    const chart = singleChartInstanceRef.current;

    if (!singleDayRows || singleDayRows.length === 0) {
      chart.clear();
      return;
    }

    const sorted = [...singleDayRows].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const times = sorted.map((r) => formatTimeHHMM(r.time));
    const timeIndexMap = new Map();
    sorted.forEach((r, idx) => {
      if (r.time && !timeIndexMap.has(r.time)) {
        timeIndexMap.set(r.time, idx);
      }
    });

    const loads = sorted.map((r) => {
      if (r.consumption !== undefined) return Math.max(0, Math.round(Number(r.consumption) || 0));
      if (r.consumptionPower !== undefined && Number(r.consumptionPower) > 0) return Math.round(Number(r.consumptionPower));
      const eps = Number(r.peps) || 0;
      const direct = Number(r.pLoad) || 0;
      return Math.max(0, Math.round(eps > 0 ? eps : direct));
    });
    const socs = sorted.map((r) => {
      const val = typeof r.soc === 'string' ? r.soc.replace('%', '') : r.soc;
      return Number(val) || 0;
    });

    // Build markArea coordinates for battery intervals using exact row indices
    const batteryAreas = (summary.intervals || [])
      .filter((seg) => seg.mode === 'battery')
      .map((seg) => {
        const startIdx = timeIndexMap.get(seg.startTime);
        const endIdx = timeIndexMap.get(seg.endTime);
        if (startIdx === undefined) return null;
        return [
          {
            name: isEn ? 'Battery' : 'АКБ',
            xAxis: startIdx,
          },
          {
            xAxis: endIdx !== undefined ? Math.max(startIdx, endIdx) : startIdx,
          },
        ];
      })
      .filter(Boolean);

    const isDarkMode = document.documentElement.classList.contains('dark');

    const option = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: { color: isDarkMode ? '#475569' : '#94a3b8', type: 'dashed' },
        },
        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: isDarkMode ? '#334155' : '#e2e8f0',
        textStyle: {
          color: isDarkMode ? '#f8fafc' : '#0f172a',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const row = sorted[idx];
          const isGridRow =
            row?.vacr !== undefined
              ? (parseFloat(row.vacr) || 0) > 50
              : Math.abs(parseFloat(row?.gridPower) || 0) > 0;
          const badgeColor = isGridRow ? '#10b981' : '#f59e0b';
          const badgeLabel = isGridRow ? (isEn ? 'Grid' : 'Мережа') : isEn ? 'Battery (EPS)' : 'Батарея (EPS)';

          let tip = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:600;margin-bottom:4px;border-bottom:1px solid ${
            isDarkMode ? '#334155' : '#e2e8f0'
          };padding-bottom:3px;">
            <span>${params[0].axisValue}</span>
            <span style="color:${badgeColor};font-size:11px;">● ${badgeLabel}</span>
          </div>`;

          params.forEach((p) => {
            const unit = p.seriesName === t.seriesSoc ? '%' : ` ${unitW}`;
            tip += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${p.color};"></span>
                <span>${p.seriesName}</span>
              </span>
              <span style="font-weight:700;">${p.value}${unit}</span>
            </div>`;
          });
          return tip;
        },
      },
      grid: { left: '2%', right: '2%', bottom: '12%', top: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: isDarkMode ? '#334155' : '#cbd5e1' } },
        axisLabel: { color: isDarkMode ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: unitW,
          nameTextStyle: { color: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
          axisLine: { show: false },
          axisLabel: { color: isDarkMode ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
          splitLine: { lineStyle: { color: isDarkMode ? '#1e293b' : '#f1f5f9' } },
        },
        {
          type: 'value',
          name: 'SOC %',
          min: 0,
          max: 100,
          position: 'right',
          nameTextStyle: { color: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
          axisLine: { show: false },
          axisLabel: {
            color: isDarkMode ? '#94a3b8' : '#64748b',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            formatter: '{value}%',
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0], start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
        {
          type: 'slider',
          xAxisIndex: [0],
          start: 0,
          end: 100,
          height: 18,
          bottom: '1%',
          borderColor: 'transparent',
          backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
          fillerColor: 'rgba(245, 158, 11, 0.22)',
          handleStyle: { color: '#f59e0b' },
          textStyle: { color: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 9 },
        },
      ],
      series: [
        {
          name: t.seriesConsumption,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#06b6d4' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(6, 182, 212, 0.2)' },
              { offset: 1, color: 'rgba(6, 182, 212, 0.0)' },
            ]),
          },
          markArea: {
            silent: true,
            itemStyle: {
              color: isDarkMode ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.18)',
            },
            label: { show: false },
            data: batteryAreas,
          },
          data: loads,
        },
        {
          name: t.seriesSoc,
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2.2, color: '#a855f7' },
          data: socs,
        },
      ],
    };

    chart.setOption(option, true);
    const handleResize = () => chart && chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSingleDay, singleDayRows, summary.intervals, isEn, t, unitW]);

  // Multi-Day ECharts Stacked Bar Chart: Daily Battery vs Grid hours
  useEffect(() => {
    if (isSingleDay || !multiChartRef.current) {
      if (multiChartInstanceRef.current) {
        multiChartInstanceRef.current.dispose();
        multiChartInstanceRef.current = null;
      }
      return;
    }

    if (multiChartInstanceRef.current && multiChartInstanceRef.current.getDom() !== multiChartRef.current) {
      multiChartInstanceRef.current.dispose();
      multiChartInstanceRef.current = null;
    }

    if (!multiChartInstanceRef.current) {
      multiChartInstanceRef.current = echarts.init(multiChartRef.current);
    }
    const chart = multiChartInstanceRef.current;

    const list = summary.dailyList || [];
    if (!list.length) {
      chart.clear();
      return;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');
    const dates = list.map((d) => formatShortDateHuman(d.date, lang));
    const batteryHours = list.map((d) => Number(((d.uptimeStats?.totalBatterySec || 0) / 3600).toFixed(2)));
    const gridHours = list.map((d) => Number(((d.uptimeStats?.totalGridSec || 0) / 3600).toFixed(2)));

    const option = {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 350,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: isDarkMode ? '#334155' : '#e2e8f0',
        textStyle: {
          color: isDarkMode ? '#f8fafc' : '#0f172a',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const dayItem = list[idx];
          const u = dayItem?.uptimeStats || {};
          const headerDate = dayItem?.date ? formatDateHuman(dayItem.date, lang) : params[0].axisValue;
          let tip = `<div style="font-weight:600;margin-bottom:6px;border-bottom:1px solid ${
            isDarkMode ? '#334155' : '#e2e8f0'
          };padding-bottom:3px;">${headerDate}</div>`;

          params.forEach((p) => {
            const sec = p.seriesName === t.batteryUptime ? u.totalBatterySec || 0 : u.totalGridSec || 0;
            const share = p.seriesName === t.batteryUptime ? u.batterySharePct || 0 : u.gridSharePct || 0;
            tip += `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:3px;">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background-color:${p.color};"></span>
                <span>${p.seriesName}</span>
              </span>
              <span style="font-weight:700;">${formatDurationHuman(sec, isEn, false)} (${share}%)</span>
            </div>`;
          });

          tip += `<div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${
            isDarkMode ? '#334155' : '#e2e8f0'
          };display:flex;justify-content:space-between;font-size:11px;color:${isDarkMode ? '#94a3b8' : '#64748b'};">
            <span>${t.outagesCountLabel}:</span>
            <span style="font-weight:700;color:${isDarkMode ? '#f8fafc' : '#0f172a'};">${u.outagesCount || 0}</span>
          </div>`;

          return tip;
        },
      },
      legend: {
        show: false,
        selected: {
          [t.batteryUptime]: multiSeries.battery,
          [t.gridUptime]: multiSeries.grid,
        },
      },
      grid: { left: '2%', right: '2%', bottom: '8%', top: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: isDarkMode ? '#334155' : '#cbd5e1' } },
        axisLabel: { color: isDarkMode ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: unitHours,
        max: 24,
        nameTextStyle: { color: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' } },
        axisLabel: { color: isDarkMode ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      },
      series: [
        {
          name: t.batteryUptime,
          type: 'bar',
          stack: 'uptime',
          data: batteryHours,
          itemStyle: { color: '#f59e0b', borderRadius: [0, 0, 0, 0] },
        },
        {
          name: t.gridUptime,
          type: 'bar',
          stack: 'uptime',
          data: gridHours,
          itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };

    chart.setOption(option, true);
    const handleResize = () => chart && chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSingleDay, summary.dailyList, isEn, lang, t, unitHours, multiSeries]);

  useEffect(() => {
    return () => {
      if (singleChartInstanceRef.current) {
        singleChartInstanceRef.current.dispose();
        singleChartInstanceRef.current = null;
      }
      if (multiChartInstanceRef.current) {
        multiChartInstanceRef.current.dispose();
        multiChartInstanceRef.current = null;
      }
    };
  }, []);

  const toggleMultiSeries = (key, seriesName) => {
    setMultiSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (multiChartInstanceRef.current) {
        multiChartInstanceRef.current.dispatchAction({
          type: 'legendToggleSelect',
          name: seriesName,
        });
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 1. Top 4 KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        {/* KPI 1: Time on Battery */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-amber-500/25 dark:border-amber-500/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalBatteryTime}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Battery className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span className="font-mono text-xl sm:text-3xl font-extrabold text-amber-500 dark:text-amber-400 tracking-tight font-tabular">
              {formatDurationHuman(summary.totalBatterySec, isEn, false)}
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-amber-600/80 dark:text-amber-400/80">
              ({summary.batterySharePct}%)
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{isSingleDay ? t.totalBatteryDischarge : t.avgDailyBatteryTime}:</span>
            <strong className="text-slate-900 dark:text-white font-semibold whitespace-nowrap">
              {isSingleDay
                ? `${summary.totalBatteryDischargeKwh} ${unitKwh}`
                : formatDurationHuman(avgDailyBatterySec, isEn, false)}
            </strong>
          </div>
        </div>

        {/* KPI 2: Time on Grid */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-emerald-500/25 dark:border-emerald-500/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalGridTime}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span className="font-mono text-xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight font-tabular">
              {formatDurationHuman(summary.totalGridSec, isEn, false)}
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-semibold text-emerald-600/80 dark:text-emerald-400/80">
              ({summary.gridSharePct}%)
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{isSingleDay ? t.gridImportKwh : t.avgDailyGridTime}:</span>
            <strong className="text-slate-900 dark:text-white font-semibold whitespace-nowrap">
              {isSingleDay
                ? `${summary.totalGridImportKwh} ${unitKwh}`
                : formatDurationHuman(avgDailyGridSec, isEn, false)}
            </strong>
          </div>
        </div>

        {/* KPI 3: Outages & Longest Autonomous Session */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.outagesCountLabel}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
              <ZapOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3 font-mono">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-tabular">
              {summary.outagesCount}
            </span>
            {summary.significantOutagesCount !== summary.outagesCount && (
              <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                ({summary.significantOutagesCount} ≥5{isEn ? 'm' : 'хв'})
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{t.longestOutageLabel}:</span>
            <strong className="text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
              {formatDurationHuman(summary.longestBatterySec, isEn, false)}
            </strong>
          </div>
        </div>

        {/* KPI 4: Current Live Mode */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.currentStreakLabel}
            </span>
            <div
              className={`w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl border flex items-center justify-center shrink-0 ${
                isGridOnline
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
              }`}
            >
              <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span
              className={`font-mono text-xl sm:text-3xl font-extrabold tracking-tight font-tabular ${
                isGridOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
              }`}
            >
              {formatDurationHuman(currentUptimeSec, isEn, true)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full ${isGridOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {isGridOnline ? t.gridUptime : t.batteryUptime}
              </span>
            </span>
            {!isGridOnline && estimatedRemainingSec !== null ? (
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                {t.estRemainingPrefix} ~{formatDurationHuman(estimatedRemainingSec, isEn, false)}
              </strong>
            ) : battCharge > 0 && timeToFullChargeSec !== null ? (
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                {t.estTimeToFull}{formatDurationHuman(timeToFullChargeSec, isEn, false)}
              </strong>
            ) : (
              <span className="text-slate-400">{isGridOnline ? t.gridPowered : t.epsPowered}</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Proportional Split Progress Bar */}
      <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t.batteryUptime}:{' '}
              <strong className="font-bold text-amber-600 dark:text-amber-400">
                {summary.batterySharePct}%
              </strong>{' '}
              ({formatDurationHuman(summary.totalBatterySec, isEn, false)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {t.gridUptime}:{' '}
              <strong className="font-bold text-emerald-600 dark:text-emerald-400">
                {summary.gridSharePct}%
              </strong>{' '}
              ({formatDurationHuman(summary.totalGridSec, isEn, false)})
            </span>
          </div>
        </div>
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
            style={{ width: `${summary.batterySharePct}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${summary.gridSharePct}%` }}
          />
        </div>
      </div>

      {/* 3. Timeline & Charts Section */}
      {isSingleDay ? (
        <div className="flex flex-col gap-5">
          {/* Interactive 24h Horizontal Timeline */}
          <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.timeline24hTitle}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  {t.batteryUptime}
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  {t.gridUptime}
                </span>
              </div>
            </div>

            <DayTimelineBar
              intervals={summary.intervals}
              isEn={isEn}
              selectedIntervalKey={selectedIntervalKey}
              onSelectInterval={(_, key) => setSelectedIntervalKey((prev) => (prev === key ? null : key))}
            />
          </div>

          {/* ECharts Load & SOC overlaid with Battery Outage intervals */}
          <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-500">
                  <Activity className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.seriesConsumption} & SOC ({formatDateHuman(selectedDate, lang)})
                </h3>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-sm bg-amber-500/70" />
                {t.batteryUptime}
              </span>
            </div>
            <div className="relative w-full bg-slate-50/60 dark:bg-[#070b13] rounded-xl p-3 border border-slate-200/70 dark:border-white/[0.05]">
              <div ref={singleChartRef} className="w-full h-72 sm:h-80" />
              {!singleDayRows || singleDayRows.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm rounded-xl text-slate-400 text-xs font-mono">
                  {t.chartLoading}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Multi-Day Stacked Bar Chart */}
          <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.dailyUptimeChartTitle}
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {summary.daysCount} {t.periodDaysCount}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { key: 'battery', name: t.batteryUptime, dotColor: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' },
                { key: 'grid', name: t.gridUptime, dotColor: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' },
              ].map((pill) => {
                const active = multiSeries[pill.key];
                return (
                  <button
                    key={pill.key}
                    onClick={() => toggleMultiSeries(pill.key, pill.name)}
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-slate-100 dark:bg-white/[0.08] border-slate-300 dark:border-white/20 text-slate-800 dark:text-slate-100 shadow-sm'
                        : 'bg-transparent border-slate-200 dark:border-white/[0.05] text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${pill.dotColor}`} />
                    <span>{pill.name}</span>
                  </button>
                );
              })}
            </div>

            <div ref={multiChartRef} className="w-full h-72 sm:h-80" />
          </div>

          {/* Multi-Day Compact 24h Timelines per Day */}
          <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-500">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {t.dailyTimelinesTitle}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">00:00 — 24:00</span>
            </div>

            <div className="flex flex-col gap-2">
              {[...(summary.dailyList || [])].reverse().map((day) => {
                const u = day.uptimeStats || {};
                return (
                  <div
                    key={day.date}
                    onClick={() => onSelectDate && onSelectDate(day.date)}
                    className={`grid grid-cols-1 sm:grid-cols-[120px_1fr_170px] items-center gap-2 sm:gap-3 p-2.5 rounded-xl bg-slate-50/70 dark:bg-[#0c121e]/60 border border-slate-200/60 dark:border-white/[0.05] ${
                      onSelectDate ? 'cursor-pointer hover:border-emerald-500/40 transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {formatDateHuman(day.date, lang)}
                      </span>
                      <span className="sm:hidden text-[11px] font-mono text-amber-500 font-semibold">
                        {formatDurationHuman(u.totalBatterySec || 0, isEn, false)} /{' '}
                        <span className="text-emerald-500">{formatDurationHuman(u.totalGridSec || 0, isEn, false)}</span>
                      </span>
                    </div>
                    <DayTimelineBar intervals={u.intervals || []} compact isEn={isEn} />
                    <div className="hidden sm:flex items-center justify-end gap-2 text-[11px] font-mono">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {formatDurationHuman(u.totalBatterySec || 0, isEn, false)}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">/</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatDurationHuman(u.totalGridSec || 0, isEn, false)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Power Source Switching & Sessions Log */}
      <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-500">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {t.sessionsLogTitle} ({filteredIntervals.length})
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Source filter pills */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] text-xs font-mono">
              {[
                { key: 'all', label: t.filterAll },
                { key: 'battery', label: t.filterBatteryOnly },
                { key: 'grid', label: t.filterGridOnly },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSourceFilter(opt.key)}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    sourceFilter === opt.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Hide < 5m micro-switches toggle */}
            <button
              onClick={() => setHideShort((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                hideShort
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'bg-slate-100/80 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>{t.hideShortSwitches}</span>
            </button>
          </div>
        </div>

        {filteredIntervals.length === 0 ? (
          <div className="py-10 text-center text-xs font-mono text-slate-400 dark:text-slate-500">
            {t.noIntervalsFound}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="py-2.5 px-3">{t.colSource}</th>
                    <th className="py-2.5 px-3">{t.colInterval}</th>
                    <th className="py-2.5 px-3">{t.colDuration}</th>
                    <th className="py-2.5 px-3">{t.colSocChange}</th>
                    <th className="py-2.5 px-3">{t.colAvgMaxLoad}</th>
                    <th className="py-2.5 px-3 text-right">{t.colEnergy}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs font-mono">
                  {filteredIntervals.map((item, idx) => {
                    const isBat = item.mode === 'battery';
                    const barPct = Math.max(4, Math.round((item.durationSec / maxIntervalSec) * 100));
                    const deltaPrefix = item.socDelta > 0 ? '+' : '';
                    return (
                      <tr
                        key={`${item.date}_${item.startTime}_${idx}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isBat
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isBat ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {isBat ? t.batteryUptime : t.gridUptime}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {!isSingleDay && (
                            <span className="text-slate-400 dark:text-slate-500 mr-2">
                              {formatShortDateHuman(item.date, lang)}
                            </span>
                          )}
                          <span className="font-semibold">{formatTimeHHMM(item.startTime)}</span>
                          <span className="text-slate-400 mx-1.5">—</span>
                          <span className="font-semibold">{formatTimeHHMM(item.endTime)}</span>
                        </td>
                        <td className="py-2.5 px-3 min-w-[160px]">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-slate-800 dark:text-slate-100 w-16 shrink-0">
                              {formatDurationHuman(item.durationSec, isEn, false)}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isBat ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-slate-600 dark:text-slate-300">{item.startSoc}%</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-600 dark:text-slate-300">{item.endSoc}%</span>
                            <span
                              className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.socDelta > 0
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : item.socDelta < 0
                                    ? 'bg-rose-500/10 text-rose-500'
                                    : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400'
                              }`}
                            >
                              {deltaPrefix}
                              {item.socDelta}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{item.avgLoadW}</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span>{item.maxLoadW}</span> {unitW}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right font-bold">
                          {isBat ? (
                            <span className="text-rose-500">
                              -{item.batteryDischargeKwh} {unitKwh}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{item.batteryChargeKwh} / {item.gridImportKwh} {unitKwh}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-2.5">
              {filteredIntervals.map((item, idx) => {
                const isBat = item.mode === 'battery';
                const deltaPrefix = item.socDelta > 0 ? '+' : '';
                return (
                  <div
                    key={`${item.date}_${item.startTime}_m_${idx}`}
                    className={`rounded-xl p-3 border bg-slate-50/70 dark:bg-[#0c121e]/70 flex flex-col gap-2 ${
                      isBat
                        ? 'border-amber-500/25'
                        : 'border-slate-200/80 dark:border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${
                          isBat
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isBat ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {isBat ? t.batteryUptime : t.gridUptime}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                        {formatDurationHuman(item.durationSec, isEn, false)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-300">
                      <span>
                        {!isSingleDay ? `${formatShortDateHuman(item.date, lang)} • ` : ''}
                        <strong>
                          {formatTimeHHMM(item.startTime)} — {formatTimeHHMM(item.endTime)}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span>{item.startSoc}%→{item.endSoc}%</span>
                        <span
                          className={`px-1 rounded text-[10px] font-bold ${
                            item.socDelta > 0
                              ? 'text-emerald-500'
                              : item.socDelta < 0
                                ? 'text-rose-500'
                                : 'text-slate-400'
                          }`}
                        >
                          ({deltaPrefix}
                          {item.socDelta}%)
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono pt-1.5 border-t border-slate-200/60 dark:border-white/[0.06]">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isEn ? 'Load' : 'Нав.'}: {item.avgLoadW}/{item.maxLoadW} {unitW}
                      </span>
                      <span className={`font-bold ${isBat ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isBat
                          ? `-${item.batteryDischargeKwh} ${unitKwh}`
                          : `+${item.batteryChargeKwh} / ${item.gridImportKwh} ${unitKwh}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
