import notifee, { AndroidImportance, AndroidColor, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';

export interface AlertData {
    type: string;
    severity: string;
    title: string;
    message: string;
    icon: string;
    created_at?: string;
}

class NotificationService {
    private isForegroundServiceRunning = false;

    async initialize() {
        await this.requestPermissions();
        await this.createChannels();
    }

    async requestPermissions() {
        if (Platform.OS === 'android') {
            await notifee.requestPermission();
        } else {
            await notifee.requestPermission();
        }
    }

    async createChannels() {
        await notifee.createChannel({
            id: 'foreground-service',
            name: 'Background Service',
            importance: AndroidImportance.LOW,
            lights: false,
            vibration: false,
        });

        await notifee.createChannel({
            id: 'alerts',
            name: 'Trade Alerts',
            importance: AndroidImportance.HIGH,
            lights: true,
            vibration: true,
            sound: 'default'
        });
    }

    async startForegroundService() {
        if (this.isForegroundServiceRunning) return;

        // Register a foreground service logic
        notifee.registerForegroundService((notification) => {
            return new Promise(() => {
                // Keep the promise pending to keep the service alive
                // We can add logic here if we need to do periodic tasks,
                // but for WebSocket persistence, just existing is enough.
            });
        });

        // Display the notification that puts the app in a foreground state
        await notifee.displayNotification({
            id: 'foreground-service-notification',
            title: 'AlgoTrades Running',
            body: 'Monitoring market and strategies...',
            android: {
                channelId: 'foreground-service',
                asForegroundService: true, // This is key
                color: '#2563eb', // Blue-600
                colorized: true,
                ongoing: true, // User cannot dismiss
                smallIcon: 'ic_launcher', // Ensure this resource exists, or use default
                pressAction: {
                    id: 'default',
                },
            },
        });

        this.isForegroundServiceRunning = true;
        console.log('[NOTIF] Foreground Service Started');
    }

    async stopForegroundService() {
        if (!this.isForegroundServiceRunning) return;

        await notifee.stopForegroundService();
        this.isForegroundServiceRunning = false;
        console.log('[NOTIF] Foreground Service Stopped');
    }

    async displayAlert(alert: AlertData) {
        // Determine color based on severity
        let color = AndroidColor.BLUE;
        if (alert.severity === 'SUCCESS') color = AndroidColor.GREEN;
        if (alert.severity === 'WARNING') color = AndroidColor.YELLOW;
        if (alert.severity === 'ERROR') color = AndroidColor.RED;

        await notifee.displayNotification({
            title: `${alert.icon} ${alert.title}`,
            body: alert.message,
            android: {
                channelId: 'alerts',
                color: color,
                smallIcon: 'ic_launcher',
                pressAction: {
                    id: 'default',
                },
                timestamp: Date.now(),
                showTimestamp: true,
            },
        });
    }
}

export const notificationService = new NotificationService();
