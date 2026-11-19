import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Activity,
  Clock,
  Cpu,
  Flame,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Home,
  Battery,
  Zap,
  Bolt,
  Info,
  Menu,
  X,
  Share2,
  BatteryCharging,
  Radio,
  Table2,
  Lock,
  UserCheck
} from 'lucide-react';
import PowerFlowChart from './components/PowerFlowChart';
import BatteryChart from './components/BatteryChart';
import GridVoltageTempChart from './components/GridVoltageTempChart';
import DataTable from './components/DataTable';
import PowerFlowDiagram from './components/PowerFlowDiagram';
import MobileKpiGrid from './components/mobile/MobileKpiGrid';
import MobileRecentLog from './components/mobile/MobileRecentLog';
import MobilePowerFlowDiagram from './components/mobile/MobilePowerFlowDiagram';
import AuthModal from './components/AuthModal';
import PeriodOverview from './components/PeriodOverview';
import DatePicker from './components/DatePicker';
import { getCachedDayChart, setCachedDayChart, runWithConcurrency, isPastDate, cleanupLegacyLocalStorage } from './utils/telemetryCache';
import { translations } from './utils/i18n';
import { apiFetch } from './utils/config';
import {
  parseLocalDate,
  toDateStr,
  getTodayLocalDate,
  formatDateHuman,
} from './utils/dateFormat';
import {
  parseInverterPoint,
  integrateEnergy,
  normalizeGridAndEps,
  calculatePowerSourceDurations,
  calculateTimeToFullCharge,
  calculateBatteryHealth,
  formatDurationHuman
} from './utils/energyMath';

// Formats "2026-11-16 14:05:49" or "14:05:49" to "14:05" (without seconds)
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

