// ===== Amadeus Flight API Integration =====
// Free tier: 2,000 calls/month, real-time airline prices
// Signup: https://developers.amadeus.com
import { Router } from 'express';
import { memoryStore } from './memory.js';

export const amadeusRouter = Router();

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
