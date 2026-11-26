/**
 * Utility functions for energy calculations, normalization, and interval integrations.
 */

export const BMS_CUTOFF_SOC = 15;

/**
 * Converts raw BMS State of Charge (0-100%) to user-facing usable percentage (0-100%),
 * where 0% corresponds to BMS cutoff (15%) and 100% corresponds to full charge (100%).
 */
export function calculateUsableSocPercent(rawSoc, cutoffSoc = BMS_CUTOFF_SOC) {
  const socNum = Math.max(0, Math.min(100, parseFloat(String(rawSoc ?? 0).replace('%', '')) || 0));
  const usableRange = 100 - cutoffSoc;
  if (usableRange <= 0) return Math.round(socNum);
  return Math.max(0, Math.min(100, Math.round(((socNum - cutoffSoc) / usableRange) * 100)));
}

export function parseInverterPoint(point) {
  if (!point) return null;

  const solarPv = Math.max(0, parseFloat(point.solarPv) || 0);
  
  // In dayMultiLine API: gridPower < 0 means import from grid, > 0 means export
  const rawGrid = parseFloat(point.gridPower) || 0;
  const gridImport = Math.max(0, -rawGrid);

  // In dayMultiLine API: batteryDischarging > 0 means discharge, < 0 means charge
  const rawBatt = parseFloat(point.batteryDischarging) || 0;
  const batteryDischarge = Math.max(0, rawBatt);
  const batteryCharge = Math.max(0, -rawBatt);

  // Home consumption
  const consumption = Math.max(0, parseFloat(point.consumption) || 0);

  // Inverter self consumption (losses)
  // Input: gridImport + solarPv + batteryDischarge
  // Output: consumption + batteryCharge
  const inputPower = gridImport + solarPv + batteryDischarge;
  const outputPower = consumption + batteryCharge;
  const inverterLoss = Math.max(0, Math.round(inputPower - outputPower));

  const soc = parseFloat(point.soc) || 0;

  return {
    time: point.time,
    solarPv,
    gridImport,
    batteryDischarge,
    batteryCharge,
    batteryPowerNet: rawBatt, // >0 discharge, <0 charge
    consumption,
    inverterLoss,
    soc,
  };
}

/**
 * Dual-tariff pricing constants (Ukraine UAH):
 * - Night rate (23:00 - 06:59): 2.16 UAH/kWh
 * - Day rate (07:00 - 22:59): 4.32 UAH/kWh
 */
export const TARIFF_NIGHT_UAH = 2.16;
export const TARIFF_DAY_UAH = 4.32;

export function isNightTariff(dateObj) {
  const h = dateObj.getHours();
  // 23:00 - 06:59 (hours 23, 0, 1, 2, 3, 4, 5, 6)
  return h >= 23 || h < 7;
}

/**
 * Numerically integrate a power series (in Watts) across timestamps to get energy in kWh,
 * and cost in UAH split by day and night tariffs.
 * Uses trapezoidal rule based on time deltas in hours.
 */
