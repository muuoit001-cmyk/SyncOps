/**
 * Fraud detection rules for attendance clock-in/out events.
 * Returns an array of flag reasons (empty = clean).
 */

const GPS_ACCURACY_THRESHOLD_M = 50; // > 50m accuracy is suspicious
const RAPID_CLOCK_THRESHOLD_MS = 60 * 1000; // < 1 min between in/out

/**
 * @typedef {Object} FraudContext
 * @property {number}  gpsAccuracyM         - GPS accuracy reported by device
 * @property {boolean} isMockLocation        - device reports mock location
 * @property {boolean} isWithinFence         - within geofence
 * @property {number}  distanceFromSiteM     - meters from site center
 * @property {Date|null} lastActionTime      - timestamp of last log entry for this staff
 * @property {string|null} lastAction        - 'clock_in' | 'clock_out'
 * @property {boolean} isNewDevice           - unrecognized device for this staff
 */

/**
 * Evaluate a clock event for fraud signals.
 * @param {FraudContext} ctx
 * @returns {string[]} array of flag reasons
 */
function evaluateFraudSignals(ctx) {
  const flags = [];

  if (ctx.isMockLocation) {
    flags.push('mock_location_detected');
  }

  if (ctx.gpsAccuracyM !== null && ctx.gpsAccuracyM > GPS_ACCURACY_THRESHOLD_M) {
    flags.push(`gps_accuracy_low:${Math.round(ctx.gpsAccuracyM)}m`);
  }

  if (!ctx.isWithinFence) {
    flags.push(`out_of_fence:${ctx.distanceFromSiteM}m`);
  }

  if (ctx.isNewDevice) {
    flags.push('new_device');
  }

  if (ctx.lastActionTime && ctx.lastAction === 'clock_in') {
    const msSinceLast = Date.now() - new Date(ctx.lastActionTime).getTime();
    if (msSinceLast < RAPID_CLOCK_THRESHOLD_MS) {
      flags.push(`rapid_clock_out:${Math.round(msSinceLast / 1000)}s_after_in`);
    }
  }

  return flags;
}

module.exports = { evaluateFraudSignals };
