import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

class NseService {
    private baseUrl = 'https://www.nseindia.com';
    private axiosInstance: AxiosInstance;
    private jar: CookieJar;
    private initialized = false;

    // Cache for expiry dates
    private expiryCache: {
        data: string[];
        fetchedDate: string;
    } | null = null;

    constructor() {
        this.jar = new CookieJar();

        // Create axios instance with persistent cookies via jar
        this.axiosInstance = wrapper(axios.create({
            baseURL: this.baseUrl,
            jar: this.jar,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
            },
            withCredentials: true
        }));
    }

    private isSameDay(date1: Date, date2: Date): boolean {
        return date1.toDateString() === date2.toDateString();
    }

    private async initSession() {
        try {
            console.log('[NSE] Initializing new session...');
            this.jar.removeAllCookiesSync();

            // Step 1: Visit homepage to get cookies
            await this.axiosInstance.get('/', {
                headers: {
                    'Referer': 'https://www.google.com/',
                    'Sec-Fetch-Site': 'same-origin',
                }
            });

            // Step 2: Visit option chain page to establish session
            await this.axiosInstance.get('/option-chain', {
                headers: {
                    'Referer': this.baseUrl,
                    'Sec-Fetch-Site': 'same-origin',
                }
            });

            // Small delay to mimic human behavior
            await new Promise(r => setTimeout(r, 1000));

            // Debug info (optional, can be removed in prod if noisy)
            // const cookies = await this.jar.getCookies(this.baseUrl);
            // console.log('[NSE] Cookies initialized:', cookies.length);

            this.initialized = true;
            console.log('[NSE] Session initialized successfully');
            return true;
        } catch (error: any) {
            console.error('[NSE] Failed to initialize session:', error.message);
            return false;
        }
    }

    async getExpiries(symbol: string = 'NIFTY'): Promise<string[]> {
        try {
            // Check if we have cached data from today
            const today = new Date();
            if (this.expiryCache && this.isSameDay(new Date(this.expiryCache.fetchedDate), today)) {
                return this.expiryCache.data;
            }

            // Attempt fetch with retry logic
            return await this.fetchExpiriesWithRetry(symbol);

        } catch (error: any) {
            console.error('[NSE] Failed to fetch expiries:', error.message);

            // If we have stale cache, return it as fallback
            if (this.expiryCache) {
                console.warn('[NSE] Using stale cached data as fallback');
                return this.expiryCache.data;
            }

            return [];
        }
    }

    private async fetchExpiriesWithRetry(symbol: string, retryCount = 0): Promise<string[]> {
        if (!this.initialized && retryCount === 0) {
            await this.initSession();
        }

        try {
            const response = await this.axiosInstance.get(
                `/api/option-chain-contract-info?symbol=${symbol}`,
                {
                    headers: {
                        'Referer': `${this.baseUrl}/option-chain`,
                        'X-Requested-With': 'XMLHttpRequest',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Dest': 'empty',
                        'Accept': '*/*'
                    }
                }
            );

            if (response.data && response.data.expiryDates) {
                const expiries = response.data.expiryDates.map((date: string) => {
                    return date.toUpperCase();
                });

                // Cache the data
                this.expiryCache = {
                    data: expiries,
                    fetchedDate: new Date().toISOString()
                };

                return expiries;
            }
            // If we got here, response is valid (200) but missing expiryDates.
            // This might mean session is bad (dummy 200) or logic is bad.
            // We'll throw to trigger retry if we have retries left.
            throw new Error('Invalid response structure (missing expiryDates)');

        } catch (error: any) {
            // Check for 401/403 OR our custom validation error
            if (retryCount < 2) {
                console.log(`[NSE] Fetch failed in getExpiries (${error.message}). Re-initializing session...`);
                await this.initSession();
                return this.fetchExpiriesWithRetry(symbol, retryCount + 1);
            }
            throw error;
        }
    }

    async getOptionChainData(symbol: string = 'NIFTY'): Promise<any> {
        try {
            // Check if cache is from a different day, if so, re-init. 
            const today = new Date();
            if (this.expiryCache && !this.isSameDay(new Date(this.expiryCache.fetchedDate), today)) {
                this.expiryCache = null;
            }

            return await this.fetchOptionChainWithRetry(symbol);
        } catch (error: any) {
            console.error('[NSE] Failed to fetch option chain data:', error.message);
            throw error;
        }
    }

    private getEndpoint(symbol: string): string {
        const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
        if (indices.includes(symbol.toUpperCase())) {
            return '/api/option-chain-indices';
        }
        return '/api/option-chain-equities';
    }

    private async fetchOptionChainWithRetry(symbol: string, retryCount = 0): Promise<any> {
        if (!this.initialized && retryCount === 0) {
            await this.initSession();
        }

        try {
            const endpoint = this.getEndpoint(symbol);
            const response = await this.axiosInstance.get(
                `${endpoint}?symbol=${symbol}`,
                {
                    headers: {
                        'Referer': `${this.baseUrl}/option-chain`,
                        'X-Requested-With': 'XMLHttpRequest',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Dest': 'empty',
                        'Accept': '*/*'
                    }
                }
            );

            if (response.data && response.data.records) {
                return response.data;
            } else {
                console.warn(`[NSE] Response missing "records" field from ${endpoint}:`, JSON.stringify(response.data).substring(0, 200));
                // If records are missing, it might be a session issue, so we SHOULD retry
                if (retryCount < 2) {
                    throw new Error('Missing records');
                }
            }
            return response.data;

        } catch (error: any) {
            if (retryCount < 2) {
                console.log(`[NSE] Fetch failed in getOptionChainData (${error.message}). Re-initializing session...`);
                await this.initSession();
                return this.fetchOptionChainWithRetry(symbol, retryCount + 1);
            }
            throw error;
        }
    }


    async getSpotPrice(symbol: string = 'NIFTY'): Promise<number | null> {
        try {
            return await this.fetchSpotPriceWithRetry(symbol);
        } catch (error: any) {
            console.error('[NSE] Failed to fetch spot price:', error.message);
            return null;
        }
    }

    private async fetchSpotPriceWithRetry(symbol: string, retryCount = 0): Promise<number | null> {
        try {
            // Use the same logic as getOptionChainData to get the data
            const data = await this.fetchOptionChainWithRetry(symbol, retryCount);

            if (data && data.records && data.records.underlyingValue) {
                return data.records.underlyingValue;
            }
            if (data && data.underlyingValue) {
                return data.underlyingValue;
            }

            return null;

        } catch (error: any) {
            throw error;
        }
    }
}

export const nseService = new NseService();
