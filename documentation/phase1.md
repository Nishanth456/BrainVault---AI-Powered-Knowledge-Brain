# Phase 1: Managed Services Setup Guide

Before we can deploy the backend to Google Cloud Run, we need to replace our 4 local stateful services with free cloud-hosted alternatives. Follow these step-by-step instructions to create the accounts and gather the necessary connection strings.

Create a safe place (like a local `.env.cloud` file or a secure note) to save these variables as you generate them. You will need them for Phase 3 (Deployment).

---

## 1. PostgreSQL (Supabase or Neon)
*Replaces local `postgres` container.*

**Option A: Supabase (Recommended)**
1. Go to [Supabase](https://supabase.com/) and create a free account.
2. Create a new Project.
3. Wait for the database to finish setting up.
4. Go to **Project Settings -> Database**.
5. Scroll down to **Connection Pooling**.
6. Ensure Connection Pooling is enabled and copy the **Connection string (URI)**.
   * *Crucial: The port in the URL MUST be `6543` (the pooler port), NOT `5432`.*
   * Replace `[YOUR-PASSWORD]` with the database password you created.
7. **Save as:** `DATABASE_URL`

**Option B: Neon**
1. Go to [Neon.tech](https://neon.tech/) and create a free account.
2. Create a new project.
3. On the dashboard, copy the connection string. Ensure the "Pooled connection" toggle is ON.
4. **Save as:** `DATABASE_URL`

---

## 2. Vector Database (Qdrant Cloud)
*Replaces local `qdrant` container.*

1. Go to [Qdrant Cloud](https://cloud.qdrant.io/) and create a free account.
2. Create a new Free Tier Cluster.
3. Once provisioned, click into your cluster.
4. Copy the **Cluster URL** (e.g., `https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io`).
5. **Save as:** `QDRANT_HOST`
6. Under Data Access Control (or API Keys), generate a new API key.
7. **Save as:** `QDRANT_API_KEY`
8. *(Note: Qdrant Cloud handles port routing automatically, so you won't need a specific port variable in the cloud).*

---

## 3. Redis (Upstash)
*Replaces local `redis` container.*

1. Go to [Upstash](https://upstash.com/) and create a free account.
2. Go to the **Redis** section and click **Create Database**.
3. Give it a name and select a region closest to your eventual Google Cloud Run region.
4. Once created, scroll down to the **Connect** section.
5. Select the **Python** tab (or just look at the URI).
6. Copy the entire `rediss://...` connection string.
7. **Save as:** `REDIS_URL`

---

## 4. Object Storage (Cloudflare R2 or AWS S3)
*Replaces local `minio` container.*

**Option A: Cloudflare R2 (Recommended - No egress fees)**
1. Go to [Cloudflare](https://www.cloudflare.com/) and create an account.
2. Navigate to **R2 Object Storage** in the sidebar (requires adding a credit card, but there is a generous 10GB free tier).
3. Click **Create Bucket** (name it something like `brainvault-storage`).
4. Go back to the R2 overview and click **Manage R2 API Tokens**.
5. Create a token with **Object Read & Write** permissions.
6. Copy the generated keys.
7. **Save as:** 
   * `AWS_ACCESS_KEY_ID`
   * `AWS_SECRET_ACCESS_KEY`
   * `AWS_REGION` (usually `auto` for R2)
8. Find your account's S3 API URL on the bucket page (looks like `https://<account-id>.r2.cloudflarestorage.com`).
9. **Save as:** `AWS_ENDPOINT_URL_S3` (Cloud Run will use this to override default AWS endpoints).
10. **Save Bucket Name as:** `S3_BUCKET_NAME`

**Option B: AWS S3**
1. Create an AWS account and a new S3 bucket.
2. Create an IAM User with S3 permissions and generate Access Keys.
3. **Save as:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `S3_BUCKET_NAME`.

---

## Summary of Required Environment Variables for Production
By the end of Phase 1, you should have these values ready to inject into Google Cloud Run:

```env
ENV_MODE=cloud
DATABASE_URL=postgresql://postgres.xxx...:6543/postgres
QDRANT_HOST=https://xxx.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_key
REDIS_URL=rediss://default:xxx@xxx.upstash.io:30000
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=auto
AWS_ENDPOINT_URL_S3=https://your-account-id.r2.cloudflarestorage.com
S3_BUCKET_NAME=brainvault-storage
```

Once you have these keys collected, we are fully ready for **Phase 2 (Code Refactoring)**!
