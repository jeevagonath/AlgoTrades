# TODO - Fix peakProfit/peakLoss spike during adjustments

## Plan
1. Confirm exact code paths that update `peakProfit/peakLoss` during ACTIVE.
2. Patch `executeAdjustment()` / `calculatePnL()` to prevent pnl spikes caused by wrong/temporary `entryPrice/ltp/quantity` for newly added adjustment legs.
3. Add validation + robust lot-size/quantity normalization.
4. Add targeted debug logs for adjustment token/entryPrice/ltp/quantity and computed legPnL.
5. Validate with a replay/test: run strategy, trigger adjustment, ensure no immediate forced exit unless thresholds truly hit.

## Steps
- [ ] Step 1: Add guard to stop peakProfit/peakLoss updates for newly added legs until websocket `ltp` arrives or a small grace period passes.
- [ ] Step 2: Fix quantity handling for adjustment legs (ensure quantity is total contracts qty consistent with PnL math).
- [ ] Step 3: Add debug logging around adjustment leg creation and first tick update.
- [ ] Step 4: Re-run a scenario where adjustment occurs and verify peakProfit/peakLoss does not spike.

