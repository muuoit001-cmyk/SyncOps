/**
 * Haversine distance calculation (meters) between two lat/lng points.
 * Pure JS — no PostGIS required for MVP.
 */
const EARTH_RADIUS_M = 6371000;

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Check if a point is within a circular geofence.
 * @param {{ lat: number, lng: number }} point
 * @param {{ lat: number, lng: number, radius_meters: number }} site
 * @returns {{ within: boolean, distanceM: number }}
 */
function isWithinFence(point, site) {
  if (Array.isArray(site.polygon_coordinates) && site.polygon_coordinates.length >= 3) {
    let inside = false;
    for (let i = 0, j = site.polygon_coordinates.length - 1; i < site.polygon_coordinates.length; j = i++) {
      const a = site.polygon_coordinates[i];
      const b = site.polygon_coordinates[j];
      const intersects = ((a.lng > point.lng) !== (b.lng > point.lng))
        && point.lat < ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng) + a.lat;
      if (intersects) inside = !inside;
    }
    return { within: inside, distanceM: inside ? 0 : null };
  }
  const distanceM = haversineDistance(point.lat, point.lng, site.lat, site.lng);
  return {
    within: distanceM <= site.radius_meters,
    distanceM: Math.round(distanceM),
  };
}

module.exports = { haversineDistance, isWithinFence };
