"""LangGraph pipeline: wires all nodes into a StateGraph."""

import logging
from langgraph.graph import StateGraph, START, END

from app.graph.state import PipelineState
from app.graph.nodes.query_parser import parse_query
from app.graph.nodes.omophub_retriever import search_omophub, omophub_to_retrieved_codes
from app.graph.nodes.chroma_retriever import retrieve_from_chromadb
from app.graph.nodes.qof_retriever import retrieve_from_qof
from app.graph.nodes.opencodelists_retriever import retrieve_from_opencodelists
from app.graph.nodes.result_merger import merge_and_dedup
from app.graph.nodes.llm_reasoning import score_codes
from app.graph.nodes.output_assembly import assemble_output

logger = logging.getLogger(__name__)


# --- Node wrappers ---

def query_parser_node(state: dict) -> dict:
    """Parse raw query into structured conditions."""
    result = parse_query(state["raw_query"])
    return {"parsed_conditions": result["conditions"]}


def omophub_retriever_node(state: dict) -> dict:
    """Search OMOPHub for each parsed condition."""
    conditions = state.get("parsed_conditions", [])
    all_codes = []

    for condition in conditions:
        name = condition.get("name", "")
        if not name:
            continue

        systems = condition.get("coding_systems", ["SNOMED", "ICD10"])
        vocab_map = {"SNOMED": "SNOMED CT", "ICD10": "ICD-10 (WHO)"}
        vocabs = {k: vocab_map.get(k, k) for k in systems if k in vocab_map}

        df = search_omophub(name, vocabularies=vocabs, page_size=20)
        codes = omophub_to_retrieved_codes(df)
        all_codes.extend(codes)

    return {"retrieved_codes": all_codes, "sources_queried": ["OMOPHub"]}


# --- Graph definition ---

def build_graph() -> StateGraph:
    """Build and return the compiled LangGraph pipeline."""
    graph = StateGraph(PipelineState)

    # add nodes
    graph.add_node("query_parser", query_parser_node)
    graph.add_node("omophub_retriever", omophub_retriever_node)
    graph.add_node("chroma_retriever", retrieve_from_chromadb)
    graph.add_node("qof_retriever", retrieve_from_qof)
    graph.add_node("opencodelists_retriever", retrieve_from_opencodelists)
    graph.add_node("result_merger", merge_and_dedup)
    graph.add_node("llm_reasoning", score_codes)
    graph.add_node("output_assembly", assemble_output)

    # START → query parser
    graph.add_edge(START, "query_parser")

    # query parser → fan-out to all retrievers (parallel)
    graph.add_edge("query_parser", "omophub_retriever")
    graph.add_edge("query_parser", "chroma_retriever")
    graph.add_edge("query_parser", "qof_retriever")
    graph.add_edge("query_parser", "opencodelists_retriever")

    # all retrievers → fan-in to result merger
    graph.add_edge("omophub_retriever", "result_merger")
    graph.add_edge("chroma_retriever", "result_merger")
    graph.add_edge("qof_retriever", "result_merger")
    graph.add_edge("opencodelists_retriever", "result_merger")

    # sequential: merger → reasoning → output → END
    graph.add_edge("result_merger", "llm_reasoning")
    graph.add_edge("llm_reasoning", "output_assembly")
    graph.add_edge("output_assembly", END)

    return graph.compile()


# compiled graph — import this
pipeline = build_graph()


def run_pipeline(query: str) -> dict:
    """Run the full pipeline with a raw query string."""
    logger.info("Running pipeline for: %s", query)
    result = pipeline.invoke({"raw_query": query})
    logger.info("Pipeline complete: %d codes in final list", len(result.get("final_code_list", [])))
    return result
