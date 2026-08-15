# The Ultimate Step-by-Step Oracle Cloud Deployment Guide

This guide will walk you through deploying your BrainVault instance onto an **Oracle Cloud Always Free** Virtual Private Server (VPS). We will go step-by-step, starting from creating your account all the way to opening the app on your phone.

---

## Phase 1: Claiming Your Server

Oracle offers an extremely generous "Always Free" tier. You will be claiming an **Ampere A1 (ARM)** instance with 4 CPU cores and 24GB of RAM—plenty of power to run your entire Docker Compose stack.

1. **Sign Up:** Go to [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) and sign up. You will need a credit card for verification, but you will **not** be charged as long as you stick to the "Always Free" resources.
2. **Create a VM Instance:** Once logged into your dashboard, click **"Create a VM instance"**. Oracle now uses a step-by-step wizard to set this up.
3. **Step 1: Basic Information**
   - Under "Image and shape", click **"Edit"**, then click **"Change image"**. Select **Ubuntu** (e.g., 22.04 or 24.04).
   - Click **"Change shape"**, select **"Virtual machine"** -> **"Ampere"** -> **"VM.Standard.A1.Flex"**.
   - Drag the OCPU slider to **4** and the Memory (GB) slider to **24**, then click **"Select shape"**.
   - Click "Next" to proceed.
4. **Step 2: Security**
   - You can safely ignore this tab. Leave both "Shielded instance" and "Confidential computing" turned off and click "Next".
5. **Step 3: Networking & SSH Keys (CRITICAL)**
   - Under **Primary network**, select the **"Create new virtual cloud network"** radio button. (You can leave the auto-generated VCN name as-is).
   - Under **Subnet**, select the **"Create new public subnet"** radio button. (You can leave the auto-generated Subnet name as-is).
   - For **Private IPv4 address assignment**, leave it as "Automatically assign private IPv4 address".
   - For **Public IPv4 address assignment**, ensure the toggle for **"Automatically assign public IPv4 address"** is turned **ON**.
   - Leave the IPv6 toggle OFF.
   - **CRITICAL STEP:** Scroll down and expand the **"Advanced options"** section at the bottom. Under **"Add SSH keys"**, select the **"Generate a key pair for me"** radio button.
   - Click the **"Download private key"** button (it will save as a `.key` file). **Do not lose this file**, you cannot connect to your server without it!
   - Click "Next".
6. **Step 4: Storage**
   - You can leave everything as the default here (it will provide 50GB of block storage, which is perfectly fine).
   - Click "Next" to review.
7. **Create:** On the Review page, scroll to the bottom and click **"Create"**. 
8. **Wait for Provisioning:** It will take a minute or two. Once the square turns green and says "RUNNING", note down your **Public IP Address** displayed on the right side of the screen.

---

## Phase 2: Opening the Network Ports (Ingress Rules)

By default, Oracle Cloud firewalls block all traffic except SSH (Port 22). Since your frontend is on Port `3000` and backend API is on Port `8000`, we need to open those.

1. On your instance details page, look at the **"Primary VNIC"** section.
2. Click on the link next to **"Subnet"** (it usually looks like `Public Subnet-xyz`).
3. Click on the **Default Security List** (e.g., `Default Security List for vcn-xyz`).
4. Click **"Add Ingress Rules"**.
5. Fill out the rule as follows:
   - **Source Type:** CIDR
   - **Source CIDR:** `0.0.0.0/0` (This means traffic from anywhere)
   - **IP Protocol:** TCP
   - **Destination Port Range:** `3000, 8000`
   - **Description:** `BrainVault Web Traffic`
6. Click **"Add Ingress Rules"**.

---

## Phase 3: Connecting to Your Server (SSH)

Now we will connect to the server from your local Windows machine using the SSH key you downloaded.

1. Open **PowerShell** on your Windows machine.
2. Navigate to the folder where you saved your private key. For example:
   ```bash
   cd C:\Users\nisha\Downloads
   ```
3. Secure the key permissions (Windows requires this, otherwise SSH rejects the key for being "too open"):
   ```bash
   icacls .\your-private-key.key /inheritance:r
   icacls .\your-private-key.key /grant:r "$($env:USERNAME):(R)"
   ```