export function integrateEnergy(points) {
  if (!points || points.length < 2) {
    return {
      gridImportKwh: 0,
      consumptionKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
      inverterLossKwh: 0,
      solarPvKwh: 0,
      durationHours: 0,
      // Tariff breakdown for Grid Import
      gridNightKwh: 0,
      gridDayKwh: 0,
      costNightUah: 0,
      costDayUah: 0,
      costTotalUah: 0,
      // Cost of Inverter Consumption
      inverterLossNightKwh: 0,
      inverterLossDayKwh: 0,
      inverterCostTotalUah: 0,
    };
  }

  // Normalize points if raw telemetry points were passed directly
  const normPoints = points.map((p) => {
    if (!p) return null;
    if (
      p.gridImport !== undefined &&
      p.consumption !== undefined &&
      p.batteryDischarge !== undefined &&
      p.batteryCharge !== undefined
    ) {
      return p;
    }
    return parseInverterPoint(p);
  }).filter(Boolean);

  if (normPoints.length < 2) {
    return {
      gridImportKwh: 0,
      consumptionKwh: 0,
      batteryChargeKwh: 0,
      batteryDischargeKwh: 0,
      inverterLossKwh: 0,
      solarPvKwh: 0,
      durationHours: 0,
      gridNightKwh: 0,
      gridDayKwh: 0,
      costNightUah: 0,
      costDayUah: 0,
      costTotalUah: 0,
      inverterLossNightKwh: 0,
      inverterLossDayKwh: 0,
      inverterCostTotalUah: 0,
    };
  }

  let gridImportKwh = 0;
  let consumptionKwh = 0;
  let batteryChargeKwh = 0;
  let batteryDischargeKwh = 0;
  let inverterLossKwh = 0;
  let solarPvKwh = 0;

  let gridNightKwh = 0;
  let gridDayKwh = 0;
  let inverterLossNightKwh = 0;
  let inverterLossDayKwh = 0;

  let totalSeconds = 0;

  for (let i = 0; i < normPoints.length - 1; i++) {
    const p1 = normPoints[i];
    const p2 = normPoints[i + 1];

    const d1 = new Date(p1.time.replace(/-/g, '/'));
    const d2 = new Date(p2.time.replace(/-/g, '/'));
    const t1 = d1.getTime();
    const t2 = d2.getTime();
    const dtSeconds = Math.max(0, (t2 - t1) / 1000);

    // If gap between points is more than 30 mins (e.g. data outage), cap or treat as 6 mins
    const validDeltaSec = dtSeconds > 1800 ? 360 : dtSeconds;
    const dtHours = validDeltaSec / 3600;
    totalSeconds += validDeltaSec;

    const segGrid = (((p1.gridImport + p2.gridImport) / 2) * dtHours) / 1000;
    const segCons = (((p1.consumption + p2.consumption) / 2) * dtHours) / 1000;
    const segChg = (((p1.batteryCharge + p2.batteryCharge) / 2) * dtHours) / 1000;
    const segDis = (((p1.batteryDischarge + p2.batteryDischarge) / 2) * dtHours) / 1000;
    const segLoss = (((p1.inverterLoss + p2.inverterLoss) / 2) * dtHours) / 1000;
    const segSolar = (((p1.solarPv + p2.solarPv) / 2) * dtHours) / 1000;

    gridImportKwh += segGrid;
    consumptionKwh += segCons;
    batteryChargeKwh += segChg;
    batteryDischargeKwh += segDis;
    inverterLossKwh += segLoss;
    solarPvKwh += segSolar;

    // Tariff calculation based on segment midpoint time
    const midDate = new Date(t1 + (validDeltaSec * 1000) / 2);
    if (isNightTariff(midDate)) {
      gridNightKwh += segGrid;
      inverterLossNightKwh += segLoss;
    } else {
      gridDayKwh += segGrid;
      inverterLossDayKwh += segLoss;
    }
  }

  const costNightUah = gridNightKwh * TARIFF_NIGHT_UAH;
  const costDayUah = gridDayKwh * TARIFF_DAY_UAH;
  const costTotalUah = costNightUah + costDayUah;

  const inverterCostTotalUah =
    inverterLossNightKwh * TARIFF_NIGHT_UAH + inverterLossDayKwh * TARIFF_DAY_UAH;

  return {
    gridImportKwh: parseFloat(gridImportKwh.toFixed(2)),
    consumptionKwh: parseFloat(consumptionKwh.toFixed(2)),
    batteryChargeKwh: parseFloat(batteryChargeKwh.toFixed(2)),
    batteryDischargeKwh: parseFloat(batteryDischargeKwh.toFixed(2)),
    inverterLossKwh: parseFloat(inverterLossKwh.toFixed(2)),
    solarPvKwh: parseFloat(solarPvKwh.toFixed(2)),
    durationHours: parseFloat((totalSeconds / 3600).toFixed(1)),
    // Tariff stats
    gridNightKwh: parseFloat(gridNightKwh.toFixed(2)),
    gridDayKwh: parseFloat(gridDayKwh.toFixed(2)),
    costNightUah: parseFloat(costNightUah.toFixed(2)),
    costDayUah: parseFloat(costDayUah.toFixed(2)),
    costTotalUah: parseFloat(costTotalUah.toFixed(2)),
    // Inverter consumption cost
    inverterLossNightKwh: parseFloat(inverterLossNightKwh.toFixed(2)),
    inverterLossDayKwh: parseFloat(inverterLossDayKwh.toFixed(2)),
    inverterCostTotalUah: parseFloat(inverterCostTotalUah.toFixed(2)),
  };
}

/**
 * Normalizes live / table inverter voltage and frequency
 */
