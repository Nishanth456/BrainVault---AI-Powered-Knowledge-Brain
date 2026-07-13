# BrainVault Infrastructure Documentation

## Overview

BrainVault relies on a containerized infrastructure to run its core services. We use **Docker** to ensure that all these services run consistently across any environment, whether it's local development or production.

### What is Docker?
Docker is a platform that uses OS-level virtualization to deliver software in packages called **containers**. Containers isolate software from its environment and ensure that it works uniformly despite differences for instance between development and staging. 

In this project, Docker allows us to spin up complex databases and services with a single command (`docker-compose up`), without needing to install each software locally on your host machine.

---

## Core Infrastructure Components

### 1. PostgreSQL (`postgres:16-alpine`)
- **What it is:** A powerful, open-source object-relational database system.
- **Role in BrainVault:** It acts as the primary source of truth for relational data. It stores metadata about your knowledge items, user sessions, configuration, and structured relationships (like tags, concepts, and generated Q&A pairs).
- **Access:** Exposed on port `5432`.

### 2. Redis (`redis:7-alpine`)
- **What it is:** An in-memory data structure store, used as a distributed, in-memory key–value database, cache, and message broker.
- **Role in BrainVault:** Redis serves as the message broker for **Celery** background tasks. When the backend needs to process a heavy task (like scraping a large website, generating embeddings, or chunking videos), the task is queued in Redis and picked up by background workers asynchronously, keeping the API fast and responsive.
- **Access:** Exposed on port `6379`.

### 3. Qdrant (`qdrant/qdrant:latest`)
- **What it is:** An open-source vector similarity search engine and vector database. It provides a production-ready service with a convenient API to store, search, and manage points—vectors with an additional payload.
- **Role in BrainVault:** Qdrant is the core of BrainVault's semantic search and Retrieval-Augmented Generation (RAG) capabilities. When text is ingested, it is converted into vector embeddings (using a local Ollama embedding model like `nomic-embed-text`) and stored in Qdrant. This allows the system to find conceptually similar knowledge items even if they don't share exact keywords.
- **Access:** REST API on port `6333`, gRPC on `6334`.

### 4. MinIO (`minio/minio:latest`)
- **What it is:** A high-performance, S3-compatible object storage server.
- **Role in BrainVault:** MinIO acts as our file storage system. Any physical assets associated with your knowledge items—such as downloaded PDF research papers, image attachments, or generated thumbnails for YouTube videos—are stored here. The backend retrieves these files directly from MinIO when requested by the frontend.
- **Access:** S3 API on port `9000`, Console UI on `9001`.

---

## The Infrastructure Flow

Here is how all these components connect to power BrainVault:

1. **Ingestion Request:** The user submits a URL or text via the Next.js frontend. The request is sent to the FastAPI backend.
2. **Task Queuing (Redis):** If the request involves heavy processing (e.g., scraping a GitHub repo or downloading a video transcript), the backend queues a job in **Redis**. A background worker picks it up.
3. **Data Extraction & LLM Processing:** The worker runs the specific LangGraph agent. It uses external LLMs (Groq/Gemini) to summarize and extract knowledge.
4. **File Storage (MinIO):** If the input contains attachments (like a PDF or thumbnail), the agent uploads the binary file to **MinIO** and retrieves an S3 URI.
5. **Relational Storage (Postgres):** The structured metadata (Title, Summary, Tags, MinIO URIs) is saved into the **Postgres** database as a Knowledge Item.
6. **Vectorization (Qdrant):** The extracted text is passed to an embedding model (Ollama) to create a high-dimensional vector. This vector is inserted into **Qdrant**, linked to the Postgres Knowledge Item ID.
7. **Retrieval & RAG:** When the user searches or asks a question in the chat interface, the query is embedded, and **Qdrant** is queried to find the nearest vectors. The backend fetches the full metadata from **Postgres** (and any files from **MinIO**) and returns it to the frontend or feeds it to an LLM to generate an answer.
