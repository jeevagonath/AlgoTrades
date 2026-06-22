import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

// How long (ms) to wait before considering a session stale and forcing re-init
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 minutes

class NseService {
    private baseUrl = 'https://www.nseindia.com';
    private axiosInstance: AxiosInstance;
    private jar: CookieJar;
    private initialized = false;
    private lastInitTime = 0;

    // Cache for expiry dates
    private expiryCache: {
        data: string[];
        fetchedDate: string;
    } | null = null;

    // ── Shared Chrome-like browser headers ────────────────────────────────────
    private readonly browserHeaders = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
    };

    private readonly ajaxHeaders = {
        ...this.browserHeaders,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://www.nseindia.com/option-chain',
        'Origin': 'https://www.nseindia.com',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
    };

    constructor() {
        this.jar = new CookieJar();
        this.axiosInstance = wrapper(
            axios.create({
                baseURL: this.baseUrl,
                jar: this.jar,
                timeout: 20000,
                withCredentials: true,
                headers: this.browserHeaders,
            })
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private isSameDay(date1: Date, date2: Date): boolean {
        return date1.toDateString() === date2.toDateString();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    /** Returns true if the response body looks like an HTML page (session expired / bot block). */
    private isHtmlResponse(data: any): boolean {
        if (typeof data === 'string') {
            return data.trimStart().startsWith('<!');
        }
        return false;
    }

    private isSessionStale(): boolean {
        return !this.initialized || Date.now() - this.lastInitTime > SESSION_TTL_MS;
    }

    // ── Session initialisation ─────────────────────────────────────────────────

    /**
     * Multi-step warm-up that mimics a real browser navigating to the option chain page.
     * Step 1 → Homepage  (gets initial cookies)
     * Step 2 → Small delay
     * Step 3 → /option-chain page (gets bm_sz / nsit / nseappid cookies)
     * Step 4 → Small delay
     * Step 5 → Pre-flight API touch (gets any XSRF / session token cookies)
     */
    private async initSession(): Promise<boolean> {
        try {
            console.log('[NSE] Initialising session...');
            this.initialized = false;
            this.jar.removeAllCookiesSync();

            // Step 1: Homepage
            await this.axiosInstance.get('/', {
                headers: {
                    ...this.browserHeaders,
                    'Accept':
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Referer': 'https://www.google.com/',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
            });

            await this.delay(800 + Math.random() * 400);

            // Step 2: Option-chain page (critical for session cookies)
            await this.axiosInstance.get('/option-chain', {
                headers: {
                    ...this.browserHeaders,
                    'Accept':
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Referer': this.baseUrl,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                },
            });

            await this.delay(600 + Math.random() * 400);

            // Step 3: Light pre-flight to the contract-info endpoint to register intent
            try {
                await this.axiosInstance.get(
                    '/api/option-chain-contract-info?symbol=NIFTY',
                    { headers: this.ajaxHeaders }
                );
            } catch {
                // Ignore — this is just a warm-up touch
            }

            await this.delay(300);

            this.initialized = true;
            this.lastInitTime = Date.now();
            console.log('[NSE] Session initialised successfully');
            return true;
        } catch (error: any) {
            console.error('[NSE] Session init failed:', error.message);
            return false;
        }
    }

    // ── Endpoint selection ─────────────────────────────────────────────────────

    private getEndpoint(symbol: string): string {
        const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
        if (indices.includes(symbol.toUpperCase())) {
            return '/api/option-chain-indices';
        }
        return '/api/option-chain-equities';
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /** Returns expiry dates (uppercased) for the given symbol. Cached per day. */
    async getExpiries(symbol: string = 'NIFTY'): Promise<string[]> {
        try {
            const today = new Date();
            if (
                this.expiryCache &&
                this.isSameDay(new Date(this.expiryCache.fetchedDate), today)
            ) {
                return this.expiryCache.data;
            }
            return await this.fetchExpiriesWithRetry(symbol);
        } catch (error: any) {
            console.error('[NSE] Failed to fetch expiries:', error.message);
            if (this.expiryCache) {
                console.warn('[NSE] Returning stale cached expiries as fallback');
                return this.expiryCache.data;
            }
            return [];
        }
    }

    private async fetchExpiriesWithRetry(symbol: string, retryCount = 0): Promise<string[]> {
        if (this.isSessionStale() || retryCount > 0) {
            await this.initSession();
        }

        try {
            // Use contract-info endpoint — it returns expiryDates directly at the top level
            const response = await this.axiosInstance.get(
                `/api/option-chain-contract-info?symbol=${symbol}`,
                { headers: this.ajaxHeaders }
            );

            if (this.isHtmlResponse(response.data)) {
                throw new Error('Received HTML instead of JSON (session not ready)');
            }

            if (response.data?.expiryDates) {
                const expiries = (response.data.expiryDates as string[]).map(d => d.trim().toUpperCase());
                this.expiryCache = { data: expiries, fetchedDate: new Date().toISOString() };
                return expiries;
            }

            // Fallback: try parsing from records (option-chain-indices format)
            if (response.data?.records?.expiryDates) {
                const expiries = (response.data.records.expiryDates as string[]).map(d =>
                    d.trim().toUpperCase()
                );
                this.expiryCache = { data: expiries, fetchedDate: new Date().toISOString() };
                return expiries;
            }

            throw new Error('No expiryDates field in NSE response');
        } catch (error: any) {
            if (retryCount < 2) {
                console.log(`[NSE] getExpiries attempt ${retryCount + 1} failed (${error.message}) — retrying...`);
                await this.delay(2000);
                return this.fetchExpiriesWithRetry(symbol, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Returns full option-chain data for the given symbol.
     * Uses /api/option-chain-indices for index symbols, /api/option-chain-equities otherwise.
     */
    async getOptionChainData(symbol: string = 'NIFTY'): Promise<any> {
        try {
            // Clear stale cache marker (data is re-fetched live, cache only for expiries)
            const today = new Date();
            if (
                this.expiryCache &&
                !this.isSameDay(new Date(this.expiryCache.fetchedDate), today)
            ) {
                this.expiryCache = null;
            }
            return await this.fetchOptionChainWithRetry(symbol);
        } catch (error: any) {
            console.error('[NSE] Failed to fetch option chain data:', error.message);
            throw error;
        }
    }

    private async fetchOptionChainWithRetry(symbol: string, retryCount = 0): Promise<any> {
        if (this.isSessionStale() || retryCount > 0) {
            const ok = await this.initSession();
            if (!ok && retryCount >= 2) {
                throw new Error('NSE session could not be established after multiple attempts');
            }
        }

        try {
            const endpoint = this.getEndpoint(symbol);
            const response = await this.axiosInstance.get(
                `${endpoint}?symbol=${symbol}`,
                { headers: this.ajaxHeaders }
            );

            // Detect HTML / bot-block response
            if (this.isHtmlResponse(response.data)) {
                throw new Error('NSE returned HTML page instead of JSON — bot block or session expired');
            }

            if (response.data?.records) {
                return response.data;
            }

            console.warn(
                `[NSE] Missing "records" from ${endpoint}:`,
                JSON.stringify(response.data).substring(0, 300)
            );
            throw new Error('NSE response missing records field');

        } catch (error: any) {
            if (retryCount < 2) {
                console.log(`[NSE] fetchOptionChain attempt ${retryCount + 1} failed (${error.message}) — re-initialising session and retrying...`);
                await this.delay(3000 + retryCount * 2000); // progressive back-off
                return this.fetchOptionChainWithRetry(symbol, retryCount + 1);
            }
            throw error;
        }
    }

    // ── Spot price ─────────────────────────────────────────────────────────────

    async getSpotPrice(symbol: string = 'NIFTY'): Promise<number | null> {
        try {
            const data = await this.getOptionChainData(symbol);
            return data?.records?.underlyingValue ?? data?.underlyingValue ?? null;
        } catch (error: any) {
            console.error('[NSE] Failed to fetch spot price:', error.message);
            return null;
        }
    }
}

export const nseService = new NseService();
