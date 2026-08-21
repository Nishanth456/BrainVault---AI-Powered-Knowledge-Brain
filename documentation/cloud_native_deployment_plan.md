# BrainVault: Cloud Native Refactor Plan ($0/month)

This document outlines the end-to-end process for transforming BrainVault into a modern, **100% free serverless architecture** for production, **while ensuring the local `docker-compose` setup remains perfectly intact.**

---

## Phase 0: Branching Strategy (Completed)
To ensure we do not break the local environment, we have isolated our work:
1. Created `version01-backup` branch to preserve the exact current state.
2. Switched to a new `deployment` branch to safely implement and trial the dual-environment changes.

---

## Phase 1: The Infrastructure Swaps (Managed Services for Production)

To clarify where all 7 of our local `docker-compose` services are going in the cloud, here is the complete mapping:

### The 4 Stateful Services (Databases & Storage)
You will create free accounts on the following platforms to replace your local Docker containers *only when deployed*:

1. **`postgres`** -> **[Supabase](https://supabase.com/) or [Neon](https://neon.tech/)** *(Important: You must use their "Connection Pooler" port, usually `6543`, for Serverless compatibility).*
2. **`qdrant`** -> **[Qdrant Cloud](https://qdrant.to/cloud)**
3. **`redis`** -> **[Upstash](https://upstash.com/)**
4. **`minio`** -> **[AWS S3](https://aws.amazon.com/s3/) or [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)**

### The 3 Compute Services (App & Workers)
5. **`backend` (FastAPI)** -> **Google Cloud Run** (Serverless container deployment)
6. **`celery` (Worker)** -> **Removed in Cloud** (Replaced by FastAPI BackgroundTasks running inside the Cloud Run backend instance)
7. **`frontend` (Next.js)** -> **Vercel** (Serverless frontend deployment)

*Your local `docker-compose.yml` will remain completely unchanged and will continue to spin up local versions of all 7 services for local development.*

---

## Phase 2: Codebase Refactoring (The Simple Way)

To ensure we don't break the local Docker setup, we will use an Environment Variable flag (e.g., `ENV_MODE=cloud`) to intelligently toggle behaviors in the backend code.

### 1. Handling Celery (FastAPI Background Tasks)
**The Problem:** Celery requires a continuously running background worker. Cloud Run is "serverless", meaning it freezes the CPU immediately after an HTTP response is sent. 
**The Solution:** We will abandon Celery in production and use FastAPI's built-in `BackgroundTasks`.

**Code Changes Required in `backend/routers/ingest.py`**:
*   Modify the `/ingest` POST endpoint to conditionally use FastAPI's `BackgroundTasks` when in the cloud, while keeping `.delay()` for local testing.
    ```python
    import os
    from fastapi import BackgroundTasks
    
    # Inside your ingest POST route:
    if os.getenv("ENV_MODE") == "cloud":
        # Cloud: Use FastAPI BackgroundTasks
        background_tasks.add_task(run_ingestion_pipeline_async, job_id, request.raw_input, request.concept)
    else:
        # Local: Keep using Celery
        run_ingestion_pipeline.delay(job_id, request.raw_input, request.concept)
    ```

*(Note: To make sure Cloud Run doesn't freeze the CPU while this background task is running, we will enable "Session Affinity" in Phase 3. This ensures that the user's open SSE stream connects to the exact same container running the background task, keeping the CPU awake!)*

### 2. Dual Environment Variables
Instead of editing the existing `DATABASE_URL` or internal Docker hostnames (`postgres:5432`) in your `.env` files, we will use environment variable injection:
* **Local (`.env`):** Keep it exactly as it is (pointing to `localhost`).
* **Cloud (Cloud Run Console):** We will inject the Supabase, Qdrant Cloud, and Upstash API keys directly into the Google Cloud Run environment variables. 

### 3. S3-Compatible Storage Adaptation
Since MinIO uses the exact same `boto3` (S3 API) as AWS, you won't need to rewrite your file upload logic. You just conditionally load the `ENDPOINT_URL`:
```python
s3_client = boto3.client(
    's3',
    endpoint_url=os.getenv('MINIO_ENDPOINT') if os.getenv('ENV_MODE') != "cloud" else None
)
```

---

## Phase 3: The Deployment Steps

Once the codebase supports both `local` and `cloud` modes gracefully, you will deploy the stateless applications.

### Step 1: Deploy Backend to Google Cloud Run
1. Go to Google Cloud Console.
2. Deploy the backend using the CLI, **making sure to enable Session Affinity** so your background tasks don't get frozen:
   ```bash
   gcloud run deploy brainvault-api \
     --source ./backend \
     --allow-unauthenticated \
     --session-affinity \
     --set-env-vars="ENV_MODE=cloud,DATABASE_URL=<supabase_pooler_url>,QDRANT_HOST=<qdrant_url>,QDRANT_API_KEY=<key>,REDIS_URL=<upstash_url>"
   ```

### Step 2: Deploy Frontend to Vercel
1. Go to [Vercel.com](https://vercel.com) and sign in with GitHub.
2. Select your BrainVault repository (make sure to choose the `deployment` branch).
3. Set the Environment Variable:
   * `NEXT_PUBLIC_API_URL` = The Cloud Run URL you generated in Step 1.
4. Click **Deploy**.
