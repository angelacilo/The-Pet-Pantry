"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useProfile } from "@/lib/useProfile";

export default function Navbar() {
  const router = useRouter();
  const { count } = useCart();
  const { isStaff, user, signOut } = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-[#F9D1D9]/95 backdrop-blur-md border-b border-[#838F58]/20 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo and Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <img
            src="/logo.png"
            alt="The Pet Pantry Logo"
            className="w-10 h-10 object-contain rounded-full shadow-xs transition-transform group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight text-[#4A5330] tracking-tight">
              The Pet Pantry
            </span>
            <span className="text-[11px] font-medium text-[#838F58] -mt-0.5">
              Fresh Treats & Supplies
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-xl text-sm font-semibold text-[#4A5330] hover:bg-white/60 transition"
          >
            Shop
          </Link>

          <Link
            href="/cart"
            className="relative px-3 py-1.5 rounded-xl text-sm font-semibold text-[#4A5330] hover:bg-white/60 transition flex items-center gap-1.5"
          >
            <span>Cart</span>
            {count > 0 && (
              <span className="bg-[#FF5C93] text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-5 text-center">
                {count}
              </span>
            )}
          </Link>

          <Link
            href="/orders"
            className="px-3 py-1.5 rounded-xl text-sm font-semibold text-[#4A5330] hover:bg-white/60 transition"
          >
            My Orders
          </Link>

          {/* Staff controls (only shown when staff/admin is logged in) */}
          {isStaff && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[#838F58]/30">
              <Link
                href="/staff"
                className="px-3 py-1.5 rounded-xl text-sm font-bold bg-[#838F58]/20 text-[#4A5330] hover:bg-[#838F58]/30 transition border border-[#838F58]/30"
              >
                Staff Portal
              </Link>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white text-[#4A5330] border border-[#838F58]/30 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                title={`Signed in as ${user?.email}`}
              >
                Log out
              </button>
            </div>
          )}
        </nav>

        {/* Mobile Action & Hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/cart"
            className="relative p-2 rounded-xl text-[#4A5330] hover:bg-white/60 flex items-center"
            aria-label="View Cart"
          >
            <span className="text-sm font-bold">🛒</span>
            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF5C93] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center">
                {count}
              </span>
            )}
          </Link>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-[#4A5330] hover:bg-white/60 focus:outline-none"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#838F58]/20 bg-[#F9D1D9] px-4 pt-2 pb-4 space-y-2">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-xl text-base font-semibold text-[#4A5330] hover:bg-white/60"
          >
            Shop Products
          </Link>
          <Link
            href="/cart"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-xl text-base font-semibold text-[#4A5330] hover:bg-white/60"
          >
            Cart ({count})
          </Link>
          <Link
            href="/orders"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-xl text-base font-semibold text-[#4A5330] hover:bg-white/60"
          >
            My Orders
          </Link>

          {isStaff && (
            <div className="pt-2 border-t border-[#838F58]/20 space-y-2">
              <Link
                href="/staff"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-xl text-base font-bold bg-[#838F58]/20 text-[#4A5330]"
              >
                Staff Portal
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignOut();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold bg-white text-red-600 border border-[#838F58]/30"
              >
                Log out ({user?.email})
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
