const Api = require('../lib/RestApi');
import { db } from './supabase.service';

class ShoonyaService {
    private api: any;
    private session: any;

    constructor() {
        this.api = new Api({});
        this.resumeSession();
    }

    private async resumeSession() {
        try {
            const { data, error } = await db.getSession();
            if (data && data.susertoken) {
                // Check if the session is from today
                const sessionDate = new Date(data.updated_at).toDateString();
                const today = new Date().toDateString();

                if (sessionDate === today) {
                    //console.log('Resuming Shoonya session for UID:', data.uid);
                    this.api.setSessionDetails(data);
                    this.session = data;
                } else {
                    //console.log('Stale Shoonya session found (Date:', sessionDate, '). Ignoring.');
                }
            }
        } catch (err) {
            console.error('Failed to resume Shoonya session:', err);
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

    startWebSocket(onTick: (tick: any) => void, onOrder: (order: any) => void) {
        this.api.start_websocket({
            socket_open: () => {
                //console.log('[Shoonya] WebSocket Connected');
                // Auto subscribe to Nifty spot
                this.api.subscribe(['NSE|26000']);
            },
            quote: (tick: any) => {
                onTick(tick);
            },
            order: (order: any) => {
                onOrder(order);
            }
        });
    }

    subscribe(tokens: string[]) {
        this.api.subscribe(tokens);
    }

    unsubscribe(tokens: string[]) {
        this.api.unsubscribe(tokens);
    }

    isLoggedIn() {
        return !!this.session && !!this.session.susertoken;
    }

    async placeOrder(orderParams: any) {
        return new Promise((resolve, reject) => {
            this.api.placeorder(orderParams)
                .then((res: any) => {
                    resolve(res);
                })
                .catch((err: any) => {
                    reject(err);
                });
        });
    }

    async getOrderBook() {
        return new Promise((resolve, reject) => {
            this.api.get_order_book()
                .then((res: any) => {
                    resolve(res || []);
                })
                .catch((err: any) => {
                    // Start empty if fails (e.g. no orders)
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
