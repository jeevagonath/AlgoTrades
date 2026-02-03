import { socketService } from './socket.service';

const Api = require('../lib/RestApi');
import { db } from './supabase.service';

class ShoonyaService {
    private api: any;
    private session: any;
    private tickListeners: ((tick: any) => void)[] = [];
    private orderListeners: ((order: any) => void)[] = [];
    private wsStarted: boolean = false;
    private isSocketConnected: boolean = false;
    private pendingSubscriptions: string[] = [];

    constructor() {
        this.api = new Api({});
        this.resumeSession();
    }

    private async resumeSession() {
        try {
            //console.log('[Shoonya] Attempting to resume session from database...');
            const { data, error } = await db.getSession();
            if (data && data.susertoken) {
                // Check if the session is from today
                const sessionDate = new Date(data.updated_at).toDateString();
                const today = new Date().toDateString();

                if (sessionDate === today) {
                    //console.log('[Shoonya] Resuming session for UID:', data.uid);
                    this.api.setSessionDetails(data);
                    this.session = data;
                } else {
                    //console.log('[Shoonya] Stale session found (Date:', sessionDate, '). Ignoring.');
                }
            } else {
                //console.log('[Shoonya] No active session found in database.');
            }
        } catch (err) {
            console.error('[Shoonya] Failed to resume session:', err);
        }
    }

    async getAuthToken() {
        return this.api.__susertoken;
    }

