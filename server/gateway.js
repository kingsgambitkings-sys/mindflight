// ===== Animoca Agent Gateway Integration =====
// Real working connection to the Ethoswarm Agent Gateway
import { Router } from 'express';
import { memoryStore } from './memory.js';

export const gatewayRouter = Router();

const GATEWAY_URL = 'https://agent-router.replit.app/agent-gateway';

async function callGateway(skillId, goal, params) {
  const res = await fetch(`${GATEWAY_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: skillId,
      goal,
      caller_id: 'mindforce_app',
      params,
    }),
  });
  return res.json();
}

// List available skills
gatewayRouter.get('/skills', async (req, res) => {
  try {
    const response = await fetch(`${GATEWAY_URL}/skills`);
    const skills = await response.json();
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search flights
gatewayRouter.post('/flights', async (req, res) => {
  try {
    const { origin, destination, date, passengers = 1, cabinClass = 'economy' } = req.body;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'Missing origin, destination, or date' });
    }

    const result = await callGateway('TravelBooking_v1', `Search flights from ${origin} to ${destination}`, {
      action: 'search',
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_date: date,
      passengers: parseInt(passengers),
      cabin_class: cabinClass,
    });

    if (result.status === 'SUCCESS') {
      const offers = result.details?.offers || [];
      // Log prices for tracking
      for (const offer of offers) {
        try {
          memoryStore.logFlightPrice(
            req.body.origin.toUpperCase(), req.body.destination.toUpperCase(),
            req.body.date, offer.airline,
            parseFloat(offer.total_amount), offer.currency,
            offer.cabin_class, offer.duration, offer.stops
          );
        } catch { /* ignore logging errors */ }
      }
      res.json({ flights: offers, summary: result.summary, count: offers.length });
    } else {
      res.json({ flights: [], error: result.error || result.summary, count: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, flights: [] });
  }
});

// Search hotels
gatewayRouter.post('/hotels', async (req, res) => {
  try {
    const { city, checkIn, checkOut, guests = 1 } = req.body;
    if (!city || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing city, checkIn, or checkOut' });
    }

    const result = await callGateway('HotelBooking_v1', `Search hotels in ${city}`, {
      action: 'search',
      city,
      check_in: checkIn,
      check_out: checkOut,
      guests: parseInt(guests),
    });

    if (result.status === 'SUCCESS') {
      res.json({
        hotels: result.details?.offers || [],
        summary: result.summary,
      });
    } else {
      res.json({ hotels: [], error: result.error || result.summary });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, hotels: [] });
  }
});

// Generic gateway call
gatewayRouter.post('/call', async (req, res) => {
  try {
    const { skill_id, goal, params } = req.body;
    if (!skill_id) return res.status(400).json({ error: 'Missing skill_id' });
    const result = await callGateway(skill_id, goal || 'Execute', params || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exported for use in brain.js
export async function searchFlights(origin, destination, date, passengers = 1) {
  return callGateway('TravelBooking_v1', `Search flights from ${origin} to ${destination}`, {
    action: 'search',
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    departure_date: date,
    passengers,
  });
}

export async function searchHotels(city, checkIn, checkOut, guests = 1) {
  return callGateway('HotelBooking_v1', `Search hotels in ${city}`, {
    action: 'search',
    city,
    check_in: checkIn,
    check_out: checkOut,
    guests,
  });
}
