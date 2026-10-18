"use client";

import React, { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getStatusLabel, getStatusBadgeClass, getPaymentStatusLabel, getPaymentStatusBadgeClass } from "@/lib/status";
import { addOrderToken } from "@/lib/myOrders";
import { GCASH, BANK } from "@/lib/paymentConfig";
import { resizeImage } from "@/lib/resizeImage";

interface OrderItem {
  id: string | number;
  product_id: string | number;
  product_name: string;
  variant_id?: string | number | null;
  variant_name?: string | null;
  unit_price: number;
  qty: number;
}

interface OrderData {
  id: number;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  full_name: string;
  contact_number: string;
  delivery_option: "maxim" | "pickup";
  address: string | null;
  pickup_schedule: string | null;
  subtotal: number;
  delivery_fee: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_distance_km?: number | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_option: "50_50" | "full" | null;
  payment_method: "cash" | "gcash" | "bank" | null;
  created_at: string;
  receipt_path?: string | null;
  order_items?: OrderItem[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function copyText(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

// ─── main component ──────────────────────────────────────────────────────────

function GuestOrderDetailContent() {
  const params = useParams();
  const token = params?.token as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Payment form states (Full payment only; GCash or Bank only)
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "bank">("gcash");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [bankQrError, setBankQrError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOrderData = useCallback(async (isSilent = false) => {
    if (!token) return;
    if (!isSilent) setLoading(true);
    setErrorMsg(null);

    try {
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

  // Clean up object URL when receipt preview changes
  useEffect(() => {
    return () => {
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  // Total order amount
  const effectiveTotal = useMemo(() => {
    if (!order) return 0;
    return (
      Number(order.total) ||
      Number(order.subtotal) + Number(order.delivery_fee || 0)
    );
  }, [order]);

  const balanceDueNumber = useMemo(() => {
    if (!order) return 0;
    const computed = effectiveTotal - Number(order.amount_paid || 0);
    return Math.max(0, order.balance_due !== undefined && order.balance_due !== null ? Number(order.balance_due) : computed);
  }, [order, effectiveTotal]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyNumber = (num: string) => {
    copyText(num);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyAmount = () => {
    copyText(effectiveTotal.toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Handle file input change with preview and resize
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    try {
      const resized = await resizeImage(file);
      setReceiptFile(resized);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(URL.createObjectURL(resized));
    } catch {
      setReceiptFile(file);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  // Submit payment form handler (calls submit_payment with p_option = 'full')
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !token) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!paymentReference.trim()) {
      setErrorMsg("Payment reference number is required.");
      return;
    }

    if (!receiptFile) {
      setErrorMsg("Payment receipt screenshot is required.");
      return;
    }

    setSubmittingPayment(true);

    try {
      const cleanedFileName = receiptFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const timestamp = Date.now();
      const storagePath = `${token}/${timestamp}-${cleanedFileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("receipts")
        .upload(storagePath, receiptFile);

      if (uploadErr) {
        throw new Error(`Receipt upload failed: ${uploadErr.message}`);
      }

      const { error: rpcErr } = await supabase.rpc("submit_payment", {
        p_token: token,
        p_option: "full",
        p_method: paymentMethod,
        p_receipt_path: storagePath,
        p_reference: paymentReference.trim(),
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      setSuccessMsg("Payment submitted successfully! Our staff will verify your payment shortly.");
      setReceiptFile(null);
      setPaymentReference("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
        setReceiptPreview(null);
      }

      await fetchOrderData(false);
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
              My Saved Orders
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-[#F9D1D9] text-[#4A5330] text-xs font-bold hover:bg-[#F9D1D9]/80 transition"
            >
              Shop Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const items = order.order_items || [];
  const paymentStatus = order.payment_status;
  const isAwaitingPayment = order.status === "awaiting_payment";

  // Display method for saved legacy orders or current payment
  const displayPaymentMethod =
    order.payment_method === "gcash"
      ? "GCash"
      : order.payment_method === "bank"
      ? "Bank Transfer"
      : order.payment_method === "cash"
      ? "Cash"
      : order.payment_method || "Not selected";

  const displayPaymentOption =
    order.payment_option === "50_50"
      ? "50% Advance + 50% COD"
      : order.payment_option === "full"
      ? "Full payment"
      : order.payment_option || "Full payment";

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Alert Messages */}
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

      {/* SECTION (a): Header with order number, order status badge, and date */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#838F58]">
              Order Tracking
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(
                order.status
              )}`}
            >
              {getStatusLabel(order.status)}
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#4A5330] tracking-tight">
            Order #{order.id}
          </h1>
          <p className="text-xs text-[#4A5330]/75 mt-0.5">
            Placed on{" "}
            {new Date(order.created_at).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
            })}
          </p>
        </div>

        <button
          onClick={handleCopyLink}
          className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/60 hover:bg-[#F9D1D9] text-[#4A5330] border border-[#838F58]/30 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          title="Save this link or bookmark it to check order status anytime"
        >
          <span>{copiedLink ? "✓ Link Copied!" : "🔗 Copy Order Link"}</span>
        </button>
      </div>

      {/* SECTION (b): Recipient & Delivery Details card */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-3">
        <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
          <span>📍</span> Recipient &amp; Delivery Details
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
            <div className="space-y-1">
              <div>
                <span className="text-gray-400 block text-xs">Delivery Address</span>
                <span className="font-bold text-[#4A5330]">
                  {order.address || "N/A"}
                </span>
              </div>
              <div className="text-xs text-gray-500 pt-1">
                <span>Distance: </span>
                <span className="font-semibold text-[#4A5330]">
                  {order.delivery_distance_km !== null && order.delivery_distance_km !== undefined
                    ? `${order.delivery_distance_km} km`
                    : "Assessed"}
                </span>
                <span className="mx-1.5">·</span>
                <span>Delivery Fee: </span>
                <span className="font-semibold text-[#4A5330]">
                  {order.delivery_fee !== null ? `₱${Number(order.delivery_fee).toFixed(2)}` : "Awaiting fee assessment"}
                </span>
              </div>
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

      {/* SECTION (c): Payment Status card + payment form when awaiting_payment / status messages */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
            <span>💳</span> Payment Status
          </h2>
          {paymentStatus && (
            <span
              className={`self-start sm:self-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${getPaymentStatusBadgeClass(
                paymentStatus
              )}`}
            >
              {getPaymentStatusLabel(paymentStatus)}
            </span>
          )}
        </div>

        {/* Payment Summary Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
          <div>
            <span className="text-gray-400 block text-xs">Payment Method</span>
            <span className="font-bold text-[#4A5330]">
              {displayPaymentMethod}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-xs">Payment Option</span>
            <span className="font-bold text-[#4A5330]">
              {displayPaymentOption}
            </span>
          </div>

          {order.payment_reference && (
            <div>
              <span className="text-gray-400 block text-xs">Payment Reference #</span>
              <span className="font-bold font-mono text-[#4A5330]">
                {order.payment_reference}
              </span>
            </div>
          )}

          <div>
            <span className="text-gray-400 block text-xs">Total to Pay</span>
            <span className="font-black text-sm text-[#FF5C93]">
              ₱{effectiveTotal.toFixed(2)}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-xs">Amount Paid</span>
            <span className="font-bold text-green-700">
              ₱{Number(order.amount_paid || 0).toFixed(2)}
            </span>
          </div>

          {/* Show Balance Due ONLY when it is greater than 0 */}
          {balanceDueNumber > 0 && (
            <div>
              <span className="text-gray-400 block text-xs">Balance Due</span>
              <span className="font-bold text-amber-800">
                ₱{balanceDueNumber.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* When status is awaiting_payment: Payment form */}
        {isAwaitingPayment ? (
          <div className="pt-4 border-t border-gray-100 space-y-5">
            <div className="p-4 rounded-xl bg-[#838F58]/10 border border-[#838F58]/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-500 block">Amount to Pay</span>
                <span className="text-xl font-black text-[#FF5C93]">
                  ₱{effectiveTotal.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyAmount}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-[#4A5330] border border-[#838F58]/30 shadow-2xs hover:bg-gray-50 transition cursor-pointer"
              >
                {copiedAmount ? "✓ Amount Copied!" : "📋 Copy Amount"}
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-5">
              {/* Choice of GCash or Bank transfer */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-2">
                  Choose Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("gcash")}
                    className={`min-h-[44px] p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                      paymentMethod === "gcash"
                        ? "border-[#4A5330] bg-[#4A5330] text-white shadow-xs"
                        : "border-gray-200 bg-white text-[#4A5330] hover:bg-gray-50"
                    }`}
                  >
                    <span>📱</span>
                    <span>GCash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank")}
                    className={`min-h-[44px] p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                      paymentMethod === "bank"
                        ? "border-[#4A5330] bg-[#4A5330] text-white shadow-xs"
                        : "border-gray-200 bg-white text-[#4A5330] hover:bg-gray-50"
                    }`}
                  >
                    <span>🏦</span>
                    <span>Bank Transfer</span>
                  </button>
                </div>
              </div>

              {/* QR Code and Account Details */}
              {paymentMethod === "gcash" && (
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
                  <div className="text-center">
                    <img
                      src={GCASH.qr}
                      alt="GCash QR Code"
                      className="w-48 h-48 mx-auto object-contain bg-white p-2 rounded-xl border border-blue-200 shadow-xs"
                    />
                    <div className="flex justify-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => downloadFile(GCASH.qr, "gcash-qr.png")}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white text-blue-900 border border-blue-200 text-xs font-bold hover:bg-blue-50 transition cursor-pointer"
                      >
                        💾 Save QR Image
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(GCASH.number)}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white text-blue-900 border border-blue-200 text-xs font-bold hover:bg-blue-50 transition cursor-pointer"
                      >
                        {copiedNumber ? "✓ Copied!" : "📋 Copy Number"}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-950 space-y-1 bg-white/80 p-3 rounded-xl">
                    <div className="flex justify-between">
                      <span className="text-blue-800">Account Name:</span>
                      <span className="font-bold">{GCASH.accountName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-800">GCash Number:</span>
                      <span className="font-bold">{GCASH.number}</span>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-3">
                  <div className="text-center">
                    {!bankQrError ? (
                      <img
                        src={BANK.qr}
                        alt="Bank QR Code"
                        onError={() => setBankQrError(true)}
                        className="w-48 h-48 mx-auto object-contain bg-white p-2 rounded-xl border border-emerald-200 shadow-xs"
                      />
                    ) : (
                      <div className="w-48 h-48 mx-auto flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-emerald-300 p-4 text-center">
                        <span className="text-3xl mb-1">🏦</span>
                        <p className="text-[11px] font-bold text-[#4A5330]">{BANK.bankName}</p>
                        <p className="text-[10px] text-gray-500">Scan via bank app or transfer directly below</p>
                      </div>
                    )}
                    <div className="flex justify-center gap-2 mt-2">
                      {!bankQrError && (
                        <button
                          type="button"
                          onClick={() => downloadFile(BANK.qr, "bank-qr.png")}
                          className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white text-emerald-900 border border-emerald-200 text-xs font-bold hover:bg-emerald-50 transition cursor-pointer"
                        >
                          💾 Save QR Image
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(BANK.accountNumber)}
                        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white text-emerald-900 border border-emerald-200 text-xs font-bold hover:bg-emerald-50 transition cursor-pointer"
                      >
                        {copiedNumber ? "✓ Copied!" : "📋 Copy Account #"}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-emerald-950 space-y-1 bg-white/80 p-3 rounded-xl">
                    <div className="flex justify-between">
                      <span className="text-emerald-800">Bank:</span>
                      <span className="font-bold">{BANK.bankName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-800">Account Name:</span>
                      <span className="font-bold">{BANK.accountName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-800">Account Number:</span>
                      <span className="font-bold">{BANK.accountNumber}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Reference Number (Required) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Payment Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. 100234567890"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Find this in your GCash receipt SMS or bank transfer receipt.
                </p>
              </div>

              {/* Screenshot Upload with Live Preview (Required) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Payment Screenshot *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  required
                  onChange={handleFileChange}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#4A5330] file:text-white file:min-h-[44px] hover:file:bg-[#4A5330]/90 file:cursor-pointer"
                />

                {receiptPreview && (
                  <div className="mt-3 relative w-36 h-36 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-xs">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptFile(null);
                        if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                        setReceiptPreview(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-xs cursor-pointer hover:bg-red-700"
                      title="Remove screenshot"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Required Note */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
                Full payment is required. Your order is processed after our staff verify your payment.
              </div>

              <button
                type="submit"
                disabled={submittingPayment}
                className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {submittingPayment ? "Submitting Payment..." : "Submit Payment →"}
              </button>
            </form>
          </div>
        ) : (
          /* Status banners for other order statuses */
          <div className="pt-3 border-t border-gray-100 space-y-3">
            {order.status === "awaiting_fee" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-900 text-xs">
                <span className="text-base">⏳</span>
                <div>
                  <p className="font-bold">Awaiting Delivery Fee Assessment</p>
                  <p className="mt-0.5">Our staff will assess and confirm your Maxim delivery fee shortly.</p>
                </div>
              </div>
            )}

            {order.status === "confirmed" && paymentStatus === "pending" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-900 text-xs">
                <span className="text-base">📑</span>
                <div>
                  <p className="font-bold">Payment Received — Awaiting Verification</p>
                  <p className="mt-0.5">Our staff is verifying your payment receipt. Your items will be packed as soon as verified!</p>
                </div>
              </div>
            )}

            {order.status === "confirmed" && paymentStatus === "verified" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 text-green-900 text-xs">
                <span className="text-base">✅</span>
                <div>
                  <p className="font-bold">Order Confirmed &amp; Payment Verified!</p>
                  <p className="mt-0.5">Our staff is packing your items with care.</p>
                </div>
              </div>
            )}

            {order.status === "confirmed" && paymentStatus === "rejected" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
                <span className="text-base">⚠️</span>
                <div>
                  <p className="font-bold">Payment Could Not Be Verified</p>
                  <p className="mt-0.5">We could not verify your payment. Please contact the shop.</p>
                </div>
              </div>
            )}

            {order.status === "ready_for_pickup" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-900 text-xs">
                <span className="text-base">🏬</span>
                <div>
                  <p className="font-bold">Ready for Pickup!</p>
                  <p className="mt-0.5">Your package is ready at The Pet Pantry shop. Please visit during store hours.</p>
                </div>
              </div>
            )}

            {order.status === "out_for_delivery" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-900 text-xs">
                <span className="text-base">🛵</span>
                <div>
                  <p className="font-bold">Out for Delivery via Maxim</p>
                  <p className="mt-0.5">Your package is on the way! Please keep your phone reachable for the rider.</p>
                </div>
              </div>
            )}

            {order.status === "completed" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 text-green-900 text-xs">
                <span className="text-base">🎉</span>
                <div>
                  <p className="font-bold">Order Completed</p>
                  <p className="mt-0.5">Thank you for ordering with The Pet Pantry!</p>
                </div>
              </div>
            )}

            {order.status === "cancelled" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
                <span className="text-base">❌</span>
                <div>
                  <p className="font-bold">Order Cancelled</p>
                  <p className="mt-0.5">This order was cancelled. Please feel free to browse our catalog or contact the shop.</p>
                </div>
              </div>
            )}

            {order.receipt_path && (
              <div className="pt-2 text-xs">
                <span className="text-gray-400 block mb-1">Receipt Attachment:</span>
                <span className="text-[11px] text-[#838F58] bg-gray-50 p-2 rounded-lg block truncate">
                  ✓ Receipt uploaded to secure storage
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION (d): At the very bottom: Order Items card */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
        <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
          <span>📦</span> Order Items
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
                  {item.variant_name ? ` (${item.variant_name})` : ""}
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
                ? `₱${Number(order.delivery_fee).toFixed(2)}${
                    order.delivery_distance_km !== null && order.delivery_distance_km !== undefined
                      ? ` (${order.delivery_distance_km} km)`
                      : ""
                  }`
                : "To be assessed"}
            </span>
          </div>

          <div className="flex justify-between text-base font-black text-[#FF5C93] pt-2 border-t border-gray-100">
            <span>Total:</span>
            <span>₱{effectiveTotal.toFixed(2)}</span>
          </div>
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
