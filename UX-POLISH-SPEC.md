# MindFlight UX Polish Specification
## Product Manager Decisions — Ready for Implementation
### April 2026

This document contains exact, implementable changes. Each item has a priority tier (P0 = do first, P1 = do second, P2 = nice to have). The designer/developer should implement in order.

---

# 1. SEARCH FORM POLISH

## 1.1 [P0] Search Bar Field Focus States — Google Flights Blue Underline Pattern

**What:** Replace the current border-color-only focus state with a prominent bottom-accent-line focus indicator.

**Current state (style.css line 377):**
```css
.gsb-input:focus { border-color: var(--accent); background: rgba(255,255,255,0.1); }
```
The entire border lights up teal, which is too subtle on the glassmorphic background. It doesn't create a clear visual hierarchy showing "this is the field I'm editing."

**Target state:**
```css
.gsb-input:focus {
  border-color: transparent;
  background: rgba(255,255,255,0.1);
  box-shadow: inset 0 -2px 0 0 var(--accent);
}
```
This replicates Google Flights' Material Design underline pattern. Only the bottom edge highlights, creating a crisp, directional focus indicator. The 2px inset shadow acts as an underline without layout shift.

**Why:** Google Flights uses a blue underline (not full border) to communicate active field. It's cleaner and more professional. The full-border glow we have now feels like a generic HTML focus ring.

---

## 1.2 [P0] Autocomplete Dropdown Redesign — Richer Suggestion Rows

**What:** Redesign the airport autocomplete dropdown items to show structured information with better visual hierarchy.

**Current state (style.css lines 614-623):**
The `.airport-option` is a flat flex row showing code, city, and country all at the same visual weight. No icons, no grouping, no recent searches.

**Current state (app.js lines 207-208):**
```html
<div class="airport-option" data-code="${a.code}">
  <span class="airport-option-code">${a.code}</span>
  <span class="airport-option-city">${a.city}</span>
  <span class="airport-option-country">${a.country}</span>
</div>
```

**Target state — HTML structure:**
```html
<div class="airport-option" data-code="${a.code}">
  <span class="airport-option-icon">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  </span>
  <span class="airport-option-info">
    <span class="airport-option-city">${a.city}</span>
    <span class="airport-option-sub">${a.country}</span>
  </span>
  <span class="airport-option-code">${a.code}</span>
</div>
```

**Target state — CSS:**
```css
.airport-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 280px; overflow-y: auto;
  z-index: 50; display: none;
  padding: 4px;
}
.airport-option {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  cursor: pointer; transition: background 0.15s ease;
  font-size: 13px;
  border-radius: var(--radius-sm);
}
.airport-option:hover {
  background: var(--accent-glow);
}
.airport-option-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
}
.airport-option:hover .airport-option-icon { color: var(--accent); }
.airport-option-info {
  flex: 1; display: flex; flex-direction: column; gap: 1px;
}
.airport-option-city {
  font-weight: 600; color: var(--text-primary); font-size: 13px;
}
.airport-option-sub {
  font-size: 11px; color: var(--text-muted); font-weight: 400;
}
.airport-option-code {
  font-weight: 800; font-size: 12px; color: var(--accent);
  font-family: var(--font-mono);
  background: var(--accent-glow);
  padding: 2px 8px; border-radius: 4px;
  letter-spacing: 0.5px;
}
```

**Why:** Google Flights and Skyscanner show structured, multi-line suggestion rows. Our current flat layout makes it hard to scan quickly. The IATA code badge on the right creates a visual anchor. The plane icon adds a travel context cue.

---

## 1.3 [P0] Search Button Visual Enhancement

**What:** Make the search button more prominent and add a micro-interaction on hover.

**Current state (style.css lines 391-403):**
The `.gsb-search-btn` is teal with 10px 20px padding and 38px height. It visually competes with the input fields rather than dominating them.

**Target state:**
```css
.gsb-search-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 0 24px;
  background: var(--accent);
  color: #0a0e1a;
  border: none; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 700;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  height: 42px;
  min-width: 120px;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.gsb-search-btn:hover {
  background: var(--accent-hover);
  box-shadow: 0 4px 20px rgba(0,212,170,0.3);
  transform: translateY(-1px);
}
.gsb-search-btn:active {
  transform: translateY(0) scale(0.98);
  box-shadow: none;
}
```

**Why:** Kayak uses a prominent orange CTA that's clearly the primary action. Our button needs to be the undeniable focal point of the search bar. The added height (42px vs 38px), wider min-width, and active press animation make it feel tactile.

---

## 1.4 [P1] Swap Button Animation

**What:** Add a rotation animation when the swap button is clicked.

**Current state (style.css lines 379-390):**
The `.gsb-swap` button changes border/color on hover but has no click feedback.

