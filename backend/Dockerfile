FROM python:3.12-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Ingestion stage: build SQLite + ChromaDB from source data ---
FROM base AS ingest

WORKDIR /app

COPY backend/app/ app/
COPY data/raw/ data/raw/
COPY data/opcs/ data/opcs/

RUN python -m app.ingestion.run_all --data-dir data

# --- Runtime stage ---
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=base /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=base /usr/local/bin/uvicorn /usr/local/bin/uvicorn

COPY --chown=app:app backend/app/ app/

# Pre-built databases from ingestion stage
COPY --from=ingest --chown=app:app /app/data/codes.db data/codes.db
COPY --from=ingest --chown=app:app /app/chromadb_data/ chromadb_data/

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
