"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listCodelists, type CodelistSummary } from "@/lib/api";
import { useUser } from "@/lib/useUser";

export default function AuditIndexPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [rows, setRows] = useState<CodelistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/login?next=/audit");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listCodelists({ status: "approved" })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="h-4 bg-gray-200 rounded w-full mb-3" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-serif font-medium text-[#00436C] mb-2">
        Audit Log
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        View the approval history and decision audit trail for approved codelists.
      </p>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded" />)}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded">
          <p className="text-sm text-gray-500">
            No approved codelists yet.{" "}
            <Link href="/" className="text-[#00436C] hover:underline">
              Run a search
            </Link>{" "}
            and approve a draft to see its audit trail here.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <ul className="divide-y divide-gray-200 border-y border-gray-200">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/codelists/${r.id}/audit`}
                className="flex items-center justify-between px-3 py-3 text-sm hover:bg-gray-50"
              >
                <span>
                  <span className="font-medium text-[#00436C]">{r.name}</span>
                  <span className="text-gray-500"> · {r.decision_count} codes</span>
                </span>
                <span className="text-xs text-gray-400">
                  {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