**Target state — add to app.js swap handler:**
```javascript
document.getElementById('swapRoute')?.addEventListener('click', () => {
  const btn = document.getElementById('swapRoute');
  btn.style.transition = 'transform 0.3s ease';
  btn.style.transform = 'rotate(180deg)';
  setTimeout(() => { btn.style.transform = ''; }, 300);
  // ... existing swap logic
});
```

**Target state — CSS addition:**
```css
.gsb-swap:active {
  transform: scale(0.9);
}
```

**Why:** Google Flights' swap button rotates its arrow icon on click. It's a delightful micro-interaction that confirms the action happened. Takes 5 minutes to implement, but feels premium.

---

## 1.5 [P1] Options Row — Replace Selects with Pill Chips

**What:** Replace the `<select>` dropdowns in `.gsb-options` with styled pill toggles for Round Trip and Cabin Class.

**Current state (index.html lines 187-215):**
Three `<select>` elements and a checkbox sit in a row. They use the native browser dropdown which looks inconsistent with the glassmorphic design.

**Target state:** Replace the round-trip checkbox with a segmented control:
```html
<div class="gsb-options">
  <div class="gsb-seg-control">
    <button class="gsb-seg active" data-trip="oneway">One way</button>
    <button class="gsb-seg" data-trip="round">Round trip</button>
  </div>
  <!-- keep return date field, show/hide based on selection -->
  <div class="gsb-field gsb-return" id="returnDateField" style="display:none;">
    <input type="date" id="flightReturnDate" class="gsb-input gsb-input-sm">
  </div>
  <select id="cabinClass" class="gsb-select">...</select>
  <select id="stopsFilter" class="gsb-select">...</select>
  <select id="currencySelect" class="gsb-select">...</select>
</div>
```

**CSS for segmented control:**
```css
.gsb-seg-control {
  display: flex;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
.gsb-seg {
  padding: 4px 12px;
  border: none; background: none;
  border-radius: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.2s ease;
}
.gsb-seg.active {
  background: var(--accent);
  color: #0a0e1a;
}
.gsb-seg:hover:not(.active) {
  color: var(--text-primary);
}
```

**Why:** Google Flights uses a dropdown for trip type. But Skyscanner uses a cleaner segmented control. Since we only have two options, a segmented control is more direct and eliminates a click. Reduces the visual noise of the options row.

---

# 2. RESULTS DISPLAY UPGRADE

## 2.1 [P0] Flight Result Card Layout Overhaul — Google Flights Information Hierarchy

**What:** Restructure the flight result card to follow Google Flights' proven left-to-right hierarchy: Airline > Times > Duration > Stops > Price.

**Current state (app.js lines 676-695):**
The card renders as: `airline | times (with arrow line) | stops badge + cabin | price | expand icon`. The layout works but lacks the visual polish and scanning efficiency of Google Flights.

**Target state — new card HTML:**
```javascript
return `<div class="flight-result-card" data-idx="${idx}">
  <div class="flight-result-main" onclick="toggleFlightDetail(${idx})">
    <div class="frc-airline">
      <img class="frc-airline-logo" src="https://images.kiwi.com/airlines/64/${(f.airline_iata||'').toUpperCase()}.png"
           alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <span class="frc-airline-fallback" style="display:none">${escapeHtml((f.airline_iata||'??').substring(0,2))}</span>
      <span class="frc-airline-name">${escapeHtml(f.airline || f.airline_iata)}</span>
    </div>
    <div class="frc-schedule">
      <div class="frc-times">
        <span class="frc-time">${(f.departure_at||'').split('T')[1]?.substring(0,5)||'--:--'}</span>
        <span class="frc-separator">-</span>
        <span class="frc-time">${(f.arrival_at||'').split('T')[1]?.substring(0,5)||'--:--'}</span>
      </div>
      <span class="frc-duration">${f.duration||''}</span>
    </div>
    <div class="frc-stops">
      ${f.stops > 0
        ? `<span class="flight-stops-badge">${f.stops} stop${f.stops!==1?'s':''}</span>`
        : `<span class="flight-direct-badge">Direct</span>`
      }
    </div>
    <div class="frc-price">
      <span class="frc-price-amount">${formatPrice(converted, dc)}</span>
      ${f.currency!==dc?`<span class="frc-price-original">${f.currency} ${f.total_amount}</span>`:''}
    </div>
    <div class="flight-expand-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
  </div>
  ...detail panel...
</div>`;
```

