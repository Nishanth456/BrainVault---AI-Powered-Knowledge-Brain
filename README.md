# BrainVault — AI-Powered Knowledge Brain

Capture anything. Understand everything. Paste any URL, text, or file. BrainVault's AI agents automatically extract, classify, and organise it into your personal knowledge brain.

---

## 🚀 Quick Start (Local Development)

To run the full application locally you need the backend, frontend, task queue, and infrastructure services all running at the same time.

### 1. Start infrastructure services

Make sure Docker / Docker Compose is installed, then run:

```bash
cd infrastructure
docker-compose up -d
```

This starts PostgreSQL, Qdrant, MinIO, and Redis.

### 2. Run the backend API

```bash
cd backend
# activate your virtual environment first, e.g. .venv\Scripts\activate on Windows
uvicorn main:app --reload --port 8000
```

### 3. Run the Celery worker

In a **new terminal**:

```bash
cd backend
# activate your virtual environment
celery -A tasks.ingestion worker --loglevel=info -P eventlet
```

> The worker loads `browser.py` once at startup. After any change to the LinkedIn scraper or agents, **restart the Celery worker** so the new code takes effect.

### 4. Run the frontend

In another **new terminal**:

```bash
cd frontend
npm install   # only the first time
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
