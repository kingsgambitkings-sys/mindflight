// ===== MindFlight v2.0 =====
const API_BASE = window.location.origin + '/api';

// ===== CURRENCY =====
const FX_RATES = {
  GBP: 1.00, USD: 1.27, EUR: 1.17, HKD: 9.92, SGD: 1.71, JPY: 191.5,
  THB: 44.2, AUD: 1.96, CNY: 9.21, KRW: 1735, TWD: 41.2, INR: 106.5,
  AED: 4.67, MYR: 5.98,
};
const FX_SYMBOLS = { GBP:'£', USD:'$', EUR:'€', HKD:'HK$', SGD:'S$', JPY:'¥', THB:'฿', AUD:'A$', CNY:'¥', KRW:'₩' };
function convertPrice(amount, from, to) { if (from === to) return amount; return (amount / (FX_RATES[from] || 1)) * (FX_RATES[to] || 1); }
function formatPrice(amount, currency) {
  const s = FX_SYMBOLS[currency] || currency + ' ';
  return (currency === 'JPY' || currency === 'KRW') ? `${s}${Math.round(amount).toLocaleString()}` : `${s}${amount.toFixed(0)}`;
}
function getSelectedCurrency() { return document.getElementById('currencySelect')?.value || 'GBP'; }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSettings();
  initMobileDrawer();
  initNavigation();
  initGlobe();
  initAirportAutocomplete('originInput', 'originDropdown', 'originSelect', onOriginChange);
  initAirportAutocomplete('flightTo', 'destDropdown', 'destSelect', null);
  initSearch();
  initSpinDart();
  initPriceCalendar();
  initTripPlanner();
  initCommandPalette();
  initKeyboardShortcuts();
  initShareButton();
  initPWA();
  initBudgetSlider();
  loadWatchedRoutes();
  loadAlerts();
  loadPriceHistory();

  // Default date = tomorrow
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateInput = document.getElementById('flightDate');
  if (dateInput) dateInput.value = tomorrow.toISOString().split('T')[0];

  // Load saved currency
  const saved = localStorage.getItem('travel-currency');
  if (saved) document.getElementById('currencySelect').value = saved;
  document.getElementById('currencySelect')?.addEventListener('change', function() {
    localStorage.setItem('travel-currency', this.value);
  });
});

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('travel-theme') || 'dark';
  applyTheme(saved);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('drawerThemeToggle')?.addEventListener('click', toggleTheme);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('travel-theme', next);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icons = document.querySelectorAll('#themeIcon, #drawerThemeIcon');
  icons.forEach(icon => {
    if (!icon) return;
    icon.innerHTML = theme === 'dark'
      ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  });
}