**Target state — CSS (replace/augment existing flight-result-card styles):**
```css
.flight-result-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  transition: all 0.15s ease;
  overflow: hidden;
}
.flight-result-card:hover {
  border-color: var(--accent-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.flight-result-card.expanded {
  border-color: var(--accent-border);
  box-shadow: var(--shadow-md);
}

.flight-result-main {
  display: grid;
  grid-template-columns: 140px 1fr 80px 100px 24px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.flight-result-main:hover { background: var(--bg-elevated); }

/* Airline column */
.frc-airline {
  display: flex; align-items: center; gap: 10px;
  min-width: 0;
}
.frc-airline-logo {
  width: 28px; height: 28px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}
.frc-airline-fallback {
  width: 28px; height: 28px;
  border-radius: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800;
  color: var(--text-muted);
  flex-shrink: 0;
}
.frc-airline-name {
  font-size: 12px; font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Schedule column */
.frc-schedule {
  display: flex; flex-direction: column; gap: 2px;
}
.frc-times {
  display: flex; align-items: center; gap: 6px;
}
.frc-time {
  font-size: 16px; font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.frc-separator {
  font-size: 14px; color: var(--text-muted); font-weight: 400;
}
.frc-duration {
  font-size: 11px; font-weight: 500;
  color: var(--text-muted);
}

/* Stops column */
.frc-stops {
  text-align: center;
}

/* Price column */
.frc-price {
  text-align: right;
}
.frc-price-amount {
  font-size: 18px; font-weight: 800;
  font-family: var(--font-mono);
  color: var(--accent);
  display: block;
  letter-spacing: -0.5px;
}
.frc-price-original {
  font-size: 10px; font-weight: 400;
  color: var(--text-muted);
  font-family: var(--font-sans);
}
```

**Why:** Google Flights uses a consistent grid where prices are always right-aligned in the same column, times are always in the same position, and the eye can scan vertically down any column. Our current flex layout causes columns to shift width per card. The CSS Grid approach locks columns in place. The airline logo from kiwi.com's free CDN adds visual richness at zero cost.

---

## 2.2 [P0] Mobile Flight Card — Simplified Two-Row Layout

**What:** On mobile, collapse the 5-column grid into a compact 2-row layout matching the research report's mobile card pattern.

**Target state — mobile CSS override:**
```css
@media (max-width: 767px) {
  .flight-result-main {
    grid-template-columns: 1fr auto 24px;
    grid-template-rows: auto auto;
    gap: 4px 8px;
    padding: 12px 14px;
  }
  .frc-airline {
    grid-column: 1 / -1;
    display: none; /* hide on mobile per research: "logos often hidden" */
  }
  .frc-schedule {
    grid-column: 1;
    grid-row: 1;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .frc-stops {
    grid-column: 1;
    grid-row: 2;
    text-align: left;
  }
  .frc-stops .flight-stops-badge,
  .frc-stops .flight-direct-badge {
    font-size: 9px;
  }
  .frc-price {
    grid-column: 2;
    grid-row: 1 / 3;
    display: flex;
    align-items: center;
  }
  .frc-price-amount {
    font-size: 16px;
  }
  .flight-expand-icon {
    grid-column: 3;
    grid-row: 1 / 3;
    align-self: center;
  }
}
```

**Why:** The research shows all platforms simplify cards on mobile: "Times + Stops + Price" on row 1, minimal secondary info on row 2. Price remains the most prominent element. Airline logos are hidden to save space.

---

## 2.3 [P0] Card Spacing — Tighter Result Density (Google Flights Pattern)

**What:** Reduce the gap between flight result cards from 8px to 4px and reduce card margin-bottom accordingly.

**Current state (style.css line 901):**
```css
.flight-result-card { margin-bottom: 8px; }
```

**Target state:**
```css
.flight-result-card { margin-bottom: 4px; }
```

**Why:** Google Flights uses 0px gap (hairline dividers only) to maximize density — they fit 5-6 results above the fold. We're using 8px which wastes vertical space. Going to 4px is a good compromise that maintains card separation while increasing density. More results visible = faster comparison = better UX for price-sensitive users.

---

## 2.4 [P1] Expand/Collapse Chevron Rotation Animation

**What:** The chevron icon should smoothly rotate 180 degrees when expanded (already partially implemented) and the entire card row should feel clickable.

**Current state (style.css lines 914-918):**
```css
.flight-expand-icon { color: var(--text-muted); transition: transform 0.2s; }
.flight-result-card.expanded .flight-expand-icon { transform: rotate(180deg); color: var(--accent); }
```
This is already working. But the detail panel transition is abrupt.

**Target state — smoother detail panel:**
```css
.flight-detail {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease;
  padding: 0 20px;
  border-top: 0px solid transparent;
  opacity: 0;
}
.flight-detail.open {
  max-height: 600px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  opacity: 1;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease, opacity 0.2s ease 0.1s;
}
```

