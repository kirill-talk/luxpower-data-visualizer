import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import { translations } from '../utils/i18n';

function formatTimeWithoutSeconds(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.trim().split(' ');
  const t = parts.length > 1 ? parts[1] : parts[0];
  const hhmm = t.split(':');
  if (hhmm.length >= 2) {
    return `${hhmm[0]}:${hhmm[1]}`;
  }
  return t;
}

export default function BatteryChart({ tableRows, onZoomChange, lang = 'uk' }) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const onZoomChangeRef = useRef(onZoomChange);
  const sortedDataRef = useRef([]);

  const pills = useMemo(() => [
    { key: 'vbat', name: t.seriesVoltage, dotColor: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' },
    { key: 'current', name: t.seriesCurrent, dotColor: 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.8)]' },
    { key: 'tbat', name: t.seriesTemp, dotColor: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]' },
    { key: 'soc', name: t.seriesSoc, dotColor: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' },
  ], [t]);

  const [selectedSeries, setSelectedSeries] = useState({
    vbat: true,
    current: true,
    tbat: true,
    soc: true,
  });

  onZoomChangeRef.current = onZoomChange;

  const toggleSeries = (key, seriesName) => {
    setSelectedSeries(prev => {
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

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);

      chartInstanceRef.current.on('datazoom', (params) => {
        if (!onZoomChangeRef.current || !sortedDataRef.current.length) return;
        const opt = chartInstanceRef.current.getOption();

        let startPct = 0;
        let endPct = 100;

        const paramDz = params?.batch ? params.batch[0] : params;
        if (paramDz && typeof paramDz.start === 'number' && typeof paramDz.end === 'number' && !isNaN(paramDz.start) && !isNaN(paramDz.end)) {
          startPct = paramDz.start;
          endPct = paramDz.end;
        } else if (opt && opt.dataZoom && Array.isArray(opt.dataZoom)) {
          const dz = opt.dataZoom[0];
          startPct = typeof dz.start === 'number' && !isNaN(dz.start) ? dz.start : 0;
          endPct = typeof dz.end === 'number' && !isNaN(dz.end) ? dz.end : 100;
        }

        const totalLen = sortedDataRef.current.length;
        const startIndex = Math.max(0, Math.floor((startPct / 100) * totalLen));
        const endIndex = Math.min(totalLen - 1, Math.ceil((endPct / 100) * totalLen));

        const sliced = sortedDataRef.current.slice(startIndex, endIndex + 1);
        onZoomChangeRef.current(sliced);
      });
    }

    const chart = chartInstanceRef.current;

    if (!tableRows || !tableRows.length) {
      chart.clear();
      return;
    }

    // Sort ascending by time
    const sorted = [...tableRows].sort((a, b) => {
      const tA = (a.time || '').toLowerCase();
      const tB = (b.time || '').toLowerCase();
      return tA.localeCompare(tB);
    });
    sortedDataRef.current = sorted;

    const times = sorted.map((d) => formatTimeWithoutSeconds(d.time));
    const vbat = [];
    const current = [];
    const tbat = [];
    const soc = [];

    sorted.forEach((item) => {
      vbat.push(parseFloat(item.vBat) || 0);
      current.push(parseFloat(item.bmsBatCurrent) || 0);
      tbat.push(parseFloat(item.tBat) || 0);
      soc.push(parseFloat(item.soc) || 0);
    });

    const isDarkMode = document.documentElement.classList.contains('dark');
    const isEn = lang === 'en';
    const unitV = isEn ? 'V' : 'В';
    const unitA = isEn ? 'A' : 'А';

    const option = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: isDarkMode ? '#475569' : '#94a3b8',
            type: 'dashed',
          },
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
          let tip = `<div style="font-weight:600;margin-bottom:4px;border-bottom:1px solid ${
            isDarkMode ? '#334155' : '#e2e8f0'
          };padding-bottom:3px;">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            if (p.value === undefined || p.value === null) return;
            const color = p.color;
            let unit = '';
            if (p.seriesName === t.seriesSoc) unit = '%';
            else if (p.seriesName === t.seriesVoltage) unit = ` ${unitV}`;
            else if (p.seriesName === t.seriesCurrent) unit = ` ${unitA}`;
            else if (p.seriesName === t.seriesTemp) unit = ' °C';
            tip += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};"></span>
                <span>${p.seriesName}</span>
              </span>
              <span style="font-weight:700;">${p.value}${unit}</span>
            </div>`;
          });
          return tip;
        },
      },
      legend: {
        show: false,
        selected: {
          [t.seriesVoltage]: selectedSeries.vbat,
          [t.seriesCurrent]: selectedSeries.current,
          [t.seriesTemp]: selectedSeries.tbat,
          [t.seriesSoc]: selectedSeries.soc,
        },
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '12%',
        top: '6%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: isDarkMode ? '#334155' : '#cbd5e1' } },
        axisLabel: {
          color: isDarkMode ? '#94a3b8' : '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
        splitLine: {
          show: true,
          lineStyle: { color: isDarkMode ? '#1e293b' : '#f1f5f9', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: isDarkMode ? '#94a3b8' : '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
        splitLine: {
          lineStyle: { color: isDarkMode ? '#1e293b' : '#f1f5f9' },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          xAxisIndex: [0],
          start: 0,
          end: 100,
          height: 18,
          bottom: '1%',
          borderColor: 'transparent',
          backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
          fillerColor: isDarkMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.25)',
          handleStyle: { color: '#10b981' },
          textStyle: { color: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 9 },
        },
      ],
      series: [
        {
          name: t.seriesVoltage,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#f59e0b' },
          data: vbat,
        },
        {
          name: t.seriesCurrent,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.8, color: '#06b6d4' },
          data: current,
        },
        {
          name: t.seriesTemp,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.8, color: '#f43f5e' },
          data: tbat,
        },
        {
          name: t.seriesSoc,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2.2, color: '#10b981' },
          data: soc,
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart && chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [tableRows, lang, t, selectedSeries]);

  return (
    <div className="flex flex-col gap-4">
      {/* Interactive Legend Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {pills.map((pill) => {
          const isSelected = selectedSeries[pill.key];
          return (
            <button
              key={pill.key}
              onClick={() => toggleSeries(pill.key, pill.name)}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-medium transition-all ${
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

      {/* Chart Canvas Area */}
      <div className="relative w-full bg-slate-50/60 dark:bg-[#070b13] rounded-xl p-3 border border-slate-200/70 dark:border-white/[0.05]">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 dark:text-slate-500 px-1 mb-1">
          <span>{t.bmsParam}</span>
          <span>{t.bmsScale}</span>
        </div>
        <div ref={chartRef} className="w-full h-72 sm:h-80" />
        {!tableRows || !tableRows.length ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm rounded-xl text-slate-400 text-xs font-mono">
            {t.batteryLoading}
          </div>
        ) : null}
      </div>
    </div>
  );
}
