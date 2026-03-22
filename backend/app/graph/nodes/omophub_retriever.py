import datetime
import logging

import pandas as pd
from omophub import OMOPHub

from app.config import (
    OMOPHUB_API_KEY,
    OMOPHUB_PAGE_SIZE,
    OMOPHUB_VOCABULARIES,
)

logger = logging.getLogger(__name__)


def query_vocabulary(
    client: OMOPHub,
    search_term: str,
    vocab_id: str,
    page_size: int = 20,
    domain_id: str | None = None,
) -> list[dict]:
    """Query a single vocabulary and return annotated result dicts."""
    kwargs = dict(vocabulary_ids=[vocab_id], page_size=page_size)
    if domain_id:
        kwargs["domain_ids"] = [domain_id]

    try:
        response = client.search.basic(search_term, **kwargs)
        raw = response if isinstance(response, list) else response.get("data", response)
    except Exception as exc:
        logger.warning("OMOPHub query failed for %s: %s", vocab_id, exc)
        return []

    query_ts = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds") + "Z"
    annotated = []
    for record in raw:
        row = dict(record)
        row["_query_term"] = search_term
        row["_query_vocabulary"] = vocab_id
        row["_vocabulary_label"] = OMOPHUB_VOCABULARIES.get(vocab_id, vocab_id)
        row["_query_domain"] = domain_id or "all"
        row["_queried_at_utc"] = query_ts
        row["_source"] = "OMOPHub"
        annotated.append(row)

    return annotated


def search_omophub(
    search_term: str,
    vocabularies: dict[str, str] | None = None,
    page_size: int | None = None,
    domain_id: str | None = None,
) -> pd.DataFrame:
    """
    Search OMOPHub for clinical codes across specified vocabularies.
    Returns a DataFrame with all results and metadata columns.
    """
    if not OMOPHUB_API_KEY:
        raise ValueError("OMOPHUB_API_KEY not set")

    vocabs = vocabularies or OMOPHUB_VOCABULARIES
    ps = page_size or OMOPHUB_PAGE_SIZE

    client = OMOPHub(api_key=OMOPHUB_API_KEY)
    all_results: list[dict] = []

    for vocab_id in vocabs:
        rows = query_vocabulary(client, search_term, vocab_id, ps, domain_id)
        all_results.extend(rows)

    if not all_results:
        return pd.DataFrame()

    return pd.DataFrame(all_results)


def omophub_to_retrieved_codes(df: pd.DataFrame) -> list[dict]:
    """Convert OMOPHub DataFrame rows to RetrievedCode dicts for the pipeline."""
    return [
        {
            "code": str(row.get("concept_code", row.get("concept_id", ""))),
            "term": row.get("concept_name", ""),
            "vocabulary": row.get("_vocabulary_label", row.get("_query_vocabulary", "")),
            "source": "OMOPHub",
            "domain": row.get("domain_id", "Unknown"),
            "similarity_score": None,
            "usage_frequency": None,
        }
        for row in df.to_dict(orient="records")
    ]
