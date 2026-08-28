export interface Coordinates {
  lat: number;
  lng: number;
}

/** Parse latitude/longitude from `/w 12.34, -56.78` or a Google Maps URL. */
export function parseCoordinates(input: string): Coordinates | null {
  const text = decodeURIComponent(input).replace(/%2C/gi, ',');
  const match = text.match(/(?:@|[?&](?:q|ll|query)=)?(-?\d{1,3}(?:\.\d+)?)\s*[,~]\s*(-?\d{1,3}(?:\.\d+)?)/i);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Great-circle distance in metres. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const earthRadius = 6_371_000;
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const lat1 = a.lat * radians;
  const lat2 = b.lat * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
