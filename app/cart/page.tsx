"use client";

import React from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function CartPage() {
  const { items, setQty, removeItem, clear, subtotal, count } = useCart();

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-2xl p-8 sm:p-12 max-w-md w-full shadow-xs border border-[#838F58]/20">
          <span className="text-5xl block mb-4">🛒</span>
          <h1 className="text-2xl font-bold text-[#4A5330]">Your Cart is Empty</h1>
          <p className="text-sm text-[#4A5330]/75 mt-2 mb-6">
            Looks like you haven&apos;t added any tasty treats or pet essentials yet!
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-sm transition min-h-[44px] leading-none flex items-center justify-center"
          >
            Explore Pet Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 sm:pb-12">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#4A5330]">Shopping Cart</h1>
          <p className="text-xs sm:text-sm text-[#4A5330]/75">
            You have {count} {count === 1 ? "item" : "items"} in your cart.
          </p>
        </div>
        <button
          onClick={clear}
          className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline self-start sm:self-auto cursor-pointer min-h-[44px] sm:min-h-0"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items List */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemTotal = item.price * item.qty;
            const isAtMax = item.qty >= item.stock_qty;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* Photo and Name */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#F9D1D9]/40 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-[#838F58]/20">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">🥫</span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-[#4A5330] leading-snug">
                      {item.name}
                    </h2>
                    {item.variant_name && (
                      <p className="text-xs font-semibold text-[#838F58] mt-0.5">
                        Color: {item.variant_name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      ₱{Number(item.price).toFixed(2)} each
                    </p>
                    <p className="text-[11px] text-[#838F58] font-semibold mt-0.5">
                      Max available: {item.stock_qty}
                    </p>
                  </div>
                </div>

                {/* Controls and Total */}
                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                  {/* Quantity Counter */}
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                    <button
                      onClick={() => setQty(item.id, item.qty - 1)}
                      className="min-w-[44px] min-h-[44px] text-sm font-bold text-[#4A5330] hover:bg-gray-200 transition cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 text-xs font-bold text-[#4A5330] min-w-8 text-center bg-white">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => setQty(item.id, item.qty + 1)}
                      disabled={isAtMax}
                      className="min-w-[44px] min-h-[44px] text-sm font-bold text-[#4A5330] hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Price */}
                  <div className="text-right min-w-[80px]">
                    <span className="text-base font-extrabold text-[#FF5C93]">
                      ₱{itemTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-red-500 p-2 cursor-pointer transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Card — hidden on mobile (replaced by sticky bar) */}
        <div className="lg:col-span-1 hidden sm:block">
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 sticky top-20 space-y-4">
            <h2 className="text-lg font-bold text-[#4A5330] border-b border-gray-100 pb-3">
              Order Summary
            </h2>

            <div className="space-y-2 text-sm text-[#4A5330]/80">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold text-[#4A5330]">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Delivery:</span>
                <span>Calculated at checkout</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 flex justify-between items-baseline">
              <span className="font-bold text-base text-[#4A5330]">Estimated Total:</span>
              <span className="text-2xl font-black text-[#FF5C93]">
                ₱{subtotal.toFixed(2)}
              </span>
            </div>

            <Link
              href="/checkout"
              className="block w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm text-center shadow-sm transition"
            >
              Proceed to Checkout →
            </Link>

            <Link
              href="/"
              className="block w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#4A5330] font-semibold text-xs text-center transition"
            >
              ← Continue Shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar — mobile only */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#838F58]/20 shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 font-semibold">Subtotal</p>
          <p className="text-xl font-black text-[#FF5C93]">₱{subtotal.toFixed(2)}</p>
        </div>
        <Link
          href="/checkout"
          className="flex-1 max-w-[200px] min-h-[44px] py-3 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm text-center shadow-sm transition flex items-center justify-center"
        >
          Checkout →
        </Link>
      </div>
    </div>
  );
}
