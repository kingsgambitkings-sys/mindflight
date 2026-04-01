// ===== Travel Data Store (SQLite) =====
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'mindforce.db');

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flight_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    date TEXT NOT NULL,
    airline TEXT,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'GBP',
    cabin_class TEXT DEFAULT 'economy',
    duration TEXT,
    stops INTEGER DEFAULT 0,
    checked_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watched_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    travel_date TEXT NOT NULL,
    label TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS actions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'completed',
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    target_price REAL NOT NULL,
    currency TEXT DEFAULT 'GBP',
    is_active INTEGER DEFAULT 1,
    triggered_at TEXT,
    triggered_price REAL,
    created_at TEXT DEFAULT (datetime('now')),
    last_checked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shared_links (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recent_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    date TEXT,
    cheapest_price REAL,
    currency TEXT DEFAULT 'GBP',
    searched_at TEXT DEFAULT (datetime('now'))
  );
`);

const stmts = {
  getMemory: db.prepare('SELECT key, value, category, updated_at FROM memory ORDER BY updated_at DESC'),
  setMemory: db.prepare(`INSERT INTO memory (key, value, category, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`),

  logFlightPrice: db.prepare('INSERT INTO flight_prices (route, origin, destination, date, airline, price, currency, cabin_class, duration, stops) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getFlightPricesByRoute: db.prepare('SELECT * FROM flight_prices WHERE origin = ? AND destination = ? ORDER BY checked_at DESC LIMIT ?'),
  getAllPriceHistory: db.prepare('SELECT * FROM flight_prices ORDER BY checked_at DESC LIMIT ?'),

  addWatchedRoute: db.prepare('INSERT INTO watched_routes (origin, destination, travel_date, label) VALUES (?, ?, ?, ?)'),
  getWatchedRoutes: db.prepare('SELECT * FROM watched_routes WHERE active = 1 ORDER BY created_at DESC'),
  removeWatchedRoute: db.prepare('UPDATE watched_routes SET active = 0 WHERE id = ?'),

  logAction: db.prepare('INSERT INTO actions_log (action_type, details, status) VALUES (?, ?, ?)'),

  // Price alerts
  addAlert: db.prepare('INSERT INTO price_alerts (origin, destination, target_price, currency) VALUES (?, ?, ?, ?)'),
  getActiveAlerts: db.prepare('SELECT * FROM price_alerts WHERE is_active = 1 ORDER BY created_at DESC'),
  getTriggeredAlerts: db.prepare(`SELECT * FROM price_alerts WHERE triggered_at IS NOT NULL AND triggered_at >= datetime('now', '-24 hours') ORDER BY triggered_at DESC`),
  triggerAlert: db.prepare(`UPDATE price_alerts SET triggered_at = datetime('now'), triggered_price = ?, is_active = 0 WHERE id = ?`),
  deactivateAlert: db.prepare('UPDATE price_alerts SET is_active = 0 WHERE id = ?'),
  updateAlertChecked: db.prepare(`UPDATE price_alerts SET last_checked_at = datetime('now') WHERE id = ?`),

  // Route analysis: percentile stats from flight_prices
  getRoutePrices: db.prepare('SELECT price FROM flight_prices WHERE origin = ? AND destination = ? ORDER BY price ASC'),

  // Seasonal data: average price by month
  getSeasonalData: db.prepare(`
    SELECT
      CAST(strftime('%m', date) AS INTEGER) AS month,
      ROUND(AVG(price), 2) AS avg_price,
      MIN(price) AS min_price,
      MAX(price) AS max_price,
      COUNT(*) AS count
    FROM flight_prices
    WHERE origin = ? AND destination = ?
    GROUP BY strftime('%m', date)
    ORDER BY month
  `),

  // Route intel: by day of week
  getRouteByDayOfWeek: db.prepare(`
    SELECT
      CAST(strftime('%w', date) AS INTEGER) AS day,
      ROUND(AVG(price), 2) AS avg_price,
      COUNT(*) AS count
    FROM flight_prices
    WHERE origin = ? AND destination = ?
    GROUP BY strftime('%w', date)
    ORDER BY day
  `),

  // Route intel: by airline
  getRouteByAirline: db.prepare(`
    SELECT
      airline,
      ROUND(AVG(price), 2) AS avg_price,
      MIN(price) AS min_price,
      COUNT(*) AS count
    FROM flight_prices
    WHERE origin = ? AND destination = ? AND airline IS NOT NULL AND airline != ''
    GROUP BY airline
    ORDER BY avg_price ASC
  `),

  // Route intel: price trend over time (averaged by date checked)
  getRouteTrend: db.prepare(`
    SELECT
      DATE(checked_at) AS date,
      ROUND(AVG(price), 2) AS avg_price,
      COUNT(*) AS count
    FROM flight_prices
    WHERE origin = ? AND destination = ?
    GROUP BY DATE(checked_at)
    ORDER BY date ASC
  `),

  // Explore: cheapest cached price per destination from a given origin (last 24h)
  getExploreFromOrigin: db.prepare(`
    SELECT
      destination AS code,
      MIN(price) AS price,
      currency,
      MAX(checked_at) AS cached_at
    FROM flight_prices
    WHERE origin = ? AND checked_at >= datetime('now', '-24 hours')
    GROUP BY destination
    ORDER BY price ASC
  `),

  // Price grid: cached prices for date combinations
  getPriceGrid: db.prepare(`
    SELECT date, price, currency
    FROM flight_prices
    WHERE origin = ? AND destination = ? AND date >= ? AND date <= ?
    ORDER BY date ASC, price ASC
  `),

  // Seasonal heatmap: avg price by month and day-of-month
  getSeasonalHeatmap: db.prepare(`
    SELECT
      CAST(strftime('%m', date) AS INTEGER) AS month,
      CAST(strftime('%d', date) AS INTEGER) AS day,
      ROUND(AVG(price), 2) AS avg_price
    FROM flight_prices
    WHERE origin = ? AND destination = ?
    GROUP BY strftime('%m', date), strftime('%d', date)
    ORDER BY month, day
  `),

  // Get cheapest recent price for a route (last 24h, for alert checking)
  getCheapestRecentPrice: db.prepare(`
    SELECT MIN(price) AS price, currency
    FROM flight_prices
    WHERE origin = ? AND destination = ? AND checked_at >= datetime('now', '-24 hours')
  `),

  // Price trend for last N days
  getPriceTrend: db.prepare(`
    SELECT
      DATE(checked_at) AS date,
      ROUND(AVG(price), 2) AS avg_price,
      MIN(price) AS min_price,
      MAX(price) AS max_price,
      COUNT(*) AS count
    FROM flight_prices
    WHERE origin = ? AND destination = ? AND checked_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(checked_at)
    ORDER BY date ASC
  `),

  // Shared links
  insertSharedLink: db.prepare('INSERT INTO shared_links (id, type, data) VALUES (?, ?, ?)'),
  getSharedLink: db.prepare('SELECT * FROM shared_links WHERE id = ?'),

  // Recent searches
  insertRecentSearch: db.prepare('INSERT INTO recent_searches (origin, destination, date, cheapest_price, currency) VALUES (?, ?, ?, ?, ?)'),
  getRecentSearches: db.prepare('SELECT * FROM recent_searches ORDER BY searched_at DESC LIMIT 20'),
};

export const memoryStore = {
  get(key) { const row = db.prepare('SELECT value FROM memory WHERE key = ?').get(key); return row ? row.value : null; },
  set(key, value, category = 'general') { stmts.setMemory.run(key, value, category); },

  logFlightPrice(origin, destination, date, airline, price, currency, cabinClass, duration, stops) {
    stmts.logFlightPrice.run(`${origin}-${destination}`, origin, destination, date, airline, price, currency, cabinClass, duration, stops);
  },
  getFlightPriceHistory(origin, destination, limit = 50) { return stmts.getFlightPricesByRoute.all(origin, destination, limit); },
  getAllPriceHistory(limit = 100) { return stmts.getAllPriceHistory.all(limit); },

  addWatchedRoute(origin, destination, travelDate, label) { stmts.addWatchedRoute.run(origin, destination, travelDate, label || `${origin} → ${destination}`); },
  getWatchedRoutes() { return stmts.getWatchedRoutes.all(); },
  removeWatchedRoute(id) { stmts.removeWatchedRoute.run(id); },

  logAction(type, details, status = 'completed') { stmts.logAction.run(type, JSON.stringify(details), status); },

  // === Price Alerts ===
  addAlert(origin, destination, targetPrice, currency = 'GBP') {
    const result = stmts.addAlert.run(origin.toUpperCase(), destination.toUpperCase(), targetPrice, currency.toUpperCase());
    return result.lastInsertRowid;
  },
  getActiveAlerts() { return stmts.getActiveAlerts.all(); },
  getTriggeredAlerts() { return stmts.getTriggeredAlerts.all(); },
  triggerAlert(id, price) { stmts.triggerAlert.run(price, id); },
  deactivateAlert(id) { stmts.deactivateAlert.run(id); },

  // === Route Analysis (percentile stats) ===
  getRouteAnalysis(origin, destination) {
    const rows = stmts.getRoutePrices.all(origin.toUpperCase(), destination.toUpperCase());
    if (!rows.length) return { median: null, p25: null, p75: null, min: null, max: null, count: 0, prices: [] };

    const prices = rows.map(r => r.price);
    const n = prices.length;

    // Percentile helper (linear interpolation)
    const percentile = (arr, p) => {
      const idx = (p / 100) * (arr.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return arr[lower];
      return arr[lower] + (arr[upper] - arr[lower]) * (idx - lower);
    };

    return {
      median: Math.round(percentile(prices, 50) * 100) / 100,
      p25: Math.round(percentile(prices, 25) * 100) / 100,
      p75: Math.round(percentile(prices, 75) * 100) / 100,
      min: prices[0],
      max: prices[n - 1],
      count: n,
      prices,
    };
  },

  // === Seasonal Data (avg by month) ===
  getSeasonalData(origin, destination) {
    return stmts.getSeasonalData.all(origin.toUpperCase(), destination.toUpperCase());
  },

  // === Route Intelligence (full aggregation) ===
  getRouteIntel(origin, destination) {
    const o = origin.toUpperCase();
    const d = destination.toUpperCase();
    const byMonth = stmts.getSeasonalData.all(o, d);
    const byDayOfWeek = stmts.getRouteByDayOfWeek.all(o, d);
    const byAirline = stmts.getRouteByAirline.all(o, d);
    const trend = stmts.getRouteTrend.all(o, d);
    const totalCount = byMonth.reduce((sum, m) => sum + m.count, 0);
    return { byMonth, byDayOfWeek, byAirline, trend, count: totalCount };
  },

  // === Explore (cached cheapest from origin) ===
  getExploreFromOrigin(origin) {
    return stmts.getExploreFromOrigin.all(origin.toUpperCase());
  },

  // === Seasonal Heatmap ===
  getSeasonalHeatmap(origin, destination) {
    return stmts.getSeasonalHeatmap.all(origin.toUpperCase(), destination.toUpperCase());
  },

  // === Price Grid (dep/return date combos) ===
  getPriceGrid(origin, destination, startDate, endDate) {
    return stmts.getPriceGrid.all(origin.toUpperCase(), destination.toUpperCase(), startDate, endDate);
  },

  // === Cheapest recent price for alert checking ===
  getCheapestRecentPrice(origin, destination) {
    return stmts.getCheapestRecentPrice.get(origin.toUpperCase(), destination.toUpperCase());
  },

  // === Price Trend (last N days) ===
  getPriceTrend(origin, destination, days = 30) {
    return stmts.getPriceTrend.all(origin.toUpperCase(), destination.toUpperCase(), days);
  },

  // === Price Prediction ===
  getPricePrediction(origin, destination) {
    const o = origin.toUpperCase();
    const d = destination.toUpperCase();
    const trend = stmts.getPriceTrend.all(o, d, 30);
    if (!trend.length) {
      return { direction: 'stable', confidence: 'low', avgPrice: null, minPrice: null, maxPrice: null, dataPoints: 0, changePercent: 0 };
    }

    const prices = trend.map(r => r.avg_price);
    const n = prices.length;
    const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / n * 100) / 100;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Simple linear regression for trend direction
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += prices[i]; sumXY += i * prices[i]; sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    const changePercent = avgY > 0 ? Math.round((slope * n / avgY) * 10000) / 100 : 0;

    let direction, confidence;
    const absChange = Math.abs(changePercent);

    if (absChange < 2) { direction = 'stable'; }
    else if (slope > 0) { direction = 'rising'; }
    else { direction = 'falling'; }

    if (n >= 14 && absChange > 5) { confidence = 'high'; }
    else if (n >= 7 && absChange > 2) { confidence = 'medium'; }
    else { confidence = 'low'; }

    return { direction, confidence, avgPrice, minPrice, maxPrice, dataPoints: n, changePercent };
  },

  // === Shared Links ===
  insertSharedLink(id, type, data) {
    stmts.insertSharedLink.run(id, type, JSON.stringify(data));
  },
  getSharedLink(id) {
    const row = stmts.getSharedLink.get(id);
    if (!row) return null;
    return { id: row.id, type: row.type, data: JSON.parse(row.data), created_at: row.created_at };
  },

  // === Recent Searches ===
  insertRecentSearch(origin, destination, date, cheapestPrice, currency) {
    stmts.insertRecentSearch.run(origin.toUpperCase(), destination.toUpperCase(), date, cheapestPrice, currency || 'GBP');
  },
  getRecentSearches() {
    return stmts.getRecentSearches.all();
  },
};
