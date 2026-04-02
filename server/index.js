// ===== Travel App Server =====
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';

import { gatewayRouter } from './gateway.js';
import { amadeusRouter, calculateCO2, getNearbyAirports } from './amadeus.js';
import { memoryStore } from './memory.js';
import { settingsStore } from './settings.js';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// ===== Cache JSON data files at startup (Fix #9) =====
const DATA_CACHE = {};
const dataFiles = [
  'city-costs.json', 'visa-requirements.json', 'destination-facts.json',
  'airline-ratings.json', 'baggage-policies.json', 'airport-info.json',
  'holidays.json', 'seasonal-guide.json', 'airport-timezones.json'
];
for (const file of dataFiles) {
  try {
    const filePath = join(__dirname, '..', 'data', file);
    DATA_CACHE[file] = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch { /* file may not exist */ }
}

// ===== Security headers (Fix #7) =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ===== CORS restriction (Fix #5) =====
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://mindforce-eight.vercel.app',
  methods: ['GET', 'POST', 'DELETE']
}));

// ===== Rate limiting (Fix #6, #12) =====
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
const amadeusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Amadeus API requests, please try again later.' }
});
app.use('/api/', globalLimiter);
app.use('/api/amadeus/', amadeusLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

// ===== API Routes =====

// Animoca Agent Gateway (flights, hotels)
app.use('/api/gateway', gatewayRouter);

// Amadeus Flight API
app.use('/api/amadeus', amadeusRouter);

// ===== Fix #1: GET /api/flights proxy to Amadeus POST endpoint =====
app.get('/api/flights', async (req, res) => {
  try {
    const { origin, destination, date, adults, pax, cabin, currency } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });
    // Forward as internal POST to amadeus/flights handler
    const body = {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      date: date || '',
      passengers: parseInt(adults || pax) || 1,
      cabinClass: (cabin || 'economy').toUpperCase(),
      currency: (currency || 'GBP').toUpperCase()
    };
    // Use fetch to call our own Amadeus endpoint internally
    const protocol = req.protocol;
    const host = req.get('host');
    const resp = await fetch(`${protocol}://${host}/api/amadeus/flights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, flights: [] });
  }
});

// ===== Fix #2: GET /api/deals endpoint =====
app.get('/api/deals', (req, res) => {
  try {
    const { origin, currency } = req.query;
    if (!origin) return res.status(400).json({ error: 'Missing origin' });

    // Load airports data for city/country/flag info
    const airportsPath = join(__dirname, '..', 'public', 'airports.js');
    let airportLookup = {};
    try {
      const airportsContent = readFileSync(airportsPath, 'utf8');
      const entries = airportsContent.matchAll(/\{\s*code:\s*'([^']+)',\s*city:\s*'([^']+)',\s*country:\s*'([^']+)',\s*flag:\s*'([^']+)'/g);
      for (const entry of entries) {
        airportLookup[entry[1]] = { city: entry[2], country: entry[3], flag: entry[4] };
      }
    } catch { /* not critical */ }

    const cached = memoryStore.getExploreFromOrigin(origin.toUpperCase());
    const deals = cached.map(row => {
      const info = airportLookup[row.code] || {};
      const price = row.price;
      let deal = 'fair';
      if (price < 200) deal = 'great';
      else if (price > 500) deal = 'high';
      return {
        origin: origin.toUpperCase(),
        destination: row.code,
        code: row.code,
        city: info.city || row.code,
        country: info.country || '',
        flag: info.flag || '',
        price: price,
        currency: row.currency || currency || 'GBP',
        cachedAt: row.cached_at,
        deal: deal
      };
    });

    res.json({ deals, count: deals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Travel: watched routes and price history
app.get('/api/travel/routes', (req, res) => {
  res.json({ routes: memoryStore.getWatchedRoutes() });
});
app.post('/api/travel/routes', (req, res) => {
  const { origin, destination, travelDate, label } = req.body;
  if (!origin || !destination || !travelDate) return res.status(400).json({ error: 'Missing fields' });
  memoryStore.addWatchedRoute(origin, destination, travelDate, label);
  res.json({ ok: true });
});
app.delete('/api/travel/routes/:id', (req, res) => {
  memoryStore.removeWatchedRoute(req.params.id);
  res.json({ ok: true });
});
app.get('/api/travel/prices', (req, res) => {
  const { origin, destination, limit } = req.query;
  if (origin && destination) {
    res.json({ prices: memoryStore.getFlightPriceHistory(origin, destination, parseInt(limit) || 50) });
  } else {
    res.json({ prices: memoryStore.getAllPriceHistory(parseInt(limit) || 100) });
  }
});

// Preferences (Fix #8: whitelist settings keys)
const ALLOWED_SETTINGS_KEYS = new Set(['name', 'theme', 'voiceLang', 'briefTime', 'origin', 'currency', 'passport']);
app.get('/api/settings', (req, res) => res.json(settingsStore.get()));
app.post('/api/settings', (req, res) => {
  const filtered = {};
  for (const key of Object.keys(req.body)) {
    if (ALLOWED_SETTINGS_KEYS.has(key)) filtered[key] = req.body[key];
  }
  settingsStore.update(filtered);
  res.json({ ok: true });
});

// ===== Route Analysis =====
// Returns percentile analysis of cached price history for a route
app.get('/api/route-analysis', (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });

    const analysis = memoryStore.getRouteAnalysis(origin, destination);
    if (!analysis.count) return res.json({ ...analysis, verdict: null, percentile: null });

    // Determine verdict and percentile relative to history
    const { p25, p75, median, min } = analysis;
    const latestPrice = analysis.prices[analysis.prices.length - 1] || median;
    let verdict, percentile;

    if (latestPrice <= p25) {
      verdict = 'great';
      percentile = 25;
    } else if (latestPrice <= median) {
      verdict = 'good';
      percentile = 50;
    } else if (latestPrice <= p75) {
      verdict = 'above_average';
      percentile = 75;
    } else {
      verdict = 'expensive';
      percentile = 90;
    }

    res.json({ ...analysis, verdict, percentile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Explore (cached cheapest prices from origin) =====
// Returns cached cheapest prices to popular destinations from a given origin
app.get('/api/explore', (req, res) => {
  try {
    const { origin } = req.query;
    if (!origin) return res.status(400).json({ error: 'Missing origin' });

    // Load airports data for city/country/flag info
    const airportsPath = join(__dirname, '..', 'public', 'airports.js');
    let airportLookup = {};
    try {
      const airportsContent = readFileSync(airportsPath, 'utf8');
      // Parse the AIRPORTS array from the JS file
      const match = airportsContent.match(/const AIRPORTS = \[([\s\S]*?)\];/);
      if (match) {
        // Extract airport objects using a simple approach
        const entries = airportsContent.matchAll(/\{\s*code:\s*'([^']+)',\s*city:\s*'([^']+)',\s*country:\s*'([^']+)',\s*flag:\s*'([^']+)'/g);
        for (const entry of entries) {
          airportLookup[entry[1]] = { city: entry[2], country: entry[3], flag: entry[4] };
        }
      }
    } catch { /* airports file not critical */ }

    const cached = memoryStore.getExploreFromOrigin(origin);
    const destinations = cached.map(row => ({
      code: row.code,
      city: airportLookup[row.code]?.city || row.code,
      country: airportLookup[row.code]?.country || '',
      flag: airportLookup[row.code]?.flag || '',
      price: row.price,
      currency: row.currency,
      cachedAt: row.cached_at,
    }));

    res.json({ destinations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Price Alerts =====
// Create a new price alert
app.post('/api/alerts', (req, res) => {
  try {
    const { origin, destination, targetPrice, currency } = req.body;
    if (!origin || !destination || !targetPrice) {
      return res.status(400).json({ error: 'Missing origin, destination, or targetPrice' });
    }
    const id = memoryStore.addAlert(origin, destination, targetPrice, currency || 'GBP');
    memoryStore.logAction('alert_created', { origin, destination, targetPrice, currency });
    res.json({ ok: true, id: Number(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all active alerts
app.get('/api/alerts', (req, res) => {
  try {
    res.json({ alerts: memoryStore.getActiveAlerts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get alerts triggered in last 24 hours
app.get('/api/alerts/triggered', (req, res) => {
  try {
    res.json({ alerts: memoryStore.getTriggeredAlerts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deactivate an alert
app.delete('/api/alerts/:id', (req, res) => {
  try {
    memoryStore.deactivateAlert(req.params.id);
    memoryStore.logAction('alert_deactivated', { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Route Intelligence =====
// Returns full route intelligence aggregation from price history
app.get('/api/route-intel', (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });
    const intel = memoryStore.getRouteIntel(origin, destination);
    res.json(intel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Seasonal Heatmap =====
// Returns 12x31 matrix of average prices by month and day
app.get('/api/seasonal-heatmap', (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });

    const data = memoryStore.getSeasonalHeatmap(origin, destination);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Build 12x31 matrix (month index 0-11, day index 0-30)
    const matrix = Array.from({ length: 12 }, () => Array(31).fill(null));
    for (const row of data) {
      if (row.month >= 1 && row.month <= 12 && row.day >= 1 && row.day <= 31) {
        matrix[row.month - 1][row.day - 1] = row.avg_price;
      }
    }

    res.json({ matrix, months });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Price Grid =====
// Returns a grid of cached prices for departure/return date combinations
app.get('/api/price-grid', (req, res) => {
  try {
    const { origin, destination, startDate, days = 7, maxTrip = 7 } = req.query;
    if (!origin || !destination || !startDate) {
      return res.status(400).json({ error: 'Missing origin, destination, or startDate' });
    }

    const numDays = parseInt(days);
    const numMaxTrip = parseInt(maxTrip);

    // Generate departure dates
    const depDates = [];
    const baseDate = new Date(startDate);
    for (let i = 0; i < numDays; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      depDates.push(d.toISOString().split('T')[0]);
    }

    // Generate return dates (each dep date + 1..maxTrip days)
    const retDates = [];
    const lastDepDate = new Date(depDates[depDates.length - 1]);
    for (let i = 1; i <= numMaxTrip; i++) {
      const d = new Date(lastDepDate);
      d.setDate(d.getDate() + i);
      retDates.push(d.toISOString().split('T')[0]);
    }

    // Query all prices in the date range
    const firstDate = depDates[0];
    const lastDate = retDates[retDates.length - 1];
    const allPrices = memoryStore.getPriceGrid(origin, destination, firstDate, lastDate);

    // Build price lookup by date
    const priceByDate = {};
    for (const row of allPrices) {
      if (!priceByDate[row.date] || row.price < priceByDate[row.date].price) {
        priceByDate[row.date] = { price: row.price, currency: row.currency };
      }
    }

    // Build grid: rows = dep dates, cols = return dates
    const grid = depDates.map(dep => {
      return retDates.map(ret => {
        // Simple: use cached outbound price for this dep date
        const outbound = priceByDate[dep];
        return outbound ? { price: outbound.price, currency: outbound.currency } : null;
      });
    });

    res.json({ grid, depDates, retDates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== City Costs (uses cached data, P2 Fix #20: filter by ?city= param) =====
app.get('/api/city-costs', (req, res) => {
  try {
    const data = DATA_CACHE['city-costs.json'];
    if (!data) return res.status(404).json({ error: 'City costs data not available' });
    const { city } = req.query;
    if (city) {
      // Case-insensitive city lookup
      let costs = data[city];
      if (!costs) {
        const key = Object.keys(data).find(k => k.toLowerCase() === city.toLowerCase());
        costs = key ? data[key] : null;
      }
      if (!costs) return res.status(404).json({ error: 'City not found' });
      return res.json({ city, ...costs });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Visa Requirements (uses cached data) =====
app.get('/api/visa', (req, res) => {
  try {
    const { passport, destination } = req.query;
    if (!passport || !destination) return res.status(400).json({ error: 'Missing passport or destination' });
    const data = DATA_CACHE['visa-requirements.json'] || {};
    const p = passport.toUpperCase();
    const d = destination.toUpperCase();
    if (!data[p]) return res.json({ passport: p, destination: d, info: null, note: 'Passport nationality not found' });
    const info = data[p][d] || null;
    res.json({ passport: p, destination: d, info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Destination Facts (uses cached data) =====
app.get('/api/destination-facts/:city', (req, res) => {
  try {
    const data = DATA_CACHE['destination-facts.json'] || {};
    const city = req.params.city;
    let facts = data[city];
    if (!facts) {
      const key = Object.keys(data).find(k => k.toLowerCase() === city.toLowerCase());
      facts = key ? data[key] : null;
    }
    if (!facts) return res.status(404).json({ error: 'City not found' });
    res.json({ city: req.params.city, facts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Airline Ratings (uses cached data) =====
app.get('/api/airline-ratings/:iata', (req, res) => {
  try {
    const data = DATA_CACHE['airline-ratings.json'] || {};
    const iata = req.params.iata.toUpperCase();
    const rating = data[iata];
    if (!rating) return res.status(404).json({ error: 'Airline not found' });
    res.json({ iata, ...rating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/airline-ratings', (req, res) => {
  try {
    const data = DATA_CACHE['airline-ratings.json'] || {};
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Baggage Policies (uses cached data) =====
app.get('/api/baggage/:iata', (req, res) => {
  try {
    const data = DATA_CACHE['baggage-policies.json'] || {};
    const iata = req.params.iata.toUpperCase();
    const policy = data[iata];
    if (!policy) return res.status(404).json({ error: 'Airline not found' });
    res.json({ iata, ...policy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Airport Info (uses cached data) =====
app.get('/api/airport-info/:iata', (req, res) => {
  try {
    const data = DATA_CACHE['airport-info.json'] || {};
    const iata = req.params.iata.toUpperCase();
    const info = data[iata];
    if (!info) return res.status(404).json({ error: 'Airport not found' });
    res.json({ iata, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Holidays (uses cached data) =====
app.get('/api/holidays', (req, res) => {
  try {
    const data = DATA_CACHE['holidays.json'] || [];
    let filtered = data;
    const { country, month } = req.query;
    if (country) {
      const c = country.toUpperCase();
      filtered = filtered.filter(h => h.countries.includes(c));
    }
    if (month) {
      const m = parseInt(month);
      filtered = filtered.filter(h => {
        const hMonth = parseInt(h.date.split('-')[1]);
        return hMonth === m;
      });
    }
    res.json({ holidays: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Seasonal Guide (uses cached data) =====
app.get('/api/seasonal-guide/:city', (req, res) => {
  try {
    const data = DATA_CACHE['seasonal-guide.json'] || {};
    const city = req.params.city;
    let guide = data[city];
    if (!guide) {
      const key = Object.keys(data).find(k => k.toLowerCase() === city.toLowerCase());
      guide = key ? data[key] : null;
    }
    if (!guide) return res.status(404).json({ error: 'City not found' });
    res.json({ city: req.params.city, ...guide });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Timezone Lookup (uses cached data) =====
app.get('/api/timezone/:iata', (req, res) => {
  try {
    const data = DATA_CACHE['airport-timezones.json'] || {};
    const iata = req.params.iata.toUpperCase();
    const timezone = data[iata];
    if (!timezone) return res.status(404).json({ error: 'Airport not found' });
    res.json({ iata, timezone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Price Prediction =====
app.get('/api/price-prediction', (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });
    const prediction = memoryStore.getPricePrediction(origin, destination);
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Shareable Trip/Search (Fix #4: return { id, url }) =====
app.post('/api/share', (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type || !data) return res.status(400).json({ error: 'Missing type or data' });
    const id = crypto.randomBytes(6).toString('hex');
    memoryStore.insertSharedLink(id, type, data);
    res.json({ id, url: `/share/${id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/share/:id', (req, res) => {
  try {
    const link = memoryStore.getSharedLink(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    res.json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Recent Searches (Fix #3: accept both price and cheapestPrice) =====
app.post('/api/recent-searches', (req, res) => {
  try {
    const { origin, destination, date, cheapestPrice, price, currency } = req.body;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });
    const resolvedPrice = cheapestPrice !== undefined ? cheapestPrice : price;
    memoryStore.insertRecentSearch(origin, destination, date, resolvedPrice, currency);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent-searches', (req, res) => {
  try {
    res.json({ searches: memoryStore.getRecentSearches() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Nearby Airports =====
app.get('/api/nearby-airports', (req, res) => {
  try {
    const { code, radius } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const r = parseInt(radius) || 150;
    const airports = getNearbyAirports(code, r);
    res.json({ code: code.toUpperCase(), radius: r, airports, count: airports.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CO2 Calculator (standalone endpoint) =====
app.get('/api/co2', (req, res) => {
  try {
    const { origin, destination, cabin } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });
    const result = calculateCO2(origin, destination, cabin || 'economy');
    if (!result) return res.status(404).json({ error: 'Airport code not found' });
    res.json({ origin: origin.toUpperCase(), destination: destination.toUpperCase(), cabin: (cabin || 'economy').toLowerCase(), ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0',
    uptime: process.uptime(),
    integrations: {
      amadeus: !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET),
      gateway: true, // Always available (no auth needed)
    }
  });
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// ===== Alert Cron Job =====
// Runs every 6 hours to check active alerts against cached prices
cron.schedule('0 */6 * * *', () => {
  try {
    const alerts = memoryStore.getActiveAlerts();
    let checkedCount = 0;
    let triggeredCount = 0;

    for (const alert of alerts) {
      // Check if we have a recent cached price for this route
      const recent = memoryStore.getCheapestRecentPrice(alert.origin, alert.destination);

      if (recent && recent.price !== null && recent.price <= alert.target_price) {
        // Price is at or below target - trigger the alert
        memoryStore.triggerAlert(alert.id, recent.price);
        triggeredCount++;
      }

      // Update last_checked_at regardless
      memoryStore.logAction('alert_check', {
        alertId: alert.id,
        origin: alert.origin,
        destination: alert.destination,
        targetPrice: alert.target_price,
        cachedPrice: recent?.price || null,
        triggered: recent?.price !== null && recent?.price <= alert.target_price,
      });
      checkedCount++;
    }

    if (checkedCount > 0) {
      console.log(`[Cron] Alert check: ${checkedCount} alerts checked, ${triggeredCount} triggered`);
    }
  } catch (err) {
    console.error('[Cron] Alert check failed:', err.message);
  }
});

// Export for Vercel serverless
export default app;

// Start (only when running directly, not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║        MindFlight v2.0.0              ║');
    console.log(`  ║  http://localhost:${PORT}                  ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    console.log(`  Amadeus API: ${process.env.AMADEUS_API_KEY ? '✅' : '❌'}`);
    console.log(`  Gateway:     ✅`);
    console.log('');
  });
}
