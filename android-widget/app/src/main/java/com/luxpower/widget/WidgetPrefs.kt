package com.luxpower.widget

import android.content.Context
import android.content.SharedPreferences

object WidgetPrefs {
    private const val PREFS_NAME = "luxpower_widget_prefs"
    const val DEFAULT_API_URL = "https://luxpower-proxy.kirill-talk.workers.dev/api"

    const val STATE_CHARGING = "charging"
    const val STATE_DISCHARGING = "discharging"
    const val STATE_IDLE = "idle"

    private const val KEY_API_URL = "api_base_url"
    private const val KEY_ACCOUNT = "account"
    private const val KEY_PASSWORD = "password"
    private const val KEY_SERIAL = "serial"
    private const val KEY_COOKIE = "cookie"
    private const val KEY_LAST_SOC = "last_soc"
    private const val KEY_LAST_VOLTAGE = "last_voltage"
    private const val KEY_LAST_UPDATED = "last_updated_time"
    private const val KEY_LAST_STATE = "last_state"
    private const val KEY_LAST_ETA = "last_eta"
    private const val KEY_LAST_POWER_W = "last_power_w"
    private const val KEY_LAST_ERROR = "last_error"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun normalizeApiUrl(rawUrl: String?): String {
        val trimmed = (rawUrl ?: "").trim().trimEnd('/')
        if (trimmed.isEmpty()) return DEFAULT_API_URL
        return if (trimmed.endsWith("/api")) trimmed else "$trimmed/api"
    }

    fun getApiBaseUrl(context: Context): String {
        val stored = prefs(context).getString(KEY_API_URL, DEFAULT_API_URL)
        return normalizeApiUrl(stored)
    }

    fun getAccount(context: Context): String =
        prefs(context).getString(KEY_ACCOUNT, "") ?: ""

    fun getPassword(context: Context): String =
        prefs(context).getString(KEY_PASSWORD, "") ?: ""

    fun getSerial(context: Context): String =
        prefs(context).getString(KEY_SERIAL, "") ?: ""

    fun getCookie(context: Context): String =
        prefs(context).getString(KEY_COOKIE, "") ?: ""

    fun getLastSoc(context: Context): Int =
        prefs(context).getInt(KEY_LAST_SOC, -1)

    fun getLastVoltage(context: Context): String =
        prefs(context).getString(KEY_LAST_VOLTAGE, "") ?: ""

    fun getLastUpdatedTime(context: Context): String =
        prefs(context).getString(KEY_LAST_UPDATED, "") ?: ""

    fun getLastState(context: Context): String =
        prefs(context).getString(KEY_LAST_STATE, STATE_IDLE) ?: STATE_IDLE

    fun getLastEta(context: Context): String =
        prefs(context).getString(KEY_LAST_ETA, "") ?: ""

    fun getLastPowerW(context: Context): Int =
        prefs(context).getInt(KEY_LAST_POWER_W, 0)

    fun getLastError(context: Context): String =
        prefs(context).getString(KEY_LAST_ERROR, "") ?: ""

    fun saveConfig(
        context: Context,
        apiBaseUrl: String,
        account: String,
        password: String,
        serial: String
    ) {
        val oldApi = getApiBaseUrl(context)
        val oldAccount = getAccount(context)
        val oldPassword = getPassword(context)
        val newApi = normalizeApiUrl(apiBaseUrl)
        val newAccount = account.trim()
        val newSerial = serial.trim()

        val editor = prefs(context).edit()
            .putString(KEY_API_URL, newApi)
            .putString(KEY_ACCOUNT, newAccount)
            .putString(KEY_PASSWORD, password)
            .putString(KEY_SERIAL, newSerial)

        if (oldApi != newApi || oldAccount != newAccount || oldPassword != password) {
            editor.remove(KEY_COOKIE)
        }
        editor.apply()
    }

    fun saveSession(context: Context, cookie: String, serial: String?) {
        val editor = prefs(context).edit().putString(KEY_COOKIE, cookie)
        if (!serial.isNullOrBlank() && getSerial(context).isBlank()) {
            editor.putString(KEY_SERIAL, serial.trim())
        }
        editor.apply()
    }

    fun clearCookie(context: Context) {
        prefs(context).edit().remove(KEY_COOKIE).apply()
    }

    fun saveTelemetry(
        context: Context,
        soc: Int,
        voltage: String,
        updatedTime: String,
        state: String,
        eta: String,
        powerW: Int
    ) {
        prefs(context).edit()
            .putInt(KEY_LAST_SOC, soc)
            .putString(KEY_LAST_VOLTAGE, voltage)
            .putString(KEY_LAST_UPDATED, updatedTime)
            .putString(KEY_LAST_STATE, state)
            .putString(KEY_LAST_ETA, eta)
            .putInt(KEY_LAST_POWER_W, powerW)
            .remove(KEY_LAST_ERROR)
            .apply()
    }

    fun saveError(context: Context, error: String) {
        prefs(context).edit()
            .putString(KEY_LAST_ERROR, error)
            .apply()
    }
}