4. SSH into the server using the **Public IP Address** you noted down earlier (the default username for Ubuntu images is `ubuntu`):
   ```bash
   ssh -i .\your-private-key.key ubuntu@<YOUR_PUBLIC_IP>
   ```
5. Type `yes` when asked if you want to continue connecting. You are now inside your cloud server!

---

## Phase 4: Installing Dependencies & Cloning the Repo

Now that you are inside the Ubuntu server terminal, run these commands step-by-step.

1. **Update packages:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. **Install Docker:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```
3. **Give your user permission to run Docker:**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```
4. **Install Docker Compose:**
   ```bash
   sudo apt install docker-compose-plugin -y
   ```
5. **Clone your BrainVault repository:**
   ```bash
   git clone https://github.com/Nishanth456/BrainVault---AI-Powered-Knowledge-Brain.git
   cd BrainVault---AI-Powered-Knowledge-Brain
   ```

---

## Phase 5: Configuring Production Files

You are now in your BrainVault directory on the server. We need to make sure the environment variables and Docker configuration are set up for production.

1. **Edit the `docker-compose.yml` file:**
   Because Ollama is running on your local Windows machine right now, we need to add it to the server's docker-compose stack so it runs in the cloud.
   Open the file in the `nano` text editor:
   ```bash
   nano docker-compose.yml
   ```
   Scroll to the very bottom and add the `ollama` service, and append `ollama_data:` to the volumes list. The bottom of your file should look exactly like this:
   ```yaml
     ollama:
       image: ollama/ollama:latest
       container_name: brainvault-ollama
       restart: unless-stopped
       ports:
         - "11434:11434"
       volumes:
         - ollama_data:/root/.ollama
   
   volumes:
     postgres_data:
     qdrant_storage:
     minio_data:
     ollama_data:
   ```
   *(To save and exit nano: press `Ctrl + O`, then `Enter`, then `Ctrl + X`)*.

2. **Create your `.env` file:**
   We need to set your API keys and the Server IP.
   ```bash
   nano backend/.env
   ```
   Paste the following into the file, **making sure to replace `<YOUR_PUBLIC_IP>` with your actual Oracle Cloud IP address**, and adding your actual API keys:
   ```env
   GROQ_API_KEY=your_key_here
   GEMINI_API_KEY=your_key_here
   OPENROUTER_API_KEYS=your_key_here
   LINKEDIN_EMAIL=your_email@example.com
   LINKEDIN_PASSWORD=your_password
   
   FRONTEND_URL=http://<YOUR_PUBLIC_IP>:3000
   NEXT_PUBLIC_API_URL=http://<YOUR_PUBLIC_IP>:8000
   OLLAMA_BASE_URL=http://ollama:11434
   ```
   *(Save and exit nano: `Ctrl + O` -> `Enter` -> `Ctrl + X`)*.

---

## Phase 6: Building and Launching

Everything is configured! It is time to start the engine.

1. **Build and start the Docker Compose stack:**
   ```bash
   docker compose up -d --build
   ```
   *(This step will take a few minutes as it downloads all the images and compiles the Next.js frontend.)*

2. **Check that everything is running:**
   ```bash
   docker compose ps
   ```
   You should see `postgres`, `qdrant`, `minio`, `redis`, `backend`, `frontend`, `celery`, and `ollama` all listed as "Up".

3. **Pull the semantic search embedding model:**
   Because semantic search requires the `nomic-embed-text` model, we need to tell our new Ollama container to download it.
   ```bash
   docker exec -it brainvault-ollama ollama pull nomic-embed-text
   ```
   *(Wait for the download to hit 100% and say "success")*.

---

## Phase 7: Opening UFW Firewall (Ubuntu specific)

Even though we opened the ports on the Oracle Cloud dashboard (Phase 2), Ubuntu has an internal firewall called UFW that might also block the ports. Let's force them open just in case.

1. Run these commands:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
   sudo netfilter-persistent save
   ```

---

## 🎉 You're Done!

Take out your phone, or open a new tab on your Windows machine, and type in:
**`http://<YOUR_PUBLIC_IP>:3000`**

Your BrainVault instance is now live, accessible from anywhere in the world, running 24/7 on an incredibly powerful free server!
