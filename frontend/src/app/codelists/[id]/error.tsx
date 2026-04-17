"use client";

import Link from "next/link";

export default function CodelistError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-serif font-medium text-red-800 mb-3">
        Something went wrong
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        {error.message || "An unexpected error occurred while loading this codelist."}
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm bg-[#00436C] text-white rounded hover:bg-[#005EA5]"
        >
          Try again
        </button>
        <Link
          href="/codelists"
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          Back to codelists
        </Link>
      </div>
    </div>
  );
}
