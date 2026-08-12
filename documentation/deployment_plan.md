# BrainVault A-Z Deployment Plan

BrainVault consists of **7 distinct services**. Deploying this in 2026 can be done entirely for **free** using one of two approaches:

1. **Option A: The "All-In-One" VPS (Highly Recommended)** — Deploying our `docker-compose.yml` to a single powerful free server.
2. **Option B: The "Serverless Patchwork"** — Hosting each of the 7 services on specialized free-tier platforms.

---

## Option A: The "All-In-One" VPS (Highly Recommended)

Because BrainVault is fully Dockerized, the absolute easiest and most reliable way to host it is on a single Virtual Private Server (VPS). 

### The Best Platform: Oracle Cloud (Always Free)
Oracle Cloud offers an absurdly generous **Always Free** tier that outclasses AWS and Google Cloud's free tiers:
- **Specs:** Up to 4 ARM Processors, 24GB RAM, and 200GB Storage.
- **Why it's best:** 24GB of RAM is more than enough to comfortably run all 7 of our containers (Postgres, Qdrant, MinIO, Redis, Next.js, FastAPI, Celery) 24/7 without them going to sleep.

### A-Z Deployment Steps (Oracle Cloud)
1. Sign up for an Oracle Cloud account and create an "Always Free" Compute Instance (choose the Ampere A1 ARM shape).
2. SSH into your new server.
3. Install Docker and Docker Compose on the server.
4. Clone this GitHub repository to the server: `git clone https://github.com/Nishanth456/BrainVault---AI-Powered-Knowledge-Brain.git`
5. Create a `.env` file in the root with your API keys (Groq, Gemini, etc.).
6. Run `docker-compose up -d --build`.
7. Your app is now live globally on the Oracle server's public IP address!

*(Alternative to Oracle: GitHub Education Student Pack offers DigitalOcean credits, or you can use a cheap $5/mo Hetzner/DigitalOcean VPS if Oracle registration fails).*

---

## Option B: The "Serverless Patchwork"

If you prefer to split the application up into serverless components (so you don't have to manage a Linux server), here are the absolute best free-tier providers for each of our 7 services in 2026:

### 1. Frontend (Next.js)
- **Status:** Needs a Node.js edge runtime.
- **Best Choice: Vercel**
- **Why:** Next.js is built by Vercel. Deployment is zero-config (just connect your GitHub repo). The free tier is massive and will easily handle personal usage.

### 2. Backend API (FastAPI)
- **Status:** Needs an ASGI Python runtime that supports long-lived connections.
- **Best Choice: Render** (or Fly.io)
- **Why:** Render allows you to connect your GitHub and deploy FastAPI easily. *Note: Render's free tier goes to sleep after 15 minutes of inactivity, causing a 50-second "cold start" delay when you first open the app.*

### 3. Celery Worker (Background Tasks)
- **Status:** Needs a continuous background Python process.
- **Best Choice: Fly.io** (or Railway with free credits)
- **Why:** True background workers are rarely free. Fly.io offers 3 small VMs for free, allowing you to run your Celery worker constantly so it can scrape URLs and run agents in the background.

### 4. PostgreSQL Database
- **Status:** Needs a relational database.
- **Best Choice: Neon DB** (or Supabase)
- **Why:** Neon provides a permanent free tier with a serverless Postgres database that scales to zero. It gives you a connection string (e.g., `postgres://...`) that you simply paste into your Backend's `.env` file.

### 5. Vector Database (Qdrant)
- **Status:** Needs to store AI embeddings for Semantic Search.
- **Best Choice: Qdrant Cloud**
- **Why:** Qdrant offers a completely free, forever 1GB cluster on their cloud platform. You just grab the API key and Host URL and put it in your `.env`.

### 6. Redis (Task Queue Broker)
- **Status:** Needs to route messages between FastAPI and Celery.
- **Best Choice: Upstash**
- **Why:** Upstash provides a serverless Redis database with a generous permanent free tier (10,000 requests per day). Perfect for a hobby Celery broker.

### 7. Object Storage (MinIO alternative)
- **Status:** Needs an S3-compatible bucket to store PDFs and images.
- **Best Choice: Cloudflare R2**
- **Why:** Instead of running MinIO, Cloudflare R2 gives you 10GB of free storage per month and absolutely **zero egress fees** (meaning it's free to download/view the images you upload).

---

## Final Recommendation

If you want to get this online quickly and ensure everything works exactly like it does on your laptop, **Option A (Oracle Cloud VPS)** is the undisputed winner. 

If you go with Option B, you will have to create 7 different accounts on 7 different websites, manage 7 different sets of API keys/URLs, and deal with Render putting your backend to sleep when you aren't using it.

**Next Step:** Let me know if you'd like to proceed with Option A, and I can walk you through exactly how to set up the Oracle Cloud server!