**Why:** Google Flights uses a 300ms ease-out with content fading in after height expansion. Adding the opacity transition with a 100ms delay creates the "content reveals after the drawer opens" effect described in the research.

---

# 3. PRICE COMMUNICATION

## 3.1 [P0] Price Color Coding on Result Cards — Hopper's Semantic Color System

**What:** Color-code the price on each flight result card based on whether it's a good deal, average, or expensive relative to other results in the current search.

**Current state:** All prices are displayed in `var(--accent)` (teal) regardless of value.

**Target state — add to renderFlightResults in app.js:**
```javascript
// At the top of renderFlightResults, compute price tiers
const allPrices = flights.map(f => convertPrice(parseFloat(f.total_amount), f.currency, dc));
const minPrice = Math.min(...allPrices);
const maxPrice = Math.max(...allPrices);
const range = maxPrice - minPrice || 1;

function getPriceTier(price) {
  const pct = (price - minPrice) / range;
  if (pct <= 0.25) return 'price-great';
  if (pct <= 0.6) return 'price-good';
  if (pct <= 0.85) return 'price-mid';
  return 'price-high';
}
```

Then in the card template, replace the price div:
```javascript
const priceTier = getPriceTier(converted);
`<span class="frc-price-amount ${priceTier}">${formatPrice(converted, dc)}</span>`
```

**CSS additions:**
```css
.frc-price-amount.price-great { color: var(--success); }
.frc-price-amount.price-good { color: var(--accent); }
.frc-price-amount.price-mid { color: var(--text-primary); }
.frc-price-amount.price-high { color: var(--warning); }
```

**Why:** Hopper uses green-to-red for all prices. Google Flights uses green for deals only (conservative). Our approach: green for cheapest 25%, teal for good, neutral for average, amber for expensive. We never use red on prices — the research notes Google Flights intentionally avoids red to "keep emotional tone positive."

---

## 3.2 [P0] Deal Badge on Cheapest Flight

**What:** Add a "Best price" badge to the cheapest result in the list.

**Target state — in renderFlightResults:**
```javascript
// Find index of cheapest flight
const cheapestIdx = allPrices.indexOf(minPrice);
```

Then in the card template, before the price:
```javascript
${idx === cheapestIdx ? '<span class="frc-deal-badge">Cheapest</span>' : ''}
```

**CSS:**
```css
.frc-deal-badge {
  display: inline-block;
  font-size: 9px; font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--success-light);
  color: var(--success);
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 2px;
}
```

**Why:** Google Flights, Momondo, and Skyscanner all badge their best-value results. A simple "Cheapest" label on the top result anchors the user's comparison. It's also a trust signal — it says "we surfaced the best option for you."

---

## 3.3 [P1] Price Update Counter Animation

**What:** When prices are displayed or change (e.g., currency switch, re-sort), briefly animate the price number.

**CSS addition:**
```css
@keyframes priceReveal {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
.frc-price-amount {
  animation: priceReveal 0.3s ease-out;
}
```

**Why:** Google Flights and Hopper both animate prices on reveal. A subtle translateY from below creates a "slot machine" feel that draws the eye to the most important number on the card.

---

## 3.4 [P1] Price Calendar Color Upgrade — Full Hopper Spectrum

**What:** Upgrade the price calendar from the current 3-tier system (cheap/mid/high) to a 5-tier Hopper-style gradient.

**Current state (style.css lines 834-839):**
Three tiers: `.cal-day.cheap` (green), `.cal-day.mid` (amber), `.cal-day.high` (red).

**Target state — add two intermediate tiers:**
```css
.cal-day.cheapest {
  background: rgba(16,185,129,0.2);
}
.cal-day.cheapest .cal-day-price { color: #10b981; font-weight: 800; }

.cal-day.cheap {
  background: rgba(16,185,129,0.1);
}
.cal-day.cheap .cal-day-price { color: #10b981; }

.cal-day.mid {
  background: rgba(245,158,11,0.08);
}
.cal-day.mid .cal-day-price { color: #d97706; }

.cal-day.pricey {
  background: rgba(239,68,68,0.08);
}
.cal-day.pricey .cal-day-price { color: #ef4444; }

.cal-day.high {
  background: rgba(239,68,68,0.15);
}
.cal-day.high .cal-day-price { color: #ef4444; font-weight: 800; }
```

Update the JS price calendar builder to classify into 5 quintiles instead of 3.

Also update the legend (index.html lines 294-298):
```html
<div class="cal-legend">
  <span><span class="cal-dot cal-cheapest"></span> Great</span>
  <span><span class="cal-dot cal-cheap"></span> Good</span>
  <span><span class="cal-dot cal-mid"></span> Average</span>
  <span><span class="cal-dot cal-pricey"></span> Pricey</span>
  <span><span class="cal-dot cal-high"></span> Expensive</span>
</div>
```

