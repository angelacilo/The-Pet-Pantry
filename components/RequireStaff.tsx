"use client";

import React from "react";
import Link from "next/link";
import { useProfile } from "@/lib/useProfile";

interface RequireStaffProps {
  children: React.ReactNode;
}

export default function RequireStaff({ children }: RequireStaffProps) {
  const { user, isStaff, loading } = useProfile();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[#4A5330] font-semibold text-sm">Checking staff permissions...</p>
      </div>
    );
  }

  if (!user || !isStaff) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-[#838F58]/20 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-[#FF5C93]/15 text-[#FF5C93] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            🔒
          </div>
          <h2 className="text-xl font-bold text-[#4A5330] mb-2">Staff Access Only</h2>
          <p className="text-sm text-[#4A5330]/80 mb-6">
            This section is reserved for store staff and administrators. Please log in with an authorized staff account to continue.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/staff/login"
              className="px-4 py-2.5 rounded-xl bg-[#4A5330] text-white text-sm font-semibold hover:bg-[#4A5330]/90 transition"
            >
              Log in with Staff Account
            </Link>
            <Link
              href="/"
              className="px-4 py-2.5 rounded-xl bg-gray-100 text-[#4A5330] text-sm font-semibold hover:bg-gray-200 transition"
            >
              Return to Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