export function normalizeGridAndEps(liveData, latestRow) {
  // Live vacr / fac often have scale 10 / 100 (e.g. 2219 -> 221.9V, 5000 -> 50.0Hz)
  let vac = 0;
  let fac = 0;
  let isGridOnline = false;

  if (liveData) {
    const rawVacr = parseFloat(liveData.vacr) || 0;
    const rawVepsr = parseFloat(liveData.vepsr) || 0;
    const rawFac = parseFloat(liveData.fac) || 0;
    const rawFeps = parseFloat(liveData.feps) || 0;

    if (rawVacr > 500) {
      // Scale 10
      vac = rawVacr / 10;
      fac = rawFac > 1000 ? rawFac / 100 : rawFac;
      isGridOnline = true;
    } else if (rawVacr > 50) {
      // Standard scale
      vac = rawVacr;
      fac = rawFac;
      isGridOnline = true;
    } else if (rawVepsr > 0) {
      // Off-grid EPS mode
      vac = rawVepsr > 500 ? rawVepsr / 10 : rawVepsr;
      fac = rawFeps > 1000 ? rawFeps / 100 : rawFeps;
      isGridOnline = false;
    }
  } else if (latestRow) {
    const rowVac = parseFloat(latestRow.vacr) || 0;
    const rowVeps = parseFloat(latestRow.vepsr) || 0;
    const rowFac = parseFloat(latestRow.fac) || 0;
    const rowFeps = parseFloat(latestRow.feps) || 0;

    if (rowVac > 50) {
      vac = rowVac;
      fac = rowFac;
      isGridOnline = true;
    } else {
      vac = rowVeps || 0;
      fac = rowFeps || 0;
      isGridOnline = false;
    }
  }

  return {
    voltage: vac > 0 ? vac.toFixed(1) : '0.0',
    frequency: fac > 0 ? fac.toFixed(1) : '0.0',
    isGridOnline,
  };
}

/**
 * Calculates current operating mode duration, daily totals (battery vs grid),
 * and estimated remaining runtime on battery based on average discharge/consumption during the outage.
 */
export function calculatePowerSourceDurations(tableRows, isCurrentGridOnline, currentSoc = null, totalCapacityWh = 7680) {
  if (!tableRows || !tableRows.length) {
    return {
      currentModeSince: null,
      currentModeDurationSec: 0,
      totalBatterySec: 0,
      totalGridSec: 0,
      estimatedRemainingSec: null,
      avgConsumptionDuringOutage: 0,
    };
  }

  // 1. Current streak duration & rows (newest to oldest)
  let currentStreakSec = 0;
  let streakStartTime = null;
  const streakRows = [];

  for (let i = 0; i < tableRows.length; i++) {
    const row = tableRows[i];
    const isGrid = (parseFloat(row.vacr) || 0) > 50;

    if (isGrid === isCurrentGridOnline) {
      streakStartTime = row.time;
      streakRows.push(row);
    } else {
      break;
    }
  }

  if (streakStartTime) {
    const tStart = new Date(streakStartTime.replace(/-/g, '/')).getTime();
    const tLatest = new Date(tableRows[0].time.replace(/-/g, '/')).getTime();
    currentStreakSec = Math.max(0, Math.floor((tLatest - tStart) / 1000));
  }

  // 2. Total daily durations (oldest to newest)
  const sorted = [...tableRows].sort((a, b) => {
    return new Date(a.time.replace(/-/g, '/')).getTime() - new Date(b.time.replace(/-/g, '/')).getTime();
  });

  let totalBatterySec = 0;
  let totalGridSec = 0;

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const isGrid = (parseFloat(r.vacr) || 0) > 50;

    let dt = 360; // 6 mins default sample interval
    if (i < sorted.length - 1) {
      const t1 = new Date(r.time.replace(/-/g, '/')).getTime();
      const t2 = new Date(sorted[i + 1].time.replace(/-/g, '/')).getTime();
      const diff = Math.floor((t2 - t1) / 1000);
      if (diff > 0 && diff <= 1800) {
        dt = diff;
      }
    }

    if (isGrid) {
      totalGridSec += dt;
    } else {
      totalBatterySec += dt;
    }
  }

  // 3. Estimated remaining battery runtime if currently offline (on battery)
  let estimatedRemainingSec = null;
  let avgConsumptionDuringOutage = 0;

  if (!isCurrentGridOnline && streakRows.length > 0) {
    // Average discharge / load power during the outage streak (Watts)
    let sumDischarge = 0;
    streakRows.forEach((r) => {
      const pDis = parseFloat(r.pDisCharge) || parseFloat(r.peps) || parseFloat(r.pLoad) || 0;
      sumDischarge += pDis;
    });
    avgConsumptionDuringOutage = Math.round(sumDischarge / streakRows.length);

    // Current SOC value
    const latestSocNum = currentSoc !== null
      ? parseFloat(String(currentSoc).replace('%', ''))
      : parseFloat(String(streakRows[0].soc || '0').replace('%', ''));

    // BMS Cutoff threshold: battery shuts down at 15% SOC
    const BMS_CUTOFF_SOC = 15;
    const usableSoc = Math.max(0, latestSocNum - BMS_CUTOFF_SOC);

    // Check SOC at start of outage
    const oldestStreakRow = streakRows[streakRows.length - 1];
    const startSocNum = parseFloat(String(oldestStreakRow.soc || '100').replace('%', ''));
    const socDelta = startSocNum - latestSocNum;
    const elapsedHours = currentStreakSec / 3600;

    if (usableSoc <= 0) {
      estimatedRemainingSec = 0;
    } else if (elapsedHours > 0.2 && socDelta > 1) {
      // Approach A: Observed burn rate (% SOC consumed per hour)
      const burnRatePerHour = socDelta / elapsedHours;
      const hoursRemaining = burnRatePerHour > 0 ? usableSoc / burnRatePerHour : 0;
      estimatedRemainingSec = Math.round(hoursRemaining * 3600);
    } else if (avgConsumptionDuringOutage > 0) {
      // Approach B: Capacity energy model (nominal 51.2V 150Ah ~ 7.68kWh)
      const remainingWh = (usableSoc / 100) * totalCapacityWh;
      const hoursRemaining = remainingWh / avgConsumptionDuringOutage;
      estimatedRemainingSec = Math.round(hoursRemaining * 3600);
    }
  }

  return {
    currentModeSince: streakStartTime,
    currentModeDurationSec: currentStreakSec,
    totalBatterySec,
    totalGridSec,
    estimatedRemainingSec,
    avgConsumptionDuringOutage,
  };
}

