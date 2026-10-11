"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/status";

interface OrderItem {
  id: number;
  order_id: number;
  product_name: string;
  unit_price: number;
  qty: number;
}

interface StaffOrder {
  id: number;
  user_id: number | null;
  access_token?: string;
  full_name: string;
  contact_number: string;
  delivery_option: "maxim" | "pickup";
  address: string | null;
  pickup_schedule: string | null;
  subtotal: number;
  delivery_fee: number | null;
  payment_option: "50_50" | "full" | null;
  payment_method: "cash" | "gcash" | "bank" | null;
  receipt_path: string | null;
  amount_paid: number;
  status: string;
  total: number;
  balance_due: number;
  created_at: string;
  order_items?: OrderItem[];
}

const ALL_STATUSES = [
  "all",
  "awaiting_fee",
  "awaiting_payment",
  "payment_submitted",
  "confirmed",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
];

function StaffOrdersContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams?.get("status") || "all";

  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<number | null>(null);

  // Delivery fee input mapping: orderId -> fee
  const [feeInputs, setFeeInputs] = useState<Record<number, string>>({});

  // Amount received input mapping for confirm_order RPC: orderId -> amount
  const [amountInputs, setAmountInputs] = useState<Record<number, string>>({});

  // Receipt preview signed URL modal
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<number | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch orders including access_token
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersErr) {
        throw new Error(ordersErr.message);
      }

      const rawOrders = (ordersData as StaffOrder[]) || [];

      // 2. Fetch order items for all orders
      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("*");

      if (itemsErr) {
        console.warn("Could not load order items:", itemsErr.message);
      }

      const itemsByOrder: Record<string, OrderItem[]> = {};
      (itemsData || []).forEach((item: OrderItem) => {
        if (!itemsByOrder[item.order_id]) {
          itemsByOrder[item.order_id] = [];
        }
        itemsByOrder[item.order_id].push(item);
      });

      const fullOrders = rawOrders.map((o) => ({
        ...o,
        order_items: itemsByOrder[o.id] || [],
      }));

      setOrders(fullOrders);

      // Pre-populate amount input defaults
      const initialAmounts: Record<string, string> = {};
      fullOrders.forEach((o) => {
        const effTotal =
          Number(o.total) || Number(o.subtotal) + Number(o.delivery_fee || 0);
        if (o.payment_option === "50_50") {
          initialAmounts[o.id] = (effTotal / 2).toString();
        } else {
          initialAmounts[o.id] = effTotal.toString();
        }
      });
      setAmountInputs(initialAmounts);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Action: Copy customer link using access_token
  const handleCopyCustomerLink = (order: StaffOrder) => {
    if (typeof window !== "undefined") {
      const token = order.access_token || String(order.id);
      const link = `${window.location.origin}/orders/${token}`;
      navigator.clipboard.writeText(link);
      setCopiedOrderId(order.id);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  // Action 1: Set Maxim delivery fee
  const handleSetDeliveryFee = async (orderId: number) => {
    const feeStr = feeInputs[orderId];
    const feeNum = parseFloat(feeStr);

    if (isNaN(feeNum) || feeNum < 0) {
      setErrorMsg("Please enter a valid delivery fee amount");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          delivery_fee: feeNum,
          status: "awaiting_payment",
        })
        .eq("id", orderId);

      if (error) throw new Error(error.message);

      setSuccessMsg("Delivery fee updated! Order is now awaiting payment.");
      await fetchOrders();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to set delivery fee");
    }
  };

  // Action 2: View receipt with createSignedUrl
  const handleViewReceipt = async (order: StaffOrder) => {
    if (!order.receipt_path) return;
    setLoadingReceiptId(order.id);

    try {
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(order.receipt_path, 3600);

      if (error) throw new Error(error.message);

      if (data?.signedUrl) {
        setActiveReceiptUrl(data.signedUrl);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to open receipt image");
    } finally {
      setLoadingReceiptId(null);
    }
  };

  // Action 3: Confirm order via confirm_order RPC
  const handleConfirmOrder = async (order: StaffOrder) => {
    const amtStr = amountInputs[order.id];
    const amount = parseFloat(amtStr);

    if (isNaN(amount) || amount < 0) {
      setErrorMsg("Please enter a valid amount received");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.rpc("confirm_order", {
        p_order_id: order.id,
        p_amount_paid: amount,
      });

      if (error) throw new Error(error.message);

      setSuccessMsg("Order confirmed and product stock deducted successfully!");
      await fetchOrders();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to confirm order");
    }
  };

  // Action 4: Update status to ready_for_pickup or out_for_delivery
  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId);

      if (error) throw new Error(error.message);

      setSuccessMsg(`Order updated to "${getStatusLabel(nextStatus)}"`);
      await fetchOrders();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Action 5: Complete order (sets amount_paid to total)
  const handleCompleteOrder = async (order: StaffOrder) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const finalTotal =
        Number(order.total) ||
        Number(order.subtotal) + Number(order.delivery_fee || 0);

      const { error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          amount_paid: finalTotal,
        })
        .eq("id", order.id);

      if (error) throw new Error(error.message);

      setSuccessMsg("Order marked completed and balance settled!");
      await fetchOrders();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to complete order");
    }
  };

  // Action 6: Cancel order
  const handleCancelOrder = async (orderId: number) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);

      if (error) throw new Error(error.message);

      setSuccessMsg("Order cancelled.");
      await fetchOrders();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const matchStatus =
      selectedStatus === "all" || o.status === selectedStatus;
    const matchSearch =
      !search.trim() ||
      String(o.id).includes(search) ||
      o.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.contact_number.includes(search) ||
      (o.access_token && o.access_token.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
            <Link href="/staff" className="hover:underline">
              Staff Portal
            </Link>
            <span>/</span>
            <span className="text-[#4A5330]">Orders</span>
          </div>
          <h1 className="text-2xl font-black text-[#4A5330]">Orders Management</h1>
          <p className="text-xs sm:text-sm text-[#4A5330]/75">
            Process customer orders, set Maxim delivery fees, verify receipts, copy customer links, and update fulfillment.
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
            href="/staff/products"
            className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
          >
            Products
          </Link>
          <Link
            href="/staff/reports"
            className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
          >
            Reports
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs & Search */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#838F58]/20 space-y-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID, access token, customer name or phone..."
            className="w-full pl-3 pr-8 py-2 rounded-xl border border-gray-200 text-xs focus:border-[#4A5330] outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2 text-xs text-gray-400"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {ALL_STATUSES.map((st) => {
            const count =
              st === "all"
                ? orders.length
                : orders.filter((o) => o.status === st).length;
            const active = selectedStatus === st;

            return (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${active
                    ? "bg-[#4A5330] text-white shadow-xs"
                    : "bg-[#F9D1D9]/50 text-[#4A5330] hover:bg-[#F9D1D9]"
                  }`}
              >
                <span>{st === "all" ? "All Orders" : getStatusLabel(st)}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${active ? "bg-white/20 text-white" : "bg-white text-[#4A5330]"
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
          {successMsg}
        </div>
      )}

      {/* Receipt Modal Preview */}
      {activeReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-[#4A5330] flex items-center gap-2">
                <span>📑</span> Payment Receipt Screenshot
              </h3>
              <button
                onClick={() => setActiveReceiptUrl(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center p-2">
              <img
                src={activeReceiptUrl}
                alt="Receipt"
                className="max-h-[60vh] object-contain rounded-lg"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <a
                href={activeReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#838F58] hover:underline"
              >
                Open in new tab ↗
              </a>
              <button
                onClick={() => setActiveReceiptUrl(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-[#4A5330] hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders List */}
      {loading ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-[#4A5330]">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-[#838F58]/20">
          <span className="text-4xl block mb-2">📋</span>
          <h3 className="text-base font-bold text-[#4A5330]">No orders found</h3>
          <p className="text-xs text-[#4A5330]/75 mt-1">
            No orders match the selected filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const effTotal =
              Number(order.total) ||
              Number(order.subtotal) + Number(order.delivery_fee || 0);

            const isMaxim = order.delivery_option === "maxim";
            const isPickup = order.delivery_option === "pickup";

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl p-5 shadow-xs border border-[#838F58]/20 space-y-4 hover:shadow-md transition"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#4A5330] bg-[#F9D1D9]/40 px-2 py-0.5 rounded-lg">
                      #{order.id}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(
                        order.status
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {isMaxim ? "🚚 Maxim Delivery" : "🏬 Store Pickup"}
                    </span>
                  </div>

                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Customer & Items Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Customer & Address */}
                  <div className="space-y-1.5 border-r md:border-r border-gray-100 pr-2">
                    <div className="font-bold text-sm text-[#4A5330]">
                      {order.full_name}
                    </div>
                    <div className="text-gray-600">📞 {order.contact_number}</div>
                    {isMaxim && (
                      <div className="text-gray-600 bg-gray-50 p-2 rounded-xl mt-1">
                        <span className="font-bold block text-gray-700">Address:</span>
                        {order.address || "No address provided"}
                      </div>
                    )}
                    {isPickup && (
                      <div className="text-gray-600 bg-gray-50 p-2 rounded-xl mt-1">
                        <span className="font-bold block text-gray-700">Schedule:</span>
                        {order.pickup_schedule || "Store Hours"}
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-1">
                    <span className="font-bold text-gray-500 uppercase tracking-wider block text-[10px]">
                      Items ({order.order_items?.length || 0})
                    </span>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {(order.order_items || []).map((item) => (
                        <div key={item.id} className="flex justify-between text-gray-700">
                          <span className="line-clamp-1">
                            {item.qty}x {item.product_name}
                          </span>
                          <span className="font-semibold shrink-0 ml-2">
                            ₱{(Number(item.unit_price) * item.qty).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financials & Payment Option */}
                  <div className="space-y-1.5 bg-[#F9D1D9]/20 p-3 rounded-xl">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal:</span>
                      <span className="font-semibold">
                        ₱{Number(order.subtotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Delivery Fee:</span>
                      <span className="font-semibold">
                        {order.delivery_fee !== null
                          ? `₱${Number(order.delivery_fee).toFixed(2)}`
                          : "Not set yet"}
                      </span>
                    </div>
                    <div className="flex justify-between font-black text-sm text-[#FF5C93] pt-1 border-t border-gray-200">
                      <span>Total:</span>
                      <span>₱{effTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 pt-1">
                      <span>Paid:</span>
                      <span className="font-bold text-green-700">
                        ₱{Number(order.amount_paid || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Balance:</span>
                      <span className="font-bold text-amber-700">
                        ₱{Number(order.balance_due || 0).toFixed(2)}
                      </span>
                    </div>
                    {order.payment_option && (
                      <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                        Plan: {order.payment_option === "50_50" ? "50/50 COD" : "Full Advance"} | Method: {order.payment_method?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Staff Actions Toolbar */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  {/* Left: View receipt and Copy customer link buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {order.receipt_path ? (
                      <button
                        onClick={() => handleViewReceipt(order)}
                        disabled={loadingReceiptId === order.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>📑</span>
                        <span>
                          {loadingReceiptId === order.id
                            ? "Loading..."
                            : "View Receipt"}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">
                        No receipt attached
                      </span>
                    )}

                    {/* Copy customer link button for staff to send via SMS/Messenger */}
                    <button
                      onClick={() => handleCopyCustomerLink(order)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] border border-[#838F58]/30 transition cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Copy customer link to send via Messenger or SMS"
                    >
                      <span>🔗</span>
                      <span>
                        {copiedOrderId === order.id
                          ? "Link Copied!"
                          : "Copy customer link"}
                      </span>
                    </button>
                  </div>

                  {/* Right: Dynamic Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1. Maxim awaiting fee action */}
                    {order.status === "awaiting_fee" && isMaxim && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">₱ Fee:</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 80"
                          value={feeInputs[order.id] || ""}
                          onChange={(e) =>
                            setFeeInputs({
                              ...feeInputs,
                              [order.id]: e.target.value,
                            })
                          }
                          className="w-20 px-2 py-1 rounded-xl border border-gray-300 text-xs font-bold outline-none"
                        />
                        <button
                          onClick={() => handleSetDeliveryFee(order.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition cursor-pointer"
                        >
                          Set Fee & Request Payment
                        </button>
                      </div>
                    )}

                    {/* 2. Payment verification & confirm_order RPC */}
                    {(order.status === "payment_submitted" ||
                      (order.status === "awaiting_payment" && order.receipt_path)) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-500">
                            ₱ Amount:
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amountInputs[order.id] || ""}
                            onChange={(e) =>
                              setAmountInputs({
                                ...amountInputs,
                                [order.id]: e.target.value,
                              })
                            }
                            className="w-24 px-2 py-1 rounded-xl border border-gray-300 text-xs font-bold text-green-700 outline-none"
                          />
                          <button
                            onClick={() => handleConfirmOrder(order)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-green-700 text-white hover:bg-green-800 transition cursor-pointer shadow-xs"
                          >
                            Confirm Order (Deduct Stock)
                          </button>
                        </div>
                      )}

                    {/* 3. Mark ready_for_pickup or out_for_delivery */}
                    {order.status === "confirmed" && (
                      <>
                        {isPickup ? (
                          <button
                            onClick={() =>
                              handleUpdateStatus(order.id, "ready_for_pickup")
                            }
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#838F58] text-white hover:bg-[#838F58]/90 transition cursor-pointer"
                          >
                            Mark Ready for Pickup 🏬
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              handleUpdateStatus(order.id, "out_for_delivery")
                            }
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#838F58] text-white hover:bg-[#838F58]/90 transition cursor-pointer"
                          >
                            Mark Out for Delivery 🛵
                          </button>
                        )}
                      </>
                    )}

                    {/* 4. Complete order */}
                    {(order.status === "ready_for_pickup" ||
                      order.status === "out_for_delivery") && (
                        <button
                          onClick={() => handleCompleteOrder(order)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition cursor-pointer"
                        >
                          Mark Completed (Settle Full) ✓
                        </button>
                      )}

                    {/* 5. Cancel order (if not completed and not cancelled) */}
                    {order.status !== "completed" &&
                      order.status !== "cancelled" && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StaffOrdersPage() {
  return (
    <RequireStaff>
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold text-[#4A5330]">Loading orders portal...</p>
          </div>
        }
      >
        <StaffOrdersContent />
      </Suspense>
    </RequireStaff>
  );
}
