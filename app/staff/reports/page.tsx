"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";

interface CompletedOrder {
  id: number;
  total: number;
  amount_paid: number;
  subtotal: number;
  delivery_fee: number | null;
  created_at: string;
}

interface BestSeller {
  productId: string | number;
  productName: string;
  totalQty: number;
  totalRevenue: number;
}

interface LowStockProduct {
  id: string | number;
  name: string;
  category_name?: string | null;
  price: number;
  stock_qty: number;
  is_active: boolean;
}

export default function StaffReportsPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Metrics
  const [completedOrdersCount, setCompletedOrdersCount] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);

  // Best sellers
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);

  // Low stock items
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1. Fetch completed orders
        const { data: completedOrdersData, error: ordersErr } = await supabase
          .from("orders")
          .select("id, total, amount_paid, subtotal, delivery_fee, created_at")
          .eq("status", "completed");

        if (ordersErr) throw new Error(ordersErr.message);

        const completedOrders = (completedOrdersData as CompletedOrder[]) || [];
        const count = completedOrders.length;
        const sales = completedOrders.reduce((sum, order) => {
          return sum + (Number(order.total) || Number(order.amount_paid) || 0);
        }, 0);
        const aov = count > 0 ? sales / count : 0;

        setCompletedOrdersCount(count);
        setTotalSales(sales);
        setAvgOrderValue(aov);

        // 2. Fetch order_items for completed orders (or all items) to calculate best sellers
        const completedOrderIds = completedOrders.map((o) => o.id);

        let itemsQuery = supabase
          .from("order_items")
          .select("product_id, product_name, variant_id, variant_name, unit_price, qty, order_id");

        if (completedOrderIds.length > 0) {
          itemsQuery = itemsQuery.in("order_id", completedOrderIds);
        }

        const { data: itemsData, error: itemsErr } = await itemsQuery;

        if (itemsErr) {
          console.warn("Could not query items for best sellers:", itemsErr.message);
        }

        // Aggregate by product and variant
        const productMap: Record<
          string,
          { name: string; qty: number; revenue: number }
        > = {};

        (itemsData || []).forEach((item: any) => {
          const displayName = item.variant_name
            ? `${item.product_name} (${item.variant_name})`
            : item.product_name;
          const key = `${item.product_id}_${item.variant_id ?? "base"}`;
          if (!productMap[key]) {
            productMap[key] = {
              name: displayName,
              qty: 0,
              revenue: 0,
            };
          }
          productMap[key].qty += Number(item.qty) || 0;
          productMap[key].revenue +=
            (Number(item.unit_price) || 0) * (Number(item.qty) || 0);
        });

        const rankedBestSellers: BestSeller[] = Object.entries(productMap)
          .map(([id, stats]) => ({
            productId: id,
            productName: stats.name,
            totalQty: stats.qty,
            totalRevenue: stats.revenue,
          }))
          .sort((a, b) => b.totalQty - a.totalQty)
          .slice(0, 10);

        setBestSellers(rankedBestSellers);

        // 3. Fetch low-stock products & variants (stock_qty <= 5)
        const { data: productsData, error: prodErr } = await supabase
          .from("products")
          .select("id, name, price, stock_qty, is_active, categories(name), product_variants(id, name, stock_qty, is_active)")
          .eq("is_active", true);

        if (prodErr) throw new Error(prodErr.message);

        const lowList: LowStockProduct[] = [];
        (productsData || []).forEach((p: any) => {
          const catName = p.categories?.name || null;
          const activeVars = (p.product_variants || []).filter((v: any) => v.is_active);
          if (activeVars.length > 0) {
            activeVars.forEach((v: any) => {
              if (Number(v.stock_qty) <= 5) {
                lowList.push({
                  id: `${p.id}_var_${v.id}`,
                  name: `${p.name} (${v.name})`,
                  category_name: catName,
                  price: p.price,
                  stock_qty: Number(v.stock_qty),
                  is_active: p.is_active,
                });
              }
            });
          } else if (Number(p.stock_qty) <= 5) {
            lowList.push({
              id: p.id,
              name: p.name,
              category_name: catName,
              price: p.price,
              stock_qty: Number(p.stock_qty),
              is_active: p.is_active,
            });
          }
        });

        lowList.sort((a, b) => a.stock_qty - b.stock_qty);
        setLowStockProducts(lowList);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  return (
    <RequireStaff>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Reports</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Sales & Inventory Reports</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Review completed sales performance, top ordered products, and inventory stock replenishment needs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/staff"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Dashboard
            </Link>
            <Link
              href="/staff/orders"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Orders
            </Link>
            <Link
              href="/staff/products"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Inventory
            </Link>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Sales Performance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Completed Orders Count */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
              Completed Orders
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#4A5330]">
                {loading ? "..." : completedOrdersCount}
              </span>
              <span className="text-xs text-[#838F58] font-bold">Orders Fulfilled</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Successfully delivered & settled
            </p>
          </div>

          {/* Card 2: Total Sales */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
              Total Sales Revenue
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#FF5C93]">
                {loading ? "..." : `₱${totalSales.toFixed(2)}`}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Total revenue from completed orders
            </p>
          </div>

          {/* Card 3: Average Order Value */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
              Average Order Value (AOV)
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#4A5330]">
                {loading ? "..." : `₱${avgOrderValue.toFixed(2)}`}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Average spend per completed customer order
            </p>
          </div>
        </div>

        {/* Two Column Layout: Best Sellers by Quantity & Low-Stock List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Best Sellers by Quantity */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                <span>🏆</span> Best Sellers by Quantity
              </h2>
              <span className="text-xs text-gray-400">Ranked by units sold</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Calculating top products...
              </div>
            ) : bestSellers.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#4A5330]/75">
                No completed order data available yet to rank best sellers.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bestSellers.map((item, index) => {
                  const rankBadge =
                    index === 0
                      ? "🥇"
                      : index === 1
                      ? "🥈"
                      : index === 2
                      ? "🥉"
                      : `#${index + 1}`;

                  return (
                    <div
                      key={item.productId}
                      className="py-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm w-6 text-center text-[#838F58]">
                          {rankBadge}
                        </span>
                        <div>
                          <div className="font-bold text-[#4A5330] line-clamp-1">
                            {item.productName}
                          </div>
                          <span className="text-gray-400">
                            Revenue: ₱{item.totalRevenue.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-sm text-[#4A5330] block">
                          {item.totalQty} units
                        </span>
                        <span className="text-[10px] text-green-700 font-bold">
                          Sold
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: Low-Stock List (≤ 5) */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-red-600 flex items-center gap-1.5">
                  <span>⚠️</span> Low-Stock List (≤ 5 units)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                  {lowStockProducts.length}
                </span>
              </div>
              <Link
                href="/staff/products"
                className="text-xs font-bold text-[#838F58] hover:underline"
              >
                Restock in Products →
              </Link>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Checking inventory stock...
              </div>
            ) : lowStockProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-green-700 font-bold">
                ✓ All products are currently well-stocked above 5 units!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F9D1D9]/40 border-b border-gray-100 text-gray-500 font-bold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Price</th>
                      <th className="py-2.5 px-3 text-center">Remaining</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lowStockProducts.map((p) => {
                      const isZero = p.stock_qty === 0;

                      return (
                        <tr key={p.id} className="hover:bg-red-50/40 transition">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-[#4A5330] block line-clamp-1">
                              {p.name}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {p.category_name || "General"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-gray-700">
                            ₱{Number(p.price).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full font-black text-xs ${
                                isZero
                                  ? "bg-red-600 text-white"
                                  : "bg-red-100 text-red-700 border border-red-300"
                              }`}
                            >
                              {isZero ? "OUT OF STOCK" : `${p.stock_qty} left`}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Link
                              href="/staff/products"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition inline-block"
                            >
                              Restock
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </RequireStaff>
  );
}