// ===== SETTINGS =====
function initSettings() {
  const modal = document.getElementById('settingsModal');
  document.getElementById('settingsBtn').addEventListener('click', async () => {
    // Load current settings into form
    try {
      const r = await fetch(`${API_BASE}/settings`);
      const data = await r.json();
      if (data.origin) document.getElementById('settingOrigin').value = data.origin;
      if (data.currency) document.getElementById('settingCurrency').value = data.currency;
      if (data.theme) document.getElementById('settingTheme').value = data.theme;
      if (data.amadeusKey) document.getElementById('settingAmadeusKey').value = data.amadeusKey;
    } catch {}
    modal.classList.add('open');
  });
  document.getElementById('closeSettings').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const settings = {
      origin: document.getElementById('settingOrigin').value.trim().toUpperCase(),
      currency: document.getElementById('settingCurrency').value,
      theme: document.getElementById('settingTheme').value,
      amadeusKey: document.getElementById('settingAmadeusKey').value.trim(),
    };
    try {
      await fetch(`${API_BASE}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    } catch {}
    // Apply settings locally
    if (settings.currency) {
      document.getElementById('currencySelect').value = settings.currency;
      localStorage.setItem('travel-currency', settings.currency);
    }
    if (settings.theme) {
      applyTheme(settings.theme);
      localStorage.setItem('travel-theme', settings.theme);
    }
    modal.classList.remove('open');
    showToast('Settings saved', 'success');
  });
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ===== MOBILE DRAWER =====
function initMobileDrawer() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  const close = document.getElementById('closeDrawer');
  if (!drawer) return;
  const openDrawer = () => { drawer.classList.add('open'); overlay.classList.add('open'); };
  const closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
  hamburger?.addEventListener('click', openDrawer);
  close?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
  drawer.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', closeDrawer);
  });
}

// ===== NAVIGATION =====
function initNavigation() {
  // Nav pill clicks scroll to section
  document.querySelectorAll('.nav-pill, .mobile-nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.getAttribute('data-section');
      const section = document.getElementById(sectionId);
      if (section) section.scrollIntoView({ behavior: 'smooth' });
      // Update active state
      document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
      document.querySelector(`.nav-pill[data-section="${sectionId}"]`)?.classList.add('active');
    });
  });

  // IntersectionObserver for active nav state
  const sections = document.querySelectorAll('[id$="-section"]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
        document.querySelector(`.nav-pill[data-section="${entry.target.id}"]`)?.classList.add('active');
      }
    });
  }, { threshold: 0.3 });
  sections.forEach(s => observer.observe(s));
}

// ===== AIRPORT AUTOCOMPLETE =====
function initAirportAutocomplete(inputId, dropdownId, hiddenId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const hidden = document.getElementById(hiddenId);
  if (!input || !dropdown) return;

  input.addEventListener('focus', () => { input.select(); showResults(input.value); });
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.airport-option');
    if (e.key === 'Enter' && items.length > 0) { e.preventDefault(); items[0].click(); }
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.airport-autocomplete')) dropdown.classList.remove('open');
  });

  function showResults(q) {
    q = q.toLowerCase().trim();
    if (q.length < 1) { dropdown.classList.remove('open'); return; }
    const matches = AIRPORTS.filter(a =>
      a.code.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.country.toLowerCase().includes(q)
    ).slice(0, 10);
    if (!matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = matches.map(a =>
      `<div class="airport-option" data-code="${a.code}"><span class="airport-option-code">${a.code}</span><span class="airport-option-city">${a.city}</span><span class="airport-option-country">${a.country}</span></div>`
    ).join('');
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.airport-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const airport = AIRPORTS.find(a => a.code === opt.dataset.code);
        if (!airport) return;
        input.value = `${airport.city} (${airport.code})`;
        if (hidden) hidden.value = airport.code;
        dropdown.classList.remove('open');
        if (onSelect) onSelect(airport);
      });
    });
  }
}

function onOriginChange(airport) {
  const subtitle = document.getElementById('recommendedSubtitle');
  if (subtitle) subtitle.innerHTML = `Cheapest flights from <strong>${airport.city}</strong> — click to search`;
  if (globeInstance) {
    const arcs = AIRPORTS.filter(d => d.code !== airport.code).slice(0, 30).map(d => ({
      startLat: airport.lat, startLng: airport.lon, endLat: d.lat, endLng: d.lon,
      color: ['rgba(0,212,170,0.5)', 'rgba(0,212,170,0.05)'],
    }));
    globeInstance.arcsData(arcs);
    globeInstance.pointOfView({ lat: airport.lat, lng: airport.lon, altitude: 2.2 }, 1000);
  }
}

// ===== 3D GLOBE =====
let globeInstance = null;

function initGlobe() {
  const container = document.getElementById('globeViz');
  if (!container || globeInstance) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const origin = AIRPORTS.find(a => a.code === (document.getElementById('originSelect')?.value || 'HKG')) || AIRPORTS[0];
  const arcs = AIRPORTS.filter(d => d.code !== origin.code).slice(0, 30).map(d => ({
    startLat: origin.lat, startLng: origin.lon, endLat: d.lat, endLng: d.lon,
    color: ['rgba(0,212,170,0.5)', 'rgba(0,212,170,0.05)'],
  }));

  try {
    globeInstance = Globe()
      .globeImageUrl('https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png')
      .backgroundImageUrl('https://unpkg.com/three-globe@2.31.1/example/img/night-sky.png')
      .width(container.offsetWidth).height(container.offsetHeight || 500)
      .atmosphereColor(isDark ? '#00d4aa' : '#0d9488').atmosphereAltitude(0.2)
      .pointsData(AIRPORTS).pointLat(d => d.lat).pointLng(d => d.lon)
      .pointColor(() => '#00d4aa').pointAltitude(0.02).pointRadius(0.4)
      .labelsData(AIRPORTS).labelLat(d => d.lat).labelLng(d => d.lon)
      .labelText(d => d.city).labelSize(1.2).labelDotRadius(0.4)
      .labelColor(() => 'rgba(255,255,255,0.85)').labelResolution(2).labelAltitude(0.025)
      .arcsData(arcs).arcColor('color').arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2000).arcStroke(0.3)
      .onPointClick(d => selectDestination(d))
      .onLabelClick(d => selectDestination(d))
      (container);

    globeInstance.pointOfView({ lat: origin.lat, lng: origin.lon, altitude: 2.2 }, 0);
    globeInstance.controls().autoRotate = true;
    globeInstance.controls().autoRotateSpeed = 0.5;
    globeInstance.controls().enableZoom = true;
    globeInstance.controls().minDistance = 150;
    globeInstance.controls().maxDistance = 500;
  } catch (err) {
    container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-muted);">3D Globe requires WebGL</div>`;
  }

  // Resize handler
  window.addEventListener('resize', () => {
    if (globeInstance && container.offsetWidth) {
      globeInstance.width(container.offsetWidth);
      globeInstance.height(container.offsetHeight || 500);
    }
  });
}

// ===== SPIN & DART =====
let dartMode = false;
function initSpinDart() {
  document.getElementById('spinDartBtn')?.addEventListener('click', spinAndThrowDart);
  document.getElementById('discoverySpinAgain')?.addEventListener('click', () => {
    document.getElementById('discoverySection').style.display = 'none';
    document.getElementById('globe-section')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(spinAndThrowDart, 500);
  });
  document.getElementById('discoverySearchBtn')?.addEventListener('click', () => {
    const code = document.getElementById('discoverySearchBtn').dataset.code;
    if (code) { setDestCode(code); searchFlightsUI(); }
  });
}

function spinAndThrowDart() {
  if (dartMode) { cancelDartMode(); return; }
  dartMode = true;
  const btn = document.getElementById('spinDartBtn');
  btn.style.animation = 'pulse 1s ease-in-out infinite';
  if (globeInstance) {
    globeInstance.controls().autoRotateSpeed = 75;
    globeInstance.onGlobeClick(({ lat, lng }) => { if (dartMode) throwDartAt(lat, lng); });
  }
  showToast('Globe is spinning! Tap anywhere to throw your dart!', 'info');
}

function cancelDartMode() {
  dartMode = false;
  const btn = document.getElementById('spinDartBtn');
  if (btn) btn.style.animation = '';
  if (globeInstance) { globeInstance.controls().autoRotateSpeed = 0.5; globeInstance.onGlobeClick(null); }
}

async function throwDartAt(lat, lng) {
  cancelDartMode();
  const origin = document.getElementById('originSelect')?.value || 'HKG';
  let nearest = null, nearestDist = Infinity;
  for (const a of AIRPORTS) {
    if (a.code === origin) continue;
    const dist = Math.sqrt(Math.pow(a.lat - lat, 2) + Math.pow(a.lon - lng, 2));
    if (dist < nearestDist) { nearestDist = dist; nearest = a; }
  }
  if (!nearest) { showToast('No airports near your dart!', 'warning'); return; }
  if (globeInstance) globeInstance.pointOfView({ lat: nearest.lat, lng: nearest.lon, altitude: 1.8 }, 1500);
  showToast(`Your dart landed near ${nearest.city}!`, 'success');
  await showDiscoveryCard(nearest, origin);
}

function selectDestination(dest) {
  const origin = document.getElementById('originSelect')?.value || 'HKG';
  if (dest.code === origin) { showToast(`${dest.city} is already your origin`, 'warning'); return; }
  setDestCode(dest.code);
  showDiscoveryCard(dest, origin);
}

// ===== DISCOVERY CARD =====
async function showDiscoveryCard(dest, origin) {
  const section = document.getElementById('discoverySection');
  const hero = document.getElementById('discoveryHero');
  section.style.display = '';
  document.getElementById('discoveryCity').textContent = dest.city;
  document.getElementById('discoveryCountry').textContent = `${dest.flag} ${dest.country}`;
  document.getElementById('discoverySearchBtn').dataset.code = dest.code;

  const cleanCity = dest.city.replace(/ (Narita|Haneda|Incheon|Heathrow|Gatwick|JFK|Changi|International|Airport)$/i, '').trim();
  hero.style.backgroundImage = 'none';
  fetchCityImage(cleanCity).then(url => { if (url) hero.style.backgroundImage = `url(${url})`; });

  const about = document.getElementById('discoveryAbout');
  const highlights = document.getElementById('discoveryHighlights');
  const flight = document.getElementById('discoveryFlight');
  about.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';
  highlights.innerHTML = '';
  flight.innerHTML = '<div class="discovery-flight-loading">Checking prices...</div>';
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);

  fetchWikipediaInfo(cleanCity, dest.country).then(info => {
    about.innerHTML = info ? `<p>${info.description}</p>` : `<p>${dest.city} is a popular destination in ${dest.country}.</p>`;
    if (info?.highlights) highlights.innerHTML = info.highlights.map(h => `<span class="discovery-highlight">${h}</span>`).join('');
  });

  // Extras
  const extrasDiv = document.getElementById('discoveryExtras');
  if (extrasDiv) {
    extrasDiv.innerHTML = '';
    fetchDestinationExtras(cleanCity, dest.country).then(extras => {
      if (extras.length) {
        extrasDiv.innerHTML = extras.map(e => `
          <div class="discovery-extra-card">
            <div class="discovery-extra-label">${e.label}</div>
            <div class="discovery-extra-value">${e.value}</div>
            ${e.sub ? `<div class="discovery-extra-sub">${e.sub}</div>` : ''}
          </div>
        `).join('');
      }
    });
  }

  const date = document.getElementById('flightDate')?.value || new Date(Date.now() + 86400000).toISOString().split('T')[0];
  try {
    let data;
    try {
      const r = await fetch(`${API_BASE}/amadeus/flights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination: dest.code, date, passengers: 1 }) });
      data = await r.json();
      if (!data.flights?.length) throw new Error('empty');
    } catch {
      const r = await fetch(`${API_BASE}/gateway/flights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination: dest.code, date, passengers: 1 }) });
      data = await r.json();
    }
    if (data.flights?.length) {
      const cheapest = data.flights.reduce((m, f) => parseFloat(f.total_amount) < parseFloat(m.total_amount) ? f : m);
      const dc = getSelectedCurrency();
      const price = convertPrice(parseFloat(cheapest.total_amount), cheapest.currency, dc);
      const gbp = convertPrice(price, dc, 'GBP');
      const cls = gbp < 150 ? 'great' : gbp < 300 ? 'fair' : 'high';
      const lbl = gbp < 150 ? 'Great deal!' : gbp < 300 ? 'Fair price' : 'Above average';
      flight.innerHTML = `<div class="discovery-flight-price"><div><div class="discovery-flight-price-amount">${formatPrice(price, dc)}</div><div class="discovery-flight-price-label">From ${origin} · ${cheapest.airline || ''} · ${cheapest.stops || 0} stop${(cheapest.stops||0)!==1?'s':''}</div></div><span class="discovery-flight-deal ${cls}">${lbl}</span></div>`;
    } else { flight.innerHTML = '<div class="discovery-flight-loading">No flights found for this date.</div>'; }
  } catch { flight.innerHTML = '<div class="discovery-flight-loading">Could not check prices.</div>'; }
}

