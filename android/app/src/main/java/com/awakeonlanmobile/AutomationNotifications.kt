package com.awakeonlanmobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

internal object AutomationNotifications {
    fun show(context: Context, id: String, result: String) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        runCatching {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("automation", "Automation results", NotificationManager.IMPORTANCE_LOW))
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, "automation") else Notification.Builder(context)
            manager.notify(id.hashCode(), builder.setSmallIcon(R.drawable.ic_wake).setContentTitle("Wake automation")
                .setContentText(result).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).build())
        }
    }
}
