package com.luxpower.widget

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class WidgetUpdateWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        LuxpowerApiClient.fetchBatteryData(applicationContext)
        BatteryWidgetProvider.updateAllWidgets(applicationContext)
        return Result.success()
    }
}