async function fetchCityImage(city) {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.originalimage?.source || d.thumbnail?.source || null;
  } catch { return null; }
}

async function fetchWikipediaInfo(city, country) {
  try {
    let r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`);
    if (!r.ok) r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city + ' ' + country)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.extract) return null;
    const sentences = d.extract.split('. ');
    const description = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '.' : '');
    const t = d.extract.toLowerCase();
    const highlights = [];
    if (t.includes('beach') || t.includes('coast') || t.includes('island')) highlights.push('Beaches');
    if (t.includes('temple') || t.includes('shrine')) highlights.push('Temples');
    if (t.includes('museum') || t.includes('gallery')) highlights.push('Museums');
    if (t.includes('food') || t.includes('cuisine')) highlights.push('Food');
    if (t.includes('mountain') || t.includes('hiking')) highlights.push('Nature');
    if (t.includes('shopping') || t.includes('market')) highlights.push('Shopping');
    if (t.includes('history') || t.includes('historic')) highlights.push('History');
    if (t.includes('nightlife') || t.includes('bar')) highlights.push('Nightlife');
    if (t.includes('financial') || t.includes('business')) highlights.push('Business Hub');
    if (highlights.length < 3) highlights.push('City Life');
    return { description, highlights: highlights.slice(0, 5) };
  } catch { return null; }
}

async function fetchDestinationExtras(city, country) {
  const extras = [];
  try {
    const wr = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    if (wr.ok) {
      const wd = await wr.json();
      const current = wd.current_condition?.[0];
      if (current) {
        extras.push({ label: 'Weather Now', value: `${current.temp_C}°C`, sub: current.weatherDesc?.[0]?.value || '' });
        extras.push({ label: 'Feels Like', value: `${current.FeelsLikeC}°C`, sub: `Humidity: ${current.humidity}%` });
      }
    }
  } catch {}
  try {
    const now = new Date();
    extras.push({ label: 'Your Time', value: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), sub: 'Local time' });
  } catch {}
  return extras;
}

// ===== SEARCH =====
function initSearch() {
  document.getElementById('searchFlightsBtn').addEventListener('click', searchFlightsUI);
  document.getElementById('swapRoute').addEventListener('click', () => {
    const originHidden = document.getElementById('originSelect');
    const destHidden = document.getElementById('destSelect');
    const originInput = document.getElementById('originInput');
    const destInput = document.getElementById('flightTo');
    const originCode = originHidden?.value || '';
    const destCode = destHidden?.value || '';
    const originDisplay = originInput?.value || '';
    const destDisplay = destInput?.value || '';
    // Swap
    if (originHidden) originHidden.value = destCode;
    if (destHidden) destHidden.value = originCode;
    if (originInput) originInput.value = destDisplay;
    if (destInput) destInput.value = originDisplay;
  });
  document.getElementById('scanAllBtn')?.addEventListener('click', scanAllDestinations);
  document.getElementById('addWatchRoute')?.addEventListener('click', () => {
    const f = document.getElementById('originSelect')?.value || 'HKG';
    const t = getDestCode();
    const d = document.getElementById('flightDate').value;
    if (f && t && d) watchRoute(f, t, d);
  });
  document.getElementById('roundTrip')?.addEventListener('change', function() {
    document.getElementById('returnDateField').style.display = this.checked ? '' : 'none';
  });

  // Sort pills
  document.querySelectorAll('.sort-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (window._lastFlights) {
        const s = pill.dataset.sort;
        const sorted = [...window._lastFlights];
        if (s === 'price') sorted.sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
        else if (s === 'duration') sorted.sort((a, b) => (a.duration||'').localeCompare(b.duration||''));
        else if (s === 'departure') sorted.sort((a, b) => (a.departure_at||'').localeCompare(b.departure_at||''));
        window._lastFlights = sorted;
        renderFlightResults(sorted);
      }
    });
  });
  document.querySelectorAll('.chart-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPriceHistory();
    });
  });
}

async function searchFlightsUI() {
  const origin = (document.getElementById('originSelect')?.value || 'HKG').trim().toUpperCase();
  const destination = getDestCode();
  const date = document.getElementById('flightDate').value;
  const pax = document.getElementById('flightPax').value;
  const resultsDiv = document.getElementById('flightResults');
  if (!origin || !destination || !date) { showToast('Fill in origin, destination and date', 'warning'); return; }
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Searching...</div>';

  // Scroll to results
  document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });

  try {
    let data;
    try {
      const r = await fetch(`${API_BASE}/amadeus/flights`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ origin, destination, date, passengers: parseInt(pax), currency: getSelectedCurrency() }) });
      data = await r.json();
      if (!data.flights?.length || data.error) throw new Error('empty');
    } catch {
      const r = await fetch(`${API_BASE}/gateway/flights`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ origin, destination, date, passengers: parseInt(pax) }) });
      data = await r.json();
    }
    if (data.flights?.length) {
      const maxStops = document.getElementById('stopsFilter')?.value;
      if (maxStops && maxStops !== 'any') data.flights = data.flights.filter(f => f.stops <= parseInt(maxStops));
      if (!data.flights.length) { resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No flights match your filters.</div>'; return; }
      window._lastFlights = data.flights;
      document.getElementById('resultsToolbar').style.display = 'flex';
      document.getElementById('resultsCount').textContent = `${data.flights.length} flights · ${origin} → ${destination}`;
      renderFlightResults(data.flights);
      showToast(`${data.flights.length} flights found!`, 'success');
      loadPriceHistory();
      showDealRecommendation(data.flights, origin, destination);
      showPriceCalendar(origin, destination);
      loadFlexDateGrid(origin, destination, date);
      // Update price explorer route label
      document.getElementById('priceExplorerRoute').textContent = `${origin} → ${destination}`;
    } else {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No flights found. Try different dates.</div>';
    }
  } catch (err) {
    resultsDiv.innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger);">Search failed: ${err.message}</div>`;
  }
}

