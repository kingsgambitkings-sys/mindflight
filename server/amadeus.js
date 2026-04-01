// ===== Amadeus Flight API Integration =====
// Free tier: 2,000 calls/month, real-time airline prices
// Signup: https://developers.amadeus.com
import { Router } from 'express';
import { memoryStore } from './memory.js';

export const amadeusRouter = Router();

// ===== Airport Coordinates for CO2 / Nearby calculations =====
const AIRPORT_COORDS = {
  HKG: { lat: 22.31, lon: 114.17 }, NRT: { lat: 35.76, lon: 140.39 }, HND: { lat: 35.55, lon: 139.78 },
  KIX: { lat: 34.43, lon: 135.24 }, SIN: { lat: 1.36, lon: 103.99 }, BKK: { lat: 13.68, lon: 100.75 },
  ICN: { lat: 37.46, lon: 126.44 }, TPE: { lat: 25.08, lon: 121.23 }, PVG: { lat: 31.14, lon: 121.81 },
  PEK: { lat: 40.08, lon: 116.58 }, CAN: { lat: 23.39, lon: 113.30 }, SZX: { lat: 22.64, lon: 113.81 },
  CTU: { lat: 30.58, lon: 103.95 }, KUL: { lat: 2.75, lon: 101.71 }, MNL: { lat: 14.51, lon: 121.02 },
  CGK: { lat: -6.13, lon: 106.66 }, DPS: { lat: -8.75, lon: 115.17 }, SGN: { lat: 10.82, lon: 106.65 },
  HAN: { lat: 21.22, lon: 105.81 }, BOM: { lat: 19.09, lon: 72.87 }, DEL: { lat: 28.57, lon: 77.10 },
  BLR: { lat: 13.20, lon: 77.71 }, RGN: { lat: 16.91, lon: 96.13 }, PNH: { lat: 11.55, lon: 104.84 },
  CMB: { lat: 7.18, lon: 79.88 }, KTM: { lat: 27.70, lon: 85.36 }, DXB: { lat: 25.25, lon: 55.36 },
  AUH: { lat: 24.43, lon: 54.65 }, DOH: { lat: 25.26, lon: 51.57 }, RUH: { lat: 24.96, lon: 46.70 },
  JED: { lat: 21.67, lon: 39.16 }, BAH: { lat: 26.27, lon: 50.63 }, TLV: { lat: 32.01, lon: 34.89 },
  AMM: { lat: 31.72, lon: 35.99 }, LHR: { lat: 51.47, lon: -0.46 }, LGW: { lat: 51.15, lon: -0.19 },
  CDG: { lat: 49.01, lon: 2.55 }, FRA: { lat: 50.03, lon: 8.57 }, MUC: { lat: 48.35, lon: 11.79 },
  AMS: { lat: 52.31, lon: 4.77 }, MAD: { lat: 40.47, lon: -3.56 }, BCN: { lat: 41.30, lon: 2.08 },
  FCO: { lat: 41.80, lon: 12.24 }, MXP: { lat: 45.63, lon: 8.72 }, ZRH: { lat: 47.46, lon: 8.55 },
  VIE: { lat: 48.11, lon: 16.57 }, IST: { lat: 41.26, lon: 28.74 }, ATH: { lat: 37.94, lon: 23.94 },
  LIS: { lat: 38.77, lon: -9.13 }, CPH: { lat: 55.62, lon: 12.66 }, OSL: { lat: 60.19, lon: 11.10 },
  ARN: { lat: 59.65, lon: 17.93 }, HEL: { lat: 60.32, lon: 24.96 }, WAW: { lat: 52.17, lon: 20.97 },
  PRG: { lat: 50.10, lon: 14.26 }, BUD: { lat: 47.44, lon: 19.26 }, DUB: { lat: 53.43, lon: -6.27 },
  EDI: { lat: 55.95, lon: -3.37 }, BRU: { lat: 50.90, lon: 4.48 }, SVO: { lat: 55.97, lon: 37.41 },
  JFK: { lat: 40.64, lon: -73.78 }, EWR: { lat: 40.69, lon: -74.17 }, LAX: { lat: 33.94, lon: -118.41 },
  SFO: { lat: 37.62, lon: -122.38 }, ORD: { lat: 41.98, lon: -87.90 }, MIA: { lat: 25.80, lon: -80.29 },
  ATL: { lat: 33.64, lon: -84.43 }, DFW: { lat: 32.90, lon: -97.04 }, SEA: { lat: 47.45, lon: -122.31 },
  BOS: { lat: 42.37, lon: -71.02 }, DEN: { lat: 39.86, lon: -104.67 }, LAS: { lat: 36.08, lon: -115.15 },
  HNL: { lat: 21.32, lon: -157.92 }, YVR: { lat: 49.19, lon: -123.18 }, YYZ: { lat: 43.68, lon: -79.63 },
  MEX: { lat: 19.44, lon: -99.07 }, CUN: { lat: 21.04, lon: -86.87 }, GRU: { lat: -23.43, lon: -46.47 },
  GIG: { lat: -22.81, lon: -43.25 }, BOG: { lat: 4.70, lon: -74.15 }, SCL: { lat: -33.39, lon: -70.79 },
  EZE: { lat: -34.82, lon: -58.54 }, LIM: { lat: -12.02, lon: -77.11 }, PTY: { lat: 9.07, lon: -79.38 },
  SJO: { lat: 10.00, lon: -84.21 }, SYD: { lat: -33.95, lon: 151.18 }, MEL: { lat: -37.67, lon: 144.84 },
  BNE: { lat: -27.38, lon: 153.12 }, PER: { lat: -31.94, lon: 115.97 }, AKL: { lat: -37.01, lon: 174.79 },
  NAN: { lat: -17.76, lon: 177.44 }, JNB: { lat: -26.14, lon: 28.25 }, CPT: { lat: -33.97, lon: 18.60 },
  CAI: { lat: 30.12, lon: 31.41 }, NBO: { lat: -1.32, lon: 36.93 }, ADD: { lat: 8.98, lon: 38.80 },
  CMN: { lat: 33.37, lon: -7.59 }, LOS: { lat: 6.58, lon: 3.32 }, ACC: { lat: 5.61, lon: -0.17 },
  DAR: { lat: -6.88, lon: 39.20 }, MRU: { lat: -20.43, lon: 57.68 },
};

