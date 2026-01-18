import { Platform, PermissionsAndroid } from 'react-native';
import { Notifications } from 'react-native-notifications';

export interface AlertData {
    type: string;
    severity: string;
    title: string;
    message: string;
    icon: string;
    created_at?: string;
}

class NotificationService {
    private isInitialized = false;

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Create notification channels for Android
            if (Platform.OS === 'android') {
                await this.createNotificationChannels();
            }

            // Request permissions for both platforms
            await this.requestPermissions();

            // Register notification events
            this.registerNotificationEvents();

            this.isInitialized = true;
            console.log('[ALGO_NOTIF] Notification service initialized successfully');
        } catch (error) {
            console.error('[ALGO_NOTIF] Failed to initialize notifications:', error);
        }
    }

    async createNotificationChannels() {
        try {
            // Create notification channels for different severity levels
            const channels = [
                {
                    channelId: 'success',
                    name: 'Success Notifications',
                    importance: 3 as const, // Default importance
                    description: 'Notifications for successful operations',
                },
                {
                    channelId: 'info',
                    name: 'Info Notifications',
                    importance: 3 as const,
                    description: 'General information notifications',
                },
                {
                    channelId: 'warning',
                    name: 'Warning Notifications',
                    importance: 4 as const, // High importance
                    description: 'Warning notifications',
                },
                {
                    channelId: 'error',
                    name: 'Error Notifications',
                    importance: 4 as const,
                    description: 'Error notifications',
                },
            ];

            for (const channel of channels) {
                Notifications.setNotificationChannel({
                    channelId: channel.channelId,
                    name: channel.name,
                    importance: channel.importance,
                    description: channel.description,
                    enableLights: true,
                    enableVibration: true,
                    showBadge: true,
                });
            }

            console.log('[ALGO_NOTIF] Notification channels created successfully');
        } catch (error) {
            console.error('[ALGO_NOTIF] Failed to create notification channels:', error);
        }
    }

    async requestPermissions() {
        try {
            if (Platform.OS === 'ios') {
                // For iOS, use the platform-specific API
                await Notifications.ios.registerRemoteNotifications();
                console.log('[ALGO_NOTIF] iOS notification permissions requested');
                return true;
            } else if (Platform.OS === 'android') {
                // For Android 13+, request POST_NOTIFICATIONS permission
                if (Platform.Version >= 33) {
                    const granted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
                    );
                    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                        console.log('[ALGO_NOTIF] Android notification permissions granted');
                        return true;
                    } else {
                        console.warn('[ALGO_NOTIF] Android notification permissions denied');
                        return false;
                    }
                } else {
                    // For Android 12 and below, permissions are granted by default
                    console.log('[ALGO_NOTIF] Android notification permissions granted by default');
                    return true;
                }
            }
            return true;
        } catch (error) {
            console.warn('[ALGO_NOTIF] Notification permissions request failed:', error);
            return false;
        }
    }

    registerNotificationEvents() {
        // Handle notification when app is in foreground
        Notifications.events().registerNotificationReceivedForeground((notification, completion) => {
            console.log('[ALGO_NOTIF] Notification received in foreground:', notification);
            completion({ alert: true, sound: true, badge: false });
        });

        // Handle notification tap
        Notifications.events().registerNotificationOpened((notification, completion) => {
            console.log('[ALGO_NOTIF] Notification opened:', notification);
            completion();
        });
    }

    async showNotification(alert: AlertData) {
        if (!this.isInitialized) {
            console.warn('[ALGO_NOTIF] Notification service not initialized');
            return;
        }

        try {
            // Determine notification priority based on severity
            const priority = alert.severity === 'ERROR' || alert.severity === 'WARNING' ? 'high' : 'default';

            // Show local notification
            // The Notification class expects a plain object payload
            const notificationPayload = {
                title: `${alert.icon} ${alert.title}`,
                body: alert.message,
                sound: 'default',
                userInfo: {
                    type: alert.type,
                    severity: alert.severity,
                    timestamp: alert.created_at || new Date().toISOString()
                },
                android: {
                    channelId: this.getChannelId(alert.severity),
                    priority: priority,
                    vibrate: true,
                    autoCancel: true,
                }
            };

            console.log(`[ALGO_NOTIF] Posting notification with payload:`, JSON.stringify(notificationPayload));
            Notifications.postLocalNotification(notificationPayload as any);

            console.log(`[ALGO_NOTIF] Notification shown: ${alert.title}`);
        } catch (error) {
            console.error('[ALGO_NOTIF] Failed to show notification:', error);
        }
    }

    getChannelId(severity: string): string {
        const severityLower = severity.toLowerCase();
        if (severityLower === 'success') return 'success';
        if (severityLower === 'warning') return 'warning';
        if (severityLower === 'error') return 'error';
        return 'info';
    }

    async clearAllNotifications() {
        try {
            Notifications.removeAllDeliveredNotifications();
        } catch (error) {
            console.warn('Failed to clear notifications:', error);
        }
    }

    addNotificationReceivedListener(callback: any) {
        return Notifications.events().registerNotificationReceivedForeground((notification, completion) => {
            callback(notification);
            completion({ alert: true, sound: true, badge: false });
        });
    }

    addNotificationResponseReceivedListener(callback: any) {
        return Notifications.events().registerNotificationOpened((notification, completion) => {
            callback({ notification });
            completion();
        });
    }
}

export const notificationService = new NotificationService();
