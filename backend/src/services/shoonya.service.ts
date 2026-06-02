import { socketService } from './socket.service';

const Api = require('../lib/RestApi');
import { db } from './supabase.service';

class ShoonyaService {
    private api: any;
    private session: any;
    private tickListeners: ((tick: any) => void)[] = [];
    private orderListeners: ((order: any) => void)[] = [];
    private wsStarted: boolean = false;
    private wsConnecting: boolean = false;
    private isSocketConnected: boolean = false;
    private pendingSubscriptions: string[] = [];
    private dailyStopTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.api = new Api({});
        this.resumeSession();
        this.setupDaily4pmStop();
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
                    //console.log('[Shoonya] login response:', JSON.stringify(res, null, 2));
                    if (res.stat === 'Ok') {
                        this.session = res;
                        // Save session to database for persistence
                        await db.saveSession({
                            uid: credentials.userid,
                            susertoken: res.susertoken,
                            actid: res.actid
                        });
                        console.log('[Shoonya] login token used:', {
                            susertoken: res.susertoken,
                            access_token: res.access_token,
                            usedToken: res.susertoken || res.access_token || null
                        });
                        try {
                            await this.startWebSocket();
                        } catch (e) {
                            // startWebSocket now resolves when not logged in and only rejects on real WS errors
                            console.warn('[Shoonya] startWebSocket after login failed:', e);
                        }
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    /**
     * New GenAcsTok OAuth flow — exchanges the browser-login code for an access token.
     * @param code      Code from Shoonya browser redirect URL
     * @param appKey    Client Id from Shoonya API Key page
     * @param secretKey Secret Code from Shoonya API Key page
     */
    async loginWithCode(code: string, appKey: string, secretKey: string) {
        const normalizedAppKey = appKey.endsWith('_U') ? appKey.slice(0, -2) : appKey;
        const normalizeId = (id: any) => typeof id === 'string' ? id.replace(/_U$/, '') : id;

        return new Promise((resolve, reject) => {
            // Ensure the appKey passed to Shoonya matches the key used during browser auth.
            // The front-end opens the OAuth URL with `<baseAppKey>_U`. If the received appKey
            // does not end with `_U`, append it so the checksum matches.
            const apiAppKey = appKey.endsWith('_U') ? appKey : `${appKey}_U`;

            // Pass the appKey with _U to the API wrapper so checksum matches the authorization request
            this.api.gen_access_token(code, apiAppKey, secretKey)
                .then(async (res: any) => {
                    //console.log('[Shoonya] loginWithCode response:', JSON.stringify(res, null, 2));
                    if (res.stat === 'Ok') {
                        // Map access_token → susertoken for full app compatibility
                        const uid = normalizeId(res.uid || res.USERID || normalizedAppKey);
                        const actid = normalizeId(res.actid || res.uid || res.USERID || normalizedAppKey);
                        const sessionData = {
                            ...res,
                            susertoken: res.access_token,
                            uid,
                            actid
                        };

                        // Call QuickAuth after GenAcsTok and log the full response for debugging.
                        // try {
                        //     const quickAuthParams = {
                        //         source: 'API',
                        //         apkversion: 'js:1.0.0',
                        //         uid,
                        //         pwd: res.access_token,
                        //         factor2: '',
                        //         vc: 'FA22136_U',
                        //         appkey: apiAppKey,
                        //         imei: 'abc1234'
                        //     };
                        //     const quickAuthResponse = await this.api.quick_auth(quickAuthParams);
                        //     console.log('[Shoonya] QuickAuth after GenAcsTok full response:', JSON.stringify(quickAuthResponse, null, 2));
                        // } catch (err) {
                        //     console.error('[Shoonya] QuickAuth after GenAcsTok failed:', err);
                        // }

                        this.session = sessionData;
                        this.api.setSessionDetails(sessionData);
                        // Persist session to Supabase
                        await db.saveSession({
                            uid,
                            susertoken: res.access_token,
                            actid
                        });
                        try {
                            await this.startWebSocket();
                        } catch (e) {
                            console.warn('[Shoonya] startWebSocket after loginWithCode failed:', e);
                        }
                        console.log('[Shoonya] loginWithCode token used:', {
                            susertoken: res.access_token,
                            access_token: res.access_token,
                            usedToken: res.access_token
                        });
                        resolve(sessionData);
                    } else {
                        reject(res);
                    }
                })
                .catch(reject);
        });
    }

    async logout() {
        try {
            // Stop WebSocket and clear timers to prevent heartbeat logs after logout
            this.stopWebSocket();
            this.clearDailyStopTimer();
            // Call API logout
            if (this.api.logout) {
                await this.api.logout();
            }
            this.session = null;
            this.api.setSessionDetails({});
            await db.clearSession();
            console.log('[Shoonya] Logged out successfully and session cleared from DB.');
        } catch (err) {
            console.error('[Shoonya] Logout failed:', err);
            throw err;
        }
    }

    private stopWebSocket() {
        try {
            if (this.api && this.api.stop_websocket) {
                this.api.stop_websocket();
            }
            this.wsStarted = false;
            this.isSocketConnected = false;
            console.log('[Shoonya] WebSocket stopped.');
        } catch (err) {
            console.error('[Shoonya] stopWebSocket error:', err);
        }
    }

    private clearDailyStopTimer() {
        if (this.dailyStopTimer) {
            clearTimeout(this.dailyStopTimer);
            this.dailyStopTimer = null;
        }
    }

    private stopWebSocketAt4pm() {
        if (this.wsStarted) {
            console.log('[Shoonya] Auto-stopping WebSocket at 4pm');
            this.stopWebSocket();
        }
    }

    private scheduleNextDaily4pmStop() {
        const now = new Date();
        const next4pm = new Date(now);
        next4pm.setHours(16, 0, 0, 0);
        if (next4pm <= now) {
            next4pm.setDate(next4pm.getDate() + 1);
        }
        const delay = next4pm.getTime() - now.getTime();
        console.log(`[Shoonya] Next WebSocket stop scheduled at ${next4pm.toISOString()} (in ${Math.round(delay / 1000)}s)`);
        this.dailyStopTimer = setTimeout(() => {
            this.stopWebSocketAt4pm();
            this.scheduleNextDaily4pmStop();
        }, delay);
    }

    private setupDaily4pmStop() {
        const now = new Date();
        if (now.getHours() >= 16) {
            this.stopWebSocketAt4pm();
        }
        this.scheduleNextDaily4pmStop();
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
        console.log(`[GetQuotes] REQUEST: uid=${this.session?.uid || 'missing'}, exch=${exchange}, token=${token}, susertoken=${this.session?.susertoken ? 'present' : 'missing'}`);
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
        return new Promise<void>(async (resolve, reject) => {
            if (onTick) this.tickListeners.push(onTick);
            if (onOrder) this.orderListeners.push(onOrder);

            if (this.wsStarted || this.wsConnecting) {
                resolve();
                return;
            }

            // If not logged in, try to resume a session first. If still not logged in,
            // don't reject the whole service startup — resolve and defer websocket
            // connection until after a successful login.
            if (!this.isLoggedIn()) {
                try {
                    await this.resumeSession();
                } catch (e) {
                    // ignore resume errors
                }

                if (!this.isLoggedIn()) {
                    console.warn('[Shoonya] Cannot start WebSocket: Not logged in. Deferring until login.');
                    // Leave wsConnecting false and return successfully so callers don't crash
                    resolve();
                    return;
                }
            }

            this.wsConnecting = true;
            const wsPromise = this.api.start_websocket({
                socket_open: () => {
                    // Connection acknowledged by Shoonya (t == 'ck')
                    this.wsConnecting = false;
                    this.wsStarted = true;
                    this.isSocketConnected = true;

                    // Auto subscribe to Nifty spot
                    if (this.api.web_socket) {
                        this.api.subscribe(['NSE|26000']);
                    }

                    // Flush pending subscriptions
                    if (this.pendingSubscriptions.length > 0) {
                        console.log(`[Shoonya] Flushing ${this.pendingSubscriptions.length} pending subscriptions...`);
                        this.api.subscribe(this.pendingSubscriptions);
                        this.pendingSubscriptions = [];
                    }

                    resolve();
                },
                socket_close: () => {
                    this.isSocketConnected = false;
                    this.wsStarted = false;
                    this.wsConnecting = false;
                    console.warn('[Shoonya] WebSocket closed');
                },
                socket_error: () => {
                    this.isSocketConnected = false;
                    this.wsStarted = false;
                    this.wsConnecting = false;
                    console.error('[Shoonya] WebSocket error');
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

            // Handle if start_websocket returns a promise or not
            if (wsPromise && typeof wsPromise.catch === 'function') {
                wsPromise.catch((err: any) => {
                    this.wsConnecting = false;
                    console.error('[Shoonya] start_websocket failed:', err);
                    reject(err);
                });
            } else {
                // If no promise returned, assume connection will happen asynchronously via callbacks
                console.log('[Shoonya] start_websocket called (returns undefined, relying on callbacks)');
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
