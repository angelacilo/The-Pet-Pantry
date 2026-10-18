"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";
import { resizeImage } from "@/lib/resizeImage";

interface Product {
  id: string | number;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  description: string | null;
}

interface ProductImage {
  id: number | string;
  product_id: number | string;
  variant_id: number | string | null;
  url: string;
  path: string;
  sort_order: number;
}

interface ProductVariant {
  id: number | string;
  product_id: number | string;
  name: string;
  color_hex: string | null;
  stock_qty: number;
  price: number | null;
  is_active: boolean;
  sort_order: number;
}

export default function ProductOptionsAndPhotosPage() {
  const params = useParams();
  const productId = params?.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [generalImages, setGeneralImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantImages, setVariantImages] = useState<Record<string | number, ProductImage[]>>({});

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // General image upload state
  const [uploadingGeneral, setUploadingGeneral] = useState(false);

  // New option form state
  const [optionName, setOptionName] = useState("");
  const [hasColorHex, setHasColorHex] = useState(true);
  const [colorHex, setColorHex] = useState("#E53935");
  const [optionStock, setOptionStock] = useState("");
  const [optionPriceOverride, setOptionPriceOverride] = useState("");
  const [creatingOption, setCreatingOption] = useState(false);

  // Inline edit state for variants: variantId -> { stock_qty, price }
  const [variantEdits, setVariantEdits] = useState<
    Record<string | number, { stock_qty: number; price: string }>
  >({});
  const [savingVariantId, setSavingVariantId] = useState<string | number | null>(null);

  // Loading state for variant-specific photo upload
  const [uploadingVariantId, setUploadingVariantId] = useState<string | number | null>(null);

  const loadData = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch product
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, name, price, stock_qty, image_url, description")
        .eq("id", productId)
        .single();

      if (prodErr) throw new Error(prodErr.message);
      setProduct(prodData as Product);

      // 2. Fetch all product_images for this product
      const { data: imagesData, error: imgErr } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (imgErr) throw new Error(imgErr.message);

      const allImages = (imagesData as ProductImage[]) || [];
      const genImages = allImages.filter((img) => img.variant_id === null);
      setGeneralImages(genImages);

      const varImgMap: Record<string | number, ProductImage[]> = {};
      allImages.forEach((img) => {
        if (img.variant_id !== null) {
          if (!varImgMap[img.variant_id]) {
            varImgMap[img.variant_id] = [];
          }
          varImgMap[img.variant_id].push(img);
        }
      });
      setVariantImages(varImgMap);

      // 3. Fetch product_variants
      const { data: varData, error: varErr } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (varErr) throw new Error(varErr.message);

      const variantList = (varData as ProductVariant[]) || [];
      setVariants(variantList);

      const initialEdits: Record<string | number, { stock_qty: number; price: string }> = {};
      variantList.forEach((v) => {
        initialEdits[v.id] = {
          stock_qty: v.stock_qty,
          price: v.price !== null && v.price !== undefined ? String(v.price) : "",
        };
      });
      setVariantEdits(initialEdits);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load product data");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Total stock across active options (Feature 2.4.d)
  const activeVariants = variants.filter((v) => v.is_active);
  const totalActiveOptionStock = activeVariants.reduce(
    (sum, v) => sum + (Number(v.stock_qty) || 0),
    0
  );

  // ── General Photos Handlers ──────────────────────────────────────────────────
  const handleUploadGeneralPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingGeneral(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const fileArray = Array.from(files);
      let currentMaxSort = generalImages.reduce(
        (max, img) => Math.max(max, img.sort_order || 0),
        0
      );

      for (const file of fileArray) {
        let uploadFile = file;
        try {
          uploadFile = await resizeImage(file);
        } catch {
          // fallback to original file
        }

        const cleanedFileName = uploadFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const filePath = `products/${productId}/general/${Date.now()}-${cleanedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(filePath, uploadFile, { upsert: true });

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        currentMaxSort += 1;
        const { error: insertErr } = await supabase
          .from("product_images")
          .insert({
            product_id: productId,
            variant_id: null,
            url: publicUrlData.publicUrl,
            path: filePath,
            sort_order: currentMaxSort,
          });

        if (insertErr) throw new Error(insertErr.message);
      }

      setSuccessMsg(`Uploaded ${fileArray.length} general photo(s) successfully!`);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload photos");
    } finally {
      setUploadingGeneral(false);
      e.target.value = "";
    }
  };

  const handleDeleteImage = async (img: ProductImage) => {
    if (!window.confirm("Are you sure you want to delete this photo?")) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Remove from database
      const { error: dbErr } = await supabase
        .from("product_images")
        .delete()
        .eq("id", img.id);

      if (dbErr) throw new Error(dbErr.message);

      // 2. Remove file from storage bucket using path
      if (img.path) {
        const { error: storageErr } = await supabase.storage
          .from("product-images")
          .remove([img.path]);
        if (storageErr) {
          console.warn("Storage deletion warning:", storageErr.message);
        }
      }

      setSuccessMsg("Photo removed successfully.");
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete photo");
    }
  };

  const handleMoveImage = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= generalImages.length) return;

    const currentImg = generalImages[index];
    const targetImg = generalImages[targetIndex];

    try {
      // Swap sort_order
      const currentSort = currentImg.sort_order;
      const targetSort = targetImg.sort_order === currentSort ? (direction === "up" ? currentSort - 1 : currentSort + 1) : targetImg.sort_order;

      await Promise.all([
        supabase.from("product_images").update({ sort_order: targetSort }).eq("id", currentImg.id),
        supabase.from("product_images").update({ sort_order: currentSort }).eq("id", targetImg.id),
      ]);

      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to reorder photos");
    }
  };

  // ── Color Options (Variants) Handlers ────────────────────────────────────────
  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionName.trim()) return;

    setCreatingOption(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const nextSort = variants.reduce((max, v) => Math.max(max, v.sort_order || 0), 0) + 1;
      const parsedOverride = optionPriceOverride.trim() ? parseFloat(optionPriceOverride) : null;

      const { error } = await supabase
        .from("product_variants")
        .insert({
          product_id: productId,
          name: optionName.trim(),
          color_hex: hasColorHex && colorHex ? colorHex : null,
          stock_qty: parseInt(optionStock, 10) || 0,
          price: parsedOverride,
          is_active: true,
          sort_order: nextSort,
        });

      if (error) throw new Error(error.message);

      setSuccessMsg(`Option "${optionName.trim()}" added!`);
      setOptionName("");
      setOptionStock("");
      setOptionPriceOverride("");
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add option");
    } finally {
      setCreatingOption(false);
    }
  };

  const handleSaveVariantInline = async (variant: ProductVariant) => {
    const edit = variantEdits[variant.id];
    if (!edit) return;

    setSavingVariantId(variant.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsedPrice = edit.price.trim() === "" ? null : parseFloat(edit.price);

      const { error } = await supabase
        .from("product_variants")
        .update({
          stock_qty: parseInt(String(edit.stock_qty), 10) || 0,
          price: parsedPrice,
        })
        .eq("id", variant.id);

      if (error) throw new Error(error.message);

      setSuccessMsg(`Option "${variant.name}" updated!`);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save option");
    } finally {
      setSavingVariantId(null);
    }
  };

  const handleToggleVariantActive = async (variant: ProductVariant) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const nextActive = !variant.is_active;
      const { error } = await supabase
        .from("product_variants")
        .update({ is_active: nextActive })
        .eq("id", variant.id);

      if (error) throw new Error(error.message);

      setVariants((prev) =>
        prev.map((v) => (v.id === variant.id ? { ...v, is_active: nextActive } : v))
      );
      setSuccessMsg(`"${variant.name}" is now ${nextActive ? "visible" : "hidden"}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to toggle option");
    }
  };

  const handleUploadVariantPhotos = async (
    variantId: number | string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingVariantId(variantId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const fileArray = Array.from(files);
      const existingImages = variantImages[variantId] || [];
      let currentMaxSort = existingImages.reduce(
        (max, img) => Math.max(max, img.sort_order || 0),
        0
      );

      for (const file of fileArray) {
        let uploadFile = file;
        try {
          uploadFile = await resizeImage(file);
        } catch {
          // fallback
        }

        const cleanedFileName = uploadFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const filePath = `products/${productId}/variants/${variantId}/${Date.now()}-${cleanedFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(filePath, uploadFile, { upsert: true });

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        const { data: publicUrlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        currentMaxSort += 1;
        const { error: insertErr } = await supabase
          .from("product_images")
          .insert({
            product_id: productId,
            variant_id: variantId,
            url: publicUrlData.publicUrl,
            path: filePath,
            sort_order: currentMaxSort,
          });

        if (insertErr) throw new Error(insertErr.message);
      }

      setSuccessMsg(`Uploaded ${fileArray.length} photo(s) for this option.`);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload option photos");
    } finally {
      setUploadingVariantId(null);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <RequireStaff>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8">
          <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#4A5330]">Loading product options and photos...</p>
        </div>
      </RequireStaff>
    );
  }

  if (!product) {
    return (
      <RequireStaff>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
          <span className="text-4xl block mb-2">🔍</span>
          <h2 className="text-lg font-bold text-[#4A5330]">Product Not Found</h2>
          <Link
            href="/staff/products"
            className="mt-4 px-4 py-2 rounded-xl bg-[#4A5330] text-white text-xs font-bold"
          >
            ← Return to Products
          </Link>
        </div>
      </RequireStaff>
    );
  }

  return (
    <RequireStaff>
      <div className="space-y-6 pb-20 max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <Link href="/staff/products" className="hover:underline">
                Products
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Options &amp; Photos</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">{product.name}</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Base Price: ₱{Number(product.price).toFixed(2)} • Configure color options, swatches, and photo galleries
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/product/${product.id}`}
              target="_blank"
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] transition border border-[#838F58]/30 flex items-center gap-1.5"
            >
              <span>👁️</span>
              <span>View Customer Page ↗</span>
            </Link>
            <Link
              href="/staff/products"
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center justify-center"
            >
              ← Back to List
            </Link>
          </div>
        </div>

        {/* Total Stock Banner across active options */}
        {variants.length > 0 ? (
          <div className="p-4 rounded-2xl bg-[#838F58]/15 border border-[#838F58]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <p className="font-bold text-sm text-[#4A5330]">
                  Total Stock Across Active Options:{" "}
                  <span className="text-base font-black text-[#FF5C93]">
                    {totalActiveOptionStock} units
                  </span>
                </p>
                <p className="text-[11px] text-[#4A5330]/80">
                  Because this product has active color options, customer ordering and inventory are strictly tracked per option. Base product stock ({product.stock_qty}) is overridden.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-white text-xs font-bold text-[#4A5330] border border-[#838F58]/30 self-start sm:self-auto shadow-xs">
              {activeVariants.length} Active {activeVariants.length === 1 ? "Option" : "Options"}
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            ℹ️ No color options added yet. Currently using base product stock of <strong>{product.stock_qty}</strong> units. Add an option below to enable variant-level stock and photo swatches.
          </div>
        )}

        {/* Messages */}
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

        {/* SECTION 1: General Product Photos */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                <span>📸</span> General Product Photos ({generalImages.length})
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Default photos shown when no specific color is selected or as fallback. First photo is used on catalog cards.
              </p>
            </div>

            <label className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto">
              <span>{uploadingGeneral ? "Compressing & Uploading..." : "+ Upload Photos"}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/jpg"
                disabled={uploadingGeneral}
                onChange={handleUploadGeneralPhotos}
                className="hidden"
              />
            </label>
          </div>

          {generalImages.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No general photos uploaded yet. Click &quot;+ Upload Photos&quot; to add some.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {generalImages.map((img, idx) => (
                <div
                  key={img.id}
                  className="group relative bg-[#F9D1D9]/20 rounded-xl border border-[#838F58]/20 overflow-hidden flex flex-col justify-between"
                >
                  <div className="aspect-square w-full overflow-hidden bg-gray-50 flex items-center justify-center">
                    <img
                      src={img.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {idx === 0 && (
                    <span className="absolute top-2 left-2 bg-[#4A5330] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                      Cover
                    </span>
                  )}

                  {/* Actions Bar */}
                  <div className="p-2 bg-white/95 border-t border-gray-100 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveImage(idx, "up")}
                        disabled={idx === 0}
                        title="Move photo earlier"
                        className="p-1 rounded-md text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveImage(idx, "down")}
                        disabled={idx === generalImages.length - 1}
                        title="Move photo later"
                        className="p-1 rounded-md text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        →
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img)}
                      title="Delete photo"
                      className="p-1 rounded-md text-xs font-bold text-red-600 hover:bg-red-50 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 2: Options (Colors) */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-6">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>🎨</span> Color Options &amp; Variants
            </h2>
              <p className="text-xs text-gray-400 mt-0.5">
              Add color choices (e.g. Red, Blue, Salmon), pick swatch hex colors, and set variant-specific stock &amp; pricing.
            </p>
          </div>

          {/* Add Option Form */}
          <div className="bg-[#838F58]/10 p-5 rounded-2xl border border-[#838F58]/20 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#4A5330]">
              + Add a New Color Option
            </h3>

            <form onSubmit={handleAddOption} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              {/* Option Name */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                  Option Name *
                </label>
                <input
                  type="text"
                  required
                  value={optionName}
                  onChange={(e) => setOptionName(e.target.value)}
                  placeholder="e.g. Ruby Red, Forest Green..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-xs outline-none bg-white min-h-[44px]"
                />
              </div>

              {/* Color Swatch Picker */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                  Color Swatch
                </label>
                <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-xl border border-gray-200 min-h-[44px]">
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(e) => {
                      setColorHex(e.target.value);
                      setHasColorHex(true);
                    }}
                    className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                  />
                  <div className="text-[11px] font-mono text-gray-600 truncate">
                    {hasColorHex ? colorHex : "None"}
                  </div>
                </div>
              </div>

              {/* Stock */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                  Stock Qty *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={optionStock}
                  onChange={(e) => setOptionStock(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-xs outline-none bg-white min-h-[44px]"
                />
              </div>

              {/* Price Override */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                  Price Override (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={optionPriceOverride}
                  onChange={(e) => setOptionPriceOverride(e.target.value)}
                  placeholder={`Base: ${product.price}`}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#4A5330] text-xs outline-none bg-white min-h-[44px]"
                />
              </div>

              <div className="sm:col-span-5 flex justify-end">
                <button
                  type="submit"
                  disabled={creatingOption || !optionName.trim()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {creatingOption ? "Adding..." : "+ Create Option"}
                </button>
              </div>
            </form>
          </div>

          {/* Options List */}
          {variants.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No color options created for this product. Use the form above to add options.
            </div>
          ) : (
            <div className="space-y-6">
              {variants.map((v) => {
                const edit = variantEdits[v.id] || {
                  stock_qty: v.stock_qty,
                  price: v.price !== null && v.price !== undefined ? String(v.price) : "",
                };
                const vPhotos = variantImages[v.id] || [];
                const isSaving = savingVariantId === v.id;
                const isUploadingThis = uploadingVariantId === v.id;

                const hasChanges =
                  Number(edit.stock_qty) !== Number(v.stock_qty) ||
                  (edit.price.trim() === ""
                    ? v.price !== null && v.price !== undefined
                    : Number(edit.price) !== Number(v.price));

                return (
                  <div
                    key={v.id}
                    className={`rounded-2xl border p-5 space-y-4 transition ${
                      v.is_active
                        ? "border-[#838F58]/30 bg-white"
                        : "border-gray-200 bg-gray-50/70 opacity-70"
                    }`}
                  >
                    {/* Variant Header & Inline Settings */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                      {/* Swatch & Name */}
                      <div className="flex items-center gap-3">
                        {v.color_hex ? (
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-xs shrink-0"
                            style={{ backgroundColor: v.color_hex }}
                            title={`Hex: ${v.color_hex}`}
                          />
                        ) : vPhotos.length > 0 ? (
                          <img
                            src={vPhotos[0].url}
                            alt={v.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#838F58]/30 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs shrink-0">
                            🎨
                          </div>
                        )}

                        <div>
                          <h4 className="font-bold text-sm text-[#4A5330] flex items-center gap-2">
                            <span>{v.name}</span>
                            {!v.is_active && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                                Hidden
                              </span>
                            )}
                          </h4>
                          <span className="text-[11px] text-gray-400">
                            Effective Price: ₱{Number(v.price ?? product.price).toFixed(2)}
                            {v.price !== null && v.price !== undefined && " (Override)"}
                          </span>
                        </div>
                      </div>

                      {/* Inline Stock, Price Override, Visibility & Save */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-gray-500 font-bold">Stock:</label>
                          <input
                            type="number"
                            min="0"
                            value={edit.stock_qty}
                            onChange={(e) =>
                              setVariantEdits({
                                ...variantEdits,
                                [v.id]: {
                                  ...edit,
                                  stock_qty: parseInt(e.target.value, 10) || 0,
                                },
                              })
                            }
                            className="w-20 px-2 py-1 rounded-xl border border-gray-200 text-xs font-bold text-[#4A5330] outline-none min-h-[38px]"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-gray-500 font-bold">₱ Price:</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={`Base: ${product.price}`}
                            value={edit.price}
                            onChange={(e) =>
                              setVariantEdits({
                                ...variantEdits,
                                [v.id]: {
                                  ...edit,
                                  price: e.target.value,
                                },
                              })
                            }
                            className="w-24 px-2 py-1 rounded-xl border border-gray-200 text-xs font-bold text-[#FF5C93] outline-none min-h-[38px]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleVariantActive(v)}
                          className={`min-h-[38px] px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                            v.is_active
                              ? "bg-green-100 text-green-800 hover:bg-green-200"
                              : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                          }`}
                        >
                          {v.is_active ? "Visible" : "Hidden"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveVariantInline(v)}
                          disabled={!hasChanges || isSaving}
                          className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            hasChanges
                              ? "bg-[#4A5330] text-white hover:bg-[#4A5330]/90 shadow-xs"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>

                    {/* Variant Photos Gallery & Uploader */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#4A5330] flex items-center gap-1.5">
                          <span>📷</span> Photos for {v.name} ({vPhotos.length})
                        </span>

                        <label className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] border border-[#838F58]/30 transition flex items-center gap-1.5 cursor-pointer">
                          <span>{isUploadingThis ? "Uploading..." : "+ Add Option Photos"}</span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/jpg"
                            disabled={isUploadingThis}
                            onChange={(e) => handleUploadVariantPhotos(v.id, e)}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {vPhotos.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic">
                          No photos specific to this option. The gallery will automatically fall back to general product photos when customers pick this swatch.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                          {vPhotos.map((img) => (
                            <div
                              key={img.id}
                              className="relative group bg-[#F9D1D9]/20 rounded-xl border border-[#838F58]/20 overflow-hidden"
                            >
                              <div className="aspect-square w-full">
                                <img
                                  src={img.url}
                                  alt={v.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteImage(img)}
                                title="Delete this option photo"
                                className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-white text-red-600 rounded-md shadow-xs text-xs font-bold min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </RequireStaff>
  );
}
