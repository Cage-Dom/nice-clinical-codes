import asyncio
import csv
import io
import logging
import time
import uuid

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.graph.graph import run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

# in-memory result cache (search_id → results list)
_result_cache: dict[str, list[dict]] = {}
MAX_CACHE = 100


# Request / Response schemas

class SearchRequest(BaseModel):
    query: str = Field(
        ...,
        description="Clinical condition query, e.g. 'type 2 diabetes with hypertension'",
        min_length=2,
        max_length=500,
    )


class CodeResult(BaseModel):
    code: str
    term: str
    vocabulary: str
    decision: str  # include, exclude, uncertain
    confidence: float
    rationale: str
    sources: list[str]
    usage_frequency: int | None = None
    classifier_score: float | None = None


class SearchResponse(BaseModel):
    search_id: str
    query: str
    conditions_parsed: list[dict]
    results: list[CodeResult]
    summary: dict
    provenance_trail: list[dict]
    elapsed_seconds: float


# Endpoints

@router.post("/search", response_model=SearchResponse)
async def search_codes(request: SearchRequest):
    """Search for clinical codes matching a condition query."""
    t0 = time.time()

    try:
        result = await asyncio.to_thread(run_pipeline, request.query)
    except Exception as exc:
        logger.error("Pipeline failed: %s", exc)
        raise HTTPException(status_code=500, detail="Pipeline processing failed")

    elapsed = round(time.time() - t0, 2)
    final_codes = result.get("final_code_list", [])

    search_id = uuid.uuid4().hex[:12]
    if len(_result_cache) >= MAX_CACHE:
        _result_cache.pop(next(iter(_result_cache)))
    _result_cache[search_id] = final_codes

    return SearchResponse(
        search_id=search_id,
        query=request.query,
        conditions_parsed=result.get("parsed_conditions", []),
        results=[
            CodeResult(
                code=c["code"],
                term=c["term"],
                vocabulary=c["vocabulary"],
                decision=c["decision"],
                confidence=c["confidence"],
                rationale=c["rationale"],
                sources=c.get("sources", []),
                usage_frequency=c.get("usage_frequency"),
                classifier_score=c.get("classifier_score"),
            )
            for c in final_codes
        ],
        summary=result.get("summary", {}),
        provenance_trail=result.get("provenance_trail", []),
        elapsed_seconds=elapsed,
    )


@router.get("/export/{search_id}")
async def export_codes(search_id: str, output_format: str = "csv"):
    """Export a code list as CSV or Excel."""
    if output_format not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="output_format must be 'csv' or 'xlsx'")

    codes = _result_cache.get(search_id)
    if codes is None:
        raise HTTPException(status_code=404, detail="Search result not found")

    export_fields = ["code", "term", "vocabulary", "decision", "confidence", "rationale", "sources"]

    rows = []
    for c in codes:
        row = {f: c.get(f, "") for f in export_fields}
        row["sources"] = ", ".join(row["sources"]) if isinstance(row["sources"], list) else row["sources"]
        rows.append(row)

    if output_format == "xlsx":
        df = pd.DataFrame(rows)
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine="openpyxl")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=codelist_{search_id}.xlsx"},
        )

    # default: CSV
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=export_fields)
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=codelist_{search_id}.csv"},
    )


class ReviewRequest(BaseModel):
    search_id: str
    decisions: dict[str, str] = Field(
        ...,
        description="Map of code -> decision (include/exclude) for uncertain codes",
    )


@router.post("/review")
async def review_codes(request: ReviewRequest):
    """Submit human review decisions for uncertain codes."""
    # TODO: human-in-the-loop resume (NICE-033)
    raise HTTPException(status_code=501, detail="Not implemented yet")
