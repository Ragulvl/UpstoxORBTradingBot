import { logger } from '../utils/logger.js';

/**
 * Position Reconciler
 *
 * On bot startup, fetches open positions from Upstox broker
 * and reconciles with the bot's internal PositionTracker.
 *
 * Prevents the classic crash-restart double-position bug:
 *   Bot crashes → restarts → opens new position = double exposure
 *
 * Scenarios handled:
 *   1. Broker has position, bot doesn't know  → restore it (RECONCILED)
 *   2. Bot thinks it has position, broker doesn't → close orphan (ORPHAN)
 *   3. Both agree                              → no action (OK)
 */
export class PositionReconciler {
  constructor(upstoxClient, positionTracker) {
    this.upstoxClient = upstoxClient;
    this.positionTracker = positionTracker;
  }

  async reconcile() {
    logger.info('🔄 Reconciling positions with broker on startup...');

    try {
      const brokerResponse = await this.upstoxClient.getPositions();
      const brokerPositions = (brokerResponse?.data || []).filter(p =>
        // Only truly open positions (net non-zero quantity)
        (p.quantity ?? 0) !== 0
      );

      logger.info('Broker positions fetched', {
        total: brokerResponse?.data?.length ?? 0,
        open: brokerPositions.length
      });

      if (brokerPositions.length === 0 && this.positionTracker.positions.size === 0) {
        logger.info('✅ Reconciliation complete — clean slate');
        return { reconciled: 0, orphans: 0 };
      }

      let reconciled = 0;
      let orphans = 0;

      // ── Pass 1: Restore unknown broker positions into PositionTracker ─────
      for (const bp of brokerPositions) {
        const alreadyTracked = [...this.positionTracker.positions.values()].some(tp =>
          tp.instrument === bp.trading_symbol ||
          tp.instrumentKey === bp.instrument_token
        );

        if (!alreadyTracked) {
          const restoredId = `reconciled_${bp.instrument_token}_${Date.now()}`;
          this.positionTracker.openPosition({
            id: restoredId,
            instrument: bp.trading_symbol,
            instrumentKey: bp.instrument_token,
            side: (bp.quantity ?? 0) > 0 ? 'BUY' : 'SELL',
            quantity: Math.abs(bp.quantity ?? 0),
            entryPrice: bp.average_price ?? 0,
            orderId: `broker_reconciled`,
            stopLoss: null,  // Unknown — risk manager will not size-in again
            target: null,
            entryTime: new Date().toISOString()
          });

          logger.warn('↩️  RECONCILED: Restored broker position not tracked by bot', {
            symbol: bp.trading_symbol,
            qty: bp.quantity,
            avgPrice: bp.average_price,
            restoredId
          });
          reconciled++;
        } else {
          logger.info('✅ Position already tracked by bot', { symbol: bp.trading_symbol });
        }
      }

      // ── Pass 2: Close orphaned positions (bot tracks, broker doesn't) ─────
      for (const [id, tp] of this.positionTracker.positions) {
        // Skip positions we just restored
        if (id.startsWith('reconciled_')) continue;

        const brokerHas = brokerPositions.some(bp =>
          tp.instrument === bp.trading_symbol ||
          tp.instrumentKey === bp.instrument_token
        );

        if (!brokerHas) {
          logger.error('🚨 ORPHAN: Bot tracks position but broker has none — closing internally', {
            positionId: id,
            instrument: tp.instrument,
            side: tp.side,
            qty: tp.quantity,
            entryPrice: tp.entryPrice
          });
          // Force-close in tracker so bot doesn't try to manage a non-existent position
          this.positionTracker.closePosition(id, tp.entryPrice, 'RECONCILIATION_ORPHAN');
          orphans++;
        }
      }

      logger.info('✅ Reconciliation complete', { reconciled, orphans });
      return { reconciled, orphans };

    } catch (error) {
      // Non-fatal — log clearly and let bot continue (better than crashing on startup)
      logger.error('❌ Position reconciliation failed — proceeding without reconciliation', {
        error: error.message,
        status: error.response?.status
      });
      return { reconciled: 0, orphans: 0, error: error.message };
    }
  }
}

export default PositionReconciler;
