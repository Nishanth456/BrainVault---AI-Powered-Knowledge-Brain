# BrainVault Deployment Plan (Oracle Cloud VPS)

Since the BrainVault architecture relies on 7+ interconnected services running synchronously, the most robust and entirely free method to host this is on a single Virtual Private Server (VPS) using Docker Compose.

## 1. The Platform: Oracle Cloud (Always Free)

Oracle Cloud offers an incredibly generous "Always Free" tier that outclasses all other cloud providers:
- **Compute:** Up to 4 ARM Processors (Ampere A1).
- **Memory:** 24GB RAM.
- **Storage:** 200GB Block Storage.

This is more than enough memory and processing power to run all of BrainVault's containers (Postgres, Qdrant, MinIO, Redis, Next.js, FastAPI, Celery, and Ollama) simultaneously without them ever going to sleep.

## 2. A-Z Deployment Steps

### Step 1: Claim Your Server
1. Go to Oracle Cloud and sign up for an account.
2. Create a new Compute Instance.
3. For the image, select **Ubuntu**.
4. For the shape, select **Ampere A1** (ARM) and drag the sliders to **4 OCPUs** and **24GB RAM**.
5. Download your SSH keys and create the instance.

### Step 2: Server Preparation
1. SSH into your new server using your terminal: `ssh -i <your-key.pem> ubuntu@<your-server-ip>`
2. Install Docker and Docker Compose on the Ubuntu server.
3. Clone your repository: 
   ```bash
   git clone https://github.com/Nishanth456/BrainVault---AI-Powered-Knowledge-Brain.git
   cd BrainVault---AI-Powered-Knowledge-Brain
   ```

### Step 3: Add Ollama to Docker Compose
Currently, Ollama runs on your local Windows machine. To ensure Semantic Search works on the cloud server, we must add Ollama to our `docker-compose.yml`. 

Add this service to your `docker-compose.yml` on the server:
```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: brainvault-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
```
*(You will also need to add `ollama_data:` to the `volumes:` section at the bottom).*

Update the `.env` file so the backend points to this new container:
`OLLAMA_BASE_URL=http://ollama:11434`

### Step 4: Environment Variables
Create a `.env` file in the root of the project on the server and add your LLM keys and Server IP:
```env
GROQ_API_KEY=your_key
GEMINI_API_KEY=your_key
OPENROUTER_API_KEYS=your_key
LINKEDIN_EMAIL=your_email@example.com
LINKEDIN_PASSWORD=your_password

# CRITICAL: Replace with your actual Oracle Cloud public IP address!
FRONTEND_URL=http://<your-server-ip>:3000
NEXT_PUBLIC_API_URL=http://<your-server-ip>:8000
```

### Step 5: Build and Launch
1. Run the build command:
   ```bash
   docker-compose up -d --build
   ```
2. Once the containers are running, you need to pull the embedding model into the Ollama container:
   ```bash
   docker exec -it brainvault-ollama ollama pull nomic-embed-text
   ```

### Step 6: Accessing Your App
- Open your Oracle Cloud Dashboard, go to your Virtual Cloud Network (VCN), and open **Port 3000** (Frontend) and **Port 8000** (Backend API) in your Ingress Rules to allow web traffic.
- Open your mobile phone's browser and go to `http://<your-server-ip>:3000`. 
- Your BrainVault is now live and accessible from any network globally!
