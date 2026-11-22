package com.luxpower.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class BatteryWidgetProvider : AppWidgetProvider() {

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        schedulePeriodicWork(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        schedulePeriodicWork(context)
        updateWidgetsFromPrefs(context, appWidgetManager, appWidgetIds, isLoading = true)
        triggerAsyncRefresh(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = getWidgetIds(context, manager)
            if (ids.isNotEmpty()) {
                updateWidgetsFromPrefs(context, manager, ids, isLoading = true)
                triggerAsyncRefresh(context)
            }
        }
    }

    private fun triggerAsyncRefresh(context: Context) {
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        executor.execute {
            try {
                LuxpowerApiClient.fetchBatteryData(appContext)
                updateAllWidgets(appContext)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.luxpower.widget.ACTION_REFRESH"
        private const val WORK_NAME = "luxpower_battery_periodic_sync"
        private val executor = Executors.newSingleThreadExecutor()

        fun getWidgetIds(context: Context, manager: AppWidgetManager): IntArray {
            val component = ComponentName(context, BatteryWidgetProvider::class.java)
            return manager.getAppWidgetIds(component)
        }

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = getWidgetIds(context, manager)
            if (ids.isNotEmpty()) {
                updateWidgetsFromPrefs(context, manager, ids, isLoading = false)
            }
        }

        fun schedulePeriodicWork(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(
                15, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        fun socColor(soc: Int): Int {
            return when {
                soc < 0 -> Color.parseColor("#94A3B8")
                soc >= 50 -> Color.parseColor("#10B981")
                soc >= 25 -> Color.parseColor("#F59E0B")
                else -> Color.parseColor("#F43F5E")
            }
        }

        fun stateIconRes(state: String): Int {
            return when (state) {
                WidgetPrefs.STATE_CHARGING -> R.drawable.ic_state_charging
                WidgetPrefs.STATE_DISCHARGING -> R.drawable.ic_state_discharging
                else -> R.drawable.ic_state_idle
            }
        }

        fun etaColor(state: String): Int {
            return when (state) {
                WidgetPrefs.STATE_CHARGING -> Color.parseColor("#34D399")
                WidgetPrefs.STATE_DISCHARGING -> Color.parseColor("#FBBF24")
                else -> Color.parseColor("#94A3B8")
            }
        }

        fun formatVoltageLine(voltage: String, state: String, powerW: Int, fallback: String): String {
            if (voltage.isBlank()) return fallback
            return when {
                state == WidgetPrefs.STATE_CHARGING && powerW > 0 -> "$voltage В • +${powerW} Вт"
                state == WidgetPrefs.STATE_DISCHARGING && powerW > 0 -> "$voltage В • -${powerW} Вт"
                else -> "$voltage В"
            }
        }

        private fun updateWidgetsFromPrefs(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray,
            isLoading: Boolean
        ) {
            val soc = WidgetPrefs.getLastSoc(context)
            val voltage = WidgetPrefs.getLastVoltage(context)
            val updatedTime = WidgetPrefs.getLastUpdatedTime(context)
            val state = WidgetPrefs.getLastState(context)
            val eta = WidgetPrefs.getLastEta(context)
            val powerW = WidgetPrefs.getLastPowerW(context)
            val lastError = WidgetPrefs.getLastError(context)

            val socText = if (soc >= 0) "$soc%" else context.getString(R.string.widget_placeholder_soc)
            val voltageText = formatVoltageLine(
                voltage = voltage,
                state = state,
                powerW = powerW,
                fallback = context.getString(R.string.widget_placeholder_voltage)
            )
            val progressVal = if (soc >= 0) soc.coerceIn(0, 100) else 0

            val etaText = when {
                state == WidgetPrefs.STATE_CHARGING && eta.startsWith("~") -> "Заряд $eta"
                state == WidgetPrefs.STATE_DISCHARGING && eta.startsWith("~") -> "Разряд $eta"
                else -> eta
            }

            val statusText = when {
                isLoading -> "..."
                lastError.isNotBlank() -> "Ош: $lastError"
                updatedTime.isNotBlank() -> updatedTime
                else -> context.getString(R.string.widget_waiting)
            }

            val refreshIntent = Intent(context, BatteryWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val settingsIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val settingsPendingIntent = PendingIntent.getActivity(
                context,
                1,
                settingsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            for (appWidgetId in appWidgetIds) {
                val views = RemoteViews(context.packageName, R.layout.widget_battery).apply {
                    setImageViewResource(R.id.widget_state_icon, stateIconRes(state))
                    setTextViewText(R.id.widget_soc, socText)
                    setTextColor(R.id.widget_soc, socColor(soc))
                    setTextViewText(R.id.widget_eta, etaText)
                    setTextColor(R.id.widget_eta, etaColor(state))
                    setTextViewText(R.id.widget_voltage, voltageText)
                    setProgressBar(R.id.widget_progress, 100, progressVal, false)
                    setTextViewText(R.id.widget_updated, statusText)
                    setOnClickPendingIntent(R.id.widget_root, refreshPendingIntent)
                    setOnClickPendingIntent(R.id.widget_btn_refresh, refreshPendingIntent)
                    setOnClickPendingIntent(R.id.widget_btn_settings, settingsPendingIntent)
                }
                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }
    }
}