**Why:** Hopper's 5-color spectrum (green-to-red) creates a heat-map effect that's "their most praised feature" per the research. Three tiers doesn't create enough gradient for users to distinguish value visually.

---

# 4. LOADING & TRANSITIONS

## 4.1 [P0] Skeleton Loading Cards with Shimmer Animation

**What:** Replace the current skeleton cards (plain grey rectangles) with properly structured skeletons that mimic the flight card layout.

**Current state (app.js line 561):**
```javascript
resultsDiv.innerHTML = Array(4).fill(
  '<div class="flight-result-card skeleton" style="height:80px;margin-bottom:8px;border-radius:12px;"></div>'
).join('');
```
This is a plain box with a shimmer. It doesn't match the card layout.

**Target state — new skeleton HTML:**
```javascript
resultsDiv.innerHTML = Array(5).fill(`
  <div class="flight-result-card skeleton-card">
    <div class="flight-result-main" style="pointer-events:none;">
      <div class="frc-airline">
        <div class="skeleton skeleton-circle" style="width:28px;height:28px;"></div>
        <div class="skeleton skeleton-text" style="width:80px;height:12px;"></div>
      </div>
      <div class="frc-schedule">
        <div class="skeleton skeleton-text" style="width:120px;height:16px;"></div>
        <div class="skeleton skeleton-text" style="width:60px;height:10px;margin-top:4px;"></div>
      </div>
      <div class="frc-stops">
        <div class="skeleton skeleton-pill" style="width:50px;height:18px;"></div>
      </div>
      <div class="frc-price" style="text-align:right;">
        <div class="skeleton skeleton-text" style="width:70px;height:18px;margin-left:auto;"></div>
      </div>
      <div style="width:16px;"></div>
    </div>
  </div>
`).join('');
```

**CSS additions:**
```css
.skeleton-card {
  opacity: 1;
}
.skeleton-circle {
  border-radius: 50%;
}
.skeleton-text {
  border-radius: 4px;
  height: 12px;
}
.skeleton-pill {
  border-radius: 10px;
}
/* The existing .skeleton class with shimmerGradient animation handles the shimmer */
```

**Why:** The research emphasizes: "Skeleton shapes match the exact layout of the content they replace." Our current skeletons are generic rectangles. Structured skeletons create the illusion that content is "almost loaded" and prevent layout shift when real content appears.

---

## 4.2 [P0] Fade-Up Transition When Results Replace Skeletons

**What:** When real flight cards replace skeletons, animate them in with a staggered fade-up.

**Target state — wrap renderFlightResults call:**
```javascript
// In searchFlightsUI, after renderFlightResults(data.flights):
const cards = resultsDiv.querySelectorAll('.flight-result-card');
cards.forEach((card, i) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(8px)';
  card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  setTimeout(() => {
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, i * 50); // 50ms stagger per card
});
```

**Why:** Google Flights uses "consistent fade-up motion when new content appears." The stagger (50ms per card) creates a cascade effect that feels intentional and polished. Without it, all cards pop in at once which feels abrupt.

---

## 4.3 [P1] Animated Plane Loading Icon for Initial Search

**What:** During the first search load (before skeletons appear), show a small animated plane icon with "Searching flights..." text.

**CSS for animated plane:**
```css
@keyframes flyPlane {
  0% { transform: translateX(-20px) rotate(-5deg); opacity: 0; }
  20% { opacity: 1; }
  50% { transform: translateX(10px) rotate(0deg); }
  80% { opacity: 1; }
  100% { transform: translateX(40px) rotate(5deg); opacity: 0; }
}
.search-loading-plane {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
}
.search-loading-plane svg {
  animation: flyPlane 2s ease-in-out infinite;
  color: var(--accent);
}
.search-loading-plane span {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
}
```

**HTML (injected via JS before the skeleton cards):**
```html
<div class="search-loading-plane">
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>
  <span>Searching flights...</span>
</div>
```

**Why:** Google Flights shows an animated airplane during initial search. The research calls this "small touch that significantly improves perceived quality." It's branded, delightful, and reduces perceived wait time. Show this for 500ms before transitioning to skeleton cards.

---

## 4.4 [P1] Sort Pill Transition Animation

**What:** When switching sort tabs (Cheapest/Fastest/Earliest), results should fade out and fade back in.

**Current state:** Sort pills exist (style.css lines 863-873) but clicking them presumably re-renders instantly.

**Target state — add to sort handler in JS:**
```javascript
document.querySelectorAll('.sort-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const resultsDiv = document.getElementById('flightResults');
    // Quick fade out
    resultsDiv.style.transition = 'opacity 0.15s ease';
    resultsDiv.style.opacity = '0';
    setTimeout(() => {
      // Re-render with new sort
      // ... existing sort logic ...
      resultsDiv.style.opacity = '1';
    }, 150);
  });
});
```

