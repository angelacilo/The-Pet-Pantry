"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { resizeImage } from "@/lib/resizeImage";

interface Category {
  id: number | string;
  name: string;
}

interface ProductVariant {
  id: number | string;
  stock_qty: number;
  is_active: boolean;
}

interface Product {
  id: string | number;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  is_active: boolean;
  category_id?: number | null;
  categories?: { id: number; name: string } | null;
  description: string | null;
  product_variants?: ProductVariant[];
  hasActiveVariants?: boolean;
  totalVariantStock?: number;
  activeVariantsCount?: number;
}

export default function StaffProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
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

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setCategories((data as Category[]) || []);
    } catch (err: unknown) {
      console.warn("Could not load categories:", err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_qty, image_url, is_active, category_id, description, categories(id, name), product_variants(id, stock_qty, is_active)")
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      const rawList = (data as any[]) || [];
      const prodList: Product[] = rawList.map((p) => {
        const activeVariants = (p.product_variants || []).filter((v: ProductVariant) => v.is_active);
        const hasActiveVariants = activeVariants.length > 0;
        const totalVariantStock = activeVariants.reduce(
          (sum: number, v: ProductVariant) => sum + (Number(v.stock_qty) || 0),
          0
        );

        return {
          ...p,
          hasActiveVariants,
          totalVariantStock,
          activeVariantsCount: activeVariants.length,
        };
      });

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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, []);

  // Handle inline category creation from dropdown
  const handleCreateCategoryInline = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: newCategoryName.trim(),
          sort_order: categories.length + 1,
          is_active: true,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      if (data) {
        setCategories((prev) => [...prev, data]);
        setSelectedCategoryId(String(data.id));
        setIsAddingNewCategory(false);
        setNewCategoryName("");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  };

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
        let uploadFile = imageFile;
        try {
          uploadFile = await resizeImage(imageFile);
        } catch {
          // If resize fails, use original file
        }
        const cleanedFileName = uploadFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const filePath = `products/${Date.now()}-${cleanedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(filePath, uploadFile, { upsert: true });

        if (uploadErr) {
          console.warn("Storage upload notice:", uploadErr.message);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from("product-images")
            .getPublicUrl(filePath);
          finalImageUrl = publicUrlData.publicUrl;
        }
      }

      // 2. Insert into products table with category_id
      const { error: insertErr } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          category_id: selectedCategoryId ? Number(selectedCategoryId) : null,
          price: parseFloat(price) || 0,
          stock_qty: parseInt(stockQty, 10) || 0,
          description: description.trim() || null,
          image_url: finalImageUrl,
          is_active: true,
        });

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      setSuccessMsg(`"${name}" added successfully!`);
      // Reset form
      setName("");
      setSelectedCategoryId("");
      setIsAddingNewCategory(false);
      setNewCategoryName("");
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
    setSuccessMsg(null);

    try {
      // If product has active variants, product's own stock_qty is ignored
      const updatePayload: { price: number; stock_qty?: number } = {
        price: Number(edit.price) || 0,
      };

      if (!product.hasActiveVariants) {
        updatePayload.stock_qty = parseInt(String(edit.stock_qty), 10) || 0;
      }

      const { error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", product.id);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMsg(`Updated "${product.name}" successfully!`);
      await fetchProducts();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setSavingId(null);
    }
  };

  // Toggle Visibility
  const handleToggleActive = async (product: Product) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const nextActive = !product.is_active;
      const { error } = await supabase
        .from("products")
        .update({ is_active: nextActive })
        .eq("id", product.id);

      if (error) {
        throw new Error(error.message);
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p))
      );
      setSuccessMsg(`"${product.name}" is now ${nextActive ? "visible" : "hidden"}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  // Filtered products list
  const filtered = products.filter((p) => {
    const term = search.toLowerCase();
    const matchName = p.name.toLowerCase().includes(term);
    const matchCat = p.categories?.name?.toLowerCase().includes(term);
    const matchDesc = p.description?.toLowerCase().includes(term);
    return matchName || matchCat || matchDesc;
  });

  return (
    <RequireStaff>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Inventory</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Product Inventory</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Manage product listings, color options, photo galleries, stock and prices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link
              href="/staff/categories"
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] transition border border-[#838F58]/30 flex items-center gap-1.5"
            >
              📂 Manage Categories
            </Link>

            <button
              onClick={() => setShowAddForm((prev) => !prev)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>{showAddForm ? "✕ Cancel" : "+ Add New Product"}</span>
            </button>
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

        {/* Add Product Modal / Collapsible Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                <span>✨</span> Add a New Pet Product
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                Close
              </button>
            </div>

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
                    placeholder="e.g. Pedigree Adult Beef 1.5kg"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Category
                  </label>
                  {!isAddingNewCategory ? (
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => {
                        if (e.target.value === "__add_new__") {
                          setIsAddingNewCategory(true);
                        } else {
                          setSelectedCategoryId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px] bg-white cursor-pointer"
                    >
                      <option value="">-- Select a Category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__add_new__" className="font-bold text-[#838F58]">
                        + Add new category...
                      </option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="New category name..."
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategoryInline}
                        disabled={creatingCategory || !newCategoryName.trim()}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 disabled:opacity-50 min-h-[44px]"
                      >
                        {creatingCategory ? "..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingNewCategory(false);
                          setNewCategoryName("");
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Base Price (₱) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="250.00"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="20"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Note: If you add color options later, stock is tracked per option and this base quantity is ignored.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Product Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Nutritious formula packed with vitamins and essential minerals..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Primary Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#838F58]/20 file:text-[#4A5330] hover:file:bg-[#838F58]/30 cursor-pointer min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Additional photos and color-specific images can be uploaded via &quot;Options &amp; photos&quot;.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-[#4A5330] text-white text-xs font-bold hover:bg-[#4A5330]/90 transition shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px]"
                >
                  {submitting ? "Adding Product..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name or category..."
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-xs outline-none min-h-[44px]"
            />
          </div>
          <div className="text-xs text-gray-500">
            Showing <strong>{filtered.length}</strong> of {products.length} products
          </div>
        </div>

        {/* Product Table */}
        {loading ? (
          <div className="min-h-[30vh] flex flex-col items-center justify-center p-8">
            <div className="w-8 h-8 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold text-[#4A5330]">Loading inventory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-[#838F58]/20">
            <span className="text-4xl block mb-2">🥫</span>
            <h3 className="text-base font-bold text-[#4A5330]">No products found</h3>
            <p className="text-xs text-[#4A5330]/75 mt-1">
              Try adjusting your search or add a new product above.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xs border border-[#838F58]/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F9D1D9]/40 border-b border-gray-100 text-gray-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Price</th>
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
                    const isSaving = savingId === product.id;
                    const hasChanges =
                      Number(edit.price) !== Number(product.price) ||
                      (!product.hasActiveVariants &&
                        Number(edit.stock_qty) !== Number(product.stock_qty));

                    const isLowStock = !product.hasActiveVariants && edit.stock_qty <= 5;

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
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {product.categories?.name || "General"}
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
                              className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-xs font-bold text-[#FF5C93] focus:border-[#4A5330] outline-none min-h-[36px]"
                            />
                          </div>
                        </td>

                        {/* Stock: hidden in form when product has active variants */}
                        <td className="py-3 px-4">
                          {product.hasActiveVariants ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-[#4A5330]">
                                {product.totalVariantStock} units
                              </span>
                              <span className="text-[10px] text-[#838F58] font-semibold">
                                across {product.activeVariantsCount} {product.activeVariantsCount === 1 ? "option" : "options"}
                              </span>
                            </div>
                          ) : (
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
                                className={`w-16 px-2 py-1 rounded-lg border text-xs font-bold outline-none min-h-[36px] ${
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
                          )}
                        </td>

                        {/* Visibility (Hide or Show) */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(product)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition min-h-[44px] cursor-pointer ${
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
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/staff/products/${product.id}`}
                              className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] border border-[#838F58]/30 transition flex items-center gap-1 shrink-0"
                            >
                              <span>🎨</span>
                              <span>Options &amp; photos</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleSaveInline(product)}
                              disabled={!hasChanges || isSaving}
                              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                hasChanges
                                  ? "bg-[#4A5330] text-white hover:bg-[#4A5330]/90 shadow-xs"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
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
