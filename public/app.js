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
    var activeIndex = -1;

    // WAI-ARIA combobox pattern (P2 Fix #11)
    var listboxId = 'listbox-' + Math.random().toString(36).slice(2, 8);
    inputEl.setAttribute('role', 'combobox');
    inputEl.setAttribute('aria-autocomplete', 'list');
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.setAttribute('aria-owns', listboxId);
    inputEl.setAttribute('aria-haspopup', 'listbox');
    dropdownEl.setAttribute('role', 'listbox');
    dropdownEl.setAttribute('id', listboxId);

    function updateDropdown(matches) {
      if (matches.length === 0) {
        dropdownEl.classList.remove('open');
        inputEl.setAttribute('aria-expanded', 'false');
        inputEl.removeAttribute('aria-activedescendant');
        activeIndex = -1;
        return;
      }
      dropdownEl.innerHTML = matches.map(function(a, i) {
        var optId = listboxId + '-opt-' + i;
        return '<div class="airport-option" role="option" id="' + optId + '" data-code="' + escapeHtml(a.code) + '" data-city="' + escapeHtml(a.city) + '" aria-selected="false">' +
          '<span class="airport-option-code">' + escapeHtml(a.code) + '</span>' +
          '<span class="airport-option-city">' + escapeHtml(a.city) + '</span>' +
          '<span class="airport-option-country">' + escapeHtml(a.country) + '</span>' +
        '</div>';
      }).join('');
      dropdownEl.classList.add('open');
      inputEl.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    }

    function selectOption(opt) {
      var code = opt.dataset.code;
      var city = opt.dataset.city;
      inputEl.value = city + ' (' + code + ')';
      if (hiddenEl) hiddenEl.value = code;
      dropdownEl.classList.remove('open');
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    }

    function setActiveDescendant(idx) {
      var options = dropdownEl.querySelectorAll('.airport-option');
      options.forEach(function(o) { o.classList.remove('active'); o.setAttribute('aria-selected', 'false'); });
      if (idx >= 0 && idx < options.length) {
        options[idx].classList.add('active');
        options[idx].setAttribute('aria-selected', 'true');
        inputEl.setAttribute('aria-activedescendant', options[idx].id);
        options[idx].scrollIntoView({ block: 'nearest' });
      } else {
        inputEl.removeAttribute('aria-activedescendant');
      }
    }

    inputEl.addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      if (q.length < 1) { dropdownEl.classList.remove('open'); inputEl.setAttribute('aria-expanded', 'false'); return; }
      var matches = airports.filter(function(a) {
        return a.code.toLowerCase().indexOf(q) !== -1 ||
               a.city.toLowerCase().indexOf(q) !== -1 ||
               a.country.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);
      updateDropdown(matches);
    });

    inputEl.addEventListener('keydown', function(e) {
      var options = dropdownEl.querySelectorAll('.airport-option');
      if (!options.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
        setActiveDescendant(activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        setActiveDescendant(activeIndex);
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        selectOption(options[activeIndex]);
      } else if (e.key === 'Escape') {
        dropdownEl.classList.remove('open');
        inputEl.setAttribute('aria-expanded', 'false');
        activeIndex = -1;
      }
    });

    dropdownEl.addEventListener('click', function(e) {
      var opt = e.target.closest('.airport-option');
      if (!opt) return;
      selectOption(opt);
    });

    document.addEventListener('click', function(e) {
      if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        dropdownEl.classList.remove('open');
        inputEl.setAttribute('aria-expanded', 'false');
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
    var dealLabel = '';
    if (flight.deal === 'great') { dealClass = 'deal-great'; dealLabel = 'Great Deal'; }
    else if (flight.deal === 'fair') { dealClass = 'deal-fair'; dealLabel = 'Fair Price'; }
    else if (flight.deal === 'high') { dealClass = 'deal-high'; dealLabel = 'Above Average'; }

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
      (dealLabel ? '<span class="deal-quality-badge ' + dealClass + '">' + dealLabel + '</span>' : '') +
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

      return '<div class="trip-card" data-index="' + i + '" role="button" tabindex="0" aria-label="Open trip ' + escapeHtml(trip.name || 'Untitled Trip') + '">' +
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
          '<button class="btn-primary btn-sm trip-open-btn" data-index="' + i + '" aria-label="Plan trip">Plan Trip</button>' +
          '<button class="btn-outline trip-calendar-btn" data-index="' + i + '" aria-label="Add to calendar">Calendar</button>' +
          '<button class="btn-outline trip-share-btn" data-index="' + i + '" aria-label="Share trip">Share</button>' +
          '<button class="btn-text trip-delete-btn" data-index="' + i + '" style="color:var(--danger);" aria-label="Delete trip">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.trip-open-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openTripDetail(parseInt(this.dataset.index));
      });
    });
    container.querySelectorAll('.trip-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        openTripDetail(parseInt(this.dataset.index));
      });
      card.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') openTripDetail(parseInt(this.dataset.index));
      });
    });
    container.querySelectorAll('.trip-calendar-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        downloadICS(State.trips[parseInt(this.dataset.index)]);
      });
    });
    container.querySelectorAll('.trip-share-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        shareTrip(State.trips[parseInt(this.dataset.index)]);
      });
    });
    container.querySelectorAll('.trip-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
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
          var seasonLabel = 'Best';
          if (m.season === 'shoulder' || m.rating === 'ok' || m.rating === 'fair') { cls = 'seasonal-ok'; seasonLabel = 'OK'; }
          else if (m.season === 'off' || m.rating === 'avoid' || m.rating === 'bad') { cls = 'seasonal-avoid'; seasonLabel = 'Avoid'; }
          var isCurrent = i === currentMonth;
          var tempDisplay = m.avgTemp !== undefined ? m.avgTemp + '\u00b0' : (m.temp || '');
          return '<div class="seasonal-month ' + cls + (isCurrent ? ' seasonal-current' : '') + '" title="' + months[i] + ': ' + tempDisplay + (m.note ? ' - ' + m.note : '') + '">' +
            '<span class="seasonal-month-label">' + months[i].charAt(0) + '</span>' +
            '<span class="seasonal-season-label">' + seasonLabel + '</span>' +
            (tempDisplay ? '<span class="seasonal-month-temp">' + tempDisplay + '</span>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="seasonal-legend"><span class="seasonal-legend-item"><span class="seasonal-dot seasonal-great"></span> Best</span><span class="seasonal-legend-item"><span class="seasonal-dot seasonal-ok"></span> OK</span><span class="seasonal-legend-item"><span class="seasonal-dot seasonal-avoid"></span> Avoid</span></div>' +
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

    // P2 Fix #13: ARIA grid role and arrow key navigation
    calGrid.setAttribute('role', 'grid');
    calGrid.querySelectorAll('.cal-day:not(.empty)').forEach(function(day) {
      day.setAttribute('role', 'gridcell');
      day.setAttribute('tabindex', '-1');
    });
    // Make first non-empty day tabbable
    var firstDay = calGrid.querySelector('.cal-day:not(.empty)');
    if (firstDay) firstDay.setAttribute('tabindex', '0');

    // Click handler
    calGrid.querySelectorAll('.cal-day:not(.empty)').forEach(function(day) {
      day.addEventListener('click', function() {
        var date = this.dataset.date;
        if ($('#flightDate')) $('#flightDate').value = date;
        calGrid.querySelectorAll('.cal-day').forEach(function(d) { d.classList.remove('selected'); });
        this.classList.add('selected');
      });
    });

    // Arrow key navigation
    calGrid.addEventListener('keydown', function(e) {
      var allDays = Array.from(calGrid.querySelectorAll('.cal-day'));
      var focusedIdx = allDays.indexOf(document.activeElement);
      if (focusedIdx < 0) return;
      var newIdx = focusedIdx;
      if (e.key === 'ArrowRight') { newIdx = focusedIdx + 1; }
      else if (e.key === 'ArrowLeft') { newIdx = focusedIdx - 1; }
      else if (e.key === 'ArrowDown') { newIdx = focusedIdx + 7; }
      else if (e.key === 'ArrowUp') { newIdx = focusedIdx - 7; }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        allDays[focusedIdx].click();
        return;
      }
      else return;
      e.preventDefault();
      // Skip empty days
      while (newIdx >= 0 && newIdx < allDays.length && allDays[newIdx].classList.contains('empty')) {
        newIdx += (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      }
      if (newIdx >= 0 && newIdx < allDays.length && !allDays[newIdx].classList.contains('empty')) {
        allDays[focusedIdx].setAttribute('tabindex', '-1');
        allDays[newIdx].setAttribute('tabindex', '0');
        allDays[newIdx].focus();
      }
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

  async function renderWeekendGetaways() {
    var container = $('#weekendGetaways');
    if (!container) return;
    var weekends = getNextWeekends(4);
    var destinations = typeof AIRPORTS !== 'undefined'
      ? AIRPORTS.filter(function(a) { return a.region === 'asia' && a.code !== State.origin; }).slice(0, 8)
      : [];

    if (destinations.length === 0) { container.style.display = 'none'; return; }

    // Fetch cached prices from the server
    var cachedPrices = {};
    try {
      var priceData = await apiFetch('/api/explore?origin=' + State.origin);
      if (priceData && priceData.destinations) {
        priceData.destinations.forEach(function(d) { cachedPrices[d.code] = d.price; });
      }
    } catch(e) { /* cached prices optional */ }

    var html = '<div class="section-header"><h2 class="section-title">Weekend Getaways</h2></div>' +
      '<div class="weekend-scroll">';
    var destIdx = 0;
    weekends.forEach(function(wk) {
      var dest = destinations[destIdx % destinations.length];
      destIdx++;
      var cachedPrice = cachedPrices[dest.code];
      var priceText = cachedPrice ? 'From ' + currSym() + Math.round(cachedPrice) : 'Check price';
      html += '<button class="weekend-card" data-dest="' + dest.code + '" data-date="' + wk.fri + '">' +
        '<div class="weekend-card-city">' + (dest.flag || '') + ' ' + dest.city + '</div>' +
        '<div class="weekend-card-dates">' + wk.label + '</div>' +
        '<div class="weekend-card-price">' + priceText + '</div>' +
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
        var routeObj = {
          origin: origin,
          destination: dest,
          date: $('#flightDate') ? $('#flightDate').value : '',
          addedAt: new Date().toISOString()
        };
        // Sync to server
        apiFetch('/api/travel/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: origin, destination: dest, travelDate: routeObj.date || new Date().toISOString().slice(0,10), label: origin + ' \u2192 ' + dest })
        });
        State.watchedRoutes.push(routeObj);
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
        var abRouteObj = {
          origin: origin,
          destination: dest,
          date: $('#flightDate') ? $('#flightDate').value : '',
          addedAt: new Date().toISOString()
        };
        // Sync to server
        apiFetch('/api/travel/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: origin, destination: dest, travelDate: abRouteObj.date || new Date().toISOString().slice(0,10), label: origin + ' \u2192 ' + dest })
        });
        State.watchedRoutes.push(abRouteObj);
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
        var alertObj = {
          origin: origin,
          destination: dest,
          targetPrice: target,
          currency: State.currency,
          createdAt: new Date().toISOString()
        };
        // Sync to server
        apiFetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertObj)
        }).then(function(resp) {
          if (resp && resp.id) alertObj.serverId = resp.id;
        });
        State.alerts.push(alertObj);
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
        '<button class="btn-text alert-remove-btn" data-index="' + i + '" style="color:var(--danger);font-size:11px;">Remove</button>' +
      '</div>';
    }).join('');
    // Attach removal handlers that properly update state and localStorage
    container.querySelectorAll('.alert-remove-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(this.dataset.index);
        // Also delete from server if it has a server id
        var alert = State.alerts[idx];
        if (alert && alert.serverId) {
          apiFetch('/api/alerts/' + alert.serverId, { method: 'DELETE' });
        }
        State.alerts.splice(idx, 1);
        localStorage.setItem('mf_alerts', JSON.stringify(State.alerts));
        renderAlerts();
        showToast('Alert removed', 'info');
      });
    });
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

    // Trip planner (Features 1-12)
    initTripPlanner();

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

    // P2 Fix #12: Focus trapping for modals
    document.querySelectorAll('.modal-overlay').forEach(function(m) {
      modalObserver.observe(m, { attributes: true, attributeFilter: ['class'] });
    });

    // P2 Fix #16: More options toggle
    initMoreOptionsToggle();

    // P2 Fix #15: First-run origin picker
    initOriginPicker();

    console.log('MindFlight v2 initialized with 20 features');
  }

  // ===== P2 FIX #12: FOCUS TRAPPING FOR MODALS =====
  function trapFocus(modalOverlay) {
    if (!modalOverlay) return;
    var focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var previousFocus = document.activeElement;

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        modalOverlay.classList.remove('open');
        if (previousFocus) previousFocus.focus();
        modalOverlay.removeEventListener('keydown', handleKeydown);
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = Array.from(modalOverlay.querySelectorAll(focusableSelector)).filter(function(el) {
        return el.offsetParent !== null;
      });
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    modalOverlay.addEventListener('keydown', handleKeydown);

    // Focus first focusable element
    setTimeout(function() {
      var focusable = modalOverlay.querySelectorAll(focusableSelector);
      if (focusable.length > 0) focusable[0].focus();
    }, 100);

    // Return cleanup function
    return function() {
      modalOverlay.removeEventListener('keydown', handleKeydown);
      if (previousFocus) previousFocus.focus();
    };
  }

  // Observe modal opens and trap focus
  var modalObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var target = m.target;
        if (target.classList.contains('modal-overlay') && target.classList.contains('open')) {
          trapFocus(target);
        }
      }
    });
  });

  // ===== P2 FIX #16: MORE OPTIONS TOGGLE =====
  function initMoreOptionsToggle() {
    var toggle = $('#moreOptionsToggle');
    var panel = $('#moreOptionsPanel');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', function() {
      var expanded = panel.style.display !== 'none';
      panel.style.display = expanded ? 'none' : 'flex';
      toggle.setAttribute('aria-expanded', !expanded);
      toggle.querySelector('span').textContent = expanded ? 'More options' : 'Fewer options';
    });
  }

  // ===== P2 FIX #15: FIRST-RUN ORIGIN PICKER =====
  function initOriginPicker() {
    if (localStorage.getItem('mf_origin_set')) return;
    var modal = $('#originPickerModal');
    if (!modal) return;

    // Init autocomplete for origin picker
    initAutocomplete($('#originPickerInput'), $('#originPickerDropdown'), $('#originPickerSelect'));

    modal.classList.add('open');

    var saveBtn = $('#originPickerSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var code = $('#originPickerSelect') ? $('#originPickerSelect').value : '';
        var currency = $('#originPickerCurrency') ? $('#originPickerCurrency').value : 'GBP';
        if (!code) { showToast('Please select an airport', 'warning'); return; }

        // Set origin
        State.origin = code;
        localStorage.setItem('mf_origin', code);
        localStorage.setItem('mf_origin_set', '1');
        if ($('#originSelect')) $('#originSelect').value = code;
        var airport = getAirportByCode(code);
        if (airport && $('#originInput')) $('#originInput').value = airport.city + ' (' + airport.code + ')';

        // Set currency
        State.currency = currency;
        localStorage.setItem('mf_currency', currency);
        if ($('#currencySelect')) $('#currencySelect').value = currency;

        modal.classList.remove('open');
        showToast('Welcome! Home airport set to ' + code, 'success');
        loadDeals();
      });
    }
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

  // ============================================================
  // TRIP PLANNER — Features 1-12: Full Trip Planning System
  // ============================================================

  // Color maps
  var ITINERARY_TYPE_COLORS = {
    activity: '#6366f1', meal: '#f59e0b', transport: '#3b82f6',
    sightseeing: '#10b981', accommodation: '#ec4899', other: '#94a3b8'
  };
  var ITINERARY_TYPE_ICONS = {
    activity: '\u{1F3AF}', meal: '\u{1F37D}', transport: '\u{1F68C}',
    sightseeing: '\u{1F5FC}', accommodation: '\u{1F3E8}', other: '\u{1F4CC}'
  };
  var EXPENSE_CATEGORY_COLORS = {
    food: '#f59e0b', transport: '#3b82f6', accommodation: '#ec4899',
    activities: '#10b981', shopping: '#8b5cf6', other: '#94a3b8'
  };
  var DAY_COLORS = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];
  var DOC_TYPE_ICONS = {
    booking: '\u{1F4CB}', passport: '\u{1F6C2}', insurance: '\u{1F3E5}',
    emergency: '\u{1F6A8}', visa: '\u{1F4C4}', other: '\u{1F4CE}'
  };

  // Trip planner state
  var TripPlanner = {
    currentTripIndex: -1,
    currentDay: 1,
    leafletMap: null,
    leafletMarkers: [],
    exchangeRateCache: {},
    travelTimeCache: {}
  };

  // --- LocalStorage helpers for trip sub-data ---
  function getTripStorageKey(tripIndex, type) {
    return 'mf-trip-' + tripIndex + '-' + type;
  }
  function getTripSubData(tripIndex, type) {
    try {
      return JSON.parse(localStorage.getItem(getTripStorageKey(tripIndex, type)) || '[]');
    } catch(e) { return []; }
  }
  function setTripSubData(tripIndex, type, data) {
    localStorage.setItem(getTripStorageKey(tripIndex, type), JSON.stringify(data));
  }
  function getTripSubObj(tripIndex, type) {
    try {
      return JSON.parse(localStorage.getItem(getTripStorageKey(tripIndex, type)) || '{}');
    } catch(e) { return {}; }
  }
  function setTripSubObj(tripIndex, type, data) {
    localStorage.setItem(getTripStorageKey(tripIndex, type), JSON.stringify(data));
  }

  // --- Compute trip days between depart and return ---
  function computeTripDays(departDate, returnDate) {
    if (!departDate) return 1;
    var dep = new Date(departDate);
    var ret = returnDate ? new Date(returnDate) : dep;
    var diff = Math.floor((ret - dep) / 86400000) + 1;
    return Math.max(diff, 1);
  }

  // --- Open trip detail view ---
  function openTripDetail(tripIndex) {
    var trip = State.trips[tripIndex];
    if (!trip) return;
    TripPlanner.currentTripIndex = tripIndex;
    TripPlanner.currentDay = 1;

    var detailView = $('#tripDetailView');
    var listView = $('#tripsList');
    var newBtn = $('#newTripBtn');
    if (listView) listView.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
    if (detailView) detailView.style.display = 'block';

    // Fill header
    var nameEl = $('#tripDetailName');
    var datesEl = $('#tripDetailDates');
    var countdownEl = $('#tripDetailCountdown');
    if (nameEl) nameEl.textContent = trip.name || 'Untitled Trip';
    if (datesEl) datesEl.textContent = (trip.departDate || '') + (trip.returnDate ? ' \u2013 ' + trip.returnDate : '');
    if (countdownEl) countdownEl.textContent = getCountdownText(trip);

    // Render day tabs
    renderDayTabs(trip);
    // Switch to itinerary tab
    switchTripSubTab('itinerary');
    // Render itinerary for day 1
    renderItineraryDay();
  }

  // --- Close trip detail view ---
  function closeTripDetail() {
    var detailView = $('#tripDetailView');
    var listView = $('#tripsList');
    var newBtn = $('#newTripBtn');
    if (detailView) detailView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    if (newBtn) newBtn.style.display = 'inline-flex';
    TripPlanner.currentTripIndex = -1;
    destroyTripMap();
    renderTrips();
  }

  // --- Sub-tab switching ---
  function switchTripSubTab(tabName) {
    $$('.trip-subtab').forEach(function(btn) {
      var isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    $$('.trip-tab-panel').forEach(function(panel) {
      panel.classList.remove('active');
    });
    var targetPanel = $('#tripTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (targetPanel) targetPanel.classList.add('active');

    // Render tab-specific content
    if (tabName === 'itinerary') renderItineraryDay();
    if (tabName === 'budget') renderExpensesTab();
    if (tabName === 'map') initTripMap();
    if (tabName === 'checklist') renderChecklistTab();
    if (tabName === 'notes') renderNotesTab();
  }

  // --- Day tabs ---
  function renderDayTabs(trip) {
    var container = $('#dayTabs');
    if (!container) return;
    var numDays = computeTripDays(trip.departDate, trip.returnDate);
    var html = '';
    for (var i = 1; i <= numDays; i++) {
      var dateLabel = '';
      if (trip.departDate) {
        var d = new Date(trip.departDate);
        d.setDate(d.getDate() + i - 1);
        dateLabel = ' ' + (d.getMonth() + 1) + '/' + d.getDate();
      }
      html += '<button class="day-tab' + (i === TripPlanner.currentDay ? ' active' : '') + '" data-day="' + i + '" role="tab" aria-label="Day ' + i + escapeHtml(dateLabel) + '">' +
        'Day ' + i + '<small style="opacity:0.7;margin-left:4px;">' + escapeHtml(dateLabel) + '</small></button>';
    }
    container.innerHTML = html;

    // Attach click handlers
    container.querySelectorAll('.day-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        TripPlanner.currentDay = parseInt(this.dataset.day);
        container.querySelectorAll('.day-tab').forEach(function(b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        renderItineraryDay();
      });
    });
  }

  // ===== FEATURE 3: DAY-BY-DAY ITINERARY BUILDER =====
  function renderItineraryDay() {
    var idx = TripPlanner.currentTripIndex;
    var day = TripPlanner.currentDay;
    if (idx < 0) return;
    var trip = State.trips[idx];

    var itinerary = getTripSubData(idx, 'itinerary');
    var dayItems = itinerary.filter(function(item) { return item.dayNumber === day; });
    dayItems.sort(function(a, b) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    var listEl = $('#itineraryList');
    if (!listEl) return;

    if (dayItems.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:20px;"><p>No activities planned for this day yet.</p></div>';
    } else {
      var html = '';
      for (var i = 0; i < dayItems.length; i++) {
        var item = dayItems[i];
        var color = ITINERARY_TYPE_COLORS[item.type] || ITINERARY_TYPE_COLORS.other;
        var icon = ITINERARY_TYPE_ICONS[item.type] || ITINERARY_TYPE_ICONS.other;
        html += '<div class="itinerary-item-card" draggable="true" data-id="' + escapeHtml(item.id) + '" data-sort="' + item.sortOrder + '">' +
          '<div class="itinerary-time">' + escapeHtml(item.startTime || '--:--') + '</div>' +
          '<div class="itinerary-type-icon" style="background:' + color + '22;">' + icon + '</div>' +
          '<div class="itinerary-item-body">' +
            '<div class="itinerary-item-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
            (item.location ? '<div class="itinerary-item-location">' + escapeHtml(item.location) + '</div>' : '') +
            (item.notes ? '<div class="itinerary-item-notes">' + escapeHtml(item.notes) + '</div>' : '') +
          '</div>' +
          '<div class="itinerary-item-actions">' +
            '<button class="delete-btn" data-id="' + escapeHtml(item.id) + '" aria-label="Delete activity">&times;</button>' +
          '</div>' +
        '</div>';

        // Travel connector between items
        if (i < dayItems.length - 1 && item.lat && item.lng && dayItems[i+1].lat && dayItems[i+1].lng) {
          var dist = haversineDistance(item.lat, item.lng, dayItems[i+1].lat, dayItems[i+1].lng);
          var mode = dist < 3 ? 'walk' : 'drive';
          var timeEst = mode === 'walk' ? Math.round(dist / 5 * 60) : Math.round(dist / 30 * 60);
          html += '<div class="travel-connector"><div class="travel-connector-info">' +
            '~' + timeEst + ' min ' + mode + ' (' + dist.toFixed(1) + ' km)</div></div>';
        }
      }
      listEl.innerHTML = html;

      // Drag and drop
      initItineraryDragDrop(listEl);

      // Delete buttons
      listEl.querySelectorAll('.delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteItineraryItem(this.dataset.id);
        });
      });
    }

    // Render accommodation bar
    renderAccommodationBar();

    // Render weather
    renderDayWeather();
  }

  // Haversine distance in km
  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Add activity
  function addItineraryItem(itemData) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var itinerary = getTripSubData(idx, 'itinerary');
    var dayItems = itinerary.filter(function(item) { return item.dayNumber === TripPlanner.currentDay; });
    var newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      dayNumber: TripPlanner.currentDay,
      sortOrder: dayItems.length,
      type: itemData.type || 'activity',
      title: itemData.title || '',
      location: itemData.location || '',
      startTime: itemData.startTime || '',
      notes: itemData.notes || '',
      lat: itemData.lat || null,
      lng: itemData.lng || null,
      createdAt: new Date().toISOString()
    };
    itinerary.push(newItem);
    setTripSubData(idx, 'itinerary', itinerary);
    renderItineraryDay();
    showToast('Activity added!', 'success');

    // Try to geocode
    if (newItem.location && !newItem.lat) {
      geocodeLocation(newItem.location, newItem.id);
    }
  }

  // Delete activity
  function deleteItineraryItem(itemId) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var itinerary = getTripSubData(idx, 'itinerary');
    itinerary = itinerary.filter(function(item) { return item.id !== itemId; });
    setTripSubData(idx, 'itinerary', itinerary);
    renderItineraryDay();
    showToast('Activity deleted', 'info');
  }

  // Geocode a location string using Nominatim
  function geocodeLocation(locationStr, itemId) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(locationStr) + '&format=json&limit=1')
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (results && results.length > 0) {
          var lat = parseFloat(results[0].lat);
          var lng = parseFloat(results[0].lon);
          var itinerary = getTripSubData(idx, 'itinerary');
          for (var i = 0; i < itinerary.length; i++) {
            if (itinerary[i].id === itemId) {
              itinerary[i].lat = lat;
              itinerary[i].lng = lng;
              break;
            }
          }
          setTripSubData(idx, 'itinerary', itinerary);
        }
      })
      .catch(function() {});
  }

  // Drag and drop for itinerary reordering
  function initItineraryDragDrop(listEl) {
    var dragItem = null;
    listEl.querySelectorAll('.itinerary-item-card').forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        dragItem = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
      });
      card.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        listEl.querySelectorAll('.itinerary-item-card').forEach(function(c) { c.classList.remove('drag-over'); });
        // Save new order
        saveItineraryOrder(listEl);
      });
      card.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (dragItem && dragItem !== this) {
          this.classList.add('drag-over');
        }
      });
      card.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
      });
      card.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (dragItem && dragItem !== this) {
          // Insert before or after
          var rect = this.getBoundingClientRect();
          var midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            listEl.insertBefore(dragItem, this);
          } else {
            listEl.insertBefore(dragItem, this.nextSibling);
          }
        }
      });
    });
  }

  function saveItineraryOrder(listEl) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var itinerary = getTripSubData(idx, 'itinerary');
    var cards = listEl.querySelectorAll('.itinerary-item-card');
    cards.forEach(function(card, i) {
      var id = card.dataset.id;
      for (var j = 0; j < itinerary.length; j++) {
        if (itinerary[j].id === id) {
          itinerary[j].sortOrder = i;
          break;
        }
      }
    });
    setTripSubData(idx, 'itinerary', itinerary);
  }

  // ===== FEATURE 9: ACCOMMODATION TRACKER =====
  function renderAccommodationBar() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];
    var barEl = $('#accommodationBar');
    if (!barEl) return;

    var accommodations = getTripSubData(idx, 'accommodation');
    if (accommodations.length === 0) {
      barEl.innerHTML = '';
      return;
    }

    var day = TripPlanner.currentDay;
    var dayDate = null;
    if (trip.departDate) {
      dayDate = new Date(trip.departDate);
      dayDate.setDate(dayDate.getDate() + day - 1);
    }

    var html = '';
    var hasCoverage = false;
    accommodations.forEach(function(acc) {
      var checkIn = new Date(acc.checkIn);
      var checkOut = new Date(acc.checkOut);
      if (dayDate && dayDate >= checkIn && dayDate < checkOut) {
        hasCoverage = true;
        html += '<div class="accommodation-item">' +
          '<span class="accommodation-item-name">' + escapeHtml(acc.name) + '</span>' +
          '<span class="accommodation-item-dates">' + escapeHtml(acc.checkIn) + ' \u2013 ' + escapeHtml(acc.checkOut) + '</span>' +
          (acc.costPerNight ? '<span class="accommodation-item-cost">' + formatPrice(acc.costPerNight) + '/night</span>' : '') +
          '<button class="accommodation-item-delete" data-id="' + escapeHtml(acc.id) + '" aria-label="Remove accommodation">&times;</button>' +
        '</div>';
      }
    });

    if (!hasCoverage && dayDate) {
      html += '<div class="accommodation-warning">No accommodation booked for this night</div>';
    }

    barEl.innerHTML = html;

    barEl.querySelectorAll('.accommodation-item-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var accId = this.dataset.id;
        var accs = getTripSubData(idx, 'accommodation');
        accs = accs.filter(function(a) { return a.id !== accId; });
        setTripSubData(idx, 'accommodation', accs);
        renderAccommodationBar();
        showToast('Accommodation removed', 'info');
      });
    });
  }

  // ===== FEATURE 11: WEATHER FORECAST ON TRIP DAYS =====
  function renderDayWeather() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];
    var weatherEl = $('#dayWeather');
    if (!weatherEl || !trip.departDate) { if (weatherEl) weatherEl.innerHTML = ''; return; }

    var dayDate = new Date(trip.departDate);
    dayDate.setDate(dayDate.getDate() + TripPlanner.currentDay - 1);
    var dateStr = dayDate.toISOString().slice(0, 10);

    // Try to get destination coordinates
    var dest = (trip.destinations && trip.destinations[0]) || '';
    if (!dest) { weatherEl.innerHTML = ''; return; }

    var airport = typeof AIRPORTS !== 'undefined'
      ? AIRPORTS.find(function(a) { return a.city.toLowerCase().indexOf(dest.toLowerCase()) !== -1; })
      : null;
    if (!airport || !airport.lat) { weatherEl.innerHTML = ''; return; }

    var cacheKey = 'weather_' + airport.code + '_' + dateStr;
    if (State.apiCaches[cacheKey]) {
      renderWeatherData(weatherEl, State.apiCaches[cacheKey]);
      return;
    }

    // Fetch from Open-Meteo
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + airport.lat + '&longitude=' + (airport.lon || airport.lng) +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode' +
      '&start_date=' + dateStr + '&end_date=' + dateStr + '&timezone=auto')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.daily) {
          var weatherData = {
            high: data.daily.temperature_2m_max ? data.daily.temperature_2m_max[0] : null,
            low: data.daily.temperature_2m_min ? data.daily.temperature_2m_min[0] : null,
            precip: data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[0] : null,
            code: data.daily.weathercode ? data.daily.weathercode[0] : null
          };
          State.apiCaches[cacheKey] = weatherData;
          renderWeatherData(weatherEl, weatherData);
        }
      })
      .catch(function() { weatherEl.innerHTML = ''; });
  }

  function renderWeatherData(el, data) {
    if (!data || data.high === null) { el.innerHTML = ''; return; }
    var icon = getWeatherIcon(data.code);
    el.innerHTML = '<span class="day-weather-icon">' + icon + '</span>' +
      '<span class="day-weather-temp">' + Math.round(data.high) + '\u00b0 / ' + Math.round(data.low) + '\u00b0C</span>' +
      (data.precip !== null ? '<span class="day-weather-precip">\u{1F327} ' + data.precip + '%</span>' : '');
  }

  function getWeatherIcon(code) {
    if (code === null || code === undefined) return '\u2601';
    if (code === 0) return '\u2600\uFE0F';
    if (code <= 3) return '\u26C5';
    if (code <= 48) return '\u{1F32B}';
    if (code <= 67) return '\u{1F327}';
    if (code <= 77) return '\u{1F328}';
    if (code <= 82) return '\u{1F327}';
    if (code <= 86) return '\u{1F328}';
    return '\u26C8';
  }

  // ===== FEATURE 5: TRIP EXPENSE TRACKER =====
  function renderExpensesTab() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];
    var expenses = getTripSubData(idx, 'expenses');

    // Compute totals
    var totalBudget = (trip.dailyBudget || 0) * (trip.days || computeTripDays(trip.departDate, trip.returnDate));
    var totalSpent = 0;
    var byCategory = {};
    expenses.forEach(function(exp) {
      var amt = exp.homeCurrencyAmount || exp.amount || 0;
      totalSpent += amt;
      var cat = exp.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });
    var remaining = totalBudget - totalSpent;
    var pctUsed = totalBudget > 0 ? Math.min(100, Math.round(totalSpent / totalBudget * 100)) : 0;

    // Summary
    var summaryEl = $('#expenseSummary');
    if (summaryEl) {
      var progressColor = pctUsed < 80 ? 'var(--success)' : pctUsed < 100 ? 'var(--warning)' : 'var(--danger)';
      summaryEl.innerHTML = '<div class="expense-stat"><div class="expense-stat-label">Budget</div><div class="expense-stat-value">' + formatPrice(totalBudget) + '</div></div>' +
        '<div class="expense-stat"><div class="expense-stat-label">Spent</div><div class="expense-stat-value">' + formatPrice(totalSpent) + '</div></div>' +
        '<div class="expense-stat"><div class="expense-stat-label">Remaining</div><div class="expense-stat-value ' + (remaining >= 0 ? 'remaining' : 'over-budget') + '">' + formatPrice(Math.abs(remaining)) + (remaining < 0 ? ' over' : '') + '</div></div>' +
        '<div style="grid-column:1/-1;"><div class="expense-progress"><div class="expense-progress-fill" style="width:' + pctUsed + '%;background:' + progressColor + ';"></div></div></div>';
    }

    // Donut chart
    renderExpenseDonut(byCategory, totalSpent);

    // Expense list grouped by day
    renderExpenseList(expenses, trip);
  }

  function renderExpenseDonut(byCategory, totalSpent) {
    var chartEl = $('#expenseChartWrap');
    if (!chartEl) return;
    if (totalSpent === 0) { chartEl.innerHTML = ''; return; }

    var categories = Object.keys(byCategory).sort(function(a, b) { return byCategory[b] - byCategory[a]; });
    var gradientParts = [];
    var cumulative = 0;
    var legendHtml = '';
    categories.forEach(function(cat) {
      var pct = byCategory[cat] / totalSpent * 100;
      var color = EXPENSE_CATEGORY_COLORS[cat] || '#94a3b8';
      gradientParts.push(color + ' ' + cumulative.toFixed(1) + '% ' + (cumulative + pct).toFixed(1) + '%');
      cumulative += pct;
      legendHtml += '<div class="expense-legend-item"><div class="expense-legend-dot" style="background:' + color + '"></div>' +
        escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1)) + ' ' + formatPrice(byCategory[cat]) + ' (' + Math.round(pct) + '%)</div>';
    });

    chartEl.innerHTML = '<div class="expense-donut" style="background:conic-gradient(' + gradientParts.join(',') + ');">' +
      '<div class="expense-donut-hole"><div class="expense-donut-total">' + formatPrice(totalSpent) + '</div><div class="expense-donut-label">Total</div></div></div>' +
      '<div class="expense-category-legend">' + legendHtml + '</div>';
  }

  function renderExpenseList(expenses, trip) {
    var listEl = $('#expenseList');
    if (!listEl) return;
    if (expenses.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:12px;"><p>No expenses recorded yet.</p></div>';
      return;
    }

    // Group by date
    var groups = {};
    expenses.forEach(function(exp) {
      var key = exp.date || 'No date';
      if (!groups[key]) groups[key] = [];
      groups[key].push(exp);
    });

    var sortedDates = Object.keys(groups).sort();
    var html = '';
    sortedDates.forEach(function(date) {
      html += '<div class="expense-day-group"><div class="expense-day-header">' + escapeHtml(date) + '</div>';
      groups[date].forEach(function(exp) {
        var catColor = EXPENSE_CATEGORY_COLORS[exp.category] || '#94a3b8';
        var sym = CURRENCY_SYMBOLS[exp.currency] || exp.currency || '';
        html += '<div class="expense-item">' +
          '<span class="expense-item-desc">' + escapeHtml(exp.description || 'Expense') + '</span>' +
          '<span class="expense-item-category" style="background:' + catColor + '22;color:' + catColor + ';">' + escapeHtml(exp.category || 'other') + '</span>' +
          '<div style="text-align:right;">' +
            '<span class="expense-item-amount">' + escapeHtml(sym) + escapeHtml(String(exp.amount)) + '</span>' +
            (exp.homeCurrencyAmount && exp.currency !== State.currency ? '<br><span class="expense-item-converted">\u2248 ' + formatPrice(exp.homeCurrencyAmount) + '</span>' : '') +
          '</div>' +
          '<button class="expense-item-delete" data-id="' + escapeHtml(exp.id) + '" aria-label="Delete expense">&times;</button>' +
        '</div>';
      });
      html += '</div>';
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('.expense-item-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var expId = this.dataset.id;
        var idx = TripPlanner.currentTripIndex;
        var exps = getTripSubData(idx, 'expenses');
        exps = exps.filter(function(e) { return e.id !== expId; });
        setTripSubData(idx, 'expenses', exps);
        renderExpensesTab();
        showToast('Expense deleted', 'info');
      });
    });
  }

  // Add expense
  function addExpense(expenseData) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var expenses = getTripSubData(idx, 'expenses');
    var newExpense = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      amount: expenseData.amount || 0,
      currency: expenseData.currency || State.currency,
      homeCurrencyAmount: expenseData.homeCurrencyAmount || expenseData.amount || 0,
      category: expenseData.category || 'other',
      description: expenseData.description || '',
      date: expenseData.date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };
    expenses.push(newExpense);
    setTripSubData(idx, 'expenses', expenses);
    renderExpensesTab();
    showToast('Expense added!', 'success');
  }

  // ===== FEATURE 12: MULTI-CURRENCY CONVERSION =====
  async function getExchangeRate(from, to) {
    if (from === to) return 1;
    var key = from + '_' + to;
    var cached = TripPlanner.exchangeRateCache[key];
    if (cached && Date.now() - cached.fetchedAt < 86400000) return cached.rate;

    try {
      var resp = await fetch('https://api.frankfurter.app/latest?from=' + from + '&to=' + to);
      var data = await resp.json();
      if (data && data.rates && data.rates[to]) {
        var rate = data.rates[to];
        TripPlanner.exchangeRateCache[key] = { rate: rate, fetchedAt: Date.now() };
        return rate;
      }
    } catch(e) { console.warn('Exchange rate fetch failed:', e); }
    return 1;
  }

  async function convertCurrency(amount, from, to) {
    var rate = await getExchangeRate(from, to);
    return Math.round(amount * rate * 100) / 100;
  }

  // ===== FEATURE 4: INTERACTIVE TRIP MAP =====
  function initTripMap() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;

    // Wait for Leaflet
    if (typeof L === 'undefined') {
      setTimeout(initTripMap, 200);
      return;
    }

    var container = document.getElementById('tripMap');
    if (!container) return;

    // Destroy old map
    destroyTripMap();

    // Create map
    TripPlanner.leafletMap = L.map('tripMap').setView([35.68, 139.76], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(TripPlanner.leafletMap);

    // Add markers from itinerary
    var itinerary = getTripSubData(idx, 'itinerary');
    var markers = [];
    var dayGroups = {};

    itinerary.forEach(function(item) {
      if (item.lat && item.lng) {
        var dayColor = DAY_COLORS[(item.dayNumber - 1) % DAY_COLORS.length];
        var marker = L.marker([item.lat, item.lng], {
          icon: L.divIcon({
            className: 'map-marker-label',
            html: '<div style="background:' + dayColor + ';" class="map-marker-label">' + item.dayNumber + '</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(TripPlanner.leafletMap);

        marker.bindPopup('<div class="map-popup-card"><h4>' + escapeHtml(item.title) + '</h4>' +
          '<p>Day ' + item.dayNumber + (item.startTime ? ' \u00b7 ' + escapeHtml(item.startTime) : '') + '</p>' +
          (item.location ? '<p>' + escapeHtml(item.location) + '</p>' : '') +
        '</div>');

        markers.push(marker);

        if (!dayGroups[item.dayNumber]) dayGroups[item.dayNumber] = [];
        dayGroups[item.dayNumber].push([item.lat, item.lng]);
      }
    });

    // Add polylines per day
    Object.keys(dayGroups).forEach(function(day) {
      var pts = dayGroups[day];
      if (pts.length > 1) {
        var dayColor = DAY_COLORS[(parseInt(day) - 1) % DAY_COLORS.length];
        L.polyline(pts, { color: dayColor, weight: 2, opacity: 0.7, dashArray: '5, 5' }).addTo(TripPlanner.leafletMap);
      }
    });

    // Fit bounds
    if (markers.length > 0) {
      var group = L.featureGroup(markers);
      TripPlanner.leafletMap.fitBounds(group.getBounds().pad(0.2));
    } else {
      // Try to center on destination
      var trip = State.trips[idx];
      var dest = (trip.destinations && trip.destinations[0]) || '';
      var airport = typeof AIRPORTS !== 'undefined'
        ? AIRPORTS.find(function(a) { return a.city.toLowerCase().indexOf(dest.toLowerCase()) !== -1; })
        : null;
      if (airport && airport.lat) {
        TripPlanner.leafletMap.setView([airport.lat, airport.lon || airport.lng || 0], 10);
      }
    }

    TripPlanner.leafletMarkers = markers;

    // Render map legend
    renderMapLegend();

    // Force map to recalculate size
    setTimeout(function() {
      if (TripPlanner.leafletMap) TripPlanner.leafletMap.invalidateSize();
    }, 300);
  }

  function destroyTripMap() {
    if (TripPlanner.leafletMap) {
      TripPlanner.leafletMap.remove();
      TripPlanner.leafletMap = null;
    }
    TripPlanner.leafletMarkers = [];
  }

  function renderMapLegend() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];
    var legendEl = $('#mapLegend');
    if (!legendEl) return;
    var numDays = computeTripDays(trip.departDate, trip.returnDate);
    var html = '';
    for (var i = 1; i <= Math.min(numDays, 10); i++) {
      var color = DAY_COLORS[(i - 1) % DAY_COLORS.length];
      html += '<div class="map-legend-item"><div class="map-legend-dot" style="background:' + color + '"></div>Day ' + i + '</div>';
    }
    legendEl.innerHTML = html;
  }

  // ===== FEATURE 6: SMART DEPARTURE CHECKLIST =====
  function renderChecklistTab() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;

    renderDepartureChecklist();
    renderPackingList();
  }

  function renderDepartureChecklist() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];

    var checkedItems = getTripSubObj(idx, 'checklist');

    // Built-in departure checklist items grouped by days-before-trip
    var checklistData = [
      { group: '4 weeks before', category: 'documents', items: ['Check passport validity (6+ months)', 'Apply for visa if needed', 'Book travel insurance'] },
      { group: '2 weeks before', category: 'flights', items: ['Confirm flight bookings', 'Check-in online (24h before)', 'Print/save boarding passes'] },
      { group: '1 week before', category: 'money', items: ['Notify bank of travel dates', 'Get foreign currency', 'Set up travel credit card'] },
      { group: '2 days before', category: 'packing', items: ['Pack luggage', 'Weigh luggage (check limits)', 'Prepare carry-on essentials', 'Charge all devices'] },
      { group: 'Day before', category: 'home', items: ['Set lights on timer', 'Unplug appliances', 'Take out trash', 'Water plants'] },
      { group: 'Day of departure', category: 'tech', items: ['Download offline maps', 'Save hotel confirmation', 'Set out-of-office reply', 'Double-check passport & tickets'] }
    ];

    var totalItems = 0;
    var checkedCount = 0;

    // Count totals
    checklistData.forEach(function(group) {
      group.items.forEach(function(item) {
        totalItems++;
        var key = group.category + '_' + item;
        if (checkedItems[key]) checkedCount++;
      });
    });

    var pctDone = totalItems > 0 ? Math.round(checkedCount / totalItems * 100) : 0;

    var progressEl = $('#checklistProgress');
    if (progressEl) {
      progressEl.innerHTML = '<div class="checklist-progress-text">' + checkedCount + '/' + totalItems + ' items completed</div>' +
        '<div class="checklist-progress-bar"><div class="checklist-progress-fill" style="width:' + pctDone + '%;"></div></div>';
    }

    var itemsEl = $('#checklistItems');
    if (!itemsEl) return;

    var html = '';
    checklistData.forEach(function(group) {
      html += '<div class="checklist-group"><div class="checklist-group-title cat-' + escapeHtml(group.category) + '">' + escapeHtml(group.group) + '</div>';
      group.items.forEach(function(item) {
        var key = group.category + '_' + item;
        var checked = checkedItems[key] ? true : false;
        html += '<div class="checklist-item ' + (checked ? 'checked' : '') + '">' +
          '<input type="checkbox" ' + (checked ? 'checked' : '') + ' data-key="' + escapeHtml(key) + '" aria-label="' + escapeHtml(item) + '">' +
          '<span class="checklist-item-label">' + escapeHtml(item) + '</span>' +
        '</div>';
      });
      html += '</div>';
    });
    itemsEl.innerHTML = html;

    // Attach handlers
    itemsEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var chk = getTripSubObj(idx, 'checklist');
        if (this.checked) {
          chk[this.dataset.key] = true;
        } else {
          delete chk[this.dataset.key];
        }
        setTripSubObj(idx, 'checklist', chk);
        this.parentElement.classList.toggle('checked', this.checked);
        // Update progress
        var total = itemsEl.querySelectorAll('input[type="checkbox"]').length;
        var done = itemsEl.querySelectorAll('input[type="checkbox"]:checked').length;
        if (progressEl) {
          progressEl.innerHTML = '<div class="checklist-progress-text">' + done + '/' + total + ' items completed</div>' +
            '<div class="checklist-progress-bar"><div class="checklist-progress-fill" style="width:' + (total > 0 ? Math.round(done/total*100) : 0) + '%;"></div></div>';
        }
      });
    });
  }

  // ===== FEATURE 7: SMART PACKING LIST =====
  function renderPackingList() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var trip = State.trips[idx];

    var packingData = getTripSubData(idx, 'packing');

    // If no packing items yet, generate from templates
    if (packingData.length === 0) {
      packingData = generatePackingList(trip);
      setTripSubData(idx, 'packing', packingData);
    }

    // Group by category
    var groups = {};
    packingData.forEach(function(item) {
      var cat = item.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    var totalItems = packingData.length;
    var checkedCount = packingData.filter(function(i) { return i.checked; }).length;
    var pctDone = totalItems > 0 ? Math.round(checkedCount / totalItems * 100) : 0;

    var progressEl = $('#packingProgress');
    if (progressEl) {
      progressEl.innerHTML = '<div class="checklist-progress-text">' + checkedCount + '/' + totalItems + ' items packed</div>' +
        '<div class="checklist-progress-bar"><div class="checklist-progress-fill" style="width:' + pctDone + '%;"></div></div>';
    }

    var itemsEl = $('#packingItems');
    if (!itemsEl) return;

    var categoryOrder = ['essentials', 'clothes', 'clothes_warm', 'clothes_tropical', 'toiletries', 'tech', 'beach', 'rain_gear', 'custom'];
    var categoryLabels = {
      essentials: 'Essentials', clothes: 'Clothing', clothes_warm: 'Warm Weather Gear',
      clothes_tropical: 'Tropical Wear', toiletries: 'Toiletries', tech: 'Tech & Electronics',
      beach: 'Beach Essentials', rain_gear: 'Rain Gear', custom: 'Custom Items'
    };

    var html = '';
    categoryOrder.forEach(function(cat) {
      if (!groups[cat]) return;
      html += '<div class="packing-category-title">' + escapeHtml(categoryLabels[cat] || cat) + '</div>';
      groups[cat].forEach(function(item, i) {
        html += '<div class="checklist-item ' + (item.checked ? 'checked' : '') + '">' +
          '<input type="checkbox" ' + (item.checked ? 'checked' : '') + ' data-id="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.name) + '">' +
          '<span class="checklist-item-label">' + escapeHtml(item.name) + '</span>' +
        '</div>';
      });
    });
    itemsEl.innerHTML = html;

    // Attach handlers
    itemsEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = this.dataset.id;
        var packing = getTripSubData(idx, 'packing');
        for (var i = 0; i < packing.length; i++) {
          if (packing[i].id === id) {
            packing[i].checked = this.checked;
            break;
          }
        }
        setTripSubData(idx, 'packing', packing);
        this.parentElement.classList.toggle('checked', this.checked);
        // Update progress
        var total = packing.length;
        var done = packing.filter(function(p) { return p.checked; }).length;
        if (progressEl) {
          progressEl.innerHTML = '<div class="checklist-progress-text">' + done + '/' + total + ' items packed</div>' +
            '<div class="checklist-progress-bar"><div class="checklist-progress-fill" style="width:' + (total > 0 ? Math.round(done/total*100) : 0) + '%;"></div></div>';
        }
      });
    });
  }

  function generatePackingList(trip) {
    var items = [];
    var id = 0;
    function addItem(name, category) {
      items.push({ id: 'packing_' + (id++), name: name, category: category, checked: false });
    }

    // Essentials (always included)
    ['Passport', 'Wallet & cards', 'Phone & charger', 'Travel insurance docs', 'Copies of bookings', 'Cash (local currency)'].forEach(function(n) { addItem(n, 'essentials'); });

    // Toiletries (always included)
    ['Toothbrush & toothpaste', 'Deodorant', 'Shampoo (travel size)', 'Sunscreen', 'Medications', 'First aid kit'].forEach(function(n) { addItem(n, 'toiletries'); });

    // Basic clothes
    ['Underwear (enough for trip)', 'Socks', 'T-shirts', 'Trousers/shorts', 'Sleepwear', 'Comfortable shoes'].forEach(function(n) { addItem(n, 'clothes'); });

    // Tech
    ['Power adapter', 'Portable charger', 'Headphones', 'Camera'].forEach(function(n) { addItem(n, 'tech'); });

    // Weather-based items: check destination weather
    var dest = (trip.destinations && trip.destinations[0]) || '';
    var airport = typeof AIRPORTS !== 'undefined'
      ? AIRPORTS.find(function(a) { return a.city.toLowerCase().indexOf(dest.toLowerCase()) !== -1; })
      : null;

    // Default: include tropical if destination is typically warm
    var warmDests = ['bangkok', 'bali', 'phuket', 'cancun', 'hawaii', 'miami', 'dubai', 'singapore', 'manila', 'mumbai', 'rio'];
    var coldDests = ['tokyo', 'seoul', 'london', 'paris', 'new york', 'berlin', 'moscow', 'oslo', 'helsinki', 'stockholm'];
    var beachDests = ['bali', 'phuket', 'cancun', 'hawaii', 'maldives', 'fiji', 'miami', 'santorini', 'beach'];

    var destLower = dest.toLowerCase();

    if (warmDests.some(function(d) { return destLower.indexOf(d) !== -1; })) {
      ['Light shorts', 'Tank tops', 'Sandals', 'Sunglasses', 'Sun hat'].forEach(function(n) { addItem(n, 'clothes_tropical'); });
    }
    if (coldDests.some(function(d) { return destLower.indexOf(d) !== -1; })) {
      ['Warm jacket', 'Scarf', 'Gloves', 'Thermal underwear', 'Warm socks'].forEach(function(n) { addItem(n, 'clothes_warm'); });
    }
    if (beachDests.some(function(d) { return destLower.indexOf(d) !== -1; })) {
      ['Swimsuit', 'Beach towel', 'Flip flops', 'Snorkel gear'].forEach(function(n) { addItem(n, 'beach'); });
    }

    // Rain gear is always useful
    ['Umbrella', 'Rain jacket'].forEach(function(n) { addItem(n, 'rain_gear'); });

    return items;
  }

  function addCustomPackingItem(name) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0 || !name.trim()) return;
    var packing = getTripSubData(idx, 'packing');
    packing.push({
      id: 'packing_custom_' + Date.now(),
      name: name.trim(),
      category: 'custom',
      checked: false
    });
    setTripSubData(idx, 'packing', packing);
    renderPackingList();
    showToast('Item added to packing list', 'success');
  }

  // ===== FEATURE 8: TRIP NOTES =====
  function renderNotesTab() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;

    var notesData = getTripSubObj(idx, 'notes');

    // Trip notes textarea
    var textarea = $('#tripNotesArea');
    if (textarea) {
      textarea.value = notesData.tripNotes || '';
      textarea.addEventListener('input', function() {
        var notes = getTripSubObj(idx, 'notes');
        notes.tripNotes = this.value;
        setTripSubObj(idx, 'notes', notes);
      });
    }

    // Document vault
    renderDocVault();
  }

  function renderDocVault() {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var notesData = getTripSubObj(idx, 'notes');
    var documents = notesData.documents || [];

    var vaultEl = $('#docVault');
    if (!vaultEl) return;

    if (documents.length === 0) {
      vaultEl.innerHTML = '<div class="empty-state" style="padding:12px;"><p>No documents saved yet.</p></div>';
      return;
    }

    // Group by type
    var groups = {};
    documents.forEach(function(doc) {
      var type = doc.type || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    });

    var typeOrder = ['booking', 'passport', 'visa', 'insurance', 'emergency', 'other'];
    var typeLabels = {
      booking: 'Bookings', passport: 'Travel Documents', visa: 'Visas',
      insurance: 'Insurance', emergency: 'Emergency Contacts', other: 'Other'
    };

    var html = '';
    typeOrder.forEach(function(type) {
      if (!groups[type]) return;
      var icon = DOC_TYPE_ICONS[type] || DOC_TYPE_ICONS.other;
      html += '<div class="doc-group"><div class="doc-group-title"><span class="doc-group-icon">' + icon + '</span> ' + escapeHtml(typeLabels[type] || type) + '</div>';
      groups[type].forEach(function(doc) {
        html += '<div class="doc-card">' +
          '<span class="doc-card-title">' + escapeHtml(doc.title || 'Untitled') + '</span>' +
          (doc.reference ? '<span class="doc-card-ref">' + escapeHtml(doc.reference) + '</span>' : '') +
          (doc.reference ? '<button class="doc-copy-btn" data-ref="' + escapeHtml(doc.reference) + '" aria-label="Copy reference">Copy</button>' : '') +
          '<button class="doc-card-delete" data-id="' + escapeHtml(doc.id) + '" aria-label="Delete document">&times;</button>' +
        '</div>';
      });
      html += '</div>';
    });
    vaultEl.innerHTML = html;

    // Copy buttons
    vaultEl.querySelectorAll('.doc-copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ref = this.dataset.ref;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(ref).then(function() {
            showToast('Reference copied!', 'success');
          });
        }
      });
    });

    // Delete buttons
    vaultEl.querySelectorAll('.doc-card-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var docId = this.dataset.id;
        var notes = getTripSubObj(idx, 'notes');
        notes.documents = (notes.documents || []).filter(function(d) { return d.id !== docId; });
        setTripSubObj(idx, 'notes', notes);
        renderDocVault();
        showToast('Document removed', 'info');
      });
    });
  }

  function addDocument(docData) {
    var idx = TripPlanner.currentTripIndex;
    if (idx < 0) return;
    var notes = getTripSubObj(idx, 'notes');
    if (!notes.documents) notes.documents = [];
    notes.documents.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: docData.type || 'other',
      title: docData.title || '',
      reference: docData.reference || '',
      notes: docData.notes || '',
      createdAt: new Date().toISOString()
    });
    setTripSubObj(idx, 'notes', notes);
    renderDocVault();
    showToast('Document added!', 'success');
  }

  // ===== TRIP PLANNER INITIALIZATION =====
  function initTripPlanner() {
    // Back button
    var backBtn = $('#tripBackBtn');
    if (backBtn) backBtn.addEventListener('click', closeTripDetail);

    // Sub-tab switching
    $$('.trip-subtab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchTripSubTab(this.dataset.tab);
      });
    });

    // Add activity form toggle
    var addActivityBtn = $('#addActivityBtn');
    var itineraryAddForm = $('#itineraryAddForm');
    var cancelActivityBtn = $('#cancelActivityBtn');
    if (addActivityBtn && itineraryAddForm) {
      addActivityBtn.addEventListener('click', function() {
        itineraryAddForm.style.display = itineraryAddForm.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelActivityBtn) {
      cancelActivityBtn.addEventListener('click', function() {
        if (itineraryAddForm) itineraryAddForm.style.display = 'none';
      });
    }

    // Save activity
    var saveActivityBtn = $('#saveActivityBtn');
    if (saveActivityBtn) {
      saveActivityBtn.addEventListener('click', function() {
        var title = $('#activityTitle') ? $('#activityTitle').value.trim() : '';
        if (!title) { showToast('Please enter an activity name', 'warning'); return; }
        addItineraryItem({
          title: title,
          startTime: $('#activityTime') ? $('#activityTime').value : '',
          type: $('#activityCategory') ? $('#activityCategory').value : 'activity',
          location: $('#activityLocation') ? $('#activityLocation').value.trim() : '',
          notes: $('#activityNotes') ? $('#activityNotes').value.trim() : ''
        });
        // Clear form
        if ($('#activityTitle')) $('#activityTitle').value = '';
        if ($('#activityTime')) $('#activityTime').value = '';
        if ($('#activityLocation')) $('#activityLocation').value = '';
        if ($('#activityNotes')) $('#activityNotes').value = '';
        if (itineraryAddForm) itineraryAddForm.style.display = 'none';
      });
    }

    // Add hotel form toggle
    var addHotelBtn = $('#addHotelBtn');
    var hotelAddForm = $('#hotelAddForm');
    var cancelHotelBtn = $('#cancelHotelBtn');
    if (addHotelBtn && hotelAddForm) {
      addHotelBtn.addEventListener('click', function() {
        hotelAddForm.style.display = hotelAddForm.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelHotelBtn) {
      cancelHotelBtn.addEventListener('click', function() {
        if (hotelAddForm) hotelAddForm.style.display = 'none';
      });
    }

    // Save hotel
    var saveHotelBtn = $('#saveHotelBtn');
    if (saveHotelBtn) {
      saveHotelBtn.addEventListener('click', function() {
        var name = $('#hotelName') ? $('#hotelName').value.trim() : '';
        if (!name) { showToast('Please enter a hotel name', 'warning'); return; }
        var idx = TripPlanner.currentTripIndex;
        var accommodations = getTripSubData(idx, 'accommodation');
        accommodations.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          name: name,
          checkIn: $('#hotelCheckIn') ? $('#hotelCheckIn').value : '',
          checkOut: $('#hotelCheckOut') ? $('#hotelCheckOut').value : '',
          costPerNight: $('#hotelCostPerNight') ? parseFloat($('#hotelCostPerNight').value) || 0 : 0
        });
        setTripSubData(idx, 'accommodation', accommodations);
        // Clear form
        if ($('#hotelName')) $('#hotelName').value = '';
        if ($('#hotelCheckIn')) $('#hotelCheckIn').value = '';
        if ($('#hotelCheckOut')) $('#hotelCheckOut').value = '';
        if ($('#hotelCostPerNight')) $('#hotelCostPerNight').value = '';
        if (hotelAddForm) hotelAddForm.style.display = 'none';
        renderAccommodationBar();
        showToast('Accommodation added!', 'success');
      });
    }

    // Add expense form toggle
    var addExpenseBtn = $('#addExpenseBtn');
    var expenseAddForm = $('#expenseAddForm');
    var cancelExpenseBtn = $('#cancelExpenseBtn');
    if (addExpenseBtn && expenseAddForm) {
      addExpenseBtn.addEventListener('click', function() {
        expenseAddForm.style.display = expenseAddForm.style.display === 'none' ? 'block' : 'none';
        // Set default date
        if ($('#expenseDate') && !$('#expenseDate').value) {
          $('#expenseDate').value = new Date().toISOString().slice(0, 10);
        }
      });
    }
    if (cancelExpenseBtn) {
      cancelExpenseBtn.addEventListener('click', function() {
        if (expenseAddForm) expenseAddForm.style.display = 'none';
      });
    }

    // Save expense with currency conversion
    var saveExpenseBtn = $('#saveExpenseBtn');
    if (saveExpenseBtn) {
      saveExpenseBtn.addEventListener('click', async function() {
        var amount = $('#expenseAmount') ? parseFloat($('#expenseAmount').value) : 0;
        if (!amount || amount <= 0) { showToast('Please enter an amount', 'warning'); return; }
        var currency = $('#expenseCurrency') ? $('#expenseCurrency').value : State.currency;
        var homeCurrencyAmount = amount;
        if (currency !== State.currency) {
          homeCurrencyAmount = await convertCurrency(amount, currency, State.currency);
        }
        addExpense({
          amount: amount,
          currency: currency,
          homeCurrencyAmount: homeCurrencyAmount,
          category: $('#expenseCategory') ? $('#expenseCategory').value : 'other',
          description: $('#expenseDescription') ? $('#expenseDescription').value.trim() : '',
          date: $('#expenseDate') ? $('#expenseDate').value : new Date().toISOString().slice(0, 10)
        });
        // Clear form
        if ($('#expenseAmount')) $('#expenseAmount').value = '';
        if ($('#expenseDescription')) $('#expenseDescription').value = '';
        if ($('#expenseConversionPreview')) $('#expenseConversionPreview').textContent = '';
        if (expenseAddForm) expenseAddForm.style.display = 'none';
      });
    }

    // Expense conversion preview
    var expenseAmountInput = $('#expenseAmount');
    var expenseCurrencySelect = $('#expenseCurrency');
    function updateConversionPreview() {
      var amount = expenseAmountInput ? parseFloat(expenseAmountInput.value) : 0;
      var currency = expenseCurrencySelect ? expenseCurrencySelect.value : State.currency;
      var previewEl = $('#expenseConversionPreview');
      if (!previewEl || !amount || currency === State.currency) {
        if (previewEl) previewEl.textContent = '';
        return;
      }
      convertCurrency(amount, currency, State.currency).then(function(converted) {
        if (previewEl) {
          var sym = CURRENCY_SYMBOLS[currency] || currency;
          previewEl.textContent = sym + amount + ' \u2248 ' + formatPrice(converted);
        }
      });
    }
    if (expenseAmountInput) expenseAmountInput.addEventListener('input', updateConversionPreview);
    if (expenseCurrencySelect) expenseCurrencySelect.addEventListener('change', updateConversionPreview);

    // Currency converter
    var converterAmountInput = $('#converterAmount');
    var converterFromSelect = $('#converterFrom');
    var converterToSelect = $('#converterTo');
    function doConversion() {
      var amount = converterAmountInput ? parseFloat(converterAmountInput.value) : 0;
      var from = converterFromSelect ? converterFromSelect.value : 'USD';
      var to = converterToSelect ? converterToSelect.value : 'GBP';
      var resultEl = $('#converterResult');
      if (!amount || !resultEl) { if (resultEl) resultEl.textContent = ''; return; }
      convertCurrency(amount, from, to).then(function(converted) {
        var fromSym = CURRENCY_SYMBOLS[from] || from;
        var toSym = CURRENCY_SYMBOLS[to] || to;
        if (resultEl) resultEl.textContent = fromSym + amount + ' = ' + toSym + converted.toFixed(2);
      });
    }
    if (converterAmountInput) converterAmountInput.addEventListener('input', doConversion);
    if (converterFromSelect) converterFromSelect.addEventListener('change', doConversion);
    if (converterToSelect) converterToSelect.addEventListener('change', doConversion);

    // Add packing item
    var addPackingBtn = $('#addPackingItemBtn');
    var packingInput = $('#packingCustomItem');
    if (addPackingBtn && packingInput) {
      addPackingBtn.addEventListener('click', function() {
        addCustomPackingItem(packingInput.value);
        packingInput.value = '';
      });
      packingInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          addCustomPackingItem(packingInput.value);
          packingInput.value = '';
        }
      });
    }

    // Add document form toggle
    var addDocBtn = $('#addDocBtn');
    var docAddForm = $('#docAddForm');
    var cancelDocBtn = $('#cancelDocBtn');
    if (addDocBtn && docAddForm) {
      addDocBtn.addEventListener('click', function() {
        docAddForm.style.display = docAddForm.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (cancelDocBtn) {
      cancelDocBtn.addEventListener('click', function() {
        if (docAddForm) docAddForm.style.display = 'none';
      });
    }

    // Save document
    var saveDocBtn = $('#saveDocBtn');
    if (saveDocBtn) {
      saveDocBtn.addEventListener('click', function() {
        var title = $('#docTitle') ? $('#docTitle').value.trim() : '';
        if (!title) { showToast('Please enter a document title', 'warning'); return; }
        addDocument({
          type: $('#docType') ? $('#docType').value : 'other',
          title: title,
          reference: $('#docReference') ? $('#docReference').value.trim() : '',
          notes: $('#docNotes') ? $('#docNotes').value.trim() : ''
        });
        // Clear form
        if ($('#docTitle')) $('#docTitle').value = '';
        if ($('#docReference')) $('#docReference').value = '';
        if ($('#docNotes')) $('#docNotes').value = '';
        if (docAddForm) docAddForm.style.display = 'none';
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