**Sort pill CSS enhancement:**
```css
.sort-pill {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 12px; font-weight: 600;
  color: var(--text-muted); background: none;
  cursor: pointer; font-family: var(--font-sans);
  transition: all 0.2s ease;
}
.sort-pill:active {
  transform: scale(0.95);
}
```

**Why:** Google Flights' filter chips have "subtle scale transform on tap (1.0 -> 0.95 -> 1.0)." The brief fade on results during re-sort prevents the jarring instant swap.

---

# 5. MOBILE REFINEMENTS

## 5.1 [P0] Floating Sort/Filter Button on Mobile

**What:** Add a floating button at the bottom of the screen on mobile that provides quick access to sort and filter options (Skyscanner pattern).

**HTML — add before closing `</div>` of search-section:**
```html
<button class="mobile-sort-fab" id="mobileSortFab" style="display:none;">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
  <span>Sort & Filter</span>
</button>
```

**CSS:**
```css
.mobile-sort-fab {
  display: none !important; /* hidden by default, shown via JS on mobile when results exist */
}
@media (max-width: 767px) {
  .mobile-sort-fab {
    position: fixed;
    bottom: 20px; left: 50%;
    transform: translateX(-50%);
    display: flex !important;
    align-items: center; gap: 8px;
    padding: 12px 24px;
    background: var(--accent);
    color: #0a0e1a;
    border: none;
    border-radius: var(--radius-pill);
    font-size: 13px; font-weight: 700;
    font-family: var(--font-sans);
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,212,170,0.3);
    z-index: 100;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .mobile-sort-fab:active {
    transform: translateX(-50%) scale(0.95);
  }
}
```

**JS — show/hide based on results:**
```javascript
// In searchFlightsUI, after results render:
const fab = document.getElementById('mobileSortFab');
if (fab && window.innerWidth <= 767) fab.style.display = '';

// On click, open a bottom sheet with sort + filter options
fab?.addEventListener('click', () => {
  // Toggle the results toolbar visibility on mobile, or open a bottom sheet
  document.getElementById('resultsToolbar').scrollIntoView({ behavior: 'smooth' });
});
```

**Why:** Skyscanner uses a floating Sort & Filter button on mobile that's always accessible. Our current sort pills are at the top of results and scroll out of view. A floating FAB keeps filtering accessible during the entire scrolling experience.

---

## 5.2 [P1] Touch Target Size Audit

**What:** Ensure all interactive elements on mobile meet the 44px minimum touch target (Apple HIG) / 48px (Material Design).

**Current violations:**
- `.cal-day` has `min-height: 48px` -- PASS
- `.sort-pill` has `padding: 5px 14px` -- resulting height ~28px -- FAIL
- `.cal-nav` is 32px -- FAIL
- `.rcb-btn` is 30px -- FAIL
- `.gsb-select` has `padding: 4px 8px` -- resulting height ~24px -- FAIL

**Target state — mobile overrides:**
```css
@media (max-width: 767px) {
  .sort-pill {
    padding: 10px 18px;
    font-size: 13px;
  }
  .cal-nav {
    width: 44px; height: 44px;
  }
  .rcb-btn {
    width: 40px; height: 40px;
  }
  .gsb-select {
    padding: 10px 12px;
    font-size: 13px;
  }
  .gsb-options {
    gap: 6px;
  }
}
```

**Why:** The research cites 44-48px as the minimum across all platforms. Hopper, being mobile-only, enforces 48px minimum throughout. Small touch targets cause frustration and mis-taps.

---

## 5.3 [P1] Mobile Search Form — Stacked Layout Spacing

**What:** Increase vertical spacing between stacked fields in the mobile search form.

**Current state (style.css lines 1759-1770):**
The search form stacks vertically on mobile with 8px gap between fields. Labels are 11px uppercase.

**Target state:**
```css
@media (max-width: 767px) {
  .globe-search-inner {
    gap: 6px;
    padding: 4px;
  }
  .gsb-field label {
    font-size: 10px;
    padding-left: 6px;
    margin-bottom: 2px;
  }
  .gsb-input {
    padding: 12px 12px;
    font-size: 15px; /* larger for readability on mobile */
  }
}
```

**Why:** Hopper uses "large, finger-friendly input fields" with generous padding. Our 8px padding with 13px font feels cramped on mobile. Bumping to 12px padding and 15px font makes the form feel like a native app.

---

# 6. VISUAL POLISH

## 6.1 [P0] Card Hover State — Material Design Elevation on Hover

