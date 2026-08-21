# Use the official Playwright image which has Python and all browser dependencies pre-installed
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

# Install libpq-dev for psycopg2
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the actual backend source code into the container!
COPY . /app/backend

# Browsers are already installed in this base image, so we just set the default command
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
