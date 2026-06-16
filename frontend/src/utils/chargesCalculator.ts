/**
 * Finvasia Brokerage Charges & Taxes Calculator — NSE F&O Options
 *
 * Rate Reference (as of 2025):
 *  - Brokerage         : ₹5 flat per executed order (buy & sell separately)
 *  - Exchange Charges  : 0.03503% of premium turnover (NSE)
 *  - GST               : 18% on (Brokerage + Exchange Charges)
 *  - SEBI Fee          : 0.0001% (₹10 per crore) on turnover
 *  - Stamp Duty        : 0.003% on buy-side premium only
 *  - STT               : 0.15% on sell-side premium only
 */

// ─── Rate Constants ─────────────────────────────────────────────────────────

export const CHARGE_RATES = {
    BROKERAGE_PER_ORDER: 5,      // ₹5 flat per order
    EXCHANGE: 0.0003503,          // 0.03503%
    GST: 0.18,                    // 18%
    SEBI: 0.000001,               // 0.0001%
    STAMP_DUTY: 0.00003,          // 0.003% – buy side only
    STT: 0.0015,                  // 0.15%  – sell side only
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SidedCharges {
    turnover: number;
    brokerage: number;
    exchangeCharges: number;
    gst: number;
    sebiFee: number;
    stampDuty: number;   // 0 for sell side
    stt: number;         // 0 for buy side
    total: number;
}

export interface ChargesBreakdown {
    buySide: SidedCharges;
    sellSide: SidedCharges;
    // Aggregated totals
    brokerage: number;
    exchangeCharges: number;
    gst: number;
    sebiFee: number;
    stampDuty: number;
    stt: number;
    total: number;
    /** Number of trades included in this calculation */
    tradesCounted: number;
}

// ─── Core Calculator ─────────────────────────────────────────────────────────

/**
 * Calculates brokerage charges from raw turnover and order counts.
 *
 * @param buyTurnover   - Sum of (entry_price × quantity) across all legs
 * @param sellTurnover  - Sum of (exit_price  × quantity) across all legs
 * @param numBuyOrders  - Number of buy-side executed orders (typically = legs count)
 * @param numSellOrders - Number of sell-side executed orders (typically = legs count)
 */
export function calculateChargesFromTurnover(
    buyTurnover: number,
    sellTurnover: number,
    numBuyOrders: number = 1,
    numSellOrders: number = 1
): Omit<ChargesBreakdown, 'tradesCounted'> {
    // ── Buy Side ──────────────────────────────────────
    const buy_brokerage     = CHARGE_RATES.BROKERAGE_PER_ORDER * numBuyOrders;
    const buy_exchange      = CHARGE_RATES.EXCHANGE * buyTurnover;
    const buy_gst           = CHARGE_RATES.GST * (buy_brokerage + buy_exchange);
    const buy_sebi          = CHARGE_RATES.SEBI * buyTurnover;
    const buy_stamp         = CHARGE_RATES.STAMP_DUTY * buyTurnover;
    const buy_stt           = 0; // STT not applicable on buy side for options
    const buy_total         = buy_brokerage + buy_exchange + buy_gst + buy_sebi + buy_stamp;

    // ── Sell Side ─────────────────────────────────────
    const sell_brokerage    = CHARGE_RATES.BROKERAGE_PER_ORDER * numSellOrders;
    const sell_exchange     = CHARGE_RATES.EXCHANGE * sellTurnover;
    const sell_gst          = CHARGE_RATES.GST * (sell_brokerage + sell_exchange);
    const sell_sebi         = CHARGE_RATES.SEBI * sellTurnover;
    const sell_stamp        = 0; // Stamp duty not applicable on sell side
    const sell_stt          = CHARGE_RATES.STT * sellTurnover;
    const sell_total        = sell_brokerage + sell_exchange + sell_gst + sell_sebi + sell_stt;

    const buySide: SidedCharges = {
        turnover: buyTurnover,
        brokerage: buy_brokerage,
        exchangeCharges: buy_exchange,
        gst: buy_gst,
        sebiFee: buy_sebi,
        stampDuty: buy_stamp,
        stt: buy_stt,
        total: buy_total,
    };

    const sellSide: SidedCharges = {
        turnover: sellTurnover,
        brokerage: sell_brokerage,
        exchangeCharges: sell_exchange,
        gst: sell_gst,
        sebiFee: sell_sebi,
        stampDuty: sell_stamp,
        stt: sell_stt,
        total: sell_total,
    };

    return {
        buySide,
        sellSide,
        brokerage:       buy_brokerage + sell_brokerage,
        exchangeCharges: buy_exchange  + sell_exchange,
        gst:             buy_gst       + sell_gst,
        sebiFee:         buy_sebi      + sell_sebi,
        stampDuty:       buy_stamp,
        stt:             sell_stt,
        total:           buy_total + sell_total,
    };
}

/**
 * Calculates charges for a single trade given its position_history_log rows.
 *
 * Brokerage: ₹5 flat for the entire entry execution + ₹5 flat for the entire
 * exit execution = ₹10 per trade, regardless of the number of legs or lots.
 * All legs combined are counted as 1 buy order and 1 sell order with Finvasia.
 */
export function calculateChargesForTrade(positions: any[]): Omit<ChargesBreakdown, 'tradesCounted'> {
    let buyTurnover  = 0;
    let sellTurnover = 0;

    positions.forEach(pos => {
        const qty        = Number(pos.quantity)    || 0;
        const entryPrice = Number(pos.entry_price) || 0;
        const exitPrice  = Number(pos.exit_price)  || 0;
        buyTurnover  += entryPrice * qty;
        sellTurnover += exitPrice  * qty;
    });

    // Finvasia charges ₹5 flat per order execution:
    //   - 1 buy order for the full entry (regardless of how many legs/lots)
    //   - 1 sell order for the full exit (regardless of how many legs/lots)
    // Total brokerage per trade = ₹5 (entry) + ₹5 (exit) = ₹10
    return calculateChargesFromTurnover(buyTurnover, sellTurnover, 1, 1);
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

const ZERO_SIDED: SidedCharges = {
    turnover: 0, brokerage: 0, exchangeCharges: 0,
    gst: 0, sebiFee: 0, stampDuty: 0, stt: 0, total: 0,
};

/**
 * Sums a list of per-trade charge breakdowns into one aggregate breakdown.
 */
export function aggregateCharges(chargesList: Omit<ChargesBreakdown, 'tradesCounted'>[]): ChargesBreakdown {
    if (chargesList.length === 0) {
        return {
            buySide: { ...ZERO_SIDED },
            sellSide: { ...ZERO_SIDED },
            brokerage: 0, exchangeCharges: 0, gst: 0,
            sebiFee: 0, stampDuty: 0, stt: 0, total: 0,
            tradesCounted: 0,
        };
    }

    const addSided = (a: SidedCharges, b: SidedCharges): SidedCharges => ({
        turnover:        a.turnover        + b.turnover,
        brokerage:       a.brokerage       + b.brokerage,
        exchangeCharges: a.exchangeCharges + b.exchangeCharges,
        gst:             a.gst             + b.gst,
        sebiFee:         a.sebiFee         + b.sebiFee,
        stampDuty:       a.stampDuty       + b.stampDuty,
        stt:             a.stt             + b.stt,
        total:           a.total           + b.total,
    });

    const result = chargesList.reduce(
        (acc, c) => ({
            buySide:         addSided(acc.buySide,  c.buySide),
            sellSide:        addSided(acc.sellSide, c.sellSide),
            brokerage:       acc.brokerage       + c.brokerage,
            exchangeCharges: acc.exchangeCharges + c.exchangeCharges,
            gst:             acc.gst             + c.gst,
            sebiFee:         acc.sebiFee         + c.sebiFee,
            stampDuty:       acc.stampDuty       + c.stampDuty,
            stt:             acc.stt             + c.stt,
            total:           acc.total           + c.total,
        }),
        {
            buySide: { ...ZERO_SIDED }, sellSide: { ...ZERO_SIDED },
            brokerage: 0, exchangeCharges: 0, gst: 0,
            sebiFee: 0, stampDuty: 0, stt: 0, total: 0,
        } as Omit<ChargesBreakdown, 'tradesCounted'>
    );

    return { ...result, tradesCounted: chargesList.length };
}
