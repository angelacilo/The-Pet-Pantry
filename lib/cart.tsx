"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface CartItem {
  id: string;
  product_id: number | string;
  variant_id: number | string | null;
  variant_name: string | null;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  qty: number;
}

export interface CartProductInput {
  id?: number | string;
  product_id?: number | string;
  variant_id?: number | string | null;
  variant_name?: string | null;
  name: string;
  price: number;
  stock_qty: number;
  image_url?: string | null;
}

interface CartContextType {
  items: CartItem[];
  add: (product: CartProductInput, qty?: number) => void;
  setQty: (cartItemId: number | string, qty: number) => void;
  removeItem: (cartItemId: number | string) => void;
  clear: () => void;
  subtotal: number;
  count: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "pet_pantry_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on client mount, normalizing structure
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const normalized: CartItem[] = parsed.map((item) => {
            const prodId = item.product_id ?? item.id;
            const varId = item.variant_id ?? null;
            const key = `${prodId}_${varId ?? "base"}`;
            return {
              id: key,
              product_id: prodId,
              variant_id: varId,
              variant_name: item.variant_name ?? null,
              name: item.name,
              price: Number(item.price) || 0,
              stock_qty: Number(item.stock_qty) || 0,
              image_url: item.image_url || null,
              qty: Number(item.qty) || 1,
            };
          });
          setItems(normalized);
        }
      }
    } catch (err) {
      console.error("Failed to load cart from localStorage", err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error("Failed to save cart to localStorage", err);
    }
  }, [items, isLoaded]);

  // Add product to cart (or increase qty if already present)
  const add = (product: CartProductInput, qty = 1) => {
    const prodId = product.product_id ?? product.id!;
    const varId = product.variant_id ?? null;
    const itemKey = `${prodId}_${varId ?? "base"}`;

    setItems((prev) => {
      const existing = prev.find((item) => item.id === itemKey);
      if (existing) {
        const nextQty = Math.min(existing.qty + qty, product.stock_qty || 9999);
        return prev.map((item) =>
          item.id === itemKey ? { ...item, qty: nextQty } : item
        );
      }
      return [
        ...prev,
        {
          id: itemKey,
          product_id: prodId,
          variant_id: varId,
          variant_name: product.variant_name || null,
          name: product.name,
          price: product.price,
          stock_qty: product.stock_qty,
          image_url: product.image_url || null,
          qty: Math.min(qty, product.stock_qty || 9999),
        },
      ];
    });
  };

  // Set specific quantity for an item (removes if <= 0)
  const setQty = (cartItemId: number | string, qty: number) => {
    if (qty <= 0) {
      removeItem(cartItemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (String(item.id) === String(cartItemId)) {
          const clamped = Math.min(qty, item.stock_qty || 9999);
          return { ...item, qty: clamped };
        }
        return item;
      })
    );
  };

  // Remove an item entirely
  const removeItem = (cartItemId: number | string) => {
    setItems((prev) => prev.filter((item) => String(item.id) !== String(cartItemId)));
  };

  // Clear all items in cart
  const clear = () => {
    setItems([]);
  };

  // Calculate subtotal
  const subtotal = items.reduce((acc, item) => acc + item.price * item.qty, 0);

  // Total item count
  const count = items.reduce((acc, item) => acc + item.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        add,
        setQty,
        removeItem,
        clear,
        subtotal,
        count,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