/**
 * Calculates estimated time until battery is fully charged (100% SOC) in seconds.
 * 
 * Accounts for 2-stage charging curve observed in Luxpower BMS:
 * - Stage 1 (SOC < 85%): Constant Current / Bulk charge (~1500W or current charge power)
 * - Stage 2 (SOC >= 85%): Absorption charge where BMS limits current (~1000W or ~66% of bulk power)
 * 
 * @param {number} currentSoc Current state of charge (0-100)
 * @param {number} currentChargePower Watts being delivered to battery (positive)
 * @param {number} totalCapacityWh Total battery capacity in Watt-hours (default 7680 Wh for 51.2V 150Ah)
 * @returns {number|null} Estimated seconds until full, or null if not charging / full
 */
export function calculateTimeToFullCharge(currentSoc, currentChargePower, totalCapacityWh = 7680) {
  const soc = parseFloat(String(currentSoc).replace('%', '')) || 0;
  const pChg = parseFloat(currentChargePower) || 0;

  if (soc >= 100 || pChg < 50) {
    return null;
  }

  // Energy needed from current SOC to 85%
  const targetBulkSoc = 85;
  let secondsStage1 = 0;
  let secondsStage2 = 0;

  if (soc < targetBulkSoc) {
    const deltaSoc1 = targetBulkSoc - soc;
    const whStage1 = (deltaSoc1 / 100) * totalCapacityWh;
    // In bulk stage, use current measured charge power (or minimum 1000W if ramp-up)
    const effectivePowerStage1 = Math.max(1000, pChg);
    secondsStage1 = (whStage1 / effectivePowerStage1) * 3600;

    // From 85% to 100% (15% SOC), power drops to ~1000W (or 2/3 of bulk power)
    const whStage2 = (15 / 100) * totalCapacityWh;
    const effectivePowerStage2 = Math.min(1000, Math.max(500, effectivePowerStage1 * 0.66));
    secondsStage2 = (whStage2 / effectivePowerStage2) * 3600;
  } else {
    // Already in absorption stage (>= 85%)
    const deltaSoc2 = Math.max(0, 100 - soc);
    const whStage2 = (deltaSoc2 / 100) * totalCapacityWh;
    const effectivePowerStage2 = Math.max(300, pChg);
    secondsStage2 = (whStage2 / effectivePowerStage2) * 3600;
  }

  const totalSec = Math.round(secondsStage1 + secondsStage2);
  return totalSec > 0 ? totalSec : null;
}

/**
 * Formats duration in seconds to "Xh Ym Zs" or "Xh Ym"
 */
