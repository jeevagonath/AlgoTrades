const Api = require('../lib/RestApi');
import { db } from './supabase.service';

class ShoonyaService {
    private api: any;
    private session: any;
    private tickListeners: ((tick: any) => void)[] = [];
    private orderListeners: ((order: any) => void)[] = [];
    private wsStarted: boolean = false;

    constructor() {
        this.api = new Api({});
        this.resumeSession();
    }

    private async resumeSession() {
        try {
            console.log('[Shoonya] Attempting to resume session from database...');
            const { data, error } = await db.getSession();
            if (data && data.susertoken) {
                // Check if the session is from today
                const sessionDate = new Date(data.updated_at).toDateString();
                const today = new Date().toDateString();

                if (sessionDate === today) {
                    console.log('[Shoonya] Resuming session for UID:', data.uid);
                    this.api.setSessionDetails(data);
                    this.session = data;
                } else {
                    console.log('[Shoonya] Stale session found (Date:', sessionDate, '). Ignoring.');
                }
            } else {
                console.log('[Shoonya] No active session found in database.');
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
        return new Promise((resolve, reject) => {
            this.api.get_quotes(exchange, token)
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
                console.log('[Shoonya] WebSocket Connected');
                // Auto subscribe to Nifty spot
                if (this.api.web_socket) {
                    this.api.subscribe(['NSE|26000']);
                }
            },
            quote: (tick: any) => {
                this.tickListeners.forEach(cb => cb(tick));
                // Also emit globally for UI convenience
                import('./socket.service').then(({ socketService }) => {
                    socketService.emit('tick', tick);
                }).catch(() => { });
            },
            order: (order: any) => {
                this.orderListeners.forEach(cb => cb(order));
            }
        });
    }

    subscribe(tokens: string[]) {
        if (!this.wsStarted) {
            console.log('[Shoonya] Subscribe called but WS not started. Initializing...');
            this.startWebSocket();
        }

        // Small delay to ensure self.web_socket is assigned by start_websocket
        setTimeout(() => {
            if (this.api && this.api.web_socket) {
                try {
                    this.api.subscribe(tokens);
                } catch (e) {
                    console.error('[Shoonya] Subscription error:', e);
                }
            } else {
                console.warn('[Shoonya] Could not subscribe: WebSocket still not ready.');
            }
        }, 500);
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

    async getBasketMargin(legs: any[]) {
        return new Promise((resolve, reject) => {
            // API expects: { exch, tsym, qty, prc, prd, trantype, prctyp }
            const list = legs.map(leg => ({
                exch: 'NFO',
                tsym: leg.symbol,
                qty: leg.quantity.toString(),
                prc: (leg.entryPrice || 0).toString(),
                prd: 'M', // NRML margin
                trantype: leg.side === 'BUY' ? 'B' : 'S',
                prctyp: 'MKT'
            }));

            if (!this.api.basket_margin) {
                reject('API basket_margin not defined');
                return;
            }

            this.api.basket_margin({ exchange: 'NFO', list })
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
}

export const shoonya = new ShoonyaService();
