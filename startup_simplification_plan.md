# Simplification Plan: One-Command Startup

Currently, starting BrainVault requires opening 4 separate terminals to run Infrastructure, FastAPI, Celery, and the Next.js Frontend. You are asking if we can build Docker images for the app so you only need to run one command.

Yes, we absolutely can. We can transition the project to a **Unified Docker Compose** architecture. 

## The Proposed Solution

We will create a master `docker-compose.yml` in the root of your project. This single file will orchestrate *everything*. When you run `docker-compose up`, it will start 7 containers simultaneously:

1. **PostgreSQL** (Database)
2. **Qdrant** (Vector Database)
3. **Redis** (Task Queue Broker)
4. **MinIO** (Object Storage)
5. **Backend API** (FastAPI running via Uvicorn)
6. **Celery Worker** (Background processing)
7. **Frontend** (Next.js Application)

## What Needs to be Done

To achieve this, we will execute the following steps:

### 1. Create Dockerfiles
- **`backend/Dockerfile`**: A Python 3.11+ environment that installs all `requirements.txt`. It will also need to install Playwright dependencies (`playwright install --with-deps chromium`).
- **`frontend/Dockerfile`**: A Node.js environment that installs NPM packages and runs the Next.js server.

### 2. Create the Root `docker-compose.yml`
- We will move your existing infrastructure definitions (Postgres, Redis, etc.) into a new root `docker-compose.yml`.
- We will add the `backend`, `celery`, and `frontend` services to it.
- We will map local folders into the containers (called "volumes") so that if you edit a Python or TypeScript file locally, the changes instantly reflect inside the container (Hot-Reloading).

### 3. Update Networking
- Currently, your frontend talks to `localhost:8000`. Inside Docker, containers talk to each other via service names (e.g., `http://backend:8000`). We will adjust the environment variables to handle this seamless routing.

> [!CAUTION]
> **Trade-off Alert: The LinkedIn Manual Login**
> Currently, to scrape LinkedIn, you run a manual login script that opens a real browser window on your desktop for you to type your password and solve CAPTCHAs. 
> 
> **If we put the backend inside a Docker container, it cannot open a browser window on your Windows desktop.** 
> 
> *Workaround:* You would still need to run the `python scripts/linkedin_login.py` script locally on your Windows machine just *once* to generate the `linkedin_session.json` file. The Docker container will then mount and read that file. 

## Open Questions for You

> [!WARNING] 
> Before we write the code, please confirm your preference:
>
> 1. **Option A (Full Docker):** Proceed with full Dockerization. You will run `docker-compose up --build` and everything starts. (You will just have to run the LinkedIn login script locally when your session expires).
> 2. **Option B (PowerShell Script):** Keep the code running locally on Windows (better for native speed/debugging) but create a `start.ps1` script that automatically opens all 4 terminals and starts everything for you in one click.

Which path sounds better to you?
