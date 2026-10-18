"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { getStatusBadgeClass, getStatusLabel, getPaymentStatusBadgeClass, getPaymentStatusLabel } from "@/lib/status";

interface DashboardMetrics {
  awaitingFeeCount: number;
  paymentsToVerifyCount: number;
  lowStockCount: number;
  totalOrdersCount: number;
  completedOrdersCount: number;
}

interface RecentOrder {
  id: number;
  full_name: string;
  delivery_option: "maxim" | "pickup";
  status: string;
  payment_status: string | null;
  total: number;
  subtotal: number;
  created_at: string;
}

// ── Sound utility (Web Audio API) ──────────────────────────────────────────
function playBeep(audioCtx: AudioContext) {
  try {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
  } catch {
    // Ignore if audio fails
  }
}

export default function StaffDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    awaitingFeeCount: 0,
    paymentsToVerifyCount: 0,
    lowStockCount: 0,
    totalOrdersCount: 0,
    completedOrdersCount: 0,
  });
  const [recentPendingOrders, setRecentPendingOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Sound
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevPendingCountRef = useRef<number | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, full_name, delivery_option, status, payment_status, total, subtotal, created_at");

      if (ordersErr) {
        console.warn("Error fetching dashboard orders:", ordersErr.message);
      }

      const allOrders = (orders as RecentOrder[]) || [];

      const awaitingFee = allOrders.filter((o) => o.status === "awaiting_fee").length;
      // Payments to verify = payment_status pending & not cancelled
      const paymentsToVerify = allOrders.filter(
        (o) => o.payment_status === "pending" && o.status !== "cancelled"
      ).length;
      const completed = allOrders.filter((o) => o.status === "completed").length;

      // Pending attention orders: awaiting_fee OR payment pending (not cancelled)
      const pending = allOrders
        .filter(
          (o) =>
            o.status === "awaiting_fee" ||
            (o.payment_status === "pending" && o.status !== "cancelled")
        )
        .slice(0, 5);

      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("id, stock_qty");

      if (prodErr) {
        console.warn("Error fetching dashboard products:", prodErr.message);
      }

      const lowStock = (products || []).filter((p) => p.stock_qty <= 5).length;

      // Beep if new pending payments arrived
      if (prevPendingCountRef.current !== null && paymentsToVerify > prevPendingCountRef.current) {
        if (soundEnabled && audioCtxRef.current) {
          playBeep(audioCtxRef.current);
        }
      }
      prevPendingCountRef.current = paymentsToVerify;

      // Update tab title
      if (typeof document !== "undefined") {
        if (paymentsToVerify > 0) {
          document.title = `(${paymentsToVerify}) Payments to verify - Pet Pantry`;
        } else {
          document.title = "Staff Dashboard - Pet Pantry";
        }
      }

      setMetrics({
        awaitingFeeCount: awaitingFee,
        paymentsToVerifyCount: paymentsToVerify,
        lowStockCount: lowStock,
        totalOrdersCount: allOrders.length,
        completedOrdersCount: completed,
      });

      setRecentPendingOrders(pending);
    } catch (err) {
      console.error("Dashboard load failed:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  // Poll every 20 seconds
  useEffect(() => {
    const timer = setInterval(() => loadDashboard(true), 20000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  // Reset title on unmount
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.title = "Pet Pantry";
      }
    };
  }, []);

  const handleToggleSound = () => {
    if (!soundEnabled) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      playBeep(audioCtxRef.current);
    }
    setSoundEnabled((prev) => !prev);
  };

  return (
    <RequireStaff>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <span>The Pet Pantry</span>
              <span>•</span>
              <span>Staff Portal</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Staff Dashboard</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Welcome back! Here is an overview of active orders and inventory alerts.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sound toggle */}
            <button
              onClick={handleToggleSound}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer flex items-center gap-1.5 ${
                soundEnabled
                  ? "bg-[#4A5330] text-white border-[#4A5330]"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
              title="Toggle sound alert for new pending payments"
            >
              <span>{soundEnabled ? "🔔" : "🔕"}</span>
              <span>{soundEnabled ? "Sound on" : "Enable sound"}</span>
            </button>

            <Link
              href="/staff/orders"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs"
            >
              Orders
            </Link>
            <Link
              href="/staff/products"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Inventory
            </Link>
            <Link
              href="/staff/categories"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Categories
            </Link>
            <Link
              href="/staff/settings"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Delivery Settings
            </Link>
          </div>
        </div>

        {/* Dashboard Count Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Orders Awaiting Fee */}
          <Link
            href="/staff/orders?status=awaiting_fee"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 hover:border-amber-400 hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Awaiting Delivery Fee
              </span>
              <span className="p-2 bg-amber-50 rounded-xl text-amber-700 text-lg">
                🚚
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#4A5330]">
                {loading ? "..." : metrics.awaitingFeeCount}
              </span>
              <span className="text-xs text-amber-800 font-semibold">
                Maxim orders
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 group-hover:text-[#4A5330]">
              Click to assess Maxim fees →
            </p>
          </Link>

          {/* Card 2: Payments to Verify */}
          <Link
            href="/staff/orders?status=needs_payment_check"
            className={`bg-white rounded-2xl p-5 shadow-xs border transition group ${
              metrics.paymentsToVerifyCount > 0
                ? "border-amber-400 hover:shadow-md"
                : "border-[#838F58]/20 hover:border-[#FF5C93] hover:shadow-md"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Payments to Verify
              </span>
              <span className="p-2 bg-[#FF5C93]/15 rounded-xl text-[#FF5C93] text-lg">
                📑
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-3xl font-black ${metrics.paymentsToVerifyCount > 0 ? "text-amber-700" : "text-[#FF5C93]"}`}>
                {loading ? "..." : metrics.paymentsToVerifyCount}
              </span>
              <span className="text-xs text-[#FF5C93] font-semibold">
                Pending verification
              </span>
            </div>
            <p className={`text-[11px] mt-2 ${metrics.paymentsToVerifyCount > 0 ? "text-amber-600 font-bold" : "text-gray-400 group-hover:text-[#FF5C93]"}`}>
              {metrics.paymentsToVerifyCount > 0 ? "⚠️ Action required →" : "Click to verify payments →"}
            </p>
          </Link>

          {/* Card 3: Low Stock Alerts */}
          <Link
            href="/staff/products"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 hover:border-red-400 hover:shadow-md transition group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Low Stock Alert (≤ 5)
              </span>
              <span className="p-2 bg-red-50 rounded-xl text-red-600 text-lg">
                ⚠️
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-red-600">
                {loading ? "..." : metrics.lowStockCount}
              </span>
              <span className="text-xs text-red-600 font-semibold">
                Products low or empty
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 group-hover:text-red-600">
              Click to restock in Product Management →
            </p>
          </Link>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <Link
            href="/staff/orders"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              📦
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Orders</h3>
              <p className="text-xs text-gray-500">Fees &amp; fulfillment</p>
            </div>
          </Link>

          <Link
            href="/staff/products"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              🏷️
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Products</h3>
              <p className="text-xs text-gray-500">Edit prices &amp; stock</p>
            </div>
          </Link>

          <Link
            href="/staff/categories"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              📂
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Categories</h3>
              <p className="text-xs text-gray-500">Catalog filters</p>
            </div>
          </Link>

          <Link
            href="/staff/settings"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              ⚙️
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Settings</h3>
              <p className="text-xs text-gray-500">Delivery calculator</p>
            </div>
          </Link>

          <Link
            href="/staff/reports"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              📊
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Reports</h3>
              <p className="text-xs text-gray-500">Sales &amp; top items</p>
            </div>
          </Link>
        </div>

        {/* Action Needed: Pending Orders preview */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>⚡</span> Urgent Orders Requiring Action
            </h2>
            <Link
              href="/staff/orders"
              className="text-xs font-bold text-[#838F58] hover:underline"
            >
              View all orders →
            </Link>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-gray-400">
              Checking for pending orders...
            </div>
          ) : recentPendingOrders.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#838F58] font-bold">
              🎉 All caught up! No orders currently awaiting delivery fees or payment verification.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentPendingOrders.map((order) => (
                <div
                  key={order.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[#4A5330]">
                        #{order.id}
                      </span>
                      <span className="font-semibold text-gray-800">
                        {order.full_name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(order.status)}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                      {order.payment_status && order.payment_status !== "unpaid" && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPaymentStatusBadgeClass(order.payment_status)}`}
                        >
                          {getPaymentStatusLabel(order.payment_status)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {order.delivery_option === "maxim"
                        ? "🚚 Maxim Delivery"
                        : "🏬 Store Pickup"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[#FF5C93]">
                      ₱{Number(order.total || order.subtotal).toFixed(2)}
                    </span>
                    <Link
                      href="/staff/orders"
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition"
                    >
                      Process Order
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RequireStaff>
  );
}