function renderFlightResults(flights) {
  const dc = getSelectedCurrency();
  const resultsDiv = document.getElementById('flightResults');
  const origin = document.getElementById('originSelect')?.value || 'HKG';
  const dest = getDestCode();
  const date = document.getElementById('flightDate').value;
  resultsDiv.innerHTML = flights.map(f => {
    const converted = convertPrice(parseFloat(f.total_amount), f.currency, dc);
    return `<div class="flight-result">
      <div class="flight-airline">${escapeHtml(f.airline || f.airline_iata)}<br><span class="flight-airline-code">${f.airline_iata||''}</span></div>
      <div class="flight-times">
        <span class="flight-time">${(f.departure_at||'').split('T')[1]?.substring(0,5)||'--:--'}</span>
        <div class="flight-arrow"><div class="flight-arrow-line"></div><span class="flight-arrow-label">${f.duration||''}</span></div>
        <span class="flight-time">${(f.arrival_at||'').split('T')[1]?.substring(0,5)||'--:--'}</span>
      </div>
      <div class="flight-meta">${f.stops} stop${f.stops!==1?'s':''}<br>${f.cabin_class||''}</div>
      <div class="flight-price">${formatPrice(converted, dc)}${f.currency!==dc?`<br><span class="flight-price-currency">${f.currency} ${f.total_amount}</span>`:''}</div>
    </div>`;
  }).join('') + `<div style="display:flex;gap:8px;justify-content:flex-end;padding:8px 0;">
    <button class="btn-text" onclick="watchRoute('${escapeHtml(origin)}','${escapeHtml(dest)}','${escapeHtml(date)}')">Watch this route</button>
    <button class="btn-text" onclick="openRouteIntel('${escapeHtml(origin)}','${escapeHtml(dest)}')">Route Intel</button>
  </div>`;
}

function showDealRecommendation(flights, origin, destination) {
  const section = document.getElementById('dealSection');
  if (!section || !flights.length) return;
  section.style.display = '';
  const dc = getSelectedCurrency();
  const srcCurrency = flights[0].currency || 'GBP';
  const prices = flights.map(f => convertPrice(parseFloat(f.total_amount), srcCurrency, dc));
  const lo = Math.min(...prices), hi = Math.max(...prices), avg = prices.reduce((a,b)=>a+b,0)/prices.length;
  const gbp = convertPrice(lo, dc, 'GBP');
  const cls = gbp<150?'buy':gbp<300?'wait':'expensive';
  const msg = gbp<150?'Great deal — Buy now!':gbp<300?'Fair price — Consider waiting':'Above average — Wait if possible';
  const adv = gbp<150?`${formatPrice(lo,dc)} is excellent for ${origin} to ${destination}.`:gbp<300?`${formatPrice(lo,dc)} is reasonable. Watch for drops.`:`${formatPrice(lo,dc)} is high. Wait for better prices.`;
  document.getElementById('dealVerdict').className = `deal-verdict ${cls}`;
  document.getElementById('dealIcon').textContent = gbp<150?'✅':gbp<300?'⏳':'🔴';
  document.getElementById('dealTitle').textContent = msg;
  document.getElementById('dealDescription').textContent = adv;
  document.getElementById('dealStats').innerHTML = `
    <div class="deal-stat"><div class="deal-stat-value ${cls==='buy'?'good':cls==='expensive'?'bad':''}">${formatPrice(lo,dc)}</div><div class="deal-stat-label">Lowest</div></div>
    <div class="deal-stat"><div class="deal-stat-value">${formatPrice(avg,dc)}</div><div class="deal-stat-label">Average</div></div>
    <div class="deal-stat"><div class="deal-stat-value">${formatPrice(hi,dc)}</div><div class="deal-stat-label">Highest</div></div>
    <div class="deal-stat"><div class="deal-stat-value">${flights.length}</div><div class="deal-stat-label">Options</div></div>`;
}

// ===== WATCHED ROUTES =====
async function watchRoute(origin, dest, date) {
  await fetch(`${API_BASE}/travel/routes`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ origin, destination: dest, travelDate: date }) });
  showToast(`Watching ${origin} → ${dest}`, 'success');
  loadWatchedRoutes();
}

async function loadWatchedRoutes() {
  try {
    const r = await fetch(`${API_BASE}/travel/routes`);
    const d = await r.json();
    const container = document.getElementById('watchedRoutes');
    if (d.routes?.length) {
      container.innerHTML = d.routes.map(route => `
        <div class="watched-route">
          <div class="watched-route-info">
            <div class="watched-route-name">${route.origin} → ${route.destination}</div>
            <div class="watched-route-date">${route.travel_date}</div>
          </div>
          <div class="watched-route-actions">
            <button class="btn-text" onclick="setDestCode('${route.destination}');document.getElementById('flightDate').value='${route.travel_date}';searchFlightsUI();">Check</button>
            <button class="btn-text" onclick="openRouteIntel('${route.origin}','${route.destination}')">Intel</button>
            <button class="btn-text" onclick="promptAlert('${route.origin}','${route.destination}')">Alert</button>
          </div>
        </div>`).join('');
    } else {
      container.innerHTML = '<div class="empty-state"><p>Search for flights and click "Watch this route" to track prices.</p></div>';
    }
  } catch {}
}

