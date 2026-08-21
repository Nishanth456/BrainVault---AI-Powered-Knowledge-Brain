# Phase 2: Codebase Refactoring Specification

This document details the precise code changes required to support both our local `docker-compose` environment and our new Cloud Native environment, controlled by a new `ENV_MODE` environment variable.

## Goal
Make the backend seamlessly toggle between local (Docker) services and Cloud (managed) services without breaking the local developer experience.

## Step 1: Configuration Updates (`backend/config.py`)
Add support for the new cloud-specific environment variables that we defined in Phase 1. 

**Changes:**
1. Add `ENV_MODE: str = "local"`
2. Add S3/R2 cloud storage variables:
   * `AWS_ACCESS_KEY_ID: str = ""`
   * `AWS_SECRET_ACCESS_KEY: str = ""`
   * `AWS_REGION: str = "auto"`
   * `AWS_ENDPOINT_URL_S3: str = ""`
   * `S3_BUCKET_NAME: str = ""`

## Step 2: Storage Client Adaptation (`backend/services/minio.py`)
Currently, the codebase uses the `minio` Python SDK. The deployment plan suggested using `boto3`, but the `minio` SDK is perfectly compatible with AWS S3 and Cloudflare R2! 

Instead of rewriting our upload/download logic, we will simply conditionally initialize the `Minio` client based on `ENV_MODE`.

**Changes:**
If `settings.ENV_MODE == "cloud"`:
* Initialize `Minio` using `AWS_ENDPOINT_URL_S3` (stripping the `https://` prefix because `minio` SDK expects it).
* Use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
* Set `secure=True`.
Else (Local mode):
* Use the existing `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, etc.
* Update bucket name references to use `S3_BUCKET_NAME` when in cloud mode.

## Step 3: Background Tasks Toggle (`backend/routers/ingest.py`)
In the cloud (Google Cloud Run), CPU is throttled to 0 when no HTTP request is active, making traditional Celery workers non-viable without dedicated VMs. We will use FastAPI's native `BackgroundTasks`.

**Changes:**
In `@router.post("/ingest")`:
1. Inject `background_tasks: BackgroundTasks` into the function signature.
2. Add a conditional toggle:
   ```python
   if settings.ENV_MODE == "cloud":
       background_tasks.add_task(run_ingestion_pipeline_async, job_id, request.raw_input, request.concept)
   else:
       run_ingestion_pipeline.delay(job_id, request.raw_input, request.concept)
   ```
*(Note: We will need to wrap the `run_ingestion_pipeline` Celery task into a compatible async function or run it in a threadpool so it plays nicely with `BackgroundTasks` without blocking the main FastAPI loop).*

---

Once we agree on this spec, we will proceed with implementing these 3 steps.
