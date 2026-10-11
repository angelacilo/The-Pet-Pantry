"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status";

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
  total: number;
  subtotal: number;
  created_at: string;
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

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        // 1. Fetch orders data
        const { data: orders, error: ordersErr } = await supabase
          .from("orders")
          .select("id, full_name, delivery_option, status, total, subtotal, created_at");

        if (ordersErr) {
          console.warn("Error fetching dashboard orders:", ordersErr.message);
        }

        const allOrders = (orders as RecentOrder[]) || [];

        const awaitingFee = allOrders.filter((o) => o.status === "awaiting_fee").length;
        const paymentsToVerify = allOrders.filter(
          (o) => o.status === "payment_submitted"
        ).length;
        const completed = allOrders.filter((o) => o.status === "completed").length;

        // Pending attention orders
        const pending = allOrders
          .filter(
            (o) => o.status === "awaiting_fee" || o.status === "payment_submitted"
          )
          .slice(0, 5);

        // 2. Fetch products for low stock
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("id, stock_qty");

        if (prodErr) {
          console.warn("Error fetching dashboard products:", prodErr.message);
        }

        const lowStock = (products || []).filter((p) => p.stock_qty <= 5).length;

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
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

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

          <div className="flex items-center gap-2">
            <Link
              href="/staff/orders"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs"
            >
              Manage Orders
            </Link>
            <Link
              href="/staff/products"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Inventory
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
            href="/staff/orders?status=payment_submitted"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 hover:border-[#FF5C93] hover:shadow-md transition group"
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
              <span className="text-3xl font-black text-[#FF5C93]">
                {loading ? "..." : metrics.paymentsToVerifyCount}
              </span>
              <span className="text-xs text-[#FF5C93] font-semibold">
                Receipts submitted
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 group-hover:text-[#FF5C93]">
              Click to confirm payments & deduct stock →
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/staff/orders"
            className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex items-center gap-4 hover:bg-[#F9D1D9]/20 transition"
          >
            <div className="w-12 h-12 bg-[#838F58]/20 rounded-xl flex items-center justify-center text-2xl">
              📦
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#4A5330]">Orders Management</h3>
              <p className="text-xs text-gray-500">Update fees, receipts & fulfillment</p>
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
              <h3 className="font-bold text-sm text-[#4A5330]">Product Inventory</h3>
              <p className="text-xs text-gray-500">Add products, edit prices & stock</p>
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
              <h3 className="font-bold text-sm text-[#4A5330]">Sales & Reports</h3>
              <p className="text-xs text-gray-500">Total revenue, best sellers & stock</p>
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
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#4A5330]">
                        #{order.id}
                      </span>
                      <span className="font-semibold text-gray-800">
                        {order.full_name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(
                          order.status
                        )}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
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
