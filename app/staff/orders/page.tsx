"use client";

import React, { Suspense, useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { getStatusBadgeClass, getStatusLabel, getPaymentStatusBadgeClass, getPaymentStatusLabel } from "@/lib/status";

interface OrderItem {
  id: number;
  order_id: number;
  product_name: string;
  variant_id?: number | string | null;
  variant_name?: string | null;
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
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_distance_km?: number | null;
  subtotal: number;
  delivery_fee: number | null;
  payment_option: "50_50" | "full" | null;
  payment_method: "cash" | "gcash" | "bank" | null;
  payment_status: string | null;
  payment_reference: string | null;
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
  "needs_payment_check",
  "awaiting_fee",
  "awaiting_payment",
  "confirmed",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
];

// ── Sound utility (Web Audio API) ─────────────────────────────────────────────
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
    // Ignore if audio context fails
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // Amount received input mapping for verify_payment: orderId -> amount
  const [amountInputs, setAmountInputs] = useState<Record<number, string>>({});

  // Receipt preview signed URL modal
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<number | null>(null);

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Track known pending count for new-payment detection
  const prevPendingCountRef = useRef<number | null>(null);

  // ── fetch orders ────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersErr) throw new Error(ordersErr.message);

      const rawOrders = (ordersData as StaffOrder[]) || [];

      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("*");

      if (itemsErr) console.warn("Could not load order items:", itemsErr.message);

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

      // Sort: pending payment orders first
      fullOrders.sort((a, b) => {
        const aPending = a.payment_status === "pending" && a.status !== "cancelled" ? 0 : 1;
        const bPending = b.payment_status === "pending" && b.status !== "cancelled" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const currentPendingCount = fullOrders.filter(
        (o) => o.payment_status === "pending" && o.status !== "cancelled"
      ).length;

      // Beep if new pending payments arrived
      if (prevPendingCountRef.current !== null && currentPendingCount > prevPendingCountRef.current) {
        if (soundEnabled && audioCtxRef.current) {
          playBeep(audioCtxRef.current);
        }
      }
      prevPendingCountRef.current = currentPendingCount;

      // Update tab title with pending count
      if (typeof document !== "undefined") {
        if (currentPendingCount > 0) {
          document.title = `(${currentPendingCount}) Payments to verify - Pet Pantry`;
        } else {
          document.title = "Orders - Staff Portal - Pet Pantry";
        }
      }

      setOrders(fullOrders);

      // Pre-populate amount input defaults with full order total
      const initialAmounts: Record<string, string> = {};
      fullOrders.forEach((o) => {
        const effTotal =
          Number(o.total) || Number(o.subtotal) + Number(o.delivery_fee || 0);
        initialAmounts[o.id] = effTotal.toFixed(2);
      });
      setAmountInputs((prev) => ({ ...initialAmounts, ...prev }));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    fetchOrders(false);
  }, [fetchOrders]);

  // Poll every 20 seconds
  useEffect(() => {
    const timer = setInterval(() => fetchOrders(true), 20000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  // Reset title on unmount
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.title = "Pet Pantry";
      }
    };
  }, []);

  // ── Sound toggle (must happen in user gesture handler) ─────────────────────
  const handleToggleSound = () => {
    if (!soundEnabled) {
      // Create AudioContext on first user click (browser requirement)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      // Play a test beep immediately to confirm it works
      playBeep(audioCtxRef.current);
    }
    setSoundEnabled((prev) => !prev);
  };

  // ── Copy customer link ──────────────────────────────────────────────────────
  const handleCopyCustomerLink = (order: StaffOrder) => {
    if (typeof window !== "undefined") {
      const token = order.access_token || String(order.id);
      const link = `${window.location.origin}/orders/${token}`;
      navigator.clipboard.writeText(link);
      setCopiedOrderId(order.id);
      setTimeout(() => setCopiedOrderId(null), 2000);
    }
  };

  // ── Set / adjust Maxim delivery fee ─────────────────────────────────────────
  const handleSetDeliveryFee = async (order: StaffOrder) => {
    const rawVal =
      feeInputs[order.id] !== undefined
        ? feeInputs[order.id]
        : order.delivery_fee !== null
        ? String(order.delivery_fee)
        : "";
    const feeNum = parseFloat(rawVal);

    if (isNaN(feeNum) || feeNum < 0) {
      setErrorMsg("Please enter a valid delivery fee amount");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updatePayload: { delivery_fee: number; status?: string } = {
        delivery_fee: feeNum,
      };

      if (order.status === "awaiting_fee") {
        updatePayload.status = "awaiting_payment";
      }

      const { error } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", order.id);

      if (error) throw new Error(error.message);

      setSuccessMsg(
        order.status === "awaiting_fee"
          ? "Delivery fee updated! Order is now awaiting payment."
          : "Delivery fee updated successfully!"
      );
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to set delivery fee");
    }
  };

  // ── View receipt ────────────────────────────────────────────────────────────
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

  // ── Verify payment via verify_payment RPC ───────────────────────────────────
  const handleVerifyPayment = async (order: StaffOrder) => {
    const amtStr = amountInputs[order.id];
    const amount = parseFloat(amtStr);

    if (isNaN(amount) || amount < 0) {
      setErrorMsg("Please enter a valid amount received");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.rpc("verify_payment", {
        p_order_id: order.id,
        p_amount_paid: amount,
      });

      if (error) throw new Error(error.message);

      setSuccessMsg("Payment verified successfully!");
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to verify payment");
    }
  };

  // ── Reject payment via cancel_order with p_reject_payment=true ─────────────
  const handleRejectPayment = async (order: StaffOrder) => {
    if (!window.confirm(`Reject payment for Order #${order.id}? This will cancel the order and restore stock.`)) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.rpc("cancel_order", {
        p_order_id: order.id,
        p_reject_payment: true,
      });

      if (error) throw new Error(error.message);

      setSuccessMsg("Payment rejected. Order cancelled and stock restored.");
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to reject payment");
    }
  };

  // ── Update status (ready_for_pickup / out_for_delivery) ─────────────────────
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
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // ── Complete order ──────────────────────────────────────────────────────────
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

      setSuccessMsg("Order marked completed!");
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to complete order");
    }
  };

  // ── Cancel order via cancel_order RPC ──────────────────────────────────────
  const handleCancelOrder = async (orderId: number) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.rpc("cancel_order", {
        p_order_id: orderId,
        p_reject_payment: false,
      });

      if (error) throw new Error(error.message);

      setSuccessMsg("Order cancelled.");
      await fetchOrders(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  // ── Filter orders ───────────────────────────────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    let matchStatus = true;
    if (selectedStatus === "needs_payment_check") {
      matchStatus = o.payment_status === "pending" && o.status !== "cancelled";
    } else if (selectedStatus !== "all") {
      matchStatus = o.status === selectedStatus;
    }

    const matchSearch =
      !search.trim() ||
      String(o.id).includes(search) ||
      o.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.contact_number.includes(search) ||
      (o.access_token && o.access_token.toLowerCase().includes(search.toLowerCase()));

    return matchStatus && matchSearch;
  });

  const pendingPaymentCount = orders.filter(
    (o) => o.payment_status === "pending" && o.status !== "cancelled"
  ).length;

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

        <div className="flex flex-wrap items-center gap-2">
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
            let count = 0;
            if (st === "all") count = orders.length;
            else if (st === "needs_payment_check") count = pendingPaymentCount;
            else count = orders.filter((o) => o.status === st).length;

            const active = selectedStatus === st;
            const isAlert = st === "needs_payment_check" && count > 0;

            return (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? isAlert
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-[#4A5330] text-white shadow-xs"
                    : isAlert
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    : "bg-[#F9D1D9]/50 text-[#4A5330] hover:bg-[#F9D1D9]"
                }`}
              >
                <span>
                  {st === "all"
                    ? "All Orders"
                    : st === "needs_payment_check"
                    ? "⚠️ Needs payment check"
                    : getStatusLabel(st)}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-white text-[#4A5330]"
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
            const paymentStatus = order.payment_status;
            const isPaymentPending = paymentStatus === "pending" && order.status !== "cancelled";
            const isPaymentVerificationBlocked =
              (paymentStatus === "pending" || paymentStatus === "unpaid" || paymentStatus === "rejected");

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl p-5 shadow-xs border transition ${
                  isPaymentPending
                    ? "border-amber-400 shadow-amber-100 shadow-md"
                    : "border-[#838F58]/20 hover:shadow-md"
                }`}
              >
                {/* Pending payment alert banner */}
                {isPaymentPending && (
                  <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-xs font-bold text-amber-800">
                    <span>⚠️</span>
                    <span>Payment to verify</span>
                    {order.payment_reference && (
                      <span className="ml-auto font-mono text-amber-900">
                        Ref: {order.payment_reference}
                      </span>
                    )}
                  </div>
                )}

                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#4A5330] bg-[#F9D1D9]/40 px-2 py-0.5 rounded-lg">
                      #{order.id}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(order.status)}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                    {paymentStatus && paymentStatus !== "unpaid" && (
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getPaymentStatusBadgeClass(paymentStatus)}`}
                      >
                        {getPaymentStatusLabel(paymentStatus)}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-gray-500">
                      {isMaxim ? "🚚 Maxim Delivery" : "🏬 Store Pickup"}
                    </span>
                  </div>

                  <span className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Customer & Items Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-3">
                  {/* Customer & Address */}
                  <div className="space-y-1.5 border-r md:border-r border-gray-100 pr-2">
                    <div className="font-bold text-sm text-[#4A5330]">
                      {order.full_name}
                    </div>
                    <div className="text-gray-600">📞 {order.contact_number}</div>
                    {isMaxim && (
                      <div className="text-gray-600 bg-gray-50 p-2 rounded-xl mt-1 space-y-1">
                        <div>
                          <span className="font-bold text-gray-700">Address: </span>
                          <span>{order.address || "No address provided"}</span>
                        </div>
                        {order.delivery_lat !== null && order.delivery_lng !== null && (
                          <div className="pt-0.5">
                            <a
                              href={`https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-bold text-xs text-[#4A5330] underline hover:text-[#FF5C93]"
                            >
                              <span>📍 Open map</span>
                              <span>↗</span>
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    {isPickup && (
                      <div className="text-gray-600 bg-gray-50 p-2 rounded-xl mt-1">
                        <span className="font-bold block text-gray-700">Schedule:</span>
                        {order.pickup_schedule || "Store Hours"}
                      </div>
                    )}
                  </div>

                  {/* Financials & Payment Option (Section 2: Payment) */}
                  <div className="space-y-1.5 bg-[#F9D1D9]/20 p-3 rounded-xl border-r md:border-r border-gray-100">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal:</span>
                      <span className="font-semibold">
                        ₱{Number(order.subtotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Delivery Fee:</span>
                        {order.delivery_distance_km !== null && order.delivery_distance_km !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold border border-green-200">
                            Auto fee
                          </span>
                        )}
                      </div>
                      <span className="font-semibold">
                        {order.delivery_fee !== null
                          ? `₱${Number(order.delivery_fee).toFixed(2)}${
                              order.delivery_distance_km !== null && order.delivery_distance_km !== undefined
                                ? ` (${order.delivery_distance_km} km)`
                                : ""
                            }`
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
                    {Number(order.balance_due || 0) > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Balance:</span>
                        <span className="font-bold text-amber-700">
                          ₱{Number(order.balance_due || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                      Payment: {order.payment_option === "50_50" ? "50% Advance + 50% COD" : "Full payment"}
                      {order.payment_method && (
                        <span> | {order.payment_method === "cash" ? "Cash" : order.payment_method === "gcash" ? "GCash" : "Bank"}</span>
                      )}
                    </div>
                  </div>

                  {/* Items List (Section 3: Items) */}
                  <div className="space-y-1">
                    <span className="font-bold text-gray-500 uppercase tracking-wider block text-[10px]">
                      Items ({order.order_items?.length || 0})
                    </span>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {(order.order_items || []).map((item) => (
                        <div key={item.id} className="flex justify-between text-gray-700">
                          <span className="line-clamp-1">
                            {item.qty}x {item.product_name}
                            {item.variant_name ? ` (${item.variant_name})` : ""}
                          </span>
                          <span className="font-semibold shrink-0 ml-2">
                            ₱{(Number(item.unit_price) * item.qty).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Staff Actions Toolbar */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  {/* Row 1: View receipt + Copy link */}
                  <div className="flex flex-wrap items-center gap-2">
                    {order.receipt_path ? (
                      <button
                        onClick={() => handleViewReceipt(order)}
                        disabled={loadingReceiptId === order.id}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>📑</span>
                        <span>
                          {loadingReceiptId === order.id ? "Loading..." : "View Receipt"}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">No receipt attached</span>
                    )}

                    <button
                      onClick={() => handleCopyCustomerLink(order)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] border border-[#838F58]/30 transition cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Copy customer link to send via Messenger or SMS"
                    >
                      <span>🔗</span>
                      <span>
                        {copiedOrderId === order.id ? "Link Copied!" : "Copy customer link"}
                      </span>
                    </button>
                  </div>

                  {/* Row 2: Payment verification panel (for confirmed + pending payment) */}
                  {order.status === "confirmed" && isPaymentPending && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                      <p className="text-xs font-bold text-amber-800">
                        💰 Verify Payment
                        {order.payment_reference && (
                          <span className="ml-2 font-mono font-normal">
                            — Ref: {order.payment_reference}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">₱ Amount received:</span>
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
                          className="w-28 px-2 py-1.5 rounded-xl border border-gray-300 text-xs font-bold text-green-700 outline-none min-h-[36px]"
                        />
                        <button
                          onClick={() => handleVerifyPayment(order)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-green-700 text-white hover:bg-green-800 transition cursor-pointer shadow-xs flex items-center gap-1"
                        >
                          ✓ Payment verified
                        </button>
                        <button
                          onClick={() => handleRejectPayment(order)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition cursor-pointer flex items-center gap-1"
                        >
                          ✕ Reject payment
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Row 3: Dynamic Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1. Maxim fee adjustment action (while awaiting_fee or awaiting_payment) */}
                    {isMaxim && (order.status === "awaiting_fee" || order.status === "awaiting_payment") && (
                      <div className="flex items-center gap-2 bg-amber-50/70 p-2 rounded-xl border border-amber-200">
                        <span className="text-xs font-bold text-amber-900">₱ Fee:</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={
                            feeInputs[order.id] !== undefined
                              ? feeInputs[order.id]
                              : order.delivery_fee !== null
                              ? String(order.delivery_fee)
                              : ""
                          }
                          onChange={(e) =>
                            setFeeInputs({
                              ...feeInputs,
                              [order.id]: e.target.value,
                            })
                          }
                          className="w-24 px-2 py-1.5 rounded-xl border border-gray-300 text-xs font-bold outline-none min-h-[36px] bg-white"
                        />
                        <button
                          onClick={() => handleSetDeliveryFee(order)}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition cursor-pointer shadow-xs"
                        >
                          Save Fee
                        </button>
                      </div>
                    )}

                    {/* 2. Mark ready_for_pickup or out_for_delivery (shown while confirmed, regardless of payment pending) */}
                    {order.status === "confirmed" && (
                      <>
                        {isPickup ? (
                          <button
                            onClick={() =>
                              handleUpdateStatus(order.id, "ready_for_pickup")
                            }
                            className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#838F58] text-white hover:bg-[#838F58]/90 transition cursor-pointer"
                          >
                            Mark Ready for Pickup 🏬
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleUpdateStatus(order.id, "out_for_delivery")
                              }
                              disabled={isPaymentVerificationBlocked}
                              title={isPaymentVerificationBlocked ? "Verify the payment first" : undefined}
                              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isPaymentVerificationBlocked
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-[#838F58] text-white hover:bg-[#838F58]/90"
                              }`}
                            >
                              Mark Out for Delivery 🛵
                            </button>
                            {isPaymentVerificationBlocked && (
                              <span className="text-[11px] text-amber-700 font-semibold">
                                Verify the payment first
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* 3. Complete order */}
                    {(order.status === "ready_for_pickup" || order.status === "out_for_delivery") && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCompleteOrder(order)}
                          disabled={isPaymentVerificationBlocked}
                          title={isPaymentVerificationBlocked ? "Verify the payment first" : undefined}
                          className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            isPaymentVerificationBlocked
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-[#4A5330] text-white hover:bg-[#4A5330]/90"
                          }`}
                        >
                          Complete
                        </button>
                        {isPaymentVerificationBlocked && (
                          <span className="text-[11px] text-amber-700 font-semibold">
                            Verify the payment first
                          </span>
                        )}
                      </div>
                    )}

                    {/* 4. Cancel order */}
                    {order.status !== "completed" &&
                      order.status !== "cancelled" && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent transition cursor-pointer"
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
