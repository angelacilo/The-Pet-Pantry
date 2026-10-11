"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart";
import {
  getLastDetails,
  saveLastDetails,
  addOrderToken,
} from "@/lib/myOrders";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [deliveryOption, setDeliveryOption] = useState<"maxim" | "pickup">("maxim");
  const [address, setAddress] = useState("");
  const [pickupSchedule, setPickupSchedule] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Prefill details from localStorage
  useEffect(() => {
    const last = getLastDetails();
    if (last) {
      if (last.fullName) setFullName(last.fullName);
      if (last.contactNumber) setContactNumber(last.contactNumber);
      if (last.deliveryOption) setDeliveryOption(last.deliveryOption);
      if (last.address) setAddress(last.address);
      if (last.pickupSchedule) setPickupSchedule(last.pickupSchedule);
    }
  }, []);

  // Empty Cart Check
  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center border border-[#838F58]/20">
          <span className="text-4xl block mb-3">🛒</span>
          <h2 className="text-xl font-bold text-[#4A5330]">Your Cart is Empty</h2>
          <p className="text-sm text-[#4A5330]/80 mt-1 mb-6">
            Add items to your cart before proceeding to checkout.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-[#4A5330] text-white text-sm font-bold"
          >
            Go to Shop
          </Link>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check: If filled by a bot, silently do nothing
    if (honeypot && honeypot.trim() !== "") {
      return;
    }

    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg("Please enter your full name");
      return;
    }
    if (!contactNumber.trim()) {
      setErrorMsg("Please provide your contact number");
      return;
    }
    if (deliveryOption === "maxim" && !address.trim()) {
      setErrorMsg("Please enter your complete delivery address for Maxim delivery");
      return;
    }
    if (deliveryOption === "pickup" && !pickupSchedule.trim()) {
      setErrorMsg("Please provide your preferred pickup schedule");
      return;
    }

    setSubmitting(true);

    try {
      // Format items for place_order RPC: jsonb of { product_id, qty }
      const rpcItems = items.map((item) => ({
        product_id: item.id,
        qty: item.qty,
      }));

      // Call database function place_order (returns uuid token string)
      const { data: orderToken, error: rpcError } = await supabase.rpc(
        "place_order",
        {
          p_full_name: fullName.trim(),
          p_contact: contactNumber.trim(),
          p_delivery: deliveryOption,
          p_address: deliveryOption === "maxim" ? address.trim() : null,
          p_pickup: deliveryOption === "pickup" ? pickupSchedule.trim() : null,
          p_items: rpcItems,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!orderToken) {
        throw new Error("Did not receive an order token. Please try again.");
      }

      const tokenStr = String(orderToken);

      // Save token to localStorage list of order tokens
      addOrderToken(tokenStr);

      // Save customer details to prefill next checkout
      saveLastDetails({
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        deliveryOption,
        address: deliveryOption === "maxim" ? address.trim() : undefined,
        pickupSchedule: deliveryOption === "pickup" ? pickupSchedule.trim() : undefined,
      });

      // Clear cart
      clear();

      // Redirect to guest order page using the returned uuid token
      router.push(`/orders/${tokenStr}`);
    } catch (err: unknown) {
      console.error("place_order error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to place order");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#4A5330]">Guest Checkout</h1>
          <p className="text-xs sm:text-sm text-[#4A5330]/75">
            Quick ordering — no sign-up or password required!
          </p>
        </div>
        <Link
          href="/cart"
          className="text-xs font-bold text-[#838F58] hover:underline"
        >
          ← Edit Cart
        </Link>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact & Delivery Form */}
        <div className="md:col-span-2 space-y-5">
          {/* Hidden Honeypot Input */}
          <div style={{ display: "none" }} aria-hidden="true">
            <label htmlFor="website_url">Do not fill this</label>
            <input
              id="website_url"
              type="text"
              name="website_url"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {/* Customer Info Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>👤</span> Recipient Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Maria Santos"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Contact Number *
                </label>
                <input
                  type="tel"
                  required
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="0917 123 4567"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Delivery Option Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>🚚</span> Delivery or Pickup Option
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                  deliveryOption === "maxim"
                    ? "border-[#4A5330] bg-[#838F58]/10"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="delivery_option"
                  value="maxim"
                  checked={deliveryOption === "maxim"}
                  onChange={() => setDeliveryOption("maxim")}
                  className="mt-1 accent-[#4A5330]"
                />
                <div>
                  <span className="font-bold text-sm text-[#4A5330] block">
                    Maxim Delivery
                  </span>
                  <span className="text-xs text-[#4A5330]/75">
                    Rider dispatched directly to your doorstep. Staff will compute the delivery fee.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                  deliveryOption === "pickup"
                    ? "border-[#4A5330] bg-[#838F58]/10"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="delivery_option"
                  value="pickup"
                  checked={deliveryOption === "pickup"}
                  onChange={() => setDeliveryOption("pickup")}
                  className="mt-1 accent-[#4A5330]"
                />
                <div>
                  <span className="font-bold text-sm text-[#4A5330] block">
                    Store Self-Pickup
                  </span>
                  <span className="text-xs text-[#4A5330]/75">
                    Free pickup at The Pet Pantry shop at your scheduled time.
                  </span>
                </div>
              </label>
            </div>

            {/* Maxim Address field */}
            {deliveryOption === "maxim" && (
              <div className="pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Complete Delivery Address *
                </label>
                <textarea
                  rows={3}
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House/Unit #, Street, Barangay, City, Landmark (e.g. Near Blue Gate)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  💡 Note: Maxim delivery fee is added by staff upon receiving your address before payment.
                </p>
              </div>
            )}

            {/* Self Pickup schedule field */}
            {deliveryOption === "pickup" && (
              <div className="pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Preferred Pickup Schedule *
                </label>
                <input
                  type="text"
                  required
                  value={pickupSchedule}
                  onChange={(e) => setPickupSchedule(e.target.value)}
                  placeholder="e.g. Today at 3:30 PM, or Tomorrow morning"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  🏬 The Pet Pantry is open daily from 9:00 AM to 7:00 PM.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary Sidebar */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 sticky top-20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] border-b border-gray-100 pb-3">
              Order Review
            </h2>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs">
                  <div className="pr-2 line-clamp-1">
                    <span className="font-bold text-[#4A5330]">{item.qty}x</span>{" "}
                    <span className="text-[#4A5330]/80">{item.name}</span>
                  </div>
                  <span className="font-bold text-[#4A5330] shrink-0">
                    ₱{(item.price * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2 text-xs text-[#4A5330]">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Delivery:</span>
                <span>
                  {deliveryOption === "pickup" ? "Free (Pickup)" : "Quoted after order"}
                </span>
              </div>
              <div className="flex justify-between font-black text-sm text-[#FF5C93] pt-2 border-t border-gray-100">
                <span>Subtotal Due:</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Placing Order..." : "Confirm & Place Order →"}
            </button>

            <p className="text-[11px] text-[#4A5330]/70 text-center leading-tight">
              By placing this order, you will be redirected to your private order link to review payment details.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
