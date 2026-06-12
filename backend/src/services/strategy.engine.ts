
import { shoonya } from './shoonya.service';
import { db } from './supabase.service';
import { socketService } from './socket.service';
import { telegramService } from './telegram.service';
import * as fs from 'fs';
import * as path from 'path';
import { nseService } from './nse.service';
import cron from 'node-cron';

interface LegState {
    token: string;
    symbol: string;
    type: 'CE' | 'PE';
    side: 'BUY' | 'SELL';
    strike: string;
    entryPrice: number;
    ltp: number;
    quantity: number;
    tier?: number; // 1 or 2
    isAdjusted?: boolean; // Track if adjustment has been executed for this leg

    // If a leg is added dynamically (e.g., adjustment), we may not have websocket ltp yet.
    // This flag prevents peakProfit/peakLoss from reacting to that transition.
    isPnLSettling?: boolean;
    pnlSettlingSince?: number;
}


export type StrategyStatus = 'IDLE' | 'WAITING_FOR_EXPIRY' | 'EXIT_DONE' | 'ENTRY_DONE' | 'ACTIVE' | 'FORCE_EXITED';

interface StrategyState {
    status: StrategyStatus;
    isActive: boolean; // Legacy/Derived
    isVirtual: boolean;
    isPaused: boolean;

    isTradePlaced: boolean;
    selectedStrikes: LegState[];
    pnl: number;
    peakProfit: number;
    peakLoss: number;
    entryTime: string;
    exitTime: string;
    reEntryCutoffTime: string; // Cutoff time for re-entry eligibility (e.g., "13:45")
    targetPnl: number;
    stopLossPnl: number;
    telegramToken: string;
    telegramChatId: string;
    requiredMargin: number;
    availableMargin: number;
    monitoring: {
        profitTime: number; // Start timestamp
        lossTime: number;   // Start timestamp
        adjustments: Record<string, number>; // token -> start timestamp
        adjusted: Record<string, boolean>; // token -> already handled once
    };
    nextAction: string; // "Exit at 12:45 PM", "Target Hit", etc.
    engineActivity: string; // "Watching Spikes", "Waiting for Expiry", etc.
    lastHeartbeat: string; // ISO string

    // Re-entry feature fields
    positionEntryDate: string; // ISO date when position was taken (YYYY-MM-DD)
    reEntry: {
        isEligible: boolean;           // Can we re-enter today?
        hasReEntered: boolean;         // Have we already re-entered today?
        originalExitTime: string;      // When was the original exit
        originalExitReason: string;    // Why did we exit (target/sl/manual)
        positionAge: number;           // Days position was held before exit
        scheduledReEntryTime: string;  // When re-entry is scheduled (ISO timestamp)
        originalStrikes?: LegState[];  // [NEW] Stores the configuration of legs at exit for precise restoration
    };
}

class StrategyEngine {
    private state: StrategyState = {
        status: 'IDLE',
        isActive: false,
        isPaused: false,

        isVirtual: true, // Default to virtual mode for safety
        isTradePlaced: false,
        selectedStrikes: [],
        pnl: 0,
        peakProfit: 0,
        peakLoss: 0,
        entryTime: '12:59',
        exitTime: '12:45',
        reEntryCutoffTime: '13:45', // Default: 1:45 PM
        targetPnl: 2100,
        stopLossPnl: -1500,
        telegramToken: '8377716331:AAH-9nvlaWFifdf6NT1UZKEzCjc0gZBR57w',
        telegramChatId: '5177480141',
        requiredMargin: 0,
        availableMargin: 0,
        monitoring: {
            profitTime: 0,
            lossTime: 0,
            adjustments: {},
            adjusted: {}
        },
        nextAction: 'Daily 9 AM Evaluation',
        engineActivity: 'Initializing',
        lastHeartbeat: new Date().toISOString(),

        // Initialize re-entry state
        positionEntryDate: '',
        reEntry: {
            isEligible: false,
            hasReEntered: false,
            originalExitTime: '',
            originalExitReason: '',
            positionAge: 0,
            scheduledReEntryTime: ''
        }
    };

    private lastPnlUpdateTime: number = 0;
    private lastLoggedPnl: number | null = null;
    private PNL_UPDATE_INTERVAL = 5 * 60 * 1000;
    private isWebSocketStarted: boolean = false;
    private lastPositionSyncTime: number = 0;
    private POSITION_SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour
    private hourlySyncTimer: NodeJS.Timeout | null = null;
    private reEntryTimer: NodeJS.Timeout | null = null; // Timer for re-entry scheduling
    private cachedUid: string | undefined;
    private isExiting: boolean = false;
    private isPlacingOrder: boolean = false;

    constructor() {
        this.initScheduler();
        this.startHourlyPositionSync();
    }

    async resume() {
        try {
            this.state.nextAction = 'Initializing...'; // Indicate startup in progress
            this.addLog('🔄 [System] Engine Startup: Initializing state...');

            // 1. Load basic state from DB
            const savedState: any = await db.getState();
            console.log('[DEBUG] Resume Loaded State:', JSON.stringify(savedState, null, 2));

            // Load UID from session DB if not already available
            const { data: sessionData } = await db.getSession();
            if (sessionData && sessionData.uid) {
                this.cachedUid = sessionData.uid;
                this.addLog(`🔑 [System] Cached UID for DB operations: ${this.cachedUid}`);
            }

            if (savedState) {
                this.state.isVirtual = savedState.isVirtual !== undefined ? savedState.isVirtual : true;
                this.state.isPaused = savedState.isPaused !== undefined ? savedState.isPaused : false;
                this.state.targetPnl = savedState.targetPnl || 2100;
                this.state.stopLossPnl = savedState.stopLossPnl || -1500;
                this.state.entryTime = savedState.entryTime || '12:59';
                this.state.exitTime = savedState.exitTime || '15:15';
                this.state.reEntryCutoffTime = savedState.reEntryCutoffTime || '13:45';
                this.addLog(`📥[System] Loaded Settings: Entry = ${this.state.entryTime}, Exit = ${this.state.exitTime}, ReEntryVal = ${this.state.reEntryCutoffTime} `);

                this.state.pnl = savedState.pnl || 0;
                this.state.peakProfit = savedState.peakProfit || 0;
                this.state.peakLoss = savedState.peakLoss || 0;
                this.state.telegramToken = savedState.telegramToken || '';
                this.state.telegramChatId = savedState.telegramChatId || '';

                // Always sync credentials to telegramService (clears stale state if empty)
                telegramService.setCredentials(this.state.telegramToken, this.state.telegramChatId);
                if (this.state.telegramToken && this.state.telegramChatId) {
                     console.log('Restoring Telegram credentials from saved state');
                }

                this.state.requiredMargin = savedState.requiredMargin || 0;
                this.state.availableMargin = savedState.availableMargin || 0;

                // Restore position entry date
                if (savedState.positionEntryDate) {
                    this.state.positionEntryDate = savedState.positionEntryDate;
                }
            }

            // 2. Load positions
            const positions = await db.getPositions();
            this.state.selectedStrikes = positions;
            this.addLog(`🔍[Debug] DB returned ${positions.length} positions: ${positions.map((p: any) => p.token).join(', ')} `);

            // 2.5. Fetch fresh LTP for existing positions via GetQuotes API
            if (positions.length > 0) {
                try {
                    this.addLog(`📊[System] Fetching live prices for ${positions.length} existing positions...`);
                    for (const leg of positions) {
                        try {
                            if (!leg.token || leg.token === 'null' || leg.token === 'undefined') {
                                this.addLog(`⚠️[Price] Skipping live price for ${leg.symbol} (Missing Token)`);
                                continue;
                            }
                            const quote: any = await shoonya.getQuotes('NFO', String(leg.token));
                            if (quote && quote.lp) {
                                leg.ltp = parseFloat(quote.lp);
                                this.addLog(`✅[Price] ${leg.symbol}: LTP =₹${quote.lp}, Entry =₹${leg.entryPrice} `);
                            }
                        } catch (quoteErr) {
                            console.error(`[Strategy] GetQuote Error for ${leg.symbol}: `, quoteErr);
                            this.addLog(`⚠️[Price] Could not fetch LTP for ${leg.symbol}, using last known price`);
                        }
                    }
                    this.calculatePnL(); // Recalculate PnL with fresh LTPs
                    await db.syncPositions(positions, this.getUid()); // Update database with fresh LTPs
                } catch (err) {
                    console.error('[Strategy] GetQuotes Error on resume:', err);
                    this.addLog('⚠️ [System] Could not fetch initial LTPs, using stored prices');
                }
            }

            // 3. Determine Lifecycle State
            const isExpiry = await this.isExpiryDay();
            this.addLog(`🔍 [Debug] Is Expiry Day: ${isExpiry}`);
            const now = new Date();
            const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();

            const [entryH, entryM] = this.state.entryTime.split(':').map(Number);
            const [exitH, exitM] = this.state.exitTime.split(':').map(Number);
            const entryMinutes = entryH * 60 + entryM;
            const exitMinutes = exitH * 60 + exitM;

            if (positions.length > 0) {
                if (isExpiry) {
                    // Logic for Expiry Day recovery
                    const hasTodayExpiryPositions = await this.isPositionExpiryToday();

                    if (currentMinutes >= entryMinutes) {
                        if (exitMinutes > entryMinutes && currentMinutes >= exitMinutes) {
                            if (hasTodayExpiryPositions) {
                                // Past BOTH, and Exit was latest. Be flat.
                                this.addLog('⏰ [Recovery] Startup is past both entry and exit time. Squaring off today expiry positions...');
                                await this.exitAllPositions('Late Expiry Square-off');
                            } else {
                                this.addLog('⏰ [Recovery] Startup is past both entry and exit time, but current positions are for a later expiry. Keeping positions active.');
                                this.state.status = 'ACTIVE';
                                this.state.engineActivity = 'Monitoring Iron Condor';
                                this.state.nextAction = `Daily Exit at ${this.state.exitTime} `;
                            }
                        } else {
                            // Past Entry time. Should be in the trade or rolling over.
                            // If we have positions, we check status.
                            const currentStatus = savedState?.status || 'IDLE';
                            // Treat ENTRY_DONE as ACTIVE — server may have crashed during the 5-second
                            // transition between ENTRY_DONE and ACTIVE. Triggering rollover here would
                            // incorrectly exit live positions and re-enter, causing a double trade.
                            if (!hasTodayExpiryPositions && this.state.selectedStrikes.length > 0) {
                                this.addLog('⏰ [Recovery] Current positions are for a later expiry. Keeping them active instead of rerolling.');
                                this.state.status = 'ACTIVE';
                                this.state.engineActivity = 'Monitoring Iron Condor';
                                this.state.nextAction = `Daily Exit at ${this.state.exitTime} `;
                            } else if (currentStatus !== 'ACTIVE' && currentStatus !== 'ENTRY_DONE') {
                                this.addLog('⏰ [Recovery] Startup past entry time but not active. Triggering Rollover...');
                                await this.executeRolloverSequence();
                            } else {
                                this.state.status = 'ACTIVE';
                                this.state.engineActivity = 'Monitoring Iron Condor';
                                this.state.nextAction = `Daily Exit at ${this.state.exitTime} `;
                            }
                        }
                    } else if (currentMinutes >= exitMinutes) {
                        // Past Exit, but not yet at Entry.
                        if (hasTodayExpiryPositions) {
                            this.addLog('⏰ [Recovery] Startup past exit time. Squaring off today expiry positions...');
                            await this.exitAllPositions('Late Week Exit');
                        } else {
                            this.addLog('⏰ [Recovery] Startup past exit time, but current positions are for a later expiry. Keeping them active.');
                        }
                        // After exit or skip, we should be waiting for entry if there are no current today positions
                        if (!hasTodayExpiryPositions) {
                            this.state.status = 'ACTIVE';
                            this.state.engineActivity = 'Monitoring Iron Condor';
                            this.state.nextAction = `Daily Exit at ${this.state.exitTime} `;
                        } else {
                            this.state.status = 'WAITING_FOR_EXPIRY';
                            this.state.engineActivity = 'Waiting for Entry Time';
                            this.state.nextAction = `Entry at ${this.state.entryTime} `;
                        }
                    } else {
                        // Before both. Monitor old positions.
                        this.state.status = 'ACTIVE';
                        this.state.engineActivity = 'Monitoring Old Positions';
                        this.state.nextAction = `Daily Exit at ${this.state.exitTime} `;
                    }
                } else {
                    // Normal day. Just monitor.
                    this.state.status = 'ACTIVE';
                    this.state.engineActivity = 'Monitoring iron Condor';
                    this.state.nextAction = `Watching Target / SL`;
                }

                if (this.state.status === 'ACTIVE') {
                    this.state.isActive = true;
                    this.state.isTradePlaced = true;
                    this.calculatePnL();
                }
            } else {
                // No positions - Check if we should be in a trade already
                if (isExpiry) {
                    if (currentMinutes >= entryMinutes && (exitMinutes <= entryMinutes || currentMinutes < exitMinutes)) {
                        this.addLog('⏰ [Recovery] No positions found but past Entry Time. Triggering rollover...');
                        await this.executeRolloverSequence();
                    } else {
                        this.state.status = 'WAITING_FOR_EXPIRY';
                        this.state.engineActivity = 'Waiting for Entry Time';
                        this.state.nextAction = `Entry at ${this.state.entryTime} `;
                        this.addLog(`🔔[Strategy] Resumed: Waiting for ${this.state.entryTime}.`);
                    }
                } else {
                    this.state.status = 'IDLE';
                    this.state.engineActivity = 'Idle';
                    this.state.nextAction = 'Daily 9 AM Expiry Check';
                    this.addLog('💤 [Strategy] Resumed: Normal day. Status IDLE.');
                }
                this.state.isTradePlaced = false;
                this.state.isActive = false;

                // [RECOVERY] Check for pending re-entry
                if (savedState?.reEntry?.isEligible) {
                    // Case 1: Scheduled timer exists
                    if (savedState.reEntry.scheduledReEntryTime) {
                        const scheduledTime = new Date(savedState.reEntry.scheduledReEntryTime);
                        const now = new Date();

                        if (scheduledTime > now) {
                            const delay = scheduledTime.getTime() - now.getTime();
                            this.addLog(`♻️ [Recovery] Found pending re-entry scheduled at ${scheduledTime.toLocaleTimeString('en-IN')}`);

                            // Restore re-entry state
                            this.state.reEntry = savedState.reEntry;

                            // Set Status
                            this.state.status = 'IDLE';
                            this.state.engineActivity = 'Waiting for Re-Entry';
                            this.state.nextAction = `Re-Entry at ${scheduledTime.toLocaleTimeString('en-IN')}`;

                            // Restart Timer
                            this.scheduleReEntry(delay);
                        } else {
                            this.addLog(`⚠️ [Recovery] Missed past re-entry time (${scheduledTime.toLocaleTimeString('en-IN')}). Executing immediate re-entry...`);
                            this.state.reEntry = savedState.reEntry;
                            this.executeReEntry();
                        }
                    }
                    // Case 2: No time scheduled (Manual Override)
                    else {
                        this.addLog(`⚠️ [Recovery] Found eligible re-entry with MISSING schedule time. Treating as Manual Override -> Executing immediate re-entry.`);
                        this.state.reEntry = savedState.reEntry;
                        this.executeReEntry();
                    }
                }
            }

            // Send startup notification (only if Telegram credentials are configured)
            if (this.state.telegramToken && this.state.telegramChatId) {
                const startupMsg = `🚀 <b>Strategy Engine Resumed </b>\n` +
                    `Status: ${this.state.status}\n` +
                    `Activity: ${this.state.engineActivity}\n` +
                    `Mode: ${this.state.isVirtual ? 'VIRTUAL' : 'LIVE'}`;
                telegramService.sendMessage(startupMsg);
            }

            // 4. Initial sync, monitoring and scheduler
            this.startMonitoring();
            await this.syncToDb(true);
            this.initScheduler();

        } catch (err: any) {
            console.error('[Strategy] Failed to resume strategy:', err);
            this.addLog(`❌ [System] Resume Error: ${err.message || err}`);
            this.state.engineActivity = 'Resume Failed';
            this.state.nextAction = 'Check System Logs';
            this.state.status = 'IDLE'; // Fail-safe to IDLE
            await this.syncToDb(true); // Persist error state so UI shows it
        }
    }

