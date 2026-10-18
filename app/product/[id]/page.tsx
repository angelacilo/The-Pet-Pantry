"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart";

interface Product {
  id: string | number;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  description: string | null;
  category_id?: number | null;
  categoryName?: string | null;
}

interface ProductImage {
  id: number | string;
  product_id: number | string;
  variant_id: number | string | null;
  url: string;
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

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params?.id as string;

  const { add, items } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [generalImages, setGeneralImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantImages, setVariantImages] = useState<Record<string | number, ProductImage[]>>({});

  const [selectedVariantId, setSelectedVariantId] = useState<string | number | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gallery container ref for swipe / scroll
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadProductDetails() {
      if (!productId) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1. Load product with categories join
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id, name, price, stock_qty, image_url, description, category_id, categories(id, name)")
          .eq("id", productId)
          .eq("is_active", true)
          .single();

        if (prodErr || !prodData) {
          throw new Error(prodErr?.message || "Product not found or currently unavailable");
        }

        const raw = prodData as any;
        const catName = Array.isArray(raw.categories)
          ? raw.categories[0]?.name
          : raw.categories?.name;

        setProduct({
          ...raw,
          categoryName: catName || null,
        });

        // 2. Load product_images
        const { data: imgData, error: imgErr } = await supabase
          .from("product_images")
          .select("id, product_id, variant_id, url, sort_order")
          .eq("product_id", productId)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });

        if (!imgErr && imgData) {
          const gen = imgData.filter((i) => i.variant_id === null);
          setGeneralImages(gen);

          const varMap: Record<string | number, ProductImage[]> = {};
          imgData.forEach((i) => {
            if (i.variant_id !== null) {
              if (!varMap[i.variant_id]) varMap[i.variant_id] = [];
              varMap[i.variant_id].push(i);
            }
          });
          setVariantImages(varMap);
        }

        // 3. Load active product_variants
        const { data: varData, error: varErr } = await supabase
          .from("product_variants")
          .select("*")
          .eq("product_id", productId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });

        if (!varErr && varData) {
          setVariants(varData as ProductVariant[]);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    loadProductDetails();
  }, [productId]);

  // Selected variant object
  const selectedVariant = useMemo(() => {
    if (selectedVariantId === null) return null;
    return variants.find((v) => String(v.id) === String(selectedVariantId)) || null;
  }, [variants, selectedVariantId]);

  // Active gallery photos based on selected variant (falls back to general photos or product image)
  const activePhotos: string[] = useMemo(() => {
    if (selectedVariantId !== null && variantImages[selectedVariantId]?.length) {
      return variantImages[selectedVariantId].map((img) => img.url);
    }
    if (generalImages.length > 0) {
      return generalImages.map((img) => img.url);
    }
    if (product?.image_url) {
      return [product.image_url];
    }
    return [];
  }, [selectedVariantId, variantImages, generalImages, product]);

  // Reset photo index when variant changes
  useEffect(() => {
    setActivePhotoIndex(0);
    if (galleryRef.current) {
      galleryRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  }, [selectedVariantId]);

  // Pricing: option's price if override exists, otherwise base product price
  const currentPrice = useMemo(() => {
    if (selectedVariant && selectedVariant.price !== null && selectedVariant.price !== undefined) {
      return Number(selectedVariant.price);
    }
    return product ? Number(product.price) : 0;
  }, [selectedVariant, product]);

  // Maximum stock available
  const hasOptions = variants.length > 0;
  const currentStock = hasOptions
    ? selectedVariant
      ? selectedVariant.stock_qty
      : 0
    : product
    ? product.stock_qty
    : 0;

  // In-cart quantity check
  const cartItemKey = `${productId}_${selectedVariant?.id ?? "base"}`;
  const existingCartItem = items.find((i) => i.id === cartItemKey);
  const inCartQty = existingCartItem ? existingCartItem.qty : 0;
  const remainingStock = Math.max(0, currentStock - inCartQty);

  const isOutOfStock = hasOptions
    ? selectedVariant
      ? selectedVariant.stock_qty === 0
      : false
    : currentStock === 0;

  const isAddToCartDisabled =
    (hasOptions && selectedVariantId === null) ||
    isOutOfStock ||
    remainingStock <= 0;

  const handleSelectVariant = (variant: ProductVariant) => {
    if (variant.stock_qty === 0) return; // Out of stock swatch disabled
    setSelectedVariantId((prev) => (prev === variant.id ? null : variant.id));
    setQty(1);
  };

  const handleAddToCart = () => {
    if (!product || isAddToCartDisabled) return;

    const thumbnail =
      activePhotos[0] ||
      product.image_url ||
      null;

    add(
      {
        product_id: product.id,
        variant_id: selectedVariant ? selectedVariant.id : null,
        variant_name: selectedVariant ? selectedVariant.name : null,
        name: product.name,
        price: currentPrice,
        stock_qty: currentStock,
        image_url: thumbnail,
      },
      qty
    );

    setIsAdded(true);
    setTimeout(() => {
      setIsAdded(false);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-[#4A5330]">Loading product details...</p>
      </div>
    );
  }

  if (errorMsg || !product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center border border-[#838F58]/20 shadow-xs">
          <span className="text-4xl block mb-3">🔍</span>
          <h2 className="text-xl font-bold text-[#4A5330] mb-2">Product Not Found</h2>
          <p className="text-sm text-[#4A5330]/75 mb-6">
            {errorMsg || "This product is currently unavailable or may have been removed."}
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-[#4A5330] text-white text-xs font-bold hover:bg-[#4A5330]/90 transition"
          >
            ← Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 sm:pb-12 max-w-5xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs font-bold text-[#838F58]">
        <Link href="/" className="hover:underline">
          Store
        </Link>
        <span>/</span>
        {product.categoryName && (
          <>
            <span className="text-gray-500">{product.categoryName}</span>
            <span>/</span>
          </>
        )}
        <span className="text-[#4A5330] truncate">{product.name}</span>
      </nav>

      {/* Main Product Card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#838F58]/20 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Left Column: Image Gallery (Swipeable + Thumbnails) */}
        <div className="space-y-4">
          {/* Main Photo Container */}
          <div className="relative w-full aspect-square bg-[#F9D1D9]/30 rounded-2xl overflow-hidden border border-[#838F58]/20 flex items-center justify-center shadow-inner group">
            {activePhotos.length > 0 ? (
              <img
                src={activePhotos[activePhotoIndex] || activePhotos[0]}
                alt={`${product.name} photo`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-[#838F58]">
                <span className="text-6xl">🥫</span>
                <span className="text-xs font-medium mt-2 text-[#4A5330]/70">
                  The Pet Pantry
                </span>
              </div>
            )}

            {/* In stock / Out of stock tag */}
            <div className="absolute top-3 right-3">
              {hasOptions && !selectedVariant ? (
                <span className="bg-white/90 backdrop-blur-xs text-[#4A5330] text-xs font-bold px-3 py-1 rounded-full border border-[#838F58]/30 shadow-xs">
                  Choose an option
                </span>
              ) : isOutOfStock ? (
                <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                  Out of stock
                </span>
              ) : (
                <span className="bg-white/95 backdrop-blur-xs text-[#4A5330] text-xs font-bold px-3 py-1 rounded-full border border-[#838F58]/30 shadow-xs">
                  In stock ({currentStock})
                </span>
              )}
            </div>
          </div>

          {/* Swipeable Thumbnails Row (Desktop and Mobile) */}
          {activePhotos.length > 1 && (
            <div
              ref={galleryRef}
              className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x"
            >
              {activePhotos.map((photoUrl, idx) => {
                const isSelected = idx === activePhotoIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden border-2 transition cursor-pointer snap-start min-h-[44px] min-w-[44px] ${
                      isSelected
                        ? "border-[#4A5330] ring-2 ring-[#4A5330]/20 shadow-xs"
                        : "border-gray-200 hover:border-[#838F58]"
                    }`}
                  >
                    <img
                      src={photoUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Details, Color Swatches, Quantity & Add to Cart */}
        <div className="space-y-6">
          <div>
            {product.categoryName && (
              <span className="text-xs font-extrabold text-[#838F58] tracking-wider uppercase block mb-1">
                {product.categoryName}
              </span>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#4A5330] leading-tight">
              {product.name}
            </h1>

            {/* Price */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#FF5C93]">
                ₱{currentPrice.toFixed(2)}
              </span>
              {selectedVariant && selectedVariant.price !== null && selectedVariant.price !== undefined && (
                <span className="text-xs text-[#838F58] font-bold">
                  (Option price)
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="text-sm text-[#4A5330]/85 leading-relaxed bg-[#F9D1D9]/20 p-4 rounded-xl border border-[#838F58]/20">
              <p>{product.description}</p>
            </div>
          )}

          {/* Color Swatches (if variants exist) */}
          {hasOptions && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#4A5330]">
                  Color Option:{" "}
                  <span className="text-[#FF5C93] normal-case">
                    {selectedVariant ? selectedVariant.name : "Select a color *"}
                  </span>
                </label>
                {selectedVariant && (
                  <span className="text-xs text-gray-400">
                    {selectedVariant.stock_qty} in stock
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {variants.map((v) => {
                  const isSelected = selectedVariantId === v.id;
                  const isZero = v.stock_qty === 0;
                  const vFirstPhoto = variantImages[v.id]?.[0]?.url;

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={isZero}
                      onClick={() => handleSelectVariant(v)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border-2 transition cursor-pointer ${
                        isZero
                          ? "opacity-40 border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through"
                          : isSelected
                          ? "border-[#4A5330] bg-[#838F58]/15 text-[#4A5330] shadow-xs ring-2 ring-[#4A5330]/20"
                          : "border-gray-200 hover:border-[#838F58] text-[#4A5330] bg-white"
                      }`}
                    >
                      {/* Swatch circle or round thumbnail */}
                      {v.color_hex ? (
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shrink-0 shadow-inner"
                          style={{ backgroundColor: v.color_hex }}
                        />
                      ) : vFirstPhoto ? (
                        <img
                          src={vFirstPhoto}
                          alt={v.name}
                          className="w-5 h-5 rounded-full object-cover border border-black/10 shrink-0"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] shrink-0">
                          🎨
                        </span>
                      )}

                      <span>{v.name}</span>

                      {isZero ? (
                        <span className="text-[10px] text-red-500 font-semibold">(Out of stock)</span>
                      ) : (
                        v.price !== null &&
                        v.price !== undefined && (
                          <span className="text-[11px] text-[#FF5C93] font-bold">
                            ₱{Number(v.price).toFixed(2)}
                          </span>
                        )
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedVariantId === null && (
                <p className="text-[11px] text-amber-700 font-medium">
                  ⚠️ Please select a color option above before adding to your cart.
                </p>
              )}
            </div>
          )}

          {/* Quantity Selector & Add to Cart */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-4">
              <label className="text-xs font-bold uppercase tracking-wider text-[#4A5330]">
                Quantity
              </label>

              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                <button
                  type="button"
                  onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                  disabled={qty <= 1 || isAddToCartDisabled}
                  className="min-h-[44px] min-w-[44px] text-base font-bold text-[#4A5330] hover:bg-gray-200 transition disabled:opacity-30 cursor-pointer flex items-center justify-center"
                >
                  -
                </button>
                <span className="px-4 py-2 text-sm font-bold text-[#4A5330] min-w-10 text-center bg-white">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((prev) => Math.min(prev + 1, remainingStock))}
                  disabled={qty >= remainingStock || isAddToCartDisabled}
                  className="min-h-[44px] min-w-[44px] text-base font-bold text-[#4A5330] hover:bg-gray-200 transition disabled:opacity-30 cursor-pointer flex items-center justify-center"
                >
                  +
                </button>
              </div>

              {inCartQty > 0 && (
                <span className="text-xs text-[#838F58] font-semibold">
                  ({inCartQty} already in cart)
                </span>
              )}
            </div>

            {/* Desktop Add to Cart Button */}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isAddToCartDisabled}
              className={`w-full min-h-[48px] py-3.5 px-6 rounded-xl font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                isAddToCartDisabled
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : isAdded
                  ? "bg-[#838F58] text-white"
                  : "bg-[#4A5330] hover:bg-[#4A5330]/90 text-white shadow-xs"
              }`}
            >
              {hasOptions && selectedVariantId === null ? (
                "Choose an Option to Add to Cart"
              ) : isOutOfStock ? (
                "Sold Out"
              ) : isAdded ? (
                "✓ Added to Cart!"
              ) : (
                <>
                  <span>🛒</span>
                  <span>Add to Cart — ₱{(currentPrice * qty).toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar for Mobile */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#838F58]/20 shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] text-gray-500 font-semibold block -mb-0.5">Price</span>
          <span className="text-xl font-black text-[#FF5C93]">
            ₱{(currentPrice * qty).toFixed(2)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isAddToCartDisabled}
          className={`flex-1 max-w-[220px] min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs shadow-sm transition text-center flex items-center justify-center cursor-pointer ${
            isAddToCartDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : isAdded
              ? "bg-[#838F58] text-white"
              : "bg-[#4A5330] hover:bg-[#4A5330]/90 text-white"
          }`}
        >
          {hasOptions && selectedVariantId === null
            ? "Choose Option"
            : isOutOfStock
            ? "Sold Out"
            : isAdded
            ? "✓ Added!"
            : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
