# MindFlight — Project Instructions

## What is this
MindFlight is a flight price discovery and tracking platform. It helps users find cheap flights visually using a 3D globe, track prices over time, and plan trips.

## Tech Stack
- **Frontend**: Vanilla JS (NO frameworks), HTML, CSS
- **Backend**: Express.js, SQLite (better-sqlite3)
- **APIs**: Amadeus (free tier, 2000 calls/month), Animoca Gateway
- **Hosting**: Vercel (https://mindforce-eight.vercel.app)
- **Repo**: github.com/kingsgambitkings-sys/mindflight

## Design System
- **Accent**: #00d4aa (teal)
- **Background**: #0a0e1a (navy)
- **Fonts**: Inter (UI), JetBrains Mono (prices)
- **Style**: Minimalist, glassmorphism, dark-first

## File Structure
```
public/          → Frontend (HTML, CSS, JS)
server/          → Backend (Express routes, Amadeus, SQLite)
data/            → JSON data files (visa, airlines, airports, etc.)
.claude/agents/  → Team agent definitions
```

## Rules
- Never use React, Vue, or any frontend framework
- Never add paid APIs — free tier only
- Always validate JS syntax after editing app.js
- Always test server startup after editing server files
- Prices should always use JetBrains Mono font and be the largest element
- Mobile-first: everything must work on phones
- Use the existing CSS variables — never hardcode colors

## Team Agents (19 total)
See `.claude/agents/` for all agent definitions:

**Core Team (build features):**
researcher, product-manager, uiux-designer, backend-engineer, asset-agent, qa-engineer, deployer, project-manager

**Specialist Team (quality & scale):**
seo-content, data-curator, performance-monitor, security-auditor, accessibility-auditor, testing-agent, analytics-agent, localization-agent, api-docs, content-writer, mobile-specialist

## Deployment
```bash
git add -A && git commit -m "message" && git push origin main
npx vercel --prod --yes
```

## Key Constraints
- Amadeus free tier: 2000 API calls/month — cache aggressively
- SQLite doesn't persist on Vercel (ephemeral) — JSON data files DO persist
- No user authentication — single-user app
- No payment processing