export function formatDurationHuman(seconds, isEn = false, includeSeconds = true) {
  if (!seconds || seconds <= 0) {
    return includeSeconds ? `00:00:00` : `0${isEn ? 'h' : 'г'} 00${isEn ? 'm' : 'хв'}`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (includeSeconds) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  const hUnit = isEn ? 'h' : 'г';
  const mUnit = isEn ? 'm' : 'хв';
  return `${h}${hUnit} ${String(m).padStart(2, '0')}${mUnit}`;
}

/**
 * Calculates dynamic cycle counts and State of Health (SOH) for battery modules.
 *
 * - For the owner's 3× Dyness B4850 pack (when dongle telemetry is active and BMS cycle counter is 0),
 *   partitions cumulative discharge at 257.5 kWh (2026-02-14 15:24 expansion to 2×) and
 *   589.2 kWh (2026-11-24 19:42 expansion to 3×) between B1 (2025-11-16), B2 (2026-02-14), and B3 (2026-11-24).
 * - For any other user / cloud-only fallback, computes generic LiFePO4 pack cycles & SOH from
 *   bmsCycleCnt (when reported) or eDisChgAll / nominal pack energy (batCapacity * 48V).
 */
export function calculateBatteryHealth(latestRow, liveData, status = null) {
  const RATED_CYCLES_TO_80_SOH = 6000;
  const cycleLossPerCycle = 20 / RATED_CYCLES_TO_80_SOH;

  const bmsCycleReported = parseInt(liveData?.bmsCycleCnt ?? latestRow?.bmsCycleCnt, 10) || 0;
  const batParallel = String(liveData?.batParallelNum ?? status?.plant?.inverters?.[0]?.batParallelNum ?? '');
  const batCapacityStr = String(liveData?.batCapacity ?? '');
  const isOwnerDynessPack =
    liveData?.source === 'dongle' ||
    (!!status?.dongleEnabled &&
      bmsCycleReported === 0 &&
      (batParallel === '2' || batParallel === '3') &&
      (!batCapacityStr || batCapacityStr === '100' || batCapacityStr === '150'));

  if (isOwnerDynessPack) {
    const SOLO_DISCHARGE_KWH = 257.5;
    const DUAL_DISCHARGE_KWH = 589.2;
    const NOMINAL_MODULE_KWH = 2.4;
    const CALENDAR_AGING_PER_YEAR = 0.3;

    const parsedDisChg = parseFloat(liveData?.eDisChgAll ?? latestRow?.eDisChgAll);
    const parsedChg = parseFloat(liveData?.eChgAll ?? latestRow?.eChgAll);
    const totalDisChgKwh = Number.isFinite(parsedDisChg) && parsedDisChg > 0 ? parsedDisChg : 0;
    const totalChgKwh = Number.isFinite(parsedChg) && parsedChg > 0 ? parsedChg : 0;

    const soloKwh = Math.min(totalDisChgKwh, SOLO_DISCHARGE_KWH);
    const dualKwh = Math.max(0, Math.min(totalDisChgKwh, DUAL_DISCHARGE_KWH) - SOLO_DISCHARGE_KWH);
    const tripleKwh = Math.max(0, totalDisChgKwh - DUAL_DISCHARGE_KWH);

    const bat1Kwh = soloKwh + dualKwh / 2 + tripleKwh / 3;
    const bat2Kwh = dualKwh / 2 + tripleKwh / 3;
    const bat3Kwh = tripleKwh / 3;

    const bat1Cycles = Math.round(bat1Kwh / NOMINAL_MODULE_KWH);
    const bat2Cycles = Math.round(bat2Kwh / NOMINAL_MODULE_KWH);
    const bat3Cycles = Math.round(bat3Kwh / NOMINAL_MODULE_KWH);
    const avgCycles = Math.round((bat1Cycles + bat2Cycles + bat3Cycles) / 3);

    const refTimeStr = liveData?.deviceTime || latestRow?.time;
    const parsedRefMs = refTimeStr ? new Date(String(refTimeStr).replace(/-/g, '/')).getTime() : Date.now();
    const refMs = Number.isFinite(parsedRefMs) ? parsedRefMs : Date.now();

    const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
    const b1StartMs = new Date('2025/11/16 00:00:00').getTime();
    const b2StartMs = new Date('2026/02/14 15:24:00').getTime();
    const b3StartMs = new Date('2026/11/24 19:42:00').getTime();

    const b1Years = Math.max(0, (refMs - b1StartMs) / MS_PER_YEAR);
    const b2Years = Math.max(0, (refMs - b2StartMs) / MS_PER_YEAR);
    const b3Years = Math.max(0, (refMs - b3StartMs) / MS_PER_YEAR);

    const bat1SohNum = Math.max(0, Math.min(100, 100 - bat1Cycles * cycleLossPerCycle - b1Years * CALENDAR_AGING_PER_YEAR));
    const bat2SohNum = Math.max(0, Math.min(100, 100 - bat2Cycles * cycleLossPerCycle - b2Years * CALENDAR_AGING_PER_YEAR));
    const bat3SohNum = Math.max(0, Math.min(100, 100 - bat3Cycles * cycleLossPerCycle - b3Years * CALENDAR_AGING_PER_YEAR));
    const avgSohNum = (bat1SohNum + bat2SohNum + bat3SohNum) / 3;

    return {
      isSplitModules: true,
      model: '3× Dyness B4850',
      bat1Cycles,
      bat2Cycles,
      bat3Cycles,
      avgCycles,
      bat1Soh: bat1SohNum.toFixed(1),
      bat2Soh: bat2SohNum.toFixed(1),
      bat3Soh: bat3SohNum.toFixed(1),
      avgSoh: avgSohNum.toFixed(1),
      bat1Kwh: Number(bat1Kwh.toFixed(1)),
      bat2Kwh: Number(bat2Kwh.toFixed(1)),
      bat3Kwh: Number(bat3Kwh.toFixed(1)),
      totalDisChgKwh: Number(totalDisChgKwh.toFixed(1)),
      totalChgKwh: Number(totalChgKwh.toFixed(1)),
    };
  }

  const capacityAh = parseFloat(liveData?.batCapacity) || 150;
  const parallelNum = parseInt(batParallel, 10) || 1;
  const packKwh = (capacityAh * 48) / 1000;

  const parsedDisChg = parseFloat(liveData?.eDisChgAll ?? latestRow?.eDisChgAll);
  const parsedChg = parseFloat(liveData?.eChgAll ?? latestRow?.eChgAll);
  const totalDisChgKwh = Number.isFinite(parsedDisChg) && parsedDisChg > 0 ? parsedDisChg : 0;
  const totalChgKwh = Number.isFinite(parsedChg) && parsedChg > 0 ? parsedChg : 0;

  const avgCycles = bmsCycleReported > 0
    ? bmsCycleReported
    : (packKwh > 0 ? Math.round(totalDisChgKwh / packKwh) : 0);
  const sohNum = Math.max(0, Math.min(100, 100 - avgCycles * cycleLossPerCycle));

  return {
    isSplitModules: false,
    model: parallelNum > 1 ? `${parallelNum}× LiFePO4 (${capacityAh}Ah)` : `LiFePO4 (${capacityAh}Ah)`,
    bat1Cycles: avgCycles,
    bat2Cycles: 0,
    bat3Cycles: 0,
    avgCycles,
    bat1Soh: sohNum.toFixed(1),
    bat2Soh: sohNum.toFixed(1),
    bat3Soh: sohNum.toFixed(1),
    avgSoh: sohNum.toFixed(1),
    bat1Kwh: Number(totalDisChgKwh.toFixed(1)),
    bat2Kwh: 0,
    bat3Kwh: 0,
    totalDisChgKwh: Number(totalDisChgKwh.toFixed(1)),
    totalChgKwh: Number(totalChgKwh.toFixed(1)),
  };
}

/**
 * Parses a "YYYY-MM-DD HH:mm:ss" timestamp string into ms since epoch and seconds since midnight.
 */
function parseTimePoint(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const normalized = timeStr.trim().replace(/-/g, '/');
  const d = new Date(normalized);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;
  const secOfDay = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return { ms, secOfDay };
}

/**
 * Analyzes telemetry records (tableRows or day-chart points) to extract continuous
 * Battery (EPS/off-grid) vs Grid operating intervals and summary runtime metrics.
 */
export function analyzePowerSourceHistory(items, dateStr = '') {
  const emptyResult = {
    totalBatterySec: 0,
    totalGridSec: 0,
    totalTrackedSec: 0,
    batteryHours: 0,
    gridHours: 0,
    batterySharePct: 0,
    gridSharePct: 0,
    outagesCount: 0,
    significantOutagesCount: 0,
    longestBatterySec: 0,
    longestGridSec: 0,
    totalBatteryDischargeKwh: 0,
    totalBatteryChargeKwh: 0,
    totalGridImportKwh: 0,
    totalConsumptionKwh: 0,
    intervals: [],
  };

  if (!Array.isArray(items) || items.length === 0) {
    return emptyResult;
  }

  const parsedItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.time) continue;
    const tInfo = parseTimePoint(item.time);
    if (!tInfo) continue;

    let isGrid = false;
    if (item.vacr !== undefined) {
      isGrid = (parseFloat(item.vacr) || 0) > 50;
    } else if (item.gridPower !== undefined) {
      const gp = Math.abs(parseFloat(item.gridPower) || 0);
      const batRaw = parseFloat(item.batteryDischarging) || 0;
      const pv = parseFloat(item.solarPv) || 0;
      isGrid = gp > 0 || (batRaw < 0 && pv < Math.abs(batRaw));
    } else {
      const imp = parseFloat(item.gridImport ?? item.pToUser) || 0;
      const chg = parseFloat(item.batteryCharge ?? item.pCharge) || 0;
      const pv = parseFloat(item.solarPv ?? item.ppv) || 0;
      isGrid = imp > 0 || chg > pv;
    }

    let loadW = 0;
    if (item.consumption !== undefined) {
      loadW = Math.max(0, parseFloat(item.consumption) || 0);
    } else if (item.consumptionPower !== undefined && Number(item.consumptionPower) > 0) {
      loadW = Number(item.consumptionPower);
    } else {
      const epsW = parseFloat(item.peps) || 0;
      const directW = parseFloat(item.pLoad) || 0;
      loadW = Math.max(0, epsW > 0 ? epsW : directW);
    }

    let batDisW = 0;
    let batChgW = 0;
    if (item.batteryDischarging !== undefined) {
      const rawBatt = parseFloat(item.batteryDischarging) || 0;
      batDisW = Math.max(0, rawBatt);
      batChgW = Math.max(0, -rawBatt);
    } else if (item.batteryDischarge !== undefined || item.batteryCharge !== undefined) {
      batDisW = Math.max(0, parseFloat(item.batteryDischarge) || 0);
      batChgW = Math.max(0, parseFloat(item.batteryCharge) || 0);
    } else {
      batDisW = Math.max(0, parseFloat(item.pDisCharge) || 0);
      batChgW = Math.max(0, parseFloat(item.pCharge) || 0);
    }

    let gridW = 0;
    if (item.gridPower !== undefined) {
      gridW = Math.max(0, -(parseFloat(item.gridPower) || 0));
    } else if (item.gridImport !== undefined) {
      gridW = Math.max(0, parseFloat(item.gridImport) || 0);
    } else {
      gridW = Math.max(0, parseFloat(item.pToUser) || 0);
    }

    const soc = parseFloat(String(item.soc ?? 0).replace('%', '')) || 0;

    parsedItems.push({
      time: item.time,
      ms: tInfo.ms,
      secOfDay: tInfo.secOfDay,
      mode: isGrid ? 'grid' : 'battery',
      loadW,
      batDisW,
      batChgW,
      gridW,
      soc,
    });
  }

  if (parsedItems.length === 0) {
    return emptyResult;
  }

  parsedItems.sort((a, b) => a.ms - b.ms);

  const rawGroups = [];
  for (let i = 0; i < parsedItems.length; i++) {
    const curr = parsedItems[i];
    const next = i < parsedItems.length - 1 ? parsedItems[i + 1] : null;

    let dtSec = 360;
    let hasValidNext = false;
    if (next) {
      const diff = Math.floor((next.ms - curr.ms) / 1000);
      if (diff > 0 && diff <= 1800) {
        dtSec = diff;
        hasValidNext = true;
      }
    }

    const dtHours = dtSec / 3600;
    const segLoadW = hasValidNext ? (curr.loadW + next.loadW) / 2 : curr.loadW;
    const segBatDisW = hasValidNext ? (curr.batDisW + next.batDisW) / 2 : curr.batDisW;
    const segBatChgW = hasValidNext ? (curr.batChgW + next.batChgW) / 2 : curr.batChgW;
    const segGridW = hasValidNext ? (curr.gridW + next.gridW) / 2 : curr.gridW;

    const segConsKwh = (segLoadW * dtHours) / 1000;
    const segDisKwh = (segBatDisW * dtHours) / 1000;
    const segChgKwh = (segBatChgW * dtHours) / 1000;
    const segGridKwh = (segGridW * dtHours) / 1000;

    const lastGroup = rawGroups[rawGroups.length - 1];
    if (!lastGroup || lastGroup.mode !== curr.mode) {
      rawGroups.push({
        mode: curr.mode,
        startTime: curr.time,
        startSecOfDay: curr.secOfDay,
        endTime: next ? next.time : curr.time,
        endSoc: next ? next.soc : curr.soc,
        startSoc: curr.soc,
        durationSec: dtSec,
        sumLoadWeighted: curr.loadW * dtSec,
        maxLoadW: curr.loadW,
        batteryDischargeKwh: segDisKwh,
        batteryChargeKwh: segChgKwh,
        gridImportKwh: segGridKwh,
        consumptionKwh: segConsKwh,
      });
    } else {
      lastGroup.endTime = next ? next.time : curr.time;
      lastGroup.endSoc = next ? next.soc : curr.soc;
      lastGroup.durationSec += dtSec;
      lastGroup.sumLoadWeighted += curr.loadW * dtSec;
      if (curr.loadW > lastGroup.maxLoadW) {
        lastGroup.maxLoadW = curr.loadW;
      }
      lastGroup.batteryDischargeKwh += segDisKwh;
      lastGroup.batteryChargeKwh += segChgKwh;
      lastGroup.gridImportKwh += segGridKwh;
      lastGroup.consumptionKwh += segConsKwh;
    }
  }

  let totalBatterySec = 0;
  let totalGridSec = 0;
  let outagesCount = 0;
  let significantOutagesCount = 0;
  let longestBatterySec = 0;
  let longestGridSec = 0;
  let totalBatteryDischargeKwh = 0;
  let totalBatteryChargeKwh = 0;
  let totalGridImportKwh = 0;
  let totalConsumptionKwh = 0;

  const intervals = rawGroups.map((g) => {
    const startPct = Math.max(0, Math.min(100, (g.startSecOfDay / 86400) * 100));
    const widthPct = Math.max(0, Math.min(100 - startPct, (g.durationSec / 86400) * 100));
    const avgLoadW = g.durationSec > 0 ? Math.round(g.sumLoadWeighted / g.durationSec) : 0;
    const startSoc = Math.round(g.startSoc);
    const endSoc = Math.round(g.endSoc);

    if (g.mode === 'battery') {
      totalBatterySec += g.durationSec;
      outagesCount += 1;
      if (g.durationSec >= 300) {
        significantOutagesCount += 1;
      }
      if (g.durationSec > longestBatterySec) {
        longestBatterySec = g.durationSec;
      }
    } else {
      totalGridSec += g.durationSec;
      if (g.durationSec > longestGridSec) {
        longestGridSec = g.durationSec;
      }
    }

    totalBatteryDischargeKwh += g.batteryDischargeKwh;
    totalBatteryChargeKwh += g.batteryChargeKwh;
    totalGridImportKwh += g.gridImportKwh;
    totalConsumptionKwh += g.consumptionKwh;

    return {
      date: dateStr || String(g.startTime).slice(0, 10),
      mode: g.mode,
      startTime: g.startTime,
      endTime: g.endTime,
      startPct: Number(startPct.toFixed(3)),
      widthPct: Number(widthPct.toFixed(3)),
      durationSec: g.durationSec,
      startSoc,
      endSoc,
      socDelta: endSoc - startSoc,
      avgLoadW,
      maxLoadW: Math.round(g.maxLoadW),
      batteryDischargeKwh: parseFloat(g.batteryDischargeKwh.toFixed(2)),
      batteryChargeKwh: parseFloat(g.batteryChargeKwh.toFixed(2)),
      gridImportKwh: parseFloat(g.gridImportKwh.toFixed(2)),
      consumptionKwh: parseFloat(g.consumptionKwh.toFixed(2)),
    };
  });

  const totalTrackedSec = totalBatterySec + totalGridSec;
  const batterySharePct = totalTrackedSec > 0 ? Math.round((totalBatterySec / totalTrackedSec) * 100) : 0;
  const gridSharePct = totalTrackedSec > 0 ? 100 - batterySharePct : 0;

  return {
    totalBatterySec,
    totalGridSec,
    totalTrackedSec,
    batteryHours: parseFloat((totalBatterySec / 3600).toFixed(2)),
    gridHours: parseFloat((totalGridSec / 3600).toFixed(2)),
    batterySharePct,
    gridSharePct,
    outagesCount,
    significantOutagesCount,
    longestBatterySec,
    longestGridSec,
    totalBatteryDischargeKwh: parseFloat(totalBatteryDischargeKwh.toFixed(2)),
    totalBatteryChargeKwh: parseFloat(totalBatteryChargeKwh.toFixed(2)),
    totalGridImportKwh: parseFloat(totalGridImportKwh.toFixed(2)),
    totalConsumptionKwh: parseFloat(totalConsumptionKwh.toFixed(2)),
    intervals,
  };
}
