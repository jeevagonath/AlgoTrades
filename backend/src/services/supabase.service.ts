import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://anuhnacfmzyjqmoxmubg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_UHsUNkJQRw5cwn7H9EeKxg_hRc0GCG_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export const db = {
    async updateState(state: any) {
        // Build payload dynamically to avoid sending undefined fields
        const payload: any = { id: 1, updated_at: new Date().toISOString() };

        if (state.status !== undefined) payload.status = state.status;
        if (state.isActive !== undefined) payload.is_active = state.isActive;
        if (state.isVirtual !== undefined) payload.is_virtual = state.isVirtual;
        if (state.isTradePlaced !== undefined) payload.is_trade_placed = state.isTradePlaced;
        if (state.pnl !== undefined) payload.pnl = state.pnl;
        if (state.peakProfit !== undefined) payload.peak_profit = state.peakProfit;
        if (state.peakLoss !== undefined) payload.peak_loss = state.peakLoss;
        if (state.entryTime !== undefined) payload.entry_time = state.entryTime;
        if (state.exitTime !== undefined) payload.exit_time = state.exitTime;
        if (state.targetPnl !== undefined) payload.target_pnl = state.targetPnl;
        if (state.stopLossPnl !== undefined) payload.stop_loss_pnl = state.stopLossPnl;
        if (state.telegramToken !== undefined) payload.telegram_token = state.telegramToken;
        if (state.telegramChatId !== undefined) payload.telegram_chat_id = state.telegramChatId;
        if (state.nextAction !== undefined) payload.next_action = state.nextAction;
        if (state.engineActivity !== undefined) payload.engine_activity = state.engineActivity;
        if (state.reEntryCutoffTime !== undefined) payload.re_entry_cutoff_time = state.reEntryCutoffTime;
        // Fix: Persist re_entry state object
        if (state.reEntry !== undefined) payload.re_entry = state.reEntry;

        //console.log('[DB] Updating state with payload:', JSON.stringify(payload, null, 2));

        const { data, error } = await supabase
            .from('strategy_state')
            .upsert(payload);

        if (error) {
            console.error('Supabase State Update Error:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
        } else {
            //console.log('[DB] State updated successfully');
            // Emit real-time state update
            import('./socket.service').then(({ socketService }) => {
                socketService.emit('state_updated', {
                    status: state.status,
                    engineActivity: state.engineActivity,
                    nextAction: state.nextAction,
                    isPaused: state.isPaused,
                    isActive: state.isActive
                });
            }).catch(() => { });
        }
        return { data, error };
    },

    async syncPositions(legs: any[]) {
        // Fetch existing positions to preserve created_at timestamps
        const { data: existingPositions } = await supabase
            .from('positions')
            .select('instrument_token, created_at');

        const existingMap = new Map(
            (existingPositions || []).map((p: any) => [p.instrument_token, p.created_at])
        );

        // Clear old positions and insert new ones
        await supabase.from('positions').delete().neq('id', 0);
        if (legs.length > 0) {
            const { data, error } = await supabase
                .from('positions')
                .insert(legs.map(l => {
                    const existingCreatedAt = existingMap.get(l.token);
                    return {
                        instrument_token: l.token,
                        symbol: l.symbol,
                        type: l.type,
                        side: l.side,
                        strike: l.strike,
                        entry_price: l.entryPrice,
                        ltp: l.ltp,
                        quantity: l.quantity,
                        tier: l.tier,
                        is_adjusted: l.isAdjusted || false,
                        // Preserve original created_at if position existed before
                        ...(existingCreatedAt && { created_at: existingCreatedAt })
                    };
                }));

            if (error) {
                console.error('Supabase Positions Sync Error:', error);
            } else {
                // Emit real-time positions update
                import('./socket.service').then(({ socketService }) => {
                    socketService.emit('positions_updated', legs);
                }).catch(() => { });
            }

            return { data, error };
        }
    },

    async logOrder(order: any) {
        const { data, error } = await supabase
            .from('order_book')
            .insert({
                instrument_token: order.token,
                symbol: order.symbol,
                side: order.side,
                price: order.price,
                quantity: order.quantity,
                status: order.status,
                order_type: order.isVirtual ? 'VIRTUAL' : 'REAL'
            })
            .select()
            .single();

        if (error) {
            console.error('Supabase Order Log Error:', error);
        } else if (data) {
            // Emit real-time order update
            import('./socket.service').then(({ socketService }) => {
                socketService.emit('new_order', data);
            }).catch(() => { });
        }

        return { data, error };
    },

    async getOrders() {
        const { data, error } = await supabase
            .from('order_book')
            .select('*')
            .order('created_at', { ascending: false }) // Newest first
            .limit(100);
        if (error) console.error('Supabase Orders Load Error:', error);
        return (data || []).map(o => ({
            ...o,
            token: o.instrument_token
        }));
    },

    async addLog(msg: string) {
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const { error } = await supabase
            .from('system_logs')
            .insert({ msg, time, created_at: new Date().toISOString() });
        if (error) console.error('Supabase Log Error:', error);
    },

    async getLogs() {
        const { data, error } = await supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(75);
        if (error) console.error('Supabase Logs Load Error:', error);
        return data || [];
    },

    async saveSession(session: any) {
        const { data, error } = await supabase
            .from('broker_session')
            .upsert({
                id: 1, // Store as a single session for now
                uid: session.uid,
                susertoken: session.susertoken,
                actid: session.actid,
                updated_at: new Date().toISOString()
            });
        if (error) console.error('Supabase Session Save Error:', error);
        return { data, error };
    },

    async clearSession() {
        const { data, error } = await supabase
            .from('broker_session')
            .update({
                susertoken: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);
        if (error) console.error('Supabase Session Clear Error:', error);
        return { data, error };
    },

    async getSession() {
        const { data, error } = await supabase
            .from('broker_session')
            .select('*')
            .eq('id', 1)
            .single();
        if (error && error.code !== 'PGRST116') console.error('Supabase Session Load Error:', error);
        return { data, error };
    },

    async getState() {
        const { data, error } = await supabase
            .from('strategy_state')
            .select('*')
            .eq('id', 1)
            .single();
        if (error && error.code !== 'PGRST116') console.error('Supabase State Load Error:', error);
        if (data) {
            return {
                status: data.status,
                isActive: data.is_active,
                isVirtual: data.is_virtual,
                isTradePlaced: data.is_trade_placed,
                pnl: data.pnl,
                peakProfit: data.peak_profit,
                peakLoss: data.peak_loss,
                availableMargin: data.available_margin,
                requiredMargin: data.required_margin,
                entryTime: data.entry_time,
                exitTime: data.exit_time,
                targetPnl: data.target_pnl,
                stopLossPnl: data.stop_loss_pnl,
                telegramToken: data.telegram_token,
                telegramChatId: data.telegram_chat_id,
                nextAction: data.next_action || '',
                engineActivity: data.engine_activity || '',
                reEntryCutoffTime: data.re_entry_cutoff_time || '13:45',
                reEntry: data.re_entry // Restore reEntry state
            };
        }
        return null;
    },

    async getPositions() {
        const { data, error } = await supabase
            .from('positions')
            .select('*');
        if (error) console.error('Supabase Positions Load Error:', error);
        return (data || []).map(p => ({
            token: p.instrument_token,
            symbol: p.symbol,
            type: p.type,
            side: p.side,
            strike: p.strike,
            entryPrice: p.entry_price || 0,
            ltp: p.ltp || 0,
            quantity: p.quantity || 0,
            tier: p.tier,
            isAdjusted: p.is_adjusted
        }));
    },

    async saveTradeHistory(state: any, legs: any[]) {
        try {
            // 1. Insert into trade_history
            const { data: historyData, error: historyError } = await supabase
                .from('trade_history')
                .insert({
                    is_virtual: state.isVirtual,
                    pnl: state.pnl,
                    peak_profit: state.peakProfit,
                    peak_loss: state.peakLoss,
                    status: state.status,
                    reason: state.exitReason || 'Manual Exit',
                    entry_time: state.entryTime,
                    exit_time: new Date().toISOString()
                })
                .select()
                .single();

            if (historyError) {
                console.error('Supabase Trade History Save Error:', historyError);
                return { success: false, error: historyError };
            }

            // 2. Insert legs into position_history_log
            if (legs.length > 0 && historyData) {
                const { error: legsError } = await supabase
                    .from('position_history_log')
                    .insert(legs.map(l => ({
                        history_id: historyData.id,
                        instrument_token: l.token,
                        symbol: l.symbol,
                        type: l.type,
                        side: l.side,
                        strike: l.strike,
                        entry_price: l.entryPrice,
                        exit_price: l.ltp, // LTP at time of exit
                        quantity: l.quantity,
                        tier: l.tier
                    })));

                if (legsError) {
                    console.error('Supabase Position History Save Error:', legsError);
                }
            }

            return { success: true };
        } catch (err) {
            console.error('Failed to save trade history:', err);
            return { success: false, error: err };
        }
    },



    async saveAlert(alert: {
        type: string,
        severity: string,
        title: string,
        message: string,
        icon?: string
    }) {
        try {
            const { error } = await supabase
                .from('alerts')
                .insert({
                    type: alert.type,
                    severity: alert.severity,
                    title: alert.title,
                    message: alert.message,
                    icon: alert.icon || ''
                });

            if (error) {
                console.error('Supabase Alert Save Error:', error);
                return { success: false, error };
            }

            return { success: true };
        } catch (err) {
            console.error('Failed to save alert:', err);
            return { success: false, error: err };
        }
    },

    async getAlerts(limit: number = 50) {
        try {
            const { data, error } = await supabase
                .from('alerts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Supabase Alerts Load Error:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Failed to load alerts:', err);
            return [];
        }
    },

    async getManualExpiries() {
        try {
            const { data, error } = await supabase
                .from('manual_expiry_settings')
                .select('expiry_date')
                .eq('is_active', true);

            if (error) {
                console.error('Supabase Manual Expiry Load Error:', error);
                return [];
            }

            const months: { [key: string]: number } = {
                'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
            };

            const parseDate = (d: string) => {
                const p = d.split('-');
                if (p.length < 3) return new Date(d).getTime(); // Fallback
                return new Date(parseInt(p[2]), months[p[1].toUpperCase()], parseInt(p[0])).getTime();
            };

            return data
                .map(d => d.expiry_date)
                .sort((a, b) => parseDate(a) - parseDate(b));
        } catch (err) {
            console.error('Failed to load manual expiries:', err);
            return [];
        }
    },

    async setManualExpiries(dates: string[]) {
        try {
            // First, deactivate all existing
            await supabase
                .from('manual_expiry_settings')
                .update({ is_active: false })
                .neq('id', 0); // Update all

            // Then insert new ones (or update if existing)
            // We'll just insert new active rows for simplicity since it's a small table
            // Or ideally use upsert. Let's try upserting logic or simple insert.
            // Simplified: Delete all active entries? No, keep history.
            // Just insert the new batch as active.

            // Cleanest approach for this specific requirement:
            // 1. Mark all as inactive
            // 2. Insert new dates as active

            const payload = dates.map(date => ({
                expiry_date: date,
                is_active: true,
                created_at: new Date().toISOString()
            }));

            const { error } = await supabase
                .from('manual_expiry_settings')
                .insert(payload);

            if (error) {
                console.error('Supabase Manual Expiry Update Error:', error);
                return false;
            }

            // Emit update?
            return true;
        } catch (err) {
            console.error('Failed to set manual expiries:', err);
            return false;
        }
    },

    // Analytics Methods
    async getTradeHistory(filters: {
        startDate?: string;
        endDate?: string;
        isVirtual?: boolean;
    }) {
        try {
            let query = supabase
                .from('trade_history')
                .select(`
                    *,
                    position_history_log (*)
                `)
                .order('exit_time', { ascending: false });

            if (filters.startDate) {
                query = query.gte('exit_time', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('exit_time', filters.endDate);
            }
            if (filters.isVirtual !== undefined) {
                query = query.eq('is_virtual', filters.isVirtual);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Supabase Trade History Load Error:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Failed to load trade history:', err);
            return [];
        }
    },

    async getDailyPnL(filters: {
        startDate?: string;
        endDate?: string;
        isVirtual?: boolean;
    }) {
        try {
            let query = supabase
                .from('trade_history')
                .select('id, exit_time, pnl, is_virtual');

            if (filters.startDate) {
                query = query.gte('exit_time', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('exit_time', filters.endDate);
            }
            if (filters.isVirtual !== undefined) {
                query = query.eq('is_virtual', filters.isVirtual);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Supabase Daily PnL Load Error:', error);
                return [];
            }

            // Aggregate by date
            const dailyMap = new Map<string, { pnl: number; tradeCount: number; tradeIds: string[] }>();

            (data || []).forEach((trade: any) => {
                // Convert UTC timestamp to local date
                const exitDate = new Date(trade.exit_time);
                const year = exitDate.getFullYear();
                const month = String(exitDate.getMonth() + 1).padStart(2, '0');
                const day = String(exitDate.getDate()).padStart(2, '0');
                const date = `${year}-${month}-${day}`;

                const existing = dailyMap.get(date) || { pnl: 0, tradeCount: 0, tradeIds: [] };
                dailyMap.set(date, {
                    pnl: existing.pnl + (trade.pnl || 0),
                    tradeCount: existing.tradeCount + 1,
                    tradeIds: [...existing.tradeIds, trade.id]
                });
            });

            // Convert to array
            return Array.from(dailyMap.entries()).map(([date, stats]) => ({
                date,
                pnl: stats.pnl,
                tradeCount: stats.tradeCount,
                tradeIds: stats.tradeIds
            })).sort((a, b) => a.date.localeCompare(b.date));
        } catch (err) {
            console.error('Failed to load daily PnL:', err);
            return [];
        }
    },

    async getPositionsByTradeId(tradeId: string) {
        try {
            console.log('🔍 getPositionsByTradeId called with tradeId:', tradeId);

            // Query position_history_log directly using tradeId as history_id
            const { data: positions, error: positionsError } = await supabase
                .from('position_history_log')
                .select('*')
                .eq('history_id', tradeId);

            console.log('📊 Positions query result:', positions);
            console.log('📊 Positions count:', positions?.length || 0);

            if (positionsError) {
                console.error('❌ Error fetching positions:', positionsError);
                return [];
            }

            return positions || [];
        } catch (err) {
            console.error('Failed to fetch positions by trade ID:', err);
            return [];
        }
    },

    async getPnLSummary(filters: {
        startDate?: string;
        endDate?: string;
        isVirtual?: boolean;
    }) {
        try {
            let query = supabase
                .from('trade_history')
                .select('pnl, peak_profit, peak_loss, exit_time');

            if (filters.startDate) {
                query = query.gte('exit_time', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('exit_time', filters.endDate);
            }
            if (filters.isVirtual !== undefined) {
                query = query.eq('is_virtual', filters.isVirtual);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Supabase PnL Summary Load Error:', error);
                return {
                    totalRealizedPnL: 0,
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    winRate: 0,
                    maxProfitDay: 0,
                    maxLossDay: 0,
                    avgProfit: 0,
                    avgLoss: 0
                };
            }

            const trades = data || [];
            const totalRealizedPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
            const losingTrades = trades.filter(t => (t.pnl || 0) < 0).length;
            const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

            const profits = trades.filter(t => (t.pnl || 0) > 0).map(t => t.pnl || 0);
            const losses = trades.filter(t => (t.pnl || 0) < 0).map(t => t.pnl || 0);

            const maxProfitDay = profits.length > 0 ? Math.max(...profits) : 0;
            const maxLossDay = losses.length > 0 ? Math.min(...losses) : 0;
            const avgProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
            const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

            return {
                totalRealizedPnL,
                totalTrades: trades.length,
                winningTrades,
                losingTrades,
                winRate,
                maxProfitDay,
                maxLossDay,
                avgProfit,
                avgLoss
            };
        } catch (err) {
            console.error('Failed to load PnL summary:', err);
            return {
                totalRealizedPnL: 0,
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                maxProfitDay: 0,
                maxLossDay: 0,
                avgProfit: 0,
                avgLoss: 0
            };
        }
    },

    async cleanupOldLogs() {
        try {
            // Calculate cutoff date (30 days ago)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const cutoffISO = cutoffDate.toISOString();

            console.log(`[DB Cleanup] Deleting system_logs older than ${cutoffDate.toLocaleDateString()}...`);

            const { data, error, count } = await supabase
                .from('system_logs')
                .delete({ count: 'exact' })
                .lt('created_at', cutoffISO);

            if (error) {
                console.error('Supabase System Logs Cleanup Error:', error);
                return { success: false, error, deletedCount: 0 };
            }

            const deletedCount = count || 0;
            console.log(`[DB Cleanup] ✅ Deleted ${deletedCount} old system_logs records`);
            return { success: true, deletedCount };
        } catch (err) {
            console.error('Failed to cleanup old system logs:', err);
            return { success: false, error: err, deletedCount: 0 };
        }
    },

    async cleanupOldAlerts() {
        try {
            // Calculate cutoff date (30 days ago)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const cutoffISO = cutoffDate.toISOString();

            console.log(`[DB Cleanup] Deleting alerts older than ${cutoffDate.toLocaleDateString()}...`);

            const { data, error, count } = await supabase
                .from('alerts')
                .delete({ count: 'exact' })
                .lt('created_at', cutoffISO);

            if (error) {
                console.error('Supabase Alerts Cleanup Error:', error);
                return { success: false, error, deletedCount: 0 };
            }

            const deletedCount = count || 0;
            console.log(`[DB Cleanup] ✅ Deleted ${deletedCount} old alerts records`);
            return { success: true, deletedCount };
        } catch (err) {
            console.error('Failed to cleanup old alerts:', err);
            return { success: false, error: err, deletedCount: 0 };
        }
    }
};
