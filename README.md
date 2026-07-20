<div align="center">

# 📖 folio

**Read Later. Learn Forever.**

*An AI-powered reading companion that saves, scores, and sequences your reading backlog — so your library actually becomes knowledge.*

[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Supabase%20Edge%20Functions-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/docs/guides/functions)
[![Storage](https://img.shields.io/badge/Storage-Cloudinary-3448C5?style=for-the-badge&logo=cloudinary)](https://cloudinary.com/)
[![Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com/)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render)](https://render.com/)

---

<!-- Add a screenshot/banner of the landing page here -->
<!-- <!--- SCREENSHOT: Full landing page hero — animated book shelf on the left, sign-in form on the right, dark theme ---> -->

</div>

---

## ✨ What is Folio?

Most "read later" apps are graveyards. You save articles and EPUBs with the best intentions, and they sit there rotting while your backlog grows. **Folio is the antidote.**

Folio is a full-stack, AI-native reading platform that doesn't just store your content — it **understands** it, **scores** it, and **tells you what to read next and why**. Every book, PDF, EPUB, and article in your library gets analyzed by the [Folio AI Engine](#-folio-ai-engine) and enriched with:

- 🧠 **Semantic summaries** and key concept extraction
- 📊 **ROI scores** — is this worth your reading time?
- ⏳ **Knowledge decay scores** — how stale is this content?
- 📚 **Personalized learning paths** generated from your own library
- 🔮 **Read-probability predictions** — will you actually finish it?

---

## 🚀 Core Features

| Feature | Description |
|---|---|
| 📥 **Content Ingestion** | Upload PDFs, EPUBs, or paste any URL — Folio scrapes, parses, and extracts full text automatically |
| 📖 **In-App Reader** | Paginated, themeable reader with 12 visual themes, font controls, bookmarks, and highlights |
| 🤖 **AI Understanding** | Per-content AI analysis: summary, difficulty, key concepts, topics, and category |
| 📈 **ROI Scoring** | Time-aware score balancing content value against your real reading speed (WPM) |
| 🧟 **Backlog Tools** | Guilt trips, graveyard reviews, bankruptcy mode, and decay tracking for your reading backlog |
| 🗺️ **Learning Paths** | AI-generated 3-phase curriculum built from your own library on any topic you choose |
| 🔢 **Queue Optimizer** | Greedy knapsack algorithm that fits the highest-value reads into your session time budget |
| 📊 **Insights Dashboard** | Reading heatmaps, recommendations, WPM tracking, and genre breakdowns |
| 📚 **Shelves** | Organize your library into custom named shelves |
| 🔖 **Bookmarks & Highlights** | Persistent annotations (bookmark, highlight, underline, strikethrough) with notes |

---

## 🗂️ Directory Tree

```
folio/
│
├── backend/                        # FastAPI application server
│   ├── main.py                     # App entry point: registers all routers, CORS, health check endpoint
│   ├── database.py                 # Async SQLAlchemy engine + session factory (pool: 10 base / 20 overflow)
│   ├── models.py                   # All ORM models: User, ContentSource, LibraryItem, ReadingSession, etc.
│   ├── schemas.py                  # Pydantic v2 request/response schemas for all API endpoints
│   ├── auth_utils.py               # Pure JWT logic: create_access_token, decode_access_token (30-day expiry, HS256)
│   ├── dependencies.py             # FastAPI DI: get_current_user — the auth gatekeeper for all protected routes
│   ├── settings.py                 # Cloudinary config and environment variable loading
│   ├── requirements.txt            # Full Python dependency manifest
│   │
│   ├── router/
│   │   ├── auth.py                 # /auth — login, OTP signup flow, JWT issuance, GET /auth/users/me
│   │   ├── content.py              # /content — PDF/EPUB upload, URL scraping, global content discovery
│   │   ├── library.py              # /library — CRUD for library items, shelves, and shelf assignments
│   │   ├── reading.py              # /reading — reading session tracking, bookmarks, and highlights
│   │   ├── ai_features.py          # /ai — all 12 AI features as async background jobs with job polling
│   │   ├── suggestions.py          # /suggestions — personalized reading queue suggestions
│   │   └── profile.py              # /profile — user profile, reading speed (WPM), genre preferences
│   │
│   └── services/
│       ├── storage.py              # Cloudinary upload, PDF text extraction (pypdf), full EPUB XML parsing + cover
│       ├── scraper.py              # Web article scraping via trafilatura + BeautifulSoup4
│       └── email_service.py        # OTP email delivery via aiosmtplib for signup verification
│
├── frontend/                       # Vanilla HTML/CSS/JS — no framework, no bundler, deployed on Vercel
│   ├── vercel.json                 # Clean URL rewrites (/ → index.html, /library → library.html, etc.)
│   ├── favicon.png                 # Application favicon
│   │
│   ├── HTML/
│   │   ├── index.html              # Landing page + login/signup forms with OTP verification flow
│   │   ├── library.html            # Library grid, shelves sidebar, info modals, "is it worth it?" modal
│   │   ├── reader.html             # Full reader UI: navigation ribbons, sidebar TOC, settings, annotations
│   │   ├── insights.html           # AI Insights dashboard: heatmap, recommendations, learning paths, backlog tools
│   │   └── profile.html            # User profile: display name, WPM settings, genre preferences (75+ genres)
│   │
│   ├── CSS/
│   │   ├── style.css               # Global design system: CSS custom properties, 12 themes, landing page
│   │   ├── library.css             # Library page: card grid, shelf sidebar, modals, concept tag popups
│   │   ├── reader.css              # Reader layout: column pagination, progress bar, ribbons, sidebar
│   │   └── insights.css            # Insights dashboard: heatmap grid, recommendation cards, charts
│   │
│   └── js/
│       ├── api.js                  # Shared ApiClient: fetch wrapper, JWT Bearer injection, 401 interceptor
│       ├── main.js                 # Landing page: AuthManager (login/OTP signup), auto session bypass on load
│       ├── library.js              # Library logic: card rendering, shelves, info modal, AI job calls
│       ├── reader.js               # Reader engine: CSS column pagination, themes, AI analysis, session saving
│       ├── insights.js             # Insights: heatmap rendering, AI job polling, learning paths, recommendations
│       └── profile.js              # Profile: display name edit, WPM calibration, genre preference selection
│
├── public/                         # Static public assets
├── requirements.txt                # Root-level Python dependency list (mirrors backend/requirements.txt)
└── folio_project_context.md        # Project context document
```

---

## 🤖 Folio AI Engine

The AI Engine is a **separate, stateless microservice** deployed as Supabase Edge Functions. The Folio backend calls it over HTTPS and handles all database persistence itself — the Engine only receives text, processes it with an LLM, and returns structured JSON. This fully decouples the LLM workload from the core API.

<!-- <!--- DIAGRAM: Add a simple flow diagram image here showing: Browser → FastAPI → BackgroundTask → Supabase Edge Fn → FastAPI DB write → Browser poll ---> -->

### Async Job Pattern

Every AI feature follows the same non-blocking pattern:

```
POST /ai/<feature>
  │
  ├─ 1. Create a pending AIJobResult row in the DB
  ├─ 2. Spawn a FastAPI BackgroundTask (returns instantly)
  └─ 3. Return { request_id, status: "pending" } immediately
         │
         └─ Background Task (runs after response is sent):
              ├─ Fetch content/user data from PostgreSQL
              ├─ POST payload to Supabase Edge Function endpoint
              ├─ Persist AI results back to ContentSource / LibraryItem
              └─ Mark AIJobResult.status = "completed" | "failed"

GET /ai/jobs/{id}  ← Frontend polls this every 2s until status != "pending"
```

### AI Feature Catalogue

| Endpoint | Feature | What it does |
|---|---|---|
| `POST /ai/understand` | **Understand** | Summarize content; extract key concepts (with explanations), difficulty, category, and topics |
| `POST /ai/roi` | **ROI Score** | Returns a 0–10 score for reading-time ROI, personalized to your WPM |
| `POST /ai/worth-reading` | **Worth Reading?** | Honest assessment: main idea, key takeaways, target audience, recommendation |
| `POST /ai/predict-read` | **Read Predictor** | Given your history (completion rate, backlog size), will you actually read this? |
| `POST /ai/learning-path` | **Learning Path** | 3-phase structured curriculum built from your library for a topic you name |
| `POST /ai/heatmap` | **Reading Heatmap** | Genre and activity pattern analysis from your full reading history |
| `POST /ai/recommendations` | **Recommendations** | Ranked reading list from your unread backlog based on interests + recency |
| `POST /ai/decay` | **Decay Tracker** | How stale is each unread item? Scores time-sensitivity and remaining value |
| `POST /ai/guilt` | **Guilt Trip** | Calls out items you've been avoiding, by name, with AI-generated commentary |
| `POST /ai/bankruptcy` | **Bankruptcy Mode** | AI-assisted backlog purge: keep the top X%, surface the rest for archival |
| `POST /ai/graveyard` | **Graveyard** | Reflective summary of everything you've completed and archived |
| `POST /ai/queue/optimize` | **Queue Optimizer** | Pure algorithmic (no AI): greedy knapsack fits the best reads into your time budget |

### Fallback Strategy

If the AI Engine is unreachable, every endpoint has a **structured fallback** — the `AIJobResult` still completes with `source: "fallback"` using sensible defaults. Users never see a hard failure.

<!-- <!--- SCREENSHOT: AI "Understand" result in the reader — show the modal with summary, key concepts as interactive tags, and the popup tooltip for one concept ---> -->

---

## 📊 Project Stats

| Metric | Detail |
|---|---|
| **Backend language** | Python 3.11+ |
| **API framework** | FastAPI 0.137 |
| **ORM** | SQLAlchemy 2.0 (fully async) |
| **Database** | PostgreSQL via asyncpg, pool: 10 base / 20 overflow |
| **Auth** | JWT HS256, 30-day token expiry, bcrypt password hashing |
| **Signup flow** | Email OTP verification via aiosmtplib |
| **AI Jobs** | 12 distinct feature types, all async-polled |
| **DB Models** | 13 SQLAlchemy ORM models |
| **Content types** | PDF, EPUB, Web Article (URL scrape) |
| **Genres supported** | 75+ with database-level `CHECK` constraints |
| **File storage** | Cloudinary (`resource_type: raw` for PDFs/EPUBs) |
| **API endpoints** | ~45 distinct HTTP endpoints across 7 routers |
| **Reader themes** | 12 visual themes |
| **Frontend** | Zero dependencies, no bundler, no framework |

### Tech Stack Badges

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.137-009688?style=flat-square&logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-asyncpg-336791?style=flat-square&logo=postgresql)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0%20Async-D71F00?style=flat-square)
![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?style=flat-square)
![python-jose](https://img.shields.io/badge/JWT-python--jose-black?style=flat-square)
![bcrypt](https://img.shields.io/badge/Passwords-bcrypt-4A4A4A?style=flat-square)
![Cloudinary](https://img.shields.io/badge/Storage-Cloudinary-3448C5?style=flat-square)
![trafilatura](https://img.shields.io/badge/Scraping-trafilatura-orange?style=flat-square)
![pypdf](https://img.shields.io/badge/PDF-pypdf-red?style=flat-square)
![Lucide Icons](https://img.shields.io/badge/Icons-Lucide-F56565?style=flat-square)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-black?style=flat-square&logo=vercel)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat-square&logo=render)
![Supabase](https://img.shields.io/badge/AI%20Engine-Supabase-3ECF8E?style=flat-square&logo=supabase)

---

## ⚡ Quick Start

### Prerequisites

- Python 3.11+
- A PostgreSQL database (local, [Supabase](https://supabase.com), [Neon](https://neon.tech), or [Railway](https://railway.app))
- A [Cloudinary](https://cloudinary.com) account (free tier works)
- A deployed instance of the Folio AI Engine (Supabase Edge Functions)

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/folio.git
cd folio
```

---

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```env
# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/folio_db

# ── JWT (generate with: python -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET_KEY=your-64-char-hex-secret-here

# ── Cloudinary (PDF/EPUB binary storage) ──────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Folio AI Engine (Supabase Edge Functions base URL) ────────────────────
AI_SERVICE_URL=https://your-project.supabase.co/functions/v1/analyze

# ── Email (for OTP signup verification) ───────────────────────────────────
MAIL_USERNAME=your@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_FROM=your@gmail.com
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587

# ── Optional ──────────────────────────────────────────────────────────────
DEBUG=false
```

Start the development server:

```bash
uvicorn main:app --reload --port 8000
```

> API is live at `http://localhost:8000`  
> Interactive docs at `http://localhost:8000/docs`

---

### 3. Frontend Setup

The frontend is pure HTML/CSS/JS — **no build step required**.

```bash
# Option A: Serve with Python
python -m http.server 5500 --directory frontend

# Option B: Serve with npx
cd frontend && npx serve .
```

> **Important:** For local development, update `API_BASE` in `frontend/js/api.js` from the production Render URL to `http://localhost:8000`.

Navigate to `http://localhost:5500/HTML/index.html` to open the app.

---

### 4. Deploy to Production

**Frontend → Vercel**

```bash
cd frontend
npx vercel --prod
```

Vercel reads `vercel.json` automatically for clean URL routing.

**Backend → Render**

1. Connect your GitHub repo to a new Render Web Service
2. Set **Root Directory** to `backend/`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add all `.env` keys as Render Environment Variables

---

## 🏛️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                                   │
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │
│   │  index   │  │ library  │  │  reader  │  │     insights       │   │
│   │  .html   │  │  .html   │  │  .html   │  │     .html          │   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┬──────────┘   │
│        └─────────────┴─────────────┴──────────────────┘              │
│                                   │                                    │
│                       api.js (ApiClient)                               │
│               JWT Bearer injected on every request                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND  (Render)                           │
│                                                                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │  /auth  │  │ /content │  │ /library │  │  /ai/*               │   │
│  │  router │  │  router  │  │  router  │  │  router              │   │
│  └─────────┘  └────┬─────┘  └──────────┘  └──────────┬───────────┘   │
│                    │                                   │               │
│             ┌──────┴───────┐               ┌───────────┴──────────┐   │
│             │  services/   │               │   BackgroundTasks    │   │
│             │  storage.py  │               │   (non-blocking)     │   │
│             │  scraper.py  │               └───────────┬──────────┘   │
│             └──────┬───────┘                           │               │
└────────────────────┼───────────────────────────────────┼───────────────┘
                     │                                   │ HTTPS POST
          ┌──────────┼──────────┐                        ▼
          │          │          │        ┌───────────────────────────┐
          ▼          ▼          ▼        │    FOLIO AI ENGINE        │
    ┌──────────┐ ┌────────┐ ┌──────┐    │  (Supabase Edge Functions)│
    │PostgreSQL│ │Cloudnry│ │Email │    │                           │
    │(asyncpg) │ │(files) │ │ OTP  │    │  /api/analyze/*           │
    └──────────┘ └────────┘ └──────┘    │  /api/personalization/*   │
                                         │  /api/backlog/*           │
                                         └───────────────────────────┘
```

### Content Upload Flow

```
User uploads PDF / EPUB
        │
        ▼
POST /content/upload
  1. Detect file type from extension
  2. Extract full text  →  pypdf (PDF) or EPUB XML parser (EPUB)
  3. Upload binary file to Cloudinary  →  secure_url stored
  4. Extract + upload cover image (EPUB only)
  5. INSERT ContentSource row into PostgreSQL
  6. INSERT LibraryItem row linking user ↔ content
        │
        ▼
User clicks "Understand" in the Reader
  1. POST /ai/understand  →  creates AIJobResult { status: "pending" }
  2. BackgroundTask fires — calls Supabase Edge Function with raw_text
  3. AI returns: { summary, key_concepts, difficulty, topics, category }
  4. Backend persists result to ContentSource row
  5. Frontend polls GET /ai/jobs/{id} every 2s until completed → renders
```

### Reading Progress Flow

```
User reads inside the reader
  → currentPage / totalPages tracked in memory
  → On tab close / navigation away:
      saveReadingSession() fires with keepalive: true
      POST /reading/sessions { progress_pct, duration_sec, words_covered }
  → Backend updates library_items.progress_percent
  → On next library page load:
      progress_percent rendered as the card's progress bar
```

---

## 📸 Screenshots

<!-- Add screenshots here after taking them from the live app -->

<!-- <!--- SCREENSHOT: Library page — book card grid with decay badges (Fresh/Aging/Stale), progress bars, and a shelf selected in the sidebar ---> -->

<!-- <!--- SCREENSHOT: Reader page — open EPUB/PDF with a dark theme active, sidebar TOC open, and the top ribbon visible ---> -->

<!-- <!--- SCREENSHOT: Reader — "Understand" AI modal with key concept interactive tags expanded, showing one concept popup ---> -->

<!-- <!--- SCREENSHOT: Library Info Card — the info icon popup showing all metadata: summary, key concepts, tags, ROI score, difficulty ---> -->

<!-- <!--- SCREENSHOT: Insights page — reading heatmap and the "learning path" result rendered as a 3-phase curriculum ---> -->

<!-- <!--- SCREENSHOT: Insights page — "Is it worth it?" / worth reading modal result ---> -->

---

## 🤝 Contributing

Folio was built for HackHazard. Contributions, issues, and ideas are welcome!

### Getting Started

1. **Fork** the repository
2. **Create a branch:** `git checkout -b feature/your-feature-name`
3. **Make your changes** with clear, descriptive commits
4. **Open a PR** describing what changed and why

### Contribution Areas

| Area | Ideas |
|---|---|
| 🤖 **AI Engine** | New analysis endpoints — readability scoring, entity extraction, quote detection |
| 📱 **Frontend** | Mobile responsiveness, PWA manifest, service worker for offline reading |
| 📚 **Content Types** | Support for `.mobi`, `.txt`, Markdown, or RSS feeds |
| 🔌 **Browser Extension** | One-click "Save to Folio" from any browser tab |
| 🧪 **Tests** | Backend test coverage via pytest (scaffold exists in `backend/tests/`) |
| 🎨 **Themes** | New reader themes and improved accessibility (WCAG contrast ratios) |

### Code Style

- **Python:** PEP 8. Type hints on every function. Document non-trivial logic.
- **JavaScript:** Vanilla ES6+. No frameworks. Keep functions focused and named clearly.
- **CSS:** Use CSS custom properties from the design system (`var(--token)`). Never hardcode colors or spacing.

---

## 📄 License

This project was created for **HackHazard 2025**. License TBD by the project team.

---

<div align="center">

Built with ❤️ by **Pranesh Jha** for HackHazard

*If Folio helped you — leave a ⭐ on the repo!*

</div>
