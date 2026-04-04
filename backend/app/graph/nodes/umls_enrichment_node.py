"""LangGraph node wrapper for UMLS enrichment."""

import logging
import pandas as pd

from app.config import UMLS_API_KEY, UMLS_EXPAND
from app.graph.nodes.umls_enrichment import UMLSEnricher

logger = logging.getLogger(__name__)


def enrich_with_umls(state: dict) -> dict:
    """
    LangGraph node: expand enriched codes with UMLS synonyms,
    narrower terms, and siblings. Passes through unchanged if
    UMLS_EXPAND is disabled or API key is missing.
    """
    codes = state.get("enriched_codes", [])

    if not UMLS_EXPAND:
        logger.info("UMLS enrichment disabled, passing through")
        return {}

    if not UMLS_API_KEY:
        logger.warning("UMLS_API_KEY not set, skipping enrichment")
        return {}

    if not codes:
        return {}

    # build a DataFrame that UMLSEnricher expects
    rows = []
    for c in codes:
        rows.append({
            "concept_id": c.get("code", ""),
            "concept_name": c.get("term", ""),
            "_query_vocabulary": c.get("vocabulary", ""),
        })

    df = pd.DataFrame(rows)

    try:
        enricher = UMLSEnricher()
        suggestions = enricher.enrich(df)
    except Exception as exc:
        logger.error("UMLS enrichment failed: %s", exc)
        return {"errors": [f"UMLS enrichment failed: {exc}"]}

    if suggestions.empty:
        logger.info("UMLS: no new suggestions found")
        return {}

    # add new codes from suggestions back into enriched_codes
    existing_keys = {(c["code"], c["vocabulary"]) for c in codes}
    new_codes = []

    for _, row in suggestions.iterrows():
        # suggestions don't have a SNOMED code directly, but have a name + CUI
        # we add them as "UMLS suggestion" entries for the LLM to evaluate
        suggested_name = row.get("suggested_name", "")
        suggested_cui = row.get("suggested_cui", "")
        suggestion_type = row.get("suggestion_type", "")

        if not suggested_name:
            continue

        key = (suggested_cui, "UMLS")
        if key in existing_keys:
            continue
        existing_keys.add(key)

        new_codes.append({
            "code": suggested_cui,
            "term": suggested_name,
            "vocabulary": row.get("source_vocabulary", "SNOMED CT"),
            "source": f"UMLS ({suggestion_type})",
            "sources": [f"UMLS ({suggestion_type})"],
            "source_count": 1,
            "domain": "Condition",
            "similarity_score": None,
            "usage_frequency": None,
        })

    if new_codes:
        updated = codes + new_codes
        logger.info("UMLS: added %d new codes (%d total)", len(new_codes), len(updated))
        return {"enriched_codes": updated}

    logger.info("UMLS: all suggestions already in code list")
    return {}