// Haversine formula: returns distance in km between two airport codes
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// CO2 emission factors (kg CO2 per passenger-km)
const EMISSION_FACTORS = {
  economy: 0.115,
  business: 0.185,
  first: 0.345,
};

/**
 * Calculate CO2 emissions for a flight between two airports.
 * @param {string} originCode - IATA origin code
 * @param {string} destCode - IATA destination code
 * @param {string} cabinClass - economy, business, or first
 * @returns {{ co2_kg: number, distance_km: number } | null}
 */
export function calculateCO2(originCode, destCode, cabinClass = 'economy') {
  const o = AIRPORT_COORDS[originCode.toUpperCase()];
  const d = AIRPORT_COORDS[destCode.toUpperCase()];
  if (!o || !d) return null;

  const distance_km = haversineDistance(o.lat, o.lon, d.lat, d.lon);
  const factor = EMISSION_FACTORS[cabinClass.toLowerCase()] || EMISSION_FACTORS.economy;
  const co2_kg = Math.round(distance_km * factor * 10) / 10;
  return { co2_kg, distance_km: Math.round(distance_km) };
}

/**
 * Get nearby airports within a given radius in km.
 * @param {string} code - IATA airport code
 * @param {number} radiusKm - search radius in km
 * @returns {Array<{ code: string, distance_km: number }>}
 */
export function getNearbyAirports(code, radiusKm = 150) {
  const origin = AIRPORT_COORDS[code.toUpperCase()];
  if (!origin) return [];

  const results = [];
  for (const [airportCode, coords] of Object.entries(AIRPORT_COORDS)) {
    if (airportCode === code.toUpperCase()) continue;
    const dist = haversineDistance(origin.lat, origin.lon, coords.lat, coords.lon);
    if (dist <= radiusKm) {
      results.push({ code: airportCode, distance_km: Math.round(dist) });
    }
  }
  return results.sort((a, b) => a.distance_km - b.distance_km);
}

export { AIRPORT_COORDS };

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;
  if (!clientId || !clientSecret) return null;

  const isProduction = process.env.AMADEUS_ENV === 'production';
  const baseUrl = isProduction
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';

  const res = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  });

  const data = await res.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  }
  throw new Error(`Amadeus auth failed: ${data.error_description || data.error}`);
}

function getBaseUrl() {
  return process.env.AMADEUS_ENV === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';
}