    private schedulers: any[] = [];

    // Helper: Get trading expiry (always next week = 2nd in list)
    private getTradingExpiry(expiries: string[]): string {
        return expiries[1] || expiries[0];
    }

    // Helper: Parse expiry date string (e.g., "09-JAN-2026") to Date
    private parseExpiryDate(dateStr: string): Date {
        const months: { [key: string]: number } = {
            'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
            'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
        };
        const parts = dateStr.split('-');
        const day = parseInt(parts[0]);
        const month = months[parts[1].toUpperCase()]; // Handle case sensitivity
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    }

    private testDate: Date | null = null;

    public async setTestDate(dateStr: string | null) {
        if (dateStr) {
            this.testDate = this.parseExpiryDate(dateStr);
            this.addLog(`🧪 MOCK DATE SET: ${this.testDate.toDateString()}`);
        } else {
            this.testDate = null;
            this.addLog(`🧪 MOCK DATE REMOVED`);
        }
        await this.initScheduler();
    }

    // Helper: Check if dateStr matches today
    private isToday(dateStr: string): boolean {
        const today = this.testDate || new Date();
        const expiryDate = this.parseExpiryDate(dateStr);
        return today.toDateString() === expiryDate.toDateString();
    }

    private parseExpiryFromSymbol(symbol: string): string | null {
        const match = symbol.match(/(\d{1,2}[A-Z]{3}\d{2})/i);
        if (!match) return null;
        const raw = match[1].toUpperCase();
        const day = raw.slice(0, raw.length - 5).padStart(2, '0');
        const month = raw.slice(-5, -2);
        const year = `20${raw.slice(-2)}`;

        if (!/^\d{2}$/.test(day) || !/^[A-Z]{3}$/.test(month) || !/^\d{4}$/.test(year)) {
            return null;
        }

        return `${day}-${month}-${year}`;
    }

    private getPositionExpiry(): string | null {
        if (!this.state.selectedStrikes || this.state.selectedStrikes.length === 0) return null;
        return this.parseExpiryFromSymbol(this.state.selectedStrikes[0].symbol);
    }

    private async isPositionExpiryToday(): Promise<boolean> {
        const expiry = this.getPositionExpiry();
        if (!expiry) return false;
        return this.isToday(expiry);
    }

    // Helper: Check if today is expiry day
    private async isExpiryDay(): Promise<boolean> {
        const expiries = await this.getAvailableExpiries();
        if (expiries.length === 0) return false;
        const currentExpiry = expiries[0]; // First expiry = current week
        return this.isToday(currentExpiry);
    }