**What:** Flight result cards and deal cards should gain subtle elevation on hover (increased shadow), not just border color change.

**Current state (style.css line 905):**
```css
.flight-result-card:hover { border-color: var(--accent-border); }
```
Border color change only. No elevation change.

**Target state:**
```css
.flight-result-card:hover {
  border-color: var(--accent-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transform: translateY(-1px);
}
.flight-result-card {
  transition: all 0.15s ease;
}
```

Apply same pattern to:
```css
.cheapest-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.action-bridge-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  color: var(--accent);
}
```

**Why:** Google Flights uses "increased shadow/elevation on hover" (Material Design principle). The research specifically calls out that shadow increases on hover for clickable elements in Google Flights. Our current border-only change feels flat.

---

## 6.2 [P0] Results Toolbar — "Best" / "Cheapest" Pill Tabs (Google Flights Pattern)

**What:** Replace or augment the sort pills with Google Flights' two-tab pattern: "Best flights" and "Cheapest" as the primary sort.

**Current state (index.html lines 303-307):**
```html
<div class="sort-pills">
  <button class="sort-pill active" data-sort="price">Cheapest</button>
  <button class="sort-pill" data-sort="duration">Fastest</button>
  <button class="sort-pill" data-sort="departure">Earliest</button>
</div>
```

**Target state:**
```html
<div class="sort-pills">
  <button class="sort-pill active" data-sort="best">Best</button>
  <button class="sort-pill" data-sort="price">Cheapest</button>
  <button class="sort-pill" data-sort="duration">Fastest</button>
  <button class="sort-pill" data-sort="departure">Earliest</button>
</div>
```

**JS — "Best" sort algorithm:**
```javascript
function sortFlightsBest(flights) {
  // Composite score: 50% price (normalized), 30% duration (normalized), 20% stops
  const prices = flights.map(f => parseFloat(f.total_amount));
  const durations = flights.map(f => parseDuration(f.duration));
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minD = Math.min(...durations), maxD = Math.max(...durations);
  const rangeP = maxP - minP || 1;
  const rangeD = maxD - minD || 1;

  return flights.map((f, i) => ({
    ...f,
    _score: 0.5 * ((prices[i] - minP) / rangeP) +
            0.3 * ((durations[i] - minD) / rangeD) +
            0.2 * (f.stops / 3)
  })).sort((a, b) => a._score - b._score);
}

function parseDuration(dur) {
  if (!dur) return 999;
  const h = dur.match(/(\d+)h/); const m = dur.match(/(\d+)m/);
  return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}
```

**Why:** This is Rank 3 in the research report. Google Flights defaults to "Best" — a weighted sort balancing price, duration, and stops. Pure "Cheapest" often surfaces terrible 30-hour itineraries. A "Best" default makes the first impression better, and users who want pure price can switch to "Cheapest."

---

## 6.3 [P0] Border Radius Consistency — Modern 12px Standard

**What:** Standardize border radius across all cards to 12px (the `--radius-md` value), aligning with the 2026 trend of "larger border-radius (12-16px) for a softer, more modern look."

**Current state:** Already using `--radius-md: 12px` on most cards. But some elements use 8px (radius-sm) for cards that should use 12px.

**Audit and fix:**
- `.airport-dropdown` (line 608): uses `border-radius: 0 0 var(--radius-sm) var(--radius-sm)` -- change to `border-radius: var(--radius-md)` (since we're adding 4px top offset, the dropdown doesn't need to be flush with the input)
- `.booking-link` (line 1012): uses `var(--radius-sm)` -- keep, these are inline pill-like elements
- `.segment-layover` (line 992): uses `6px` -- keep, this is a small inline element

No changes needed for major cards — they already use `--radius-md`.

---

## 6.4 [P1] Empty State Illustrations Upgrade

**What:** Replace the generic SVG icons in empty states with more visually engaging illustrations.

**Current state (index.html lines 403-407):**
```html
<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">...</svg>
<p>Search for flights and click "Watch this route" to track prices.</p>
```
Generic eye icon at 0.3 opacity. Feels like a placeholder.

**Target state — add CSS for better empty states:**
```css
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted);
}
.empty-state svg {
  opacity: 0.15;
  margin-bottom: 16px;
}
.empty-state p {
  font-size: 14px;
  margin-top: 8px;
  line-height: 1.6;
  max-width: 280px;
  margin-left: auto;
  margin-right: auto;
}
.empty-state .btn-primary {
  margin-top: 16px;
}
```

**Why:** Better empty states communicate care for detail. The wider padding, constrained text width, and increased icon margin create a more intentional, less "we forgot to design this" feel.

---

## 6.5 [P1] Focus Ring for Accessibility

