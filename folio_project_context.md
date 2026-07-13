# Folio — AI-Powered Read-Later Project Handover Context

This document provides a complete high-level context of the Folio project, its current state, completed work, and next steps to ensure a seamless handover to the next agent.

---

## 1. Project Architecture Overview

Folio is a self-contained AI-powered read-later application consisting of three main components:
1.  **Backend (FastAPI + SQLAlchemy + PostgreSQL):** Serves auth, book/article ingestion, library CRUD, reading sessions, bookmarking/highlighting, and routes proxying AI requests.
2.  **Frontend (Vanilla HTML + CSS + JS):** Simple, responsive user interface using a consistent theme system and API client.
3.  **AI Engine (`folio-ai-engine`):** A separate Express server running on port `3001` that interacts with the Gemini API using defined JSON schemas for direct content analysis.

---

## 2. Completed Backend Work

*   **Database Schema Migration:** Added the `decay_percent` (Float, default 0.0) column to the `library_items` table to persist article decay metrics for downstream optimization queries.
*   **Job System Consolidation:** Refactored Tier 0 AI routes (`/understand`, `/roi`, `/worth-reading`) to utilize the unified `AIJobResult` background job model, returning integer database IDs to the client for consistent polling at `/ai/jobs/{id}`.
*   **Decay Metrics Persistence:** Integrated database post-processing within `execute_ai_job` so that `/api/backlog/decay` results automatically write `decay_percent` to `library_items` and `time_sensitivity` to `content_sources`.
*   **Decay Dependency Elimination:** Switched all relevant queries (`/heatmap`, `/decay`, `/recommendations`, `/guilt`, `/learning-path`) to query the `ContentSource.tags` (JSONB) and `UserGenrePreference` tables, eliminating the reliance on the empty `content_genres` table.
*   **Queue Optimizer:** Added a missing synchronous algorithmic reading queue optimizer endpoint (`/ai/queue/optimize`) that processes user reading speed and content decay using a greedy knapsack logic.
*   **Public User Count Endpoint:** Added `/auth/users/count` to retrieve the total count of registered readers using the database's `Users` table's `id` column.

---

## 3. Completed Frontend Work

*   **Rebuilt Reader Page:** Created a fresh reader implementation with two-column/paginated viewports, client-side table of contents generation, highlights/bookmarks sync, and reading progress updates.
*   **Theme Management:** Included light/dark mode support with persistent client preference storage.
*   **User Count Interface:** Added the `GetUsers` controller to `main.js` which updates the landing page (`index.html`) reader counter (`#user-number`) dynamically on page load.

---

## 4. Current State & Immediate Next Steps

All backend endpoints are verified, fully integration-tested, and functional against the live AI engine. The backend is configured to run at `http://127.0.0.1:8000`.

### Immediate Next Steps for the Next Agent:
1.  **Frontend AI Wiring:** Start wiring the frontend library and reader pages to trigger backend AI endpoints (e.g., generate learning paths, request back bankruptcy cleanups, request article summaries).
2.  **AI Polling UI:** Implement polling interfaces using the returning job IDs to show loading/pending indicator states to the user while background jobs are computed.
