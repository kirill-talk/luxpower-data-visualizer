package com.luxpower.widget

import android.content.Context
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.math.roundToLong

object LuxpowerApiClient {
    private const val TIMEOUT_MS = 8000
    private const val TOTAL_CAPACITY_WH = 7680.0
    private const val BMS_CUTOFF_SOC = 15

    data class LoginResult(
        val success: Boolean,
        val cookie: String = "",
        val defaultSerial: String = "",
        val error: String = ""
    )

    data class BatteryResult(
        val success: Boolean,
        val soc: Int = -1,
        val voltage: String = "--.-",
        val updatedTime: String = "",
        val state: String = WidgetPrefs.STATE_IDLE,
        val eta: String = "",
        val powerW: Int = 0,
        val error: String = ""
    )

    private data class HttpResponse(
        val code: Int,
        val body: String
    )

    private fun executeRequest(
        urlStr: String,
        method: String,
        headers: Map<String, String> = emptyMap(),
        jsonBody: String? = null
    ): HttpResponse {
        val url = URL(urlStr)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-cache")
            headers.forEach { (k, v) ->
                if (v.isNotBlank()) {
                    setRequestProperty(k, v)
                }
            }
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            }
        }

        try {
            if (jsonBody != null) {
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(jsonBody)
                    writer.flush()
                }
            }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = if (stream != null) {
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } else {
                ""
            }
            return HttpResponse(code, body)
        } finally {
            conn.disconnect()
        }
    }

    fun login(apiBaseUrl: String, account: String, password: String): LoginResult {
        return try {
            val baseUrl = WidgetPrefs.normalizeApiUrl(apiBaseUrl)
            val payload = JSONObject().apply {
                put("account", account)
                put("password", password)
            }.toString()

            val response = executeRequest(
                urlStr = "$baseUrl/auth/login",
                method = "POST",
                jsonBody = payload
            )

            val json = JSONObject(response.body)
            val success = json.optBoolean("success", false)
            val cookie = json.optString("cookie", "")
            val defaultSerial = json.optString("defaultSerial", "")
                .let { if (it == "null") "" else it }

            if (response.code in 200..299 && success && cookie.isNotBlank()) {
                LoginResult(
                    success = true,
                    cookie = cookie,
                    defaultSerial = defaultSerial
                )
            } else {
                val err = json.optString("error", "Ошибка входа (${response.code})")
                LoginResult(success = false, error = err)
            }
        } catch (e: Exception) {
            LoginResult(
                success = false,
                error = e.message ?: "Ошибка сети при входе"
            )
        }
    }

    fun fetchBatteryData(context: Context): BatteryResult {
        val apiBaseUrl = WidgetPrefs.getApiBaseUrl(context)
        val account = WidgetPrefs.getAccount(context)
        val password = WidgetPrefs.getPassword(context)
        var serial = WidgetPrefs.getSerial(context)
        var cookie = WidgetPrefs.getCookie(context)

        val hasCredentials = account.isNotBlank() && password.isNotBlank()

        if (cookie.isBlank() && hasCredentials) {
            val loginRes = login(apiBaseUrl, account, password)
            if (!loginRes.success) {
                WidgetPrefs.saveError(context, loginRes.error)
                return BatteryResult(success = false, error = loginRes.error)
            }
            cookie = loginRes.cookie
            WidgetPrefs.saveSession(context, cookie, loginRes.defaultSerial)
            if (serial.isBlank()) {
                serial = loginRes.defaultSerial
            }
        }

        return try {
            var response = requestLiveTelemetry(apiBaseUrl, cookie, serial)

            val needsReauth = response.code == 401 || isUnloginResponse(response.body)
            if (needsReauth && hasCredentials) {
                WidgetPrefs.clearCookie(context)
                val loginRes = login(apiBaseUrl, account, password)
                if (!loginRes.success) {
                    WidgetPrefs.saveError(context, loginRes.error)
                    return BatteryResult(success = false, error = loginRes.error)
                }
                cookie = loginRes.cookie
                WidgetPrefs.saveSession(context, cookie, loginRes.defaultSerial)
                if (serial.isBlank()) {
                    serial = loginRes.defaultSerial
                }
                response = requestLiveTelemetry(apiBaseUrl, cookie, serial)
            }

            if (response.code !in 200..299) {
                val errMsg = extractErrorMessage(response.body, "HTTP ${response.code}")
                WidgetPrefs.saveError(context, errMsg)
                return BatteryResult(success = false, error = errMsg)
            }

            val json = JSONObject(response.body)
            if (json.has("success") && !json.optBoolean("success", true)) {
                val errMsg = json.optString("error")
                    .ifBlank { json.optString("msg", "Нет данных от инвертора") }
                WidgetPrefs.saveError(context, errMsg)
                return BatteryResult(success = false, error = errMsg)
            }

            val socRaw = when (val socObj = json.opt("soc")) {
                is Number -> socObj.toInt()
                is String -> socObj.replace("%", "").trim().toDoubleOrNull()?.toInt() ?: -1
                else -> -1
            }
            if (socRaw < 0) {
                val errMsg = "Нет значения SOC в ответе"
                WidgetPrefs.saveError(context, errMsg)
                return BatteryResult(success = false, error = errMsg)
            }
            val soc = socRaw.coerceIn(0, 100)

            val vBatRaw = parseDoubleField(json, "vBat")
            val volts = if (vBatRaw > 100.0) vBatRaw / 10.0 else vBatRaw
            val formattedVoltage = if (volts > 0.0) {
                String.format(Locale.US, "%.1f", volts)
            } else {
                "--.-"
            }

            val pCharge = parseDoubleField(json, "pCharge").roundToInt().coerceAtLeast(0)
            val pDisCharge = parseDoubleField(json, "pDisCharge").roundToInt().coerceAtLeast(0)
            val peps = parseDoubleField(json, "peps").roundToInt().coerceAtLeast(0)
            val vacr = parseDoubleField(json, "vacr")

            val state: String
            val powerW: Int
            val eta: String

            if (pCharge >= 20) {
                state = WidgetPrefs.STATE_CHARGING
                powerW = pCharge
                val sec = estimateChargeSeconds(soc, powerW)
                eta = when {
                    soc >= 100 -> "Полный"
                    sec != null -> formatDurationCompact(sec)
                    else -> "Заряд"
                }
            } else if (pDisCharge >= 20 || (vacr <= 50.0 && peps >= 20)) {
                state = WidgetPrefs.STATE_DISCHARGING
                powerW = if (pDisCharge >= 20) pDisCharge else peps
                val usableSoc = maxOf(0, soc - BMS_CUTOFF_SOC)
                eta = if (usableSoc <= 0) {
                    "Разряжен"
                } else {
                    val remainingWh = (usableSoc / 100.0) * TOTAL_CAPACITY_WH
                    val seconds = ((remainingWh / powerW.toDouble()) * 3600.0).roundToLong()
                    formatDurationCompact(seconds)
                }
            } else {
                state = WidgetPrefs.STATE_IDLE
                powerW = 0
                eta = if (soc >= 99) "Полный" else "Ожидание"
            }

            val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            WidgetPrefs.saveTelemetry(context, soc, formattedVoltage, timeStr, state, eta, powerW)

            BatteryResult(
                success = true,
                soc = soc,
                voltage = formattedVoltage,
                updatedTime = timeStr,
                state = state,
                eta = eta,
                powerW = powerW
            )
        } catch (e: Exception) {
            val errMsg = e.message ?: "Ошибка сети"
            WidgetPrefs.saveError(context, errMsg)
            BatteryResult(success = false, error = errMsg)
        }
    }

    /**
     * Two-stage LiFePO4 BMS charge duration estimator matching client/src/utils/energyMath.js.
     */
    private fun estimateChargeSeconds(soc: Int, chargePowerW: Int): Long? {
        if (soc >= 100 || chargePowerW < 50) return null
        val targetBulkSoc = 85
        var secondsStage1 = 0.0
        val secondsStage2: Double

        if (soc < targetBulkSoc) {
            val deltaSoc1 = targetBulkSoc - soc
            val whStage1 = (deltaSoc1 / 100.0) * TOTAL_CAPACITY_WH
            val effectivePowerStage1 = maxOf(1000.0, chargePowerW.toDouble())
            secondsStage1 = (whStage1 / effectivePowerStage1) * 3600.0

            val whStage2 = (15.0 / 100.0) * TOTAL_CAPACITY_WH
            val effectivePowerStage2 = minOf(1000.0, maxOf(500.0, effectivePowerStage1 * 0.66))
            secondsStage2 = (whStage2 / effectivePowerStage2) * 3600.0
        } else {
            val deltaSoc2 = maxOf(0, 100 - soc)
            val whStage2 = (deltaSoc2 / 100.0) * TOTAL_CAPACITY_WH
            val effectivePowerStage2 = maxOf(300.0, chargePowerW.toDouble())
            secondsStage2 = (whStage2 / effectivePowerStage2) * 3600.0
        }

        val totalSec = (secondsStage1 + secondsStage2).roundToLong()
        return if (totalSec > 0L) totalSec else null
    }

    private fun formatDurationCompact(seconds: Long): String {
        if (seconds <= 0L) return "~0м"
        val totalMinutes = maxOf(1L, (seconds + 30L) / 60L)
        val hours = totalMinutes / 60L
        val minutes = totalMinutes % 60L
        return if (hours > 0L) {
            "~${hours}ч ${minutes.toString().padStart(2, '0')}м"
        } else {
            "~${minutes}м"
        }
    }

    private fun parseDoubleField(json: JSONObject, key: String): Double {
        return when (val v = json.opt(key)) {
            is Number -> v.toDouble()
            is String -> v.trim().toDoubleOrNull() ?: 0.0
            else -> 0.0
        }
    }

    private fun requestLiveTelemetry(
        apiBaseUrl: String,
        cookie: String,
        serial: String
    ): HttpResponse {
        val headers = mutableMapOf<String, String>()
        if (cookie.isNotBlank()) {
            headers["x-lux-cookie"] = cookie
        }
        if (serial.isNotBlank()) {
            headers["x-lux-serial"] = serial
        }
        return executeRequest(
            urlStr = "$apiBaseUrl/telemetry/live",
            method = "GET",
            headers = headers
        )
    }

    private fun isUnloginResponse(body: String): Boolean {
        return try {
            val json = JSONObject(body)
            json.optString("msg") == "UNLOGIN_ERROR" || json.optString("code") == "UNLOGIN_ERROR"
        } catch (_: Exception) {
            false
        }
    }

    private fun extractErrorMessage(body: String, fallback: String): String {
        return try {
            val json = JSONObject(body)
            json.optString("error")
                .ifBlank { json.optString("msg") }
                .ifBlank { fallback }
        } catch (_: Exception) {
            fallback
        }
    }
}
