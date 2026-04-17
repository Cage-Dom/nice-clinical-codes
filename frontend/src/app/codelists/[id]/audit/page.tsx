"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCodelist, getAudit, type Codelist, type AuditEvent } from "@/lib/api";
import { useUser } from "@/lib/useUser";

const eventColor: Record<string, string> = {
  created: "bg-blue-100 text-blue-800 border-blue-300",
  submitted: "bg-amber-100 text-amber-800 border-amber-300",
  override: "bg-purple-100 text-purple-800 border-purple-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

export default function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const [codelist, setCodelist] = useState<Codelist | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push(`/login?next=/codelists/${id}/audit`);
    }
  }, [userLoading, user, router, id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getCodelist(id), getAudit(id)])
      .then(([cl, a]) => {
        if (cancelled) return;
        setCodelist(cl);
        setEvents(a);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, id]);

  if (!user || loading) return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-48 mb-8" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    </div>
  );
  if (error) {
    return <div className="max-w-4xl mx-auto px-6 py-8 text-sm text-red-700">{error}</div>;
  }
  if (!codelist) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link
        href={`/codelists/${codelist.id}`}
        className="text-xs text-[#00436C] hover:underline"
      >
        ← Back to codelist
      </Link>
      <h1 className="text-2xl font-serif font-medium text-[#00436C] mt-1 mb-1">
        Audit log — {codelist.name}
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Status: <strong>{codelist.status}</strong>
        {codelist.signature_hash && (
          <span className="ml-3 font-mono text-xs text-gray-500">
            sig {codelist.signature_hash}
          </span>
        )}
      </p>

      <div className="space-y-3">
        {events.map((e) => (
          <div
            key={e.id}
            className="border border-gray-200 rounded p-3 bg-white"
          >
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
              <span
                className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${
                  eventColor[e.event] ?? "bg-gray-100 text-gray-800 border-gray-300"
                }`}
              >
                {e.event.toUpperCase()}
              </span>
              <span>{new Date(e.timestamp).toLocaleString()}</span>
              <span className="ml-auto font-medium text-gray-700">
                {e.user_name ?? "system"}
              </span>
            </div>
            <AuditDetails event={e} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditDetails({ event }: { event: AuditEvent }) {
  const d = event.details;
  if (event.event === "created") {
    return (
      <div className="text-sm text-gray-700">
        Query: <span className="font-medium">{String(d.query)}</span>
        <span className="ml-3 text-xs text-gray-500">
          {String(d.decision_count)} codes
        </span>
      </div>
    );
  }
  if (event.event === "override") {
    return (
      <div className="text-sm">
        <div className="font-mono text-xs mb-1">{String(d.code)}</div>
        <div className="text-gray-700">
          AI:{" "}
          <span className="line-through text-gray-500">
            {String(d.ai_decision)}
          </span>
          <span className="mx-2">→</span>
          <span className="font-medium text-purple-800">
            {String(d.human_decision)}
          </span>
        </div>
        {typeof d.reason === "string" && d.reason && (
          <div className="mt-1 text-xs text-gray-700 italic">
            &ldquo;{d.reason}&rdquo;
          </div>
        )}
      </div>
    );
  }
  if (event.event === "approved" || event.event === "rejected") {
    return (
      <div className="text-sm text-gray-700">
        {typeof d.notes === "string" && d.notes && (
          <div>Notes: <em>{d.notes}</em></div>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {String(d.override_count)} overrides applied
          {typeof d.signature_hash === "string" && d.signature_hash && (
            <>
              {" · "}
              <span className="font-mono">{d.signature_hash.slice(0, 16)}…</span>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <pre className="text-xs text-gray-500 overflow-x-auto">
      {JSON.stringify(d, null, 2)}
    </pre>
  );
}
