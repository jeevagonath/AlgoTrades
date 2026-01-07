import { shoonya } from './shoonya.service';
import { db } from './supabase.service';
import { socketService } from './socket.service';
import { telegramService } from './telegram.service';
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
        }
    };

    private lastPnlUpdateTime: number = 0;
    private PNL_UPDATE_INTERVAL = 5 * 60 * 1000;
    private isWebSocketStarted: boolean = false;

    constructor() {
        this.initScheduler();
    }

    async resume() {
        try {
            const state: any = await db.getState();
            if (state) {
                this.state.status = state.status || (state.isActive ? 'ACTIVE' : 'IDLE'); // Fallback
                this.state.isActive = state.isActive;
                this.state.isTradePlaced = state.isTradePlaced;
                this.state.pnl = state.pnl;
                this.state.peakProfit = state.peakProfit;
                this.state.peakLoss = state.peakLoss;
                this.state.entryTime = state.entryTime || '12:59';
                this.state.exitTime = state.exitTime || '15:15';
                this.state.targetPnl = state.targetPnl || 2100;
                this.state.stopLossPnl = state.stopLossPnl || -1500;
                this.state.telegramToken = state.telegramToken || '';
                this.state.telegramChatId = state.telegramChatId || '';
                this.state.isVirtual = state.isVirtual !== undefined ? state.isVirtual : true;
                this.state.isPaused = state.isPaused !== undefined ? state.isPaused : false;
                this.state.status = state.status || (this.state.isActive ? 'ACTIVE' : 'IDLE');

                if (this.state.telegramToken && this.state.telegramChatId) {
                    telegramService.setCredentials(this.state.telegramToken, this.state.telegramChatId);
                }
            }

            // Always load positions from database to ensure sync
            const positions = await db.getPositions();
            this.state.selectedStrikes = positions;
            //console.log(`[Strategy] Resumed state: ${this.state.selectedStrikes.length} legs, PnL: ${this.state.pnl}`);

            if (this.state.isActive && positions.length > 0) {
                this.startMonitoring();
            }

            this.initScheduler();
        } catch (err) {
            console.error('[Strategy] Failed to resume strategy:', err);
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

    // Helper: Check if dateStr matches today
    private isToday(dateStr: string): boolean {
        const today = new Date();
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

        // Daily check at 9 AM to re-evaluate if today is expiry day
        this.schedulers.push(cron.schedule('0 9 * * *', async () => {
            //console.log('[Strategy] Daily 9 AM check - Re-initializing scheduler');
            await this.initScheduler();
        }));

        // Check if today is expiry day
        const isExpiry = await this.isExpiryDay();

        if (isExpiry) {
            // Update status if starting the day
            if (this.state.status === 'IDLE' || this.state.status === 'ACTIVE') {
                this.state.status = 'WAITING_FOR_EXPIRY';
                await this.syncToDb();
            }

            //console.log('[Strategy] Today is EXPIRY DAY - Scheduling exit and entry');
            this.addLog(`🔔 EXPIRY DAY DETECTED - Status: ${this.state.status}`);
            telegramService.sendMessage('🔔 <b>Expiry Day Detected</b>\nAutomated rollover sequence will execute:\n• 12:45 PM - Exit positions\n• 12:59:30 PM - Select new strikes\n• 1:00 PM - Place orders');

            // 12:45 PM - Exit positions if any exist
            this.schedulers.push(cron.schedule('45 12 * * *', async () => {
                if (this.state.selectedStrikes.length > 0) {
                    this.addLog('⏰ Expiry Day: Exiting all positions at 12:45 PM');
                    await this.exitAllPositions('Expiry Day Exit');
                    this.state.status = 'EXIT_DONE';
                    await this.syncToDb();
                    telegramService.sendMessage('📤 <b>Expiry Day Exit</b>\nExiting all positions at 12:45 PM');
                } else {
                    this.addLog('ℹ️ Expiry Day: No positions to exit at 12:45 PM');
                    this.state.status = 'EXIT_DONE';
                    await this.syncToDb();
                }
            }));

            // 12:59:30 PM - Select strikes for next week (30-second delay)
            this.schedulers.push(cron.schedule('59 12 * * *', async () => {
                if (this.state.status === 'ENTRY_DONE' || this.state.status === 'ACTIVE') return;

                this.addLog('⏳ Waiting 30 seconds before strike selection...');
                await new Promise(r => setTimeout(r, 30000)); // 30-second delay
                this.addLog('🎯 Expiry Day: Selecting strikes for NEXT WEEK at 12:59:30 PM');
                await this.selectStrikes(); // Will auto-select 2nd expiry
                telegramService.sendMessage('✅ <b>Strikes Selected</b>\nNew positions ready for next week');
            }));

            // 1:00 PM - Place orders
            this.schedulers.push(cron.schedule('0 13 * * *', async () => {
                this.addLog('🚀 Expiry Day: Attempting to place orders at 1:00 PM');
                if (this.state.status === 'ENTRY_DONE' || this.state.status === 'ACTIVE') {
                    this.addLog('⚠️ ENTRY SKIPPED: Trade already executed today.');
                    return;
                }
                const result = await this.placeOrder();
                if (result) {
                    this.state.status = 'ENTRY_DONE';
                    await this.syncToDb();
                }
            }));
        } else {
            //console.log('[Strategy] Not expiry day - No actions scheduled');
            this.addLog('ℹ️ Not expiry day - Positions will be held');
        }
    }

    async updateSettings(settings: {
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

    getState() {
        return this.state;
    }

    async getAvailableExpiries() {
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

    async selectStrikes(expiryDate?: string) {
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
                        quotes.push({ ...item, lp: parseFloat(q.lp) });
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
            quantity: 50,
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

    async placeOrder() {
        if (!shoonya.isLoggedIn()) {
            throw new Error('Shoonya session expired or not logged in. Please login again.');
        }

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

        try {
            const longs = this.state.selectedStrikes.filter(s => s.side === 'BUY');
            const shorts = this.state.selectedStrikes.filter(s => s.side === 'SELL');

            for (const leg of longs) await this.executeLeg(leg);
            for (const leg of shorts) await this.executeLeg(leg);

            this.state.isTradePlaced = true;
            this.state.isActive = true;
            this.state.status = 'ACTIVE';    // Transition to ACTIVE
            this.startMonitoring();
            await this.syncToDb(true);

            telegramService.sendMessage(`🚀 <b>Trade Placed</b>\nAll 8 legs executed virtually for Iron Condor.`);

            return { status: 'success' };
        } catch (err) {
            console.error('Failure during sequence placement:', err);
            throw err;
        }
    }


    private async executeLeg(leg: LegState) {
        if (this.state.isVirtual) {
            // Virtual execution
            await new Promise(r => setTimeout(r, 100));
            await db.logOrder({ ...leg, price: leg.entryPrice, status: 'COMPLETE', isVirtual: true });
            this.addLog(`[VIRTUAL] ${leg.side} ${leg.symbol} @ ₹${leg.entryPrice}`);
        } else {
            // Real order execution
            try {
                const orderParams = {
                    exchange: 'NFO',
                    tradingsymbol: leg.symbol,
                    quantity: leg.quantity.toString(),
                    price: '0', // Market order
                    product: 'M', // NRML for options
                    trantype: leg.side === 'BUY' ? 'B' : 'S',
                    pricetype: 'MKT',
                    retention: 'DAY'
                };

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

        //console.log(`[Feed] Tick received: ${token} -> ${ltp}`);

        const legIdx = this.state.selectedStrikes.findIndex(s => s.token === token);
        if (legIdx !== -1) {
            this.state.selectedStrikes[legIdx].ltp = ltp;
            if (this.state.isTradePlaced) {
                this.calculatePnL();
                this.checkAdjustments(this.state.selectedStrikes[legIdx]);
                this.checkExits();
            }
            const emitData = {
                token, ltp,
                symbol: this.state.selectedStrikes[legIdx].symbol,
                pnl: this.state.pnl,
                peakProfit: this.state.peakProfit,
                peakLoss: this.state.peakLoss
            };
            //console.log(`[Socket] Emitting price_update: ${token} -> ${ltp} (PnL: ${this.state.pnl}, PeakProfit: ${this.state.peakProfit})`);
            socketService.emit('price_update', emitData);
        }
        await this.syncToDb();
    }

    private checkAdjustments(leg: LegState) {
        if (this.state.isPaused) return;

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
                    quantity: 50
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
            await db.updateState({
                status: this.state.status,
                isActive: this.state.isActive,
                isVirtual: this.state.isVirtual, // Include to prevent overwriting
                isTradePlaced: this.state.isTradePlaced,
                pnl: this.state.pnl,
                peakProfit: this.state.peakProfit,
                peakLoss: this.state.peakLoss
            });

            this.lastPnlUpdateTime = now;
        }
    }

    private handleOrderReport(report: any) { }

    async exitAllPositions(reason: string) {
        console.log(`Exiting all positions: ${reason}`);
        this.state.isActive = false;
        this.state.isTradePlaced = false;

        // Set status based on reason
        if (reason.includes('Profit') || reason.includes('Loss')) {
            this.state.status = 'FORCE_EXITED';
        } else {
            this.state.status = 'IDLE';
        }

        const tokens = this.state.selectedStrikes.map(s => `NFO|${s.token}`);
        shoonya.unsubscribe(tokens);
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
