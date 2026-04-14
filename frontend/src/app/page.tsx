"use client";

import { useState, useEffect, useMemo } from "react";
import { searchCodes, exportCodes } from "@/lib/api";
import type { CodeResult, SearchResponse } from "@/lib/api";

const PAGE_SIZE = 20;

const LOADING_STEPS = [
  { label: "Parsing your query...", delay: 0 },
  { label: "Searching OMOPHub for SNOMED and ICD-10 codes...", delay: 3000 },
  { label: "Querying QOF business rules...", delay: 6000 },
  { label: "Checking published code lists on OpenCodelists...", delay: 9000 },
  { label: "Running semantic search across embedded codes...", delay: 12000 },
  { label: "Merging and deduplicating results...", delay: 18000 },
  { label: "Scoring codes with AI reasoning...", delay: 22000 },
  { label: "Almost done — assembling final results...", delay: 35000 },
];

function DecisionBadge({ decision }: { decision: string }) {
  const config = {
    include: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300", icon: "✓", label: "Included" },
    exclude: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", icon: "✕", label: "Excluded" },
    uncertain: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", icon: "?", label: "Review" },
  }[decision] || { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300", icon: "—", label: decision };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <span className="text-[10px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function LoadingProgress() {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);
      const nextStep = LOADING_STEPS.findLastIndex((s) => ms >= s.delay);
      if (nextStep >= 0) setStep(nextStep);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const progress = Math.min((elapsed / 42000) * 100, 95);

  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="flex flex-col items-center gap-6">
        <div className="h-10 w-10 border-4 border-[#005EA5] border-t-transparent rounded-full animate-spin" />

        <p className="text-gray-700 text-sm font-medium text-center">
          {LOADING_STEPS[step].label}
        </p>

        <div className="w-full bg-gray-200 h-2 overflow-hidden">
          <div
            className="h-full bg-[#005EA5] transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{Math.floor(elapsed / 1000)}s elapsed</span>
          <span>Step {step + 1} of {LOADING_STEPS.length}</span>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          {LOADING_STEPS.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 w-8 transition-colors duration-300 ${
                i <= step ? "bg-[#005EA5]" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DecisionFilter({
  filter,
  onChange,
  counts,
}: {
  filter: string;
  onChange: (f: string) => void;
  counts: { include: number; exclude: number; uncertain: number; all: number };
}) {
  const tabs = [
    { key: "all", label: "All", count: counts.all, color: "text-gray-700" },
    { key: "include", label: "Included", count: counts.include, color: "text-green-700" },
    { key: "exclude", label: "Excluded", count: counts.exclude, color: "text-red-700" },
    { key: "uncertain", label: "Review", count: counts.uncertain, color: "text-amber-700" },
  ];

  return (
    <div className="flex gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            filter === t.key
              ? "bg-[#005EA5] text-white"
              : `bg-gray-100 ${t.color} hover:bg-gray-200`
          }`}
        >
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [selectedCode, setSelectedCode] = useState<CodeResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [decisionFilter, setDecisionFilter] = useState("all");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setSelectedCode(null);
    setPage(1);
    setDecisionFilter("all");

    try {
      const data = await searchCodes(query);
      setResponse(data);
      if (data.results.length > 0) {
        setSelectedCode(data.results[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!response?.search_id || exporting) return;
    setExporting(true);
    try {
      const blob = await exportCodes(response.search_id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codelist_${response.search_id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const results = response?.results ?? null;
  const summary = response?.summary as Record<string, number> | undefined;

  // UMLS-enriched codes are suggestions (synonym/narrower/sibling expansion from
  // the UMLS Metathesaurus), not direct retrievals. Route them to the Review tab
  // regardless of the LLM's decision so reviewers can validate them separately.
  const isUmlsSuggestion = (r: CodeResult) =>
    r.sources?.some((s) => s.startsWith("UMLS")) ?? false;

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (decisionFilter === "all") return results;
    if (decisionFilter === "uncertain") {
      return results.filter((r) => r.decision === "uncertain" || isUmlsSuggestion(r));
    }
    return results.filter((r) => r.decision === decisionFilter && !isUmlsSuggestion(r));
  }, [results, decisionFilter]);

  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
  const pagedResults = filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const decisionCounts = useMemo(() => {
    if (!results) return { all: 0, include: 0, exclude: 0, uncertain: 0 };
    const nonUmls = results.filter((r) => !isUmlsSuggestion(r));
    const reviewCount = results.filter(
      (r) => r.decision === "uncertain" || isUmlsSuggestion(r)
    ).length;
    return {
      all: results.length,
      include: nonUmls.filter((r) => r.decision === "include").length,
      exclude: nonUmls.filter((r) => r.decision === "exclude").length,
      uncertain: reviewCount,
    };
  }, [results]);

  // reset page when filter changes
  useEffect(() => { setPage(1); }, [decisionFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Search */}
      <div className="flex justify-center mb-10">
        <form onSubmit={handleSearch} className="w-full max-w-3xl">
          <div className="flex border border-gray-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#005EA5] focus-within:border-transparent">
            <div className="flex items-center pl-4 text-gray-400">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter clinical condition (e.g. type 2 diabetes with hypertension)"
              className="flex-1 px-3 py-3 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 bg-[#005EA5] text-white font-medium hover:bg-[#00436E] disabled:opacity-50 transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {/* Loading */}
      {loading && <LoadingProgress />}

      {/* Error */}
      {error && (
        <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 text-red-700 px-5 py-4 text-sm">
          <p className="font-semibold">Search failed</p>
          <p className="mt-1">{error}</p>
          <button onClick={() => setError(null)} className="mt-2 text-red-600 underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Results + Provenance */}
      {results && results.length > 0 && (
        <div className="flex gap-6">
          {/* Table */}
          <div className="flex-1 bg-white border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <h3 className="font-[family-name:var(--font-lora)] text-lg font-semibold">Results</h3>
                <DecisionFilter filter={decisionFilter} onChange={setDecisionFilter} counts={decisionCounts} />
              </div>
              {response?.elapsed_seconds && (
                <span className="text-xs text-gray-400">{response.elapsed_seconds}s</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#005EA5] text-white text-left">
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Term</th>
                    <th className="px-4 py-2.5 font-medium">System</th>
                    <th className="px-4 py-2.5 font-medium">Decision</th>
                    <th className="px-4 py-2.5 font-medium">Confidence %</th>
                    <th className="px-4 py-2.5 font-medium">Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedResults.map((r, i) => (
                    <tr
                      key={`${r.code}-${r.vocabulary}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`View details for ${r.term}`}
                      onClick={() => setSelectedCode(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedCode(r);
                        }
                      }}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        selectedCode?.code === r.code && selectedCode?.vocabulary === r.vocabulary
                          ? "bg-blue-50"
                          : i % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50/50"
                      } hover:bg-blue-50 focus:bg-blue-50 focus:outline-none`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                      <td className="px-4 py-3">{r.term}</td>
                      <td className="px-4 py-3 text-gray-600">{r.vocabulary}</td>
                      <td className="px-4 py-3">
                        <DecisionBadge decision={r.decision} />
                        {isUmlsSuggestion(r) && (
                          <span
                            className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 border border-purple-300"
                            title="Expanded from UMLS — review as a suggestion, not a direct match"
                          >
                            Suggested
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{Math.round(r.confidence * 100)}%</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {r.sources.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination + Export */}
            <div className="px-5 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredResults.length)} of {filteredResults.length}
                </span>
                {totalPages > 1 && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2 py-1 border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-2 py-1 border ${
                          p === page
                            ? "bg-[#005EA5] text-white border-[#005EA5]"
                            : "border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-2 py-1 border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport("csv")}
                  disabled={exporting || !response?.search_id}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#005EA5] text-white text-sm font-medium hover:bg-[#00436E] transition-colors disabled:opacity-50"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {exporting ? "Exporting..." : "Export CSV"}
                </button>
                <button
                  onClick={() => handleExport("xlsx")}
                  disabled={exporting || !response?.search_id}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Export Excel
                </button>
              </div>
            </div>
          </div>

          {/* Provenance panel */}
          <div className="w-80 shrink-0">
            <div className="bg-white border border-[#005EA5] sticky top-6">
              <div className="bg-[#005EA5] text-white px-5 py-3">
                <h3 className="font-[family-name:var(--font-lora)] font-semibold">
                  Provenance Details
                </h3>
              </div>
              {selectedCode ? (
                <dl className="px-5 py-4 space-y-4 text-sm">
                  <div>
                    <dt className="font-semibold">Source Guideline</dt>
                    <dd className="text-gray-600 mt-0.5">{selectedCode.sources.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Search Date</dt>
                    <dd className="text-gray-600 mt-0.5">{new Date().toISOString().split("T")[0]}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Search Query</dt>
                    <dd className="text-gray-600 mt-0.5">{query}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Decision Rationale</dt>
                    <dd className="text-gray-600 mt-0.5">{selectedCode.rationale}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Classifier Score</dt>
                    <dd className="text-gray-600 mt-0.5">
                      {selectedCode.classifier_score != null
                        ? `${Math.round(selectedCode.classifier_score * 100)}%`
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Algorithm Version</dt>
                    <dd className="text-gray-600 mt-0.5">0.1.0</dd>
                  </div>
                </dl>
              ) : (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  Click a row to view details
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No results */}
      {results && results.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No codes found for this query.
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && !error && (
        <div className="text-center mt-20">
          <h2 className="font-[family-name:var(--font-lora)] text-2xl font-semibold text-gray-700 mb-2">
            Clinical Code Search
          </h2>
          <p className="text-gray-500 text-sm">
            Search for SNOMED CT and ICD-10 codes across NHS reference sets,
            QOF business rules, and published code lists.
          </p>
        </div>
      )}
    </div>
  );
}
