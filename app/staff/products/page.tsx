"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { resizeImage } from "@/lib/resizeImage";
import QuickColorChips, { QuickColor } from "@/components/QuickColorChips";

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

interface ColorOptionRow {
  tempId: string;
  name: string;
  color_hex: string;
  stock_qty: string;
  price: string;
  photos: { file: File; previewUrl: string }[];
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
  const [saveProgress, setSaveProgress] = useState<string | null>(null);

  // Color options in add form state
  const [hasColorOptions, setHasColorOptions] = useState(false);
  const [colorOptionRows, setColorOptionRows] = useState<ColorOptionRow[]>([]);

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

  // Color option row management helpers
  const handleAddChipOption = (color: QuickColor) => {
    setColorOptionRows((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}_${Math.random()}`,
        name: color.name,
        color_hex: color.hex,
        stock_qty: "0",
        price: "",
        photos: [],
      },
    ]);
  };

  const handleAddCustomOption = () => {
    setColorOptionRows((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}_${Math.random()}`,
        name: "",
        color_hex: "#E53935",
        stock_qty: "0",
        price: "",
        photos: [],
      },
    ]);
  };

  const handleUpdateOptionField = (
    tempId: string,
    field: "name" | "color_hex" | "stock_qty" | "price",
    value: string
  ) => {
    setColorOptionRows((prev) =>
      prev.map((row) => (row.tempId === tempId ? { ...row, [field]: value } : row))
    );
  };

  const handleOptionPhotosChange = (
    tempId: string,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;
    const newPhotos = Array.from(files).map((f) => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    setColorOptionRows((prev) =>
      prev.map((row) =>
        row.tempId === tempId
          ? { ...row, photos: [...row.photos, ...newPhotos] }
          : row
      )
    );
  };

  const handleRemoveOptionPhoto = (tempId: string, photoIdx: number) => {
    setColorOptionRows((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const targetPhoto = row.photos[photoIdx];
        if (targetPhoto?.previewUrl) {
          URL.revokeObjectURL(targetPhoto.previewUrl);
        }
        return {
          ...row,
          photos: row.photos.filter((_, idx) => idx !== photoIdx),
        };
      })
    );
  };

  const handleRemoveOptionRow = (tempId: string) => {
    setColorOptionRows((prev) => {
      const row = prev.find((r) => r.tempId === tempId);
      if (row) {
        row.photos.forEach((p) => {
          if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        });
      }
      return prev.filter((r) => r.tempId !== tempId);
    });
  };

  // Handle Add Product with Color Options & Multi-step Save
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (hasColorOptions) {
      if (colorOptionRows.length === 0) {
        setErrorMsg("Please add at least one color option row or turn off color options.");
        return;
      }

      const namesLower = colorOptionRows.map((r) => r.name.trim().toLowerCase());
      for (const r of colorOptionRows) {
        if (!r.name.trim()) {
          setErrorMsg("All color options must have a name.");
          return;
        }
        const qtyNum = parseInt(r.stock_qty, 10);
        if (isNaN(qtyNum) || qtyNum < 0) {
          setErrorMsg(`Stock quantity for "${r.name}" must be 0 or more.`);
          return;
        }
      }

      if (new Set(namesLower).size !== namesLower.length) {
        setErrorMsg("Color option names must be unique within the product.");
        return;
      }
    }

    setSubmitting(true);
    setSaveProgress("Saving product...");

    let createdProductId: string | number | null = null;

    try {
      let finalImageUrl: string | null = null;
      let primaryImagePath: string | null = null;

      // 1. Upload primary photo if selected
      if (imageFile) {
        setSaveProgress("Uploading primary photo...");
        let uploadFile = imageFile;
        try {
          uploadFile = await resizeImage(imageFile, 1600, 0.8);
        } catch {
          // fallback to original
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
          primaryImagePath = filePath;
        }
      }

      // 2. Insert into products table (stock_qty is 0 when product has options)
      setSaveProgress("Creating product record...");
      const { data: newProd, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          category_id: selectedCategoryId ? Number(selectedCategoryId) : null,
          price: parseFloat(price) || 0,
          stock_qty: hasColorOptions ? 0 : parseInt(stockQty, 10) || 0,
          description: description.trim() || null,
          image_url: finalImageUrl,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertErr || !newProd) {
        throw new Error(insertErr?.message || "Failed to create product");
      }

      createdProductId = newProd.id;

      // 3. Insert primary photo into product_images if uploaded
      if (finalImageUrl && primaryImagePath) {
        await supabase.from("product_images").insert({
          product_id: createdProductId,
          variant_id: null,
          url: finalImageUrl,
          path: primaryImagePath,
          sort_order: 1,
        });
      }

      // 4. Create variants and upload variant photos
      if (hasColorOptions) {
        for (let i = 0; i < colorOptionRows.length; i++) {
          const row = colorOptionRows[i];
          setSaveProgress(`Saving option "${row.name}" (${i + 1}/${colorOptionRows.length})...`);

          const parsedPrice = row.price.trim() ? parseFloat(row.price) : null;
          const { data: variantData, error: varErr } = await supabase
            .from("product_variants")
            .insert({
              product_id: createdProductId,
              name: row.name.trim(),
              color_hex: row.color_hex || null,
              stock_qty: parseInt(row.stock_qty, 10) || 0,
              price: parsedPrice,
              is_active: true,
              sort_order: i + 1,
            })
            .select("id")
            .single();

          if (varErr || !variantData) {
            throw new Error(`Failed to save color option "${row.name}": ${varErr?.message || "Unknown error"}`);
          }

          const variantId = variantData.id;

          // Upload photos for this variant (max 1600px, JPEG quality 0.8)
          for (let p = 0; p < row.photos.length; p++) {
            setSaveProgress(`Uploading photo ${p + 1}/${row.photos.length} for "${row.name}"...`);
            const photoItem = row.photos[p];
            let compressedFile = photoItem.file;
            try {
              compressedFile = await resizeImage(photoItem.file, 1600, 0.8);
            } catch {
              // fallback to original
            }

            const cleanedName = compressedFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
            const uploadPath = `products/${createdProductId}/variants/${variantId}/${Date.now()}-${p}-${cleanedName}`;

            const { error: photoUpErr } = await supabase.storage
              .from("product-images")
              .upload(uploadPath, compressedFile, { upsert: true });

            if (photoUpErr) {
              console.warn("Photo upload notice:", photoUpErr.message);
              continue;
            }

            const { data: pubData } = supabase.storage
              .from("product-images")
              .getPublicUrl(uploadPath);

            await supabase.from("product_images").insert({
              product_id: createdProductId,
              variant_id: variantId,
              url: pubData.publicUrl,
              path: uploadPath,
              sort_order: p + 1,
            });
          }
        }
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
      setHasColorOptions(false);
      setColorOptionRows([]);
      setShowAddForm(false);

      await fetchProducts();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to add product";
      if (createdProductId) {
        setErrorMsg(
          `Product was saved (ID: ${createdProductId}), but an error occurred while saving color options or photos: ${errMsg}. Please fix it in "Options & photos".`
        );
        setShowAddForm(false);
        await fetchProducts();
      } else {
        setErrorMsg(errMsg);
      }
    } finally {
      setSubmitting(false);
      setSaveProgress(null);
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
                    Stock Quantity {hasColorOptions ? "" : "*"}
                  </label>
                  {hasColorOptions ? (
                    <div className="px-3 py-2.5 rounded-xl border border-dashed border-[#838F58]/40 bg-[#838F58]/5 text-xs font-semibold text-[#4A5330] min-h-[44px] flex items-center">
                      Stock is tracked for each color
                    </div>
                  ) : (
                    <>
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
                        Base inventory stock quantity for this product.
                      </p>
                    </>
                  )}
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

              {/* Color Options Section below description */}
              <div className="border-t border-b border-gray-100 py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-[#4A5330] block">
                      This product has color options
                    </label>
                    <p className="text-xs text-gray-500">
                      Turn on if this item comes in different colors or styles with individual stock.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hasColorOptions}
                    onClick={() => {
                      const next = !hasColorOptions;
                      setHasColorOptions(next);
                      if (next && colorOptionRows.length === 0) {
                        handleAddChipOption({ name: "Black", hex: "#1F1F1F" });
                      }
                    }}
                    className={`min-h-[44px] w-14 px-1 rounded-full transition-colors flex items-center cursor-pointer ${
                      hasColorOptions ? "bg-[#4A5330] justify-end" : "bg-gray-200 justify-start"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white shadow-xs" />
                  </button>
                </div>

                {hasColorOptions && (
                  <div className="space-y-4 pt-2">
                    {/* Quick Color Chips */}
                    <QuickColorChips
                      disabled={submitting}
                      onSelectColor={handleAddChipOption}
                    />

                    {/* Header and Add Custom Color Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-bold text-[#4A5330]">
                        Color Option Rows ({colorOptionRows.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddCustomOption}
                        disabled={submitting}
                        className="min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#838F58]/20 text-[#4A5330] hover:bg-[#838F58]/30 transition cursor-pointer flex items-center gap-1 self-start sm:self-auto"
                      >
                        <span>+</span>
                        <span>Add custom color</span>
                      </button>
                    </div>

                    {/* Option Rows List */}
                    <div className="space-y-3">
                      {colorOptionRows.map((row) => (
                        <div
                          key={row.tempId}
                          className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                            {/* Color Name */}
                            <div className="sm:col-span-4">
                              <label className="block text-[11px] font-bold text-[#4A5330] uppercase mb-1">
                                Color Name *
                              </label>
                              <input
                                type="text"
                                required
                                value={row.name}
                                onChange={(e) =>
                                  handleUpdateOptionField(row.tempId, "name", e.target.value)
                                }
                                placeholder="e.g. Red, Blue, Salmon"
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs outline-none bg-white min-h-[44px]"
                              />
                            </div>

                            {/* Color Picker with Swatch Preview */}
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-bold text-[#4A5330] uppercase mb-1">
                                Color Swatch
                              </label>
                              <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-xl border border-gray-300 min-h-[44px]">
                                <input
                                  type="color"
                                  value={row.color_hex}
                                  onChange={(e) =>
                                    handleUpdateOptionField(row.tempId, "color_hex", e.target.value)
                                  }
                                  className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent shrink-0"
                                />
                                <span
                                  className="w-5 h-5 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: row.color_hex }}
                                />
                                <span className="text-[11px] font-mono text-gray-600 truncate">
                                  {row.color_hex}
                                </span>
                              </div>
                            </div>

                            {/* Stock Quantity */}
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-bold text-[#4A5330] uppercase mb-1">
                                Stock *
                              </label>
                              <input
                                type="number"
                                min="0"
                                required
                                value={row.stock_qty}
                                onChange={(e) =>
                                  handleUpdateOptionField(row.tempId, "stock_qty", e.target.value)
                                }
                                placeholder="10"
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs outline-none bg-white min-h-[44px]"
                              />
                            </div>

                            {/* Price Override */}
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-bold text-[#4A5330] uppercase mb-1">
                                Price (₱)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.price}
                                onChange={(e) =>
                                  handleUpdateOptionField(row.tempId, "price", e.target.value)
                                }
                                placeholder="Override"
                                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs outline-none bg-white min-h-[44px]"
                              />
                            </div>

                            {/* Remove Row Button */}
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionRow(row.tempId)}
                                className="min-h-[44px] min-w-[44px] px-2 py-2 rounded-xl text-red-600 hover:bg-red-50 border border-red-200 text-xs font-bold transition flex items-center justify-center cursor-pointer"
                                title="Remove this option row"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* Multi-file photo uploader with thumbnails */}
                          <div className="pt-2 border-t border-gray-200">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs">
                                <span>📷</span>
                                <span>+ Add Photos for {row.name || "this option"}</span>
                                <input
                                  type="file"
                                  multiple
                                  accept="image/jpeg,image/png,image/webp,image/jpg"
                                  onChange={(e) => {
                                    handleOptionPhotosChange(row.tempId, e.target.files);
                                    e.target.value = "";
                                  }}
                                  className="hidden"
                                />
                              </label>
                              <span className="text-[11px] text-gray-500">
                                {row.photos.length} photo{row.photos.length === 1 ? "" : "s"} attached
                              </span>
                            </div>

                            {row.photos.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2.5">
                                {row.photos.map((photo, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white shadow-2xs group"
                                  >
                                    <img
                                      src={photo.previewUrl}
                                      alt={`Preview ${pIdx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOptionPhoto(row.tempId, pIdx)}
                                      className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-xs cursor-pointer hover:bg-red-700"
                                      title="Remove photo"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  General photo used as cover. Additional photos can be uploaded for each color option above.
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
                  className="px-6 py-2.5 rounded-xl bg-[#4A5330] text-white text-xs font-bold hover:bg-[#4A5330]/90 transition shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px] flex items-center gap-2"
                >
                  {submitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>
                    {saveProgress || (submitting ? "Saving Product..." : "Save Product")}
                  </span>
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
