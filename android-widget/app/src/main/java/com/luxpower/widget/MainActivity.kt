package com.luxpower.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private val executor = Executors.newSingleThreadExecutor()

    private lateinit var editApiUrl: EditText
    private lateinit var editAccount: EditText
    private lateinit var editPassword: EditText
    private lateinit var editSerial: EditText
    private lateinit var previewSoc: TextView
    private lateinit var previewVoltage: TextView
    private lateinit var textStatus: TextView
    private lateinit var btnSaveRefresh: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(RESULT_CANCELED)
        }

        editApiUrl = findViewById(R.id.edit_api_url)
        editAccount = findViewById(R.id.edit_account)
        editPassword = findViewById(R.id.edit_password)
        editSerial = findViewById(R.id.edit_serial)
        previewSoc = findViewById(R.id.preview_soc)
        previewVoltage = findViewById(R.id.preview_voltage)
        textStatus = findViewById(R.id.text_status)
        btnSaveRefresh = findViewById(R.id.btn_save_refresh)

        editApiUrl.setText(WidgetPrefs.getApiBaseUrl(this))
        editAccount.setText(WidgetPrefs.getAccount(this))
        editPassword.setText(WidgetPrefs.getPassword(this))
        editSerial.setText(WidgetPrefs.getSerial(this))

        renderPreviewFromPrefs()

        btnSaveRefresh.setOnClickListener {
            saveAndRefresh()
        }
    }

    private fun renderPreviewFromPrefs() {
        val soc = WidgetPrefs.getLastSoc(this)
        val voltage = WidgetPrefs.getLastVoltage(this)
        val updated = WidgetPrefs.getLastUpdatedTime(this)
        val error = WidgetPrefs.getLastError(this)

        previewSoc.text = if (soc >= 0) "$soc%" else getString(R.string.widget_placeholder_soc)
        previewSoc.setTextColor(BatteryWidgetProvider.socColor(soc))
        previewVoltage.text = if (voltage.isNotBlank()) "$voltage В" else getString(R.string.widget_placeholder_voltage)

        textStatus.text = when {
            error.isNotBlank() -> "Ошибка: $error"
            updated.isNotBlank() -> "Обновлено в $updated"
            else -> getString(R.string.widget_waiting)
        }
    }

    private fun saveAndRefresh() {
        val apiUrl = editApiUrl.text.toString()
        val account = editAccount.text.toString()
        val password = editPassword.text.toString()
        val serial = editSerial.text.toString()

        WidgetPrefs.saveConfig(this, apiUrl, account, password, serial)

        btnSaveRefresh.isEnabled = false
        textStatus.text = "Подключение и обновление..."

        val appContext = applicationContext
        executor.execute {
            val result = LuxpowerApiClient.fetchBatteryData(appContext)
            runOnUiThread {
                btnSaveRefresh.isEnabled = true

                val resolvedSerial = WidgetPrefs.getSerial(appContext)
                if (resolvedSerial.isNotBlank() && editSerial.text.toString().isBlank()) {
                    editSerial.setText(resolvedSerial)
                }

                renderPreviewFromPrefs()
                BatteryWidgetProvider.updateAllWidgets(appContext)
                BatteryWidgetProvider.schedulePeriodicWork(appContext)

                if (result.success) {
                    if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                        val resultValue = Intent().apply {
                            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                        }
                        setResult(RESULT_OK, resultValue)
                        finish()
                    }
                }
            }
        }
    }
}
