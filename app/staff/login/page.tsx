"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Verify staff or admin role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profile?.role === "staff" || profile?.role === "admin") {
          router.push("/staff");
        } else {
          // Log out non-staff accounts
          await supabase.auth.signOut();
          setErrorMsg("Access denied. This login is reserved for staff and administrators.");
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log in");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-6 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#838F58]/20 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#F9D1D9] rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-2xl font-bold text-[#4A5330]">Staff Portal Login</h1>
          <p className="text-sm text-[#4A5330]/75 mt-1">
            Sign in with authorized staff credentials
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
              Staff Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@thepetpantry.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#4A5330] focus:ring-2 focus:ring-[#838F58]/30 outline-none text-sm transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#4A5330] focus:ring-2 focus:ring-[#838F58]/30 outline-none text-sm transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-sm transition disabled:opacity-60 flex items-center justify-center cursor-pointer"
          >
            {loading ? "Verifying..." : "Log In to Staff Portal"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <Link
            href="/"
            className="text-xs font-semibold text-[#838F58] hover:underline"
          >
            ← Return to Store
          </Link>
        </div>
      </div>
    </div>
  );
}
