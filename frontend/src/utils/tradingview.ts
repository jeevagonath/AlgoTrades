// TradingView symbol formatter utility

const MONTH_MAP: { [key: string]: string } = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
};

/**
 * Converts option symbol to TradingView format
 * Input: "NIFTY24JAN26C23000"
 * Output: "NSE:NIFTY260113C23000"
 */
export const formatTradingViewSymbol = (symbol: string): string => {
    try {
        // Extract components from symbol
        // Format: NIFTY{DD}{MMM}{YY}{C/P}{STRIKE}
        const match = symbol.match(/NIFTY(\d{2})([A-Z]{3})(\d{2})([CP])(\d+)/);

        if (!match) {
            console.warn('Invalid symbol format:', symbol);
            return '';
        }

        const [, day, monthName, year, optionType, strike] = match;
        const month = MONTH_MAP[monthName];

        if (!month) {
            console.warn('Invalid month in symbol:', monthName);
            return '';
        }

        // Format: NSE:NIFTY{YY}{MM}{DD}{C/P}{STRIKE}
        return `NSE:NIFTY${year}${month}${day}${optionType}${strike}`;
    } catch (error) {
        console.error('Error formatting TradingView symbol:', error);
        return '';
    }
};

/**
 * Generates TradingView chart URL
 */
export const getTradingViewUrl = (symbol: string): string => {
    const encodedSymbol = encodeURIComponent(symbol);
    return `https://in.tradingview.com/chart/QsFD1neH/?symbol=${encodedSymbol}`;
};

/**
 * Opens TradingView chart in new window
 */
export const openTradingViewChart = (symbol: string): void => {
    const url = getTradingViewUrl(symbol);
    window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Get NIFTY spot chart URL
 */
export const getNiftySpotChartUrl = (): string => {
    return getTradingViewUrl('NSE:NIFTY');
};