    private async initScheduler() {
        this.schedulers.forEach(s => s.stop());
        this.schedulers = [];

        const tzOption = { timezone: 'Asia/Kolkata' };
        this.addLog('⚙️ [Scheduler] Initializing engine timers (IST)...');

        // 1. Daily Reset at 9:00 AM
        this.schedulers.push(cron.schedule('0 9 * * *', async () => {
            this.addLog('🌅 [System] Daily 9 AM Reset - evaluating today...');
            const isExpiry = await this.isExpiryDay();

            // Clear re-entry state for new day
            this.state.reEntry = {
                isEligible: false,
                hasReEntered: false,
                originalExitTime: '',
                originalExitReason: '',
                positionAge: 0,
                scheduledReEntryTime: ''
            };

            // Clear any pending re-entry timer
            if (this.reEntryTimer) {
                clearTimeout(this.reEntryTimer);
                this.reEntryTimer = null;
            }

            // Run database cleanup (delete logs/alerts older than 30 days)
            try {
                this.addLog('🧹 [Cleanup] Running daily database cleanup...');
                const logsResult = await db.cleanupOldLogs();
                const alertsResult = await db.cleanupOldAlerts();
                const pnlResult = await db.cleanupPnlSnapshots();

                if (logsResult.success || alertsResult.success || pnlResult.success) {
                    const totalDeleted = (logsResult.deletedCount || 0) + (alertsResult.deletedCount || 0) + (pnlResult.deletedCount || 0);
                    this.addLog(`🧹 [Cleanup] Completed: ${totalDeleted} old records deleted`);
                }
            } catch (err) {
                console.error('[Cleanup] Database cleanup failed:', err);
            }

            if (this.state.selectedStrikes.length > 0) {
                this.addLog(`⚠️ [System] Active positions found during 9 AM reset. Skipping status reset.`);
                // Maintain ACTIVE status if it was active, or force it if we have positions
                if (this.state.status !== 'ACTIVE') {
                    this.state.status = 'ACTIVE';
                }
                this.state.engineActivity = 'Monitoring Overnight/Existing Positions';
                this.state.nextAction = 'Continuing Strategy Leg Monitoring';
            } else if (isExpiry) {
                this.state.status = 'WAITING_FOR_EXPIRY';
                this.state.engineActivity = 'Waiting for Entry Sequence';
                this.state.nextAction = `Entry at ${this.state.entryTime}`;
                telegramService.sendMessage('🔔 <b>Expiry Day Detected</b>\nAutomated rollover sequence armed.');
            } else {
                this.state.status = 'IDLE';
                this.state.engineActivity = 'Watching for Expiry Day';
                this.state.nextAction = 'Next 9 AM Check';
                telegramService.sendMessage('🌅 <b>Daily Strategy Reset</b>\nEngine is idle and waiting for expiry day.');
            }

            await this.syncToDb(true);
            await this.initScheduler();
        }, tzOption));

        // 1.5. Automated Expiry Sync from NSE (Hourly from 9:08 AM)
        this.schedulers.push(cron.schedule('8 9-15 * * *', async () => {
            await this.triggerExpirySync();
        }, tzOption));

        // 1.8. Periodic Margin Check & PnL Monitor (Weekdays 9:10 AM - 3:35 PM, Every 1 minute)
        this.schedulers.push(cron.schedule('*/1 9-15 * * 1-5', async () => {
            // This updates margins, recalculates PnL, and checks SL/Target
            await this.monitorPnL();
        }, tzOption));

        const isExpiry = await this.isExpiryDay();
        if (!isExpiry) return;

        // --- EXPIRY DAY ACTIONS ---

        // 2. Daily Exit at exitTime (On Expiry Day Only)
        const [exitH, exitM] = this.state.exitTime.split(':').map(Number);
        this.schedulers.push(cron.schedule(`${exitM} ${exitH} * * *`, async () => {
            if (this.state.selectedStrikes.length > 0) {
                const isSameExpiry = await this.isPositionExpiryToday();
                if (!isSameExpiry) {
                    this.addLog(`⏰ [System] Exit time reached (${this.state.exitTime}) but current positions are for a later expiry. Skipping same-day expiry exit.`);
                    return;
                }
            }
            this.addLog(`⏰ [System] Daily Exit Time reached (${this.state.exitTime}). Squaring off...`);
            await this.exitAllPositions(`Daily Exit Time reached`);
        }, tzOption));

        // Unified Rollover at entryTime
        const [entryH, entryM] = this.state.entryTime.split(':').map(Number);
        this.schedulers.push(cron.schedule(`${entryM} ${entryH} * * *`, async () => {
            this.addLog(`🚀 [Expiry] Entry Time reached (${this.state.entryTime}). Starting rollover sequence...`);
            await this.executeRolloverSequence();
        }, tzOption));
    }

    private async executeRolloverSequence() {
        // 1. Exit current positions if any
        if (this.state.selectedStrikes.length > 0) {
            this.addLog('📤 [Rollover] Clearing existing positions...');
            await this.exitAllPositions('Expiry Rollover');
        }

        this.state.status = 'EXIT_DONE';
        this.state.engineActivity = 'Selecting Strikes...';
        await this.syncToDb(true);

        // 2. Select New Strikes
        this.addLog('🎯 [Rollover] Selecting new strikes...');
        await this.selectStrikes();

        // 3. Place New Orders
        this.state.engineActivity = 'Placing Orders...';
        this.state.nextAction = 'Verifying Execution';
        const res = await this.placeOrder();

        if (res && res.status === 'success') {
            this.state.status = 'ENTRY_DONE';
            this.state.engineActivity = 'Verifying Entry';
            this.state.nextAction = 'Transition to ACTIVE';
            await this.syncToDb(true);

            setTimeout(async () => {
                this.state.status = 'ACTIVE';
                this.state.engineActivity = 'Monitoring Iron Condor';
                this.state.nextAction = `Daily Exit at ${this.state.exitTime}`;
                await this.syncToDb(true);
                this.addLog('✅ [System] Rollover Complete. ACTIVE Monitoring.');
            }, 5000);
        } else {
            this.state.status = 'FORCE_EXITED';
            this.state.engineActivity = 'Entry Failed';
            this.state.nextAction = 'Manual Reset Required';
            await this.syncToDb(true);
            this.addLog('❌ [System] Rollover Failed at Entry stage.');
        }
    }