async function amadeusAPI(path, params = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Amadeus not configured. Add AMADEUS_API_KEY and AMADEUS_API_SECRET to .env');

  const qs = new URLSearchParams(params).toString();
  const url = `${getBaseUrl()}${path}${qs ? '?' + qs : ''}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.detail || data.errors[0]?.title || 'Amadeus API error');
  }
  return data;
}

// Status
amadeusRouter.get('/status', (req, res) => {
  const configured = !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);
  res.json({
    configured,
    env: process.env.AMADEUS_ENV || 'test',
    note: configured ? 'Amadeus connected' : 'Add AMADEUS_API_KEY and AMADEUS_API_SECRET to .env. Get free keys at developers.amadeus.com',
  });
});

// Search flights (Flight Offers Search)
amadeusRouter.post('/flights', async (req, res) => {
  try {
    const { origin, destination, date, returnDate, passengers = 1, cabinClass = 'ECONOMY', currency = 'GBP' } = req.body;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Missing origin, destination, or date' });
    }

    const params = {
      originLocationCode: origin.toUpperCase(),
      destinationLocationCode: destination.toUpperCase(),
      departureDate: date,
      adults: passengers,
      currencyCode: currency.toUpperCase(),
      max: 10,
    };
    if (returnDate) params.returnDate = returnDate;
    if (cabinClass && cabinClass !== 'ECONOMY') params.travelClass = cabinClass.toUpperCase();

    const data = await amadeusAPI('/v2/shopping/flight-offers', params);
    const offers = (data.data || []).map(offer => {
      const seg = offer.itineraries[0]?.segments || [];
      const firstSeg = seg[0] || {};
      const lastSeg = seg[seg.length - 1] || {};
      const duration = offer.itineraries[0]?.duration || '';
      // Parse ISO duration PT13H30M → 13h 30m
      const durMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      const durStr = durMatch ? `${durMatch[1] || 0}h ${durMatch[2] || 0}m` : duration;

      return {
        offer_id: offer.id,
        airline: firstSeg.carrierCode || 'Unknown',
        airline_iata: firstSeg.carrierCode || '',
        departure_at: firstSeg.departure?.at || '',
        arrival_at: lastSeg.arrival?.at || '',
        duration: durStr,
        stops: Math.max(0, seg.length - 1),
        currency: offer.price?.currency || currency,
        total_amount: offer.price?.grandTotal || offer.price?.total || '0',
        cabin_class: cabinClass.toLowerCase(),
        bookable: offer.instantTicketingRequired !== true,
        lastTicketDate: offer.lastTicketingDate,
        segments: seg.map(s => {
          const segDur = s.duration || '';
          const segDurMatch = segDur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
          const segDurStr = segDurMatch ? `${segDurMatch[1] || 0}h ${segDurMatch[2] || 0}m` : segDur;
          return {
            carrier: s.carrierCode || '',
            flightNumber: `${s.carrierCode || ''}${s.number || ''}`,
            from: s.departure?.iataCode || '',
            fromTerminal: s.departure?.terminal || '',
            departAt: s.departure?.at || '',
            to: s.arrival?.iataCode || '',
            toTerminal: s.arrival?.terminal || '',
            arriveAt: s.arrival?.at || '',
            duration: segDurStr,
            aircraft: s.aircraft?.code || '',
          };
        }),
      };
    });

    // Add CO2 emissions to each offer
    for (const offer of offers) {
      const co2 = calculateCO2(origin, destination, cabinClass);
      if (co2) {
        offer.co2_kg = co2.co2_kg;
        offer.distance_km = co2.distance_km;
      }
    }

    // Log prices for tracking
    for (const offer of offers.slice(0, 5)) {
      try {
        memoryStore.logFlightPrice(
          origin.toUpperCase(), destination.toUpperCase(), date,
          offer.airline, parseFloat(offer.total_amount),
          offer.currency, offer.cabin_class, offer.duration, offer.stops
        );
      } catch { /* ignore */ }
    }

    res.json({
      flights: offers,
      count: offers.length,
      source: 'amadeus',
      dictionaries: data.dictionaries || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message, flights: [], source: 'amadeus' });
  }
});

// Airport/city search (for autocomplete)
amadeusRouter.get('/airports', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ airports: [] });

    const data = await amadeusAPI('/v1/reference-data/locations', {
      subType: 'AIRPORT,CITY',
      keyword: q,
      'page[limit]': 10,
    });

    const airports = (data.data || []).map(loc => ({
      code: loc.iataCode,
      name: loc.name,
      city: loc.address?.cityName || '',
      country: loc.address?.countryName || '',
      type: loc.subType,
    }));

    res.json({ airports });
  } catch (err) {
    res.status(500).json({ error: err.message, airports: [] });
  }
});

// Flight price analysis (cheapest date in a month)
amadeusRouter.get('/cheapest-dates', async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });

    const data = await amadeusAPI('/v1/shopping/flight-dates', {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
    });

    const dates = (data.data || []).map(d => ({
      date: d.departureDate,
      returnDate: d.returnDate,
      price: d.price?.total,
      currency: d.price?.currency,
    }));

    res.json({ dates, count: dates.length });
  } catch (err) {
    res.status(500).json({ error: err.message, dates: [] });
  }
});

// Exported for brain.js
export async function searchFlightsAmadeus(origin, destination, date, passengers = 1, currency = 'GBP') {
  const token = await getAccessToken();
  if (!token) return null;

  const params = {
    originLocationCode: origin, destinationLocationCode: destination,
    departureDate: date, adults: passengers, currencyCode: currency, max: 5,
  };
  const qs = new URLSearchParams(params).toString();
  const url = `${getBaseUrl()}/v2/shopping/flight-offers?${qs}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  return res.json();
}
