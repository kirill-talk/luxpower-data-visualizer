import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import {
  Calendar,
  Zap,
  Home,
  BatteryCharging,
  Cpu,
  TrendingUp,
  Percent,
  Layers,
  BarChart3,
  Coins
} from 'lucide-react';
import { translations } from '../utils/i18n';
import { formatDateHuman, formatShortDateHuman } from '../utils/dateFormat';

/**
 * PeriodOverview
 * Renders aggregate KPI cards, autonomy share indicators, and daily breakdown bar chart
 * for multi-day periods (3 days, 7 days, 14 days, month, custom).
 */
export default function PeriodOverview({ periodStats, lang = 'uk' }) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';

  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const pills = useMemo(() => [
    { key: 'load', name: t.totalConsumption, dotColor: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' },
    { key: 'import', name: t.gridImportKwh, dotColor: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]' },
    { key: 'dischg', name: t.totalBatteryDischarge, dotColor: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' },
    { key: 'chg', name: t.totalBatteryCharge, dotColor: 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' },
    { key: 'loss', name: t.totalInverterLoss, dotColor: 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]' },
  ], [t]);

  const [selectedSeries, setSelectedSeries] = useState({
    load: true,
    import: true,
    dischg: true,
    chg: true,
    loss: true,
  });

  const toggleSeries = (key, seriesName) => {
    setSelectedSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispatchAction({
          type: 'legendToggleSelect',
          name: seriesName,
        });
      }
      return next;
    });
  };

  const {
    totalConsumptionKwh = 0,
    totalGridImportKwh = 0,
    totalBatteryDischargeKwh = 0,
    totalBatteryChargeKwh = 0,
    totalInverterLossKwh = 0,
    totalCostNightUah = 0,
    totalCostDayUah = 0,
    totalCostUah = 0,
    totalInverterCostUah = 0,
    daysCount = 0,
    dailyList = [],
  } = periodStats || {};

  const avgDailyLoad = daysCount > 0 ? (totalConsumptionKwh / daysCount).toFixed(1) : '0.0';
  const avgDailyGrid = daysCount > 0 ? (totalGridImportKwh / daysCount).toFixed(1) : '0.0';
  const avgDailyDischarge = daysCount > 0 ? (totalBatteryDischargeKwh / daysCount).toFixed(1) : '0.0';
  const avgDailyLoss = daysCount > 0 ? (totalInverterLossKwh / daysCount).toFixed(1) : '0.0';

  // Autonomy ratio: portion of consumption covered by battery
  const batterySharePct = totalConsumptionKwh > 0
    ? Math.min(100, Math.round((totalBatteryDischargeKwh / totalConsumptionKwh) * 100))
    : 0;
  const gridSharePct = 100 - batterySharePct;

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }
    const chart = chartInstanceRef.current;

    if (!dailyList || !dailyList.length) {
      chart.clear();
      return;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');

    // Dates formatted for X axis (e.g. "19 лис" or "19 Nov")
    const dates = dailyList.map((d) => formatShortDateHuman(d.date, lang));

    const gridData = dailyList.map(d => d.gridImportKwh);
    const batDischargeData = dailyList.map(d => d.batteryDischargeKwh);
    const batChargeData = dailyList.map(d => d.batteryChargeKwh);
    const loadData = dailyList.map(d => d.consumptionKwh);
    const lossData = dailyList.map(d => d.inverterLossKwh);

    const option = {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 400,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
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
          const rawItem = dailyList[idx];
          const headerDate = rawItem?.date ? formatDateHuman(rawItem.date, lang) : params[0].axisValue;
          let tip = `<div style="font-weight:600;margin-bottom:6px;border-bottom:1px solid ${
            isDarkMode ? '#334155' : '#e2e8f0'
          };padding-bottom:3px;">${headerDate}</div>`;
          params.forEach((p) => {
            tip += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:3px;">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background-color:${p.color};"></span>
                <span>${p.seriesName}</span>
              </span>
              <span style="font-weight:700;font-family:monospace;">${p.value} ${unitKwh}</span>
            </div>`;
          });
          return tip;
        },
      },
      legend: {
        show: false,
        selected: {
          [t.totalConsumption]: selectedSeries.load,
          [t.gridImportKwh]: selectedSeries.import,
          [t.totalBatteryDischarge]: selectedSeries.dischg,
          [t.totalBatteryCharge]: selectedSeries.chg,
          [t.totalInverterLoss]: selectedSeries.loss,
        },
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '8%',
        top: '6%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: isDarkMode ? '#334155' : '#cbd5e1' } },
        axisLabel: {
          color: isDarkMode ? '#94a3b8' : '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        name: unitKwh,
        nameTextStyle: {
          color: isDarkMode ? '#64748b' : '#94a3b8',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
        },
        axisLine: { show: false },
        splitLine: {
          lineStyle: {
            color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          },
        },
        axisLabel: {
          color: isDarkMode ? '#94a3b8' : '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
      },
      series: [
        {
          name: t.totalConsumption,
          type: 'bar',
          data: loadData,
          itemStyle: {
            color: '#f59e0b',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: t.gridImportKwh,
          type: 'bar',
          data: gridData,
          itemStyle: {
            color: '#f43f5e',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: t.totalBatteryDischarge,
          type: 'bar',
          data: batDischargeData,
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: t.totalBatteryCharge,
          type: 'bar',
          data: batChargeData,
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: t.totalInverterLoss,
          type: 'bar',
          data: lossData,
          itemStyle: {
            color: '#a855f7',
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dailyList, isEn, lang, t, unitKwh, selectedSeries]);

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 5 Summary KPI Modules for Period (including Inverter Loss / Consumption) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* KPI 1: Total Consumption & Average/Day */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalConsumption}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-amber-500 dark:text-amber-400 tracking-tight font-tabular">
              {totalConsumptionKwh}
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-medium text-slate-500 dark:text-slate-400">{unitKwh}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{t.avgDailyLoad}:</span>
            <strong className="text-slate-900 dark:text-white font-semibold whitespace-nowrap">{avgDailyLoad} {unitKwh}</strong>
          </div>
        </div>

        {/* KPI 2: Total Grid Import & Average/Day */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalGridImport}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-tabular">
              {totalGridImportKwh}
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-medium text-slate-500 dark:text-slate-400">{unitKwh}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{t.avgDailyGrid}:</span>
            <strong className="text-slate-900 dark:text-white font-semibold whitespace-nowrap">{avgDailyGrid} {unitKwh}</strong>
          </div>
        </div>

        {/* KPI 3: Battery Discharged / Charged */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalBatteryDischarge}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <BatteryCharging className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3 font-mono">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-500 tracking-tight font-tabular">
              {totalBatteryDischargeKwh}
            </span>
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">{unitKwh}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{isEn ? 'Charged' : 'Заряджено'}:</span>
            <strong className="text-blue-500 dark:text-blue-400 font-semibold whitespace-nowrap">+{totalBatteryChargeKwh} {unitKwh}</strong>
          </div>
        </div>

        {/* KPI 4: Inverter Consumption */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.totalInverterLoss}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shrink-0">
              <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3 font-mono">
            <span className="text-2xl sm:text-3xl font-extrabold text-purple-500 dark:text-purple-400 tracking-tight font-tabular">
              {totalInverterLossKwh}
            </span>
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">{unitKwh}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{isEn ? 'Cost' : 'Вартість'}:</span>
            <strong className="text-purple-600 dark:text-purple-300 font-semibold whitespace-nowrap">≈{totalInverterCostUah} ₴</strong>
          </div>
        </div>

        {/* KPI 5: Autonomy Ratio */}
        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-[#111827]/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
              {t.selfSufficiency}
            </span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-500 shrink-0">
              <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 my-2 sm:my-3">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-teal-500 dark:text-teal-400 tracking-tight font-tabular">
              {batterySharePct}%
            </span>
            <span className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
              ({daysCount} {t.periodDaysCount})
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-2 sm:pt-3 text-slate-500 dark:text-slate-400">
            <span className="truncate">{isEn ? 'Battery cover' : 'Покриття АКБ'}:</span>
            <strong className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">{totalBatteryDischargeKwh} {unitKwh}</strong>
          </div>
        </div>
      </div>

      {/* Autonomy Progress Bar Strip & Cost Breakdown Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Autonomy Progress Bar Strip */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                {t.batteryShare}: <strong className="font-bold text-emerald-600 dark:text-emerald-400">{batterySharePct}%</strong> ({totalBatteryDischargeKwh} {unitKwh})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                {t.gridShare}: <strong className="font-bold text-rose-500">{gridSharePct}%</strong> ({totalGridImportKwh} {unitKwh})
              </span>
            </div>
          </div>
          <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${batterySharePct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
              style={{ width: `${gridSharePct}%` }}
            />
          </div>
        </div>

        {/* Financial Cost Card: Dual-Tariff Energy & Inverter Cost */}
        <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isEn ? 'Cost' : 'Вартість'}
              </span>
            </div>
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {isEn ? 'Total' : 'Разом'}: <span className="font-bold text-slate-900 dark:text-white text-sm">{totalCostUah} ₴</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs border-t border-slate-100 dark:border-white/[0.06]">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-sans">
                {isEn ? 'Night (23-07)' : 'Ніч (23-07)'}
              </span>
              <span className="font-bold text-indigo-500 dark:text-indigo-400">
                {totalCostNightUah} ₴
              </span>
              <span className="text-[10px] text-slate-400">@ 2.16 ₴</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-sans">
                {isEn ? 'Day (07-23)' : 'День (07-23)'}
              </span>
              <span className="font-bold text-amber-500 dark:text-amber-400">
                {totalCostDayUah} ₴
              </span>
              <span className="text-[10px] text-slate-400">@ 4.32 ₴</span>
            </div>
            <div className="flex flex-col border-l border-slate-100 dark:border-white/[0.06] pl-2">
              <span className="text-[10px] text-purple-400 uppercase font-sans">
                {isEn ? 'Inverter Self-Cons.' : 'Інвертор (власне)'}
              </span>
              <span className="font-bold text-purple-500 dark:text-purple-400">
                {totalInverterCostUah} ₴
              </span>
              <span className="text-[10px] text-slate-400">({totalInverterLossKwh} {unitKwh})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Breakdown Bar Chart */}
      <div className="bg-white dark:bg-[#111827]/90 rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-500">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              {t.dailyBreakdownTitle}
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {daysCount} {t.periodDaysCount}
          </span>
        </div>

        {/* Interactive Legend Pills like in PowerFlowChart */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {pills.map((pill) => {
            const isSelected = selectedSeries[pill.key];
            return (
              <button
                key={pill.key}
                onClick={() => toggleSeries(pill.key, pill.name)}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium transition-all cursor-pointer ${
                  isSelected
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

        <div ref={chartRef} className="w-full h-80" />
      </div>
    </div>
  );
}
