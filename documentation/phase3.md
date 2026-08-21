# Phase 3: Deployment Guide

This guide will walk you through deploying your backend to Google Cloud Run and your frontend to Vercel, using the exact credentials we generated in Phase 1.

---

## Part 1: Backend Deployment (Google Cloud Run)

We will use the Google Cloud CLI (`gcloud`) to deploy your FastAPI backend as a serverless container.

### Step 1: Install and Authenticate Google Cloud CLI
1. If you haven't already, download and install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
2. Open your terminal and run:
   ```bash
   gcloud auth login
   ```
   *This will open a browser window for you to log into your Google account.*
3. Create a new Google Cloud Project (or select an existing one):
   ```bash
   gcloud projects create brainvault-prod
   gcloud config set project brainvault-prod
   ```
4. Enable the Cloud Run API for your project:
   ```bash
   gcloud services enable run.googleapis.com
   ```

### Step 2: Deploy the Backend
Run the following deployment command from the **root directory of your project** (where this documentation folder lives). 

This command tells Google Cloud Run to build your container using the `backend` folder, deploy it, enable Session Affinity (critical so background tasks don't get throttled), and inject all your cloud keys!

*Copy and paste this entire block into your terminal:*

```bash
gcloud run deploy brainvault-api \
  --source ./backend \
  --region us-central1 \
  --allow-unauthenticated \
  --session-affinity \
  --set-env-vars="ENV_MODE=cloud,\
DATABASE_URL=postgresql://neondb_owner:npg_G5HLjAhgr2Cb@ep-small-lake-axg5b1fq-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require,\
QDRANT_HOST=https://52a61ab3-50ab-46f8-95a6-4365303e22bc.eu-central-1-0.aws.cloud.qdrant.io,\
QDRANT_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6ZWNjNGUyYzUtYjVmYy00NDQ3LWE1MzItYWIxODFiZTk4NjQ5In0.RZvR_ucUCkaKEShOV9BI42Zekt7Xw8UuqNYaExaahno,\
REDIS_URL=rediss://default:AZPUAAIgcDEwMTA5ZTExOGMyOGQ0ZTljOWZiNjBiN2JkZjgxMjQ4Ng@natural-joey-37844.upstash.io:30000,\
AWS_ACCESS_KEY_ID=fb8f1ededacfd1dee4be6497902758d9,\
AWS_SECRET_ACCESS_KEY=72b11780f1433dcec3b878aec74879995d3f5e29d02e4115633e46005189debc,\
AWS_REGION=auto,\
AWS_ENDPOINT_URL_S3=https://62a91b36afe97b8ada7b25b264537c41.r2.cloudflarestorage.com,\
S3_BUCKET_NAME=brainvault-storage"
```

### Step 3: Get your API URL
Once the deployment finishes (it may take 3-5 minutes to build the container in the cloud), the terminal will output a **Service URL** (it will look something like `https://brainvault-api-xxxxxxxx.a.run.app`).

**Copy this URL!** You will need it for the next step.

---

## Part 2: Frontend Deployment (Vercel)

Now we will deploy the Next.js frontend and point it to the Google Cloud Run URL you just created.

1. Commit all your latest changes and push the `deployment` branch to GitHub.
2. Go to [Vercel.com](https://vercel.com/) and log in with your GitHub account.
3. Click **Add New -> Project**.
4. Import your `BrainVault` repository.
5. In the configuration settings:
   * **Framework Preset:** Next.js
   * **Root Directory:** Edit this and type `frontend` (since your Next.js app is inside the frontend folder).
   * **Environment Variables:**
     * Name: `NEXT_PUBLIC_API_URL`
     * Value: Paste the **Google Cloud Run Service URL** you copied in Step 3. (Do not put a trailing slash `/` at the end).
6. Click **Deploy**.

Vercel will build your frontend. Once it finishes, it will give you a live URL to your completed, 100% cloud-hosted application!
