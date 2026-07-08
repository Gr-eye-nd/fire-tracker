# FI/RE Tracker — Project Brief

## Vision
A website that helps people become financially independent and retire early (FI/RE). Tracks and forecasts progress across four core components: superannuation, wealth outside super, income, and expenses.

## Core Components
- **Super** — balance, contributions (concessional/non-concessional), growth projections
- **Wealth outside super** — investments, property, cash, other assets
- **Income** — salary, dividends, distributions, other income streams
- **Expenses** — living costs, spending categorization

## Build Roadmap (Iterations)

### Iteration 1 — Stateless Calculators (MVP)
- User manually inputs data each session (no persistence)
- Tools generate current + forecasted views on FI/RE progress
- Core deliverable: a **framework-agnostic calculation engine** (pure functions, no UI/DB dependency) covering compound growth, super projections, contribution caps, withdrawal rates, drawdown modeling
- Stack: Next.js + TypeScript, calc engine as isolated package
- Deploy: static/serverless (Vercel/Netlify)
- No backend needed

### Iteration 2 — Profiles & Persistence
- User accounts, save/edit/adjust data over time
- Add: Supabase (or Auth0) for auth + Postgres DB
- Build this earlier than the roadmap implies, even in skeleton form behind a feature flag — retrofitting persistence later is painful

### Iteration 3 — Automated Data Import
- **Decision: CSV/statement import instead of bank feeds (CDR/Open Banking)**
  - Bank feeds rejected due to cost: CDR accreditation/compliance overhead, per-connected-account pricing (~$1-3/user/month regardless of usage), ongoing per-bank integration maintenance, security/liability certification costs, small AU market with few accredited intermediaries (Basiq, Frollo, Adatree) keeping prices high
  - CSV import removes guaranteed per-user cost — only costs compute when actually used
  - Fits FI/RE audience: DIY-minded, tech-comfortable, engaged with their own numbers
- Automated market data: stock/ETF prices, dividends, distributions via market data API (e.g. Alpha Vantage)
- Build note: CSV formats vary by bank/broker (column names, date formats, categorization) — need a mapping/preview step in UI for users to confirm column mapping before import, not a fixed-format assumption

### Iteration 4 — AI Assistant (Grounded, Not Advice)
- AI model grounded on the user's own data + publicly available info
- **Explicitly answers questions only — does not provide personalized financial advice** (relevant to AFSL licensing — personalized advice vs. general information are different regulatory buckets in Australia; confirm with a lawyer familiar with fintech/AFSL exemptions before monetizing this feature)
- RAG layer: vector store over user's data + Claude API, calling into the same calc engine as tools

## Architecture Principles
- **Separate the calc engine from everything else from day one.** It's the most valuable and most testable part of the product. UI, DB, auth, AI are plumbing around it.
- **Monorepo** from the start: `/packages/calc-engine`, `/apps/web`, later `/apps/api`, `/packages/ingestion`. Keeps the calc engine shareable across web and AI layers without duplication.

## CI/CD Approach
- Trunk-based development, short-lived feature branches, PRs into `main`
- GitHub Actions (natural fit for a GitHub-hosted repo)
- Pipeline: lint → unit tests → build → preview deploy (PR preview URLs) → e2e smoke tests → merge → auto-deploy
- Environments: dev (auto-deploy every merge) → staging (manual promote) → prod (manual approval gate)
- Testing pyramid: heavy unit test coverage on calc engine (correctness matters most here — trust erodes fast on bad maths), lighter integration tests on API/DB, minimal e2e (auth flow, one full projection journey)
- Secrets: GitHub Actions secrets or Doppler, never committed — matters more once real financial data/credentials are involved

## Cost Estimates (Monthly Infra)
| Iteration | Est. Monthly Cost | Driver |
|---|---|---|
| 1 | $0–20 | Static hosting free tier |
| 2 | $25–50 | Supabase/Postgres + auth, mostly free tier at low scale |
| 3 (CSV-based, revised) | $30–100 | Market data API + parsing compute |
| 4 | Variable, scales with usage | Claude API per-query cost, vector DB ($0-70/mo at small scale) |

At meaningful scale (1,000+ active users), expect $300–1,500+/month, dominated by AI inference costs (removed the bank-feed cost driver by switching to CSV import).

## Monetization
- **Subscription over ad-supported** — decided based on cost structure: AI/data costs scale per-user, so revenue needs to scale per-user too. Niche-vertical ad revenue rarely covers this. FI/RE audience is also unusually willing to pay for tools that respect their intelligence (comparable: Pocketsmith, Sharesight, Personal Capital/Empower — all subscription).
- **Freemium model:**
  - Free tier: Iteration 1–2 calculators, manual data entry, **CSV import** (cheap, builds trust/stickiness)
  - Paid tier: automated market data sync, AI assistant (iteration 4) — the features that scale cost with engagement

## Open Items / To Confirm
- AFSL / financial advice licensing boundary for iteration 4 — confirm "general information" framing holds up legally before monetizing
- Choice of market data API provider (cost/coverage tradeoffs)
- Choice of vector DB for iteration 4 (Pinecone vs. pgvector)
