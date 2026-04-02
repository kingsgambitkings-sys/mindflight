/* ============================================================
   MindFlight v2 — App Logic (20 Features)
   ============================================================ */

(function() {
  'use strict';

  // ===== GLOBAL STATE =====
  const State = {
    origin: localStorage.getItem('mf_origin') || 'HKG',
    currency: localStorage.getItem('mf_currency') || 'GBP',
    theme: localStorage.getItem('mf_theme') || 'dark',
    passportNationality: localStorage.getItem('mf_passport') || 'HK',
    flights: [],
    filteredFlights: [],
    currentSort: 'best',
    activeFilters: new Set(),
    compareSet: new Set(),
    airlineRatingsCache: null,
    apiCaches: {},
    searchTemplates: JSON.parse(localStorage.getItem('mf_search_templates') || '[]'),
    trips: JSON.parse(localStorage.getItem('mf_trips') || '[]'),
    watchedRoutes: JSON.parse(localStorage.getItem('mf_watched') || '[]'),
    alerts: JSON.parse(localStorage.getItem('mf_alerts') || '[]'),
    recentSearches: [],
    currentDiscoveryCity: null,
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
    nearbyEnabled: false,
    priceHistory: []
  };

  // ===== CURRENCY SYMBOLS =====
  const CURRENCY_SYMBOLS = {
    GBP: '\u00a3', USD: '$', EUR: '\u20ac', HKD: 'HK$',
    SGD: 'S$', JPY: '\u00a5', THB: '\u0e3f', AUD: 'A$',
    CNY: '\u00a5', KRW: '\u20a9'
  };

  function currSym() {
    return CURRENCY_SYMBOLS[State.currency] || State.currency;
  }

  // ===== UTILITY FUNCTIONS =====
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // Fix #13: XSS prevention — escape HTML in dynamic content
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(msg, type) {
    type = type || 'info';
    var container = $('#toastContainer');
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 4200);
  }

  function formatDuration(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + 'h ' + (m > 0 ? m + 'm' : '');
  }

  function formatPrice(amount) {
    return currSym() + Math.round(amount);
  }

  function timeAgo(dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function getAirportByCode(code) {
    if (typeof AIRPORTS === 'undefined') return null;
    return AIRPORTS.find(function(a) { return a.code === code; }) || null;
  }

  async function apiFetch(url, options) {
    try {
      var resp = await fetch(url, options);
      if (!resp.ok) throw new Error('API error: ' + resp.status);
      return await resp.json();
    } catch(e) {
      console.warn('API fetch failed:', url, e.message);
      return null;
    }
  }

  async function cachedFetch(key, url) {
    if (State.apiCaches[key]) return State.apiCaches[key];
    var data = await apiFetch(url);
    if (data) State.apiCaches[key] = data;
    return data;
  }

  // ===== THEME =====
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    State.theme = theme;
    localStorage.setItem('mf_theme', theme);
  }

  // ===== AIRPORT AUTOCOMPLETE =====
  function initAutocomplete(inputEl, dropdownEl, hiddenEl) {
    if (!inputEl || !dropdownEl) return;
    var airports = typeof AIRPORTS !== 'undefined' ? AIRPORTS : [];

    inputEl.addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      if (q.length < 1) { dropdownEl.classList.remove('open'); return; }
      var matches = airports.filter(function(a) {
        return a.code.toLowerCase().indexOf(q) !== -1 ||
               a.city.toLowerCase().indexOf(q) !== -1 ||
               a.country.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);
      if (matches.length === 0) { dropdownEl.classList.remove('open'); return; }
      dropdownEl.innerHTML = matches.map(function(a) {
        return '<div class="airport-option" data-code="' + escapeHtml(a.code) + '" data-city="' + escapeHtml(a.city) + '">' +
          '<span class="airport-option-code">' + escapeHtml(a.code) + '</span>' +
          '<span class="airport-option-city">' + escapeHtml(a.city) + '</span>' +
          '<span class="airport-option-country">' + escapeHtml(a.country) + '</span>' +
        '</div>';
      }).join('');
      dropdownEl.classList.add('open');
    });

    dropdownEl.addEventListener('click', function(e) {
      var opt = e.target.closest('.airport-option');
      if (!opt) return;
      var code = opt.dataset.code;
      var city = opt.dataset.city;
      inputEl.value = city + ' (' + code + ')';
      if (hiddenEl) hiddenEl.value = code;
      dropdownEl.classList.remove('open');
    });

    document.addEventListener('click', function(e) {
      if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        dropdownEl.classList.remove('open');
      }
    });
  }

  // ===== FEATURE 1: CO2 EMISSIONS BADGE =====
  function getCO2Class(co2) {
    if (co2 < 100) return 'co2-green';
    if (co2 <= 200) return 'co2-amber';
    return 'co2-red';
  }

  function renderCO2Badge(co2) {
    if (!co2 && co2 !== 0) return '';
    var cls = getCO2Class(co2);
    return '<span class="co2-badge ' + cls + '">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg> ' +
      co2 + ' kg</span>';
  }

  // ===== FEATURE 4: AIRLINE RATING BADGE =====
  async function loadAirlineRatings() {
    if (State.airlineRatingsCache) return State.airlineRatingsCache;
    var data = await cachedFetch('airline_ratings', '/api/airline-ratings');
    if (data) {
      State.airlineRatingsCache = data;
    } else {
      // Provide fallback mock data
      State.airlineRatingsCache = {};
    }
    return State.airlineRatingsCache;
  }

  function renderAirlineRating(airlineCode) {
    if (!State.airlineRatingsCache || !State.airlineRatingsCache[airlineCode]) return '';
    var r = State.airlineRatingsCache[airlineCode];
    var rating = r.rating || r.overall || 0;
    return '<span class="airline-rating-badge" data-airline="' + airlineCode + '" title="On-time: ' +
      (r.ontime || 'N/A') + '% | Legroom: ' + (r.legroom || 'N/A') + ' | Food: ' + (r.food || 'N/A') + '">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="var(--warning)" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ' +
      rating.toFixed(1) + '</span>';
  }

  // ===== FEATURE 12: BAGGAGE INFO =====
  async function loadBaggageInfo(airlineCode) {
    var data = await cachedFetch('baggage_' + airlineCode, '/api/baggage/' + airlineCode);
    return data;
  }

  function renderBaggageBadge(airlineCode) {
    return '<span class="baggage-badge" data-airline="' + airlineCode + '" title="Click for baggage info">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="6" y="7" width="12" height="13" rx="1"/><path d="M9 7V5a3 3 0 016 0v2"/><line x1="12" y1="11" x2="12" y2="15"/></svg></span>';
  }

  // ===== FEATURE 8: TIMEZONE DISPLAY =====
  function renderLocalTimeLabel(time, tzOffset) {
    if (!tzOffset && tzOffset !== 0) return time;
    return time + ' <span class="local-time-label">(local)</span>';
  }

  // ===== FLIGHT CARD RENDERING =====
  function renderFlightCard(flight, index) {
    var stops = flight.stops || 0;
    var stopBadge = stops === 0
      ? '<span class="flight-direct-badge">Direct</span>'
      : '<span class="flight-stops-badge">' + stops + ' stop' + (stops > 1 ? 's' : '') + '</span>';

    var dealClass = '';
    if (flight.deal === 'great') dealClass = 'deal-great';
    else if (flight.deal === 'fair') dealClass = 'deal-fair';
    else if (flight.deal === 'high') dealClass = 'deal-high';

    var co2Html = renderCO2Badge(flight.co2_kg);
    var ratingHtml = renderAirlineRating(flight.airline_code || flight.airlineCode);
    var baggageHtml = renderBaggageBadge(flight.airline_code || flight.airlineCode);

    var arrivalLocal = flight.arrival_local || flight.arrival || '';
    var arrTimeHtml = arrivalLocal;
    if (flight.dest_tz_offset !== undefined) {
      arrTimeHtml = renderLocalTimeLabel(arrivalLocal, flight.dest_tz_offset);
    }

    var nearbyBadge = '';
    if (flight.via_airport && flight.via_airport !== flight.requestedOrigin) {
      nearbyBadge = '<span class="nearby-airport-badge">via ' + flight.via_airport + '</span>';
    }

    var html = '<div class="flight-result-card ' + dealClass + '" data-index="' + index + '">' +
      '<div class="flight-result-main">' +
        '<div class="flight-compare-wrap"><input type="checkbox" class="flight-compare-check" data-index="' + index + '" title="Compare"></div>' +
        '<div class="flight-airline">' +
          '<span>' + escapeHtml(flight.airline || 'Unknown') + '</span> ' + ratingHtml +
          '<br><span class="flight-airline-code">' + escapeHtml(flight.flight_number || flight.flightNumber || '') + '</span>' +
        '</div>' +
        '<div class="flight-times">' +
          '<span class="flight-time">' + escapeHtml(flight.departure || '--:--') + '</span>' +
          '<div class="flight-arrow">' +
            '<div class="flight-arrow-line"></div>' +
            '<span class="flight-arrow-label">' + formatDuration(flight.duration || 0) + '</span>' +
          '</div>' +
          '<span class="flight-time">' + arrTimeHtml + '</span>' +
        '</div>' +
        '<div class="flight-meta">' +
          stopBadge + nearbyBadge +
          '<div class="flight-meta-extras">' + co2Html + ' ' + baggageHtml + '</div>' +
        '</div>' +
        '<div class="flight-price">' +
          '<span>' + formatPrice(flight.price) + '</span>' +
          '<br><span class="flight-price-currency">' + escapeHtml(State.currency) + '</span>' +
        '</div>' +
        '<div class="flight-expand-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="flight-detail" id="flightDetail' + index + '">' +
        renderFlightDetail(flight, index) +
      '</div>' +
    '</div>';
    return html;
  }

  // ===== FEATURE 11: LAYOVER EXPLORER =====
  function renderFlightDetail(flight, index) {
    var segments = flight.segments || [];
    var segHtml = '';
    if (segments.length > 0) {
      segHtml = '<div class="flight-segments"><div class="segments-label">Flight Route</div><div class="segments-timeline">';
      segments.forEach(function(seg, i) {
        segHtml += '<div class="segment-leg">' +
          '<div class="segment-flight-num">' + escapeHtml(seg.flight_number || seg.flightNumber || '') + ' · ' + escapeHtml(seg.aircraft || '') + '</div>' +
          '<div class="segment-route">' +
            '<span class="segment-airport">' + escapeHtml(seg.from || '') + '</span>' +
            '<span class="segment-time">' + escapeHtml(seg.dep_time || '') + '</span>' +
            '<span class="segment-arrow">-></span>' +
            '<span class="segment-airport">' + escapeHtml(seg.to || '') + '</span>' +
            '<span class="segment-time">' + escapeHtml(seg.arr_time || '') + '</span>' +
            '<span class="segment-dur">' + formatDuration(seg.duration || 0) + '</span>' +
          '</div>';
        // Layover explorer for connecting flights
        if (seg.layover && seg.layover.airport) {
          var layMins = seg.layover.minutes || 0;
          var layHtml = '<div class="segment-layover">' +
            '<span>Layover at ' + escapeHtml(seg.layover.airport) + ': ' + formatDuration(layMins) + '</span>' +
            '<div class="layover-info" id="layover_' + index + '_' + i + '"></div>';
          if (layMins > 240) {
            layHtml += '<div class="layover-explore-hint">Long layover -- explore the city?</div>';
          }
          layHtml += '</div>';
          segHtml += layHtml;
          // Trigger async load of airport info
          loadLayoverInfo(seg.layover.airport, 'layover_' + index + '_' + i);
        }
        segHtml += '</div>';
      });
      segHtml += '</div></div>';
    }

    // Booking links
    var origin = escapeHtml(flight.origin || ($('#originSelect') ? $('#originSelect').value : 'HKG'));
    var dest = escapeHtml(flight.destination || ($('#destSelect') ? $('#destSelect').value : ''));
    var date = escapeHtml(flight.date || ($('#flightDate') ? $('#flightDate').value : ''));
    var bookHtml = '<div class="flight-booking">' +
      '<span class="booking-label">Book this flight</span>' +
      '<div class="booking-links">' +
        '<a class="booking-link google" href="https://www.google.com/travel/flights?q=flights+from+' + origin + '+to+' + dest + '+on+' + date + '" target="_blank" rel="noopener">Google Flights</a>' +
        '<a class="booking-link skyscanner" href="https://www.skyscanner.net/transport/flights/' + origin.toLowerCase() + '/' + dest.toLowerCase() + '/' + date.replace(/-/g, '').slice(2) + '/" target="_blank" rel="noopener">Skyscanner</a>' +
        '<a class="booking-link kayak" href="https://www.kayak.com/flights/' + origin + '-' + dest + '/' + date + '" target="_blank" rel="noopener">Kayak</a>' +
      '</div>' +
    '</div>';

    return segHtml + bookHtml;
  }

  async function loadLayoverInfo(airportCode, elementId) {
    var data = await cachedFetch('airport_' + airportCode, '/api/airport-info/' + airportCode);
    var el = document.getElementById(elementId);
    if (!el) return;
    if (data) {
      var features = [];
      if (data.wifi) features.push('Free WiFi');
      if (data.lounges) features.push(data.lounges + ' lounges');
      if (data.priority_pass) features.push('Priority Pass');
      if (data.transit_hotel) features.push('Transit hotel');
      if (data.visa_free_transit) features.push('No visa needed');
      el.innerHTML = features.length > 0
        ? '<span class="layover-features">' + escapeHtml(airportCode) + ': ' + escapeHtml(features.join(' · ')) + '</span>'
        : '';
    }
  }

  // ===== RENDER ALL FLIGHTS =====
  function renderFlights(flights) {
    var container = $('#flightResults');
    if (!container) return;
    if (!flights || flights.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No flights found. Try a different route or date.</p></div>';
      return;
    }
    container.innerHTML = flights.map(function(f, i) { return renderFlightCard(f, i); }).join('');
    updateCompareBar();
    // Attach expand listeners
    container.querySelectorAll('.flight-result-main').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.flight-compare-wrap')) return;
        var card = el.closest('.flight-result-card');
        var detail = card.querySelector('.flight-detail');
        card.classList.toggle('expanded');
        detail.classList.toggle('open');
      });
    });
    // Attach compare listeners
    container.querySelectorAll('.flight-compare-check').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var idx = parseInt(this.dataset.index);
        if (this.checked) State.compareSet.add(idx);
        else State.compareSet.delete(idx);
        updateCompareBar();
      });
    });
    // Attach baggage tooltip listeners
    container.querySelectorAll('.baggage-badge').forEach(function(badge) {
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        var code = this.dataset.airline;
        showBaggageTooltip(this, code);
      });
    });
  }

  // ===== SORTING =====
  function sortFlights(flights, tab) {
    var sorted = flights.slice();
    switch(tab) {
      case 'cheapest':
        sorted.sort(function(a, b) { return (a.price || 0) - (b.price || 0); });
        break;
      case 'fastest':
        sorted.sort(function(a, b) { return (a.duration || 0) - (b.duration || 0); });
        break;
      case 'greenest':
        sorted.sort(function(a, b) { return (a.co2_kg || 999) - (b.co2_kg || 999); });
        break;
      case 'best':
      default:
        // Best is a weighted score: price * 0.5 + duration * 0.3 + co2 * 0.2
        sorted.sort(function(a, b) {
          var scoreA = (a.price || 0) * 0.5 + (a.duration || 0) * 0.3 + (a.co2_kg || 150) * 0.2;
          var scoreB = (b.price || 0) * 0.5 + (b.duration || 0) * 0.3 + (b.co2_kg || 150) * 0.2;
          return scoreA - scoreB;
        });
        break;
    }
    return sorted;
  }

  function filterFlights(flights) {
    if (State.activeFilters.size === 0) return flights;
    return flights.filter(function(f) {
      if (State.activeFilters.has('nonstop') && (f.stops || 0) > 0) return false;
      if (State.activeFilters.has('1stop') && (f.stops || 0) > 1) return false;
      if (State.activeFilters.has('short') && (f.duration || 999) > 480) return false;
      return true;
    });
  }

  function applyFiltersAndSort() {
    var filtered = filterFlights(State.flights);
    State.filteredFlights = sortFlights(filtered, State.currentSort);
    renderFlights(State.filteredFlights);
    var countEl = $('#resultsCount');
    if (countEl) countEl.textContent = State.filteredFlights.length + ' flights found';
  }

  // ===== BAGGAGE TOOLTIP (Feature 12) =====
  async function showBaggageTooltip(el, airlineCode) {
    // Remove existing tooltips
    document.querySelectorAll('.baggage-tooltip').forEach(function(t) { t.remove(); });
    var data = await loadBaggageInfo(airlineCode);
    var tooltip = document.createElement('div');
    tooltip.className = 'baggage-tooltip';
    if (data) {
      tooltip.innerHTML = '<div class="baggage-tooltip-content">' +
        '<div>Carry-on: ' + (data.carry_on || '7kg') + '</div>' +
        '<div>Checked: ' + (data.checked || '30kg included') + '</div>' +
        (data.extra_cost ? '<div class="baggage-extra-cost">Extra bag: +' + formatPrice(data.extra_cost) + '</div>' : '') +
      '</div>';
    } else {
      tooltip.innerHTML = '<div class="baggage-tooltip-content">Carry-on: 7kg · Checked: varies by fare</div>';
    }
    el.style.position = 'relative';
    el.appendChild(tooltip);
    setTimeout(function() { tooltip.remove(); }, 4000);
  }

  // ===== FEATURE 10: FLIGHT COMPARISON TABLE =====
  function updateCompareBar() {
    var bar = $('#compareBar');
    if (!bar) return;
    if (State.compareSet.size >= 2) {
      bar.style.display = 'flex';
      bar.querySelector('.compare-count').textContent = 'Compare (' + State.compareSet.size + ')';
    } else {
      bar.style.display = 'none';
    }
  }

  function openCompareModal() {
    var modal = $('#compareModal');
    if (!modal) return;
    var flights = [];
    State.compareSet.forEach(function(idx) {
      if (State.filteredFlights[idx]) flights.push(State.filteredFlights[idx]);
    });
    if (flights.length < 2) { showToast('Select at least 2 flights to compare', 'warning'); return; }

    var rows = [
      { label: 'Price', key: 'price', fmt: function(v) { return formatPrice(v); }, best: 'min' },
      { label: 'Duration', key: 'duration', fmt: function(v) { return formatDuration(v); }, best: 'min' },
      { label: 'Stops', key: 'stops', fmt: function(v) { return v === 0 ? 'Direct' : v + ' stop' + (v > 1 ? 's' : ''); }, best: 'min' },
      { label: 'Airline', key: 'airline', fmt: function(v) { return v || '-'; }, best: null },
      { label: 'CO2', key: 'co2_kg', fmt: function(v) { return v ? v + ' kg' : 'N/A'; }, best: 'min' },
      { label: 'Departure', key: 'departure', fmt: function(v) { return v || '-'; }, best: null },
      { label: 'Arrival', key: 'arrival', fmt: function(v) { return v || '-'; }, best: null }
    ];

    var headerHtml = '<th></th>' + flights.map(function(f) {
      return '<th>' + escapeHtml(f.airline || '') + '<br><small>' + escapeHtml(f.flight_number || f.flightNumber || '') + '</small></th>';
    }).join('');

    var bodyHtml = rows.map(function(row) {
      var vals = flights.map(function(f) { return f[row.key]; });
      var bestVal = null;
      if (row.best === 'min') {
        var numVals = vals.filter(function(v) { return typeof v === 'number'; });
        if (numVals.length > 0) bestVal = Math.min.apply(null, numVals);
      }
      return '<tr><td class="compare-row-label">' + row.label + '</td>' +
        flights.map(function(f, i) {
          var v = f[row.key];
          var isBest = row.best && v === bestVal;
          return '<td class="' + (isBest ? 'compare-best' : '') + '">' + row.fmt(v) + '</td>';
        }).join('') + '</tr>';
    }).join('');

    var bookRow = '<tr><td></td>' + flights.map(function(f) {
      var origin = f.origin || ($('#originSelect') ? $('#originSelect').value : 'HKG');
      var dest = f.destination || ($('#destSelect') ? $('#destSelect').value : '');
      var date = f.date || ($('#flightDate') ? $('#flightDate').value : '');
      return '<td><a class="btn-primary btn-sm compare-book-btn" href="https://www.google.com/travel/flights?q=flights+from+' +
        origin + '+to+' + dest + '+on+' + date + '" target="_blank" rel="noopener">Book</a></td>';
    }).join('') + '</tr>';

    var body = modal.querySelector('.modal-body');
    body.innerHTML = '<div class="compare-table-wrap"><table class="compare-table"><thead><tr>' +
      headerHtml + '</tr></thead><tbody>' + bodyHtml + bookRow + '</tbody></table></div>';
    modal.classList.add('open');
  }

  // ===== FEATURE 5: TRIP COUNTDOWN =====
  function getCountdownText(trip) {
    if (!trip.departDate && !trip.depart_date) return '';
    var depStr = trip.departDate || trip.depart_date;
    var dep = new Date(depStr);
    var now = new Date();
    now.setHours(0,0,0,0);
    dep.setHours(0,0,0,0);
    var diff = Math.floor((dep - now) / 86400000);
    var dest = (trip.destinations && trip.destinations[0]) || 'your trip';

    if (diff > 0) return diff + ' day' + (diff > 1 ? 's' : '') + ' to ' + dest + '!';
    if (diff === 0) return 'Trip starts today!';
    // Check return date
    var retStr = trip.returnDate || trip.return_date;
    if (retStr) {
      var ret = new Date(retStr);
      ret.setHours(0,0,0,0);
      if (now <= ret) return 'Trip in progress!';
    }
    return 'Trip completed';
  }

  function getCountdownClass(trip) {
    var text = getCountdownText(trip);
    if (text.indexOf('completed') !== -1) return 'countdown-completed';
    if (text.indexOf('progress') !== -1 || text.indexOf('today') !== -1) return 'countdown-active';
    return 'countdown-upcoming';
  }

  // ===== FEATURE 16: EXPORT TRIP TO CALENDAR =====
  function generateICS(trip) {
    var depDate = trip.departDate || trip.depart_date || '';
    var retDate = trip.returnDate || trip.return_date || depDate;
    var name = trip.name || 'Trip';
    var dests = (trip.destinations || []).join(', ');

    var dtStart = depDate.replace(/-/g, '') + 'T090000';
    var dtEnd = retDate.replace(/-/g, '') + 'T180000';

    return 'BEGIN:VCALENDAR\r\n' +
      'VERSION:2.0\r\n' +
      'PRODID:-//MindFlight//Trip//EN\r\n' +
      'BEGIN:VEVENT\r\n' +
      'DTSTART:' + dtStart + '\r\n' +
      'DTEND:' + dtEnd + '\r\n' +
      'SUMMARY:' + name + '\r\n' +
      'DESCRIPTION:Destinations: ' + dests + (trip.notes ? '\\n' + trip.notes : '') + '\r\n' +
      'END:VEVENT\r\n' +
      'END:VCALENDAR\r\n';
  }

  function downloadICS(trip) {
    var ics = generateICS(trip);
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (trip.name || 'trip').replace(/[^a-zA-Z0-9]/g, '_') + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Calendar event downloaded!', 'success');
  }

  // ===== FEATURE 20: TRIP BUDGET TRACKER =====
  function renderBudgetBreakdown(trip) {
    if (!trip.budget) return '';
    var b = trip.budget;
    var cats = [
      { label: 'Accommodation', val: b.accommodation || 0 },
      { label: 'Food', val: b.food || 0 },
      { label: 'Activities', val: b.activities || 0 },
      { label: 'Transport', val: b.transport || 0 }
    ];
    var total = cats.reduce(function(sum, c) { return sum + c.val; }, 0);
    if (total === 0) return '';
    return '<div class="budget-breakdown">' +
      '<div class="budget-breakdown-title">Budget Breakdown</div>' +
      cats.map(function(c) {
        var pct = total > 0 ? Math.round(c.val / total * 100) : 0;
        return '<div class="budget-row">' +
          '<span class="budget-cat-label">' + c.label + '</span>' +
          '<div class="budget-bar-track"><div class="budget-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="budget-cat-val">' + formatPrice(c.val) + '</span>' +
        '</div>';
      }).join('') +
      '<div class="budget-total">Total: ' + formatPrice(total) + '</div>' +
    '</div>';
  }

  // ===== RENDER TRIPS =====
  function renderTrips() {
    var container = $('#tripsList');
    if (!container) return;
    if (State.trips.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<p>No trips saved yet.</p>' +
        '<p class="text-muted-sm">Search for flights and save them here to build your travel plan.</p>' +
        '<button class="btn-primary btn-sm" style="margin-top:12px;" onclick="document.getElementById(\'tripModal\').classList.add(\'open\');">Create your first trip</button>' +
      '</div>';
      return;
    }
    container.innerHTML = State.trips.map(function(trip, i) {
      var countdown = getCountdownText(trip);
      var countdownCls = getCountdownClass(trip);
      var dests = (trip.destinations || []).map(function(d) {
        return '<span class="trip-dest-tag">' + escapeHtml(d) + '</span>';
      }).join('');

      return '<div class="trip-card" data-index="' + i + '">' +
        (countdown ? '<div class="trip-countdown ' + countdownCls + '">' + escapeHtml(countdown) + '</div>' : '') +
        '<div class="trip-card-header">' +
          '<span class="trip-card-name">' + escapeHtml(trip.name || 'Untitled Trip') + '</span>' +
          '<span class="trip-card-date">' + escapeHtml(trip.departDate || trip.depart_date || '') +
            (trip.returnDate || trip.return_date ? ' - ' + escapeHtml(trip.returnDate || trip.return_date) : '') + '</span>' +
        '</div>' +
        '<div class="trip-card-destinations">' + dests + '</div>' +
        (trip.notes ? '<div class="trip-card-notes">' + escapeHtml(trip.notes) + '</div>' : '') +
        (trip.dailyBudget ? '<div class="trip-card-cost">' + formatPrice(trip.dailyBudget) + '/day x ' + (trip.days || 7) + ' days = ' + formatPrice(trip.dailyBudget * (trip.days || 7)) + '</div>' : '') +
        renderBudgetBreakdown(trip) +
        '<div class="trip-card-actions">' +
          '<button class="btn-outline trip-calendar-btn" data-index="' + i + '">Add to Calendar</button>' +
          '<button class="btn-outline trip-share-btn" data-index="' + i + '">Share Link</button>' +
          '<button class="btn-text trip-delete-btn" data-index="' + i + '" style="color:var(--danger);">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.trip-calendar-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        downloadICS(State.trips[parseInt(this.dataset.index)]);
      });
    });
    container.querySelectorAll('.trip-share-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        shareTrip(State.trips[parseInt(this.dataset.index)]);
      });
    });
    container.querySelectorAll('.trip-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        State.trips.splice(parseInt(this.dataset.index), 1);
        localStorage.setItem('mf_trips', JSON.stringify(State.trips));
        renderTrips();
        showToast('Trip deleted', 'info');
      });
    });
  }

  // ===== FEATURE 17: SHAREABLE LINKS =====
  async function shareTrip(trip) {
    var data = await apiFetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'trip', data: trip })
    });
    var url = data && data.url ? data.url : window.location.origin + '?trip=' + btoa(JSON.stringify(trip)).slice(0, 50);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied!', 'success');
    } catch(e) {
      showToast('Share URL: ' + url, 'info');
    }
  }

  async function shareSearch(params) {
    var data = await apiFetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'search', data: params })
    });
    var url = data && data.url ? data.url : window.location.origin + '?search=' + btoa(JSON.stringify(params)).slice(0, 50);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied!', 'success');
    } catch(e) {
      showToast('Share URL: ' + url, 'info');
    }
  }

  // ===== FEATURE 6: RECENT SEARCHES =====
  async function loadRecentSearches() {
    var data = await apiFetch('/api/recent-searches');
    if (data && Array.isArray(data)) {
      State.recentSearches = data;
    }
    renderRecentSearches();
  }

  async function saveRecentSearch(params, results) {
    var cheapest = results && results.length > 0 ? Math.min.apply(null, results.map(function(f) { return f.price || 9999; })) : null;
    var entry = {
      origin: params.origin,
      destination: params.destination,
      date: params.date,
      price: cheapest,
      currency: State.currency,
      timestamp: new Date().toISOString()
    };
    await apiFetch('/api/recent-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    State.recentSearches.unshift(entry);
    if (State.recentSearches.length > 10) State.recentSearches.pop();
    renderRecentSearches();
  }

  function renderRecentSearches() {
    var container = $('#recentSearches');
    if (!container) return;
    if (State.recentSearches.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    var html = '<div class="recent-searches-title">Recent Searches</div><div class="recent-searches-row">';
    html += State.recentSearches.slice(0, 6).map(function(s) {
      var priceChange = '';
      // Check for price changes
      var prev = State.recentSearches.find(function(p) {
        return p.origin === s.origin && p.destination === s.destination && p.timestamp !== s.timestamp && p.price;
      });
      if (prev && prev.price && s.price) {
        var diff = s.price - prev.price;
        if (diff < 0) priceChange = '<span class="price-change-down">' + String.fromCharCode(8595) + formatPrice(Math.abs(diff)) + '</span>';
        else if (diff > 0) priceChange = '<span class="price-change-up">' + String.fromCharCode(8593) + formatPrice(diff) + '</span>';
      }
      return '<button class="recent-search-card" data-origin="' + escapeHtml(s.origin) + '" data-dest="' + escapeHtml(s.destination) + '" data-date="' + escapeHtml(s.date || '') + '">' +
        '<span class="recent-route">' + escapeHtml(s.origin) + ' ' + String.fromCharCode(8594) + ' ' + escapeHtml(s.destination) + '</span>' +
        '<span class="recent-meta">' + (s.date ? escapeHtml(s.date.slice(5)) : '') + (s.price ? ' · ' + formatPrice(s.price) : '') + ' · ' + timeAgo(s.timestamp) + '</span>' +
        priceChange +
      '</button>';
    }).join('');
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.recent-search-card').forEach(function(card) {
      card.addEventListener('click', function() {
        if ($('#originSelect')) $('#originSelect').value = this.dataset.origin;
        if ($('#destSelect')) $('#destSelect').value = this.dataset.dest;
        if ($('#flightDate') && this.dataset.date) $('#flightDate').value = this.dataset.date;
        var airport = getAirportByCode(this.dataset.origin);
        if (airport && $('#originInput')) $('#originInput').value = airport.city + ' (' + airport.code + ')';
        var destAirport = getAirportByCode(this.dataset.dest);
        if (destAirport && $('#flightTo')) $('#flightTo').value = destAirport.city + ' (' + destAirport.code + ')';
        performSearch();
      });
    });
  }

  // ===== FEATURE 7: SAVED SEARCH TEMPLATES =====
  function renderSearchTemplates() {
    var container = $('#searchTemplates');
    if (!container) return;
    var html = State.searchTemplates.map(function(t, i) {
      return '<button class="search-template-chip" data-index="' + i + '" title="Right-click to delete">' + escapeHtml(t.name) + '</button>';
    }).join('');
    html += '<button class="search-template-chip template-save-chip" id="saveTemplateChip">+ Save</button>';
    container.innerHTML = html;

    container.querySelectorAll('.search-template-chip:not(.template-save-chip)').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var t = State.searchTemplates[parseInt(this.dataset.index)];
        if (!t) return;
        if ($('#originSelect')) $('#originSelect').value = t.origin || '';
        if ($('#destSelect')) $('#destSelect').value = t.destination || '';
        if ($('#flightDate')) $('#flightDate').value = t.date || '';
        if ($('#flightPax')) $('#flightPax').value = t.pax || 1;
        if ($('#cabinClass')) $('#cabinClass').value = t.cabin || 'economy';
        var originAirport = getAirportByCode(t.origin);
        if (originAirport && $('#originInput')) $('#originInput').value = originAirport.city + ' (' + originAirport.code + ')';
        var destAirport = getAirportByCode(t.destination);
        if (destAirport && $('#flightTo')) $('#flightTo').value = destAirport.city + ' (' + destAirport.code + ')';
        performSearch();
      });
      chip.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        var idx = parseInt(this.dataset.index);
        State.searchTemplates.splice(idx, 1);
        localStorage.setItem('mf_search_templates', JSON.stringify(State.searchTemplates));
        renderSearchTemplates();
        showToast('Template deleted', 'info');
      });
    });

    var saveChip = $('#saveTemplateChip');
    if (saveChip) {
      saveChip.addEventListener('click', function() {
        saveCurrentSearchTemplate();
      });
    }
  }

  function saveCurrentSearchTemplate() {
    var origin = $('#originSelect') ? $('#originSelect').value : '';
    var dest = $('#destSelect') ? $('#destSelect').value : '';
    if (!origin && !dest) { showToast('Enter a search first', 'warning'); return; }
    var name = prompt('Name this search template:', (dest || origin) + ' trip');
    if (!name) return;
    State.searchTemplates.push({
      name: name,
      origin: origin,
      destination: dest,
      date: $('#flightDate') ? $('#flightDate').value : '',
      pax: $('#flightPax') ? $('#flightPax').value : 1,
      cabin: $('#cabinClass') ? $('#cabinClass').value : 'economy'
    });
    localStorage.setItem('mf_search_templates', JSON.stringify(State.searchTemplates));
    renderSearchTemplates();
    showToast('Template "' + name + '" saved!', 'success');
  }

  // ===== FEATURE 2: VISA REQUIREMENTS =====
  async function loadVisaInfo(destination) {
    var countryCode = destination; // Should map city to country code
    var airport = getAirportByCode(destination);
    if (airport) {
      // Map country name to 2-letter code roughly
      var countryMap = {
        'Japan': 'JP', 'Singapore': 'SG', 'Thailand': 'TH', 'South Korea': 'KR',
        'Taiwan': 'TW', 'China': 'CN', 'Malaysia': 'MY', 'Philippines': 'PH',
        'Indonesia': 'ID', 'Vietnam': 'VN', 'India': 'IN', 'UK': 'GB',
        'France': 'FR', 'Germany': 'DE', 'Spain': 'ES', 'Italy': 'IT',
        'Netherlands': 'NL', 'USA': 'US', 'Canada': 'CA', 'Australia': 'AU',
        'UAE': 'AE', 'Qatar': 'QA', 'Hong Kong': 'HK', 'Cambodia': 'KH',
        'Sri Lanka': 'LK', 'Nepal': 'NP', 'Myanmar': 'MM'
      };
      countryCode = countryMap[airport.country] || destination;
    }
    var data = await cachedFetch('visa_' + State.passportNationality + '_' + countryCode,
      '/api/visa?passport=' + State.passportNationality + '&destination=' + countryCode);
    return data;
  }

  function renderVisaBadge(visaData) {
    if (!visaData) return '';
    var cls = 'visa-green';
    var text = 'Visa Free';
    if (visaData.type === 'visa_free' || visaData.type === 'free') {
      cls = 'visa-green';
      text = 'Visa Free' + (visaData.days ? ' · ' + visaData.days + ' days' : '');
    } else if (visaData.type === 'evisa' || visaData.type === 'eVisa') {
      cls = 'visa-yellow';
      text = 'eVisa Required';
    } else {
      cls = 'visa-red';
      text = 'Visa Required';
    }
    return '<span class="visa-badge ' + cls + '">' + text + '</span>';
  }

  // ===== FEATURE 3: DESTINATION QUICK FACTS =====
  async function loadDestinationFacts(city) {
    var data = await cachedFetch('facts_' + city, '/api/destination-facts/' + city);
    return data;
  }

  function renderQuickFacts(factsData) {
    if (!factsData) return '';
    var facts = [
      { icon: String.fromCharCode(128176), label: 'Currency', value: factsData.currency || 'N/A' },
      { icon: String.fromCharCode(128172), label: 'Language', value: factsData.language || 'N/A' },
      { icon: String.fromCharCode(128268), label: 'Plug Type', value: factsData.plug_type || 'N/A' },
      { icon: String.fromCharCode(128222), label: 'Emergency', value: factsData.emergency || 'N/A' },
      { icon: String.fromCharCode(128181), label: 'Tipping', value: factsData.tipping || 'N/A' },
      { icon: String.fromCharCode(128167), label: 'Tap Water', value: factsData.tap_water || 'N/A' },
      { icon: String.fromCharCode(128663), label: 'Drive Side', value: factsData.drive_side || 'N/A' }
    ];
    return '<div class="quick-facts-grid">' +
      facts.map(function(f) {
        return '<div class="quick-fact-item">' +
          '<span class="quick-fact-icon">' + f.icon + '</span>' +
          '<span class="quick-fact-label">' + f.label + '</span>' +
          '<span class="quick-fact-value">' + f.value + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // ===== FEATURE 13: SEASONAL TRAVEL GUIDE =====
  async function loadSeasonalGuide(city) {
    var data = await cachedFetch('seasonal_' + city, '/api/seasonal-guide/' + city);
    return data;
  }

  function renderSeasonalGuide(data) {
    if (!data || !data.months) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var currentMonth = new Date().getMonth();
    return '<div class="seasonal-guide">' +
      '<div class="seasonal-guide-title">Best Time to Visit</div>' +
      '<div class="seasonal-bar">' +
        data.months.map(function(m, i) {
          var cls = 'seasonal-great';
          if (m.rating === 'ok' || m.rating === 'fair') cls = 'seasonal-ok';
          else if (m.rating === 'avoid' || m.rating === 'bad') cls = 'seasonal-avoid';
          var isCurrent = i === currentMonth;
          return '<div class="seasonal-month ' + cls + (isCurrent ? ' seasonal-current' : '') + '" title="' + months[i] + ': ' + (m.temp || '') + '">' +
            '<span class="seasonal-month-label">' + months[i].charAt(0) + '</span>' +
            (m.temp ? '<span class="seasonal-month-temp">' + m.temp + '</span>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  // ===== FEATURE 14: EXTENDED WEATHER FORECAST =====
  async function loadWeatherForecast(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7';
    var data = await cachedFetch('weather_' + lat + '_' + lon, url);
    return data;
  }

  function renderWeatherForecast(data) {
    if (!data || !data.daily) return '';
    var days = data.daily.time || [];
    var maxTemps = data.daily.temperature_2m_max || [];
    var minTemps = data.daily.temperature_2m_min || [];
    var precip = data.daily.precipitation_probability_max || [];

    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    return '<div class="weather-forecast">' +
      '<div class="weather-forecast-title">7-Day Forecast</div>' +
      '<div class="weather-forecast-strip">' +
        days.map(function(d, i) {
          var date = new Date(d);
          var dayName = dayNames[date.getDay()];
          var precPct = precip[i] || 0;
          var icon = precPct > 60 ? String.fromCharCode(127783) : precPct > 30 ? String.fromCharCode(9925) : String.fromCharCode(9728);
          return '<div class="weather-day">' +
            '<span class="weather-day-name">' + dayName + '</span>' +
            '<span class="weather-day-icon">' + icon + '</span>' +
            '<span class="weather-day-temps">' + Math.round(maxTemps[i]) + String.fromCharCode(176) + ' / ' + Math.round(minTemps[i]) + String.fromCharCode(176) + '</span>' +
            '<span class="weather-day-precip">' + precPct + '%</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  // ===== FEATURE 8: TIMEZONE (in Discovery Card) =====
  async function loadTimezone(iata) {
    var data = await cachedFetch('tz_' + iata, '/api/timezone/' + iata);
    return data;
  }

  function renderTimezoneInfo(tzData) {
    if (!tzData) return '';
    var offset = tzData.utc_offset || tzData.offset || '';
    var localTime = tzData.local_time || '';
    var diff = tzData.diff_text || '';
    return '<div class="timezone-info">' +
      '<span class="tz-icon">' + String.fromCharCode(128344) + '</span> ' +
      'Current local time: <strong>' + localTime + '</strong>' +
      (offset ? ' (UTC' + offset + (diff ? ', ' + diff : '') + ')' : '') +
    '</div>';
  }

  // ===== DISCOVERY CARD POPULATION =====
  async function openDiscoveryCard(airportCode) {
    var section = $('#discoverySection');
    if (section) section.style.display = 'block';

    var airport = getAirportByCode(airportCode);
    if (!airport) return;

    State.currentDiscoveryCity = airportCode;
    if ($('#discoveryCity')) $('#discoveryCity').textContent = airport.city;
    if ($('#discoveryCountry')) $('#discoveryCountry').textContent = airport.country + ' ' + (airport.flag || '');
    if ($('#discoveryBadge')) $('#discoveryBadge').textContent = 'YOUR DESTINATION';

    // Set hero image using Wikipedia REST API (Fix #17: replace deprecated unsplash)
    var hero = $('#discoveryHero');
    if (hero) {
      hero.style.backgroundImage = 'none';
      fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(airport.city))
        .then(function(resp) { return resp.json(); })
        .then(function(wikiData) {
          if (wikiData && wikiData.thumbnail && wikiData.thumbnail.source) {
            hero.style.backgroundImage = 'url(' + wikiData.thumbnail.source + ')';
          }
          if (wikiData && wikiData.extract) {
            var aboutEl = $('#discoveryAbout');
            if (aboutEl) aboutEl.innerHTML = '<p>' + escapeHtml(wikiData.extract) + '</p>';
          }
        })
        .catch(function() { /* Wikipedia image not critical */ });
    }

    // Load extras asynchronously
    var extrasEl = $('#discoveryExtras');
    if (extrasEl) extrasEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading info...</div>';

    // Parallel loads
    var visaPromise = loadVisaInfo(airportCode);
    var factsPromise = loadDestinationFacts(airportCode);
    var seasonalPromise = loadSeasonalGuide(airportCode);
    var tzPromise = loadTimezone(airportCode);
    var weatherPromise = airport.lat && airport.lon ? loadWeatherForecast(airport.lat, airport.lon) : Promise.resolve(null);

    var visa = await visaPromise;
    var facts = await factsPromise;
    var seasonal = await seasonalPromise;
    var tz = await tzPromise;
    var weather = await weatherPromise;

    if (extrasEl) {
      var html = '';
      // Visa badge
      if (visa) html += '<div class="discovery-extra-card" style="grid-column:1/-1;">' + renderVisaBadge(visa) + '</div>';
      // Timezone
      if (tz) html += '<div class="discovery-extra-card" style="grid-column:1/-1;">' + renderTimezoneInfo(tz) + '</div>';
      // Quick facts
      if (facts) html += '<div class="discovery-extra-card" style="grid-column:1/-1;">' + renderQuickFacts(facts) + '</div>';
      // Seasonal guide
      if (seasonal) html += '<div class="discovery-extra-card" style="grid-column:1/-1;">' + renderSeasonalGuide(seasonal) + '</div>';
      // Weather forecast
      if (weather) html += '<div class="discovery-extra-card" style="grid-column:1/-1;">' + renderWeatherForecast(weather) + '</div>';

      if (!html) html = '<div class="discovery-extra-card"><div class="discovery-extra-label">INFO</div><div class="discovery-extra-value">No additional data available</div></div>';
      extrasEl.innerHTML = html;
    }

    // Scroll to discovery section
    section.scrollIntoView({ behavior: 'smooth' });
  }

  // ===== FEATURE 9: HOLIDAY MARKERS IN PRICE CALENDAR =====
  async function loadHolidays(countryCode) {
    var data = await cachedFetch('holidays_' + countryCode, '/api/holidays?country=' + countryCode);
    return data;
  }

  function renderPriceCalendar(year, month, priceData, holidays) {
    var calGrid = $('#calGrid');
    var calLabel = $('#calMonthLabel');
    if (!calGrid || !calLabel) return;

    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    calLabel.textContent = monthNames[month] + ' ' + year;

    var firstDay = new Date(year, month, 1).getDay();
    var offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    var html = '';
    // Empty slots
    for (var i = 0; i < offset; i++) {
      html += '<div class="cal-day empty"></div>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var price = priceData && priceData[dateStr] ? priceData[dateStr] : null;
      var cls = 'nodata';
      var priceLabel = '';
      if (price !== null) {
        if (price < 200) cls = 'cheap';
        else if (price < 500) cls = 'mid';
        else cls = 'high';
        priceLabel = currSym() + price;
      }

      // Holiday marker
      var holidayHtml = '';
      var holidayTitle = '';
      if (holidays) {
        var h = holidays.find(function(hol) { return hol.date === dateStr; });
        if (h) {
          holidayHtml = '<span class="cal-holiday-marker" title="' + (h.name || 'Holiday') + '">' + String.fromCharCode(9733) + '</span>';
          holidayTitle = h.name || 'Holiday';
        }
      }

      html += '<div class="cal-day ' + cls + '" data-date="' + dateStr + '" title="' + holidayTitle + '">' +
        '<span class="cal-day-num">' + d + '</span>' +
        (priceLabel ? '<span class="cal-day-price">' + priceLabel + '</span>' : '') +
        holidayHtml +
      '</div>';
    }
    calGrid.innerHTML = html;

    // Holiday warning
    var selectedDate = $('#flightDate') ? $('#flightDate').value : '';
    if (selectedDate && holidays) {
      var nearHoliday = holidays.find(function(h) {
        var hd = new Date(h.date);
        var sd = new Date(selectedDate);
        return Math.abs(hd - sd) < 3 * 86400000;
      });
      if (nearHoliday) {
        showToast('Your selected date is near ' + nearHoliday.name + ' - expect higher prices', 'warning');
      }
    }

    // Click handler
    calGrid.querySelectorAll('.cal-day:not(.empty)').forEach(function(day) {
      day.addEventListener('click', function() {
        var date = this.dataset.date;
        if ($('#flightDate')) $('#flightDate').value = date;
        calGrid.querySelectorAll('.cal-day').forEach(function(d) { d.classList.remove('selected'); });
        this.classList.add('selected');
      });
    });
  }

  // ===== FEATURE 15: WEEKEND GETAWAY SECTION =====
  function getNextWeekends(count) {
    var weekends = [];
    var now = new Date();
    var d = new Date(now);
    // Find next Friday
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    for (var i = 0; i < count; i++) {
      var fri = new Date(d);
      var sun = new Date(d);
      sun.setDate(sun.getDate() + 2);
      weekends.push({
        fri: fri.toISOString().slice(0, 10),
        sun: sun.toISOString().slice(0, 10),
        label: fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' +
               sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
      d.setDate(d.getDate() + 7);
    }
    return weekends;
  }

  function renderWeekendGetaways() {
    var container = $('#weekendGetaways');
    if (!container) return;
    var weekends = getNextWeekends(4);
    var destinations = typeof AIRPORTS !== 'undefined'
      ? AIRPORTS.filter(function(a) { return a.region === 'asia' && a.code !== State.origin; }).slice(0, 8)
      : [];

    if (destinations.length === 0) { container.style.display = 'none'; return; }

    var html = '<div class="section-header"><h2 class="section-title">Weekend Getaways</h2></div>' +
      '<div class="weekend-scroll">';
    var destIdx = 0;
    weekends.forEach(function(wk) {
      var dest = destinations[destIdx % destinations.length];
      destIdx++;
      html += '<button class="weekend-card" data-dest="' + dest.code + '" data-date="' + wk.fri + '">' +
        '<div class="weekend-card-city">' + (dest.flag || '') + ' ' + dest.city + '</div>' +
        '<div class="weekend-card-dates">' + wk.label + '</div>' +
        '<div class="weekend-card-price">From ' + currSym() + (100 + Math.floor(Math.random() * 400)) + '</div>' +
      '</button>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';

    container.querySelectorAll('.weekend-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var dest = this.dataset.dest;
        var date = this.dataset.date;
        if ($('#destSelect')) $('#destSelect').value = dest;
        if ($('#flightDate')) $('#flightDate').value = date;
        var airport = getAirportByCode(dest);
        if (airport && $('#flightTo')) $('#flightTo').value = airport.city + ' (' + airport.code + ')';
        performSearch();
      });
    });
  }

  // ===== FEATURE 18: NEARBY AIRPORT TOGGLE =====
  async function loadNearbyAirports(code) {
    var data = await cachedFetch('nearby_' + code, '/api/nearby-airports?code=' + code + '&radius=150');
    return data;
  }

  // ===== FEATURE 19: PRICE PREDICTION =====
  async function loadPricePrediction(origin, destination) {
    var data = await cachedFetch('prediction_' + origin + '_' + destination,
      '/api/price-prediction?origin=' + origin + '&destination=' + destination);
    return data;
  }

  function renderPricePrediction(data) {
    if (!data) return '';
    var trendClass = 'prediction-stable';
    var trendIcon = String.fromCharCode(8596);
    if (data.trend === 'down' || data.trend === 'falling') {
      trendClass = 'prediction-down';
      trendIcon = String.fromCharCode(8595);
    } else if (data.trend === 'up' || data.trend === 'rising') {
      trendClass = 'prediction-up';
      trendIcon = String.fromCharCode(8593);
    }

    return '<div class="prediction-card ' + trendClass + '">' +
      '<div class="prediction-icon">' + trendIcon + '</div>' +
      '<div class="prediction-text">' +
        '<strong>Prices trending ' + (data.trend || 'STABLE').toUpperCase() + '</strong>' +
        (data.recommendation ? '<p>' + data.recommendation + '</p>' : '') +
        '<span class="prediction-meta">Confidence: ' + (data.confidence || 'Medium') +
          (data.data_points ? ' · ' + data.data_points + ' data points' : '') + '</span>' +
      '</div>' +
    '</div>';
  }

  // ===== MAIN SEARCH FUNCTION =====
  async function performSearch() {
    var origin = $('#originSelect') ? $('#originSelect').value : '';
    var dest = $('#destSelect') ? $('#destSelect').value : '';
    var date = $('#flightDate') ? $('#flightDate').value : '';
    var pax = $('#flightPax') ? $('#flightPax').value : 1;
    var cabin = $('#cabinClass') ? $('#cabinClass').value : 'economy';
    var currency = $('#currencySelect') ? $('#currencySelect').value : State.currency;
    State.currency = currency;

    if (!origin || !dest) {
      showToast('Please enter origin and destination', 'warning');
      return;
    }

    showToast('Searching flights...', 'info');

    // Update route context bar
    if ($('#rcbOrigin')) $('#rcbOrigin').textContent = origin;
    if ($('#rcbDest')) $('#rcbDest').textContent = dest;
    if ($('#rcbDate')) $('#rcbDate').textContent = date;
    if ($('#rcbPax')) $('#rcbPax').textContent = pax + ' travelers';
    var rcb = $('#routeContextBar');
    if (rcb) rcb.classList.add('visible');

    // Fix #30: Update route stepper to search step
    updateRouteStep('search');

    // Show results area
    if ($('#resultsToolbar')) $('#resultsToolbar').style.display = 'flex';
    if ($('#filterChips')) $('#filterChips').style.display = 'flex';
    if ($('#priceCalendarWrap')) $('#priceCalendarWrap').style.display = 'block';
    if ($('#priceBarsWrap')) $('#priceBarsWrap').style.display = 'block';

    // Show loading skeleton
    var container = $('#flightResults');
    if (container) {
      container.innerHTML = Array(3).fill('<div class="skeleton-card"><div class="skeleton-line" style="width:80px;height:14px;"></div><div class="skeleton-line" style="width:200px;height:20px;"></div><div class="skeleton-line" style="width:60px;height:24px;"></div></div>').join('');
    }

    // Load airline ratings in parallel
    loadAirlineRatings();

    // Fetch flights
    var url = '/api/flights?origin=' + origin + '&destination=' + dest +
      '&date=' + date + '&adults=' + pax + '&cabin=' + cabin + '&currency=' + currency;
    var data = await apiFetch(url);

    var flights = [];
    if (data && data.flights) flights = data.flights;
    else if (data && Array.isArray(data)) flights = data;

    // Feature 18: Nearby airports
    if (State.nearbyEnabled) {
      var nearbyData = await loadNearbyAirports(origin);
      if (nearbyData && nearbyData.airports) {
        for (var na = 0; na < nearbyData.airports.length; na++) {
          var nearbyCode = nearbyData.airports[na].code || nearbyData.airports[na];
          if (nearbyCode === origin) continue;
          var nearbyUrl = '/api/flights?origin=' + nearbyCode + '&destination=' + dest +
            '&date=' + date + '&adults=' + pax + '&cabin=' + cabin + '&currency=' + currency;
          var nearbyResults = await apiFetch(nearbyUrl);
          if (nearbyResults) {
            var nFlights = nearbyResults.flights || (Array.isArray(nearbyResults) ? nearbyResults : []);
            nFlights.forEach(function(f) {
              f.via_airport = nearbyCode;
              f.requestedOrigin = origin;
            });
            flights = flights.concat(nFlights);
          }
        }
      }
    }

    State.flights = flights;
    State.compareSet.clear();
    applyFiltersAndSort();

    // Fix #29: Show action bridge after search
    var actionBridge = $('#actionBridge');
    if (actionBridge && flights.length > 0) actionBridge.style.display = 'block';

    // Fix #30: Update stepper to compare step after results
    if (flights.length > 0) updateRouteStep('compare');

    // Save recent search
    saveRecentSearch({ origin: origin, destination: dest, date: date }, flights);

    // Feature 19: Price prediction
    var prediction = await loadPricePrediction(origin, dest);
    var dealSection = $('#dealSection');
    if (dealSection) {
      dealSection.style.display = 'block';
      var dealCard = $('#dealCard');
      if (dealCard && prediction) {
        var predHtml = renderPricePrediction(prediction);
        dealCard.innerHTML += predHtml;
      }
    }

    // Load price calendar holidays
    var originAirport = getAirportByCode(dest);
    if (originAirport) {
      var countryMap = {
        'Japan': 'JP', 'Singapore': 'SG', 'Thailand': 'TH', 'UK': 'GB',
        'USA': 'US', 'France': 'FR', 'Germany': 'DE', 'Australia': 'AU',
        'Hong Kong': 'HK', 'South Korea': 'KR', 'Taiwan': 'TW', 'China': 'CN'
      };
      var cc = countryMap[originAirport.country] || '';
      if (cc) {
        var holidays = await loadHolidays(cc);
        renderPriceCalendar(State.calendarYear, State.calendarMonth, data ? data.calendar : null, holidays ? holidays.holidays : null);
      } else {
        renderPriceCalendar(State.calendarYear, State.calendarMonth, data ? data.calendar : null, null);
      }
    }

    // Scroll to results
    var searchSection = $('#search-section');
    if (searchSection) searchSection.scrollIntoView({ behavior: 'smooth' });
  }

  // ===== DEALS GRID =====
  async function loadDeals() {
    var origin = State.origin;
    if ($('#originSelect')) origin = $('#originSelect').value || origin;
    showToast('Scanning for deals...', 'info');

    var grid = $('#cheapestGrid');
    if (grid) {
      grid.innerHTML = Array(6).fill('<div class="cheapest-card loading"><div class="skeleton-line" style="width:100px;height:16px;margin-bottom:8px;"></div><div class="skeleton-line" style="width:60px;height:24px;"></div></div>').join('');
    }

    var data = await apiFetch('/api/deals?origin=' + origin + '&currency=' + State.currency);
    if (!data) {
      if (grid) grid.innerHTML = '<div class="cheapest-placeholder">No deals available. Try again later.</div>';
      return;
    }

    var deals = data.deals || (Array.isArray(data) ? data : []);
    if (grid) {
      grid.innerHTML = deals.map(function(d) {
        var dealCls = '';
        if (d.deal === 'great') dealCls = 'great';
        else if (d.deal === 'fair') dealCls = 'fair';
        else dealCls = 'high';
        return '<div class="cheapest-card" data-dest="' + escapeHtml(d.destination || d.code || '') + '">' +
          '<div class="cheapest-card-deal ' + escapeHtml(dealCls) + '">' + escapeHtml((d.deal || '').toUpperCase()) + '</div>' +
          '<div class="cheapest-card-dest"><span class="flag">' + escapeHtml(d.flag || '') + '</span>' + escapeHtml(d.city || d.destination || '') + '</div>' +
          '<div class="cheapest-card-route">' + escapeHtml(d.origin || origin) + ' ' + String.fromCharCode(8594) + ' ' + escapeHtml(d.destination || d.code || '') + '</div>' +
          '<div class="cheapest-card-price">' + formatPrice(d.price || 0) + '</div>' +
        '</div>';
      }).join('');

      grid.querySelectorAll('.cheapest-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var destCode = this.dataset.dest;
          if (destCode) openDiscoveryCard(destCode);
        });
      });
    }
  }

  // ===== TRIP MODAL =====
  function initTripModal() {
    var modal = $('#tripModal');
    var closeBtn = $('#closeTripModal');
    var saveBtn = $('#saveTripBtn');
    var budgetInput = $('#tripDailyBudget');
    var daysInput = $('#tripDays');
    var totalEl = $('#tripCostTotal');

    if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('open'); });
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); });

    function updateCostCalc() {
      var budget = parseFloat(budgetInput ? budgetInput.value : 0) || 0;
      var days = parseInt(daysInput ? daysInput.value : 0) || 0;
      if (totalEl) totalEl.textContent = '= ' + formatPrice(budget * days);
    }
    if (budgetInput) budgetInput.addEventListener('input', updateCostCalc);
    if (daysInput) daysInput.addEventListener('input', updateCostCalc);

    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var name = $('#tripName') ? $('#tripName').value.trim() : '';
        var dests = $('#tripDestinations') ? $('#tripDestinations').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
        var notes = $('#tripNotes') ? $('#tripNotes').value.trim() : '';
        var dailyBudget = budgetInput ? parseFloat(budgetInput.value) || 0 : 0;
        var days = daysInput ? parseInt(daysInput.value) || 7 : 7;

        // Feature 20: Budget categories
        var accom = $('#tripBudgetAccommodation') ? parseFloat($('#tripBudgetAccommodation').value) || 0 : 0;
        var food = $('#tripBudgetFood') ? parseFloat($('#tripBudgetFood').value) || 0 : 0;
        var activities = $('#tripBudgetActivities') ? parseFloat($('#tripBudgetActivities').value) || 0 : 0;
        var transport = $('#tripBudgetTransport') ? parseFloat($('#tripBudgetTransport').value) || 0 : 0;

        // Trip dates
        var departDate = $('#tripDepartDate') ? $('#tripDepartDate').value : '';
        var returnDate = $('#tripReturnDate') ? $('#tripReturnDate').value : '';

        if (!name) { showToast('Please enter a trip name', 'warning'); return; }

        var trip = {
          name: name,
          destinations: dests,
          notes: notes,
          dailyBudget: dailyBudget,
          days: days,
          departDate: departDate,
          returnDate: returnDate,
          budget: {
            accommodation: accom,
            food: food,
            activities: activities,
            transport: transport
          },
          createdAt: new Date().toISOString()
        };

        State.trips.push(trip);
        localStorage.setItem('mf_trips', JSON.stringify(State.trips));
        renderTrips();
        modal.classList.remove('open');
        showToast('Trip "' + name + '" saved!', 'success');
      });
    }
  }

  // ===== FEATURE 20: LOAD CITY COSTS FOR BUDGET DEFAULTS =====
  async function loadCityCosts(city) {
    var data = await cachedFetch('costs_' + city, '/api/city-costs?city=' + city);
    if (data) {
      if ($('#tripBudgetAccommodation') && !$('#tripBudgetAccommodation').value) $('#tripBudgetAccommodation').value = data.accommodation || '';
      if ($('#tripBudgetFood') && !$('#tripBudgetFood').value) $('#tripBudgetFood').value = data.food || '';
      if ($('#tripBudgetActivities') && !$('#tripBudgetActivities').value) $('#tripBudgetActivities').value = data.activities || '';
      if ($('#tripBudgetTransport') && !$('#tripBudgetTransport').value) $('#tripBudgetTransport').value = data.transport || '';
    }
  }

  // ===== SETTINGS =====
  function initSettings() {
    var modal = $('#settingsModal');
    var closeBtn = $('#closeSettings');
    var saveBtn = $('#saveSettings');
    var settingsBtn = $('#settingsBtn');

    if (settingsBtn) settingsBtn.addEventListener('click', function() {
      if (modal) modal.classList.add('open');
      if ($('#settingOrigin')) $('#settingOrigin').value = State.origin;
      if ($('#settingCurrency')) $('#settingCurrency').value = State.currency;
      if ($('#settingTheme')) $('#settingTheme').value = State.theme;
      if ($('#settingPassport')) $('#settingPassport').value = State.passportNationality;
    });

    if (closeBtn) closeBtn.addEventListener('click', function() { modal.classList.remove('open'); });
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); });

    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var origin = $('#settingOrigin') ? $('#settingOrigin').value.trim().toUpperCase() : 'HKG';
        var currency = $('#settingCurrency') ? $('#settingCurrency').value : 'GBP';
        var theme = $('#settingTheme') ? $('#settingTheme').value : 'dark';
        var passport = $('#settingPassport') ? $('#settingPassport').value.trim().toUpperCase() : 'HK';

        State.origin = origin;
        State.currency = currency;
        State.passportNationality = passport;
        localStorage.setItem('mf_origin', origin);
        localStorage.setItem('mf_currency', currency);
        localStorage.setItem('mf_passport', passport);
        applyTheme(theme);

        if ($('#originSelect')) $('#originSelect').value = origin;
        if ($('#currencySelect')) $('#currencySelect').value = currency;
        var ap = getAirportByCode(origin);
        if (ap && $('#originInput')) $('#originInput').value = ap.city + ' (' + ap.code + ')';

        modal.classList.remove('open');
        showToast('Settings saved!', 'success');
      });
    }
  }

  // ===== THEME TOGGLE =====
  function initThemeToggle() {
    var themeBtn = $('#themeToggle');
    var drawerThemeBtn = $('#drawerThemeToggle');

    function toggleTheme() {
      var newTheme = State.theme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    }

    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    if (drawerThemeBtn) drawerThemeBtn.addEventListener('click', toggleTheme);
  }

  // ===== MOBILE DRAWER =====
  function initMobileDrawer() {
    var hamburger = $('#hamburgerBtn');
    var overlay = $('#mobileDrawerOverlay');
    var drawer = $('#mobileDrawer');
    var closeBtn = $('#closeDrawer');

    function openDrawer() {
      if (overlay) overlay.classList.add('open');
      if (drawer) drawer.classList.add('open');
    }
    function closeDrawer() {
      if (overlay) overlay.classList.remove('open');
      if (drawer) drawer.classList.remove('open');
    }

    if (hamburger) hamburger.addEventListener('click', openDrawer);
    if (overlay) overlay.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  }

  // ===== COMMAND PALETTE =====
  function initCommandPalette() {
    var overlay = $('#cmdOverlay');
    var input = $('#cmdInput');
    var list = $('#cmdList');

    var commands = [
      { label: 'Search flights', action: function() { if ($('#flightTo')) $('#flightTo').focus(); }, kbd: 'S' },
      { label: 'Refresh deals', action: loadDeals, kbd: 'R' },
      { label: 'Toggle theme', action: function() { applyTheme(State.theme === 'dark' ? 'light' : 'dark'); }, kbd: 'D' },
      { label: 'Open settings', action: function() { var m = $('#settingsModal'); if (m) m.classList.add('open'); }, kbd: ',' },
      { label: 'New trip', action: function() { var m = $('#tripModal'); if (m) m.classList.add('open'); }, kbd: 'N' },
      { label: 'Random destination', action: spinRandomDest, kbd: 'L' }
    ];

    function renderCommands(filter) {
      var filtered = commands.filter(function(c) {
        return !filter || c.label.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
      });
      if (list) {
        list.innerHTML = filtered.map(function(c, i) {
          return '<div class="cmd-item' + (i === 0 ? ' selected' : '') + '" data-index="' + i + '">' +
            '<span class="cmd-item-label">' + c.label + '</span>' +
            '<span class="cmd-item-kbd"><kbd>' + c.kbd + '</kbd></span>' +
          '</div>';
        }).join('');
      }
    }

    function openPalette() {
      if (overlay) overlay.classList.add('open');
      if (input) { input.value = ''; input.focus(); }
      renderCommands();
    }
    function closePalette() {
      if (overlay) overlay.classList.remove('open');
    }

    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openPalette(); }
      if (e.key === 'Escape') closePalette();
    });

    if (input) input.addEventListener('input', function() { renderCommands(this.value); });
    if (list) list.addEventListener('click', function(e) {
      var item = e.target.closest('.cmd-item');
      if (!item) return;
      var idx = parseInt(item.dataset.index);
      if (commands[idx]) { commands[idx].action(); closePalette(); }
    });
    if (overlay) overlay.addEventListener('click', function(e) { if (e.target === overlay) closePalette(); });
  }

  // ===== RANDOM DESTINATION =====
  function spinRandomDest() {
    if (typeof AIRPORTS === 'undefined' || AIRPORTS.length === 0) return;
    var filtered = AIRPORTS.filter(function(a) { return a.code !== State.origin; });
    var random = filtered[Math.floor(Math.random() * filtered.length)];
    openDiscoveryCard(random.code);
  }

  // ===== NAV PILLS =====
  function initNavigation() {
    $$('.nav-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        $$('.nav-pill').forEach(function(p) { p.classList.remove('active'); });
        this.classList.add('active');
        var section = this.dataset.section;
        if (section) {
          var el = document.getElementById(section);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    $$('.mobile-nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var drawer = $('#mobileDrawer');
        var overlay = $('#mobileDrawerOverlay');
        if (drawer) drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
      });
    });
  }

  // ===== RESULT TABS (sort tabs) =====
  function initResultTabs() {
    $$('.result-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        $$('.result-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        State.currentSort = this.dataset.tab;
        applyFiltersAndSort();
      });
    });
  }

  // ===== FILTER CHIPS =====
  function initFilterChips() {
    $$('.filter-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var filter = this.dataset.filter;
        if (State.activeFilters.has(filter)) {
          State.activeFilters.delete(filter);
          this.classList.remove('active');
        } else {
          State.activeFilters.add(filter);
          this.classList.add('active');
        }
        applyFiltersAndSort();
      });
    });
  }

  // ===== SEARCH BUTTON =====
  function initSearchButton() {
    var searchBtn = $('#searchFlightsBtn');
    if (searchBtn) searchBtn.addEventListener('click', performSearch);

    // Also allow Enter in the To field
    var toInput = $('#flightTo');
    if (toInput) toInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') performSearch(); });
  }

  // ===== SWAP BUTTON =====
  function initSwapButton() {
    var swapBtn = $('#swapRoute');
    if (swapBtn) {
      swapBtn.addEventListener('click', function() {
        var originInput = $('#originInput');
        var destInput = $('#flightTo');
        var originSelect = $('#originSelect');
        var destSelect = $('#destSelect');

        var tmpInput = originInput ? originInput.value : '';
        var tmpSelect = originSelect ? originSelect.value : '';

        if (originInput && destInput) originInput.value = destInput.value;
        if (originSelect && destSelect) originSelect.value = destSelect.value;
        if (destInput) destInput.value = tmpInput;
        if (destSelect) destSelect.value = tmpSelect;
      });
    }
  }

  // ===== ROUND TRIP TOGGLE =====
  function initRoundTrip() {
    var cb = $('#roundTrip');
    var field = $('#returnDateField');
    if (cb && field) {
      cb.addEventListener('change', function() {
        field.style.display = this.checked ? 'block' : 'none';
      });
    }
  }

  // ===== CALENDAR NAVIGATION =====
  function initCalendarNav() {
    var prevBtn = $('#calPrev');
    var nextBtn = $('#calNext');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        State.calendarMonth--;
        if (State.calendarMonth < 0) { State.calendarMonth = 11; State.calendarYear--; }
        renderPriceCalendar(State.calendarYear, State.calendarMonth, null, null);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        State.calendarMonth++;
        if (State.calendarMonth > 11) { State.calendarMonth = 0; State.calendarYear++; }
        renderPriceCalendar(State.calendarYear, State.calendarMonth, null, null);
      });
    }
  }

  // ===== ROUTE CONTEXT BAR =====
  function initRouteContextBar() {
    var clearBtn = $('#rcbClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        var rcb = $('#routeContextBar');
        if (rcb) rcb.classList.remove('visible');
        if ($('#destSelect')) $('#destSelect').value = '';
        if ($('#flightTo')) $('#flightTo').value = '';
        if ($('#rcbDest')) $('#rcbDest').textContent = '---';
      });
    }
    var editBtn = $('#rcbEditSearch');
    if (editBtn) {
      editBtn.addEventListener('click', function() {
        var globeSection = $('#globe-section');
        if (globeSection) globeSection.scrollIntoView({ behavior: 'smooth' });
        setTimeout(function() { if ($('#flightTo')) $('#flightTo').focus(); }, 500);
      });
    }
  }

  // ===== MODALS: CLOSE ON OVERLAY CLICK =====
  function initModalOverlays() {
    $$('.modal-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
    // Close buttons
    $$('.modal-close').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var modal = this.closest('.modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });
  }

  // ===== SCAN/REFRESH DEALS =====
  function initDealButtons() {
    var scanBtn = $('#scanAllBtn');
    if (scanBtn) scanBtn.addEventListener('click', loadDeals);

    // Lucky button
    var luckyBtn = $('#spinDartBtn');
    if (luckyBtn) luckyBtn.addEventListener('click', spinRandomDest);

    // Discovery search button
    var discSearchBtn = $('#discoverySearchBtn');
    if (discSearchBtn) {
      discSearchBtn.addEventListener('click', function() {
        if (State.currentDiscoveryCity) {
          if ($('#destSelect')) $('#destSelect').value = State.currentDiscoveryCity;
          var airport = getAirportByCode(State.currentDiscoveryCity);
          if (airport && $('#flightTo')) $('#flightTo').value = airport.city + ' (' + airport.code + ')';
          performSearch();
        }
      });
    }

    // Discovery spin again
    var spinAgain = $('#discoverySpinAgain');
    if (spinAgain) spinAgain.addEventListener('click', spinRandomDest);
  }

  // ===== FEATURE 7: SAVE TEMPLATE BUTTON (star icon) =====
  function initSaveTemplateButton() {
    var btn = $('#saveSearchTemplateBtn');
    if (btn) btn.addEventListener('click', saveCurrentSearchTemplate);
  }

  // ===== FEATURE 18: NEARBY TOGGLE =====
  function initNearbyToggle() {
    var toggle = $('#nearbyToggle');
    if (toggle) {
      toggle.addEventListener('change', function() {
        State.nearbyEnabled = this.checked;
      });
    }
  }

  // ===== FEATURE 10: COMPARE BAR =====
  function initCompareBar() {
    var bar = $('#compareBar');
    if (!bar) return;
    var btn = bar.querySelector('.compare-open-btn');
    if (btn) btn.addEventListener('click', openCompareModal);
    var clearBtn = bar.querySelector('.compare-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        State.compareSet.clear();
        $$('.flight-compare-check').forEach(function(cb) { cb.checked = false; });
        updateCompareBar();
      });
    }
    // Compare modal close
    var compareModal = $('#compareModal');
    if (compareModal) {
      var closeBtn = compareModal.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', function() { compareModal.classList.remove('open'); });
    }
  }

  // ===== KEYBOARD SHORTCUTS =====
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      switch(e.key.toLowerCase()) {
        case 'd':
          applyTheme(State.theme === 'dark' ? 'light' : 'dark');
          break;
        case 'l':
          spinRandomDest();
          break;
        case 's':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            var toInput = $('#flightTo');
            if (toInput) toInput.focus();
          }
          break;
      }
    });
  }

  // ===== FEATURE 20: TRIP BUDGET - DESTINATION COST LOADING =====
  function initTripBudgetDefaults() {
    var destInput = $('#tripDestinations');
    if (destInput) {
      destInput.addEventListener('blur', function() {
        var dests = this.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (dests.length > 0) {
          // Try to find airport for first destination
          var dest = dests[0];
          var airport = typeof AIRPORTS !== 'undefined'
            ? AIRPORTS.find(function(a) { return a.city.toLowerCase().indexOf(dest.toLowerCase()) !== -1; })
            : null;
          if (airport) loadCityCosts(airport.code);
        }
      });
    }
  }

  // ===== SCROLL HINT =====
  function initScrollHint() {
    var hint = $('#scrollHint');
    if (hint) {
      window.addEventListener('scroll', function() {
        if (window.scrollY > 100) hint.classList.add('hidden');
        else hint.classList.remove('hidden');
      });
    }
  }

  // ===== NEW TRIP BUTTON =====
  function initNewTripButton() {
    var btn = $('#newTripBtn');
    if (btn) {
      btn.addEventListener('click', function() {
        var modal = $('#tripModal');
        if (modal) modal.classList.add('open');
      });
    }
  }

  // ===== WATCH ROUTE / ALERTS =====
  function initWatchedRoutes() {
    renderWatchedRoutes();
    var addBtn = $('#addWatchRoute');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : '';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        if (!origin || !dest) { showToast('Search a route first', 'warning'); return; }
        State.watchedRoutes.push({
          origin: origin,
          destination: dest,
          date: $('#flightDate') ? $('#flightDate').value : '',
          addedAt: new Date().toISOString()
        });
        localStorage.setItem('mf_watched', JSON.stringify(State.watchedRoutes));
        renderWatchedRoutes();
        showToast('Route ' + origin + '-' + dest + ' is now watched!', 'success');
      });
    }
  }

  function renderWatchedRoutes() {
    var container = $('#watchedRoutes');
    if (!container) return;
    if (State.watchedRoutes.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '<p>Search for flights and click "Watch Route" to track prices.</p>' +
      '</div>';
      return;
    }
    container.innerHTML = State.watchedRoutes.map(function(r, i) {
      return '<div class="watched-route">' +
        '<div class="watched-route-info">' +
          '<div class="watched-route-name">' + escapeHtml(r.origin) + ' ' + String.fromCharCode(8594) + ' ' + escapeHtml(r.destination) + '</div>' +
          '<div class="watched-route-date">' + escapeHtml(r.date || 'Flexible') + ' · Added ' + timeAgo(r.addedAt) + '</div>' +
        '</div>' +
        '<div class="watched-route-actions">' +
          '<button class="btn-outline btn-sm watched-search-btn" data-index="' + i + '">Search</button>' +
          '<button class="btn-text watched-remove-btn" data-index="' + i + '" style="color:var(--danger);">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.watched-search-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var r = State.watchedRoutes[parseInt(this.dataset.index)];
        if (!r) return;
        if ($('#originSelect')) $('#originSelect').value = r.origin;
        if ($('#destSelect')) $('#destSelect').value = r.destination;
        if ($('#flightDate') && r.date) $('#flightDate').value = r.date;
        var oa = getAirportByCode(r.origin);
        if (oa && $('#originInput')) $('#originInput').value = oa.city + ' (' + oa.code + ')';
        var da = getAirportByCode(r.destination);
        if (da && $('#flightTo')) $('#flightTo').value = da.city + ' (' + da.code + ')';
        performSearch();
      });
    });

    container.querySelectorAll('.watched-remove-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        State.watchedRoutes.splice(parseInt(this.dataset.index), 1);
        localStorage.setItem('mf_watched', JSON.stringify(State.watchedRoutes));
        renderWatchedRoutes();
        showToast('Route removed', 'info');
      });
    });
  }

  // ===== ACTION BRIDGE BUTTONS =====
  function initActionBridge() {
    var watchBtn = $('#abWatchRoute');
    if (watchBtn) {
      watchBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : '';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        if (!origin || !dest) return;
        State.watchedRoutes.push({
          origin: origin,
          destination: dest,
          date: $('#flightDate') ? $('#flightDate').value : '',
          addedAt: new Date().toISOString()
        });
        localStorage.setItem('mf_watched', JSON.stringify(State.watchedRoutes));
        renderWatchedRoutes();
        showToast('Route watched!', 'success');
      });
    }

    var alertBtn = $('#abSetAlert');
    if (alertBtn) {
      alertBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : '';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        if (!origin || !dest) return;
        if ($('#alertModalRoute')) $('#alertModalRoute').textContent = origin + ' -> ' + dest;
        var modal = $('#alertModal');
        if (modal) modal.classList.add('open');
      });
    }

    var saveTripBtn = $('#abSaveTrip');
    if (saveTripBtn) {
      saveTripBtn.addEventListener('click', function() {
        var modal = $('#tripModal');
        if (modal) modal.classList.add('open');
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        var airport = getAirportByCode(dest);
        if (airport && $('#tripDestinations')) $('#tripDestinations').value = airport.city;
      });
    }

    var bookBtn = $('#abBookNow');
    if (bookBtn) {
      bookBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : 'HKG';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        var date = $('#flightDate') ? $('#flightDate').value : '';
        window.open('https://www.google.com/travel/flights?q=flights+from+' + origin + '+to+' + dest + '+on+' + date, '_blank');
      });
    }

    // Alert save
    var alertSaveBtn = $('#alertSaveBtn');
    if (alertSaveBtn) {
      alertSaveBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : '';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        var target = $('#alertTargetPrice') ? parseFloat($('#alertTargetPrice').value) : 0;
        if (!target) { showToast('Enter a target price', 'warning'); return; }
        State.alerts.push({
          origin: origin,
          destination: dest,
          targetPrice: target,
          currency: State.currency,
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('mf_alerts', JSON.stringify(State.alerts));
        var modal = $('#alertModal');
        if (modal) modal.classList.remove('open');
        showToast('Alert set for ' + formatPrice(target) + '!', 'success');
        renderAlerts();
      });
    }
  }

  function renderAlerts() {
    var container = $('#alertsList');
    if (!container) return;
    if (State.alerts.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = State.alerts.map(function(a, i) {
      return '<div class="alert-item">' +
        '<span class="alert-route">' + escapeHtml(a.origin) + ' ' + String.fromCharCode(8594) + ' ' + escapeHtml(a.destination) + '</span>' +
        '<span class="alert-target">Below ' + formatPrice(a.targetPrice) + '</span>' +
        '<button class="btn-text" onclick="this.closest(\'.alert-item\').remove();" style="color:var(--danger);font-size:11px;">Remove</button>' +
      '</div>';
    }).join('');
  }

  // ===== FEATURE 17: SHARE BUTTONS ON RESULTS =====
  function initShareButtons() {
    // Discovery share button
    var discShareBtn = $('#discoveryShareBtn');
    if (discShareBtn) {
      discShareBtn.addEventListener('click', function() {
        if (State.currentDiscoveryCity) {
          shareSearch({ destination: State.currentDiscoveryCity, type: 'discovery' });
        }
      });
    }

    // Search results share (via toolbar)
    var shareResultsBtn = $('#shareResultsBtn');
    if (shareResultsBtn) {
      shareResultsBtn.addEventListener('click', function() {
        var origin = $('#originSelect') ? $('#originSelect').value : '';
        var dest = $('#destSelect') ? $('#destSelect').value : '';
        var date = $('#flightDate') ? $('#flightDate').value : '';
        shareSearch({ origin: origin, destination: dest, date: date });
      });
    }
  }

  // ===== INIT ON DOM READY =====
  function init() {
    // Apply saved theme
    applyTheme(State.theme);

    // Init origin
    if ($('#originSelect')) $('#originSelect').value = State.origin;
    var originAirport = getAirportByCode(State.origin);
    if (originAirport && $('#originInput')) $('#originInput').value = originAirport.city + ' (' + originAirport.code + ')';
    if ($('#currencySelect')) $('#currencySelect').value = State.currency;

    // Set default date to tomorrow
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var dateStr = tomorrow.toISOString().slice(0, 10);
    if ($('#flightDate') && !$('#flightDate').value) $('#flightDate').value = dateStr;

    // Init autocomplete
    initAutocomplete($('#originInput'), $('#originDropdown'), $('#originSelect'));
    initAutocomplete($('#flightTo'), $('#destDropdown'), $('#destSelect'));

    // Init all features
    initThemeToggle();
    initMobileDrawer();
    initCommandPalette();
    initNavigation();
    initResultTabs();
    initFilterChips();
    initSearchButton();
    initSwapButton();
    initRoundTrip();
    initCalendarNav();
    initRouteContextBar();
    initModalOverlays();
    initDealButtons();
    initSettings();
    initTripModal();
    initNewTripButton();
    initWatchedRoutes();
    initActionBridge();
    initKeyboardShortcuts();
    initScrollHint();
    initShareButtons();

    // Feature 7: Search templates
    renderSearchTemplates();
    initSaveTemplateButton();

    // Feature 18: Nearby toggle
    initNearbyToggle();

    // Feature 10: Compare bar
    initCompareBar();

    // Feature 6: Recent searches
    loadRecentSearches();

    // Feature 15: Weekend getaways
    renderWeekendGetaways();

    // Feature 20: Trip budget defaults
    initTripBudgetDefaults();

    // Render trips
    renderTrips();
    renderAlerts();

    // Fix #15: Service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }

    // Fix #16: Globe initialization (globe.gl is loaded, container exists)
    initGlobe();

    // Fix #28: Auto-load deals on page init
    loadDeals();

    console.log('MindFlight v2 initialized with 20 features');
  }

  // ===== Fix #16: Globe initialization =====
  function initGlobe() {
    var container = document.getElementById('globeViz');
    if (!container || typeof Globe === 'undefined') return;

    var globe = Globe()
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .pointOfView({ lat: 22.3, lng: 114.2, altitude: 2.5 })
      .width(container.clientWidth)
      .height(container.clientHeight);

    globe(container);

    // Add arcs when flights are searched
    window._mfGlobe = globe;

    // Resize handler
    window.addEventListener('resize', function() {
      if (container.clientWidth > 0) {
        globe.width(container.clientWidth).height(container.clientHeight);
      }
    });

    // Add airport points if available
    if (typeof AIRPORTS !== 'undefined') {
      var points = AIRPORTS.slice(0, 50).map(function(a) {
        return { lat: a.lat || 0, lng: a.lon || 0, size: 0.3, color: '#00d4aa', label: a.city + ' (' + a.code + ')' };
      });
      globe.pointsData(points)
        .pointAltitude('size')
        .pointColor('color')
        .pointLabel('label')
        .onPointClick(function(point) {
          // Find the airport code from label
          var match = point.label.match(/\(([A-Z]{3})\)/);
          if (match) openDiscoveryCard(match[1]);
        });
    }
  }

  // ===== Fix #30: Route context bar stepper =====
  function updateRouteStep(stepName) {
    var steps = document.querySelectorAll('.rcb-step');
    var found = false;
    steps.forEach(function(step) {
      if (found) {
        step.classList.remove('completed', 'active');
      } else if (step.dataset.step === stepName) {
        step.classList.add('active');
        step.classList.remove('completed');
        found = true;
      } else {
        step.classList.add('completed');
        step.classList.remove('active');
      }
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
