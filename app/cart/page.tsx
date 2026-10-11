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
            className="inline-block px-6 py-3 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-sm transition"
          >
            Explore Pet Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
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
          className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline self-start sm:self-auto cursor-pointer"
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
                      className="px-3 py-1.5 text-sm font-bold text-[#4A5330] hover:bg-gray-200 transition cursor-pointer"
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
                      className="px-3 py-1.5 text-sm font-bold text-[#4A5330] hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
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
                    className="text-gray-400 hover:text-red-500 p-1 cursor-pointer transition"
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Card */}
        <div className="lg:col-span-1">
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
              className="block w-full py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm text-center shadow-sm transition"
            >
              Proceed to Checkout →
            </Link>

            <Link
              href="/"
              className="block w-full py-2.5 px-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#4A5330] font-semibold text-xs text-center transition"
            >
              ← Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
