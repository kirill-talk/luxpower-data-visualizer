import React from 'react';
import {
  Zap,
  Home,
  Battery,
  BatteryCharging,
  Cpu,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Activity,
  Flame,
  Sun
} from 'lucide-react';

/**
 * MobilePowerFlowDiagram
 * Clean, compact, native-styled power flow visualization specifically crafted
 * for mobile and tablet screens (< 1200px / < xl).
 * Provides clear node cards, animated energy directional flows, and essential telemetry
 * without the clutter of desktop coordinates.
 */
export default function MobilePowerFlowDiagram({
  solarPower = 0,
  gridPower = 0,
  homeLoad = 0,
  batteryPower = 0,
  soc = '0',
  inverterLoss = 0,
  gridVoltage = 220,
  gridFrequency = 50,
  isGridOnline = true,
  isEpsActive = false,
  inverterTemp = '28.0',
  batteryVoltage = '50.1',
  batteryCurrent = '0.0',
  batteryHealth = null,
  loadPercent = '4.6',
  lang = 'uk'
}) {
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitV = isEn ? 'V' : 'В';
  const unitHz = isEn ? 'Hz' : 'Гц';

  const {
    model: batteryModel = '2× Dyness B4850',
    bat1Cycles = 173,
    bat2Cycles = 66,
    avgCycles = 120,
    bat1Soh = '99.1',
    bat2Soh = '99.6',
    avgSoh = '99.3',
  } = batteryHealth || {};

  const isCharging = batteryPower > 0;
  const isDischarging = batteryPower < 0;
  const absBattPower = Math.abs(batteryPower);
  const effectiveLoss = inverterLoss > 0 ? inverterLoss : Math.max(0, gridPower + (isDischarging ? absBattPower : 0) - homeLoad - (isCharging ? absBattPower : 0));

  return (
    <section className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-3 transition-all">
      {/* Header with Title and Balance Formula */}
      <div className="flex flex-col gap-2 pb-2.5 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {isEn ? 'Power Flow' : 'Потоки потужності'}
            </h2>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
            isGridOnline
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isGridOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {isGridOnline ? (isEn ? 'Grid 220V' : 'Мережа 220В') : 'EPS Active'}
          </span>
        </div>

        {/* Dynamic Compact Real-time Formula */}
        <div className="flex items-center justify-between text-[11px] font-mono bg-slate-50 dark:bg-[#0c121e]/80 rounded-lg px-2.5 py-1.5 border border-slate-100 dark:border-white/[0.04]">
          <span className="text-slate-400">{isEn ? 'Balance:' : 'Баланс:'}</span>
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-rose-500">{gridPower}W</span>
            <span className="text-slate-400 font-normal">≈</span>
            <span className="text-amber-500">{homeLoad}W</span>
            <span className="text-slate-400 font-normal">+</span>
            <span className={isCharging ? 'text-emerald-500' : isDischarging ? 'text-rose-500' : 'text-slate-400'}>
              {isCharging ? `+${absBattPower}` : isDischarging ? `-${absBattPower}` : '0'}W
            </span>
            <span className="text-slate-400 font-normal">+</span>
            <span className="text-purple-500">~{effectiveLoss}W</span>
          </div>
        </div>
      </div>

      {/* Simplified Flow Diagram Cards Layout */}
      <div className="flex flex-col gap-2.5">
        {/* Row 1: Grid In & Consumption Out */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Source: Grid Input */}
          <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-[#131b2f] border border-rose-500/30 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isEn ? 'Grid Input' : 'Мережа Вхід'}
              </span>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${
                gridPower > 0
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-500'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
              }`}>
                <Zap className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1.5">
              <span className="font-mono text-xl font-extrabold text-rose-500 font-tabular">
                {gridPower}
              </span>
              <span className="text-xs font-semibold text-slate-400">{unitW}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-white/[0.05]">
              <span>{gridVoltage} {unitV}</span>
              <span>{gridFrequency} {unitHz}</span>
            </div>
          </div>

          {/* Destination: Consumption */}
          <div className="flex flex-col justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-[#131b2f] border border-amber-500/30 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isEn ? 'Consumption' : 'Споживання'}
              </span>
              <div className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Home className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1.5">
              <span className="font-mono text-xl font-extrabold text-amber-500 font-tabular">
                {homeLoad}
              </span>
              <span className="text-xs font-semibold text-slate-400">{unitW}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-white/[0.05]">
              <span>{isEn ? 'Load' : 'Рівень'}: {loadPercent}%</span>
              <span>{gridVoltage} {unitV}</span>
            </div>
          </div>
        </div>

        {/* Central Hub: Inverter SNA 6K */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/90 dark:bg-[#151c2e] border-2 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.12)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500 shrink-0">
              <Cpu className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Luxpower SNA 6K</span>
                <span className="text-[9px] font-mono text-purple-600 dark:text-purple-400 font-semibold px-1 rounded bg-purple-500/10 border border-purple-500/20">
                  {isGridOnline ? 'Bypass' : 'EPS'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <Flame className="w-3 h-3 text-purple-500" />
                  {inverterTemp}°C
                </span>
                <span>•</span>
                <span>{isEn ? 'Losses' : 'Втрати'}: ~{effectiveLoss} {unitW}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-mono uppercase text-slate-400">{isEn ? 'Efficiency' : 'ККД'}</span>
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              {gridPower > 0 ? `${Math.min(99, Math.max(70, Math.round(((homeLoad) / (gridPower)) * 100)))}%` : '96%'}
            </span>
          </div>
        </div>

        {/* Row 2: Battery BESS LiFePO4 */}
        <div className={`p-3 rounded-xl bg-slate-50/70 dark:bg-[#131b2f] border transition-all ${
          isCharging
            ? 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
            : isDischarging
            ? 'border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
            : 'border-slate-200 dark:border-white/[0.08]'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                isCharging
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                  : isDischarging
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-500'
                  : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.08] text-slate-400'
              }`}>
                {isCharging ? (
                  <BatteryCharging className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Battery className={`w-4 h-4 ${isDischarging ? 'text-rose-500' : 'text-slate-400'}`} />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isEn ? 'Battery' : 'Акумулятор'}{' '}
                  <span className="font-mono text-[10px] font-semibold text-slate-400">
                    ({batteryModel})
                  </span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {batteryVoltage} {unitV} • {isCharging ? `+${batteryCurrent}` : isDischarging ? `-${batteryCurrent}` : '0.0'} A
                </span>
              </div>
            </div>

            {/* State badge with leading space */}
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${
              isCharging
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : isDischarging
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.05] dark:border-white/[0.08]'
            }`}>
              {isCharging ? (isEn ? 'CHARGE' : 'ЗАРЯД') : isDischarging ? (isEn ? 'DISCHARGE' : 'РОЗРЯД') : (isEn ? 'IDLE' : 'СПОКІЙ')}
            </span>
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-white/[0.05]">
            <div className="flex items-baseline gap-1.5">
              <span className={`font-mono text-xl font-extrabold ${
                isCharging ? 'text-emerald-500' : isDischarging ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {soc}%
              </span>
              <span className={`font-mono text-xs font-bold ${
                isCharging ? 'text-emerald-500' : isDischarging ? 'text-rose-500' : 'text-slate-400'
              }`}>
                {isCharging ? `+${absBattPower}` : isDischarging ? `-${absBattPower}` : '0'} {unitW}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
              {isCharging ? (
                <span className="text-emerald-500 flex items-center gap-0.5 font-semibold">
                  <ArrowDown className="w-3 h-3 text-emerald-500" /> {isEn ? 'Charging' : 'Заряджання'}
                </span>
              ) : isDischarging ? (
                <span className="text-rose-500 flex items-center gap-0.5 font-semibold">
                  <ArrowUp className="w-3 h-3 text-rose-500" /> {isEn ? 'Discharging' : 'Розряджання'}
                </span>
              ) : (
                <span>{isEn ? 'Standby' : 'У спокої'}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200/40 dark:border-white/[0.04] text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span title={isEn ? `Avg: ${avgCycles} cycles` : `Сер.: ${avgCycles} циклів`}>
              B1: <strong className="text-slate-700 dark:text-slate-200">{bat1Cycles}</strong> / B2: <strong className="text-slate-700 dark:text-slate-200">{bat2Cycles}</strong> {isEn ? 'cycles' : 'циклів'}
            </span>
            <span title={`B1: ${bat1Soh}% • B2: ${bat2Soh}%`}>
              SOH: <strong className="text-slate-700 dark:text-slate-200">{avgSoh}%</strong>{' '}
              <span className="text-[9px] text-slate-400">({bat1Soh}% / {bat2Soh}%)</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
