import notifee, { EventType } from '@notifee/react-native';

// Handle background events
notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail;

    // Check if the user pressed the "Mark as read" action
    if (type === EventType.ACTION_PRESS && pressAction?.id === 'mark-as-read') {
        if (notification?.id) {
            await notifee.cancelNotification(notification.id);
        }
    }
});