// Generate an array of YYYY-MM-DD date strings between start and end (inclusive, chronological) in local time
function getDateRangeArray(startDateStr, endDateStr) {
  const dates = [];
  const curr = parseLocalDate(startDateStr);
  const end = parseLocalDate(endDateStr);
  if (!curr || !end) return dates;

  while (curr <= end) {
    dates.push(toDateStr(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// Compute period range anchored to today for 7d (1w) and current month (1m)
function calculatePeriodDates(mode) {
  const todayStr = getTodayLocalDate();
  const todayObj = parseLocalDate(todayStr) || new Date();

  if (mode === '7d') {
    const start = new Date(todayObj);
    start.setDate(start.getDate() - 6);
    return { start: toDateStr(start), end: todayStr };
  } else if (mode === 'month') {
    const start = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
    return { start: toDateStr(start), end: todayStr };
  }
  return { start: todayStr, end: todayStr };
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDate);
  const [periodMode, setPeriodMode] = useState('1d'); // '1d' | '7d' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState(() => {
    const today = getTodayLocalDate();
    const d = parseLocalDate(today) || new Date();
    d.setDate(d.getDate() - 6);
    return {
      start: toDateStr(d),
      end: today,
    };
  });
  const [periodStats, setPeriodStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Theme management: default to dark as in redesign
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('luxpower-theme');
    return saved !== 'light';
  });

  // Language management: 'uk' (default) or 'en'
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('luxpower-lang');
    return saved === 'uk' ? 'uk' : 'en';
  });

  const t = translations[lang] || translations.uk;
  const isEn = lang === 'en';
  const unitW = isEn ? 'W' : 'Вт';
  const unitKwh = isEn ? 'kWh' : 'кВт·год';
  const unitV = isEn ? 'V' : 'В';
  const unitHz = isEn ? 'Hz' : 'Гц';

  const toggleLang = () => {
    setLang(prev => {
      const next = prev === 'uk' ? 'en' : 'uk';
      localStorage.setItem('luxpower-lang', next);
      return next;
    });
  };

  // Mobile sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Active tab state: 'dashboard' | 'consumption' | 'battery-bms' | 'grid-temp' | 'telemetry-logs'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Selected range data for PowerFlow chart
  const [rangePoints, setRangePoints] = useState(null);
  // Selected range data for Battery chart
  const [batteryRangeRows, setBatteryRangeRows] = useState(null);
  // Selected range data for Grid/Temp chart
  const [gridRangeRows, setGridRangeRows] = useState(null);

  useEffect(() => {
    const htmlEl = document.documentElement;
    if (isDark) {
      htmlEl.classList.add('dark');
      localStorage.setItem('luxpower-theme', 'dark');
    } else {
      htmlEl.classList.remove('dark');
      localStorage.setItem('luxpower-theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  // Auth state & localStorage session
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [customAuth, setCustomAuth] = useState(() => {
    try {
      const stored = localStorage.getItem('luxpower-custom-auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Helper to attach authorization and serial headers if custom cookie exists
  const getAuthHeaders = (overrideAuth = null) => {
    const auth = overrideAuth || customAuth;
    const headers = {};
    if (auth && auth.cookie) {
      headers['x-lux-cookie'] = auth.cookie;
    }
    if (auth && auth.defaultSerial) {
      headers['x-lux-serial'] = auth.defaultSerial;
    }
    if (auth && auth.server) {
      headers['x-lux-server'] = auth.server;
    }
    return headers;
  };

  const handleLoginSuccess = (authData) => {
    if (authData.remember) {
      localStorage.setItem('luxpower-custom-auth', JSON.stringify(authData));
    }
    setCustomAuth(authData);
    fetchStatus(authData);
    fetchLive(authData);
    fetchHistory(selectedDate, authData);
  };

  const handleLogout = () => {
    localStorage.removeItem('luxpower-custom-auth');
    setCustomAuth(null);
    fetchStatus(null);
    fetchLive(null);
    fetchHistory(selectedDate, null);
  };

  // Helper to handle unauthorized (401 / session expired) responses
  const handleUnauthorized = (overrideAuth = null) => {
    const auth = overrideAuth !== undefined ? overrideAuth : customAuth;
    if (auth) {
      console.warn('⚠️ Custom session expired. Clearing cached session and prompting login.');
      localStorage.removeItem('luxpower-custom-auth');
      setCustomAuth(null);
    }
    setAuthModalOpen(true);
  };

  const fetchStatus = async (authOverride = undefined) => {
    try {
      const auth = authOverride !== undefined ? authOverride : customAuth;
      const res = await apiFetch('/status', {
        headers: getAuthHeaders(auth)
      });
      if (res.status === 401) {
        handleUnauthorized(auth);
        return;
      }
      const data = await res.json();
      setStatus(data);
      // Auto open modal if completely unauthenticated (neither env nor custom auth)
      if (!data.connected && !data.hasEnvCredentials && !auth) {
        setAuthModalOpen(true);
      }
    } catch (err) {
      console.error('Status fetch error:', err);
    }
  };

  const fetchLive = async (authOverride = undefined) => {
    try {
      const auth = authOverride !== undefined ? authOverride : customAuth;
      const serialParam = auth?.defaultSerial ? `?serial=${encodeURIComponent(auth.defaultSerial)}` : '';
      const res = await apiFetch(`/telemetry/live${serialParam}`, {
        headers: getAuthHeaders(auth)
      });
      if (res.status === 401) {
        handleUnauthorized(auth);
        return;
      }
      const data = await res.json();
      setLiveData(data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err) {
      console.error('Live fetch error:', err);
    }
  };

  const fetchHistory = async (date, authOverride = undefined) => {
    setLoading(true);
    try {
      const auth = authOverride !== undefined ? authOverride : customAuth;
      const serialQuery = auth?.defaultSerial ? `&serial=${encodeURIComponent(auth.defaultSerial)}` : '';
      const [chartRes, tableRes] = await Promise.all([
        apiFetch(`/telemetry/day-chart?date=${date}${serialQuery}`, { headers: getAuthHeaders(auth) }),
        apiFetch(`/telemetry/table?date=${date}&rows=500${serialQuery}`, { headers: getAuthHeaders(auth) }),
      ]);
      if (chartRes.status === 401 || tableRes.status === 401) {
        handleUnauthorized(auth);
        return;
      }
      const chartJson = await chartRes.json();
      const tableJson = await tableRes.json();

      if (chartJson && chartJson.data) {
        setChartData(chartJson.data);
        setRangePoints(chartJson.data.map(parseInverterPoint));
        // Cache finished past day chart
        if (auth?.defaultSerial) {
          setCachedDayChart(auth.defaultSerial, date, chartJson.data);
        }
      } else {
        setChartData([]);
        setRangePoints([]);
      }

      if (tableJson && tableJson.rows) {
        setTableRows(tableJson.rows);
        setBatteryRangeRows(tableJson.rows);
        setGridRangeRows(tableJson.rows);
      } else {
        setTableRows([]);
        setBatteryRangeRows([]);
        setGridRangeRows([]);
      }
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Multi-day history fetcher for Period Overview with Caching and Concurrency Pool
  const fetchPeriodHistory = async (dates, authOverride = undefined) => {
    if (!dates || !dates.length) return;
    setLoading(true);
    try {
      const auth = authOverride !== undefined ? authOverride : customAuth;
      const serial = auth?.defaultSerial || '';
      const serialQuery = serial ? `&serial=${encodeURIComponent(serial)}` : '';

      // Prepare tasks: check cache first, fetch only missing or unfinalized (today) dates
      const tasks = dates.map((d) => async () => {
        // 1. Try cache if past date
        if (isPastDate(d)) {
          const cachedData = await getCachedDayChart(serial, d);
          if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
            const points = cachedData.map(parseInverterPoint).filter(Boolean);
            const stats = integrateEnergy(points);
            return {
              date: d,
              points,
              ...stats,
            };
          }
        }

        // 2. Fetch from network with retry
        let attempts = 0;
        while (attempts < 2) {
          attempts++;
          try {
            const res = await apiFetch(`/telemetry/day-chart?date=${d}${serialQuery}`, {
              headers: getAuthHeaders(auth),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const rawData = json && json.data ? json.data : [];
            const points = rawData.map(parseInverterPoint).filter(Boolean);
            const stats = integrateEnergy(points);

            // Cache if past date
            if (isPastDate(d) && rawData.length > 0) {
              setCachedDayChart(serial, d, rawData);
            }

            return {
              date: d,
              points,
              ...stats,
            };
          } catch (e) {
            if (attempts >= 2) {
              console.error(`Error fetching day chart for ${d} after retry:`, e);
              return {
                date: d,
                points: [],
                gridImportKwh: 0,
                consumptionKwh: 0,
                batteryChargeKwh: 0,
                batteryDischargeKwh: 0,
                inverterLossKwh: 0,
              };
            }
            // Wait 250ms before retry
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      });

      // Run network requests with concurrency pool (max 2 parallel requests, 60ms stagger)
      const results = await runWithConcurrency(tasks, 2, 60);

      // Sum all metrics
      let totalConsumptionKwh = 0;
      let totalGridImportKwh = 0;
      let totalBatteryDischargeKwh = 0;
      let totalBatteryChargeKwh = 0;
      let totalInverterLossKwh = 0;
      let totalCostNightUah = 0;
      let totalCostDayUah = 0;
      let totalCostUah = 0;
      let totalInverterCostUah = 0;

      results.forEach((r) => {
        totalConsumptionKwh += r.consumptionKwh || 0;
        totalGridImportKwh += r.gridImportKwh || 0;
        totalBatteryDischargeKwh += r.batteryDischargeKwh || 0;
        totalBatteryChargeKwh += r.batteryChargeKwh || 0;
        totalInverterLossKwh += r.inverterLossKwh || 0;
        totalCostNightUah += r.costNightUah || 0;
        totalCostDayUah += r.costDayUah || 0;
        totalCostUah += r.costTotalUah || 0;
        totalInverterCostUah += r.inverterCostTotalUah || 0;
      });

      setPeriodStats({
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        daysCount: dates.length,
        totalConsumptionKwh: parseFloat(totalConsumptionKwh.toFixed(2)),
        totalGridImportKwh: parseFloat(totalGridImportKwh.toFixed(2)),
        totalBatteryDischargeKwh: parseFloat(totalBatteryDischargeKwh.toFixed(2)),
        totalBatteryChargeKwh: parseFloat(totalBatteryChargeKwh.toFixed(2)),
        totalInverterLossKwh: parseFloat(totalInverterLossKwh.toFixed(2)),
        totalCostNightUah: parseFloat(totalCostNightUah.toFixed(2)),
        totalCostDayUah: parseFloat(totalCostDayUah.toFixed(2)),
        totalCostUah: parseFloat(totalCostUah.toFixed(2)),
        totalInverterCostUah: parseFloat(totalInverterCostUah.toFixed(2)),
        dailyList: results,
      });

      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err) {
      console.error('Period history fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cleanupLegacyLocalStorage();
    fetchStatus();
    fetchLive();
  }, []);

  // Always keep single-day chartData, tableRows & rangePoints in sync with selectedDate
  useEffect(() => {
    fetchHistory(selectedDate);
  }, [selectedDate]);

  // Fetch multi-day period history whenever multi-day mode or custom range changes
  useEffect(() => {
    if (periodMode === 'custom') {
      if (customRange?.start && customRange?.end) {
        const dates = getDateRangeArray(customRange.start, customRange.end);
        fetchPeriodHistory(dates);
      }
    } else if (periodMode === '7d' || periodMode === 'month') {
      const { start, end } = calculatePeriodDates(periodMode);
      const dates = getDateRangeArray(start, end);
      fetchPeriodHistory(dates);
    }
  }, [periodMode, customRange?.start, customRange?.end]);

  const handleManualRefresh = () => {
    fetchStatus();
    fetchLive();
    fetchHistory(selectedDate);
    if (periodMode === 'custom') {
      if (customRange?.start && customRange?.end) {
        const dates = getDateRangeArray(customRange.start, customRange.end);
        fetchPeriodHistory(dates);
      }
    } else if (periodMode === '7d' || periodMode === 'month') {
      const { start, end } = calculatePeriodDates(periodMode);
      const dates = getDateRangeArray(start, end);
      fetchPeriodHistory(dates);
    }
  };

  // Day navigation handlers
  const handlePrevDay = () => {
    const dateObj = parseLocalDate(selectedDate) || new Date();
    dateObj.setDate(dateObj.getDate() - 1);
    setSelectedDate(toDateStr(dateObj));
  };

  const handleNextDay = () => {
    const dateObj = parseLocalDate(selectedDate) || new Date();
    dateObj.setDate(dateObj.getDate() + 1);
    setSelectedDate(toDateStr(dateObj));
  };

  // Metrics extraction & normalization
  const latestRow = tableRows.length > 0 ? tableRows[0] : null;

  // Grid & EPS Normalized
  const gridEpsInfo = useMemo(
    () => normalizeGridAndEps(liveData, latestRow),
    [liveData, latestRow]
  );

  // Home consumption: checks live consumptionPower, peps, or table pLoad
  const homeLoad = useMemo(() => {
    if (liveData) {
      if (liveData.consumptionPower && Number(liveData.consumptionPower) > 0) {
        return Math.round(Number(liveData.consumptionPower));
      }
      if (liveData.peps && Number(liveData.peps) > 0) {
        return Math.round(Number(liveData.peps));
      }
    }
    if (latestRow) {
      if (latestRow.peps && Number(latestRow.peps) > 0) {
        return Math.round(Number(latestRow.peps));
      }
      if (latestRow.pLoad && Number(latestRow.pLoad) > 0) {
        return Math.round(Number(latestRow.pLoad));
      }
    }
    return 0;
  }, [liveData, latestRow]);

  const soc = liveData ? liveData.soc : (latestRow ? latestRow.soc : '0');
  const battCharge = liveData ? Math.max(0, Number(liveData.pCharge) || 0) : 0;
  const battDischarge = liveData ? Math.max(0, Number(liveData.pDisCharge) || 0) : 0;

  // Grid import (positive only, since export is disabled)
  const gridImport = useMemo(() => {
    if (liveData && liveData.pToUser !== undefined) {
      return Math.max(0, Math.round(Number(liveData.pToUser) || 0));
    }
    if (latestRow && latestRow.pToUser !== undefined) {
      return Math.max(0, Math.round(Number(latestRow.pToUser) || 0));
    }
    return 0;
  }, [liveData, latestRow]);

  // Solar PV power and string voltages
  const solarPower = useMemo(() => {
    if (liveData?.ppv !== undefined) return Math.max(0, Math.round(Number(liveData.ppv) || 0));
    if (latestRow?.ppv !== undefined) return Math.max(0, Math.round(Number(latestRow.ppv) || 0));
    return 0;
  }, [liveData, latestRow]);

  const pv1Voltage = useMemo(() => {
    if (liveData?.vpv1 !== undefined) return (Number(liveData.vpv1) / 10).toFixed(1);
    if (latestRow?.vpv1 !== undefined) return (Number(latestRow.vpv1) || 0).toFixed(1);
    return '0.0';
  }, [liveData, latestRow]);

  const pv2Voltage = useMemo(() => {
    if (liveData?.vpv2 !== undefined) return (Number(liveData.vpv2) / 10).toFixed(1);
    if (latestRow?.vpv2 !== undefined) return (Number(latestRow.vpv2) || 0).toFixed(1);
    return '0.0';
  }, [liveData, latestRow]);

  // Inverter Self-Consumption (Losses) in real time
  const currentInverterLoss = useMemo(() => {
    const input = gridImport + solarPower + battDischarge;
    const output = homeLoad + battCharge;
    return Math.max(0, Math.round(input - output));
  }, [gridImport, solarPower, battDischarge, homeLoad, battCharge]);

  // Dynamic inverter load percentage relative to rated capacity
  const ratedPowerW = (Number(status?.plant?.inverters?.[0]?.powerRating) || 6) * 1000;
  const loadPercent = ((homeLoad / ratedPowerW) * 100).toFixed(1);

  // Counters (prefer real-time dongle values in liveData when present, else latestRow)
  const dailyGridImport = liveData?.eToUserDay ?? latestRow?.eToUserDay ?? '0';
  const dailyChg = liveData?.eChgDay ?? latestRow?.eChgDay ?? '0';
  const dailyDisChg = liveData?.eDisChgDay ?? latestRow?.eDisChgDay ?? '0';
  const dailyHomeCons = liveData?.eEpsDay ?? latestRow?.eEpsDay ?? '0';
  const dataSource = liveData?.source || status?.dataSource || (status?.connected ? 'cloud' : null);
  const liveInverterTemp = liveData?.tinner ?? latestRow?.tinner;
  const liveBatteryVoltage = liveData?.vBat
    ? (Number(liveData.vBat) / 10).toFixed(1)
    : (latestRow?.vBat ? Number(latestRow.vBat).toFixed(1) : '0.0');

  // Power source durations (battery vs grid streak, estimated remaining runtime and 24h totals)
  const powerSourceDurations = useMemo(() => {
    return calculatePowerSourceDurations(tableRows, gridEpsInfo.isGridOnline, soc);
  }, [tableRows, gridEpsInfo.isGridOnline, soc]);

  // Estimated time until full charge (based on current charging power and 2-stage BMS curve)
  const timeToFullChargeSec = useMemo(() => {
    return calculateTimeToFullCharge(soc, battCharge);
  }, [soc, battCharge]);

  // Dynamic battery cycle count and SOH estimation
  const batteryHealth = useMemo(() => {
    return calculateBatteryHealth(latestRow, liveData, status);
  }, [latestRow, liveData, status]);

  // Real-time battery current (A): liveData.bmsBatCurrent is scaled x100, table bmsBatCurrent is x1
  const batteryCurrent = useMemo(() => {
    const liveCurr = liveData?.bmsBatCurrent !== undefined ? Number(liveData.bmsBatCurrent) / 100 : 0;
    if (liveCurr !== 0 && !Number.isNaN(liveCurr)) {
      return Math.abs(liveCurr).toFixed(1);
    }
    if (battCharge > 0 || battDischarge > 0) {
      const p = battCharge > 0 ? battCharge : battDischarge;
      const v = parseFloat(latestRow?.vBat) || (liveData?.vBat ? liveData.vBat / 10 : 50);
      return (p / v).toFixed(1);
    }
    const rowCurr = latestRow?.bmsBatCurrent !== undefined ? parseFloat(latestRow.bmsBatCurrent) : 0;
    if (rowCurr !== 0 && !Number.isNaN(rowCurr)) {
      return Math.abs(rowCurr).toFixed(1);
    }
    return '0.0';
  }, [liveData, latestRow, battCharge, battDischarge]);

  // Real-time ticking seconds for current streak timer
  const [currentUptimeSec, setCurrentUptimeSec] = useState(0);

  useEffect(() => {
    setCurrentUptimeSec(powerSourceDurations.currentModeDurationSec);
  }, [powerSourceDurations.currentModeDurationSec]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentUptimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Energy integration over user selected zoom range (for PowerFlow chart)
  const rangeEnergyStats = useMemo(() => {
    return integrateEnergy(rangePoints);
  }, [rangePoints]);

  const rangeStartTime = rangePoints && rangePoints.length > 0 ? formatTimeWithoutSeconds(rangePoints[0].time) : '';
  const rangeEndTime = rangePoints && rangePoints.length > 0 ? formatTimeWithoutSeconds(rangePoints[rangePoints.length - 1].time) : '';

  // Averages for Battery & BMS range
  const batteryAverages = useMemo(() => {
    if (!batteryRangeRows || !batteryRangeRows.length) {
      return { avgSoc: 0, avgVbat: 0, avgCurrent: 0, avgTbat: 0 };
    }
    let sumSoc = 0;
    let sumVbat = 0;
    let sumCurrent = 0;
    let sumTbat = 0;
    batteryRangeRows.forEach((r) => {
      sumSoc += parseFloat(r.soc) || 0;
      sumVbat += parseFloat(r.vBat) || 0;
      sumCurrent += parseFloat(r.bmsBatCurrent) || 0;
      sumTbat += parseFloat(r.tBat) || 0;
    });
    const len = batteryRangeRows.length;
    return {
      avgSoc: Math.round(sumSoc / len),
      avgVbat: (sumVbat / len).toFixed(1),
      avgCurrent: (sumCurrent / len).toFixed(1),
      avgTbat: (sumTbat / len).toFixed(1),
    };
  }, [batteryRangeRows]);

  // Averages for Grid & Temperature range
  const gridAverages = useMemo(() => {
    if (!gridRangeRows || !gridRangeRows.length) {
      return { avgVac: 0, avgFac: 0, avgTinner: 0, avgTrad1: 0, avgTrad2: 0 };
    }
    let sumVac = 0;
    let sumFac = 0;
    let sumTinner = 0;
    let sumTrad1 = 0;
    let sumTrad2 = 0;
    gridRangeRows.forEach((r) => {
      const v = parseFloat(r.vacr) || 0;
      sumVac += v > 0 ? v : (parseFloat(r.vepsr) || 0);
      const f = parseFloat(r.fac) || 0;
      sumFac += f > 0 ? f : (parseFloat(r.feps) || 0);
      sumTinner += parseFloat(r.tinner) || 0;
      sumTrad1 += parseFloat(r.tradiator1) || 0;
      sumTrad2 += parseFloat(r.tradiator2) || 0;
    });
    const len = gridRangeRows.length;
    return {
      avgVac: (sumVac / len).toFixed(1),
      avgFac: (sumFac / len).toFixed(1),
      avgTinner: (sumTinner / len).toFixed(1),
      avgTrad1: (sumTrad1 / len).toFixed(1),
      avgTrad2: (sumTrad2 / len).toFixed(1),
    };
  }, [gridRangeRows]);

  const navLinks = [
    { id: 'dashboard', label: t.navDashboard || 'Dashboard', icon: Share2 },
    { id: 'consumption', label: t.navConsumption || 'Споживання', icon: Activity },
    { id: 'battery-bms', label: t.navBatteryBms || 'Батарея та BMS', icon: BatteryCharging },
    { id: 'grid-temp', label: t.navGridTemp || 'Мережа та Температура', icon: Radio },
    { id: 'telemetry-logs', label: t.navTelemetryLogs || 'Журнал телеметрії', icon: Table2 },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0a0e17] text-slate-800 dark:text-slate-100 font-sans text-sm antialiased transition-colors duration-200">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white/95 dark:bg-[#0c101d]/95 backdrop-blur-xl z-50 flex flex-col justify-between border-r border-slate-200/80 dark:border-white/[0.08] shadow-[1px_0_10px_rgba(0,0,0,0.03)] dark:shadow-none transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]">
                <Bolt className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-[15px] tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  Luxpower Core
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold">
                  {t.brandSub}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Group: Телеметрия */}
          <div className="px-4 py-5">
            <div className="px-3 pb-2 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500">
              {t.telemetry}
            </div>
            <nav className="flex flex-col gap-1">
              {navLinks.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (item.id === 'consumption' && periodMode !== 'custom') {
                        setSelectedDate(getTodayLocalDate());
                      }
                      setSidebarOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all text-left ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 font-semibold border-l-2 border-emerald-500 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <IconComponent className="w-4 h-4 shrink-0" />
                    <span className="text-[13px] tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer pill: Inverter State, Serial, Language & Theme */}
        <div className="p-4 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#070b14]/50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
                {t.inverter}
              </span>
              <span className="text-[12px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                SNA 6K
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                SN: <strong className="font-semibold text-slate-700 dark:text-slate-300">{customAuth?.defaultSerial || status?.defaultSerial || liveData?.serialNum || '—'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
              <span>{gridEpsInfo.isGridOnline ? t.online : t.epsMode}</span>
            </div>
          </div>

          {/* Language & Theme switches inside drawer menu */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-white/[0.05] flex items-center justify-between">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 font-mono text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/[0.1] transition-all shadow-sm"
              title={t.toggleLang}
            >
              <span>{lang === 'en' ? '🇺🇦 UA' : '🇬🇧 EN'}</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/[0.1] transition-all shadow-sm"
              title={t.changeTheme}
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-[11px]">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-600" />
                  <span className="text-[11px]">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* TOP APP HEADER & MAIN CONTENT WRAPPER */}
      <div className="lg:pl-64">
        {/* TOP HEADER */}
        <header className="fixed top-0 left-0 lg:left-64 right-0 min-h-16 bg-white/85 dark:bg-[#0a0e17]/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/[0.08] z-40 px-3 sm:px-6 py-2 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 transition-colors duration-200">
          {/* Identity & Status: In single row on mobile (GRID, LAN, Update Time) */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 -ml-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.05] shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                {/* GRID / EPS status badge */}
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-[0_0_10px_rgba(16,185,129,0.15)] whitespace-nowrap shrink-0 ${
                  gridEpsInfo.isGridOnline
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${gridEpsInfo.isGridOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold tracking-wider">
                    {gridEpsInfo.isGridOnline ? t.grid220 : 'EPS'}
                  </span>
                </div>

                {/* LAN / Cloud badge */}
                {dataSource && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-mono font-semibold whitespace-nowrap shrink-0 ${
                      dataSource === 'dongle'
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                        : 'bg-slate-100 dark:bg-white/[0.06] border-slate-200 dark:border-white/[0.1] text-slate-500 dark:text-slate-400'
                    }`}
                    title={dataSource === 'dongle'
                      ? (lang === 'en' ? 'Live telemetry directly from LAN Wi-Fi dongle (Read-Only)' : 'Жива телеметрія напряму з LAN-донгла (Read-Only)')
                      : (lang === 'en' ? 'Telemetry from Luxpower Cloud' : 'Телеметрія з хмари Luxpower')}
                  >
                    <Radio className="w-2.5 h-2.5 shrink-0" />
                    <span>{dataSource === 'dongle' ? 'LAN' : 'Cloud'}</span>
                  </span>
                )}

                {/* Desktop SN & Inverter model */}
                <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span className="truncate">SN: <strong className="font-semibold text-slate-700 dark:text-slate-200">{customAuth?.defaultSerial || status?.defaultSerial || liveData?.serialNum || '—'}</strong></span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span>SNA 6K</span>
                </div>

                {/* Update Time with Clock icon */}
                {lastUpdated && (
                  <div
                    className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0"
                    title={t.updated}
                  >
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">{lastUpdated}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile-only action buttons (< lg): Refresh on left, Auth on far right */}
            <div className="flex lg:hidden items-center gap-1.5 shrink-0">
              {/* Refresh Button (icon only) */}
              <button
                onClick={handleManualRefresh}
                disabled={loading}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/[0.08] transition-all shadow-sm shrink-0"
                title={t.refresh}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* Auth Button */}
              <button
                onClick={() => setAuthModalOpen(true)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-mono font-semibold transition-all shadow-sm ${
                  status?.connected || customAuth
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse'
                }`}
                title={status?.connected || customAuth ? t.authStatusConnected : t.authSignIn}
              >
                {status?.connected || customAuth ? (
                  <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Right cluster on >= 1024px (lg:): Date Navigator on the left, Refresh and Auth aligned to the far right. Full-width on mobile. */}
          <div className="flex items-center justify-between lg:justify-end gap-2 w-full lg:w-auto min-w-0">
            {/* Date Navigator: Full-width on mobile (< lg), compact on desktop */}
            <div className="flex items-center justify-between w-full lg:w-auto rounded-lg bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] p-0.5 shadow-sm">
              <button
                onClick={handlePrevDay}
                className="w-8 h-8 lg:w-7 lg:h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.08] rounded-md transition-all shrink-0"
                title={t.prevDay}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 flex justify-center">
                <DatePicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                  lang={lang}
                  className="w-full justify-center"
                  buttonClassName="w-full justify-center px-2 py-1 text-xs"
                />
              </div>
              <button
                onClick={handleNextDay}
                className="w-8 h-8 lg:w-7 lg:h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.08] rounded-md transition-all shrink-0"
                title={t.nextDay}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Desktop Actions (>= lg): Refresh icon, Auth button at far right */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              {/* Refresh Button (icon only) */}
              <button
                onClick={handleManualRefresh}
                disabled={loading}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/[0.08] transition-all shadow-sm shrink-0"
                title={t.refresh}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* Auth Button */}
              <button
                onClick={() => setAuthModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-mono font-semibold transition-all shadow-sm shrink-0 ${
                  status?.connected || customAuth
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse'
                }`}
                title={status?.connected || customAuth ? t.authStatusConnected : t.authSignIn}
              >
                {status?.connected || customAuth ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="max-w-[100px] truncate">{customAuth?.account || status?.account || 'Auth'}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{t.authSignIn}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main className="relative pt-[112px] lg:pt-20 min-h-screen px-3 sm:px-6 py-4 sm:py-6 pb-20 transition-colors duration-200">
          <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
            {/* TAB 1: DASHBOARD (KPI, Потоки енергії, Баланс потужності, Журнал внизу) */}
            {activeTab === 'dashboard' && (
              <div className="flex flex-col gap-4 xl:gap-6">
                {/* MOBILE KPI 2x2 MATRIX (< xl) */}
                <div className="xl:hidden">
                  <MobileKpiGrid
                    homeLoad={homeLoad}
                    isGridOnline={gridEpsInfo.isGridOnline}
                    dailyHomeCons={dailyHomeCons}
                    currentUptimeSec={currentUptimeSec}
                    estimatedRemainingSec={powerSourceDurations.estimatedRemainingSec}
                    totalBatterySec={powerSourceDurations.totalBatterySec}
                    totalGridSec={powerSourceDurations.totalGridSec}
                    soc={soc}
                    battCharge={battCharge}
                    battDischarge={battDischarge}
                    timeToFullChargeSec={timeToFullChargeSec}
                    dailyChg={dailyChg}
                    dailyDisChg={dailyDisChg}
                    gridImport={gridImport}
                    gridVoltage={gridEpsInfo.voltage}
                    gridFrequency={gridEpsInfo.frequency}
                    dailyGridImport={dailyGridImport}
                    currentInverterLoss={currentInverterLoss}
                    inverterTemp={liveInverterTemp ?? '--'}
                    lang={lang}
                  />
                </div>

                {/* DESKTOP KPI INSTRUMENT STRIP (4 Modules) - Visible on 1200px+ (xl) */}
                <section className="hidden xl:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
                  {/* KPI 1: Power Source Uptime (Battery or Grid) with Live Timer */}
                  <div className={`relative bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-5 border shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between group transition-all ${
                    gridEpsInfo.isGridOnline
                      ? 'border-slate-200/90 dark:border-white/[0.08] hover:border-emerald-500/40'
                      : 'border-amber-500/30 hover:border-amber-500/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {gridEpsInfo.isGridOnline ? t.gridUptime : t.batteryUptime}
                      </span>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                        gridEpsInfo.isGridOnline
                          ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20 text-emerald-500'
                          : 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20 text-amber-500'
                      }`}>
                        <Clock className={`w-4 h-4 ${gridEpsInfo.isGridOnline ? 'text-emerald-500' : 'text-amber-500'}`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 my-3">
                      <span className={`font-mono text-3xl font-extrabold tracking-tight font-tabular ${
                        gridEpsInfo.isGridOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
                      }`}>
                        {formatDurationHuman(currentUptimeSec, lang === 'en', true)}
                      </span>
                      {!gridEpsInfo.isGridOnline && powerSourceDurations.estimatedRemainingSec !== null && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            {t.estRemaining}
                          </span>
                          <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            ~{formatDurationHuman(powerSourceDurations.estimatedRemainingSec, lang === 'en', false)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-3 text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        <span>{lang === 'en' ? '24h Bat' : 'АКБ 24г'}: <strong className="font-semibold text-slate-700 dark:text-slate-300">{formatDurationHuman(powerSourceDurations.totalBatterySec, lang === 'en', false)}</strong></span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{lang === 'en' ? '24h Grid' : 'Мережа 24г'}: <strong className="font-semibold text-slate-700 dark:text-slate-300">{formatDurationHuman(powerSourceDurations.totalGridSec, lang === 'en', false)}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* KPI 2: Battery */}
                  <div className={`relative bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between group transition-all ${
                    battCharge > 0 ? 'hover:border-emerald-500/40' : (battDischarge > 0 ? 'hover:border-rose-500/40' : 'hover:border-slate-400/40')
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t.kpiBattery}
                      </span>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-colors ${
                        battCharge > 0
                          ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20 text-emerald-500'
                          : battDischarge > 0
                            ? 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20 text-rose-500'
                            : 'bg-slate-500/10 dark:bg-slate-500/15 border-slate-500/20 text-slate-400'
                      }`}>
                        {battCharge > 0 ? (
                          <BatteryCharging className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Battery className={`w-4 h-4 ${battDischarge > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 my-3">
                      <div className="flex items-baseline gap-2">
                        <span className={`font-mono text-3xl font-extrabold tracking-tight font-tabular ${
                          battCharge > 0 ? 'text-emerald-500' : (battDischarge > 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white')
                        }`}>
                          {soc}%
                        </span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {battCharge > 0 ? `(${t.chargeWord} ${battCharge} ${unitW})` : (battDischarge > 0 ? `(${t.dischargeWord} ${battDischarge} ${unitW})` : `(${t.standby})`)}
                        </span>
                      </div>
                      {battCharge > 0 && timeToFullChargeSec !== null && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            {t.estTimeToFull}
                          </span>
                          <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            ~{formatDurationHuman(timeToFullChargeSec, lang === 'en', false)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{dailyChg} {unitKwh}</span>
                      <span className="text-rose-500 dark:text-rose-400 font-semibold">-{dailyDisChg} {unitKwh}</span>
                    </div>
                  </div>

                  {/* KPI 3: Grid Import */}
                  <div className="relative bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between group hover:border-rose-500/40 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t.kpiGridImport}
                      </span>
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
                        gridImport > 0
                          ? 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20 text-rose-500'
                          : 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20 text-emerald-500'
                      }`}>
                        <Zap className={`w-4 h-4 ${gridImport > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2 my-3">
                      <span className="font-mono text-3xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-tabular">
                        {gridImport}
                      </span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{unitW}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-white/[0.06] pt-3">
                      <span className={`w-2 h-2 rounded-full ${gridEpsInfo.isGridOnline ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'}`}></span>
                      <span className={`font-medium ${gridEpsInfo.isGridOnline ? 'text-slate-700 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}`}>
                        {gridEpsInfo.isGridOnline ? `${gridEpsInfo.voltage} ${unitV} • ${gridEpsInfo.frequency} ${unitHz}` : t.gridOffline}
                      </span>
                      <span>•</span>
                      <span>{t.dayTotal}: <span className="text-slate-900 dark:text-white font-semibold">{dailyGridImport} {unitKwh}</span></span>
                    </div>
                  </div>

                  {/* KPI 4: Inverter Losses */}
                  <div className="relative bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-5 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between group hover:border-purple-500/40 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t.kpiInverterLoss}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-500">
                        <Cpu className="w-4 h-4 text-purple-500" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2 my-3">
                      <span className="font-mono text-3xl font-extrabold text-purple-500 dark:text-purple-400 tracking-tight font-tabular">
                        ~{currentInverterLoss}
                      </span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{unitW}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono border-t border-slate-100 dark:border-white/[0.06] pt-3">
                      <div className="flex items-center gap-1 text-purple-500 dark:text-purple-400 font-semibold">
                        <Flame className="w-3.5 h-3.5 text-purple-500" />
                        <span>{liveInverterTemp !== undefined ? `${liveInverterTemp}°C` : '--'}</span>
                      </div>
                      <span className="text-slate-500 dark:text-slate-400">
                        {gridEpsInfo.isGridOnline ? t.bypassCharging : t.epsMode}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Mobile-optimized Power Flow Diagram (< xl) */}
                <div className="xl:hidden">
                  <MobilePowerFlowDiagram
                    solarPower={solarPower}
                    pv1Voltage={pv1Voltage}
                    pv2Voltage={pv2Voltage}
                    gridPower={gridImport}
                    homeLoad={homeLoad}
                    batteryPower={battCharge > 0 ? battCharge : (battDischarge > 0 ? -battDischarge : 0)}
                    soc={soc}
                    inverterLoss={currentInverterLoss}
                    gridVoltage={gridEpsInfo.voltage}
                    gridFrequency={gridEpsInfo.frequency}
                    isGridOnline={gridEpsInfo.isGridOnline}
                    isEpsActive={!gridEpsInfo.isGridOnline}
                    inverterTemp={liveInverterTemp ?? '--'}
                    batteryVoltage={liveBatteryVoltage}
                    batteryCurrent={batteryCurrent}
                    batteryHealth={batteryHealth}
                    loadPercent={loadPercent}
                    lang={lang}
                  />
                </div>

                {/* Power Flow Diagram (Desktop xl+) */}
                <div id="power-flow" className="hidden xl:block">
                  <PowerFlowDiagram
                    solarPower={solarPower}
                    pv1Voltage={pv1Voltage}
                    pv2Voltage={pv2Voltage}
                    gridPower={gridImport}
                    homeLoad={homeLoad}
                    batteryPower={battCharge > 0 ? battCharge : (battDischarge > 0 ? -battDischarge : 0)}
                    soc={soc}
                    inverterLoss={currentInverterLoss}
                    gridVoltage={gridEpsInfo.voltage}
                    gridFrequency={gridEpsInfo.frequency}
                    isGridOnline={gridEpsInfo.isGridOnline}
                    isEpsActive={!gridEpsInfo.isGridOnline}
                    inverterTemp={liveInverterTemp ?? '--'}
                    batteryVoltage={liveBatteryVoltage}
                    batteryCurrent={batteryCurrent}
                    batteryHealth={batteryHealth}
                    loadPercent={loadPercent}
                    lang={lang}
                  />
                </div>

                {/* Power Balance 24h Chart */}
                <section
                  id="power-balance"
                  className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-5 transition-all"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
                        <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                        {t.secPowerFlowTitle}
                      </h2>
                    </div>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-400 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      {t.secPowerFlowSub}
                    </span>
                  </div>

                  {/* Summary Metrics Strip */}
                  {rangeEnergyStats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 dark:bg-[#0c121e]/80 rounded-xl p-4 border border-slate-100 dark:border-white/[0.05]">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {t.period}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-mono text-xl font-bold text-slate-700 dark:text-slate-200 font-tabular">
                            {rangeEnergyStats.durationHours}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{t.hours}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                          {rangeStartTime || '00:00'} - {rangeEndTime || '24:00'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          {t.gridImportKwh}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-mono text-xl font-bold text-rose-600 dark:text-rose-400 font-tabular">
                            {rangeEnergyStats.gridImportKwh}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{unitKwh}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Home className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          {t.homeLoadKwh}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-mono text-xl font-bold text-amber-500 dark:text-amber-400 font-tabular">
                            {rangeEnergyStats.consumptionKwh}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{unitKwh}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Battery className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {t.batteryKwh}
                        </span>
                        <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-1.5 mt-0.5 font-mono font-semibold">
                          <span className="text-emerald-600 dark:text-emerald-400 text-lg md:text-xl font-bold font-tabular">
                            +{rangeEnergyStats.batteryChargeKwh} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 md:hidden">{unitKwh}</span>
                          </span>
                          <span className="text-rose-500 dark:text-rose-400 text-lg md:text-xl font-bold font-tabular">
                            -{rangeEnergyStats.batteryDischargeKwh} <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{unitKwh}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          {t.inverterLossKwh}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-mono text-xl font-bold text-purple-500 dark:text-purple-400 font-tabular">
                            {rangeEnergyStats.inverterLossKwh}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{unitKwh}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <PowerFlowChart rawData={chartData} onZoomChange={setRangePoints} lang={lang} />
                </section>

                {/* Recent telemetry event card at bottom (< xl) */}
                <div className="xl:hidden">
                  <MobileRecentLog
                    latestRow={latestRow}
                    totalRows={tableRows.length}
                    lang={lang}
                    onShowAll={() => {
                      setActiveTab('telemetry-logs');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB 2: CONSUMPTION / СПОЖИВАННЯ (Статистика за період: 1д, 1н, 1м, range) */}
            {activeTab === 'consumption' && (
              <div className="flex flex-col gap-6">
                {/* Period Mode Selector Toolbar in Consumption Tab */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111827]/90 rounded-2xl p-4 border border-slate-200/90 dark:border-white/[0.08] shadow-sm">
                  <div className="flex items-center gap-1.5 overflow-x-auto p-0.5 rounded-xl bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]">
                    {[
                      { key: '1d', label: '1д' },
                      { key: '7d', label: '1н' },
                      { key: 'month', label: '1м' },
                      { key: 'custom', label: t.periodCustom || 'Період' },
                    ].map((p) => (
                      <button
                        key={p.key}
                        onClick={() => {
                          setPeriodMode(p.key);
                          if (p.key !== 'custom') {
                            setSelectedDate(getTodayLocalDate());
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                          periodMode === p.key
                            ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Range inputs: only shown if custom range is selected */}
                  {periodMode === 'custom' && (
                    <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] text-xs font-mono">
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t.rangeFrom}:</span>
                      <DatePicker
                        value={customRange?.start || ''}
                        onChange={(val) => setCustomRange((prev) => ({ ...prev, start: val }))}
                        lang={lang}
                      />
                      <span className="text-slate-400">-</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">{t.rangeTo}:</span>
                      <DatePicker
                        value={customRange?.end || ''}
                        onChange={(val) => setCustomRange((prev) => ({ ...prev, end: val }))}
                        lang={lang}
                      />
                    </div>
                  )}
                </div>

                <section id="consumption-stats" className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                        {periodMode === '1d'
                          ? `${t.periodOverview}: ${formatDateHuman(selectedDate, lang)}`
                          : (() => {
                              const range = periodMode === 'custom'
                                ? { start: customRange?.start || selectedDate, end: customRange?.end || selectedDate }
                                : calculatePeriodDates(periodMode);
                              return `${t.periodOverview} (${formatDateHuman(range.start, lang)} — ${formatDateHuman(range.end, lang)})`;
                            })()}
                      </h2>
                    </div>
                    {loading && (
                      <span className="text-xs font-mono text-emerald-500 animate-pulse">
                        {t.loadingPeriodData}
                      </span>
                    )}
                  </div>
                  <PeriodOverview
                    periodStats={
                      periodMode === '1d'
                        ? {
                            startDate: selectedDate,
                            endDate: selectedDate,
                            daysCount: 1,
                            totalConsumptionKwh: rangeEnergyStats?.consumptionKwh || 0,
                            totalGridImportKwh: rangeEnergyStats?.gridImportKwh || 0,
                            totalBatteryDischargeKwh: rangeEnergyStats?.batteryDischargeKwh || 0,
                            totalBatteryChargeKwh: rangeEnergyStats?.batteryChargeKwh || 0,
                            totalInverterLossKwh: rangeEnergyStats?.inverterLossKwh || 0,
                            totalCostNightUah: rangeEnergyStats?.costNightUah || 0,
                            totalCostDayUah: rangeEnergyStats?.costDayUah || 0,
                            totalCostUah: rangeEnergyStats?.costTotalUah || 0,
                            totalInverterCostUah: rangeEnergyStats?.inverterCostTotalUah || 0,
                            dailyList: [
                              {
                                date: selectedDate,
                                consumptionKwh: rangeEnergyStats?.consumptionKwh || 0,
                                gridImportKwh: rangeEnergyStats?.gridImportKwh || 0,
                                batteryDischargeKwh: rangeEnergyStats?.batteryDischargeKwh || 0,
                                batteryChargeKwh: rangeEnergyStats?.batteryChargeKwh || 0,
                                inverterLossKwh: rangeEnergyStats?.inverterLossKwh || 0,
                                costNightUah: rangeEnergyStats?.costNightUah || 0,
                                costDayUah: rangeEnergyStats?.costDayUah || 0,
                                costTotalUah: rangeEnergyStats?.costTotalUah || 0,
                                inverterCostTotalUah: rangeEnergyStats?.inverterCostTotalUah || 0,
                              },
                            ],
                          }
                        : periodStats
                    }
                    lang={lang}
                  />
                </section>

                {/* Detailed 24h consumption curve only shown when single day (1d) is selected */}
                {periodMode === '1d' && (
                  <section
                    className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-sm flex flex-col gap-5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500">
                          <Home className="w-4 h-4" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                          {t.secPowerFlowTitle} ({formatDateHuman(selectedDate, lang)})
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {rangeStartTime} - {rangeEndTime}
                      </span>
                    </div>
                    <PowerFlowChart rawData={chartData} onZoomChange={setRangePoints} lang={lang} />
                  </section>
                )}
              </div>
            )}

            {/* TAB 3: BATTERY & BMS */}
            {activeTab === 'battery-bms' && (
              <section
                id="battery-bms"
                className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-5 transition-all"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                      <BatteryCharging className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                      {t.secBatteryTitle}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    {t.secAveragesSub}
                  </span>
                </div>

                {/* Summary Metrics Strip */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                    {t.secAveragesSub}
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#0c121e]/80 rounded-xl p-4 border border-slate-100 dark:border-white/[0.05]">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgSoc}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-tabular">
                          {batteryAverages.avgSoc}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">%</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgVoltage}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 font-tabular">
                          {batteryAverages.avgVbat}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{unitV}</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgCurrent}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-tabular">
                          {batteryAverages.avgCurrent}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{isEn ? 'A' : 'А'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgTemp}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400 font-tabular">
                          {batteryAverages.avgTbat}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">°C</span>
                      </div>
                    </div>
                  </div>
                </div>

                <BatteryChart tableRows={tableRows} onZoomChange={setBatteryRangeRows} lang={lang} />
              </section>
            )}

            {/* TAB 4: GRID & TEMPERATURE */}
            {activeTab === 'grid-temp' && (
              <section
                id="grid-temp"
                className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-5 transition-all"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
                      <Radio className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                      {t.secGridTitle}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    {t.secAveragesSub}
                  </span>
                </div>

                {/* Summary Metrics Strip */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                    {t.secAveragesSub}
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#0c121e]/80 rounded-xl p-4 border border-slate-100 dark:border-white/[0.05]">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgGridVac}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-tabular">
                          {gridAverages.avgVac}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{unitV}</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgGridFac}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-purple-600 dark:text-purple-400 font-tabular">
                          {gridAverages.avgFac}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{unitHz}</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgInverterTemp}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 font-tabular">
                          {gridAverages.avgTinner}
                        </span>
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">°C</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t.avgRadiators}
                      </span>
                      <div className="flex items-baseline gap-1.5 mt-0.5 font-mono font-bold">
                        <span className="text-rose-600 dark:text-rose-400 text-xl font-tabular">{gridAverages.avgTrad1}°C</span>
                        <span className="text-slate-300 dark:text-slate-600">/</span>
                        <span className="text-rose-600 dark:text-rose-400 text-xl font-tabular">{gridAverages.avgTrad2}°C</span>
                      </div>
                    </div>
                  </div>
                </div>

                <GridVoltageTempChart tableRows={tableRows} onZoomChange={setGridRangeRows} lang={lang} />
              </section>
            )}

            {/* TAB 5: TELEMETRY LOGS */}
            {activeTab === 'telemetry-logs' && (
              <section
                id="telemetry-logs"
                className="bg-white dark:bg-[#111827]/90 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col gap-5 transition-all"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                      <Table2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                      {t.secLogsTitle} ({tableRows.length} {t.logsCount})
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-400">
                    {t.logsSub}
                  </span>
                </div>

                <DataTable rows={tableRows} lang={lang} />
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Cloud Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        authStatus={{
          connected: status?.connected || !!customAuth,
          account: customAuth?.account || status?.account,
          isCustomSession: !!customAuth,
          hasEnvCredentials: status?.hasEnvCredentials,
        }}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        onApiUrlSaved={() => {
          fetchStatus();
          fetchLive();
          fetchHistory(selectedDate);
        }}
        lang={lang}
      />
    </div>
  );
}
