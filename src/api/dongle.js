const net = require('net');

/**
 * Strict Read-Only LAN Client for Luxpower Wi-Fi Dongle (TCP port 8000).
 *
 * Security / Safety Guarantee:
 * - Implements ONLY Modbus function 0x04 (Read Input Registers) for telemetry banks 0..119.
 * - Never sends Holding Register reads (0x03) or any Write commands (0x06 / 0x10).
 * - Host, port, and serial numbers are supplied via environment variables / runtime config.
 */
class LuxpowerDongleClient {
  constructor(options = {}) {
    this.host = options.host || process.env.LUX_DONGLE_HOST || '';
    this.port = parseInt(options.port || process.env.LUX_DONGLE_PORT || '8000', 10);
    this.datalogSn = options.datalogSn || process.env.LUX_DONGLE_SN || '';
    this.inverterSn = options.inverterSn || process.env.LUX_INVERTER_SN || '';
    this.timezoneOffsetMinutes = Number.isFinite(Number(options.timezoneOffsetMinutes))
      ? Number(options.timezoneOffsetMinutes)
      : (Number(process.env.LUX_TIMEZONE_OFFSET ?? 2) * 60);

    this.cacheTtlMs = options.cacheTtlMs || 10000;
    this.timeoutMs = options.timeoutMs || 5000;

    this.cachedResult = null;
    this.lastSuccessAt = 0;
    this.lastError = null;
    this.inFlightPromise = null;

    // In-memory rolling history for the current day
    this.historyDate = null;
    this.historyRows = []; // newest first (matches /api/telemetry/table)
    this.chartPoints = []; // oldest first (matches /api/telemetry/day-chart)
    this.lastRecordedRowAt = 0;
    this.lastRecordedChartAt = 0;
    this.lastGridOnlineState = null;
  }

  isConfigured() {
    return !!(this.host && this.datalogSn && this.inverterSn);
  }

  isConnected() {
    return this.isConfigured() && this.lastSuccessAt > 0 && (Date.now() - this.lastSuccessAt < 60000);
  }

  setSerials({ datalogSn, inverterSn, timezoneOffsetMinutes } = {}) {
    if (datalogSn && !this.datalogSn) this.datalogSn = datalogSn;
    if (inverterSn && !this.inverterSn) this.inverterSn = inverterSn;
    if (Number.isFinite(timezoneOffsetMinutes)) {
      this.timezoneOffsetMinutes = timezoneOffsetMinutes;
    }
  }

  getStatus() {
    return {
      dongleEnabled: !!this.host,
      dongleConfigured: this.isConfigured(),
      dongleConnected: this.isConnected(),
      lastDongleSync: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      lastDongleError: this.lastError,
    };
  }

  static crc16Modbus(buf) {
    let crc = 0xffff;
    for (const b of buf) {
      crc ^= b;
      for (let i = 0; i < 8; i++) {
        if (crc & 1) crc = (crc >> 1) ^ 0xa001;
        else crc >>= 1;
      }
    }
    return crc;
  }

  /**
   * Builds a strictly Read-Only (0x04 Read Input Registers) Luxpower LAN packet.
   */
  buildReadInputPacket(startReg, count = 40) {
    const READ_INPUT_REGISTERS_FUNC = 0x04;
    const datalogBuf = Buffer.from(String(this.datalogSn).slice(0, 10).padEnd(10, '\0'), 'ascii');
    const inverterBuf = Buffer.from(String(this.inverterSn).slice(0, 10).padEnd(10, '\0'), 'ascii');

    const dataFrame = Buffer.alloc(18);
    dataFrame[0] = 0x00;
    dataFrame[1] = READ_INPUT_REGISTERS_FUNC;
    inverterBuf.copy(dataFrame, 2);
    dataFrame.writeUInt16LE(startReg, 12);
    dataFrame.writeUInt16LE(count, 14);
    const crc = LuxpowerDongleClient.crc16Modbus(dataFrame.subarray(0, 16));
    dataFrame.writeUInt16LE(crc, 16);

    const packet = Buffer.alloc(38);
    packet[0] = 0xa1;
    packet[1] = 0x1a;
    packet.writeUInt16LE(1, 2); // protocol 1
    packet.writeUInt16LE(32, 4); // frame length (total 38 - 6)
    packet[6] = 0x01;
    packet[7] = 0xc2; // TRANSLATED_DATA
    datalogBuf.copy(packet, 8);
    packet.writeUInt16LE(18, 18);
    dataFrame.copy(packet, 20);
    return packet;
  }