// ===== ALERTS =====
function promptAlert(origin, destination) {
  const price = prompt(`Set target price for ${origin} → ${destination} (in ${getSelectedCurrency()}):`);
  if (price && !isNaN(parseFloat(price))) {
    createAlert(origin, destination, parseFloat(price), getSelectedCurrency());
  }
}

async function createAlert(origin, destination, targetPrice, currency) {
  try {
    await fetch(`${API_BASE}/alerts`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ origin, destination, targetPrice, currency }) });
    showToast(`Alert set: ${origin}→${destination} below ${formatPrice(targetPrice, currency)}`, 'success');
    loadAlerts();
  } catch { showToast('Failed to create alert', 'error'); }
}

async function loadAlerts() {
  try {
    const [activeRes, triggeredRes] = await Promise.all([
      fetch(`${API_BASE}/alerts`).then(r => r.json()).catch(() => ({ alerts: [] })),
      fetch(`${API_BASE}/alerts/triggered`).then(r => r.json()).catch(() => ({ alerts: [] }))
    ]);

    const alertsList = document.getElementById('alertsList');
    const triggeredDiv = document.getElementById('triggeredAlerts');
    if (!alertsList) return;

    if (activeRes.alerts?.length) {
      alertsList.innerHTML = activeRes.alerts.map(a => `
        <div class="alert-item">
          <span class="alert-route">${a.origin} → ${a.destination}</span>
          <span class="alert-target">below ${formatPrice(a.target_price, a.currency)}</span>
          <button class="btn-text" style="color:var(--danger);" onclick="deleteAlert(${a.id})">Remove</button>
        </div>`).join('');
    } else {
      alertsList.innerHTML = '';
    }

    if (triggeredRes.alerts?.length && triggeredDiv) {
      triggeredDiv.innerHTML = triggeredRes.alerts.map(a => `
        <div class="alert-triggered">
          ${a.origin} → ${a.destination} dropped to ${formatPrice(a.triggered_price, a.currency)} (target: ${formatPrice(a.target_price, a.currency)})
        </div>`).join('');
    }
  } catch {}
}

async function deleteAlert(id) {
  await fetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
  loadAlerts();
}

// ===== SCAN ALL DESTINATIONS =====
async function scanAllDestinations() {
  const origin = document.getElementById('originSelect')?.value || 'HKG';
  const date = document.getElementById('flightDate').value;
  const dc = getSelectedCurrency();
  const grid = document.getElementById('cheapestGrid');
  const dests = AIRPORTS.filter(d => d.code !== origin);
  grid.innerHTML = dests.slice(0, 20).map(d => `<div class="cheapest-card loading" id="cheap-${d.code}"><div class="cheapest-card-dest"><span class="flag">${d.flag}</span> ${d.city}</div><div class="cheapest-card-route">${origin} → ${d.code}</div><div class="cheapest-card-price" style="color:var(--text-muted)">Searching...</div></div>`).join('');
  showToast(`Scanning destinations from ${origin}...`, 'info');

  for (const dest of dests.slice(0, 20)) {
    try {
      const r = await fetch(`${API_BASE}/gateway/flights`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ origin, destination: dest.code, date, passengers:1 }) });
      const data = await r.json();
      const card = document.getElementById(`cheap-${dest.code}`);
      if (!card) continue;
      card.classList.remove('loading');
      if (data.flights?.length) {
        const cheapest = data.flights.reduce((m,f)=>parseFloat(f.total_amount)<parseFloat(m.total_amount)?f:m);
        const price = convertPrice(parseFloat(cheapest.total_amount), cheapest.currency, dc);
        const gbp = convertPrice(price, dc, 'GBP');
        const cls = gbp<150?'great':gbp<300?'fair':'high';
        card.innerHTML = `<div class="cheapest-card-deal ${cls}">${gbp<150?'Great deal':gbp<300?'Fair':'Pricey'}</div><div class="cheapest-card-dest"><span class="flag">${dest.flag}</span> ${dest.city}</div><div class="cheapest-card-route">${origin}→${dest.code}</div><div class="cheapest-card-price">${formatPrice(price,dc)}</div>`;
        card.onclick = () => { setDestCode(dest.code); searchFlightsUI(); };
      } else {
        card.innerHTML = `<div class="cheapest-card-dest"><span class="flag">${dest.flag}</span> ${dest.city}</div><div class="cheapest-card-price" style="color:var(--text-muted);font-size:12px">No flights</div>`;
      }
    } catch { const card = document.getElementById(`cheap-${dest.code}`); if(card) { card.classList.remove('loading'); card.innerHTML=`<div class="cheapest-card-dest">${escapeHtml(dest.city)}</div><div class="cheapest-card-price" style="color:var(--text-muted)">Error</div>`; } }
    await new Promise(r => setTimeout(r, 500));
  }
}

// ===== PRICE HISTORY CHART =====
let tvChartInstance = null;
let tvChartObserver = null;
async function loadPriceHistory() {
  const container = document.getElementById('tvChart');
  if (!container) return;
  try {
    const rangeDays = parseInt(document.querySelector('.chart-range-btn.active')?.dataset.range || '30');
    const r = await fetch(`${API_BASE}/travel/prices?limit=500`);
    const data = await r.json();
    if (!data.prices?.length) { container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;">Search flights to start tracking prices</div>'; return; }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    // Filter by date range
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filteredPrices = data.prices.filter(p => {
      const d = p.checked_at?.substring(0,10) || p.date;
      return d >= cutoffStr;
    });
    const pricesToUse = filteredPrices.length ? filteredPrices : data.prices;
    const byDate = {};
    for (const p of pricesToUse) { const date = p.checked_at?.substring(0,10)||p.date; if(!byDate[date]) byDate[date]={prices:[],route:p.route,currency:p.currency}; byDate[date].prices.push(p.price); }
    const lineData = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,info])=>({ time:date, value:Math.min(...info.prices) }));
    document.getElementById('chartRoute').textContent = `${data.prices[0]?.route||''} · ${data.prices[0]?.currency||''}`;
    if (tvChartInstance) tvChartInstance.remove();
    tvChartInstance = LightweightCharts.createChart(container, {
      width: container.offsetWidth, height: 280,
      layout: { background:{type:'solid',color:isDark?'#141926':'#fff'}, textColor:isDark?'#94a3b8':'#64748b', fontFamily:'Inter,sans-serif', fontSize:11 },
      grid: { vertLines:{color:isDark?'#1e293b':'#f0f0f2'}, horzLines:{color:isDark?'#1e293b':'#f0f0f2'} },
      rightPriceScale: { borderColor:isDark?'#1e293b':'#e2e8f0' },
      timeScale: { borderColor:isDark?'#1e293b':'#e2e8f0' },
    });
    const series = tvChartInstance.addAreaSeries({ topColor:isDark?'rgba(0,212,170,0.3)':'rgba(13,148,136,0.15)', bottomColor:'rgba(0,212,170,0.02)', lineColor:'#00d4aa', lineWidth:2 });
    series.setData(lineData);
    tvChartInstance.timeScale().fitContent();
    if (tvChartObserver) tvChartObserver.disconnect();
    tvChartObserver = new ResizeObserver(()=>{ if(tvChartInstance) tvChartInstance.applyOptions({width:container.offsetWidth}); });
    tvChartObserver.observe(container);
  } catch {}
}

