import datetime
import logging

logger = logging.getLogger(__name__)


def assemble_output(state: dict) -> dict:
    """
    LangGraph node: structure the final output from scored codes.
    Sorts by confidence, builds summary stats and provenance trail.
    """
    scored = state.get("scored_codes", [])
    run_ts = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds") + "Z"

    # sort: included first, then by confidence descending
    order = {"include": 0, "uncertain": 1, "exclude": 2}
    final = sorted(
        scored,
        key=lambda x: (order.get(x["decision"], 3), -x.get("confidence", 0)),
    )

    included = [c for c in final if c["decision"] == "include"]
    excluded = [c for c in final if c["decision"] == "exclude"]
    uncertain = [c for c in final if c["decision"] == "uncertain"]

    summary = {
        "total_candidates": len(final),
        "included": len(included),
        "excluded": len(excluded),
        "uncertain": len(uncertain),
        "sources_queried": state.get("sources_queried", []),
    }

    provenance = [
        {
            "code": c["code"],
            "source": ", ".join(c.get("sources", [])),
            "source_url": None,
            "retrieved_at": run_ts,
            "enrichment_path": None,
        }
        for c in final
    ]

    logger.info(
        "Output: %d codes (%d include, %d exclude, %d uncertain)",
        len(final), len(included), len(excluded), len(uncertain),
    )

    return {
        "final_code_list": final,
        "provenance_trail": provenance,
        "summary": summary,
    }
