"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { logout } from "@/lib/api";

export function UserBadge() {
  const { user, loading, refresh } = useUser();
  const router = useRouter();

  if (loading) return null;

  const handleLogout = async () => {
    await logout();
    await refresh();
    router.push("/login");
  };

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-3 py-1 text-xs font-medium text-white/90 hover:text-white hover:bg-[#005EA5] rounded"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <Link
        href="/codelists"
        className="px-2 py-1 text-white/90 hover:text-white hover:bg-[#005EA5] rounded"
      >
        My codelists
      </Link>
      <span className="text-white/80">
        {user.name}
        <span className="ml-1 text-white/50">({user.role})</span>
      </span>
      <button
        onClick={handleLogout}
        className="px-2 py-1 text-white/90 hover:text-white hover:bg-[#005EA5] rounded"
      >
        Sign out
      </button>
    </div>
  );
}
