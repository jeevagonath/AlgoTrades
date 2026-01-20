/**
 * Format option symbol to readable text
 * Example: NIFTY27JAN26C25450 -> "Nifty 25450 CE • 27 Jan 26"
 * Example: BANKNIFTY27JAN26P52500 -> "BankNifty 52500 PE • 27 Jan 26"
 */
export function formatOptionSymbol(symbol: string): string {
    if (!symbol) return '';

    // Pattern: NIFTY27JAN26C25450 or BANKNIFTY27JAN26P52500
    const match = symbol.match(/^(NIFTY|BANKNIFTY)(\d{2})([A-Z]{3})(\d{2})([CP])(\d+)$/);

    if (!match) return symbol; // Return original if doesn't match pattern

    const [, index, day, month, year, type, strike] = match;

    // Format index name
    const indexName = index === 'NIFTY' ? 'Nifty' : 'BankNifty';

    // Format option type
    const optionType = type === 'C' ? 'CE' : 'PE';

    // Format date
    const monthNames: { [key: string]: string } = {
        'JAN': 'Jan', 'FEB': 'Feb', 'MAR': 'Mar', 'APR': 'Apr',
        'MAY': 'May', 'JUN': 'Jun', 'JUL': 'Jul', 'AUG': 'Aug',
        'SEP': 'Sep', 'OCT': 'Oct', 'NOV': 'Nov', 'DEC': 'Dec'
    };
    const monthName = monthNames[month] || month;
    const formattedDate = `${day} ${monthName} ${year}`;

    return `${indexName} ${strike} ${optionType} • ${formattedDate}`;
}

/**
 * Format option symbol for compact display (without date)
 * Example: NIFTY27JAN26C25450 -> "Nifty 25450 CE"
 */
export function formatOptionSymbolCompact(symbol: string): string {
    if (!symbol) return '';

    const match = symbol.match(/^(NIFTY|BANKNIFTY)(\d{2})([A-Z]{3})(\d{2})([CP])(\d+)$/);

    if (!match) return symbol;

    const [, index, , , , type, strike] = match;
    const indexName = index === 'NIFTY' ? 'Nifty' : 'BankNifty';
    const optionType = type === 'C' ? 'CE' : 'PE';

    return `${indexName} ${strike} ${optionType}`;
}