**What:** Add a visible focus ring on all interactive elements for keyboard users, using the `:focus-visible` pseudo-class (so it doesn't show for mouse users).

**CSS addition:**
```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* Remove the outline for mouse users */
*:focus:not(:focus-visible) {
  outline: none;
}
/* Inputs get the underline treatment instead */
.gsb-input:focus-visible {
  outline: none;
  box-shadow: inset 0 -2px 0 0 var(--accent);
}
```

**Why:** Accessibility is non-negotiable. The `:focus-visible` approach is the modern best practice — it shows focus rings for keyboard navigation but hides them for mouse clicks. This avoids the "ugly blue outline" problem while remaining accessible.

---

## 6.6 [P2] Glassmorphism Refinement on Search Bar

**What:** Enhance the glass effect on the floating search bar for more depth.

**Current state (style.css lines 340-348):**
```css
.globe-search-bar {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 8px;
  box-shadow: var(--shadow-lg);
}
```

**Target state:**
```css
.globe-search-bar {
  background: var(--glass-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: var(--radius-lg);
  padding: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
}
```

Changes:
- Increased blur from 20px to 24px
- Added `saturate(180%)` for richer glass effect
- Brighter inner border (`rgba(255,255,255,0.12)`)
- Added inset top highlight (mimics glass reflection)
- Slightly more padding (10px vs 8px)

**Why:** The research notes "Glassmorphism opportunity: subtle translucent layers for depth (2026 trend)." Our glass is good but the extra saturate + inset highlight will make it feel more Apple-like and premium.

---

## 6.7 [P2] Toast Notification Enhancement — Slide Up from Bottom (Google Flights Pattern)

**What:** Move toast notifications from top-right to bottom-center and add an undo action.

**Current state (style.css lines 1447-1469):**
Toasts appear at `top: 72px; right: 20px` and slide in from right.

**Target state:**
```css
.toast-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 400;
  pointer-events: none;
}
.toast {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  font-size: 13px; font-weight: 500;
  pointer-events: auto;
  animation: toastSlideUp 0.3s ease;
  max-width: 400px;
}
@keyframes toastSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Why:** Google Flights uses Material Design snackbars that slide up from bottom. Bottom-center is the mobile-friendly position (Hopper does the same). Our current top-right position competes with the topbar and is easy to miss on mobile.

---

# IMPLEMENTATION PRIORITY ORDER

## Phase 1 — Maximum Impact (P0 items, implement first)
1. **4.1** Skeleton loading cards with proper structure
2. **4.2** Fade-up stagger when results appear
3. **2.1** Flight card grid layout overhaul
4. **2.2** Mobile card simplified layout
5. **3.1** Price color coding on result cards
6. **3.2** "Cheapest" deal badge
7. **6.2** "Best" / "Cheapest" sort tab
8. **6.1** Card hover elevation
9. **1.1** Input focus underline states
10. **1.2** Autocomplete dropdown redesign
11. **1.3** Search button enhancement
12. **2.3** Card spacing tightened

## Phase 2 — Polish Pass (P1 items)
13. **1.4** Swap button rotation animation
14. **1.5** Segmented trip-type control
15. **2.4** Smoother expand/collapse transition
16. **3.3** Price reveal animation
17. **3.4** 5-tier price calendar colors
18. **4.3** Animated plane loading
19. **4.4** Sort pill transition
20. **5.1** Floating sort/filter FAB on mobile
21. **5.2** Touch target size audit
22. **5.3** Mobile input size increase
23. **6.4** Empty state spacing
24. **6.5** Focus-visible accessibility rings

## Phase 3 — Final Touches (P2 items)
25. **6.6** Glassmorphism enhancement
26. **6.7** Bottom-center toast notifications

---

# DESIGN PRINCIPLES FOR THE IMPLEMENTER

1. **Price is king.** It must be the largest, boldest element on every card. Right-aligned. Color-coded. Everything else is secondary.

2. **Movement should be purposeful.** Every animation communicates something: content loading (shimmer), content appearing (fade-up), user action acknowledged (button press scale), state change (chevron rotation). No gratuitous animation.

3. **Density for comparison, space for decisions.** Results list = dense (4px gaps, compact cards). Discovery card / deal analysis = spacious (generous padding). This matches Google Flights' philosophy.

4. **Color = meaning.** Green = good deal. Teal/accent = interactive/normal. Amber = caution. Never red on prices. Blue reserved for links.

5. **Mobile = fewer elements, larger targets, same hierarchy.** Hide airline logos, hide secondary currencies, but keep price massive. 44px minimum touch targets.

6. **Transitions under 300ms.** All transitions 150-300ms. The cubic-bezier(0.4, 0, 0.2, 1) curve (Material Design standard) for height/position animations. Linear or ease-out for opacity.
