import axios, { AxiosInstance } from 'axios';

class NseService {
    private baseUrl = 'https://www.nseindia.com';
    private axiosInstance: AxiosInstance;

    // Cache for expiry dates
    private expiryCache: {
        data: string[];
        fetchedDate: string;
    } | null = null;

    constructor() {
        // Create axios instance with persistent cookies
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1'
            },
            withCredentials: true // Important for cookies
        });
    }

    private isSameDay(date1: Date, date2: Date): boolean {
        return date1.toDateString() === date2.toDateString();
    }

    async getExpiries(symbol: string = 'NIFTY'): Promise<string[]> {
        try {
            // Check if we have cached data from today
            const today = new Date();
            if (this.expiryCache && this.isSameDay(new Date(this.expiryCache.fetchedDate), today)) {
                //console.log('[NSE] Using cached expiry data from today');
                return this.expiryCache.data;
            }

            //console.log('[NSE] Fetching fresh expiry data from NSE India...');

            // Step 1: Visit homepage to get cookies
            await this.axiosInstance.get('/', {
                headers: {
                    'Referer': 'https://www.google.com/'
                }
            });

            // Step 2: Visit option chain page to establish session
            await this.axiosInstance.get('/option-chain', {
                headers: {
                    'Referer': this.baseUrl
                }
            });

            // Small delay to mimic human behavior
            await new Promise(r => setTimeout(r, 500));

            // Step 3: Fetch the option chain contract info
            const response = await this.axiosInstance.get(
                `/api/option-chain-contract-info?symbol=${symbol}`,
                {
                    headers: {
                        'Referer': `${this.baseUrl}/option-chain`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );

            if (response.data && response.data.expiryDates) {
                // NSE returns dates in format: "09-Jan-2026"
                // Convert to our format: "09-JAN-2026"
                const expiries = response.data.expiryDates.map((date: string) => {
                    return date.toUpperCase();
                });

                // Cache the data
                this.expiryCache = {
                    data: expiries,
                    fetchedDate: today.toISOString()
                };

                //console.log(`[NSE] Fetched and cached ${expiries.length} expiry dates for ${symbol}`);
                return expiries;
            }

            return [];
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

    async getOptionChainData(symbol: string = 'NIFTY'): Promise<any> {
        try {
            // Ensure session is fresh-ish by checking cookies or cache age (simple refresh for now)
            const today = new Date();
            if (!this.expiryCache || !this.isSameDay(new Date(this.expiryCache.fetchedDate), today)) {
                await this.getExpiries(symbol); // This refreshes cookies/session
            }

            const response = await this.axiosInstance.get(
                `/api/option-chain-contract-info?symbol=${symbol}`,
                {
                    headers: {
                        'Referer': `${this.baseUrl}/option-chain`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('[NSE] Failed to fetch option chain data:', error.message);
            // Retry logic could go here
            throw error;
        }
    }


    async getSpotPrice(symbol: string = 'NIFTY'): Promise<number | null> {
        try {
            // Visit homepage first
            await this.axiosInstance.get('/');

            const response = await this.axiosInstance.get(
                `/api/option-chain-indices?symbol=${symbol}`,
                {
                    headers: {
                        'Referer': `${this.baseUrl}/option-chain`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );

            if (response.data && response.data.records && response.data.records.underlyingValue) {
                const spot = response.data.records.underlyingValue;
                //console.log(`[NSE] ${symbol} Spot: ${spot}`);
                return spot;
            }

            return null;
        } catch (error: any) {
            console.error('[NSE] Failed to fetch spot price:', error.message);
            return null;
        }
    }
}

export const nseService = new NseService();
