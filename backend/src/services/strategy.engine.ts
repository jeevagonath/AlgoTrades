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
    targetPnl: number;
    stopLossPnl: number;
    telegramToken: string;
    telegramChatId: string;
    monitoring: {
        profitTime: number; // Start timestamp
        lossTime: number;   // Start timestamp
        adjustments: Record<string, number>; // token -> start timestamp
    };
    nextAction: string; // "Exit at 12:45 PM", "Target Hit", etc.
    engineActivity: string; // "Watching Spikes", "Waiting for Expiry", etc.
    lastHeartbeat: string; // ISO string
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
        exitTime: '15:15',
        targetPnl: 2100,
        stopLossPnl: -1500,
        telegramToken: '',
        telegramChatId: '',
        monitoring: {
            profitTime: 0,
            lossTime: 0,
            adjustments: {}
        },
        nextAction: 'Daily 9 AM Evaluation',
        engineActivity: 'Initializing',
        lastHeartbeat: new Date().toISOString()
    };

    private lastPnlUpdateTime: number = 0;
    private PNL_UPDATE_INTERVAL = 5 * 60 * 1000;
    private isWebSocketStarted: boolean = false;

    constructor() {
        this.initScheduler();
    }

    async resume() {
        try {
            this.addLog('🔄 [System] Engine Startup: Initializing state...');

            // 1. Load basic state from DB
            const savedState: any = await db.getState();
            if (savedState) {
                this.state.isVirtual = savedState.isVirtual !== undefined ? savedState.isVirtual : true;
                this.state.isPaused = savedState.isPaused !== undefined ? savedState.isPaused : false;
                this.state.targetPnl = savedState.targetPnl || 2100;
                this.state.stopLossPnl = savedState.stopLossPnl || -1500;
                this.state.entryTime = savedState.entryTime || '12:59';
                this.state.exitTime = savedState.exitTime || '15:15';

                this.state.pnl = savedState.pnl || 0;
                this.state.peakProfit = savedState.peakProfit || 0;
                this.state.peakLoss = savedState.peakLoss || 0;

                if (savedState.telegramToken && savedState.telegramChatId) {
                    this.state.telegramToken = savedState.telegramToken;
                    this.state.telegramChatId = savedState.telegramChatId;
                    telegramService.setCredentials(this.state.telegramToken, this.state.telegramChatId);
                }
            }

            // 2. Load positions
            const positions = await db.getPositions();
            this.state.selectedStrikes = positions;

            // 3. Determine Lifecycle State
            const isExpiry = await this.isExpiryDay();

            if (positions.length > 0) {
                // If we have positions, we MUST be in a state that monitors them
                // Usually ACTIVE, but could be FORCE_EXITED if we crashed during exit
                const currentStatus = savedState?.status || 'IDLE';
                if (currentStatus === 'FORCE_EXITED') {
                    this.state.status = 'FORCE_EXITED';
                    this.state.engineActivity = 'System Locked';
                    this.state.nextAction = 'Manual Reset Required';
                } else {
                    this.state.status = 'ACTIVE';
                    this.state.engineActivity = 'Monitoring Positions';
                    this.state.nextAction = 'Target/SL or 12:45 Expiry Exit';
                }
                this.state.isTradePlaced = true;
                this.state.isActive = true;
                this.startMonitoring();
                this.calculatePnL();
                this.addLog(`[Strategy] Resumed ACTIVE: Found ${positions.length} positions.`);
            } else {
                // No positions - Check if we should be waiting for expiry or idle
                if (isExpiry) {
                    this.state.status = 'WAITING_FOR_EXPIRY';
                    this.state.engineActivity = 'Waiting for Expiry Time';
                    this.state.nextAction = '12:45 PM Exit';
                    this.addLog('🔔 [Strategy] Resumed: Today is EXPIRY DAY. Waiting for 12:45 PM.');
                } else {
                    this.state.status = 'IDLE';
                    this.state.engineActivity = 'Idle';
                    this.state.nextAction = 'Daily 9 AM Expiry Check';
                    this.addLog('💤 [Strategy] Resumed: Normal day. Status IDLE.');
                }
                this.state.isTradePlaced = false;
                this.state.isActive = false;
            }

            // 4. Initial sync and scheduler
            await this.syncToDb(true);
            this.initScheduler();

        } catch (err) {
            console.error('[Strategy] Failed to resume strategy:', err);
            this.addLog(`❌ [System] Resume Error: ${err}`);
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
        const month = months[parts[1]];
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

        // 1. Daily Reset at 9:00 AM
        this.schedulers.push(cron.schedule('0 9 * * *', async () => {
            this.addLog('🌅 [System] Daily 9 AM Reset - evaluating today...');
            const isExpiry = await this.isExpiryDay();

            if (isExpiry) {
                this.state.status = 'WAITING_FOR_EXPIRY';
                this.state.engineActivity = 'Waiting for Expiry Sequence';
                this.state.nextAction = '12:45 PM Exit';
                telegramService.sendMessage('🔔 <b>Expiry Day Detected</b>\nAutomated rollover sequence armed.');
            } else {
                this.state.status = 'IDLE';
                this.state.engineActivity = 'Watching for Expiry Day';
                this.state.nextAction = 'Next 9 AM Check';
            }

            await this.syncToDb(true);
            await this.initScheduler();
        }));

        const isExpiry = await this.isExpiryDay();
        if (!isExpiry) {
            this.addLog('ℹ️ Not expiry day - Positions will be held');
            return;
        }

        // --- EXPIRY DAY TIMERS ---

        // 12:45 PM - Exit positions (Transition to EXIT_DONE)
        this.schedulers.push(cron.schedule('45 12 * * *', async () => {
            if (this.state.status !== 'WAITING_FOR_EXPIRY') {
                this.addLog(`⚠️ [Scheduler] Skipped 12:45 exit. Status is ${this.state.status} (expected WAITING_FOR_EXPIRY)`);
                return;
            }

            this.addLog('⏰ [Expiry] 12:45 PM reached. Squaring off positions...');
            await this.exitAllPositions('Expiry Day Rollover');
            this.state.status = 'EXIT_DONE';
            this.state.engineActivity = 'Exit Sequence Complete';
            this.state.nextAction = '12:59 PM Strike Selection';
            await this.syncToDb(true);
            telegramService.sendMessage('📤 <b>Expiry Day Exit</b>\nAll positions squared off successfully.');
        }));

        // 12:59:00 PM - Pre-selection
        this.schedulers.push(cron.schedule('59 12 * * *', async () => {
            if (this.state.status !== 'EXIT_DONE') {
                this.addLog(`⚠️ [Scheduler] Skipped strike selection. Status is ${this.state.status} (expected EXIT_DONE)`);
                return;
            }

            this.state.engineActivity = 'Selecting Strikes...';
            this.state.nextAction = '1:00 PM Order Placement';
            this.addLog('🎯 [Expiry] 12:59 PM: Selecting strikes for next week...');
            await this.selectStrikes();
        }));

        // 01:00:00 PM - Entry (Transition to ENTRY_DONE then ACTIVE)
        this.schedulers.push(cron.schedule('0 13 * * *', async () => {
            if (this.state.status !== 'EXIT_DONE') {
                this.addLog(`⚠️ [Scheduler] Skipped 1:00 PM entry. Status is ${this.state.status} (expected EXIT_DONE)`);
                return;
            }

            this.state.engineActivity = 'Placing Orders...';
            this.state.nextAction = 'Verifying Execution';
            this.addLog('🚀 [Expiry] 1:00 PM: Placing orders for new cycle...');
            const res = await this.placeOrder();
            if (res && res.status === 'success') {
                this.state.status = 'ENTRY_DONE';
                this.state.engineActivity = 'Verifying Entry';
                this.state.nextAction = 'Transition to ACTIVE';
                await this.syncToDb(true);

                setTimeout(async () => {
                    this.state.status = 'ACTIVE';
                    this.state.engineActivity = 'Monitoring Iron Condor';
                    this.state.nextAction = 'Target/SL or Weekly Expiry';
                    await this.syncToDb(true);
                    this.addLog('✅ [System] Transitioned to ACTIVE Monitoring.');
                }, 5000);
            } else {
                this.state.status = 'FORCE_EXITED';
                this.state.engineActivity = 'Entry Failed';
                this.state.nextAction = 'Manual Reset Required';
                await this.syncToDb(true);
                this.addLog('❌ [System] Entry Failed. System LOCKED in FORCE_EXITED.');
            }
        }));
    }
    public async updateSettings(settings: {
        entryTime?: string,
        exitTime?: string,
        targetPnl?: number,
        stopLossPnl?: number,
        telegramToken?: string,
        telegramChatId?: string,
        isVirtual?: boolean
    }) {
        if (settings.entryTime) this.state.entryTime = settings.entryTime;
        if (settings.exitTime) this.state.exitTime = settings.exitTime;
        if (settings.targetPnl !== undefined) this.state.targetPnl = settings.targetPnl;
        if (settings.stopLossPnl !== undefined) this.state.stopLossPnl = settings.stopLossPnl;
        if (settings.telegramToken !== undefined) this.state.telegramToken = settings.telegramToken;
        if (settings.telegramChatId !== undefined) this.state.telegramChatId = settings.telegramChatId;
        if (settings.isVirtual !== undefined) this.state.isVirtual = settings.isVirtual;

        if (this.state.telegramToken && this.state.telegramChatId) {
            telegramService.setCredentials(this.state.telegramToken, this.state.telegramChatId);
        }

        await db.updateState(this.state);
        this.initScheduler();
        this.addLog(`Strategy settings updated. Entry: ${this.state.entryTime}, Exit: ${this.state.exitTime}, Target: ${this.state.targetPnl}, SL: ${this.state.stopLossPnl}, Mode: ${this.state.isVirtual ? 'Virtual' : 'LIVE'}`);
    }

    public getState() {
        return this.state;
    }

    public async getAvailableExpiries() {
        try {
            // Use manual expiries from database
            const manualExpiries = await db.getManualExpiries();

            if (manualExpiries && manualExpiries.length > 0) {
                //console.log(`[Strategy] Using ${manualExpiries.length} manual expiries from database`);
                return manualExpiries;
            }

            console.error('[Strategy] No manual expiries found in database!');
            console.warn('[Strategy] Please add expiry dates in Settings → Manual Expiry Dates');
            return [];
        } catch (e) {
            console.error('Error fetching expiries:', e);
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

    private addLog(msg: string) {
        //console.log(`[Strategy] ${msg}`);
        db.addLog(msg);
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

            // 2. Always use NEXT WEEK's expiry (2nd in list)
            const targetExpiry = this.getTradingExpiry(expiries);

            this.addLog(`🎯 Auto-selecting NEXT WEEK expiry: ${targetExpiry}`);
            //console.log(`[Strategy] Trading Expiry: ${targetExpiry} (Current: ${expiries[0]})`);

            // Send Telegram notification
            telegramService.sendMessage(
                `🎯 <b>Strike Selection Started</b>\n` +
                `Current Week: ${expiries[0]}\n` +
                `Trading Week: ${targetExpiry}\n` +
                `Selecting 8-leg Iron Condor...`
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
            // We need a broad enough range to find ₹150, ₹75, and ₹7 premiums.
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
            const ce7 = getBestMatch('CE', 7, usedTokens);
            addLeg(ce7, 'BUY', 2);

            // 7. PE Sell @ 75
            const pe75 = getBestMatch('PE', 75, usedTokens);
            addLeg(pe75, 'SELL', 2);

            // 8. PE Hedge @ 7
            const pe7 = getBestMatch('PE', 7, usedTokens);
            addLeg(pe7, 'BUY', 2);

            this.state.selectedStrikes = selectedLegs;
            this.startMonitoring();
            await db.syncPositions(selectedLegs);
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
            quantity: picked.ls ? parseFloat(picked.ls) : 50,
            tier
        };
    }

    private async checkMargin(legs: LegState[]): Promise<boolean> {
        if (this.state.isVirtual) return true;

        try {
            this.addLog('🔍 Checking Margin Requirements...');
            const marginRes: any = await shoonya.getBasketMargin(legs);

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

            if (availableMargin < requiredMargin) {
                const shortfall = requiredMargin - availableMargin;
                const msg = `🚨 <b>Margin Shortfall</b>\nRequired: ₹${requiredMargin.toFixed(2)}\nAvailable: ₹${availableMargin.toFixed(2)}\nShortfall: ₹${shortfall.toFixed(2)}\n⚠️ <b>Trade Aborted!</b>`;
                telegramService.sendMessage(msg);
                this.addLog(`❌ Margin Shortfall: ₹${shortfall.toFixed(2)}. Trade Aborted.`);
                return false;
            }

            return true;

        } catch (err: any) {
            console.error('Margin Check Logic Error:', err);
            this.addLog(`❌ Margin Check Ex: ${err.message}`);
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

            // Margin Check
            if (!this.state.isVirtual) {
                const hasMargin = await this.checkMargin(this.state.selectedStrikes);
                if (!hasMargin) {
                    return { status: 'failed', reason: 'Insufficient Margin' };
                }
            }
        }

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
                this.startMonitoring();
                await this.syncToDb(true);

                telegramService.sendMessage(`🚀 <b>Trade Placed</b>\nAll 8 legs executed virtually for Iron Condor.`);

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
            await db.logOrder({ ...leg, price: leg.entryPrice, status: 'COMPLETE', isVirtual: true });
            this.addLog(`[VIRTUAL] ${leg.side} ${leg.symbol} @ ₹${leg.entryPrice}`);
        } else {
            // Real order execution
            try {
                // Now using updated orderParams with correct keys for wrapper
                const result: any = await shoonya.placeOrder(orderParams);

                if (result.stat === 'Ok') {
                    const fillPrice = parseFloat(result.avgprc || leg.entryPrice);
                    leg.entryPrice = fillPrice; // Update with actual fill price

                    await db.logOrder({
                        ...leg,
                        price: fillPrice,
                        status: 'COMPLETE',
                        isVirtual: false,
                        orderId: result.norenordno
                    });

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
        setTimeout(() => this.resubscribe(), 1000);
    }

    private resubscribe() {
        const tokens = this.state.selectedStrikes.map(s => `NFO|${s.token}`);
        if (tokens.length > 0) shoonya.subscribe(tokens);
    }

    private async handlePriceUpdate(tick: any) {
        const token = tick.tk;
        const ltp = parseFloat(tick.lp);
        if (!token || isNaN(ltp)) return;

        // 1. Always emit NIFTY updates (token 26000) for the frontend ticker
        if (token === '26000') {
            socketService.emit('price_update', {
                token,
                lp: tick.lp,
                pc: tick.pc,
                h: tick.h,
                l: tick.l,
                c: tick.c,
                v: tick.v,
                ltp: ltp // Unified field
            });
        }

        const legIdx = this.state.selectedStrikes.findIndex(s => s.token === token);
        if (legIdx !== -1) {
            this.state.selectedStrikes[legIdx].ltp = ltp;

            // 2. Perform strategy logic ONLY if ACTIVE
            if (this.state.status === 'ACTIVE' && !this.state.isPaused) {
                this.checkAdjustments(this.state.selectedStrikes[legIdx]);
                this.checkExits();
            }

            // 3. ALWAYS calculate PNL if we have strikes, to update UI
            this.calculatePnL();

            // 4. ALWAYS emit leg updates for the frontend table
            const emitData = {
                token,
                ltp,
                symbol: this.state.selectedStrikes[legIdx].symbol,
                pnl: this.state.pnl,
                peakProfit: this.state.peakProfit,
                peakLoss: this.state.peakLoss
            };
            socketService.emit('price_update', emitData);
        }
        await this.syncToDb();
    }

    private checkAdjustments(leg: LegState) {
        if (this.state.status !== 'ACTIVE' || this.state.isPaused) return;

        // Only monitor Tier 2 Sells (₹75 legs)
        if (leg.tier !== 2 || leg.side !== 'SELL') return;

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
                const adjustmentLeg: LegState = {
                    token: targetScrip.token,
                    symbol: targetScrip.tsym,
                    type: targetScrip.optt as 'CE' | 'PE',
                    side: 'BUY',
                    strike: targetScrip.strprc,
                    entryPrice: 0, // Market order
                    ltp: 0,
                    quantity: 50,
                    tier: 2 // Adjustments for Tier 2 Sell should maintain Tier 2 monitoring
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

        const now = Date.now();
        // Profit Exit: > target for 10s
        if (this.state.pnl > this.state.targetPnl) {
            if (!this.state.monitoring.profitTime) this.state.monitoring.profitTime = now;
            else if (now - this.state.monitoring.profitTime >= 10000) {
                this.exitAllPositions(`Profit Target ₹${this.state.targetPnl} (10s confirmation)`);
            }
        } else {
            this.state.monitoring.profitTime = 0;
        }

        // Loss Exit: < stop loss for 10s
        if (this.state.pnl < this.state.stopLossPnl) {
            if (!this.state.monitoring.lossTime) this.state.monitoring.lossTime = now;
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
            const multiplier = leg.side === 'BUY' ? 1 : -1;
            totalPnL += (leg.ltp - leg.entryPrice) * leg.quantity * multiplier;
        }
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
                nextAction: this.state.nextAction,
                engineActivity: this.state.engineActivity,
                isPaused: this.state.isPaused,
                lastHeartbeat: new Date().toISOString()
            };

            await db.updateState(statePayload);
            socketService.emit('strategy_state', statePayload);

            this.lastPnlUpdateTime = now;
        }
    }

    private handleOrderReport(report: any) { }

    async exitAllPositions(reason: string) {
        console.log(`Exiting all positions: ${reason}`);

        // Sort: Close Shorts (SELL) first, then Longs (BUY)
        const legsToExit = [...this.state.selectedStrikes].sort((a, b) => {
            if (a.side === 'SELL' && b.side !== 'SELL') return -1;
            if (b.side === 'SELL' && a.side !== 'SELL') return 1;
            return 0;
        });

        // Loop and Place Exit Orders
        for (const leg of legsToExit) {
            if (!this.state.isVirtual) {
                try {
                    const exitOrder = {
                        exchange: 'NFO',
                        tradingsymbol: leg.symbol,
                        quantity: leg.quantity.toString(),
                        discloseqty: '0',
                        price: '0',
                        product_type: 'M',
                        buy_or_sell: leg.side === 'BUY' ? 'S' : 'B', // Reverse side
                        price_type: 'MKT',
                        trigger_price: '0',
                        retention: 'DAY',
                        remarks: `EXIT_${reason.replace(/\s+/g, '_').toUpperCase()}`.substring(0, 20) // Truncate if needed
                    };

                    this.addLog(`🔄 Exiting ${leg.symbol} (${exitOrder.buy_or_sell})...`);
                    const res: any = await shoonya.placeOrder(exitOrder);

                    if (res && res.stat === 'Ok') {
                        this.addLog(`✅ Exit Order Sent: ${leg.symbol} | ID: ${res.norenordno}`);
                    } else {
                        this.addLog(`❌ Exit Failed: ${leg.symbol} | ${res.emsg || 'Unknown'}`);
                    }
                } catch (e: any) {
                    this.addLog(`❌ Exit Exception: ${leg.symbol} | ${e.message}`);
                    console.error('Exit Order Error:', e);
                }
            } else {
                this.addLog(`[VIRTUAL] Exited ${leg.symbol} (${leg.side === 'BUY' ? 'SELL' : 'BUY'})`);
            }
        }

        this.state.isActive = false;
        this.state.isTradePlaced = false;

        // Set status based on reason
        if (reason.includes('Profit') || reason.includes('Loss') || reason.includes('MANUAL')) {
            this.state.status = 'FORCE_EXITED';
            this.state.engineActivity = 'Strategy Terminated';
            this.state.nextAction = 'Manual Reset Required';
        } else {
            this.state.status = 'IDLE';
            this.state.engineActivity = 'Waiting for Next Cycle';
            this.state.nextAction = 'Daily 9 AM Evaluation';
        }

        // Save to history before clearing
        await db.saveTradeHistory({
            ...this.state,
            exitReason: reason
        }, this.state.selectedStrikes);

        this.state.selectedStrikes = [];
        await db.syncPositions([]);
        await this.syncToDb(true);
        socketService.emit('strategy_exit', { reason });

        telegramService.sendMessage(`🏁 <b>Strategy Closed</b>\nReason: ${reason}\nFinal PnL: <b>₹${this.state.pnl.toFixed(2)}</b>`);
    }

    // --- Control Methods ---

    async pause() {
        if (this.state.isPaused) return;
        this.state.isPaused = true;
        this.addLog('⏸️ Strategy PAUSED by User.');
        telegramService.sendMessage('⏸️ <b>Strategy Paused</b>');
        await this.syncToDb();
    }

    async resumeMonitoring() {
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
}

export const strategyEngine = new StrategyEngine();