    async login(credentials: any) {
        return new Promise((resolve, reject) => {
            this.api.login(credentials)
                .then(async (res: any) => {
                    if (res.stat === 'Ok') {
                        this.session = res;
                        // Save session to database for persistence
                        await db.saveSession({
                            uid: credentials.userid,
                            susertoken: res.susertoken,
                            actid: res.actid
                        });
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async logout() {
        try {
            // Shoonya API might have a logout, but if it's just local session clearing:
            if (this.api.logout) {
                await this.api.logout();
            }
            this.session = null;
            this.api.setSessionDetails({});
            await db.clearSession();
            //console.log('[Shoonya] Logged out successfully and session cleared from DB.');
        } catch (err) {
            //console.error('[Shoonya] Logout failed:', err);
            throw err;
        }
    }

    async searchScrip(exchange: string, searchtext: string) {
        return new Promise((resolve, reject) => {
            this.api.searchscrip(exchange, searchtext)
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res.values);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async getOptionChain(exchange: string, tradingsymbol: string, strikeprice: number, count: number = 50) {
        return new Promise((resolve, reject) => {
            this.api.get_option_chain(exchange, tradingsymbol, strikeprice, count)
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res.values);
                    } else {
                        resolve(res.values || []); // Res stat might be ok but values empty
                    }
                })
                .catch(reject);
        });
    }

    async getQuotes(exchange: string, token: string) {
        //console.log(`[GetQuotes] REQUEST: exchange=${exchange}, token=${token}`);
        if (!this.session || !this.session.uid) {
            console.warn('[Shoonya] getQuotes skipped: session or uid missing');
            return Promise.resolve({ stat: 'Not_Ok', emsg: 'Session Missing' });
        }
        return new Promise((resolve, reject) => {
            this.api.get_quotes(exchange, token)
                .then((res: any) => {
                    //console.log(`[GetQuotes] RESPONSE for token ${token}:`, JSON.stringify(res, null, 2));
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        console.error(`[GetQuotes] ERROR for token ${token}:`, res);
                        reject(res);
                    }
                })
                .catch((err: any) => {
                    console.error(`[GetQuotes] EXCEPTION for token ${token}:`, err);
                    reject(err);
                });
        });
    }

    async getSecurityInfo(exchange: string, token: string) {
        return new Promise((resolve, reject) => {
            this.api.get_security_info(exchange, token)
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    startWebSocket(onTick?: (tick: any) => void, onOrder?: (order: any) => void) {
        if (onTick) this.tickListeners.push(onTick);
        if (onOrder) this.orderListeners.push(onOrder);

        if (this.wsStarted) return;

        if (!this.isLoggedIn()) {
            console.warn('[Shoonya] Cannot start WebSocket: Not logged in.');
            return;
        }

        this.wsStarted = true;
        this.api.start_websocket({
            socket_open: () => {
                //console.log('[Shoonya] WebSocket Connected');
                this.isSocketConnected = true;

                // Auto subscribe to Nifty spot
                if (this.api.web_socket) {
                    //console.log('[Shoonya] Subscribing to Nifty Spot (NSE|26000)');
                    this.api.subscribe(['NSE|26000']);
                }

                // Flush pending subscriptions
                if (this.pendingSubscriptions.length > 0) {
                    console.log(`[Shoonya] Flushing ${this.pendingSubscriptions.length} pending subscriptions...`);
                    this.api.subscribe(this.pendingSubscriptions);
                    this.pendingSubscriptions = [];
                }
            },
            quote: (tick: any) => {
                // Log only important ticks to avoid flooding
                if (tick.tk === '26000') {
                    // console.log('[Shoonya] Nifty Spot Tick:', tick.lp);
                }

                this.tickListeners.forEach(cb => cb(tick));
                // Also emit globally for UI convenience
                socketService.emit('tick', tick);
            },
            order: (order: any) => {
                //console.log('[Shoonya] Order Update:', order);
                this.orderListeners.forEach(cb => cb(order));
            }
        });
    }

    subscribe(tokens: string[]) {
        if (!this.wsStarted) {
            //console.log('[Shoonya] Subscribe called but WS not started. Initializing...');
            this.startWebSocket();
        }

        if (this.isSocketConnected && this.api && this.api.web_socket) {
            try {
                //console.log('[Shoonya] Subscribing to tokens:', tokens);
                this.api.subscribe(tokens);
            } catch (e) {
                console.error('[Shoonya] Subscription error:', e);
            }
        } else {
            console.log(`[Shoonya] Socket not ready. Queueing ${tokens.length} tokens for subscription.`);
            this.pendingSubscriptions.push(...tokens);
        }
    }

    unsubscribe(tokens: string[]) {
        this.api.unsubscribe(tokens);
    }

    isLoggedIn() {
        return !!this.session && !!this.session.susertoken;
    }

    async placeOrder(orderParams: any) {
        return new Promise((resolve, reject) => {
            // Use the correct wrapper method 'place_order' (snake_case) defined in RestApi.js
            if (this.api.place_order) {
                try {
                    const res = this.api.place_order(orderParams);
                    // RestApi wrapper returns a promise directly in some versions, or we handle the result
                    Promise.resolve(res).then(resolve).catch(reject);
                } catch (e) {
                    reject(e);
                }
            } else {
                reject(new Error('API place_order method not found'));
            }
        });
    }

    getSessionDetails() {
        return this.session;
    }

    async getOrderBook() {
        return new Promise((resolve, reject) => {
            // Corrected method name: get_orderbook (no underscore between order and book)
            if (!this.api.get_orderbook) {
                console.error('[Shoonya] get_orderbook method missing in API wrapper');
                resolve([]);
                return;
            }
            this.api.get_orderbook()
                .then((res: any) => {
                    resolve(res || []);
                })
                .catch((err: any) => {
                    console.error('[Shoonya] Order book fetch failed:', err);
                    resolve([]);
                });
        });
    }

    // Add more methods as needed...
    async getLimits() {
        return new Promise((resolve, reject) => {
            if (!this.api.get_limits) {
                // If API wrapper doesn't have it (it should), return empty or reject
                reject('API get_limits not defined');
                return;
            }
            this.api.get_limits()
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async getBasketMargin(params: any) {
        return new Promise((resolve, reject) => {
            //console.log('[Shoonya] getBasketMargin Request:', JSON.stringify(params, null, 2));

            if (!this.api.basket_margin) {
                reject('API basket_margin not defined');
                return;
            }

            this.api.basket_margin(params)
                .then((res: any) => {
                    //console.log('[Shoonya] getBasketMargin Response:', JSON.stringify(res, null, 2));
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch((err: any) => {
                    console.error('[Shoonya] getBasketMargin Error:', err);
                    reject(err);
                });
        });
    }

    async getUserDetails() {
        return new Promise((resolve, reject) => {
            if (!this.api.get_user_details) {
                reject('API get_user_details not defined');
                return;
            }
            this.api.get_user_details()
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async getClientDetails() {
        return new Promise((resolve, reject) => {
            if (!this.api.get_client_details) {
                reject('API get_client_details not defined');
                return;
            }
            this.api.get_client_details()
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async getIndexList(exchange: string) {
        return new Promise((resolve, reject) => {
            if (!this.api.get_index_list) {
                reject('API get_index_list not defined');
                return;
            }

            if (!this.isLoggedIn()) {
                reject('Not/Shoonya Session Invalid');
                return;
            }

            this.api.get_index_list(exchange)
                .then((res: any) => {
                    if (res.stat === 'Ok') {
                        // Log the response as requested
                        console.log(`[Shoonya] Index List for ${exchange}:`, JSON.stringify(res.values, null, 2));
                        resolve(res.values);
                    } else {
                        console.error(`[Shoonya] Failed to get index list for ${exchange}:`, res);
                        reject(new Error(res.emsg || 'Unknown Shoonya API Error'));
                    }
                })
                .catch(reject);
        });
    }
}

export const shoonya = new ShoonyaService();