    public async updateSettings(settings: {
        entryTime?: string,
        exitTime?: string,
        reEntryCutoffTime?: string,
        targetPnl?: number,
        stopLossPnl?: number,
        telegramToken?: string,
        telegramChatId?: string,
        isVirtual?: boolean
    }) {
        // Log incoming settings for traceability
        this.addLog(`⚙️ [Settings] Incoming update: ${JSON.stringify(settings)}`);

        // Use explicit property presence checks to allow falsy values (e.g., empty strings)
        if (Object.prototype.hasOwnProperty.call(settings, 'entryTime')) {
            this.state.entryTime = String(settings.entryTime || '12:59');
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'exitTime')) {
            this.state.exitTime = String(settings.exitTime || '15:15');
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'reEntryCutoffTime')) {
            this.state.reEntryCutoffTime = String(settings.reEntryCutoffTime || '13:45');
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'targetPnl')) {
            this.state.targetPnl = Number(settings.targetPnl) || this.state.targetPnl;
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'stopLossPnl')) {
            this.state.stopLossPnl = Number(settings.stopLossPnl) || this.state.stopLossPnl;
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'telegramToken')) {
            this.state.telegramToken = typeof settings.telegramToken === 'string'
                ? settings.telegramToken.trim()
                : '';
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'telegramChatId')) {
            this.state.telegramChatId = typeof settings.telegramChatId === 'string'
                ? settings.telegramChatId.trim()
                : '';
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'isVirtual')) {
            this.state.isVirtual = Boolean(settings.isVirtual);
        }

        if (this.state.telegramToken && this.state.telegramChatId) {
             console.log('Updating Telegram credentials from settings update');
            telegramService.setCredentials(this.state.telegramToken, this.state.telegramChatId);
        } else {
             console.log('Clearing Telegram credentials due to missing token/chatId in settings update');
            telegramService.setCredentials('', '');
        }

        await db.updateState(this.state, this.getUid());
        this.initScheduler();
        this.addLog(`Strategy settings updated. Entry: ${this.state.entryTime}, Exit: ${this.state.exitTime}, Re-Entry Cutoff: ${this.state.reEntryCutoffTime}, Target: ${this.state.targetPnl}, SL: ${this.state.stopLossPnl}, Mode: ${this.state.isVirtual ? 'Virtual' : 'LIVE'}`);
    }

    public getState() {
        return this.state;
    }

    public async setEngineActivity(activity: string) {
        this.state.engineActivity = activity;
        await this.syncToDb(true);
        this.addLog(`🛠️ [Manual] Engine Activity overridden to: ${activity}`);
    }

    public async setStatus(status: StrategyStatus) {
        this.state.status = status;
        await this.syncToDb(true);
        this.addLog(`🛠️ [Manual] Engine Status overridden to: ${status}`);
    }

    public async getAvailableExpiries() {
        try {
            // Use manual expiries from database
            const manualExpiries = await db.getManualExpiries();

            if (manualExpiries && manualExpiries.length > 0) {
                this.addLog(`[Strategy] Using ${manualExpiries.length} manual expiries from database`);
                return manualExpiries;
            }

            console.error('[Strategy] No manual expiries found in database!');
            this.addLog('⚠️ [Strategy] No manual expiries found! Please check Settings.');
            console.warn('[Strategy] Please add expiry dates in Settings → Manual Expiry Dates');
            return [];
        } catch (e) {
            console.error('Error fetching expiries:', e);
            this.addLog(`❌ [Strategy] Error fetching expiries: ${e}`);
            return [];
        }
    }

    private formatExpiry(dateStr: string) {
        // Input: "13-JAN-2026"
        // Output: "13JAN26"
        const parts = dateStr.split('-');
        if (parts.length < 3) return dateStr;
        const day = parts[0];
        const month = parts[1].toUpperCase();
        const year = parts[2].substring(parts[2].length - 2);
        return `${day}${month}${year}`;
    }

    private getUid(): string | undefined {
        const session = shoonya.getSessionDetails();
        return session?.uid || session?.actid || this.cachedUid;
    }

    private addLog(msg: string) {
        //console.log(`[Strategy] ${msg}`);
        db.addLog(msg, this.getUid());
        socketService.emit('system_log', {
            time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            msg
        });
    }


    public async selectStrikes(expiryDate?: string) {
        if (!shoonya.isLoggedIn()) {
            throw new Error('Shoonya session expired or not logged in. Please login again.');
        }

        try {
            // 1. Get all available expiries
            const expiries = await this.getAvailableExpiries();
            if (expiries.length === 0) {
                throw new Error('No expiries available');
            }

            // 2. Determine Target Expiry
            // If explicit expiry provided (e.g. during re-entry), use it.
            // Otherwise, default to NEXT WEEK's expiry.
            let targetExpiry = expiryDate;

            if (!targetExpiry) {
                targetExpiry = this.getTradingExpiry(expiries);
                this.addLog(`🎯 Auto - selecting NEXT WEEK expiry: ${targetExpiry}`);
            } else {
                this.addLog(`♻️[Re - Entry] Using PREVIOUS expiry: ${targetExpiry}`);
            }

            // Send Telegram notification
            telegramService.sendMessage(
                `🎯 <b>Strike Selection Started </b>\n` +
                `Expiry: ${targetExpiry}\n` +
                `selecting 8-leg Iron Condor...`
            );

            // 3. Get NIFTY Spot to find candidates
            const spot: any = await shoonya.getQuotes('NSE', '26000'); // Nifty 50 Index token
            const spotPrice = parseFloat(spot.lp);
            //console.log(`[Strategy] Nifty Spot: ${spotPrice}`);

            // 4. GET ACTUAL OPTION CHAIN around spot
            // Round spot to nearest 50 for Nifty ATM
            const atmStrike = Math.round(spotPrice / 50) * 50;
            const formattedDate = this.formatExpiry(targetExpiry);

            // CONSTRUCT ATM SYMBOL MANUALLY (No searchScrip used for this)
            const anchorTsym = `NIFTY${formattedDate}C${atmStrike}`;
            //console.log(`[Strategy] Using manual anchor: ${anchorTsym} at ${atmStrike}...`);

            const chain: any[] = await shoonya.getOptionChain('NFO', anchorTsym, atmStrike, 50) as any[];
            if (!chain || chain.length === 0) throw new Error('Failed to fetch option chain');

            // 4. FETCH LIVE QUOTES for all relevant strikes in the chain
            // We need a broad enough range to find ₹150, ₹75, and ₹10 premiums.
            //console.log(`[Strategy] Fetching live quotes for ${chain.length} strikes...`);
            const quotes: any[] = [];
            for (const item of chain) {
                try {
                    const q: any = await shoonya.getQuotes('NFO', item.token);
                    if (q && q.lp) {
                        quotes.push({ ...item, lp: parseFloat(q.lp), ls: q.ls });
                    }
                } catch (e) {
                    console.warn(`[Strategy] Failed to fetch quote for ${item.tsym}`);
                }
            }

            if (quotes.length === 0) throw new Error('Failed to fetch any live quotes');

            const getBestMatch = (type: 'CE' | 'PE', target: number, excludeTokens: string[]) => {
                const matches = quotes.filter(q => q.optt === type && !excludeTokens.includes(q.token));
                if (matches.length === 0) return null;
                return matches.reduce((prev, curr) =>
                    (Math.abs(prev.lp - target) < Math.abs(curr.lp - target) ? prev : curr)
                );
            };

            const selectedLegs: LegState[] = [];
            const usedTokens: string[] = [];

            // Helper to add leg safely
            const addLeg = (picked: any, side: 'BUY' | 'SELL', tier: number) => {
                if (!picked) return;
                const leg = this.mapToLeg(picked, side, picked.lp, tier);
                selectedLegs.push(leg);
                usedTokens.push(picked.token);
                //console.log(`[Selection] ${side} ${picked.tsym} at ₹${picked.lp} (Strike: ${picked.strprc})`);
            };

            // TIED 1 LOGIC (150-150 Spreads)
            // 1. CE Buy @ 150
            const ce150 = getBestMatch('CE', 150, usedTokens);
            addLeg(ce150, 'BUY', 1);

            // 2. CE Sell (Immediate Higher)
            if (ce150) {
                const nextHigher = quotes
                    .filter(q => q.optt === 'CE' && parseFloat(q.strprc) > parseFloat(ce150.strprc))
                    .sort((a, b) => parseFloat(a.strprc) - parseFloat(b.strprc))[0];
                addLeg(nextHigher, 'SELL', 1);
            }

            // 3. PE Buy @ 150
            const pe150 = getBestMatch('PE', 150, usedTokens);
            addLeg(pe150, 'BUY', 1);

            // 4. PE Sell (Immediate Lower)
            if (pe150) {
                const nextLower = quotes
                    .filter(q => q.optt === 'PE' && parseFloat(q.strprc) < parseFloat(pe150.strprc))
                    .sort((a, b) => parseFloat(b.strprc) - parseFloat(a.strprc))[0];
                addLeg(nextLower, 'SELL', 1);
            }

            // TIER 2 LOGIC (75-75 Spreads)
            // 5. CE Sell @ 75
            const ce75 = getBestMatch('CE', 75, usedTokens);
            addLeg(ce75, 'SELL', 2);

            // 6. CE Hedge @ 7
            const ce7 = getBestMatch('CE', 10, usedTokens);
            addLeg(ce7, 'BUY', 2);

            // 7. PE Sell @ 75
            const pe75 = getBestMatch('PE', 75, usedTokens);
            addLeg(pe75, 'SELL', 2);

            // 8. PE Hedge @ 7
            const pe7 = getBestMatch('PE', 10, usedTokens);
            addLeg(pe7, 'BUY', 2);

            this.state.selectedStrikes = selectedLegs;

            // Reset peak values for new positions
            this.state.peakProfit = 0;
            this.state.peakLoss = 0;
            this.state.pnl = 0;

            // Fetch real-time LTP via GetQuotes API before WebSocket updates
            try {
                for (const leg of selectedLegs) {
                    try {
                        const quote: any = await shoonya.getQuotes('NFO', leg.token);
                        if (quote && quote.lp) {
                            leg.ltp = parseFloat(quote.lp);
                            this.addLog(`📊 Initial LTP for ${leg.symbol}: ₹${quote.lp} (Entry: ₹${leg.entryPrice})`);
                        }
                    } catch (quoteErr) {
                        console.error(`[Strategy] GetQuote Error for ${leg.symbol}:`, quoteErr);
                    }
                }
                this.calculatePnL(); // Recalculate PnL with real LTPs
            } catch (err) {
                console.error('[Strategy] GetQuotes Error:', err);
                this.addLog('⚠️ Could not fetch initial LTP, using entry prices');
            }

            this.startMonitoring();
            await db.syncPositions(selectedLegs, this.getUid());
            await this.syncToDb(true);

            const ceLegs = selectedLegs.filter(l => l.type === 'CE').map(l => `${l.side} ${l.strike}`).join(', ');
            const peLegs = selectedLegs.filter(l => l.type === 'PE').map(l => `${l.side} ${l.strike}`).join(', ');
            telegramService.sendMessage(`🎯 <b>Strikes Selected</b>\nExpiry: ${targetExpiry}\nCE: ${ceLegs}\nPE: ${peLegs}`);

            return selectedLegs;
        } catch (err) {
            console.error('[Strategy] Selection Error:', err);
            throw err;
        }
    }

    private mapToLeg(picked: any, side: 'BUY' | 'SELL', targetPrice: number, tier: number): LegState {
        return {
            token: picked.token,
            symbol: picked.tsym,
            type: picked.optt as 'CE' | 'PE',
            side,
            strike: picked.strprc,
            entryPrice: targetPrice,
            ltp: targetPrice,
            quantity: picked.ls ? parseFloat(picked.ls) : 75,
            tier
        };
    }

    private async checkMargin(legs: LegState[]): Promise<boolean> {
        // Removed early return for Virtual Mode to allow debugging/logging of margin calls
        // if (this.state.isVirtual) return true;

        try {
            this.addLog('🔍 Checking Margin Requirements...');

            // Prepare Order List
            const orders = legs.map(leg => ({
                exch: 'NFO',
                tsym: leg.symbol,
                qty: leg.quantity.toString(),
                prc: (leg.entryPrice || 0).toString(),
                prd: 'M',
                trantype: leg.side === 'BUY' ? 'B' : 'S',
                prctyp: 'MKT'
            }));

            if (orders.length === 0) return true;

            const primaryOrder = orders[0];
            const otherOrders = orders.slice(1);

            const payload = {
                ...primaryOrder,
                basketlists: otherOrders.length > 0 ? otherOrders : undefined
            };

            const marginRes: any = await shoonya.getBasketMargin(payload);

            if (marginRes.stat !== 'Ok') {
                const msg = `❌ Margin Check Failed: API Error - ${marginRes.emsg || 'Unknown error'}`;
                this.addLog(msg);
                telegramService.sendMessage(msg);
                return false;
            }

            const limitsRes: any = await shoonya.getLimits();
            if (limitsRes.stat !== 'Ok') {
                const msg = `❌ Margin Check Failed: Limits API Error - ${limitsRes.emsg || 'Unknown error'}`;
                this.addLog(msg);

                if (this.state.isVirtual) {
                    this.addLog('⚠️ [Virtual] Margin check failed but ignored.');
                    return true;
                }

                telegramService.sendMessage(msg);
                return false;
            }

            // Parse numeric values (Shoonya returns strings)
            // Note: basket_margin field might vary, checking expected keys
            const requiredMargin = parseFloat(marginRes.basket_margin || marginRes.margin_used || '0');
            const cash = parseFloat(limitsRes.cash || '0');
            const payin = parseFloat(limitsRes.payin || '0');
            const collateral = parseFloat(limitsRes.collateral || limitsRes.collat || '0');

            const availableMargin = cash + payin + collateral;

            this.addLog(`💰 Margin: Required ₹${requiredMargin.toFixed(0)} | Avail ₹${availableMargin.toFixed(0)}`);

            this.state.requiredMargin = requiredMargin;
            this.state.availableMargin = availableMargin;

            if (availableMargin < requiredMargin) {
                const shortfall = requiredMargin - availableMargin;
                const msg = `🚨 <b>Margin Shortfall</b>\nRequired: ₹${requiredMargin.toFixed(2)}\nAvailable: ₹${availableMargin.toFixed(2)}\nShortfall: ₹${shortfall.toFixed(2)}\n⚠️ <b>Trade Aborted!</b>`;
                telegramService.sendMessage(msg);
                this.addLog(`❌ Margin Shortfall: ₹${shortfall.toFixed(2)}. Trade Aborted.`);

                if (this.state.isVirtual) {
                    this.addLog('⚠️ [Virtual] Margin Shortfall ignored.');
                    return true;
                }

                return false;
            }

            return true;

        } catch (err: any) {
            console.error('Margin Check Logic Error:', err);
            this.addLog(`❌ Margin Check Ex: ${err.message}`);

            if (this.state.isVirtual) return true;
            return false;
        }
    }

    public async placeOrder(isDryRun: boolean = false) {
        if (!isDryRun && !shoonya.isLoggedIn()) {
            throw new Error('Shoonya session expired or not logged in. Please login again.');
        }
        if (!isDryRun) {
            // Checks for Real Execution
            if (this.state.isPaused) {
                this.addLog('⚠️ Order Placement Blocked: Strategy is PAUSED.');
                throw new Error('Strategy is Paused.');
            }

            // Duplicate Execution Prevention
            if (this.state.status === 'ACTIVE' || this.state.status === 'ENTRY_DONE') {
                this.addLog('⚠️ BLOCKED: Trade already active/placed.');
                return;
            }

            if (this.state.isTradePlaced) return;

            // Margin Check (Run even for Virtual to test API)
            const hasMargin = await this.checkMargin(this.state.selectedStrikes);
            // Only fail if NOT virtual and check failed
            if (!this.state.isVirtual && !hasMargin) {
                return { status: 'failed', reason: 'Insufficient Margin' };
            }
        }

        this.isPlacingOrder = true;
        try {
            const longs = this.state.selectedStrikes.filter(s => s.side === 'BUY');
            const shorts = this.state.selectedStrikes.filter(s => s.side === 'SELL');

            for (const leg of longs) await this.executeLeg(leg, isDryRun);
            for (const leg of shorts) await this.executeLeg(leg, isDryRun);

            if (!isDryRun) {
                this.state.isTradePlaced = true;
                this.state.isActive = true;
                this.state.status = 'ENTRY_DONE';    // Transition to ENTRY_DONE
                this.state.engineActivity = 'Entry Complete';
                this.state.nextAction = 'Transitioning to Monitoring';

                // Track position entry date for re-entry logic
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                this.state.positionEntryDate = today;
                this.addLog(`📅 [Entry] Position entry date recorded: ${today}`);

                this.startMonitoring();
                await db.syncPositions(this.state.selectedStrikes, this.getUid());
                await this.syncToDb(true);

                telegramService.sendMessage(`🚀 <b>Trade Placed</b>\nAll 8 legs executed ${this.state.isVirtual ? 'virtually (VIRTUAL mode)' : 'as LIVE orders'} for Iron Condor.`);

                // Auto-transition to ACTIVE after a short delay for verification
                setTimeout(async () => {
                    this.state.status = 'ACTIVE';
                    this.state.engineActivity = 'Monitoring Iron Condor';
                    this.state.nextAction = 'Next Weekly Expiry Roll';
                    await this.syncToDb(true);
                    this.addLog('✅ [System] Verify Complete: Engine is now ACTIVE.');
                }, 5000);
            }

            return { status: 'success' };
        } catch (err) {
            console.error('Failure during sequence placement:', err);
            throw err;
        } finally {
            this.isPlacingOrder = false;
        }
    }

    public async testPlaceOrder() {
        this.addLog('🧪 STARTING PLACE ORDER TEST (Dry Run)...');
        // Ensure strikes are selected or mock them if needed
        if (this.state.selectedStrikes.length === 0) {
            this.addLog('❌ No strikes selected. Cannot test place order.');
            throw new Error('No strikes selected.');
        }

        // Refresh quantities from live quotes to ensure test uses current lot sizes
        this.addLog('🔄 Refreshing quantities from live quotes...');
        for (const leg of this.state.selectedStrikes) {
            try {
                const q: any = await shoonya.getQuotes('NFO', leg.token);
                if (q && q.ls) {
                    leg.quantity = parseFloat(q.ls);
                }
            } catch (e) {
                console.warn(`Failed to refresh quote for ${leg.symbol}`);
            }
        }

        try {
            await this.placeOrder(true);
            this.addLog('✅ PLACE ORDER TEST COMPLETED. Check test_orders.log');
            return { status: 'success', message: 'Logged to test_orders.log' };
        } catch (e: any) {
            this.addLog(`❌ TEST FAILED: ${e.message}`);
            throw e;
        }
    }

    public async testExitOrder() {
        this.addLog('🧪 STARTING EXIT ORDER TEST (Dry Run)...');
        if (this.state.selectedStrikes.length === 0) {
            this.addLog('❌ No open positions to exit. Cannot test exit order.');
            throw new Error('No open positions.');
        }

        const logFile = path.join(process.cwd(), 'test_orders.log');
        const timestamp = new Date().toISOString();

        // Sort: Close Shorts (SELL) first, then Longs (BUY)
        const legsToExit = [...this.state.selectedStrikes].sort((a, b) => {
            if (a.side === 'SELL' && b.side !== 'SELL') return -1;
            if (b.side === 'SELL' && a.side !== 'SELL') return 1;
            return 0;
        });

        for (const leg of legsToExit) {
            const exitOrder = {
                exchange: 'NFO',
                tradingsymbol: leg.symbol,
                quantity: leg.quantity.toString(),
                discloseqty: '0',
                price: '0',
                product_type: 'M',
                buy_or_sell: leg.side === 'BUY' ? 'S' : 'B', // Reverse
                price_type: 'MKT',
                retention: 'DAY',
                remarks: 'TEST_EXIT_ORDER'
            };

            let jKey = '';
            let session: any = {};
            try {
                session = await shoonya.getSessionDetails() || {};
                jKey = await shoonya.getAuthToken();
            } catch (e) { }

            const jData = JSON.stringify({
                ordersource: 'API',
                uid: session.uid || session.actid,
                actid: session.actid,
                trantype: exitOrder.buy_or_sell,
                prd: exitOrder.product_type,
                exch: exitOrder.exchange,
                tsym: exitOrder.tradingsymbol,
                qty: exitOrder.quantity,
                dscqty: exitOrder.discloseqty,
                prctyp: exitOrder.price_type,
                prc: exitOrder.price,
                trgprc: '0',
                ret: exitOrder.retention,
                remarks: exitOrder.remarks
            });

            const payload = `jData=${jData}&jKey=${jKey}`;

            const logEntry = `[${timestamp}] [TEST EXIT REQUEST]\nPayload: ${payload}\n---\n`;
            fs.appendFileSync(logFile, logEntry);
            this.addLog(`📝 Logged Exit: ${leg.symbol} (${exitOrder.buy_or_sell})`);
        }

        this.addLog('✅ EXIT ORDER TEST COMPLETED. Check test_orders.log');
        return { status: 'success', message: 'Logged to test_orders.log' };
    }


    private async executeLeg(leg: LegState, isDryRun: boolean = false) {

        // Construct Order Params - Compatible with RestApi.place_order wrapper
        const orderParams = {
            exchange: 'NFO',
            tradingsymbol: leg.symbol,
            quantity: leg.quantity.toString(),
            discloseqty: '0',
            price: '0',
            product_type: 'M',
            buy_or_sell: leg.side === 'BUY' ? 'B' : 'S',
            price_type: 'MKT',
            trigger_price: '0',
            retention: 'DAY',
            remarks: isDryRun ? 'TEST_PLACE_ORDER' : 'STRATEGY_ENTRY'
        };

        if (isDryRun) {
            const logFile = path.join(process.cwd(), 'test_orders.log');
            const timestamp = new Date().toISOString();

            let jKey = '';
            let session: any = {};
            try {
                session = await shoonya.getSessionDetails() || {};
                jKey = await shoonya.getAuthToken();
            } catch (e) { }

            // Manual mapping to match RestApi.js payload construction
            const jData = JSON.stringify({
                ordersource: 'API',
                uid: session.uid || session.actid,
                actid: session.actid,
                trantype: orderParams.buy_or_sell,
                prd: orderParams.product_type,
                exch: orderParams.exchange,
                tsym: orderParams.tradingsymbol,
                qty: orderParams.quantity,
                dscqty: orderParams.discloseqty,
                prctyp: orderParams.price_type,
                prc: orderParams.price,
                trgprc: orderParams.trigger_price,
                ret: orderParams.retention,
                remarks: orderParams.remarks
            });

            const payload = `jData=${jData}&jKey=${jKey}`;

            const logEntry = `[${timestamp}] [TEST PLACE REQUEST]\nPayload: ${payload}\n---\n`;
            fs.appendFileSync(logFile, logEntry);
            this.addLog(`📝 Logged Place: ${leg.symbol} (${leg.side})`);
            return;
        }

        if (this.state.isVirtual) {
            // Virtual execution
            await new Promise(r => setTimeout(r, 100));
            await db.logOrder({
                ...leg,
                price: leg.entryPrice,
                status: 'COMPLETE',
                isVirtual: true,
                action: 'ENTRY'
            }, this.getUid());
            this.addLog(`[VIRTUAL] ${leg.side} ${leg.symbol} @ ₹${leg.entryPrice}`);
        } else {
            // Real order execution
            try {
                // Now using updated orderParams with correct keys for wrapper
                const result: any = await shoonya.placeOrder(orderParams);

                if (result.stat === 'Ok') {
                    const fillPrice = result.avgprc ? parseFloat(result.avgprc) : parseFloat(String(leg.entryPrice)) || 0;
                    leg.entryPrice = fillPrice; // Update with actual fill price (always a number)

                    await db.logOrder({
                        ...leg,
                        price: fillPrice,
                        status: 'COMPLETE',
                        isVirtual: false,
                        orderId: result.norenordno,
                        action: 'ENTRY'
                    }, this.getUid());

                    this.addLog(`[LIVE] ${leg.side} ${leg.symbol} @ ₹${fillPrice} | Order ID: ${result.norenordno}`);
                    telegramService.sendMessage(`✅ <b>Order Filled</b>\n${leg.side} ${leg.symbol}\nPrice: ₹${fillPrice}\nQty: ${leg.quantity}\nOrder ID: ${result.norenordno}`);
                } else {
                    throw new Error(`Order failed: ${result.emsg || 'Unknown error'}`);
                }
            } catch (err: any) {
                this.addLog(`[ERROR] Failed to place ${leg.side} ${leg.symbol}: ${err.message}`);
                telegramService.sendMessage(`❌ <b>Order Failed</b>\n${leg.side} ${leg.symbol}\nError: ${err.message}`);
                throw err;
            }
        }
    }

    private startMonitoring() {
        if (this.isWebSocketStarted) {
            this.resubscribe();
            return;
        }
        shoonya.startWebSocket(
            (tick) => this.handlePriceUpdate(tick),
            (order) => this.handleOrderReport(order)
        );
        this.isWebSocketStarted = true;
        this.resubscribe();
    }

    private resubscribe() {
        const tokens = this.state.selectedStrikes.map(s => `NFO|${s.token}`);
        if (tokens.length > 0) shoonya.subscribe(tokens);
    }

    private startHourlyPositionSync() {
        // Clear existing timer if any
        if (this.hourlySyncTimer) {
            clearInterval(this.hourlySyncTimer);
        }

        // Sync positions to DB every hour
        this.hourlySyncTimer = setInterval(async () => {
            if (this.state.selectedStrikes.length > 0) {
                try {
                    await db.syncPositions(this.state.selectedStrikes);
                    await this.syncToDb(true);
                    this.addLog('💾 [System] Hourly position sync completed');
                } catch (err) {
                    console.error('[Strategy] Hourly position sync failed:', err);
                }
            }
        }, this.POSITION_SYNC_INTERVAL);

        this.addLog('⏰ [System] Hourly position sync timer started');
    }

    private async handlePriceUpdate(tick: any) {
        const token = tick.tk;
        const ltp = parseFloat(tick.lp);
        if (!token || isNaN(ltp)) return;

        const legIdx = this.state.selectedStrikes.findIndex(s => s.token === token);

        // Update position LTP if this is a position token
        if (legIdx !== -1) {
            this.state.selectedStrikes[legIdx].ltp = ltp;

            // Perform strategy logic ONLY if ACTIVE
            if (this.state.status === 'ACTIVE' && !this.state.isPaused) {
                this.checkAdjustments(this.state.selectedStrikes[legIdx]);
                this.checkExits();
            }

            // Calculate PNL with updated prices
            this.calculatePnL();
        }

        // Emit single consolidated price_update event with all data
        socketService.emit('price_update', {
            token,
            lp: tick.lp,
            ltp: ltp,
            pc: tick.pc,
            h: tick.h,
            l: tick.l,
            c: tick.c,
            v: tick.v,
            // Include position-specific data if this is a position token
            ...(legIdx !== -1 && {
                symbol: this.state.selectedStrikes[legIdx].symbol,
                pnl: this.state.pnl,
                peakProfit: this.state.peakProfit,
                peakLoss: this.state.peakLoss
            })
        });
    }

    private checkAdjustments(leg: LegState) {
        if (this.state.status !== 'ACTIVE' || this.state.isPaused) return;

        // Only monitor Tier 2 Sells (₹75 legs)
        if (leg.tier !== 2 || leg.side !== 'SELL') return;

        // Prevent duplicate adjustments if already handled
        if (leg.isAdjusted) return;
        if (this.state.monitoring.adjusted[leg.token]) return;

        const now = Date.now();
        if (leg.ltp > 100) {
            if (!this.state.monitoring.adjustments[leg.token]) {
                this.state.monitoring.adjustments[leg.token] = now;
                //console.log(`[Alert] ${leg.symbol} > 100. Timer started.`);
            } else {
                const elapsed = now - this.state.monitoring.adjustments[leg.token];
                if (elapsed >= 10000) {
                    this.executeAdjustment(leg);
                    delete this.state.monitoring.adjustments[leg.token]; // Prevention of multiple fires
                }
            }
        } else {
            // Reset timer if price drops below 100
            delete this.state.monitoring.adjustments[leg.token];
        }
    }

    private async executeAdjustment(triggeredLeg: LegState) {
        //console.log(`[Adjustment] Triggered for ${triggeredLeg.symbol} (Stayed > 100 for 10s)`);

        // Mark as adjusted immediately to prevent race conditions/double firing
        if (triggeredLeg.isAdjusted || this.state.monitoring.adjusted[triggeredLeg.token]) {
            return;
        }
        triggeredLeg.isAdjusted = true;
        this.state.monitoring.adjusted[triggeredLeg.token] = true;

        // Find the next OTM hedge (50 points further)
        try {
            // Correctly fetch option chain starting from the triggered leg's strike
            const chain: any[] = await shoonya.getOptionChain('NFO', triggeredLeg.symbol, parseFloat(triggeredLeg.strike), 10) as any[];
            const scrips = (chain || []);
            scrips.sort((a, b) => parseFloat(a.strprc) - parseFloat(b.strprc));

            const currentIdx = scrips.findIndex(s => s.token === triggeredLeg.token);
            let targetScrip;
            if (triggeredLeg.type === 'CE') {
                targetScrip = scrips.slice(currentIdx + 1).find(s => s.optt === 'CE'); // Next higher CE
            } else {
                targetScrip = [...scrips].slice(0, currentIdx).reverse().find(s => s.optt === 'PE'); // Next lower PE
            }

            if (targetScrip) {
                // Fetch latest quotes for target scrip to get dynamic lot size (ls)
                const quote: any = await shoonya.getQuotes('NFO', targetScrip.token);
                const lotSize = quote && quote.ls ? parseFloat(quote.ls) : 65;

                const adjustmentLeg: LegState = {

                    token: targetScrip.token,
                    symbol: targetScrip.tsym,
                    type: targetScrip.optt as 'CE' | 'PE',
                    side: 'BUY',
                    strike: targetScrip.strprc,
                    entryPrice: parseFloat(quote.lp) || 0, // Always a number, never raw string
                    ltp: parseFloat(quote.lp) || 0, // Use live price as initial ltp too
                    quantity: lotSize,
                    tier: 2, // Adjustments for Tier 2 Sell should maintain Tier 2 monitoring

                    // New leg added dynamically: give pnl a short settling grace period
                    isPnLSettling: true,
                    pnlSettlingSince: Date.now()
                };


                // Margin Check for Adjustment
                if (!this.state.isVirtual) {
                    const hasMargin = await this.checkMargin([adjustmentLeg]);
                    if (!hasMargin) {
                        this.addLog(`❌ Adjustment Skipped: Insufficient Margin for ${adjustmentLeg.symbol}`);
                        telegramService.sendMessage(`⚠️ <b>Adjustment Skipped</b>\nInsufficient Margin for ${adjustmentLeg.symbol}`);
                        return;
                    }
                }

                await this.executeLeg(adjustmentLeg);
                this.state.selectedStrikes.push(adjustmentLeg);
                await db.syncPositions(this.state.selectedStrikes, this.getUid());
                this.resubscribe();
                //console.log(`[Adjustment] Placed market BUY for ${adjustmentLeg.symbol}`);
                telegramService.sendMessage(`⚠️ <b>Adjustment Triggered</b>\n${triggeredLeg.symbol} reached LTP ${triggeredLeg.ltp} (>100).\nNew hedge: ${adjustmentLeg.symbol} @ Market`);
            }
        } catch (e) {
            console.error('Adjustment failed:', e);
        }
    }

    private checkExits() {
        if (this.state.isPaused) return;

        // Guard: if an exit is already in-flight, don't start another one.
        // exitAllPositions() sets isExiting=true for its duration.
        if (this.isExiting) return;

        const now = Date.now();
        // Profit Exit: > target for 10s
        if (this.state.targetPnl != null && this.state.targetPnl > 0 && this.state.pnl > this.state.targetPnl) {
            if (!this.state.monitoring.profitTime) {
                this.state.monitoring.profitTime = now;
                // Log PnL breakdown when timer starts
                this.addLog(`⚠️ Profit Target Timer Started: Current PnL ₹${this.state.pnl.toFixed(2)} > Target ₹${this.state.targetPnl}`);
                this.state.selectedStrikes.forEach(l => {
                    const legPnl = (l.ltp - (l.entryPrice || 0)) * l.quantity * (l.side === 'BUY' ? 1 : -1);
                    console.log(`[PnL Debug] ${l.symbol}: LTP=${l.ltp}, Entry=${l.entryPrice}, PnL=${legPnl.toFixed(2)}`);
                });
            }
            else if (now - this.state.monitoring.profitTime >= 10000) {
                this.exitAllPositions(`Profit Target ₹${this.state.targetPnl} (10s confirmation)`);
            }
        } else {
            this.state.monitoring.profitTime = 0;
        }

        // Loss Exit: < stop loss for 10s
        if (this.state.stopLossPnl != null && this.state.stopLossPnl !== 0 && this.state.pnl < -Math.abs(this.state.stopLossPnl)) {
            if (!this.state.monitoring.lossTime) {
                this.state.monitoring.lossTime = now;
                this.addLog(`⚠️ Stop Loss Timer Started: Current PnL ₹${this.state.pnl.toFixed(2)} < SL ₹${-Math.abs(this.state.stopLossPnl)}`);
            }
            else if (now - this.state.monitoring.lossTime >= 10000) {
                this.exitAllPositions(`Loss Limit ₹${this.state.stopLossPnl} (10s confirmation)`);
            }
        } else {
            this.state.monitoring.lossTime = 0;
        }
    }

    private calculatePnL() {
        let totalPnL = 0;
        for (const leg of this.state.selectedStrikes) {
            // Skip PnL calculation for legs with invalid/zero entry price (pending orders)
            // This prevents false profit spikes when a market order is placed but not yet filled/updated
            if (!leg.entryPrice || leg.entryPrice <= 0) continue;

            // If LTP is 0 (no data yet), use entry price to avoid false PnL spikes
            const currentPrice = (leg.ltp && leg.ltp > 0) ? leg.ltp : leg.entryPrice;
            const multiplier = leg.side === 'BUY' ? 1 : -1;
            totalPnL += (currentPrice - leg.entryPrice) * leg.quantity * multiplier;
        }

        // Sanity cap: reject obviously bad PnL values entirely (> ±5 lakhs)
        // This prevents false exits from string-type prices or bad WebSocket data
        const PNL_SANITY_LIMIT = 500000;
        if (Math.abs(totalPnL) > PNL_SANITY_LIMIT) {
            console.warn(`[PnL] ⚠️ Sanity cap: totalPnL = ₹${totalPnL.toFixed(2)} exceeds ±₹5L. Discarding entirely.`);
            return; // Don't update state.pnl at all — no exit trigger, no peak update
        }

        // Avoid PnL/peaks spikes during entry/transition.
        // During entry, entryPrice/ltp can temporarily mismatch until orders/fills stabilize.
        const shouldUpdatePnl = this.state.status === 'ACTIVE' && !this.isPlacingOrder;

        if (shouldUpdatePnl) {
            this.state.pnl = totalPnL;
        }

        // Only track peaks in ACTIVE mode (leg prices are expected to be stable then).
        if (this.state.status !== 'ACTIVE') return;
        if (this.isPlacingOrder) return;

        // If we just added a new adjustment leg, don't update peaks until pnl has "settled".
        // This prevents huge peak spikes caused by temporary ltp/entryPrice mismatch.
        const graceMs = 15_000;
        const nowTs = Date.now();
        const hasSettlingLeg = this.state.selectedStrikes.some(l => l.isPnLSettling && l.pnlSettlingSince && (nowTs - l.pnlSettlingSince) < graceMs);
        if (hasSettlingLeg) return;

        // Clear settling flags when grace has passed.
        this.state.selectedStrikes.forEach(l => {
            if (l.isPnLSettling && l.pnlSettlingSince && (nowTs - l.pnlSettlingSince) >= graceMs) {
                l.isPnLSettling = false;
            }
        });

        // Keep pnl synced before peak comparison (sanity already checked above)
        this.state.pnl = totalPnL;

        if (totalPnL > this.state.peakProfit) this.state.peakProfit = totalPnL;
        if (totalPnL < this.state.peakLoss) this.state.peakLoss = totalPnL;
    }


    private async syncToDb(forcePnl: boolean = false) {
        const now = Date.now();
        if (forcePnl || (now - this.lastPnlUpdateTime >= this.PNL_UPDATE_INTERVAL)) {
            const statePayload = {
                status: this.state.status,
                isActive: this.state.isActive,
                isVirtual: this.state.isVirtual,
                isTradePlaced: this.state.isTradePlaced,
                pnl: this.state.pnl,
                peakProfit: this.state.peakProfit,
                peakLoss: this.state.peakLoss,
                requiredMargin: this.state.requiredMargin,
                availableMargin: this.state.availableMargin,
                entryTime: this.state.entryTime,
                exitTime: this.state.exitTime,
                nextAction: this.state.nextAction,
                engineActivity: this.state.engineActivity,
                isPaused: this.state.isPaused,
                lastHeartbeat: new Date().toISOString(),
                positionEntryDate: this.state.positionEntryDate, // Persist entry date
                reEntry: this.state.reEntry // [NEW] Send re-entry state to frontend
            };

            await db.updateState(statePayload, this.getUid());
            socketService.emit('strategy_state', statePayload);

            this.lastPnlUpdateTime = now;
        }
    }

    private handleOrderReport(report: any) { }

    async exitAllPositions(reason: string) {
        if (this.isExiting) {
            console.log(`[Strategy] ⚠️ Exit skipped: 'exitAllPositions' already in progress (Reason: ${reason})`);
            return;
        }

        this.isExiting = true;
        console.log(`Exiting all positions: ${reason}`);

        try {
            // Sort: Close Shorts (SELL) first, then Longs (BUY)
            const legsToExit = [...this.state.selectedStrikes].sort((a, b) => {
                if (a.side === 'SELL' && b.side !== 'SELL') return -1;
                if (b.side === 'SELL' && a.side !== 'SELL') return 1;
                return 0;
            });

            // Loop and Place Exit Orders
            for (const leg of legsToExit) {
                const exitSide = leg.side === 'BUY' ? 'SELL' : 'BUY';
                if (!this.state.isVirtual) {
                    try {
                        const exitOrder = {
                            exchange: 'NFO',
                            tradingsymbol: leg.symbol,
                            quantity: leg.quantity.toString(),
                            discloseqty: '0',
                            price: '0',
                            product_type: 'M',
                            buy_or_sell: exitSide === 'BUY' ? 'B' : 'S',
                            price_type: 'MKT',
                            trigger_price: '0',
                            retention: 'DAY',
                            remarks: `EXIT_${reason.replace(/\s+/g, '_').toUpperCase()}`.substring(0, 20) // Truncate if needed
                        };

                        this.addLog(`🔄 Exiting ${leg.symbol} (${exitSide})...`);
                        const res: any = await shoonya.placeOrder(exitOrder);

                        if (res && res.stat === 'Ok') {
                            await db.logOrder({
                                token: leg.token,
                                symbol: leg.symbol,
                                side: exitSide,
                                price: 0,
                                quantity: leg.quantity,
                                status: 'COMPLETE',
                                isVirtual: false,
                                orderId: res.norenordno,
                                action: 'EXIT'
                            }, this.getUid());
                            this.addLog(`✅ Exit Order Sent: ${leg.symbol} | ID: ${res.norenordno}`);
                        } else {
                            this.addLog(`❌ Exit Failed: ${leg.symbol} | ${res.emsg || 'Unknown'}`);
                            await db.logOrder({
                                token: leg.token,
                                symbol: leg.symbol,
                                side: exitSide,
                                price: 0,
                                quantity: leg.quantity,
                                status: 'FAILED',
                                isVirtual: false,
                                action: 'EXIT'
                            }, this.getUid());
                        }
                    } catch (e: any) {
                        this.addLog(`❌ Exit Exception: ${leg.symbol} | ${e.message}`);
                        console.error('Exit Order Error:', e);
                        await db.logOrder({
                            token: leg.token,
                            symbol: leg.symbol,
                            side: exitSide,
                            price: 0,
                            quantity: leg.quantity,
                            status: 'FAILED',
                            isVirtual: false,
                            action: 'EXIT'
                        }, this.getUid());
                    }
                } else {
                    await db.logOrder({
                        token: leg.token,
                        symbol: leg.symbol,
                        side: exitSide,
                        price: leg.ltp || leg.entryPrice,
                        quantity: leg.quantity,
                        status: 'COMPLETE',
                        isVirtual: true,
                        action: 'EXIT'
                    }, this.getUid());
                    this.addLog(`[VIRTUAL] Exited ${leg.symbol} (${exitSide})`);
                }
            }

            this.state.isActive = false;
            this.state.isTradePlaced = false;

            // ========== RE-ENTRY DETECTION LOGIC ==========
            await this.detectAndScheduleReEntry(reason);
            // ==============================================

            // Set status based on reason
            // Check if re-entry is scheduled FIRST
            if (this.state.reEntry.isEligible && !this.state.reEntry.hasReEntered && !reason.includes('MANUAL')) {
                this.state.status = 'IDLE'; // Pending/Waiting state
                this.state.engineActivity = 'Waiting for Re-Entry';
                // nextAction is set in detectAndScheduleReEntry
                this.addLog('ℹ️ [Status] Keeping engine IDLE for Re-Entry');
            } else if (reason.includes('Profit') || reason.includes('Loss') || reason.includes('MANUAL')) {
                this.state.status = 'FORCE_EXITED';
                this.state.engineActivity = 'Strategy Terminated';
                this.state.nextAction = 'Manual Reset Required';
            } else {
                this.state.status = 'IDLE';
                this.state.engineActivity = 'Waiting for Next Cycle';
                this.state.nextAction = 'Daily 9 AM Evaluation';
            }
            console.log("Exit all position state : ", this.state);
            // Save to history before clearing
            await db.saveTradeHistory({
                ...this.state,
                exitReason: reason
            }, this.state.selectedStrikes, this.getUid());

            this.state.selectedStrikes = [];
            // Reset peaks so they don't bleed into the next trade cycle
            this.state.peakProfit = 0;
            this.state.peakLoss = 0;
            this.state.pnl = 0;
            await db.syncPositions([], this.getUid());
            await this.syncToDb(true);
            socketService.emit('strategy_exit', { reason });
            console.log("Exit all position state : ", this.state);
            telegramService.sendMessage(`🏁 <b>Strategy Closed</b>\nReason: ${reason}\nFinal PnL: <b>₹${this.state.pnl.toFixed(2)}</b>`);

        } finally {
            this.isExiting = false;
        }
    }

    // ========== RE-ENTRY FEATURE METHODS ==========

    private async detectAndScheduleReEntry(exitReason: string) {
        try {
            const exitTime = new Date();
            const exitHour = exitTime.getHours();
            const exitMinute = exitTime.getMinutes();
            const exitDate = exitTime.toISOString().split('T')[0]; // YYYY-MM-DD

            // Parse configurable cutoff time
            const [cutoffHour, cutoffMinute] = this.state.reEntryCutoffTime.split(':').map(Number);

            // Check if exit is before cutoff time
            const isEarlyExit = exitHour < cutoffHour || (exitHour === cutoffHour && exitMinute < cutoffMinute);

            if (!isEarlyExit) {
                this.addLog(`ℹ️ [Re-Entry] Exit after ${this.state.reEntryCutoffTime}, not eligible for re-entry`);
                return;
            }

            // Calculate position age in days
            if (!this.state.positionEntryDate) {
                this.addLog(`ℹ️ [Re-Entry] No entry date recorded, cannot determine position age`);
                return;
            }

            const entryDate = new Date(this.state.positionEntryDate);
            const exitDateObj = new Date(exitDate);
            const positionAge = Math.floor((exitDateObj.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

            // Check if position was taken EXACTLY yesterday (position age = 1)
            const isYesterdayPosition = positionAge === 1;

            // Check if this is NOT expiry day exit
            const isNotExpiryDayExit = !exitReason.includes('Expiry');

            // Allow Same Day (Age 0) OR Yesterday (Age 1)
            const isEligibleAge = positionAge === 0 || positionAge === 1;

            if (isEligibleAge && isNotExpiryDayExit) {
                // Calculate re-entry time (2 minutes from now)
                const reEntryTime = new Date(exitTime.getTime() + 2 * 60 * 1000);

                this.state.reEntry.isEligible = true;
                this.state.reEntry.originalExitTime = exitTime.toISOString();
                this.state.reEntry.originalExitReason = exitReason;
                this.state.reEntry.positionAge = positionAge;
                this.state.reEntry.scheduledReEntryTime = reEntryTime.toISOString();

                this.addLog(`✅ [Re-Entry] Eligible for re-entry in 2 minutes`);
                this.addLog(`   - Position taken on: ${this.state.positionEntryDate}`);
                this.addLog(`   - Exited on: ${exitDate} at ${exitTime.toLocaleTimeString('en-IN')}`);
                this.addLog(`   - Position taken on: ${this.state.positionEntryDate}`);
                this.addLog(`   - Exited on: ${exitDate} at ${exitTime.toLocaleTimeString('en-IN')}`);
                this.addLog(`   - Position age: ${positionAge} days`);
                this.addLog(`   - Exit reason: ${exitReason}`);
                this.addLog(`   - Scheduled re-entry: ${reEntryTime.toLocaleTimeString('en-IN')}`);

                this.state.nextAction = `Re-Entry at ${reEntryTime.toLocaleTimeString('en-IN')} (2 min after exit)`;

                // Schedule re-entry after 2 minutes
                this.scheduleReEntry(2 * 60 * 1000); // 2 minutes in milliseconds

                // Save original strikes for restoration/expiry tracking
                this.state.reEntry.originalStrikes = JSON.parse(JSON.stringify(this.state.selectedStrikes));
                this.addLog(`💾 [Re-Entry] Saved ${this.state.reEntry.originalStrikes?.length} original legs for restoration.`);

            } else if (positionAge > 1) {
                this.addLog(`ℹ️ [Re-Entry] Position is ${positionAge} days old, not eligible for re-entry (Max 1 day old allowed)`);
            }
        } catch (error: any) {
            this.addLog(`❌ [Re-Entry] Error in detection: ${error.message}`);
        }
    }

    private scheduleReEntry(delayMs: number) {
        // Clear any existing timer
        if (this.reEntryTimer) {
            clearTimeout(this.reEntryTimer);
            this.reEntryTimer = null;
        }

        this.addLog(`⏰ [Re-Entry] Scheduling re-entry in ${delayMs / 1000} seconds`);

        // Schedule re-entry
        this.reEntryTimer = setTimeout(async () => {
            try {
                await this.executeReEntry();
            } catch (error: any) {
                this.addLog(`❌ [Re-Entry] Error during scheduled re-entry: ${error.message}`);
            } finally {
                this.reEntryTimer = null;
            }
        }, delayMs);
    }

    private async executeReEntry() {
        try {
            // Safety checks
            if (!this.state.reEntry.isEligible) {
                this.addLog('[Re-Entry] Not eligible for re-entry');
                return;
            }

            if (this.state.reEntry.hasReEntered) {
                this.addLog('[Re-Entry] Already re-entered today, skipping');
                return;
            }

            if (this.state.isPaused) {
                this.addLog('[Re-Entry] System is paused, skipping re-entry');
                return;
            }

            if (this.state.status !== 'EXIT_DONE' && this.state.status !== 'FORCE_EXITED' && this.state.status !== 'IDLE') {
                this.addLog(`[Re-Entry] Invalid status: ${this.state.status}, expected EXIT_DONE, FORCE_EXITED, or IDLE`);
                return;
            }

            this.addLog('🔄 [Re-Entry] Executing scheduled re-entry');

            // Mark as re-entered to prevent multiple attempts
            this.state.reEntry.hasReEntered = true;
            await this.syncToDb(true);


            // Execute entry logic
            this.addLog(`🔄 [Re-Entry] executing dynamic strike selection (Spot-based)...`);

            // Extract expiry from original strikes if available to ensure we stick to the same week
            let reEntryExpiry: string | undefined = undefined;
            if (this.state.reEntry.originalStrikes && this.state.reEntry.originalStrikes.length > 0) {
                // Parse expiry from symbol e.g., NIFTY23JAN26C24000
                const firstLeg = this.state.reEntry.originalStrikes[0];
                const match = firstLeg.symbol.match(/NIFTY(\d{2}[A-Z]{3}\d{2})/);
                if (match && match[1]) {
                    // Convert 23JAN26 -> 23-JAN-2026 format expected by selectStrikes (or whatever format it uses?)
                    // Wait, selectStrikes expects normalized format if possible, or matches against getAvailableExpiries.
                    // The standard option chain format has 23JAN26. 
                    // Let's pass it as is, but we might need to verify format match.
                    // getAvailableExpiries returns "13-JAN-2026".
                    // We need to convert "27JAN26" -> "27-JAN-2026".

                    const rawDate = match[1]; // 23JAN26
                    const day = rawDate.substring(0, 2);
                    const month = rawDate.substring(2, 5);
                    const yearShort = rawDate.substring(5, 7);
                    reEntryExpiry = `${day}-${month}-20${yearShort}`;
                    this.addLog(`🔄 [Re-Entry] Detected Original Expiry: ${reEntryExpiry}`);
                }
            }


            const expiries = await this.getAvailableExpiries();
            if (expiries.length === 0) return false;
            const currentExpiry = expiries[0]; // First expiry = current week

            // We use standard strategy selection logic because spot price might have changed
            // BUT we enforce the extracted expiry date if available
            await this.selectStrikes(reEntryExpiry || currentExpiry);

            await this.placeOrder(false);

            // Send notification
            await telegramService.sendMessage(
                `🔄 *Re-Entry Trade Executed*\n\n` +
                `Original Exit: ${this.state.reEntry.originalExitReason}\n` +
                `Exit Time: ${new Date(this.state.reEntry.originalExitTime).toLocaleTimeString('en-IN')}\n` +
                `Re-Entry Time: ${new Date().toLocaleTimeString('en-IN')}\n` +
                `Position Age: ${this.state.reEntry.positionAge} day\n\n` +
                `New positions taken automatically.`
            );

        } catch (error: any) {
            this.addLog(`❌ [Re-Entry] Error: ${error.message}`);
        }
    }

    // ========== END RE-ENTRY FEATURE METHODS ==========

    // --- Control Methods ---

    async pause() {
        this.addLog('⏸️ Strategy PAUSED by User.');
        telegramService.sendMessage('⏸️ <b>Strategy Paused</b>');
        await this.syncToDb();
    }

    async resumeMonitoring() {
        this.addLog('▶️ Strategy RESUMED by User.' + this.state.isPaused);
        if (!this.state.isPaused) return;
        this.state.isPaused = false;
        this.addLog('▶️ Strategy RESUMED by User.');
        telegramService.sendMessage('▶️ <b>Strategy Resumed</b>');
        await this.syncToDb();
        if (this.state.isActive) {
            this.checkExits();
        }
    }

    async manualExit() {
        this.addLog('🛑 Manual Kill Switch Triggered!');
        telegramService.sendMessage('🛑 <b>Manual Kill Switch Triggered!</b>\nExiting all positions and pausing strategy.');
        await this.exitAllPositions('MANUAL_KILL_SWITCH');
        // Pause after kill switch to prevent auto-reentry if any logic remains
        this.state.isPaused = true;
        this.state.status = 'FORCE_EXITED';
        await this.syncToDb(true);
    }

    async resetEngine() {
        // Only allow reset from FORCE_EXITED state
        if (this.state.status !== 'FORCE_EXITED') {
            throw new Error('Reset only allowed from FORCE_EXITED state');
        }

        this.addLog('🔄 [System] Manual engine reset initiated...');

        // Clear any remaining positions (safety check)
        if (this.state.selectedStrikes.length > 0) {
            this.addLog('⚠️ [Reset] Clearing remaining positions...');
            this.state.selectedStrikes = [];
            await db.syncPositions([], this.getUid());
        }

        // Reset to IDLE state
        this.state.status = 'IDLE';
        this.state.isActive = false;
        this.state.isTradePlaced = false;
        this.state.isPaused = false;
        this.state.pnl = 0;
        this.state.peakProfit = 0;
        this.state.peakLoss = 0;
        this.state.engineActivity = 'Engine Reset';
        this.state.nextAction = 'Ready to Resume';
        this.state.monitoring = {
            profitTime: 0,
            lossTime: 0,
            adjustments: {},
            adjusted: {}
        };

        await this.syncToDb(true);
        this.addLog('✅ [System] Engine manually reset to IDLE state');
        telegramService.sendMessage('🔄 <b>Engine Reset</b>\nStatus: IDLE\nReady for next cycle');
    }

    async triggerExpirySync() {
        // Guard: only sync if today >= the first stored expiry date (i.e. data is stale)
        try {
            const storedExpiries = await db.getManualExpiries();
            if (storedExpiries && storedExpiries.length > 0) {
                const firstExpiry = this.parseExpiryDate(storedExpiries[0]);
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize to start of day
                firstExpiry.setHours(0, 0, 0, 0);

                if (today < firstExpiry) {
                    this.addLog(`⏭️ [Auto-Sync] Skipped — first stored expiry (${storedExpiries[0]}) is still upcoming. No refresh needed.`);
                    return false;
                }
                this.addLog(`🔁 [Auto-Sync] First expiry ${storedExpiries[0]} reached or passed — refreshing from NSE...`);
            } else {
                this.addLog(`🔁 [Auto-Sync] No stored expiries found — fetching from NSE...`);
            }
        } catch (guardErr: any) {
            // If guard check fails, proceed with sync anyway (fail-safe)
            this.addLog(`⚠️ [Auto-Sync] Guard check failed (${guardErr.message}), proceeding with sync...`);
        }

        const maxAttempts = 3;
        let attempt = 0;

        while (attempt < maxAttempts) {
            attempt++;
            this.addLog(`🔄 [Auto-Sync] Attempt ${attempt}/${maxAttempts}: Fetching latest expiry dates from NSE...`);

            try {
                const data = await nseService.getOptionChainData('NIFTY');
                // Check for both structures (indices uses records.expiryDates, contract-info uses expiryDates)
                const expiries = (data && data.records && data.records.expiryDates)
                    ? data.records.expiryDates
                    : (data && data.expiryDates)
                        ? data.expiryDates
                        : null;

                if (expiries) {
                    // Normalize: trim and uppercase so "24-Mar-2026" → "24-MAR-2026"
                    const formatted = expiries.map((d: string) => d.trim().toUpperCase());

                    const success = await db.setManualExpiries(formatted, this.getUid());
                    if (success) {
                        this.addLog(`✅ [Auto-Sync] Updated DB with ${formatted.length} expiries. Next: ${formatted[0]} → ${formatted[1] || '-'}`);
                        return true;
                    } else {
                        throw new Error('Failed to update DB (setManualExpiries returned false). Check RLS policies?');
                    }
                }
                throw new Error('No expiry dates found in NSE response');
            } catch (err: any) {
                console.error(`[Auto-Sync] Attempt ${attempt} Failed:`, err);

                if (attempt === maxAttempts) {
                    this.addLog(`❌ [Auto-Sync] Final Failure after ${maxAttempts} attempts: ${err.message}`);
                    return false; // Don't throw — cron should not crash on NSE failures
                }

                this.addLog(`⚠️ [Auto-Sync] Attempt ${attempt} failed: ${err.message}. Retrying in 5s...`);
                // Wait 5 seconds before retry
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        return false;
    }

    private async updateMargins() {
        const isLoggedIn = shoonya.isLoggedIn();
        if (!isLoggedIn) {
            console.log('⚠️ [UpdateMargins] Skipped: Not logged in to Shoonya');
            return;
        }

        try {
            //console.log('Margin Res entered:');
            // 1. Get Available Margin (Cash + Collateral)
            const limits: any = await shoonya.getLimits();
            if (limits) {
                this.state.availableMargin = parseFloat(limits.cash) || 0;
            }

            // 2. Get Required Margin for current positions (if any)
            if (this.state.selectedStrikes.length > 0) {
                const orders = this.state.selectedStrikes.map(leg => ({
                    exch: 'NFO',
                    tsym: leg.symbol,
                    qty: leg.quantity.toString(),
                    prc: (leg.entryPrice || 0).toString(),
                    prd: 'M',
                    trantype: leg.side === 'BUY' ? 'B' : 'S',
                    prctyp: 'MKT'
                }));

                const primaryOrder = orders[0];
                const otherOrders = orders.slice(1);

                const payload = {
                    ...primaryOrder,
                    basketlists: otherOrders.length > 0 ? otherOrders : undefined
                };

                const marginRes: any = await shoonya.getBasketMargin(payload);
                //console.log('Margin Res:', marginRes);
                if (marginRes && marginRes.stat === 'Ok') {
                    // Mapping per user request:
                    // marginusedtrade -> Required Margin
                    // marginused -> Available Margin
                    if (marginRes.marginusedtrade) {
                        this.state.requiredMargin = parseFloat(marginRes.marginusedtrade);
                    }
                    if (marginRes.marginused) {
                        this.state.availableMargin = parseFloat(marginRes.marginused);
                    }
                } else if (marginRes && marginRes.margin) {
                    // Fallback to old format just in case
                    this.state.requiredMargin = parseFloat(marginRes.margin);
                }
            } else {
                this.state.requiredMargin = 0;
            }
            //console.log('Margin Res exited:');
        } catch (err) { }
    }
    private async monitorPnL() {
        // console.log(`[MonitorPnL] Tick. Status: ${this.state.status}`);
        if (this.state.status !== 'ACTIVE' && this.state.status !== 'ENTRY_DONE') {
            // console.log('[MonitorPnL] Skipped (Status not ACTIVE/ENTRY_DONE)');
            return;
        }

        try {
            // Update Margins periodically
            await this.updateMargins();

            // Recalculate PnL
            await this.calculatePnL();

            // Check Limits — delegate to checkExits() which enforces the shared 10-second
            // confirmation timer. Previously this cron path called exitAllPositions() instantly
            // (no timer), meaning a transient PnL spike during a single cron tick could close
            // all positions without the WebSocket path's confirmation window.
            this.checkExits();

            await this.syncToDb();

            // Log PnL Snapshot for Chart
            const now = new Date();
            const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const currentHour = istNow.getHours();
            const currentMinute = istNow.getMinutes();
            const isMarketOpen = (currentHour < 15) || (currentHour === 15 && currentMinute <= 30);

            // Only log if market is open AND PnL has changed significantly (or first log)
            if (isMarketOpen) {
                if (this.lastLoggedPnl === null || this.state.pnl !== this.lastLoggedPnl) {
                    await db.logPnlSnapshot(this.state.pnl, this.getUid());
                    this.lastLoggedPnl = this.state.pnl;
                }
            }

        } catch (err) {
            console.error('Monitor PnL Error:', err);
        }
    }
}

export const strategyEngine = new StrategyEngine();
