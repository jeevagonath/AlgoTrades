import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://anuhnacfmzyjqmoxmubg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UHsUNkJQRw5cwn7H9EeKxg_hRc0GCG_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

        //console.log('[DB] Updating state with payload:', JSON.stringify(payload, null, 2));

        const { data, error } = await supabase
            .from('strategy_state')
            .upsert(payload);

        if (error) {
            console.error('Supabase State Update Error:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
        } else {
            //console.log('[DB] State updated successfully');
        }
        return { data, error };
    },

    async syncPositions(legs: any[]) {
        // Clear old positions and insert new ones
        await supabase.from('positions').delete().neq('id', 0);
        if (legs.length > 0) {
            const { data, error } = await supabase
                .from('positions')
                .insert(legs.map(l => ({
                    token: l.token,
                    symbol: l.symbol,
                    type: l.type,
                    side: l.side,
                    strike: l.strike,
                    entry_price: l.entryPrice,
                    ltp: l.ltp,
                    quantity: l.quantity,
                    tier: l.tier
                })));
            if (error) console.error('Supabase Positions Sync Error:', error);
            return { data, error };
        }
    },

    async logOrder(order: any) {
        const { data, error } = await supabase
            .from('order_book')
            .insert({
                token: order.token,
                symbol: order.symbol,
                side: order.side,
                price: order.price,
                quantity: order.quantity,
                status: order.status,
                order_type: order.isVirtual ? 'VIRTUAL' : 'REAL'
            });
        if (error) console.error('Supabase Order Log Error:', error);
        return { data, error };
    },

    async getOrders() {
        const { data, error } = await supabase
            .from('order_book')
            .select('*')
            .order('created_at', { ascending: false }) // Newest first
            .limit(100);
        if (error) console.error('Supabase Orders Load Error:', error);
        return data || [];
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
                isActive: data.is_active,
                isVirtual: data.is_virtual,
                isTradePlaced: data.is_trade_placed,
                pnl: data.pnl,
                peakProfit: data.peak_profit,
                peakLoss: data.peak_loss,
                entryTime: data.entry_time,
                exitTime: data.exit_time,
                targetPnl: data.target_pnl,
                stopLossPnl: data.stop_loss_pnl,
                telegramToken: data.telegram_token,
                telegramChatId: data.telegram_chat_id,
                nextAction: data.next_action || '',
                engineActivity: data.engine_activity || ''
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
            token: p.token,
            symbol: p.symbol,
            type: p.type,
            side: p.side,
            strike: p.strike,
            entryPrice: p.entry_price,
            ltp: p.ltp,
            quantity: p.quantity,
            tier: p.tier
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
                        token: l.token,
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

    async saveManualExpiries(expiries: string[]) {
        try {
            // Save to manual_expiry_settings table
            const { error } = await supabase
                .from('manual_expiry_settings')
                .upsert({
                    id: 1,
                    expiry_json: JSON.stringify(expiries),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Supabase Manual Expiry Save Error:', error);
                return { success: false, error };
            }

            //console.log(`[DB] Saved ${expiries.length} manual expiry dates`);
            return { success: true };
        } catch (err) {
            console.error('Failed to save manual expiries:', err);
            return { success: false, error: err };
        }
    },

    async getManualExpiries(): Promise<string[]> {
        try {
            const { data, error } = await supabase
                .from('manual_expiry_settings')
                .select('expiry_json')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Supabase Manual Expiry Load Error:', error);
                return [];
            }

            if (data && data.expiry_json) {
                const expiries = JSON.parse(data.expiry_json);
                //console.log(`[DB] Loaded ${expiries.length} manual expiry dates`);
                return expiries;
            }

            return [];
        } catch (err) {
            console.error('Failed to load manual expiries:', err);
            return [];
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
    }
};