  getInverterTimeInfo(nowMs = Date.now()) {
    const localMs = nowMs + this.timezoneOffsetMinutes * 60 * 1000;
    const d = new Date(localMs);
    const pad = (n) => String(n).padStart(2, '0');
    const year = d.getUTCFullYear();
    const monthZero = d.getUTCMonth();
    const month = monthZero + 1;
    const day = d.getUTCDate();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    const second = d.getUTCSeconds();
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const timeStr = `${dateStr} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
    return {
      dateStr,
      timeStr,
      slashDate: `${year}/${pad(month)}/${pad(day)}`,
      year,
      month: monthZero,
      day,
      hour,
      minute,
      second,
    };
  }

  /**
   * Reads the 3 Input Register banks (0..39, 40..79, 80..119) sequentially over TCP.
   */
  readAllInputBanks() {
    return new Promise((resolve, reject) => {
      if (!this.isConfigured()) {
        return reject(new Error('Dongle host or serial numbers not configured'));
      }

      const banks = [0, 40, 80];
      const allRegs = Buffer.alloc(240);
      const gotBanks = new Set();
      let rxBuffer = Buffer.alloc(0);
      let settled = false;

      const sock = new net.Socket();
      const finish = (err, buf) => {
        if (settled) return;
        settled = true;
        sock.destroy();
        if (err) reject(err);
        else resolve(buf);
      };

      sock.setTimeout(this.timeoutMs);

      sock.on('timeout', () => {
        finish(new Error(`Dongle TCP timeout after ${this.timeoutMs}ms (received banks: ${[...gotBanks].join(',') || 'none'})`));
      });

      sock.on('error', (err) => {
        finish(err);
      });

      sock.on('close', () => {
        if (!settled) {
          finish(new Error('Dongle TCP socket closed before all register banks were read'));
        }
      });

      sock.connect(this.port, this.host, () => {
        sock.write(this.buildReadInputPacket(0, 40));
      });

      sock.on('data', (chunk) => {
        rxBuffer = Buffer.concat([rxBuffer, chunk]);

        while (rxBuffer.length >= 6) {
          if (rxBuffer[0] !== 0xa1 || rxBuffer[1] !== 0x1a) {
            const magicIdx = rxBuffer.indexOf(Buffer.from([0xa1, 0x1a]), 1);
            if (magicIdx === -1) {
              rxBuffer = Buffer.alloc(0);
              break;
            }
            rxBuffer = rxBuffer.subarray(magicIdx);
            if (rxBuffer.length < 6) break;
          }

          const frameLen = rxBuffer.readUInt16LE(4);
          if (frameLen < 14 || frameLen > 1024) {
            rxBuffer = rxBuffer.subarray(2);
            continue;
          }

          const totalLen = 6 + frameLen;
          if (rxBuffer.length < totalLen) break;

          const frame = rxBuffer.subarray(0, totalLen);
          rxBuffer = rxBuffer.subarray(totalLen);

          if (frame[7] !== 0xc2 || frame.length < 36) continue;

          const dataLen = frame.readUInt16LE(18);
          if (20 + dataLen > frame.length || dataLen < 17) continue;

          const data = frame.subarray(20, 20 + dataLen);
          const mFunc = data[1];
          if (mFunc !== 0x04) continue; // Accept strictly 0x04 Input Register responses

          // Validate CRC if trailer is present
          if (dataLen >= 17) {
            const expectedCrc = data.readUInt16LE(dataLen - 2);
            const actualCrc = LuxpowerDongleClient.crc16Modbus(data.subarray(0, dataLen - 2));
            if (expectedCrc !== actualCrc) continue;
          }

          const startReg = data.readUInt16LE(12);
          const byteCount = data[14];
          if (byteCount === 80 && banks.includes(startReg) && 15 + byteCount <= data.length) {
            data.subarray(15, 15 + 80).copy(allRegs, startReg * 2);
            gotBanks.add(startReg);

            if (startReg === 0 && !gotBanks.has(40)) {
              sock.write(this.buildReadInputPacket(40, 40));
            } else if (startReg === 40 && !gotBanks.has(80)) {
              sock.write(this.buildReadInputPacket(80, 40));
            } else if (gotBanks.size === banks.length) {
              finish(null, allRegs);
              return;
            }
          }
        }
      });
    });
  }

  decodeRegisters(regs) {
    const r = (idx) => regs.readUInt16LE(idx * 2);
    const rs = (idx) => regs.readInt16LE(idx * 2);
    const r32 = (idx) => regs.readUInt32LE(idx * 2);

    const t = this.getInverterTimeInfo();

    const status = r(0);
    const vpv1Raw = r(1);
    const vpv2Raw = r(2);
    const vpv3Raw = r(3);
    const vBatRaw = r(4);
    const soc = r(5) & 0xff;

    const ppv1 = r(7);
    const ppv2 = r(8);
    const ppv3 = r(9);
    const ppv = ppv1 + ppv2 + ppv3;
    const pCharge = r(10);
    const pDisCharge = r(11);

    const vacrRaw = r(12);
    const vacsRaw = r(13);
    const vactRaw = r(14);
    const facRaw = r(15);
    const pinv = r(16);
    const prec = r(17);
    const qac = rs(18);
    const pfRaw = r(19);

    const vepsrRaw = r(20);
    const vepssRaw = r(21);
    const vepstRaw = r(22);
    const fepsRaw = r(23);
    const peps = r(24);
    const seps = r(25);

    const pToGrid = r(26);
    const pToUser = r(27);

    const ePv1Day = Number((r(28) / 10).toFixed(1));
    const ePv2Day = Number((r(29) / 10).toFixed(1));
    const ePv3Day = Number((r(30) / 10).toFixed(1));
    const ePvDay = Number((ePv1Day + ePv2Day + ePv3Day).toFixed(1));
    const eInvDay = Number((r(31) / 10).toFixed(1));
    const eRecDay = Number((r(32) / 10).toFixed(1));
    const eChgDay = Number((r(33) / 10).toFixed(1));
    const eDisChgDay = Number((r(34) / 10).toFixed(1));
    const eEpsDay = Number((r(35) / 10).toFixed(1));
    const eToGridDay = Number((r(36) / 10).toFixed(1));
    const eToUserDay = Number((r(37) / 10).toFixed(1));

    const vBus1Raw = r(38);
    const vBus2Raw = r(39);

    const ePv1All = Number((r32(40) / 10).toFixed(1));
    const ePv2All = Number((r32(42) / 10).toFixed(1));
    const ePv3All = Number((r32(44) / 10).toFixed(1));
    const ePvAll = Number((ePv1All + ePv2All + ePv3All).toFixed(1));
    const eInvAll = Number((r32(46) / 10).toFixed(1));
    const eRecAll = Number((r32(48) / 10).toFixed(1));
    const eChgAll = Number((r32(50) / 10).toFixed(1));
    const eDisChgAll = Number((r32(52) / 10).toFixed(1));
    const eEpsAll = Number((r32(54) / 10).toFixed(1));
    const eToGridAll = Number((r32(56) / 10).toFixed(1));
    const eToUserAll = Number((r32(58) / 10).toFixed(1));

    const faultCode = r32(60);
    const warningCode = r32(62);

    const tinner = rs(64);
    const tradiator1 = rs(65);
    const tradiator2 = rs(66);
    const tBat = rs(67);
    const runningTime = r32(69);

    const maxChgCurrRaw = r(81);
    const maxDischgCurrRaw = r(82);
    const chargeVoltRefRaw = r(83);
    const dischgCutVoltRaw = r(84);

    const hexReg = (idx) => `0x${r(idx).toString(16).toUpperCase().padStart(2, '0')}`;
    const batStatus0 = hexReg(85);
    const batStatus1 = hexReg(86);
    const batStatus2 = hexReg(87);
    const batStatus3 = hexReg(88);
    const batStatus4 = hexReg(89);
    const batStatus5 = hexReg(90);
    const batStatus6 = hexReg(91);
    const batStatus7 = hexReg(92);
    const batStatus8 = hexReg(93);
    const batStatus9 = hexReg(94);
    const batStatusInvVal = r(95);
    const batStatusInv = hexReg(95);

    const batParallelNum = r(96);
    const batCapacity = r(97);
    const bmsBatCurrentDeciAmps = rs(98); // e.g., -92 -> -9.2 A
    const bmsBatCurrentAmps = Number((bmsBatCurrentDeciAmps / 10).toFixed(1));

    const bmsEvent1 = hexReg(99);
    const bmsEvent2 = hexReg(100);
    const bmsMaxCellVolt = Number((r(101) / 1000).toFixed(3));
    const bmsMinCellVolt = Number((r(102) / 1000).toFixed(3));
    const bmsMaxCellTemp = rs(103);
    const bmsMinCellTemp = rs(104);
    const battInternalVolt = Number((r(105) / 10).toFixed(1));
    const bmsCycleCnt = r(106);
    const invBatVoltSample = Number((r(107) / 10).toFixed(1));
    const bmsFwUpdateState = r(113);

    const isGridOnline = vacrRaw > 500;
    const pLoadNum = isGridOnline ? Math.max(0, pToUser + pinv - prec - pToGrid) : 0;
    const consumptionPower = peps > 0 ? peps : pLoadNum;

    const bmsCharge = (batStatusInvVal & 0x01) !== 0;
    const bmsDischarge = (batStatusInvVal & 0x02) !== 0;
    const bmsForceCharge = (batStatusInvVal & 0x04) !== 0;

    const statusHex = `0x${status.toString(16)}`;
    const tableStatusText = isGridOnline
      ? (pCharge > 0 ? 'Battery Grid on' : 'Grid on')
      : 'Battery EPS';

    const live = {
      success: true,
      source: 'dongle',
      serialNum: this.inverterSn,
      lost: false,
      hasRuntimeData: true,
      status,
      statusText: faultCode > 0 ? 'fault' : 'normal',
      runningTime,
      batteryType: 'LITHIUM',
      batParallelNum: String(batParallelNum || 2),
      batCapacity: String(batCapacity || 100),
      faultCode,
      warningCode,
      deviceTime: t.timeStr,
      deviceTimeText: t.slashDate,
      vpv1: vpv1Raw,
      vpv2: vpv2Raw,
      vpv3: vpv3Raw,
      ppv1,
      ppv2,
      ppv3,
      ppv,
      vacr: vacrRaw,
      vacs: vacsRaw,
      vact: vactRaw,
      fac: facRaw,
      pf: `[${pfRaw}]`,
      vepsr: vepsrRaw,
      vepss: vepssRaw,
      vepst: vepstRaw,
      feps: fepsRaw,
      peps,
      seps,
      pToGrid,
      pToUser,
      tinner,
      tradiator1,
      tradiator2,
      tBat,
      vBus1: vBus1Raw,
      vBus2: vBus2Raw,
      // Cloud live API scales bmsBatCurrent by x100 (e.g. -10.6 A -> -1060)
      bmsBatCurrent: bmsBatCurrentDeciAmps * 10,
      pCharge,
      pDisCharge,
      batPower: pCharge > 0 ? pCharge : -pDisCharge,
      soc,
      vBat: vBatRaw,
      pinv,
      prec,
      maxChgCurr: maxChgCurrRaw,
      maxDischgCurr: maxDischgCurrRaw,
      maxChgCurrValue: Number((maxChgCurrRaw / 10).toFixed(1)),
      maxDischgCurrValue: Number((maxDischgCurrRaw / 10).toFixed(1)),
      bmsCharge,
      bmsDischarge,
      bmsForceCharge,
      consumptionPower,
      // Extended real-time fields from dongle (not normally present in cloud live snapshot)
      ePvDay,
      eChgDay,
      eDisChgDay,
      eEpsDay,
      eToGridDay,
      eToUserDay,
      eChgAll,
      eDisChgAll,
      eEpsAll,
      eToUserAll,
      chargeVoltRef: Number((chargeVoltRefRaw / 10).toFixed(1)),
      battInternalVolt,
      invBatVoltSample,
      bmsCycleCnt,
    };

    const tableRow = {
      serialNum: this.inverterSn,
      time: t.timeStr,
      status: statusHex,
      statusText: tableStatusText,
      vpv1: String(Number((vpv1Raw / 10).toFixed(1))),
      vpv2: String(Number((vpv2Raw / 10).toFixed(1))),
      vpv3: String(Number((vpv3Raw / 10).toFixed(1))),
      vBat: String(Number((vBatRaw / 10).toFixed(1))),
      soc: `${soc}%`,
      ppv,
      ppv1,
      ppv2,
      ppv3,
      pCharge,
      pDisCharge,
      vacr: String(Number((vacrRaw / 10).toFixed(1))),
      vacs: String(Number((vacsRaw / 10).toFixed(1))),
      vact: String(Number((vactRaw / 10).toFixed(1))),
      fac: String(Number((facRaw / 100).toFixed(2))),
      pinv,
      prec,
      qac,
      pf: `[${pfRaw}]`,
      vepsr: String(Number((vepsrRaw / 10).toFixed(1))),
      vepss: String(Number((vepssRaw / 10).toFixed(1))),
      vepst: String(Number((vepstRaw / 10).toFixed(1))),
      feps: String(Number((fepsRaw / 100).toFixed(2))),
      peps,
      seps,
      pToGrid,
      pToUser,
      pLoad: isGridOnline ? String(pLoadNum) : '',
      ePvDay: String(ePvDay),
      ePv1Day: String(ePv1Day),
      ePv2Day: String(ePv2Day),
      ePv3Day: String(ePv3Day),
      eInvDay: String(eInvDay),
      eRecDay: String(eRecDay),
      eChgDay: String(eChgDay),
      eDisChgDay: String(eDisChgDay),
      eEpsDay: String(eEpsDay),
      eToGridDay: String(eToGridDay),
      eToUserDay: String(eToUserDay),
      ePvAll: String(ePvAll),
      ePv1All: String(ePv1All),
      ePv2All: String(ePv2All),
      ePv3All: String(ePv3All),
      eInvAll: String(eInvAll),
      eRecAll: String(eRecAll),
      eChgAll: String(eChgAll),
      eDisChgAll: String(eDisChgAll),
      eEpsAll: String(eEpsAll),
      eToGridAll: String(eToGridAll),
      eToUserAll: String(eToUserAll),
      faultCode: `0x${faultCode.toString(16)}`,
      warningCode: `0x${warningCode.toString(16)}`,
      tinner,
      tradiator1,
      tradiator2,
      tradiator3: '0',
      tBat,
      vBus1: String(Number((vBus1Raw / 10).toFixed(1))),
      vBus2: String(Number((vBus2Raw / 10).toFixed(1))),
      maxChgCurr: String(Number((maxChgCurrRaw / 10).toFixed(1))),
      maxDischgCurr: String(Number((maxDischgCurrRaw / 10).toFixed(1))),
      bmsBatCurrent: String(bmsBatCurrentAmps),
      chargeVoltRef: String(Number((chargeVoltRefRaw / 10).toFixed(1))),
      dischgCutVolt: String(Number((dischgCutVoltRaw / 10).toFixed(1))),
      batStatus0,
      batStatus1,
      batStatus2,
      batStatus3,
      batStatus4,
      batStatus5,
      batStatus6,
      batStatus7,
      batStatus8,
      batStatus9,
      batStatusInv,
      internalFault: '0x00',
      bmsEvent1,
      bmsEvent2,
      bmsMaxCellVolt: String(bmsMaxCellVolt),
      bmsMinCellVolt: String(bmsMinCellVolt),
      bmsMaxCellTemp: String(bmsMaxCellTemp),
      bmsMinCellTemp: String(bmsMinCellTemp),
      bmsFwUpdateState: String(bmsFwUpdateState),
      bmsCycleCnt: String(bmsCycleCnt),
      invBatVoltSample: String(invBatVoltSample),
      battInternalVolt: String(battInternalVolt),
      source: 'dongle',
    };

    const chartPoint = {
      time: t.timeStr,
      year: t.year,
      month: t.month,
      day: t.day,
      hour: t.hour,
      minute: t.minute,
      second: t.second,
      solarPv: ppv,
      gridPower: pToGrid > 0 ? pToGrid : (pToUser > 0 ? -pToUser : 0),
      batteryDischarging: pDisCharge > 0 ? pDisCharge : (pCharge > 0 ? -pCharge : 0),
      consumption: consumptionPower,
      soc,
      acCouplePower: 0,
    };

    return { dateStr: t.dateStr, isGridOnline, live, tableRow, chartPoint };
  }

  recordRollingPoint(decoded) {
    const now = Date.now();
    if (this.historyDate !== decoded.dateStr) {
      this.historyDate = decoded.dateStr;
      this.historyRows = [];
      this.chartPoints = [];
      this.lastRecordedRowAt = 0;
      this.lastRecordedChartAt = 0;
      this.lastGridOnlineState = null;
    }

    const stateChanged =
      this.lastGridOnlineState !== null && this.lastGridOnlineState !== decoded.isGridOnline;
    this.lastGridOnlineState = decoded.isGridOnline;

    // Record table row every 60s or on Grid/EPS state transition
    if (this.historyRows.length === 0 || stateChanged || now - this.lastRecordedRowAt >= 60000) {
      this.historyRows.unshift(decoded.tableRow);
      if (this.historyRows.length > 1440) {
        this.historyRows.length = 1440;
      }
      this.lastRecordedRowAt = now;
    }

    // Record chart point every 5 mins or on Grid/EPS state transition
    if (this.chartPoints.length === 0 || stateChanged || now - this.lastRecordedChartAt >= 300000) {
      this.chartPoints.push(decoded.chartPoint);
      if (this.chartPoints.length > 500) {
        this.chartPoints.length = 500;
      }
      this.lastRecordedChartAt = now;
    }
  }

  async pollSnapshot({ force = false } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Dongle not configured');
    }
    const now = Date.now();
    if (!force && this.cachedResult && now - this.lastSuccessAt < this.cacheTtlMs) {
      return this.cachedResult;
    }

    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        const rawBuf = await this.readAllInputBanks();
        const decoded = this.decodeRegisters(rawBuf);
        this.cachedResult = decoded;
        this.lastSuccessAt = Date.now();
        this.lastError = null;
        this.recordRollingPoint(decoded);
        return decoded;
      } catch (err) {
        this.lastError = err.message;
        throw err;
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  async getLiveTelemetry() {
    const snapshot = await this.pollSnapshot();
    return snapshot.live;
  }

  getTodayRows(dateStr) {
    const targetDate = dateStr || this.getInverterTimeInfo().dateStr;
    if (this.historyDate !== targetDate) return [];
    return this.historyRows;
  }

  getTodayChartPoints(dateStr) {
    const targetDate = dateStr || this.getInverterTimeInfo().dateStr;
    if (this.historyDate !== targetDate) return [];
    return this.chartPoints;
  }
}

module.exports = LuxpowerDongleClient;
