"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getStatusLabel, getStatusBadgeClass, getPaymentStatusLabel, getPaymentStatusBadgeClass } from "@/lib/status";
import { getOrderTokens } from "@/lib/myOrders";

interface OrderSummary {
  token: string;
  id: number;
  full_name: string;
  delivery_option: "maxim" | "pickup";
  status: string;
  payment_status: string | null;
  subtotal: number;
  delivery_fee: number | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  created_at: string;
  order_items?: Array<{
    id: number | string;
    product_name: string;
    variant_name?: string | null;
    qty: number;
    unit_price: number;
  }>;
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeviceOrders() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // Read saved order tokens from localStorage
        const tokens = getOrderTokens();

        if (tokens.length === 0) {
          setOrders([]);
          setLoading(false);
          return;
        }

        // Fetch each order using get_order RPC
        const results = await Promise.all(
          tokens.map(async (tok) => {
            try {
              const { data, error } = await supabase.rpc("get_order", {
                p_token: tok,
              });
              if (error || !data) return null;
              return {
                ...data,
                token: tok,
              } as OrderSummary;
            } catch {
              return null;
            }
          })
        );

        // Filter out nulls and sort by date descending
        const validOrders = results
          .filter((o): o is OrderSummary => o !== null)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

        setOrders(validOrders);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load orders");
      } finally {
        setLoading(false);
      }
    }

    fetchDeviceOrders();
  }, []);

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#4A5330]">My Orders</h1>
          <p className="text-xs sm:text-sm text-[#4A5330]/75">
            Recent orders placed on this device
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs"
        >
          Shop More Products
        </Link>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-[#4A5330]">
            Checking recent orders on this device...
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-[#838F58]/20">
          <span className="text-4xl block mb-3">📦</span>
          <h3 className="text-lg font-bold text-[#4A5330]">No orders on this device</h3>
          <p className="text-sm text-[#4A5330]/75 mt-1 mb-6 max-w-sm mx-auto">
            You haven&apos;t placed any orders from this browser yet. Ready to treat your pet?
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-[#4A5330] text-white text-xs font-bold hover:bg-[#4A5330]/90 transition shadow-xs"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const formattedDate = new Date(order.created_at).toLocaleDateString(
              undefined,
              {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }
            );

            const effTotal =
              Number(order.total) ||
              Number(order.subtotal) + Number(order.delivery_fee || 0);

            return (
              <div
                key={order.token}
                className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:shadow-md transition"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#4A5330] bg-[#F9D1D9]/40 px-2 py-0.5 rounded-lg">
                      #{order.id}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(
                        order.status
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                    {order.payment_status && order.payment_status !== "unpaid" && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${getPaymentStatusBadgeClass(order.payment_status)}`}
                      >
                        {getPaymentStatusLabel(order.payment_status)}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-gray-500">
                      {order.delivery_option === "maxim"
                        ? "🚚 Maxim Delivery"
                        : "🏬 Store Pickup"}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400">
                    Placed for <span className="font-semibold text-gray-600">{order.full_name}</span> on {formattedDate}
                  </p>

                  {order.order_items && order.order_items.length > 0 && (
                    <div className="text-xs text-[#4A5330]/80 pt-0.5 flex flex-wrap gap-x-2">
                      {order.order_items.map((it, idx) => (
                        <span key={idx}>
                          <span className="font-bold text-[#4A5330]">{it.qty}x</span>{" "}
                          <span>{it.product_name}</span>
                          {it.variant_name && (
                            <span className="text-[#838F58] font-semibold"> ({it.variant_name})</span>
                          )}
                          {idx < order.order_items!.length - 1 ? " •" : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs pt-1">
                    <div>
                      <span className="text-gray-500">Total: </span>
                      <span className="font-black text-[#FF5C93]">
                        ₱{effTotal.toFixed(2)}
                      </span>
                    </div>
                    {Number(order.amount_paid) > 0 && (
                      <div>
                        <span className="text-gray-500">Paid: </span>
                        <span className="font-bold text-[#4A5330]">
                          ₱{Number(order.amount_paid).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {Number(order.balance_due) > 0 && (
                      <div>
                        <span className="text-gray-500">Balance: </span>
                        <span className="font-bold text-amber-700">
                          ₱{Number(order.balance_due).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 flex justify-end">
                  <Link
                    href={`/orders/${order.token}`}
                    className="w-full sm:w-auto text-center px-4 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs"
                  >
                    View Order Details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
