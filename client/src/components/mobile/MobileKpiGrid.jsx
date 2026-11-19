import React from 'react';
import { Home, Battery, BatteryCharging, Zap, Cpu, Flame, Clock } from 'lucide-react';
import { translations } from '../../utils/i18n';
import { formatDurationHuman } from '../../utils/energyMath';

/**
 * MobileKpiGrid
 * Compact 2x2 telemetry metric grid designed for mobile screens,
 * supporting EN and UK localizations with unified semantic colors:
 * - Card 1: Operating Uptime (Battery vs Grid) with real-time timer
 * - Card 2: Battery (Emerald charging, Rose discharging)
 * - Card 3: Grid Import (Rose import, Emerald bypass/normal)
 * - Card 4: Inverter Losses (Purple)
 */
export default function MobileKpiGrid({
  homeLoad = 0,
  isGridOnline = true,
  dailyHomeCons = '0',
  currentUptimeSec = 0,
  estimatedRemainingSec = null,
  totalBatterySec = 0,
  totalGridSec = 0,
  soc = '0',
  battCharge = 0,
  battDischarge = 0,
  timeToFullChargeSec = null,
  dailyChg = '0',
  dailyDisChg = '0',
  gridImport = 0,
  gridVoltage = 220,
  gridFrequency = 50,
  dailyGridImport = '0',
  currentInverterLoss = 0,
  inverterTemp = '--',
  lang = 'uk',
}) {
  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';
  const unitV = isEn ? 'V' : 'В';
  const unitHz = isEn ? 'Hz' : 'Гц';

  const isCharging = battCharge > 0;
  const isDischarging = battDischarge > 0;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* Card 1: Power Source Uptime Timer */}
      <div className={`flex flex-col justify-between p-3.5 bg-white dark:bg-[#1c1f2a] rounded-xl border shadow-sm relative overflow-hidden transition-colors ${
        isGridOnline ? 'border-emerald-500/25' : 'border-amber-500/30'
      }`}>
        <div className={`absolute -right-3 -top-3 w-14 h-14 rounded-full blur-xl pointer-events-none ${
          isGridOnline ? 'bg-emerald-500/10' : 'bg-amber-500/10'
        }`} />
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {isGridOnline ? t.gridUptime : t.batteryUptime}
          </span>
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
            isGridOnline
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/15 text-amber-500'
          }`}>
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="my-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className={`font-mono text-xl font-bold tracking-tight font-tabular ${
              isGridOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
            }`}>
              {formatDurationHuman(currentUptimeSec, isEn, true)}
            </span>
            {!isGridOnline && estimatedRemainingSec !== null && (
              <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                ~{formatDurationHuman(estimatedRemainingSec, isEn, false)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>{isEn ? '24h Bat' : 'АКБ за добу'}:</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {formatDurationHuman(totalBatterySec, isEn, false)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>{isEn ? '24h Grid' : 'Мережа за добу'}:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatDurationHuman(totalGridSec, isEn, false)}
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Battery - Emerald (charging) or Rose (discharging) */}
      <div className="flex flex-col justify-between p-3.5 bg-white dark:bg-[#1c1f2a] rounded-xl border border-slate-200/80 dark:border-white/[0.06] shadow-sm relative overflow-hidden transition-colors">
        <div className={`absolute -right-3 -top-3 w-14 h-14 rounded-full blur-xl pointer-events-none ${
          isCharging ? 'bg-emerald-500/10' : isDischarging ? 'bg-rose-500/10' : 'bg-slate-500/10'
        }`} />
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {t.kpiBattery}
          </span>
          {isCharging && timeToFullChargeSec !== null ? (
            <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
              ~{formatDurationHuman(timeToFullChargeSec, isEn, false)}
            </span>
          ) : (
            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
              isCharging
                ? 'bg-emerald-500/15 text-emerald-500'
                : isDischarging
                ? 'bg-rose-500/15 text-rose-500'
                : 'bg-slate-100 dark:bg-white/[0.08] text-slate-400'
            }`}>
              {isCharging ? (
                <BatteryCharging className="w-3.5 h-3.5" />
              ) : (
                <Battery className="w-3.5 h-3.5" />
              )}
            </div>
          )}
        </div>
        <div className="my-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-baseline gap-1">
              <span className={`font-mono text-2xl font-bold font-tabular ${
                isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {soc}%
              </span>
              <span className={`font-mono text-[10px] font-semibold truncate ${
                isCharging ? 'text-emerald-600 dark:text-emerald-400' : isDischarging ? 'text-rose-500' : 'text-slate-400'
              }`}>
                {battCharge > 0 ? `+${battCharge} ${unitW}` : (battDischarge > 0 ? `-${battDischarge} ${unitW}` : `0 ${unitW}`)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
          <span className="text-[9px] font-mono text-slate-400 uppercase truncate">{t.chargeDischarge}</span>
          <span className="font-mono text-[10px] text-slate-700 dark:text-slate-200 tracking-tight">
            +{dailyChg} / -{dailyDisChg} {unitKwh}
          </span>
        </div>
      </div>

      {/* Card 3: Grid Import - Rose (#f43f5e) */}
      <div className="flex flex-col justify-between p-3.5 bg-white dark:bg-[#1c1f2a] rounded-xl border border-slate-200/80 dark:border-white/[0.06] shadow-sm relative overflow-hidden transition-colors">
        <div className="absolute -right-3 -top-3 w-14 h-14 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {t.kpiGridImport}
          </span>
          <div className="w-6 h-6 rounded-md bg-rose-500/15 flex items-center justify-center text-rose-500">
            <Zap className="w-3.5 h-3.5 text-rose-500" />
          </div>
        </div>
        <div className="my-1.5">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400 font-tabular">
              {gridImport}
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{unitW}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${isGridOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="truncate">{isGridOnline ? `${gridVoltage} ${unitV} • ${gridFrequency} ${unitHz}` : t.gridOffline}</span>
          </div>
          <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
            {t.dayTotal}: {dailyGridImport} {unitKwh}
          </span>
        </div>
      </div>

      {/* Card 4: Inverter / Losses - Purple (#a855f7) */}
      <div className="flex flex-col justify-between p-3.5 bg-white dark:bg-[#1c1f2a] rounded-xl border border-slate-200/80 dark:border-white/[0.06] shadow-sm relative overflow-hidden transition-colors">
        <div className="absolute -right-3 -top-3 w-14 h-14 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
            {t.kpiInverterLoss}
          </span>
          <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-500">
            <Cpu className="w-3.5 h-3.5 text-purple-500" />
          </div>
        </div>
        <div className="my-1.5">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-purple-600 dark:text-purple-400 font-tabular">
              ~{currentInverterLoss}
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{unitW}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.05]">
          <div className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
            <Flame className="w-3 h-3 text-rose-500" />
            <span>{inverterTemp !== '--' ? `${inverterTemp}°C` : '--'}</span>
          </div>
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {isGridOnline ? t.bypassCharging : t.epsMode}
          </span>
        </div>
      </div>
    </div>
  );
}
