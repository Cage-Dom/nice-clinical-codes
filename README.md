<p align="center">
  <img src="assets/logo-cam-pace.svg" alt="University of Cambridge" height="70">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/logo-nice.png" alt="NICE" height="60">
</p>

# NICE Clinical Code Discovery - Multi-Agent Agentic AI RAG System

**Live:** [clinicalcodes.uk](https://clinicalcodes.uk)

Agentic AI system that autonomously discovers, enriches, and validates clinical codes (SNOMED CT, ICD-10, OPCS-4) for NICE (National Institute for Health and Care Excellence). Built as a multi-agent RAG pipeline orchestrated by LangGraph, with parallel autonomous retrieval from five NHS data sources, UMLS knowledge graph expansion, and Claude-powered clinical reasoning.

Given a clinical condition (e.g. "type 2 diabetes with hypertension"), the system deploys specialised agents to retrieve candidate codes in parallel, merges and deduplicates across sources, expands coverage via UMLS synonym and hierarchical relationships, then applies LLM-based clinical reasoning to score each code for inclusion/exclusion, delivering a validated code list with full provenance in under 60 seconds.

## Architecture

```
User → Frontend (Next.js)
         │
         ▼  /api/*
       Backend (FastAPI)
         │
         ▼
       LangGraph Pipeline
         │
         ├─→ Query Parser (Claude API)
         │
         ├─→ Retrievers (parallel)
         │     ├── OMOPHub (SNOMED/ICD-10)
         │     ├── QOF Business Rules
         │     ├── OpenCodelists
         │     └── ChromaDB (semantic search)
         │
         ├─→ Result Merger + Dedup
         ├─→ UMLS Enrichment (synonyms, narrower, siblings)
         ├─→ ML Classifier (scikit-learn)
         ├─→ LLM Reasoning (Claude API)
         ├─→ Human Review Gate
         └─→ Output Assembly
```

## Tech Stack

- **Agent Orchestration:** LangGraph (multi-agent StateGraph with parallel fan-out)
- **LLM:** Claude API (Sonnet for query parsing, Haiku for high-throughput scoring)
- **Backend:** Python, FastAPI, async pipeline execution
- **Frontend:** Next.js 16, TypeScript, Tailwind CSS
- **Vector DB:** ChromaDB with PubMedBERT biomedical embeddings
- **Knowledge Graph:** UMLS Metathesaurus (synonym, narrower, sibling expansion)
- **Data Sources:** QOF Business Rules, OpenCodelists, OPCS-4, OMOPHub, UMLS (35K+ codes)
- **Deployment:** AWS ECS Fargate, ECR, ALB, ACM, Route 53. Live at [clinicalcodes.uk](https://clinicalcodes.uk)
- **Cost:** ~$0.03/query (95% reduction from $0.67 through model selection and candidate capping)

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker (optional, for containerised setup)

### Local Setup

1. Clone the repo:

```bash
git clone <repo-url>
cd nice-clinical-codes
```

2. Set up the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

3. Set up the frontend:

```bash
cd frontend
npm install
```

4. Create your `.env` file from the template:

```bash
cp .env.example .env
# Edit .env and add your API keys
```

5. Ingest data (one-time, ~8 minutes):

```bash
cd backend
python -m app.ingestion.run_all --data-dir ../data
```

This populates SQLite and ChromaDB with QOF business rules (23K SNOMED codes), OpenCodelists (681 codes), and OPCS-4 procedures (12K codes).

6. Run both services:

```bash
# Terminal 1: backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: frontend
cd frontend
npm run dev
```

Backend: http://localhost:8000 (API docs at /docs)
Frontend: http://localhost:3000

### Docker Setup

```bash
# Copy env template and add your keys
cp .env.example .env

# Start everything (first build takes ~10 min, data is baked into the image)
docker-compose up --build
```

The Docker build runs data ingestion automatically, no manual step needed. SQLite and ChromaDB databases are embedded in the image.

## Environment Variables

| Variable | Description | Required |
|----------|------------|----------|
| `OMOPHUB_API_KEY` | OMOPHub API key for SNOMED/ICD-10 queries | Yes |
| `UMLS_API_KEY` | UMLS Metathesaurus API key | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Yes |
| `BACKEND_HOST` | Backend bind address | No (default: 0.0.0.0) |
| `BACKEND_PORT` | Backend server port | No (default: 8000) |
| `CORS_ORIGINS` | Allowed CORS origins | No (default: http://localhost:3000) |
| `CHROMA_PERSIST_DIR` | ChromaDB storage path | No (default: ./chromadb_data) |
| `CHROMA_COLLECTION_NAME` | ChromaDB collection name | No (default: clinical_codes) |
| `DATABASE_URL` | SQLite database path | No (default: sqlite:///./data/codes.db) |
| `EMBEDDING_MODEL` | Sentence transformer model | No (default: NeuML/pubmedbert-base-embeddings) |
| `LLM_MODEL` | Claude model ID | No (default: claude-sonnet-4-20250514) |
| `RETRIEVAL_TOP_K` | Max results per retrieval source | No (default: 50) |
| `CONFIDENCE_THRESHOLD` | Min confidence for auto-include | No (default: 0.5) |
| `UMLS_EXPAND` | Enable UMLS enrichment | No (default: yes) |

## Data Sources

| Source | Type | Description |
|--------|------|------------|
| [OMOPHub](https://omophub.com) | API | SNOMED CT and ICD-10 concept search |
| [QOF Business Rules](https://digital.nhs.uk/data-and-information/data-collections-and-data-sets/data-collections/quality-and-outcomes-framework-qof) | Excel | NHS primary care quality indicator code sets |
| [OpenCodelists](https://www.opencodelists.org) | CSV + scraping | Published, peer-reviewed clinical code lists |
| [UMLS Metathesaurus](https://uts.nlm.nih.gov) | API | Concept relationships, synonyms, hierarchies |
| [OPCS-4](https://digital.nhs.uk/data-and-information/information-standards/information-standards-and-data-collections-including-extractions/publications-and-notifications/standards-and-collections/opcs-4) | XML | NHS procedure and operation codes (12K codes) |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routes
│   │   ├── graph/          # LangGraph pipeline
│   │   │   ├── nodes/      # Pipeline nodes (retrievers, reasoning, etc.)
│   │   │   └── state.py    # Typed pipeline state
│   │   ├── db/             # ChromaDB and SQLite
│   │   ├── ingestion/      # Data source parsers
│   │   ├── ml/             # Classifier training and inference
│   │   └── evaluation/     # Metrics (P/R/F1)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js pages
│   │   └── lib/            # API client
│   └── Dockerfile
├── data/
│   ├── raw/                # Source data files (gitignored)
│   └── gold_standard/      # Reference code lists for evaluation
├── notebooks/              # Jupyter notebooks for exploration
├── infra/                  # AWS deployment configs
├── docker-compose.yml
└── .env.example
```

## Team

University of Cambridge Data Science (PACE), developed in collaboration with NICE (National Institute for Health and Care Excellence).

- **Dominic Cage** | Project Lead, Proof-of-concept Engineer | [LinkedIn](https://linkedin.com/in/dominic-cage-41862814b)
- **Carlos Ramirez** | AI Engineering Lead | [LinkedIn](https://www.linkedin.com/in/cramirez2) · [GitHub](https://github.com/carlos-ramblox)
- **Ashley Ramsawhook** | Communications Lead, Data Analysis | [LinkedIn](https://linkedin.com/in/ashley-ramsawhook-b48313339)
- **Zhaoyue Li** | Content Curator, Research | [LinkedIn](https://linkedin.com/in/zhao-yue-l-4013a4175)
- **Ishwarya Thanigaivelan** | Content Curator, Research | [LinkedIn](https://linkedin.com/in/ishwarya-thanigaivelan-11831517)
- **Anna Desalvo** | Evaluation Lead, Data Analysis | [LinkedIn](https://linkedin.com/in/anna-desalvo-data-scientist)
## License

MIT
