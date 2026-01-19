import { NativeModules, Platform } from 'react-native';

const { WidgetUpdate } = NativeModules;

/**
 * Service to manage Android home screen widget updates
 */
class WidgetService {
    private lastPnl: number = 0;
    private lastPeakProfit: number = 0;
    private lastPeakLoss: number = 0;

    constructor() {
        // Log widget module availability on initialization
        if (Platform.OS === 'android') {
            if (WidgetUpdate) {
                console.log('[WIDGET] WidgetUpdate module is available');
                console.log('[WIDGET] Available methods:', Object.keys(WidgetUpdate));
            } else {
                console.warn('[WIDGET] WidgetUpdate module is NOT available - widget will not work');
            }
        }
    }

    /**
     * Update the widget with new P&L data
     * 
     * @param pnl Current P&L value
     * @param peakProfit Peak profit value
     * @param peakLoss Peak loss value
     */
    async updateWidget(pnl: number, peakProfit: number, peakLoss: number): Promise<void> {
        // Only update on Android
        if (Platform.OS !== 'android') {
            return;
        }

        // Only update if values have changed
        if (
            pnl === this.lastPnl &&
            peakProfit === this.lastPeakProfit &&
            peakLoss === this.lastPeakLoss
        ) {
            return;
        }

        try {
            if (WidgetUpdate && WidgetUpdate.updateWidget) {
                await WidgetUpdate.updateWidget(pnl, peakProfit, peakLoss);

                // Update cached values
                this.lastPnl = pnl;
                this.lastPeakProfit = peakProfit;
                this.lastPeakLoss = peakLoss;

                console.log('[WIDGET] Updated widget:', { pnl, peakProfit, peakLoss });
            } else {
                console.warn('[WIDGET] WidgetUpdate module not available');
            }
        } catch (error) {
            console.error('[WIDGET] Failed to update widget:', error);
        }
    }

    /**
     * Update the widget synchronously (fire and forget)
     * 
     * @param pnl Current P&L value
     * @param peakProfit Peak profit value
     * @param peakLoss Peak loss value
     */
    updateWidgetSync(pnl: number, peakProfit: number, peakLoss: number): void {
        // Only update on Android
        if (Platform.OS !== 'android') {
            return;
        }

        // Only update if values have changed
        if (
            pnl === this.lastPnl &&
            peakProfit === this.lastPeakProfit &&
            peakLoss === this.lastPeakLoss
        ) {
            return;
        }

        try {
            if (WidgetUpdate && WidgetUpdate.updateWidgetSync) {
                WidgetUpdate.updateWidgetSync(pnl, peakProfit, peakLoss);

                // Update cached values
                this.lastPnl = pnl;
                this.lastPeakProfit = peakProfit;
                this.lastPeakLoss = peakLoss;

                console.log('[WIDGET] Updated widget (sync):', { pnl, peakProfit, peakLoss });
            } else {
                console.warn('[WIDGET] WidgetUpdate module not available');
            }
        } catch (error) {
            console.error('[WIDGET] Failed to update widget (sync):', error);
        }
    }

    /**
     * Check if widget module is available
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && WidgetUpdate !== undefined;
    }
}

export const widgetService = new WidgetService();
