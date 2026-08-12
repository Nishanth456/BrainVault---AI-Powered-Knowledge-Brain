# BrainVault — AI-Powered Knowledge Brain

Capture anything. Understand everything. Paste any URL, text, or file. BrainVault's AI agents automatically extract, classify, and organise it into your personal knowledge brain.

## 📚 Documentation

For a deep dive into the technical stack, architecture, and flows, please refer to the detailed documentation:

- **[Backend Architecture & Agents](documentation/backend.md)**: Complete breakdown of the LangGraph master orchestrator, the 9 agent subgraphs, and exhaustive details on LLM usage (Groq, Gemini, and local Ollama embeddings).
- **[Frontend Architecture](documentation/frontend.md)**: Details on the Next.js App Router stack, Tailwind CSS v4 styling, component-driven design, and premium aesthetic philosophy.
- **[Infrastructure Flow](documentation/infrastructure.md)**: Explanation of the containerized core services (PostgreSQL, Redis, Qdrant, MinIO) and the end-to-end data ingestion pipeline.

---

## 🚀 Quick Start (Local Development)

The entire application is Dockerized. You can start the infrastructure, backend API, celery workers, and frontend with a single command.

### 1. Start all services

Make sure Docker and Docker Compose are installed, then run from the **project root**:

```bash
docker-compose up -d --build
```

This starts:
- **Infrastructure:** PostgreSQL, Qdrant, MinIO, and Redis.
- **Backend API:** Available at [http://localhost:8000/docs](http://localhost:8000/docs).
- **Celery Worker:** Running in the background for async tasks.
- **Frontend:** Available at [http://localhost:3000](http://localhost:3000).

> **Hot Reloading:** The local `backend` and `frontend` directories are mounted into the containers. Any changes you make to the code will instantly reflect without needing to rebuild the images!

> After any change to the LinkedIn scraper or agents, **restart the Celery worker** container so the new code takes effect:
> `docker-compose restart celery`

---

## 🔐 LinkedIn Ingestion — Manual Login Required

LinkedIn blocks headless / automated logins, so the scraper **cannot log itself in** reliably. You must create a saved browser session once, then the backend reuses it.

### First-time setup

1. Make sure your backend `.env` has your LinkedIn credentials (they are only used as a fallback):
   ```env
   LINKEDIN_EMAIL=your_email@example.com
   LINKEDIN_PASSWORD=your_password
   ```
2. Run the manual login script:
   ```bash
   cd backend
   python scripts/linkedin_login.py
   ```
3. A real browser window opens. Log in to LinkedIn normally and solve any CAPTCHA / 2FA.
4. Once you see your feed, the script saves the session to `backend/linkedin_session.json`.
5. **Restart the Celery worker** so it picks up the new session.
6. Now paste a LinkedIn post URL into the BrainVault UI and ingest it.

### If LinkedIn ingestion stops working

- The session probably expired. Re-run `python scripts/linkedin_login.py`, then restart the Celery worker.
- Check `backend/login_dump.html` or `backend/post_dump.html` for debug output if login or scraping fails.

---

## 👤 Updating the Default Profile

When a new user visits the Profile page, the application automatically seeds the database with a default profile. You can customize this by editing the `DEFAULT_PROFILE` dictionary at the top of `backend/routers/profile.py` with your own details. Once updated, restart the backend server, and the new default profile will be used for any newly initialized users.
