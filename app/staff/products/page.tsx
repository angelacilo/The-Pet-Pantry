"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";

interface Product {
  id: string | number;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  is_active: boolean;
  category: string | null;
  description: string | null;
}

export default function StaffProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState<string>("");
  const [stockQty, setStockQty] = useState<string>("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Inline edit state tracking: map of productId -> { price, stock_qty }
  const [editMap, setEditMap] = useState<
    Record<string | number, { price: number; stock_qty: number }>
  >({});
  const [savingId, setSavingId] = useState<string | number | null>(null);

  // Filter & Search
  const [search, setSearch] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        setErrorMsg(error.message);
      } else {
        const prodList = (data as Product[]) || [];
        setProducts(prodList);
        // Initialize inline edit state
        const initialEdits: Record<
          string | number,
          { price: number; stock_qty: number }
        > = {};
        prodList.forEach((p) => {
          initialEdits[p.id] = { price: p.price, stock_qty: p.stock_qty };
        });
        setEditMap(initialEdits);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Handle Add Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let finalImageUrl: string | null = null;

      // 1. Upload photo if selected
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const cleanedFileName = imageFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const filePath = `products/${Date.now()}-${cleanedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(filePath, imageFile, { upsert: true });

        if (uploadErr) {
          console.warn("Storage upload notice:", uploadErr.message);
          // If storage bucket isn't ready or fails, continue without image
        } else {
          const { data: publicUrlData } = supabase.storage
            .from("product-images")
            .getPublicUrl(filePath);
          finalImageUrl = publicUrlData.publicUrl;
        }
      }

      // 2. Insert into products table
      const { data: inserted, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          category: category.trim() || null,
          price: parseFloat(price) || 0,
          stock_qty: parseInt(stockQty, 10) || 0,
          description: description.trim() || null,
          image_url: finalImageUrl,
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      setSuccessMsg(`"${name}" added successfully!`);
      // Reset form
      setName("");
      setCategory("");
      setPrice("");
      setStockQty("");
      setDescription("");
      setImageFile(null);
      setShowAddForm(false);

      // Refresh list
      await fetchProducts();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add product");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Inline Save
  const handleSaveInline = async (product: Product) => {
    const edit = editMap[product.id];
    if (!edit) return;

    setSavingId(product.id);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          price: Number(edit.price),
          stock_qty: Number(edit.stock_qty),
        })
        .eq("id", product.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? { ...p, price: Number(edit.price), stock_qty: Number(edit.stock_qty) }
              : p
          )
        );
        setSuccessMsg(`Updated ${product.name}`);
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setSavingId(null);
    }
  };

  // Handle Toggle Active/Inactive (Hide/Show)
  const handleToggleActive = async (product: Product) => {
    setErrorMsg(null);
    try {
      const newStatus = !product.is_active;
      const { error } = await supabase
        .from("products")
        .update({ is_active: newStatus })
        .eq("id", product.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, is_active: newStatus } : p))
        );
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <RequireStaff>
      <div className="space-y-6 pb-12">
        {/* Staff Sub-header & Navigation */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Inventory</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Product Management</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Add new products, edit prices, update inventory stock, and manage shop visibility.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              href="/staff/reports"
              className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 text-[#4A5330] hover:bg-[#F9D1D9] transition"
            >
              Reports
            </Link>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <span>{showAddForm ? "✕ Cancel" : "+ Add Product"}</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
            {successMsg}
          </div>
        )}

        {/* Add Product Form Modal / Collapsible */}
        {showAddForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-[#838F58]/30">
            <h2 className="text-lg font-bold text-[#4A5330] mb-4 flex items-center gap-2">
              <span>📦</span> Add New Pet Product
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Grain-Free Salmon Kibble 1kg"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Dog Food, Cat Treats, Toys"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Price (₱) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="250.00"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Initial Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="20"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ingredients, size, nutritional benefits, or usage instructions..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Product Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#F9D1D9] file:text-[#4A5330] hover:file:bg-[#F9D1D9]/80"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Uploaded to the product-images storage bucket.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-[#4A5330] hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 disabled:opacity-50"
                >
                  {submitting ? "Saving Product..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Product Table Controls */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#838F58]/20 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name or category..."
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
          <div className="text-xs font-semibold text-[#4A5330]/80">
            Total: {products.length} {products.length === 1 ? "item" : "items"}
          </div>
        </div>

        {/* Products Table */}
        {loading ? (
          <div className="min-h-[30vh] flex flex-col items-center justify-center p-8">
            <div className="w-8 h-8 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold text-[#4A5330]">Loading inventory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-[#4A5330]/80 border border-[#838F58]/20">
            No products match your search.
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xs border border-[#838F58]/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F9D1D9]/40 border-b border-[#838F58]/20 text-xs font-bold text-[#4A5330] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Price (₱)</th>
                    <th className="py-3 px-4">Stock</th>
                    <th className="py-3 px-4">Visibility</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((product) => {
                    const edit = editMap[product.id] || {
                      price: product.price,
                      stock_qty: product.stock_qty,
                    };
                    const isLowStock = edit.stock_qty <= 5;
                    const isSaving = savingId === product.id;
                    const hasChanges =
                      Number(edit.price) !== Number(product.price) ||
                      Number(edit.stock_qty) !== Number(product.stock_qty);

                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-[#F9D1D9]/10 transition ${
                          !product.is_active ? "opacity-60 bg-gray-50/50" : ""
                        }`}
                      >
                        {/* Thumbnail & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-[#F9D1D9]/50 overflow-hidden shrink-0 flex items-center justify-center border border-[#838F58]/20">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xl">🥫</span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-[#4A5330] line-clamp-1">
                                {product.name}
                              </div>
                              {product.description && (
                                <div className="text-xs text-gray-500 line-clamp-1 max-w-xs">
                                  {product.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {product.category || "General"}
                          </span>
                        </td>

                        {/* Price Inline Edit */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 font-bold">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={edit.price}
                              onChange={(e) =>
                                setEditMap({
                                  ...editMap,
                                  [product.id]: {
                                    ...edit,
                                    price: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-xs font-bold text-[#FF5C93] focus:border-[#4A5330] outline-none"
                            />
                          </div>
                        </td>

                        {/* Stock Inline Edit (low stock in red) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={edit.stock_qty}
                              onChange={(e) =>
                                setEditMap({
                                  ...editMap,
                                  [product.id]: {
                                    ...edit,
                                    stock_qty: parseInt(e.target.value, 10) || 0,
                                  },
                                })
                              }
                              className={`w-16 px-2 py-1 rounded-lg border text-xs font-bold outline-none ${
                                isLowStock
                                  ? "border-red-400 bg-red-50 text-red-600 focus:border-red-600"
                                  : "border-gray-200 text-[#4A5330] focus:border-[#4A5330]"
                              }`}
                            />
                            {isLowStock && (
                              <span className="text-[11px] font-bold text-red-600 flex items-center gap-0.5">
                                <span>⚠️</span>
                                {edit.stock_qty === 0 ? "Out" : "Low"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Visibility (Hide or Show) */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleActive(product)}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                              product.is_active
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                            }`}
                          >
                            {product.is_active ? "Visible" : "Hidden"}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleSaveInline(product)}
                            disabled={!hasChanges || isSaving}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                              hasChanges
                                ? "bg-[#4A5330] text-white hover:bg-[#4A5330]/90 shadow-xs"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </RequireStaff>
  );
}
