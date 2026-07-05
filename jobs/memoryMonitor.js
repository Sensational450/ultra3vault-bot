/**
 * 💾 Memory Monitor Job (v2.0)
 * - Checks memory usage across all agents
 * - Triggers cleanup if memory >80%
 * - Force-cleans if memory >90%
 * - Emits events for monitoring
 * - Runs every 10 minutes
 */
module.exports = ({ eventBus, logger, orchestrator }) => {
  // ─── Thresholds ───
  const WARN_THRESHOLD = 80;    // % memory usage
  const CRITICAL_THRESHOLD = 90;
  const MAX_HISTORY = 20;        // Keep last 20 readings

  return async function execute() {
    logger.debug('💾 Running memory monitor...');

    // ─── 1. Get current memory usage ───
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
    const usagePct = (mem.heapUsed / mem.heapTotal) * 100;

    logger.debug(`💾 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePct.toFixed(1)}%) | RSS: ${rssMB}MB`);

    // ─── 2. Emit memory event ───
    eventBus.emit('memory.monitor', {
      heapUsedMB: parseFloat(heapUsedMB),
      heapTotalMB: parseFloat(heapTotalMB),
      rssMB: parseFloat(rssMB),
      usagePct: usagePct,
      timestamp: Date.now(),
    });

    // ─── 3. Check thresholds and trigger actions ───
    let actionTaken = false;

    // 3a. WARNING: >80% → trigger cache cleanup
    if (usagePct > WARN_THRESHOLD) {
      logger.warn(`⚠️ Memory at ${usagePct.toFixed(1)}% (threshold: ${WARN_THRESHOLD}%) – triggering cleanup`);

      // Trigger cache cleanup via event (so other subscribers can react)
      eventBus.emit('memory.warning', {
        usagePct,
        heapUsedMB: parseFloat(heapUsedMB),
        heapTotalMB: parseFloat(heapTotalMB),
        rssMB: parseFloat(rssMB),
      });

      // Force cleanup via OptimizationAgent or all agents
      await _triggerCleanup(orchestrator, logger);
      actionTaken = true;
    }

    // 3b. CRITICAL: >90% → aggressive cleanup + alert
    if (usagePct > CRITICAL_THRESHOLD) {
      logger.error(`🔥 Memory CRITICAL at ${usagePct.toFixed(1)}% (threshold: ${CRITICAL_THRESHOLD}%)`);

      // Emit critical alert
      eventBus.emit('memory.critical', {
        usagePct,
        heapUsedMB: parseFloat(heapUsedMB),
        heapTotalMB: parseFloat(heapTotalMB),
        rssMB: parseFloat(rssMB),
      });

      // Force aggressive cleanup
      await _aggressiveCleanup(orchestrator, logger);

      // If still high after cleanup, let OptimizationAgent handle self-healing
      // (it will trigger restart if needed)
      actionTaken = true;
    }

    // ─── 4. Store reading in OptimizationAgent (if available) ───
    const optAgent = orchestrator?.getAgent('OptimizationAgent');
    if (optAgent && optAgent.metrics) {
      optAgent.metrics.memoryHistory.push(usagePct);
      if (optAgent.metrics.memoryHistory.length > MAX_HISTORY) {
        optAgent.metrics.memoryHistory.shift();
      }
    }

    if (!actionTaken) {
      logger.debug(`✅ Memory healthy: ${usagePct.toFixed(1)}%`);
    }
  };
};

// ─── Helpers ───────────────────────────────────────────────

/**
 * Trigger cleanup on all agents that support it
 */
async function _triggerCleanup(orchestrator, logger) {
  const allAgents = orchestrator?.getAllAgents?.() || [];
  let cleaned = 0;

  for (const agent of allAgents) {
    const name = agent.constructor?.name || 'UnknownAgent';
    const cleanupFn = agent.cleanup || agent.clearCache;
    if (typeof cleanupFn === 'function') {
      try {
        await cleanupFn.call(agent);
        cleaned++;
      } catch (err) {
        logger.error(`❌ ${name} cleanup failed: ${err.message}`);
      }
    }
  }

  logger.debug(`🧹 Triggered cleanup on ${cleaned} agents`);

  // Also trigger OptimizationAgent's internal cache cleanup
  const optAgent = orchestrator?.getAgent('OptimizationAgent');
  if (optAgent && typeof optAgent._cacheCleanup === 'function') {
    try {
      await optAgent._cacheCleanup();
    } catch (err) {
      logger.error(`❌ OptimizationAgent cache cleanup failed: ${err.message}`);
    }
  }
}

/**
 * Aggressive cleanup – also clears caches and forces garbage collection
 */
async function _aggressiveCleanup(orchestrator, logger) {
  logger.warn('🔥 Running aggressive cleanup...');

  // 1. Clear all agent caches
  await _triggerCleanup(orchestrator, logger);

  // 2. Clear all agent-specific caches more aggressively
  const allAgents = orchestrator?.getAllAgents?.() || [];
  for (const agent of allAgents) {
    const name = agent.constructor?.name || 'UnknownAgent';
    // Check for aggressive cleanup method
    if (typeof agent.aggressiveCleanup === 'function') {
      try {
        await agent.aggressiveCleanup.call(agent);
        logger.debug(`✅ ${name} aggressive cleanup completed`);
      } catch (err) {
        logger.error(`❌ ${name} aggressive cleanup failed: ${err.message}`);
      }
    }
  }

  // 3. Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
      logger.debug('🧹 Forced garbage collection');
    } catch (err) {
      logger.debug(`GC not available: ${err.message}`);
    }
  }

  // 4. Emit event
  const optAgent = orchestrator?.getAgent('OptimizationAgent');
  if (optAgent) {
    optAgent.emit('memory.aggressiveCleanup', { timestamp: Date.now() });
  }
}