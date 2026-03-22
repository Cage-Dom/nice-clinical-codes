import time
import datetime
import logging

import requests
import pandas as pd

from app.config import UMLS_API_KEY

logger = logging.getLogger(__name__)

UMLS_BASE = "https://uts-ws.nlm.nih.gov/rest"
UMLS_SEARCH = f"{UMLS_BASE}/search/current"
UMLS_CONTENT = f"{UMLS_BASE}/content/current"

# RN = narrower (more specific), SIB = sibling (same level)
TARGET_RELATIONS = {"RN", "SIB"}
MAX_PER_RELATION = 10
MAX_SYNONYMS = 10
REQUEST_GAP_SECS = 0.05


class UMLSEnricher:
    """
    Enriches clinical concepts with UMLS-derived suggestions:
    narrower terms, siblings, and synonyms.
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or UMLS_API_KEY
        if not self.api_key:
            raise ValueError("UMLS_API_KEY not set")
        self._cui_cache: dict[str, dict] = {}
        self._rel_cache: dict[str, list] = {}
        self._atom_cache: dict[str, list] = {}

    def enrich(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Takes an OMOPHub results DataFrame, returns a suggestions DataFrame
        with narrower terms, siblings, and synonyms for each concept.
        """
        suggestion_rows = []
        total = len(df)

        for idx, (_, row) in enumerate(df.iterrows()):
            concept_id = row.get("concept_id")
            concept_name = row.get("concept_name", "")
            vocab = row.get("_query_vocabulary", "")

            logger.info("Enriching [%d/%d]: %s", idx + 1, total, concept_name[:60])

            cui, preferred_term = self._normalise(concept_name)
            if not cui:
                logger.debug("No CUI found for: %s", concept_name)
                continue

            logger.debug("CUI: %s | Preferred: %s", cui, preferred_term)

            synonyms = self._get_synonyms(cui)
            relations = self._get_relations(cui)

            queried_at = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds") + "Z"

            for syn in synonyms[:MAX_SYNONYMS]:
                suggestion_rows.append({
                    "source_concept_id": concept_id,
                    "source_concept_name": concept_name,
                    "source_vocabulary": vocab,
                    "umls_cui": cui,
                    "umls_preferred_term": preferred_term,
                    "suggestion_type": "synonym",
                    "suggested_name": syn["name"],
                    "suggested_cui": cui,
                    "suggested_source": syn.get("rootSource", ""),
                    "relation_label": "SY",
                })

            for rel in relations[:MAX_PER_RELATION * len(TARGET_RELATIONS)]:
                rel_label = rel.get("relationLabel", "")
                if rel_label not in TARGET_RELATIONS:
                    continue

                suggestion_rows.append({
                    "source_concept_id": concept_id,
                    "source_concept_name": concept_name,
                    "source_vocabulary": vocab,
                    "umls_cui": cui,
                    "umls_preferred_term": preferred_term,
                    "suggestion_type": _rel_label_to_type(rel_label),
                    "suggested_name": rel.get("relatedIdName", ""),
                    "suggested_cui": _extract_cui(rel.get("relatedId", "")),
                    "suggested_source": rel.get("rootSource", ""),
                    "relation_label": rel_label,
                })

        suggestions_df = pd.DataFrame(suggestion_rows)

        if suggestions_df.empty:
            logger.info("No UMLS suggestions returned")
            return suggestions_df

        suggestions_df.drop_duplicates(
            subset=["source_concept_id", "suggested_name", "relation_label"],
            inplace=True,
        )

        logger.info(
            "Enrichment complete: %d suggestions for %d concepts",
            len(suggestions_df),
            suggestions_df["source_concept_id"].nunique(),
        )
        return suggestions_df

    def _get(self, url: str, params: dict) -> dict | None:
        """GET with API key injection, error handling, and rate limiting."""
        params["apiKey"] = self.api_key
        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            time.sleep(REQUEST_GAP_SECS)
            return resp.json()
        except requests.HTTPError:
            if resp.status_code == 404:
                return None
            logger.warning("UMLS HTTP %d for %s", resp.status_code, url)
            return None
        except Exception as exc:
            logger.warning("UMLS request failed: %s", exc)
            return None

    def _normalise(self, concept_name: str) -> tuple[str, str]:
        """Search UMLS for a concept name, return (CUI, preferred_term)."""
        if concept_name in self._cui_cache:
            cached = self._cui_cache[concept_name]
            return cached["cui"], cached["preferred_term"]

        data = self._get(UMLS_SEARCH, {
            "string": concept_name,
            "searchType": "normalizedString",
            "pageSize": 1,
        })

        if not data:
            return "", ""

        results = data.get("result", {}).get("results", [])
        if not results or results[0].get("ui") == "NONE":
            # fall back to words search
            data = self._get(UMLS_SEARCH, {
                "string": concept_name,
                "searchType": "words",
                "pageSize": 1,
            })
            results = (data or {}).get("result", {}).get("results", [])

        if not results or results[0].get("ui") == "NONE":
            self._cui_cache[concept_name] = {"cui": "", "preferred_term": ""}
            return "", ""

        top = results[0]
        cui = top.get("ui", "")
        name = top.get("name", "")
        self._cui_cache[concept_name] = {"cui": cui, "preferred_term": name}
        return cui, name

    def _get_synonyms(self, cui: str) -> list[dict]:
        """Fetch atoms for a CUI — different string names are synonyms."""
        if cui in self._atom_cache:
            return self._atom_cache[cui]

        data = self._get(f"{UMLS_CONTENT}/CUI/{cui}/atoms", {
            "pageSize": 50,
            "language": "ENG",
        })

        if not data:
            self._atom_cache[cui] = []
            return []

        atoms = data.get("result", [])
        seen: set[str] = set()
        syns = []
        for atom in atoms:
            name = atom.get("name", "").strip()
            if name and name not in seen:
                seen.add(name)
                syns.append({
                    "name": name,
                    "rootSource": atom.get("rootSource", ""),
                })

        self._atom_cache[cui] = syns
        return syns

    def _get_relations(self, cui: str) -> list[dict]:
        """Fetch relations for a CUI, filtering out suppressed/obsolete."""
        if cui in self._rel_cache:
            return self._rel_cache[cui]

        data = self._get(f"{UMLS_CONTENT}/CUI/{cui}/relations", {
            "pageSize": 200,
        })

        if not data:
            self._rel_cache[cui] = []
            return []

        relations = [
            r for r in data.get("result", [])
            if not r.get("suppressible") and not r.get("obsolete")
        ]

        self._rel_cache[cui] = relations
        return relations


def _rel_label_to_type(label: str) -> str:
    return {"RN": "narrower", "SIB": "sibling", "SY": "synonym"}.get(label, label.lower())


def _extract_cui(uri: str) -> str:
    """Pull CUI from a UMLS URI like .../CUI/C0011849"""
    if not uri:
        return ""
    parts = uri.rstrip("/").split("/")
    for part in reversed(parts):
        if part.startswith("C") and part[1:].isdigit():
            return part
    return parts[-1] if parts else ""


def enrich_codes(omophub_df: pd.DataFrame, api_key: str | None = None) -> pd.DataFrame:
    """Standalone entry point for enriching OMOPHub results."""
    enricher = UMLSEnricher(api_key=api_key)
    return enricher.enrich(omophub_df)