// ===== PRICE CALENDAR =====
let calYear, calMonth, calPrices = {};
function initPriceCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  document.getElementById('calPrev')?.addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('calNext')?.addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
}

function showPriceCalendar(origin, destination) {
  const wrap = document.getElementById('priceCalendarWrap');
  if (!wrap) return;
  wrap.style.display = '';
  wrap.dataset.origin = origin;
  wrap.dataset.destination = destination;
  calPrices = {};
  renderCalendar();
  fetchCalendarPrices(origin, destination);
}

async function fetchCalendarPrices(origin, destination) {
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const dc = getSelectedCurrency();
  const sampleDays = [1, 5, 10, 15, 20, 25, Math.min(28, daysInMonth)];
  for (const day of sampleDays) {
    const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    try {
      const r = await fetch(`${API_BASE}/gateway/flights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination, date, passengers: 1 }) });
      const data = await r.json();
      if (data.flights?.length) {
        const cheapest = data.flights.reduce((m, f) => parseFloat(f.total_amount) < parseFloat(m.total_amount) ? f : m);
        calPrices[date] = convertPrice(parseFloat(cheapest.total_amount), cheapest.currency, dc);
      }
    } catch {}
    renderCalendar();
    await new Promise(r => setTimeout(r, 400));
  }
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if (!grid || !label) return;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent = `${monthNames[calMonth]} ${calYear}`;
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const dc = getSelectedCurrency();
  const priceValues = Object.values(calPrices).filter(p => p > 0);
  const minP = priceValues.length ? Math.min(...priceValues) : 0;
  const maxP = priceValues.length ? Math.max(...priceValues) : 0;
  const range = maxP - minP || 1;
  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const price = calPrices[date];
    let cls = 'nodata', priceStr = '';
    if (price) { const pct = (price - minP) / range; cls = pct < 0.33 ? 'cheap' : pct < 0.66 ? 'mid' : 'high'; priceStr = formatPrice(price, dc); }
    const selected = date === document.getElementById('flightDate')?.value ? ' selected' : '';
    html += `<div class="cal-day ${cls}${selected}" data-date="${date}" onclick="selectCalendarDate('${date}')"><span class="cal-day-num">${day}</span>${priceStr ? `<span class="cal-day-price">${priceStr}</span>` : ''}</div>`;
  }
  grid.innerHTML = html;
}

function selectCalendarDate(date) {
  document.getElementById('flightDate').value = date;
  renderCalendar();
  searchFlightsUI();
}

// ===== FLEXIBLE DATE GRID =====
async function loadFlexDateGrid(origin, destination, startDate) {
  const wrap = document.getElementById('flexDateGridWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="flex-date-placeholder">Loading flexible date prices...</div>';
  try {
    const r = await fetch(`${API_BASE}/price-grid?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&startDate=${encodeURIComponent(startDate)}&days=7&maxTrip=7`);
    const data = await r.json();
    if (!data.grid || !data.depDates?.length) {
      wrap.innerHTML = '<div class="flex-date-placeholder">No flexible date data available yet. Search more dates to build the grid.</div>';
      return;
    }
    const dc = getSelectedCurrency();
    const allPrices = data.grid.flat().filter(c => c && c.price).map(c => c.price);
    if (!allPrices.length) {
      wrap.innerHTML = '<div class="flex-date-placeholder">No cached prices for this route. Search a few dates first.</div>';
      return;
    }
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const range = maxP - minP || 1;
    const cols = data.retDates.length + 1;
    let html = `<div class="flex-date-grid" style="grid-template-columns: repeat(${cols}, minmax(60px, 1fr));">`;
    // Header row
    html += '<div class="flex-date-cell corner">Dep \\ Ret</div>';
    for (const ret of data.retDates) {
      html += `<div class="flex-date-cell header">${ret.substring(5)}</div>`;
    }
    // Data rows
    for (let i = 0; i < data.depDates.length; i++) {
      html += `<div class="flex-date-cell header">${data.depDates[i].substring(5)}</div>`;
      for (let j = 0; j < data.retDates.length; j++) {
        const cell = data.grid[i][j];
        if (cell && cell.price) {
          const price = convertPrice(cell.price, cell.currency || 'GBP', dc);
          const pct = (price - minP) / range;
          const cls = pct < 0.33 ? 'cheap' : pct < 0.66 ? 'mid' : 'high';
          html += `<div class="flex-date-cell ${cls}" onclick="selectCalendarDate('${escapeHtml(data.depDates[i])}')">${formatPrice(price, dc)}</div>`;
        } else {
          html += '<div class="flex-date-cell" style="color:var(--text-muted);font-size:10px;">--</div>';
        }
      }
    }
    html += '</div>';
    wrap.innerHTML = html;
  } catch {
    wrap.innerHTML = '<div class="flex-date-placeholder">Could not load flexible date prices.</div>';
  }
}

// ===== ROUTE INTELLIGENCE =====
let _routeIntelListenersAttached = false;
async function openRouteIntel(origin, destination) {
  const modal = document.getElementById('routeIntelModal');
  const body = document.getElementById('routeIntelBody');
  modal.classList.add('open');
  body.innerHTML = '<div class="route-intel-placeholder"><p>Loading route intelligence...</p></div>';

  if (!_routeIntelListenersAttached) {
    document.getElementById('closeRouteIntel')?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    _routeIntelListenersAttached = true;
  }

  try {
    const r = await fetch(`${API_BASE}/route-intel?origin=${origin}&destination=${destination}`);
    const data = await r.json();

    if (!data.count || data.count < 3) {
      body.innerHTML = `<div class="route-intel-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z"/></svg><p>Not enough data yet for ${origin} → ${destination}.<br>Search this route a few more times to build intelligence.</p></div>`;
      return;
    }

    const dc = getSelectedCurrency();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    let html = `<div class="route-intel-grid">`;

    // By Month
    if (data.byMonth?.length) {
      const maxVal = Math.max(...data.byMonth.map(m => m.avgPrice));
      html += `<div class="route-intel-chart"><div class="route-intel-chart-title">Average Price by Month</div><div class="bar-chart">`;
      for (const m of data.byMonth) {
        const pct = (m.avgPrice / maxVal * 100).toFixed(0);
        html += `<div class="bar-chart-row"><span class="bar-chart-label">${monthNames[parseInt(m.month)-1] || m.month}</span><div class="bar-chart-bar" style="width:${pct}%"></div><span class="bar-chart-value">${formatPrice(m.avgPrice, dc)}</span></div>`;
      }
      html += `</div></div>`;
    }

    // By Day of Week
    if (data.byDayOfWeek?.length) {
      const maxVal = Math.max(...data.byDayOfWeek.map(d => d.avgPrice));
      html += `<div class="route-intel-chart"><div class="route-intel-chart-title">Average Price by Day</div><div class="bar-chart">`;
      for (const d of data.byDayOfWeek) {
        const pct = (d.avgPrice / maxVal * 100).toFixed(0);
        html += `<div class="bar-chart-row"><span class="bar-chart-label">${dayNames[parseInt(d.day)] || d.day}</span><div class="bar-chart-bar secondary" style="width:${pct}%"></div><span class="bar-chart-value">${formatPrice(d.avgPrice, dc)}</span></div>`;
      }
      html += `</div></div>`;
    }

    // By Airline
    if (data.byAirline?.length) {
      const maxVal = Math.max(...data.byAirline.map(a => a.avgPrice));
      html += `<div class="route-intel-chart"><div class="route-intel-chart-title">Price by Airline</div><div class="hbar-chart">`;
      for (const a of data.byAirline) {
        const pct = (a.avgPrice / maxVal * 100).toFixed(0);
        const color = a.avgPrice <= data.byAirline[0].avgPrice * 1.1 ? 'var(--success)' : a.avgPrice >= maxVal * 0.9 ? 'var(--danger)' : 'var(--accent)';
        html += `<div class="hbar-row"><span class="hbar-label">${escapeHtml(a.airline)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${color}"></div><span class="hbar-value">${formatPrice(a.avgPrice, dc)}</span></div></div>`;
      }
      html += `</div></div>`;
    }

    // Trend (use text summary since we can't easily add another chart instance here)
    if (data.trend?.length) {
      const prices = data.trend.map(t => t.avgPrice);
      const trendMin = Math.min(...prices);
      const trendMax = Math.max(...prices);
      const recent = prices[prices.length - 1];
      const older = prices[0];
      const direction = recent < older ? 'dropping' : recent > older ? 'rising' : 'stable';
      html += `<div class="route-intel-chart"><div class="route-intel-chart-title">Price Trend</div><div style="padding:16px;text-align:center;"><div style="font-size:24px;font-weight:800;font-family:var(--font-mono);color:${direction==='dropping'?'var(--success)':direction==='rising'?'var(--danger)':'var(--accent)'};">${direction === 'dropping' ? '↓' : direction === 'rising' ? '↑' : '→'} Prices ${direction}</div><div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">Range: ${formatPrice(trendMin,dc)} – ${formatPrice(trendMax,dc)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${data.trend.length} data points</div></div></div>`;
    }

    html += `</div>`;
    body.innerHTML = html;
  } catch {
    body.innerHTML = '<div class="route-intel-placeholder"><p>Failed to load route intelligence.</p></div>';
  }
}

// ===== TRIP PLANNER =====
function initTripPlanner() {
  const newBtn = document.getElementById('newTripBtn');
  const modal = document.getElementById('tripModal');
  const closeBtn = document.getElementById('closeTripModal');
  const saveBtn = document.getElementById('saveTripBtn');
  if (!newBtn) return;
  newBtn.addEventListener('click', () => modal.classList.add('open'));
  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  // Cost calculator
  const budgetInput = document.getElementById('tripDailyBudget');
  const daysInput = document.getElementById('tripDays');
  const costTotal = document.getElementById('tripCostTotal');
  const updateCost = () => {
    const budget = parseFloat(budgetInput?.value) || 0;
    const days = parseInt(daysInput?.value) || 0;
    const dc = getSelectedCurrency();
    costTotal.textContent = `= ${formatPrice(budget * days, dc)}`;
  };
  budgetInput?.addEventListener('input', updateCost);
  daysInput?.addEventListener('input', updateCost);

  saveBtn?.addEventListener('click', () => {
    const name = document.getElementById('tripName').value.trim();
    const dests = document.getElementById('tripDestinations').value.trim();
    const notes = document.getElementById('tripNotes').value.trim();
    const budget = parseFloat(document.getElementById('tripDailyBudget')?.value) || 0;
    const days = parseInt(document.getElementById('tripDays')?.value) || 0;
    if (!name) { showToast('Enter a trip name', 'warning'); return; }
    const trips = JSON.parse(localStorage.getItem('mindflight-trips') || '[]');
    trips.unshift({ name, destinations: dests.split(',').map(d => d.trim()).filter(Boolean), notes, budget, days, created: new Date().toISOString() });
    localStorage.setItem('mindflight-trips', JSON.stringify(trips));
    modal.classList.remove('open');
    document.getElementById('tripName').value = '';
    document.getElementById('tripDestinations').value = '';
    document.getElementById('tripNotes').value = '';
    showToast(`Trip "${name}" saved!`, 'success');
    renderTrips();
  });
  renderTrips();
}

function renderTrips() {
  const container = document.getElementById('tripsList');
  if (!container) return;
  const trips = JSON.parse(localStorage.getItem('mindflight-trips') || '[]');
  const dc = getSelectedCurrency();
  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No trips saved yet.</p><p class="text-muted-sm">Search for flights and save them here.</p></div>`;
    return;
  }
  container.innerHTML = trips.map((trip, i) => `
    <div class="trip-card">
      <div class="trip-card-header">
        <span class="trip-card-name">${escapeHtml(trip.name)}</span>
        <span class="trip-card-date">${new Date(trip.created).toLocaleDateString()}</span>
      </div>
      ${trip.destinations?.length ? `<div class="trip-card-destinations">${trip.destinations.map(d => `<span class="trip-dest-tag">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
      ${trip.notes ? `<div class="trip-card-notes">${escapeHtml(trip.notes)}</div>` : ''}
      ${trip.budget && trip.days ? `<div class="trip-card-cost">Est. ${formatPrice(trip.budget * trip.days, dc)} (${trip.days} days)</div>` : ''}
      <div class="trip-card-actions">
        ${trip.destinations?.map(d => {
          const airport = typeof AIRPORTS !== 'undefined' ? AIRPORTS.find(a => a.city.toLowerCase().includes(d.toLowerCase()) || a.code === d.toUpperCase()) : null;
          return airport ? `<button class="btn-text" onclick="setDestCode('${airport.code}');searchFlightsUI();">Flights to ${airport.code}</button>` : '';
        }).join('') || ''}
        <button class="btn-text" style="color:var(--text-muted);margin-left:auto;" onclick="deleteTrip(${i})">Delete</button>
      </div>
    </div>
  `).join('');
}

function deleteTrip(index) {
  const trips = JSON.parse(localStorage.getItem('mindflight-trips') || '[]');
  const name = trips[index]?.name;
  trips.splice(index, 1);
  localStorage.setItem('mindflight-trips', JSON.stringify(trips));
  showToast(`Trip "${name}" deleted`, 'info');
  renderTrips();
}

// ===== COMMAND PALETTE =====
function initCommandPalette() {
  const overlay = document.getElementById('cmdOverlay');
  const input = document.getElementById('cmdInput');
  const list = document.getElementById('cmdList');
  if (!overlay || !input) return;

  const commands = [
    { name: 'Search Flights', icon: '✈', action: () => document.getElementById('flightTo')?.focus(), kbd: 'S' },
    { name: 'Go to Globe', icon: '🌍', action: () => document.getElementById('globe-section')?.scrollIntoView({behavior:'smooth'}), kbd: 'G' },
    { name: 'Go to Deals', icon: '🏷', action: () => document.getElementById('recommended-section')?.scrollIntoView({behavior:'smooth'}) },
    { name: 'Go to Routes', icon: '📍', action: () => document.getElementById('search-section')?.scrollIntoView({behavior:'smooth'}) },
    { name: 'Go to Trips', icon: '📋', action: () => document.getElementById('trips-section')?.scrollIntoView({behavior:'smooth'}), kbd: 'T' },
    { name: 'Watched Routes', icon: '👁', action: () => document.getElementById('watched-section')?.scrollIntoView({behavior:'smooth'}), kbd: 'W' },
    { name: 'Toggle Dark Mode', icon: '🌙', action: toggleTheme, kbd: 'D' },
    { name: "I'm Feeling Lucky", icon: '🎯', action: spinAndThrowDart, kbd: 'L' },
    { name: 'Settings', icon: '⚙', action: () => document.getElementById('settingsModal')?.classList.add('open') },
  ];

  // Add airport commands
  AIRPORTS.forEach(a => {
    commands.push({ name: `Fly to ${a.city} (${a.code})`, icon: a.flag, action: () => { setDestCode(a.code); searchFlightsUI(); }, keywords: [a.code, a.city, a.country] });
  });

  let selectedIdx = 0;

  function openCmd() { overlay.classList.add('open'); input.value = ''; input.focus(); renderCommands(''); selectedIdx = 0; }
  function closeCmd() { overlay.classList.remove('open'); }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCmd(); });

  input.addEventListener('input', () => { renderCommands(input.value); selectedIdx = 0; });
  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.cmd-item');
    if (e.key === 'Escape') { closeCmd(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); updateSelection(items); }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); updateSelection(items); }
    if (e.key === 'Enter' && items[selectedIdx]) { items[selectedIdx].click(); }
  });

  function updateSelection(items) {
    items.forEach((it, i) => it.classList.toggle('selected', i === selectedIdx));
    items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function renderCommands(q) {
    q = q.toLowerCase().trim();
    const filtered = q ? commands.filter(c => {
      const searchStr = (c.name + ' ' + (c.keywords?.join(' ') || '')).toLowerCase();
      return searchStr.includes(q);
    }).slice(0, 12) : commands.slice(0, 10);

    list.innerHTML = filtered.map((c, i) => `
      <div class="cmd-item${i === 0 ? ' selected' : ''}" data-idx="${i}">
        <span class="cmd-item-icon">${c.icon}</span>
        <span class="cmd-item-label">${c.name}</span>
        ${c.kbd ? `<span class="cmd-item-kbd"><kbd>${c.kbd}</kbd></span>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.cmd-item').forEach((item, i) => {
      item.addEventListener('click', () => { closeCmd(); filtered[i]?.action(); });
    });
  }

  // Expose globally
  window._openCommandPalette = openCmd;
}

// ===== KEYBOARD SHORTCUTS =====
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.target.isContentEditable) return;

    // Cmd+K / Ctrl+K = command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      window._openCommandPalette?.();
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key.toLowerCase()) {
      case 'g': document.getElementById('globe-section')?.scrollIntoView({behavior:'smooth'}); break;
      case 's': document.getElementById('flightTo')?.focus(); break;
      case 'w': document.getElementById('watched-section')?.scrollIntoView({behavior:'smooth'}); break;
      case 't': document.getElementById('trips-section')?.scrollIntoView({behavior:'smooth'}); break;
      case 'd': toggleTheme(); break;
      case 'l': spinAndThrowDart(); break;
      case 'escape':
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        document.getElementById('cmdOverlay')?.classList.remove('open');
        break;
    }
  });
}

// ===== SHARE BUTTON =====
function initShareButton() {
  document.getElementById('discoveryShareBtn')?.addEventListener('click', async () => {
    const city = document.getElementById('discoveryCity')?.textContent || 'Destination';
    const price = document.querySelector('.discovery-flight-price-amount')?.textContent || '';
    const origin = document.getElementById('originSelect')?.value || 'HKG';
    const dest = document.getElementById('discoverySearchBtn')?.dataset.code || '';
    const url = `${window.location.origin}?route=${origin}-${dest}`;
    const text = `Check out flights to ${city}${price ? ` from ${price}` : ''} on MindFlight!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `MindFlight: ${city}`, text, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast('Link copied to clipboard!', 'success');
      } catch {
        showToast('Could not share', 'error');
      }
    }
  });
}

