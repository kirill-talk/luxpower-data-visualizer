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

object LuxpowerApiClient {
    private const val TIMEOUT_MS = 8000

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

            val vBatRaw = when (val vBatObj = json.opt("vBat")) {
                is Number -> vBatObj.toDouble()
                is String -> vBatObj.trim().toDoubleOrNull() ?: 0.0
                else -> 0.0
            }
            val volts = if (vBatRaw > 100.0) vBatRaw / 10.0 else vBatRaw
            val formattedVoltage = if (volts > 0.0) {
                String.format(Locale.US, "%.1f", volts)
            } else {
                "--.-"
            }

            val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            WidgetPrefs.saveTelemetry(context, soc, formattedVoltage, timeStr)

            BatteryResult(
                success = true,
                soc = soc,
                voltage = formattedVoltage,
                updatedTime = timeStr
            )
        } catch (e: Exception) {
            val errMsg = e.message ?: "Ошибка сети"
            WidgetPrefs.saveError(context, errMsg)
            BatteryResult(success = false, error = errMsg)
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
