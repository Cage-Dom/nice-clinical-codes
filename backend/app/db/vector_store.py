import logging

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from app.config import CHROMA_PERSIST_DIR, CHROMA_COLLECTION_NAME, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None


def get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        logger.info("ChromaDB client initialized at %s", CHROMA_PERSIST_DIR)
    return _client


def get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = get_client()
        ef = SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL)
        _collection = client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "Collection '%s' ready (%d documents, model: %s)",
            CHROMA_COLLECTION_NAME,
            _collection.count(),
            EMBEDDING_MODEL,
        )
    return _collection


def add_codes(codes: list[dict]) -> int:
    """
    Add clinical code records to the vector store.
    Each code dict should have: code, term, vocabulary, source, domain.
    Returns number of codes added.
    """
    if not codes:
        return 0

    collection = get_collection()

    # dedup by ID within this batch (ChromaDB rejects duplicate IDs in a single call)
    seen: dict[str, int] = {}
    ids = []
    documents = []
    metadatas = []

    for c in codes:
        doc_id = f"{c['vocabulary']}:{c['code']}"
        if doc_id in seen:
            continue
        seen[doc_id] = 1
        ids.append(doc_id)
        documents.append(c.get("term", ""))
        metadatas.append({
            "code": c.get("code", ""),
            "vocabulary": c.get("vocabulary", ""),
            "source": c.get("source", ""),
            "domain": c.get("domain", ""),
        })

    # batch in chunks of 5000 to avoid memory issues
    BATCH = 5000
    for i in range(0, len(ids), BATCH):
        collection.upsert(
            ids=ids[i:i + BATCH],
            documents=documents[i:i + BATCH],
            metadatas=metadatas[i:i + BATCH],
        )

    logger.info("Upserted %d codes into ChromaDB", len(ids))
    return len(ids)


def search(query: str, top_k: int = 50, vocabulary: str | None = None) -> list[dict]:
    """
    Semantic search for clinical codes matching a query.
    Returns list of dicts with code, term, vocabulary, source, domain, similarity_score.
    """
    collection = get_collection()

    where = {"vocabulary": vocabulary} if vocabulary else None

    results = collection.query(
        query_texts=[query],
        n_results=top_k,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    codes = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        distance = results["distances"][0][i]
        # chromadb cosine distance: 0 = identical, 2 = opposite
        similarity = 1.0 - (distance / 2.0)

        codes.append({
            "code": meta.get("code", ""),
            "term": results["documents"][0][i],
            "vocabulary": meta.get("vocabulary", ""),
            "source": meta.get("source", "ChromaDB"),
            "domain": meta.get("domain", ""),
            "similarity_score": round(similarity, 4),
            "usage_frequency": None,
        })

    logger.info("Search '%s' returned %d results", query[:40], len(codes))
    return codes
