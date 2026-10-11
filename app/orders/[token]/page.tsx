"use client";

import React, { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getStatusLabel, getStatusBadgeClass } from "@/lib/status";
import { addOrderToken } from "@/lib/myOrders";
import { GCASH, BANK } from "@/lib/paymentConfig";

interface OrderItem {
  id: string | number;
  product_id: string | number;
  product_name: string;
  unit_price: number;
  qty: number;
}

interface OrderData {
  id: number;
  status: string;
  full_name: string;
  contact_number: string;
  delivery_option: "maxim" | "pickup";
  address: string | null;
  pickup_schedule: string | null;
  subtotal: number;
  delivery_fee: number | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_option: "50_50" | "full" | null;
  payment_method: "cash" | "gcash" | "bank" | null;
  created_at: string;
  receipt_path?: string | null;
  order_items?: OrderItem[];
}

function GuestOrderDetailContent() {
  const params = useParams();
  const token = params?.token as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Payment form states
  const [paymentOption, setPaymentOption] = useState<"50_50" | "full">("50_50");
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "bank" | "cash">("gcash");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [bankQrError, setBankQrError] = useState(false);

  const fetchOrderData = useCallback(async (isSilent = false) => {
    if (!token) return;
    if (!isSilent) setLoading(true);
    setErrorMsg(null);

    try {
      // Call get_order RPC with the guest token
      const { data, error } = await supabase.rpc("get_order", {
        p_token: token,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        setOrder(null);
      } else {
        setOrder(data as OrderData);
        // Ensure token is stored in localStorage recent orders list
        addOrderToken(token);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load order");
      setOrder(null);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    fetchOrderData(false);
  }, [fetchOrderData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchOrderData(true);
    }, 30000);

    return () => clearInterval(timer);
  }, [fetchOrderData]);

  // Clean up object URL when component unmounts or receipt changes
  useEffect(() => {
    return () => {
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  // Compute amount to pay now based on chosen option
  const amountToPayNow = useMemo(() => {
    if (!order) return 0;
    const effectiveTotal =
      Number(order.total) ||
      Number(order.subtotal) + Number(order.delivery_fee || 0);
    if (paymentOption === "50_50") {
      return effectiveTotal / 2;
    }
    return effectiveTotal;
  }, [order, paymentOption]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Handle file input change with preview and strict validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setReceiptFile(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const fileNameLower = file.name.toLowerCase();
    const hasValidExt =
      fileNameLower.endsWith(".jpg") ||
      fileNameLower.endsWith(".jpeg") ||
      fileNameLower.endsWith(".png") ||
      fileNameLower.endsWith(".webp");

    if (!validTypes.includes(file.type) && !hasValidExt) {
      setErrorMsg("Invalid file format. Only JPG, PNG, or WebP images are accepted.");
      setReceiptFile(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
      e.target.value = "";
      return;
    }

    // 5 MB limit (5 * 1024 * 1024 bytes)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMsg("File is too large. Maximum receipt file size is 5 MB.");
      setReceiptFile(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
      e.target.value = "";
      return;
    }

    setErrorMsg(null);
    setReceiptFile(file);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(URL.createObjectURL(file));
  };

  // Submit payment form handler
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !token) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    let receiptPath: string | null = null;

    if (paymentMethod !== "cash") {
      if (!receiptFile) {
        setErrorMsg("Please upload a screenshot of your payment.");
        return;
      }

      setSubmittingPayment(true);

      try {
        const cleanedFileName = receiptFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const timestamp = Date.now();
        // Upload path MUST be: {token}/{timestamp}-{cleaned file name}
        const storagePath = `${token}/${timestamp}-${cleanedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("receipts")
          .upload(storagePath, receiptFile);

        if (uploadErr) {
          throw new Error(`Receipt upload failed: ${uploadErr.message}`);
        }

        receiptPath = storagePath;
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to upload receipt");
        setSubmittingPayment(false);
        return;
      }
    } else {
      setSubmittingPayment(true);
    }

    try {
      // Call database function submit_payment(p_token, p_option, p_method, p_receipt_path)
      const { error: rpcErr } = await supabase.rpc("submit_payment", {
        p_token: token,
        p_option: paymentOption,
        p_method: paymentMethod,
        p_receipt_path: receiptPath,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      setSuccessMsg("Payment submitted! Your order status is now Payment under review.");
      setReceiptFile(null);
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
        setReceiptPreview(null);
      }

      // Refresh order data
      await fetchOrderData(true);
    } catch (err: unknown) {
      console.error("submit_payment error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit payment");
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#4A5330]">
          Loading your order details...
        </p>
      </div>
    );
  }

  // Friendly "Order not found" message when get_order returns null
  if (!order) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center border border-[#838F58]/20 shadow-xs">
          <span className="text-4xl block mb-3">🔍</span>
          <h2 className="text-xl font-bold text-[#4A5330] mb-2">Order Not Found</h2>
          <p className="text-sm text-[#4A5330]/75 mb-6">
            We couldn&apos;t find an order matching this access token. The link may be incorrect, or the order could not be retrieved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/orders"
              className="px-5 py-2.5 rounded-xl bg-[#4A5330] text-white text-xs font-bold hover:bg-[#4A5330]/90 transition"
            >
              Recent Orders on Device
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-gray-100 text-[#4A5330] text-xs font-bold hover:bg-gray-200 transition"
            >
              Shop Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const effectiveTotal =
    Number(order.total) ||
    Number(order.subtotal) + Number(order.delivery_fee || 0);

  const items = order.order_items || [];

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      {/* Save / Bookmark Note Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔖</span>
          <div>
            <p className="text-xs sm:text-sm font-bold text-[#4A5330]">
              Save or bookmark this page link!
            </p>
            <p className="text-[11px] text-[#4A5330]/75">
              This private guest order link allows you to check your order progress and receipt anytime.
            </p>
          </div>
        </div>

        <button
          onClick={handleCopyLink}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#838F58]/20 hover:bg-[#838F58]/30 text-[#4A5330] transition border border-[#838F58]/30 flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span>{copiedLink ? "✓ Link Copied!" : "📋 Copy Order Link"}</span>
        </button>
      </div>

      {/* Header & Status Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#838F58] font-bold mb-1">
              <Link href="/orders" className="hover:underline">
                My Orders
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Order #{order.id}</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Order Summary</h1>
            <p className="text-xs text-gray-400">
              Placed on {new Date(order.created_at).toLocaleString()} • Auto-refreshes every 30s
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-full ${getStatusBadgeClass(
                order.status
              )}`}
            >
              {getStatusLabel(order.status)}
            </span>
          </div>
        </div>

        {/* Dynamic Status Explanation Message */}
        <div className="p-4 rounded-xl bg-[#F9D1D9]/40 border border-[#838F58]/20 text-xs sm:text-sm text-[#4A5330]">
          {order.status === "awaiting_fee" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">⏳</span>
              <div>
                <p className="font-bold">Awaiting Delivery Fee Assessment</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Our staff is verifying your address to calculate the Maxim delivery fee. Once updated, you can proceed with your payment here.
                </p>
              </div>
            </div>
          )}

          {order.status === "awaiting_payment" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">💳</span>
              <div>
                <p className="font-bold">Payment Needed to Confirm Order</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Please review the final total below and submit your payment option and receipt. Orders are confirmed only after the required advance payment is received and verified!
                </p>
              </div>
            </div>
          )}

          {order.status === "payment_submitted" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">📑</span>
              <div>
                <p className="font-bold">Payment Under Review</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Thank you! We have received your payment submission. Our staff is verifying your receipt. Your order status will update once confirmed.
                </p>
              </div>
            </div>
          )}

          {order.status === "confirmed" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-bold">Order Confirmed!</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Your advance payment has been confirmed. Our team is now packing your pet supplies with care.
                </p>
              </div>
            </div>
          )}

          {order.status === "ready_for_pickup" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">🏬</span>
              <div>
                <p className="font-bold">Ready for Pickup!</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Your package is ready and waiting at The Pet Pantry shop! Please visit during store hours.
                </p>
              </div>
            </div>
          )}

          {order.status === "out_for_delivery" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">🛵</span>
              <div>
                <p className="font-bold">Out for Delivery via Maxim</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  Your order is on the way! Please keep your phone reachable for the Maxim rider.
                </p>
              </div>
            </div>
          )}

          {order.status === "completed" && (
            <div className="flex items-start gap-2">
              <span className="text-lg">🎉</span>
              <div>
                <p className="font-bold">Order Completed</p>
                <p className="text-xs text-[#4A5330]/80 mt-0.5">
                  This order has been completed and settled. Thank you for pampering your pet with The Pet Pantry!
                </p>
              </div>
            </div>
          )}

          {order.status === "cancelled" && (
            <div className="flex items-start gap-2 text-red-700">
              <span className="text-lg">❌</span>
              <div>
                <p className="font-bold">Order Cancelled</p>
                <p className="text-xs text-red-600 mt-0.5">
                  This order was cancelled. Please feel free to browse our catalog or contact the shop if you have questions.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Two Column Layout: Order Details + Payment Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Items and Fulfillment Details */}
        <div className="md:col-span-2 space-y-6">
          {/* Items Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>📦</span> Ordered Items
            </h2>

            <div className="divide-y divide-gray-100">
              {items.map((item, index) => (
                <div
                  key={item.id ?? index}
                  className="py-3 flex justify-between items-center text-sm"
                >
                  <div>
                    <span className="font-bold text-[#4A5330]">
                      {item.product_name}
                    </span>
                    <div className="text-xs text-gray-400">
                      ₱{Number(item.unit_price).toFixed(2)} × {item.qty}
                    </div>
                  </div>
                  <span className="font-bold text-[#4A5330]">
                    ₱{(Number(item.unit_price) * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="border-t border-gray-100 pt-3 space-y-2 text-sm text-[#4A5330]/85">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold">
                  ₱{Number(order.subtotal).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Delivery Fee:</span>
                <span className="font-bold">
                  {order.delivery_option === "pickup"
                    ? "₱0.00 (Store Pickup)"
                    : order.delivery_fee !== null
                    ? `₱${Number(order.delivery_fee).toFixed(2)}`
                    : "To be assessed"}
                </span>
              </div>

              <div className="flex justify-between text-base font-black text-[#FF5C93] pt-2 border-t border-gray-100">
                <span>Total Amount:</span>
                <span>₱{effectiveTotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-xs text-[#4A5330] pt-1">
                <span>Amount Paid:</span>
                <span className="font-bold text-green-700">
                  ₱{Number(order.amount_paid || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-xs text-amber-800 font-bold">
                <span>Balance Due:</span>
                <span>
                  ₱
                  {Number(
                    order.balance_due ??
                      effectiveTotal - Number(order.amount_paid || 0)
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery & Recipient Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-3">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>📍</span> Recipient & Delivery Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div>
                <span className="text-gray-400 block text-xs">Recipient Name</span>
                <span className="font-bold text-[#4A5330]">{order.full_name}</span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs">Contact Number</span>
                <span className="font-bold text-[#4A5330]">{order.contact_number}</span>
              </div>

              <div>
                <span className="text-gray-400 block text-xs">Fulfillment Method</span>
                <span className="font-bold text-[#4A5330]">
                  {order.delivery_option === "maxim"
                    ? "Maxim Delivery"
                    : "Store Self-Pickup"}
                </span>
              </div>

              {order.delivery_option === "maxim" ? (
                <div>
                  <span className="text-gray-400 block text-xs">Delivery Address</span>
                  <span className="font-bold text-[#4A5330]">
                    {order.address || "N/A"}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-gray-400 block text-xs">Pickup Schedule</span>
                  <span className="font-bold text-[#4A5330]">
                    {order.pickup_schedule || "Store Hours"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Payment Section */}
        <div className="md:col-span-1 space-y-6">
          {/* Active Payment Form when awaiting_payment */}
          {order.status === "awaiting_payment" && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border-2 border-[#838F58]/30 space-y-5">
              <div>
                <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                  <span>💳</span> Complete Payment
                </h2>
                <p className="text-xs text-[#4A5330]/80 mt-1">
                  Choose your payment plan and preferred method.
                </p>
              </div>

              <form onSubmit={handlePaymentSubmit} className="space-y-5">
                {/* 1. Payment Option Choice */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-2">
                    1. Choose Payment Option
                  </label>
                  <div className="space-y-2">
                    <label
                      className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs cursor-pointer transition ${
                        paymentOption === "50_50"
                          ? "border-[#4A5330] bg-[#838F58]/10 font-bold shadow-xs"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment_option"
                        value="50_50"
                        checked={paymentOption === "50_50"}
                        onChange={() => setPaymentOption("50_50")}
                        className="mt-0.5 accent-[#4A5330]"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span>50% advance + 50% COD</span>
                          <span className="font-black text-[#FF5C93]">
                            ₱{(effectiveTotal / 2).toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#4A5330]/70 font-normal block mt-0.5">
                          Pay half now to confirm, balance upon delivery/pickup.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs cursor-pointer transition ${
                        paymentOption === "full"
                          ? "border-[#4A5330] bg-[#838F58]/10 font-bold shadow-xs"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment_option"
                        value="full"
                        checked={paymentOption === "full"}
                        onChange={() => setPaymentOption("full")}
                        className="mt-0.5 accent-[#4A5330]"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span>Full advance payment</span>
                          <span className="font-black text-[#FF5C93]">
                            ₱{effectiveTotal.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#4A5330]/70 font-normal block mt-0.5">
                          Settle 100% now for hassle-free drop-off.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Amount to Pay Now Card */}
                <div className="p-3.5 bg-[#F9D1D9]/50 rounded-xl border border-[#838F58]/20 text-center">
                  <span className="text-xs text-[#4A5330]/80 block font-semibold">
                    Amount to Pay Now ({paymentOption === "50_50" ? "50%" : "Full"}):
                  </span>
                  <span className="text-2xl font-black text-[#FF5C93] block mt-0.5">
                    ₱{amountToPayNow.toFixed(2)}
                  </span>
                </div>

                {/* 2. Payment Method Choice (Three Buttons) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-2">
                    2. Select Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("gcash")}
                      className={`py-2.5 px-1 rounded-xl text-xs font-bold transition border cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === "gcash"
                          ? "bg-[#4A5330] text-white border-[#4A5330] shadow-xs"
                          : "bg-gray-50 text-[#4A5330] border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-base">📱</span>
                      <span>GCash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("bank")}
                      className={`py-2.5 px-1 rounded-xl text-xs font-bold transition border cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === "bank"
                          ? "bg-[#4A5330] text-white border-[#4A5330] shadow-xs"
                          : "bg-gray-50 text-[#4A5330] border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-base">🏦</span>
                      <span>Bank</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cash")}
                      className={`py-2.5 px-1 rounded-xl text-xs font-bold transition border cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === "cash"
                          ? "bg-[#4A5330] text-white border-[#4A5330] shadow-xs"
                          : "bg-gray-50 text-[#4A5330] border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <span className="text-base">💵</span>
                      <span>Cash</span>
                    </button>
                  </div>
                </div>

                {/* 3. Method-Specific Instructions & Details */}
                {/* GCash */}
                {paymentMethod === "gcash" && (
                  <div className="space-y-3 p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs">
                    {/* Centered Large QR Code */}
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-blue-100 shadow-xs">
                      <img
                        src={GCASH.qr}
                        alt="GCash QR Code"
                        className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-lg"
                      />
                      <span className="text-xs font-bold text-[#4A5330] mt-2 tracking-wide uppercase">
                        Scan to pay
                      </span>
                    </div>

                    <div className="space-y-1.5 text-blue-900 pt-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-blue-800">Account Name:</span>
                        <span className="font-bold">{GCASH.accountName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-blue-800">GCash Number:</span>
                        <span className="font-bold">{GCASH.number}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-blue-200">
                        <span className="font-semibold text-blue-800">Amount to Pay Now:</span>
                        <span className="font-black text-[#FF5C93]">
                          ₱{amountToPayNow.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bank Transfer */}
                {paymentMethod === "bank" && (
                  <div className="space-y-3 p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-200 text-xs">
                    {/* Bank QR Code (hidden if fails to load) */}
                    {!bankQrError && (
                      <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-indigo-100 shadow-xs">
                        <img
                          src={BANK.qr}
                          alt="Bank QR Code"
                          onError={() => setBankQrError(true)}
                          className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-lg"
                        />
                        <span className="text-xs font-bold text-[#4A5330] mt-2 tracking-wide uppercase">
                          Scan to pay
                        </span>
                      </div>
                    )}

                    <div className="space-y-1.5 text-indigo-900 pt-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-indigo-800">Bank Name:</span>
                        <span className="font-bold">{BANK.bankName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-indigo-800">Account Name:</span>
                        <span className="font-bold">{BANK.accountName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-indigo-800">Account Number:</span>
                        <span className="font-bold font-mono">{BANK.accountNumber}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-indigo-200">
                        <span className="font-semibold text-indigo-800">Amount to Pay Now:</span>
                        <span className="font-black text-[#FF5C93]">
                          ₱{amountToPayNow.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cash */}
                {paymentMethod === "cash" && (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2 text-amber-900">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-base">💵</span>
                      <span>Cash Payment</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-amber-950">
                      Pay in cash when you pick up or receive your order. Your order is confirmed after our staff approve it. The remaining 50% in the COD option is also paid in cash on delivery or pickup.
                    </p>
                    <div className="flex justify-between pt-1.5 border-t border-amber-200 text-xs">
                      <span className="font-semibold">Amount to Pay:</span>
                      <span className="font-black text-[#FF5C93]">
                        ₱{amountToPayNow.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Screenshot Upload with Live Preview (Required unless cash) */}
                {paymentMethod !== "cash" && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330]">
                      Upload a screenshot of your payment *
                    </label>
                    <input
                      type="file"
                      required
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#F9D1D9] file:text-[#4A5330] hover:file:bg-[#F9D1D9]/80 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-400">
                      Only JPG, PNG or WebP up to 5 MB accepted.
                    </p>

                    {/* Screenshot Live Preview */}
                    {receiptPreview && (
                      <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-center">
                        <span className="text-[11px] font-bold text-gray-600 block mb-1.5">
                          ✓ Receipt Selected (Preview):
                        </span>
                        <img
                          src={receiptPreview}
                          alt="Receipt Preview"
                          className="max-h-48 max-w-full object-contain rounded-lg mx-auto border border-gray-100 shadow-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Important Advance Payment Note */}
                <div className="p-3 bg-[#F9D1D9]/40 rounded-xl border border-[#838F58]/20 text-[11px] text-[#4A5330] leading-snug">
                  ⚠️ <strong>Note:</strong> Orders are confirmed only after the required advance payment is received and verified. Please double-check your order before paying.
                </div>

                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submittingPayment ? "Submitting Payment..." : "Submit Payment →"}
                </button>
              </form>
            </div>
          )}

          {/* Payment Info Card if already submitted or confirmed */}
          {order.status !== "awaiting_payment" && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-3 text-xs">
              <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                <span>💳</span> Payment Status
              </h2>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Payment Option:</span>
                  <span className="font-bold text-[#4A5330]">
                    {order.payment_option === "50_50"
                      ? "50% Advance + 50% COD"
                      : order.payment_option === "full"
                      ? "Full 100% Advance"
                      : "Not selected"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Payment Method:</span>
                  <span className="font-bold text-[#4A5330] uppercase">
                    {order.payment_method || "N/A"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">Amount Paid:</span>
                  <span className="font-bold text-green-700">
                    ₱{Number(order.amount_paid || 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between font-bold text-[#FF5C93] pt-2 border-t border-gray-100">
                  <span>Balance Due:</span>
                  <span>₱{Number(order.balance_due || 0).toFixed(2)}</span>
                </div>

                {order.receipt_path && (
                  <div className="pt-2">
                    <span className="text-gray-400 block mb-1">Receipt Attachment:</span>
                    <span className="text-[11px] text-[#838F58] bg-gray-50 p-2 rounded-lg block truncate">
                      ✓ Receipt uploaded to secure storage
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuestOrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#4A5330]">
            Loading order details...
          </p>
        </div>
      }
    >
      <GuestOrderDetailContent />
    </Suspense>
  );
}
