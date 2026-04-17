"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listDemoUsers, login, type User } from "@/lib/api";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-6 py-16 text-sm text-gray-500">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/";
  // Prevent open redirect — only allow relative paths starting with /
  const nextParam = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
    ? rawNext
    : "/";

  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDemoUsers()
      .then((u) => {
        setUsers(u);
        if (u.length > 0) setSelectedId(u[0].id);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async () => {
    if (selectedId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(selectedId);
      router.push(nextParam);
      router.refresh();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-3xl font-serif font-medium text-[#00436C] mb-2">Sign in</h1>
      <p className="text-sm text-gray-600 mb-8">
        Pick a demo user to review codelists. In production this is replaced with
        NHS Identity / OAuth.
      </p>

      {loading && <div className="text-sm text-gray-500">Loading users…</div>}

      {!loading && (
        <div className="space-y-2">
          {users.map((u) => (
            <label
              key={u.id}
              className={`flex items-center gap-3 p-3 border rounded cursor-pointer transition-colors ${
                selectedId === u.id
                  ? "border-[#00436C] bg-[#00436C]/5"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="user"
                value={u.id}
                checked={selectedId === u.id}
                onChange={() => setSelectedId(u.id)}
                className="accent-[#00436C]"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{u.name}</div>
                <div className="text-xs text-gray-500">
                  {u.email} · {u.role}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}

      <button
        onClick={handleLogin}
        disabled={selectedId === null || submitting}
        className="mt-8 w-full bg-[#00436C] text-white py-2.5 font-medium rounded hover:bg-[#005EA5] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </div>
  );
}
