# AutoTest v3 — AI-Powered QA Platform

## Overview

AutoTest v3 is an AI-powered automated QA/validation platform that discovers, generates, executes, and reports on web application tests. It upgrades the v2 foundation with:

- **AI Test Intent Engine** — natural language → structured test plans
- **Multi-strategy auth** with stuck detection and automatic fallback
- **Enhanced orchestration** — retries, quarantine, full artifact capture
- **Professional dashboard** — coverage, flakiness, drill-down, defect analysis
- **CI-ready** — GitHub Actions workflow, multi-environment support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Intent Engine                          │
│   "Validate onboarding flow" → objectives, risk map, tests  │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│              Test Plan Generator                             │
│   Objectives → happy/negative/edge/security/a11y/perf cases │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│         Execution Orchestrator                               │
│   Playwright + retries + quarantine + artifact capture        │
│   Auth Manager → StorageState → API → UI Form (fallback)     │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│              Dashboard & Reporting                            │
│   Overview │ Coverage │ Flakiness │ History │ Drill-down     │
│   JSON export │ Slack/PR summary │ HTML report               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install --with-deps chromium

# 3. Set environment variables
cp .env.example .env
# Edit .env: set OPENAI_API_KEY=sk-...

# 4. Start the server
npm start
# → http://localhost:4000
```

### Run in CI

See `.github/workflows/test.yml`. Required secrets:
- `OPENAI_API_KEY` — for AI test generation

### Docker

```bash
docker build -t autotest .
docker run -p 4000:4000 -e OPENAI_API_KEY=sk-... autotest
```

## Workflow

1. **Add a Target** — configure the web app URL and auth credentials
2. **Run Discovery** — auto-crawl pages, APIs, forms
3. **Generate Test Plan** — use AI Planner with a natural language intent
4. **Execute Tests** — run the plan or use the classic test runner
5. **Review Results** — dashboard, coverage, flakiness, drill-down

## Key Modules

### 1. Auth Manager (`engine/auth-manager.js`)

Multi-strategy authentication with guaranteed escape from login-stuck scenarios.

**Strategy Chain:**
1. **Storage State** (preferred) — reuse saved session cookies/localStorage
2. **API Login** — programmatic token fetch from login endpoint
3. **UI Form Login** — resilient selectors with 5-level fallback chain

**Safety Features:**
- Watchdog timer detects stuck state (30s no progress → abort)
- Max 3 total attempts across all strategies (never loops)
- Failure artifacts: screenshot + JSON page state on every failure
- Mid-test recovery: auto-detects login redirect and re-authenticates

### 2. AI Intent Engine (`engine/intent-engine.js`)

Accepts natural language intent and generates:
- **Objectives** with risk levels (high/medium/low)
- **User stories** (As a... I want... So that...)
- **Risk-based coverage map**
- **Test matrix** (roles, browsers, viewports, locales)
- **Acceptance criteria** with verification methods
- **Test cases** with typed steps (40% happy, 25% negative, 15% edge, 10% security, 5% a11y, 5% perf)

### 3. Execution Orchestrator (`runner/orchestrator.js`)

- Retries: max 2 per test, linear backoff (configurable)
- Quarantine: auto-quarantine tests with >30% failure rate after 3+ runs
- Artifacts: screenshot, video, trace, console logs, network logs
- Flakiness tracking: per-test failure/retry statistics
- Defect summary: auto-generated root cause analysis for failures

### 4. Dashboard

8 views: Dashboard, Targets, Discovery, AI Planner, Test Runner, History, Coverage, Flakiness

Each view provides:
- **Dashboard** — overview stats, recent runs table, pass rate
- **AI Planner** — intent input → objectives/risk/test cases → execute
- **Coverage** — intent → objective → test case mapping with rates
- **Flakiness** — per-test failure rates, quarantine management
- **History** — trend charts, per-run drill-down with defect analysis

## Folder Structure

```
autotest/
├── config/
│   └── environments.json       # Multi-env configuration
├── db/
│   ├── db.js                   # SQLite wrapper
│   ├── schema.sql              # v2 schema (original)
│   ├── schema-v3.sql           # v3 schema (full)
│   └── migrate-v3.js           # Safe migration script
├── engine/
│   ├── auth-manager.js         # Multi-strategy auth + stuck detector
│   ├── intent-engine.js        # AI test intent → structured plan
│   ├── discovery-orchestrator.js # Scan pipeline (original)
│   ├── crawler.js              # BFS page crawler (original)
│   ├── form-detector.js        # Form extraction (original)
│   ├── auth-detector.js        # Login page heuristics (original)
│   ├── api-interceptor.js      # XHR/fetch capture (original)
│   └── classifier.js           # Dedup & tagging (original)
├── generator/
│   ├── test-generator.js       # Test generation orchestrator
│   ├── page-tests.js           # Page load tests
│   ├── api-tests.js            # API endpoint tests
│   ├── form-tests.js           # Form validation tests
│   ├── security-tests.js       # Security sanity tests
│   ├── load-tests.js           # Load/concurrency tests
│   ├── ai-tests.js             # OpenAI custom tests
│   └── page-scout.js           # Live page visiting
├── runner/
│   ├── orchestrator.js         # Enhanced execution (v3)
│   ├── test-runner.js          # Playwright runner (original)
│   └── result-collector.js     # JSON → DB (original)
├── public/
│   ├── index.html              # SPA shell (8 views)
│   ├── css/style.css           # Dark theme
│   └── js/
│       ├── app.js              # SPA router
│       ├── api.js              # Fetch + SSE
│       ├── components.js       # Reusable UI
│       ├── config.js           # Target management
│       ├── discovery.js        # Scan UI
│       ├── runner.js           # Test runner UI
│       ├── history.js          # Trends + history
│       ├── dashboard-overview.js # v3: overview
│       ├── intent-planner.js   # v3: AI planner
│       ├── coverage-view.js    # v3: coverage
│       └── flaky-view.js       # v3: flakiness
├── utils/
│   └── crypto.js               # AES-256-GCM encryption
├── generated-tests/            # Auto-generated .spec.js (gitignored)
├── test-results/               # Playwright output (gitignored)
├── docs/
│   ├── README.md               # This file
│   ├── add-test-ids.md         # Guide for adding data-testid
│   └── troubleshooting.md      # Common issues
├── .github/workflows/test.yml  # CI pipeline
├── server.js                   # Express API server
├── playwright.config.js        # Enhanced Playwright config
├── package.json                # Dependencies
├── Dockerfile                  # Docker build
└── .env.example                # Env template
```

## Definition of Done Checklist

- [x] Auth system with multi-strategy fallback and stuck detector
- [x] Never loops infinitely — max 3 attempts with watchdog
- [x] AI Intent Engine: intent → objectives → test cases (JSON)
- [x] Test plan covers: happy, negative, edge, security, a11y, performance
- [x] Execution orchestrator: retries (max 2), quarantine, artifact capture
- [x] Screenshot, video, trace capture on failure
- [x] Flakiness tracking with auto-quarantine
- [x] Defect summary with root cause analysis
- [x] Professional dashboard: 8 views with dark theme
- [x] Coverage view: intent → objective → test mapping
- [x] Flakiness view: per-test rates, quarantine management
- [x] Drill-down: steps, artifacts, error details
- [x] JSON structured export for external tools
- [x] Markdown summary for Slack/PR comments
- [x] CI pipeline: lint, smoke on PR, full on main/nightly
- [x] Multi-environment config (local/staging/production)
- [x] Role-based test accounts (admin/user/readonly)
- [x] Enhanced Playwright config (video, trace, HTML report)
- [x] DB migration (v2 → v3) safe to run repeatedly
- [x] Documentation: setup, CI, test IDs, troubleshooting