// ===== PWA =====
let deferredPrompt = null;
function initPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwaBanner');
    if (banner) banner.style.display = '';
  });

  document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('pwaBanner').style.display = 'none';
  });

  document.getElementById('pwaDismiss')?.addEventListener('click', () => {
    document.getElementById('pwaBanner').style.display = 'none';
  });
}

// ===== BUDGET SLIDER =====
function initBudgetSlider() {
  const slider = document.getElementById('budgetSlider');
  const display = document.getElementById('budgetDisplay');
  if (!slider) return;

  slider.addEventListener('input', () => {
    const dc = getSelectedCurrency();
    const val = parseInt(slider.value);
    display.textContent = `${FX_SYMBOLS[dc] || dc}0 – ${formatPrice(val, dc)}`;
  });
}

// ===== UTILS =====
function escapeHtml(s) { if(!s) return ''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function getDestCode() {
  return (document.getElementById('destSelect')?.value || document.getElementById('flightTo')?.value || '').trim().toUpperCase();
}

function setDestCode(code) {
  const hidden = document.getElementById('destSelect');
  const input = document.getElementById('flightTo');
  if (hidden) hidden.value = code;
  if (input) {
    const airport = AIRPORTS.find(a => a.code === code.toUpperCase());
    input.value = airport ? `${airport.city} (${airport.code})` : code;
  }
}
