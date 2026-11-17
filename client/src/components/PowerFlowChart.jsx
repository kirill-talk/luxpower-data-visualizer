import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import { translations } from '../utils/i18n';
import { parseInverterPoint } from '../utils/energyMath';

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

export default function PowerFlowChart({ rawData, onZoomChange, lang = 'uk' }) {
  const t = translations[lang] || translations.uk;
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const onZoomChangeRef = useRef(onZoomChange);
  const sortedDataRef = useRef([]);

  const pills = useMemo(() => [
    { key: 'import', name: t.seriesImport, dotColor: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]' },
    { key: 'load', name: t.seriesConsumption, dotColor: 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]' },
    { key: 'dischg', name: t.seriesDischarge, dotColor: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' },
    { key: 'chg', name: t.seriesCharge, dotColor: 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' },
    { key: 'inv', name: t.seriesInverter, dotColor: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' },
    { key: 'soc', name: t.seriesSoc, dotColor: 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]' },
    { key: 'pv', name: t.seriesSolar, dotColor: 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]' },
  ], [t]);

  const [selectedSeries, setSelectedSeries] = useState({
    import: true,
    load: true,
    dischg: true,
    chg: true,
    inv: true,
    soc: true,
    pv: false,
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

        // Try getting from event params first (params.batch[0] or params)
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
        // Map raw data points to parsed inverter points expected by integrateEnergy
        const parsedSliced = sliced.map(parseInverterPoint).filter(Boolean);
        onZoomChangeRef.current(parsedSliced);
      });
    }

    const chart = chartInstanceRef.current;

    if (!rawData || !rawData.length) {
      chart.clear();
      return;
    }

    // Sort ascending by time
    const sorted = [...rawData].sort((a, b) => {
      const tA = (a.time || '').toLowerCase();
      const tB = (b.time || '').toLowerCase();
      return tA.localeCompare(tB);
    });
    sortedDataRef.current = sorted;

    const times = sorted.map((d) => formatTimeWithoutSeconds(d.time));
    const importPower = [];
    const consumption = [];
    const batDischarge = [];
    const batCharge = [];
    const inverterLoss = [];
    const soc = [];
    const pvPower = [];

    sorted.forEach((item) => {
      // Support both dayMultiLine format (gridPower, consumption, batteryDischarging, solarPv)
      // and table rows format (pToUser, peps/pLoad, pDisCharge, pCharge, ppv)
      
      // 1. Grid import
      let imp = 0;
      if (item.gridPower !== undefined) {
        const rawGrid = Number(item.gridPower) || 0;
        // In dayMultiLine API: gridPower < 0 means import from grid
        imp = Math.max(0, -rawGrid);
      } else if (item.pToUser !== undefined) {
        imp = Math.max(0, Number(item.pToUser) || 0);
      }
      importPower.push(imp);

      // 2. Consumption / Home load
      let cons = 0;
      if (item.consumption !== undefined) {
        cons = Math.max(0, Number(item.consumption) || 0);
      } else if (item.consumptionPower !== undefined && Number(item.consumptionPower) > 0) {
        cons = Number(item.consumptionPower);
      } else {
        const eps = Number(item.peps) || 0;
        const directLoad = Number(item.pLoad) || 0;
        cons = eps > 0 ? eps : directLoad;
      }
      consumption.push(cons);

      // 3. Battery discharge & charge
      let dis = 0;
      let chg = 0;
      if (item.batteryDischarging !== undefined) {
        const rawBatt = Number(item.batteryDischarging) || 0;
        // In dayMultiLine API: batteryDischarging > 0 means discharge, < 0 means charge
        dis = Math.max(0, rawBatt);
        chg = Math.max(0, -rawBatt);
      } else {
        dis = Math.max(0, Number(item.pDisCharge) || 0);
        chg = Math.max(0, Number(item.pCharge) || 0);
      }
      batDischarge.push(dis);
      batCharge.push(chg);

      // 4. Solar PV
      let pv = 0;
      if (item.solarPv !== undefined) {
        pv = Math.max(0, Number(item.solarPv) || 0);
      } else if (item.ppv !== undefined) {
        pv = Math.max(0, Number(item.ppv) || 0);
      }
      pvPower.push(pv);

      // 5. Inverter losses
      const input = imp + dis + pv;
      const output = cons + chg;
      const loss = Math.max(0, input - output);
      inverterLoss.push(loss);

      // 6. Battery SOC
      const rawSoc = typeof item.soc === 'string' ? item.soc.replace('%', '') : item.soc;
      soc.push(Number(rawSoc) || 0);
    });

    const isDarkMode = document.documentElement.classList.contains('dark');
    const unitW = lang === 'en' ? 'W' : 'Вт';

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
            const label = p.seriesName;
            const val = p.value;
            const unit = label === t.seriesSoc ? '%' : ` ${unitW}`;
            tip += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};"></span>
                <span>${label}</span>
              </span>
              <span style="font-weight:700;">${val}${unit}</span>
            </div>`;
          });
          return tip;
        },
      },
      legend: {
        show: false,
        selected: {
          [t.seriesImport]: selectedSeries.import,
          [t.seriesConsumption]: selectedSeries.load,
          [t.seriesDischarge]: selectedSeries.dischg,
          [t.seriesCharge]: selectedSeries.chg,
          [t.seriesInverter]: selectedSeries.inv,
          [t.seriesSoc]: selectedSeries.soc,
          [t.seriesSolar]: selectedSeries.pv,
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
      yAxis: [
        {
          type: 'value',
          name: `${unitW}`,
          nameTextStyle: {
            color: isDarkMode ? '#94a3b8' : '#64748b',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            align: 'right',
            padding: [0, 6, 0, 0],
          },
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
        {
          type: 'value',
          name: 'SOC %',
          min: 0,
          max: 100,
          position: 'right',
          nameTextStyle: {
            color: isDarkMode ? '#94a3b8' : '#64748b',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            align: 'left',
            padding: [0, 0, 0, 6],
          },
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
          name: t.seriesImport,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#f43f5e' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(244, 63, 94, 0.3)' },
              { offset: 1, color: 'rgba(244, 63, 94, 0.0)' },
            ]),
          },
          data: importPower,
        },
        {
          name: t.seriesConsumption,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#06b6d4' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(6, 182, 212, 0.25)' },
              { offset: 1, color: 'rgba(6, 182, 212, 0.0)' },
            ]),
          },
          data: consumption,
        },
        {
          name: t.seriesDischarge,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#10b981' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.25)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.0)' },
            ]),
          },
          data: batDischarge,
        },
        {
          name: t.seriesCharge,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.8, color: '#3b82f6' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.0)' },
            ]),
          },
          data: batCharge,
        },
        {
          name: t.seriesInverter,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
          data: inverterLoss,
        },
        {
          name: t.seriesSoc,
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2.2, color: '#a855f7' },
          data: soc,
        },
        {
          name: t.seriesSolar,
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#facc15' },
          data: pvPower,
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart && chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [rawData, lang, t, selectedSeries]);

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
          <span>SOC % / {lang === 'en' ? 'Power (W)' : 'Потужність (Вт)'}</span>
          <span>{t.chartProfile24h}</span>
        </div>
        <div ref={chartRef} className="w-full h-72 sm:h-80" />
        {!rawData || !rawData.length ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm rounded-xl text-slate-400 text-xs font-mono">
            {t.chartLoading}
          </div>
        ) : null}
      </div>
    </div>
  );
}
