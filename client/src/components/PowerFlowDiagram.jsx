import React from 'react';
import {
  Sun,
  Zap,
  Home as HomeIcon,
  Battery,
  BatteryCharging,
  Cpu,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Share2,
} from 'lucide-react';
import { translations } from '../utils/i18n';

/**
 * PowerFlowDiagram
 * Pixel-perfect adaptation of the interactive live energy flow diagram from redesign.html.
 * Fully responsive: desktop shows full telemetry metrics; mobile adapts smoothly with streamlined layout.
 * Unified consistent color coding:
 * - Consumption (Home Load): Amber / Yellow (#f59e0b)
 * - Battery: Emerald / Green (charging / positive), Rose / Red (discharging)
 * - Inverter: Purple (#a855f7)
 * - Grid / Import: Rose / Red (grid import active), Emerald / Green (grid stable / bypass)
 * - Solar (PV): Amber (#f59e0b)
 */
export default function PowerFlowDiagram({
  solarPower = 0,
  gridPower = 0,
  homeLoad = 0,
  batteryPower = 0, // positive = charging, negative = discharging
  soc = 0,
  inverterLoss = 0,
  gridVoltage = 220,
  gridFrequency = 50,
  isGridOnline = true,
  isEpsActive = false,
  inverterTemp = '28.0',
  batteryVoltage = '50.1',
  batteryCurrent = '20.1',
  batteryHealth = null,
  loadPercent = '4.6',
  lang = 'uk',
}) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitV = isEn ? 'V' : 'В';
  const unitHz = isEn ? 'Hz' : 'Гц';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';

  const {
    isSplitModules = false,
    model: batteryModel = 'LiFePO4',
    bat1Cycles = 0,
    bat2Cycles = 0,
    avgCycles = 0,
    bat1Soh = '100.0',
    bat2Soh = '100.0',
    avgSoh = '100.0',
    bat1Kwh = 0,
    bat2Kwh = 0,
    totalDisChgKwh = 0,
  } = batteryHealth || {};

  const batteryTitleTooltip = isSplitModules
    ? `B1 (11.2025): ${bat1Soh}% (${bat1Kwh} ${unitKwh})\nB2 (02.2026): ${bat2Soh}% (${bat2Kwh} ${unitKwh})`
    : `${isEn ? 'Lifetime discharge' : 'Загальний розряд'}: ${totalDisChgKwh} ${unitKwh} (${avgCycles} ${isEn ? 'cycles' : 'циклів'})`;

  const isCharging = batteryPower > 0;
  const isDischarging = batteryPower < 0;
  const absBattPower = Math.abs(batteryPower);

  const isGridFlowActive = gridPower > 10;
  const isHomeFlowActive = homeLoad > 10;
  const isSolarFlowActive = solarPower > 10;
  const isBatteryFlowActive = absBattPower > 10;

  // Real or clamped inverter loss
  const effectiveLoss = inverterLoss > 0 ? inverterLoss : 113;

  return (
    <section className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-3 sm:p-5 lg:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-4 sm:gap-5 transition-all">
      {/* Header & Balance Equation */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] shrink-0">
            <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {isEn ? 'Power Flow Diagram' : 'Діаграма потоків енергії'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] sm:text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE
              </span>
            </div>
            <span className="hidden sm:inline text-xs font-mono text-slate-400 dark:text-slate-400 mt-0.5">
              {isEn
                ? 'Interactive active power distribution map of SNA 6K inverter nodes'
                : 'Інтерактивна карта розподілу активних потужностей вузлів інвертора SNA 6K'}
            </span>
          </div>
        </div>

        {/* Power Balance Equation Badge */}
        <div className="w-full lg:w-auto flex flex-wrap items-center justify-between sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-slate-50 dark:bg-[#0c121e]/90 border border-slate-200/70 dark:border-white/[0.06] font-mono text-xs shadow-inner">
          <span className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold mr-0.5 sm:mr-1">
            {isEn ? 'Balance:' : 'Баланс:'}
          </span>
          <span className="font-bold text-rose-600 dark:text-rose-400 text-[11px] sm:text-xs">
            {gridPower} {unitW}{' '}
            <span className="text-[9px] sm:text-[10px] font-normal text-slate-500">
              ({isEn ? 'Grid' : 'Мережа'})
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-bold">=</span>
          <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px] sm:text-xs">
            {homeLoad} {unitW}{' '}
            <span className="text-[9px] sm:text-[10px] font-normal text-slate-500">
              ({isEn ? 'Home' : 'Спож.'})
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-bold">+</span>
          <span className={`font-bold text-[11px] sm:text-xs ${isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-400'}`}>
            {isCharging ? `+${absBattPower}` : isDischarging ? `-${absBattPower}` : '0'} {unitW}{' '}
            <span className="text-[9px] sm:text-[10px] font-normal text-slate-500">
              ({isEn ? 'Battery' : 'АКБ'})
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-bold">+</span>
          <span className="font-bold text-purple-600 dark:text-purple-400 text-[11px] sm:text-xs">
            ~{effectiveLoss} {unitW}{' '}
            <span className="text-[9px] sm:text-[10px] font-normal text-slate-500">
              ({isEn ? 'Inv' : 'Інв.'})
            </span>
          </span>
        </div>
      </div>

      {/* Interactive Energy Flow Stage Canvas */}
      <div className="relative w-full rounded-2xl bg-gradient-to-b from-slate-50/70 via-slate-100/40 to-slate-50/70 dark:from-[#090d18] dark:via-[#0c1120] dark:to-[#090d18] border border-slate-200/80 dark:border-white/[0.05] p-2.5 sm:p-4 lg:p-8 overflow-hidden">
        {/* Background ambient decorative grid dots */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        {/* Flow Diagram Layout Grid */}
        <div className="relative max-w-5xl mx-auto flex flex-col items-center">
          {/* TOP ROW: Солнечные панели (PV) */}
          <div className="w-full flex justify-center z-20 mb-1 sm:mb-2">
            <div className="relative group flex items-center gap-2 sm:gap-3.5 px-3 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/90 dark:bg-[#121929]/95 border border-slate-200/90 dark:border-white/[0.08] shadow-sm hover:border-amber-500/40 transition-all min-w-[200px] sm:min-w-[260px]">
              <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.15)] shrink-0">
                <Sun className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    {isEn ? 'Solar Panels' : 'Сонячні панелі'}
                  </span>
                  <span className="hidden sm:inline px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-100 dark:bg-white/[0.06] text-slate-400">
                    PV Array
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={`font-mono text-base sm:text-xl font-extrabold ${isSolarFlowActive ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    {solarPower}
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono text-slate-400">{unitW}</span>
                  <span className="hidden sm:inline text-[10px] font-mono text-slate-400 dark:text-slate-500 ml-1.5">
                    {isSolarFlowActive ? `• Active` : (isEn ? '• Night / Standby' : '• Ніч / Очікування')}
                  </span>
                </div>
                {/* Secondary PV info hidden on mobile to avoid clutter */}
                <div className="hidden sm:block text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                  PV1: 0 {unitV} • PV2: 0 {unitV}
                </div>
              </div>
            </div>
          </div>

          {/* FLOW CONNECTOR SVG (Top to Center, Left to Center, Center to Right, Center to Bottom) */}
          <div className="w-full relative my-1">
            <svg
              className="w-full h-40 sm:h-48 lg:h-56 pointer-events-none select-none"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 900 240"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <filter height="140%" id="glow-rose" width="140%" x="-20%" y="-20%">
                  <feGaussianBlur result="blur" stdDeviation="3" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter height="140%" id="glow-amber" width="140%" x="-20%" y="-20%">
                  <feGaussianBlur result="blur" stdDeviation="3" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter height="140%" id="glow-emerald" width="140%" x="-20%" y="-20%">
                  <feGaussianBlur result="blur" stdDeviation="3" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* PV flow line (Top: 450,0 to Center: 450,120) */}
              {isSolarFlowActive ? (
                <>
                  <line
                    stroke="#f59e0b"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    strokeWidth="6"
                    x1="450"
                    x2="450"
                    y1="0"
                    y2="120"
                  />
                  <line
                    className="animate-flow-amber"
                    filter="url(#glow-amber)"
                    stroke="#f59e0b"
                    strokeLinecap="round"
                    strokeWidth="3"
                    x1="450"
                    x2="450"
                    y1="0"
                    y2="120"
                  />
                  <polygon fill="#f59e0b" points="450,122 445,112 450,114 455,112" />
                </>
              ) : (
                <line
                  className="text-slate-300 dark:text-white/[0.08]"
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  x1="450"
                  x2="450"
                  y1="0"
                  y2="120"
                />
              )}

              {/* Left (Grid, ~180,120) to Center (Inverter, ~350,120) Flow */}
              {isGridFlowActive ? (
                <>
                  <line
                    stroke="#f43f5e"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    strokeWidth="6"
                    x1="180"
                    x2="350"
                    y1="120"
                    y2="120"
                  />
                  <line
                    className="animate-flow-rose"
                    filter="url(#glow-rose)"
                    stroke="#f43f5e"
                    strokeLinecap="round"
                    strokeWidth="3"
                    x1="180"
                    x2="350"
                    y1="120"
                    y2="120"
                  />
                  <polygon fill="#f43f5e" points="352,120 342,115 344,120 342,125" />
                </>
              ) : (
                <line
                  className="text-slate-300 dark:text-white/[0.08]"
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  x1="180"
                  x2="350"
                  y1="120"
                  y2="120"
                />
              )}

              {/* Center (Inverter, ~550,120) to Right (Home Consumption, ~720,120) Flow (Amber/Yellow) */}
              {isHomeFlowActive ? (
                <>
                  <line
                    stroke="#f59e0b"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    strokeWidth="6"
                    x1="550"
                    x2="720"
                    y1="120"
                    y2="120"
                  />
                  <line
                    className="animate-flow-amber"
                    filter="url(#glow-amber)"
                    stroke="#f59e0b"
                    strokeLinecap="round"
                    strokeWidth="3"
                    x1="550"
                    x2="720"
                    y1="120"
                    y2="120"
                  />
                  <polygon fill="#f59e0b" points="722,120 712,115 714,120 712,125" />
                </>
              ) : (
                <line
                  className="text-slate-300 dark:text-white/[0.08]"
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  x1="550"
                  x2="720"
                  y1="120"
                  y2="120"
                />
              )}

              {/* Center (Inverter, 450,150) to Bottom (Battery, 450,240) Flow */}
              {isCharging ? (
                // Charging: Flow downward from Inverter to Battery (Emerald Green)
                <>
                  <line
                    stroke="#10b981"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    strokeWidth="6"
                    x1="450"
                    x2="450"
                    y1="150"
                    y2="240"
                  />
                  <line
                    className="animate-flow-emerald"
                    filter="url(#glow-emerald)"
                    stroke="#10b981"
                    strokeLinecap="round"
                    strokeWidth="3"
                    x1="450"
                    x2="450"
                    y1="150"
                    y2="240"
                  />
                  <polygon fill="#10b981" points="450,240 445,230 450,232 455,230" />
                </>
              ) : isDischarging ? (
                // Discharging: Flow upward from Battery to Inverter (Rose Red)
                <>
                  <line
                    stroke="#f43f5e"
                    strokeLinecap="round"
                    strokeOpacity="0.25"
                    strokeWidth="6"
                    x1="450"
                    x2="450"
                    y1="240"
                    y2="150"
                  />
                  <line
                    className="animate-flow-rose"
                    filter="url(#glow-rose)"
                    stroke="#f43f5e"
                    strokeLinecap="round"
                    strokeWidth="3"
                    x1="450"
                    x2="450"
                    y1="240"
                    y2="150"
                  />
                  <polygon fill="#f43f5e" points="450,148 445,158 450,156 455,158" />
                </>
              ) : (
                <line
                  className="text-slate-300 dark:text-white/[0.08]"
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  x1="450"
                  x2="450"
                  y1="150"
                  y2="240"
                />
              )}
            </svg>

            {/* Middle Overlay Elements: Left Node, Center Inverter, Right Node */}
            <div className="absolute inset-0 flex items-center justify-between px-1 sm:px-4 lg:px-6">
              {/* LEFT NODE: Сеть 220V (Grid In) */}
              <div className="z-20 flex flex-col items-center">
                <div className="group flex flex-col p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-[#121929]/95 border border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.12)] hover:border-rose-500/60 transition-all w-28 sm:w-52 lg:w-60">
                  <div className="flex items-center justify-between pb-1 sm:pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                        <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          {isEn ? 'Grid' : 'Мережа'}
                        </span>
                        <span className="hidden sm:inline text-[9px] font-mono text-slate-400">
                          Grid Input
                        </span>
                      </div>
                    </div>
                    <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400">
                      {isEn ? 'INPUT' : 'ВХІД'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 mt-1.5 sm:mt-2.5">
                    <span className="font-mono text-base sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-tabular">
                      {gridPower}
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500">{unitW}</span>
                  </div>

                  {/* Secondary grid specs hidden on small mobile screens */}
                  <div className="hidden sm:grid grid-cols-2 gap-1.5 mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                    <span>
                      {isEn ? 'V:' : 'U:'}{' '}
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                        {gridVoltage} {unitV}
                      </strong>
                    </span>
                    <span>
                      {isEn ? 'F:' : 'F:'}{' '}
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                        {gridFrequency} {unitHz}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Transfer Badge */}
                <div className="mt-1.5 sm:mt-2 inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-[9px] sm:text-[10px] font-mono font-semibold shadow-sm">
                  <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse" />
                  <span className="truncate max-w-[90px] sm:max-w-none">
                    {gridPower} {unitW} {isEn ? 'in' : 'в систему'}
                  </span>
                </div>
              </div>

              {/* CENTER NODE: LUXPOWER SNA 6K (Central Hub) */}
              <div className="z-20 flex flex-col items-center">
                <div className="relative group flex flex-col p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-[#131b2f] border-2 border-purple-500/40 shadow-[0_0_28px_rgba(168,85,247,0.18)] hover:border-purple-500 transition-all w-32 sm:w-64 lg:w-72">
                  {/* Ambient central pulse ring */}
                  <div className="absolute -inset-1 rounded-2xl bg-purple-500/10 blur-md pointer-events-none animate-pulse-glow" />
                  
                  <div className="relative flex items-center justify-between pb-1.5 sm:pb-2.5 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 sm:gap-2.5">
                      <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-md sm:rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.3)] shrink-0">
                        <Cpu className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                          SNA 6K
                        </span>
                        <span className="text-[8px] sm:text-[9px] font-mono text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping"></span>
                          {isGridOnline ? 'Bypass' : 'EPS'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Central Telemetry Grid */}
                  <div className="relative grid grid-cols-2 gap-1.5 sm:gap-2 mt-2 sm:mt-3 text-[10px] sm:text-[11px] font-mono">
                    <div className="flex flex-col bg-slate-50 dark:bg-white/[0.04] p-1 sm:p-2 rounded-lg border border-slate-100 dark:border-white/[0.04]">
                      <span className="text-[8px] sm:text-[9px] uppercase text-slate-400 font-semibold truncate">
                        {isEn ? 'Loss' : 'Власне'}
                      </span>
                      <span className="text-purple-600 dark:text-purple-400 font-bold text-xs sm:text-sm mt-0.5 font-tabular">
                        ~{effectiveLoss} {unitW}
                      </span>
                    </div>
                    <div className="flex flex-col bg-slate-50 dark:bg-white/[0.04] p-1 sm:p-2 rounded-lg border border-slate-100 dark:border-white/[0.04]">
                      <span className="text-[8px] sm:text-[9px] uppercase text-slate-400 font-semibold truncate">
                        {isEn ? 'Temp' : 'Т інв.'}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm mt-0.5 font-tabular">
                        {inverterTemp}°C
                      </span>
                    </div>
                  </div>

                  {/* Secondary specs hidden on mobile */}
                  <div className="hidden sm:flex relative items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                    <span>
                      {isEn ? 'Efficiency:' : 'Ефективність:'}{' '}
                      <strong className="text-purple-600 dark:text-purple-400 font-semibold">
                        97.4%
                      </strong>
                    </span>
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">
                      {isGridOnline ? (isEn ? 'Online' : 'Онлайн') : (isEn ? 'Offgrid' : 'Автономія')}
                    </span>
                  </div>
                </div>
              </div>

              {/* RIGHT NODE: Споживання (Home Consumption) - Amber / Yellow */}
              <div className="z-20 flex flex-col items-center">
                <div className="group flex flex-col p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-[#121929]/95 border border-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.12)] hover:border-amber-500/60 transition-all w-28 sm:w-52 lg:w-60">
                  <div className="flex items-center justify-between pb-1 sm:pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                        <HomeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          {isEn ? 'Consumption' : 'Споживання'}
                        </span>
                        <span className="hidden sm:inline text-[9px] font-mono text-slate-400">
                          AC / EPS Load
                        </span>
                      </div>
                    </div>
                    <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
                      {isEn ? 'OUTPUT' : 'ВИХІД'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 mt-1.5 sm:mt-2.5">
                    <span className="font-mono text-base sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-tabular">
                      {homeLoad}
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500">{unitW}</span>
                  </div>

                  {/* Secondary load specs hidden on small mobile screens */}
                  <div className="hidden sm:grid grid-cols-2 gap-1.5 mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                    <span>
                      EPS:{' '}
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                        {gridVoltage} {unitV}
                      </strong>
                    </span>
                    <span>
                      {isEn ? 'Load:' : 'Рівень:'}{' '}
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                        {loadPercent}%
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Transfer Badge */}
                <div className="mt-1.5 sm:mt-2 inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[9px] sm:text-[10px] font-mono font-semibold shadow-sm">
                  <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse" />
                  <span className="truncate max-w-[90px] sm:max-w-none">
                    {homeLoad} {unitW} {isEn ? 'load' : 'споживачам'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: Аккумулятор (BESS LiFePO4) */}
          <div className="w-full flex flex-col items-center z-20 mt-1 sm:mt-2">
            <div className={`mb-1.5 sm:mb-2 inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-semibold shadow-sm ${
              isCharging
                ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                : isDischarging
                ? 'bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400'
                : 'bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500'
            }`}>
              {isCharging ? (
                <ArrowDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse" />
              ) : isDischarging ? (
                <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse" />
              ) : null}
              <span>
                {isCharging
                  ? `${isEn ? 'Charging' : 'Заряджання'} +${absBattPower} ${unitW} (${batteryCurrent} A)`
                  : isDischarging
                  ? `${isEn ? 'Discharging' : 'Розряджання'} -${absBattPower} ${unitW} (${batteryCurrent} A)`
                  : (isEn ? 'Battery Standby' : 'АКБ у спокої')}
              </span>
            </div>

            <div className={`relative group flex items-center gap-2.5 sm:gap-4 px-3.5 py-2 sm:px-6 sm:py-3.5 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-[#121929]/95 border shadow-[0_4px_22px_rgba(16,185,129,0.15)] transition-all min-w-[220px] sm:min-w-[380px] max-w-lg ${
              isCharging
                ? 'border-emerald-500/35 hover:border-emerald-500/60'
                : isDischarging
                ? 'border-rose-500/35 hover:border-rose-500/60'
                : 'border-slate-200 dark:border-white/[0.08]'
            }`}>
              <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 ${
                isCharging
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                  : isDischarging
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                  : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.08] text-slate-400'
              }`}>
                {isCharging ? (
                  <BatteryCharging className="w-4 h-4 sm:w-6 sm:h-6" />
                ) : (
                  <Battery className="w-4 h-4 sm:w-6 sm:h-6" />
                )}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="relative group/batTitle min-w-0 cursor-help"
                    title={batteryTitleTooltip}
                  >
                    <span className="block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 truncate">
                      {isEn ? 'Battery' : 'Акумулятор'}
                      <span className="hidden sm:inline"> ({batteryModel})</span>
                    </span>
                    <div className="pointer-events-none opacity-0 group-hover/batTitle:opacity-100 transition-opacity duration-150 absolute left-0 bottom-full mb-2 z-50 w-max max-w-xs rounded-lg bg-slate-900 dark:bg-slate-800 text-white border border-slate-700/80 shadow-xl px-2.5 py-1.5 text-[10px] font-mono leading-relaxed">
                      {isSplitModules ? (
                        <>
                          <div>B1 (11.2025): {bat1Soh}% ({bat1Kwh} {unitKwh})</div>
                          <div>B2 (02.2026): {bat2Soh}% ({bat2Kwh} {unitKwh})</div>
                        </>
                      ) : (
                        <div>{isEn ? 'Lifetime discharge' : 'Загальний розряд'}: {totalDisChgKwh} {unitKwh}</div>
                      )}
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-mono font-semibold border shrink-0 ${
                    isCharging
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : isDischarging
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.05] dark:border-white/[0.08]'
                  }`}>
                    {isCharging ? (isEn ? 'CHARGE' : 'ЗАРЯД') : isDischarging ? (isEn ? 'DISCHARGE' : 'РОЗРЯД') : (isEn ? 'IDLE' : 'СПОКІЙ')}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 sm:gap-2 mt-0.5">
                  <span className={`font-mono text-lg sm:text-2xl font-extrabold font-tabular ${
                    isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    {soc}%
                  </span>
                  <span className={`text-[10px] sm:text-xs font-mono font-bold ${isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-400'}`}>
                    {isCharging ? `+${absBattPower}` : isDischarging ? `-${absBattPower}` : '0'} {unitW}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-mono text-slate-400">
                    ({batteryVoltage} {unitV})
                  </span>
                </div>
                {/* Secondary battery specs hidden on small mobile screens */}
                <div className="hidden sm:flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
                  <span className="whitespace-nowrap">
                    {isEn ? 'Current:' : 'Струм:'}{' '}
                    <strong className={`font-semibold ${isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-400'}`}>
                      {isCharging ? `+${batteryCurrent}` : isDischarging ? `-${batteryCurrent}` : '0.0'} A
                    </strong>
                  </span>
                  <span>•</span>
                  <span
                    className="whitespace-nowrap cursor-help"
                    title={isSplitModules
                      ? (isEn
                        ? `Avg: ${avgCycles} cycles • B1 (Nov 2025): ${bat1Kwh} kWh (${bat1Cycles} cyc) • B2 (Feb 2026): ${bat2Kwh} kWh (${bat2Cycles} cyc)`
                        : `Сер.: ${avgCycles} циклів • B1 (11.2025): ${bat1Kwh} кВт·год (${bat1Cycles} ц.) • B2 (02.2026): ${bat2Kwh} кВт·год (${bat2Cycles} ц.)`)
                      : `${avgCycles} ${isEn ? 'cycles' : 'циклів'}`}
                  >
                    {isSplitModules ? (
                      <>B1: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{bat1Cycles}</strong> / B2: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{bat2Cycles}</strong> {isEn ? 'cycles' : 'циклів'}</>
                    ) : (
                      <><strong className="text-slate-700 dark:text-slate-200 font-semibold">{avgCycles}</strong> {isEn ? 'cycles' : 'циклів'}</>
                    )}
                  </span>
                  <span>•</span>
                  <span
                    className="whitespace-nowrap cursor-help"
                    title={isSplitModules ? `B1: ${bat1Soh}% • B2: ${bat2Soh}%` : `SOH: ${avgSoh}%`}
                  >
                    SOH: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{avgSoh}%</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
