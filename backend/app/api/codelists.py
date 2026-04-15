"""
HITL codelist endpoints.

A "codelist" is the persistent, versioned, auditable artefact NICE needs:
a draft starts as the AI pipeline's output, a clinician reviews and
optionally overrides each decision, and the approved list carries a
SHA-256 signature and a full audit log so the artefact can be defended.

Auth is required on every endpoint — the reviewer's identity must be
recorded for EU AI Act / GDPR Article 22 compliance on human oversight.
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import get_current_user
from app.api import _search_cache
from app.db import hitl_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/codelists", tags=["codelists"])


# --- request / response models ---------------------------------------------

class CreateCodelistRequest(BaseModel):
    search_id: str = Field(..., description="search_id returned by POST /api/search")
    name: str = Field(..., min_length=1, max_length=200)


class DecisionUpdate(BaseModel):
    id: int
    human_decision: Literal["include", "exclude", "uncertain"]
    override_comment: Optional[str] = None


class ReviewRequest(BaseModel):
    decisions: list[DecisionUpdate]
    action: Literal["approve", "reject"]
    notes: Optional[str] = None


# --- list / read ------------------------------------------------------------

@router.get("")
async def list_codelists(
    status: Optional[str] = None,
    mine: bool = False,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    """
    List codelists. status filters by draft|in_review|approved|rejected.
    mine=true restricts to the caller's own drafts. limit caps the result
    set for bounded payloads at demo scale.
    """
    limit = max(1, min(limit, 500))
    user_id = user["id"] if mine else None
    rows = hitl_store.list_codelists(user_id=user_id, status=status)
    return rows[:limit]


@router.get("/{codelist_id}")
async def get_codelist(codelist_id: str, user: dict = Depends(get_current_user)):
    cl = hitl_store.get_codelist(codelist_id)
    if cl is None:
        raise HTTPException(status_code=404, detail="Codelist not found")
    return cl


@router.get("/{codelist_id}/audit")
async def get_audit(codelist_id: str, user: dict = Depends(get_current_user)):
    if hitl_store.get_codelist(codelist_id) is None:
        raise HTTPException(status_code=404, detail="Codelist not found")
    return hitl_store.get_audit(codelist_id)


# --- create from search result ---------------------------------------------

@router.post("", status_code=201)
async def create_codelist(body: CreateCodelistRequest, user: dict = Depends(get_current_user)):
    """
    Persist a /api/search result as a draft codelist owned by the current user.
    Pulls the codes from the in-memory search cache by search_id.
    """
    entry = _search_cache.get(body.search_id)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail="Search result not found or expired. Re-run the search.",
        )

    cid = hitl_store.create_codelist(
        name=body.name.strip(),
        query=entry["query"],
        created_by=user["id"],
        decisions=entry["codes"],
    )
    # log user_id only — names are PII, don't ship them to stdout in prod
    logger.info("codelist %s created by user_id=%d (%d codes)", cid, user["id"], len(entry["codes"]))
    return hitl_store.get_codelist(cid)


# --- review ----------------------------------------------------------------

@router.post("/{codelist_id}/review")
async def review_codelist(
    codelist_id: str,
    body: ReviewRequest,
    user: dict = Depends(get_current_user),
):
    """
    Apply reviewer decisions, flip status to approved/rejected, record
    overrides in the audit log and compute a signature hash on approval.
    """
    cl = hitl_store.get_codelist(codelist_id)
    if cl is None:
        raise HTTPException(status_code=404, detail="Codelist not found")
    if cl["status"] not in ("draft", "in_review"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot review a codelist in status '{cl['status']}'",
        )

    # enforce: every override carries a non-empty comment
    decision_by_id = {d["id"]: d for d in cl["decisions"]}
    for update in body.decisions:
        ai = decision_by_id.get(update.id)
        if ai is None:
            raise HTTPException(
                status_code=400,
                detail=f"Decision id {update.id} not part of codelist {codelist_id}",
            )
        if ai["ai_decision"] != update.human_decision:
            if not update.override_comment or len(update.override_comment.strip()) < 5:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Override on code {ai['code']} requires an override_comment "
                        "of at least 5 characters"
                    ),
                )

    result = hitl_store.submit_review(
        cid=codelist_id,
        reviewer_id=user["id"],
        decisions=[d.model_dump() for d in body.decisions],
        action=body.action,
        notes=body.notes,
    )
    return {
        "codelist_id": codelist_id,
        **result,
        "reviewed_by": user["name"],
    }
