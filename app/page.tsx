"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart";

interface Category {
  id: number | string;
  name: string;
  sort_order: number;
}

interface ProductImage {
  id: number | string;
  variant_id: number | string | null;
  url: string;
  sort_order: number;
}

interface ProductVariant {
  id: number | string;
  name: string;
  color_hex: string | null;
  stock_qty: number;
  is_active: boolean;
  sort_order: number;
  price?: number | null;
}

export interface Product {
  id: string | number;
  name: string;
  price: number;
  stock_qty: number;
  image_url: string | null;
  is_active: boolean;
  category_id?: number | null;
  categoryName?: string | null;
  description: string | null;
  product_images?: ProductImage[];
  product_variants?: ProductVariant[];
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [addedId, setAddedId] = useState<string | number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal State for Change 1 (Color Modal)
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [modalQty, setModalQty] = useState(1);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  const { add, items } = useCart();

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      setErrorMsg(null);
      try {
        // 1. Load active categories from categories table
        const { data: catData, error: catErr } = await supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (catErr) {
          console.warn("Could not load categories:", catErr.message);
        } else {
          setCategories((catData as Category[]) || []);
        }

        // 2. Load active products with categories, images, and variants
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select(`
            id, name, price, stock_qty, image_url, description, is_active, category_id,
            categories ( id, name ),
            product_images ( id, variant_id, url, sort_order ),
            product_variants ( id, name, color_hex, stock_qty, is_active, sort_order, price )
          `)
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (prodErr) {
          setErrorMsg(prodErr.message);
        } else {
          const rawList = (prodData as any[]) || [];
          const list: Product[] = rawList.map((p) => {
            const catName = Array.isArray(p.categories)
              ? p.categories[0]?.name
              : p.categories?.name;
            return {
              ...p,
              categoryName: catName || null,
            };
          });
          setProducts(list);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setLoading(false);
      }
    }

    loadCatalog();
  }, []);

  // Filter chips come from categories table (active only, ordered by sort_order), plus "All"
  const categoryPills = useMemo(() => {
    return ["All", ...categories.map((c) => c.name)];
  }, [categories]);

  // Filter products by category and search term
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory =
        selectedCategory === "All" ||
        (p.categoryName &&
          p.categoryName.toLowerCase() === selectedCategory.toLowerCase());

      const term = search.toLowerCase();
      const matchSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(term));

      return matchCategory && matchSearch;
    });
  }, [products, selectedCategory, search]);

  const showToast = (message: string) => {
    setToastMsg(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 2400);
  };

  // Direct add for products with NO options
  const handleAddDirectToCart = (product: Product, coverImage: string | null) => {
    add({
      product_id: product.id,
      name: product.name,
      price: product.price,
      stock_qty: product.stock_qty,
      image_url: coverImage || product.image_url,
    }, 1);

    setAddedId(product.id);
    showToast("Added to cart");
    setTimeout(() => {
      setAddedId(null);
    }, 1200);
  };

  // Open modal for products WITH active options
  const handleOpenColorModal = (product: Product, e: React.MouseEvent<HTMLButtonElement>) => {
    lastFocusedElement.current = e.currentTarget;
    setModalProduct(product);
    setSelectedVariant(null);
    setModalQty(1);

    // Initial modal image: first general photo or product.image_url or first option's first photo
    const generalPhotos = (product.product_images || [])
      .filter((i) => i.variant_id === null)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const activeVars = (product.product_variants || [])
      .filter((v) => v.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    let firstOptPhoto: string | null = null;
    if (activeVars.length > 0) {
      const vPhotos = (product.product_images || [])
        .filter((img) => String(img.variant_id) === String(activeVars[0].id))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (vPhotos.length > 0) {
        firstOptPhoto = vPhotos[0].url;
      }
    }

    const initialImg = generalPhotos[0]?.url || product.image_url || firstOptPhoto || null;
    setActivePreviewImage(initialImg);
  };

  const handleCloseModal = () => {
    setModalProduct(null);
    setSelectedVariant(null);
    setActivePreviewImage(null);
    setModalQty(1);
    // Return focus to the trigger button
    setTimeout(() => {
      lastFocusedElement.current?.focus();
    }, 50);
  };

  // Close modal on Escape key & lock scroll
  useEffect(() => {
    if (!modalProduct) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalProduct]);

  // Handle color selection inside modal
  const handleSelectVariant = (variant: ProductVariant) => {
    if (variant.stock_qty <= 0) return; // Out of stock
    setSelectedVariant(variant);
    setModalQty(1);

    // Switch large image to selected color's first photo, or fallback to general photo
    const variantPhotos = (modalProduct?.product_images || [])
      .filter((img) => String(img.variant_id) === String(variant.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const generalPhotos = (modalProduct?.product_images || [])
      .filter((i) => i.variant_id === null)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const fallback = generalPhotos[0]?.url || modalProduct?.image_url || null;

    if (variantPhotos.length > 0) {
      setActivePreviewImage(variantPhotos[0].url);
    } else {
      setActivePreviewImage(fallback);
    }
  };

  // Confirm add to cart inside modal
  const handleConfirmAddToCart = () => {
    if (!modalProduct || !selectedVariant) return;

    const price =
      selectedVariant.price != null && Number(selectedVariant.price) > 0
        ? Number(selectedVariant.price)
        : Number(modalProduct.price);

    // Variant first photo or active preview
    const variantPhotos = (modalProduct.product_images || [])
      .filter((img) => String(img.variant_id) === String(selectedVariant.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const itemThumbnail =
      activePreviewImage ||
      variantPhotos[0]?.url ||
      modalProduct.image_url ||
      null;

    add(
      {
        product_id: modalProduct.id,
        variant_id: selectedVariant.id,
        variant_name: selectedVariant.name,
        name: modalProduct.name,
        price,
        stock_qty: selectedVariant.stock_qty,
        image_url: itemThumbnail,
      },
      modalQty
    );

    handleCloseModal();
    showToast("Added to cart");
  };

  // Helper variables for current modal product
  const modalActiveVariants = useMemo(() => {
    if (!modalProduct) return [];
    return (modalProduct.product_variants || [])
      .filter((v) => v.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [modalProduct]);

  const modalSelectedColorPhotos = useMemo(() => {
    if (!modalProduct || !selectedVariant) return [];
    return (modalProduct.product_images || [])
      .filter((img) => String(img.variant_id) === String(selectedVariant.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [modalProduct, selectedVariant]);

  const modalCurrentPrice = useMemo(() => {
    if (!modalProduct) return 0;
    if (selectedVariant && selectedVariant.price != null && Number(selectedVariant.price) > 0) {
      return Number(selectedVariant.price);
    }
    return Number(modalProduct.price);
  }, [modalProduct, selectedVariant]);

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#4A5330] text-white text-sm font-bold rounded-2xl shadow-xl border border-white/20 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <span className="w-5 h-5 rounded-full bg-[#838F58] flex items-center justify-center text-xs text-white">
            ✓
          </span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Friendly Store Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#838F58]/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F9D1D9] text-[#4A5330] text-xs font-bold tracking-wide">
            <span>✨</span> Welcome to The Pet Pantry
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#4A5330] tracking-tight">
            Nourish Your Furry Best Friends
          </h1>
          <p className="text-sm sm:text-base text-[#4A5330]/80 max-w-xl">
            Healthy meals, crunchy snacks, and tail-wagging essentials. Order online for swift delivery via Maxim or convenient store pickup!
          </p>
        </div>
        <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 bg-[#F9D1D9] rounded-2xl flex items-center justify-center p-3 shadow-inner">
          <img
            src="/logo.png"
            alt="The Pet Pantry"
            className="w-full h-full object-contain drop-shadow-sm"
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#838F58]/20 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search kibble, treats, toys..."
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] focus:ring-2 focus:ring-[#838F58]/20 text-sm outline-none transition min-h-[44px]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[30px] justify-center"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Pills (Active categories only, ordered by sort_order, plus 'All') */}
        {categoryPills.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
            {categoryPills.map((catName) => {
              const active = selectedCategory.toLowerCase() === catName.toLowerCase();
              return (
                <button
                  key={catName}
                  onClick={() => setSelectedCategory(catName)}
                  className={`min-h-[44px] px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center justify-center ${
                    active
                      ? "bg-[#4A5330] text-white shadow-xs"
                      : "bg-[#F9D1D9]/60 text-[#4A5330] hover:bg-[#F9D1D9]"
                  }`}
                >
                  {catName}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="min-h-[40vh] flex flex-col items-center justify-center py-12 text-center">
          <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#4A5330]">
            Fetching pantry goodies...
          </p>
        </div>
      )}

      {/* Error state */}
      {errorMsg && !loading && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-bold mb-1">Failed to load pantry catalog:</p>
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !errorMsg && filteredProducts.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#838F58]/20">
          <span className="text-4xl">🐾</span>
          <h3 className="text-lg font-bold text-[#4A5330] mt-3">No products found</h3>
          <p className="text-sm text-[#4A5330]/75 mt-1 max-w-sm mx-auto">
            {search || selectedCategory !== "All"
              ? "Try adjusting your search or category filter to discover other items."
              : "Our shelves are currently being restocked. Please check back soon!"}
          </p>
          {(search || selectedCategory !== "All") && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition min-h-[44px]"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Product Grid */}
      {!loading && !errorMsg && filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => {
            // General photos sorted
            const generalPhotos = (product.product_images || [])
              .filter((i) => i.variant_id === null)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            // Active variants sorted by sort_order
            const activeVariants = (product.product_variants || [])
              .filter((v) => v.is_active)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            const hasOptions = activeVariants.length > 0;

            // First option's first photo for fallback (Rule 18)
            let firstOptionPhoto: string | null = null;
            if (hasOptions) {
              const firstVariantPhotos = (product.product_images || [])
                .filter((img) => String(img.variant_id) === String(activeVariants[0].id))
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              if (firstVariantPhotos.length > 0) {
                firstOptionPhoto = firstVariantPhotos[0].url;
              }
            }

            // Cover image: first general photo; when no general photos, use first option's first photo (Rule 18)
            const coverImage = generalPhotos.length > 0
              ? generalPhotos[0].url
              : (firstOptionPhoto || product.image_url || null);

            // Stock calculation
            const totalStock = hasOptions
              ? activeVariants.reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0)
              : product.stock_qty;

            const inStock = totalStock > 0;

            // Check cart quantity for products without variants
            const cartItem = items.find((i) => String(i.product_id) === String(product.id) && i.variant_id === null);
            const inCartQty = cartItem?.qty || 0;
            const reachedMax = !hasOptions && inCartQty >= product.stock_qty;
            const isJustAdded = addedId === product.id;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl p-4 shadow-xs border border-[#838F58]/20 flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div>
                  {/* Product Image & Link to Product Detail Page */}
                  <Link
                    href={`/product/${product.id}`}
                    className="block relative w-full aspect-square bg-[#F9D1D9]/40 rounded-xl overflow-hidden mb-3"
                  >
                    {coverImage ? (
                      <img
                        src={coverImage}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-[#838F58]">
                        <span className="text-4xl">🥫</span>
                        <span className="text-[11px] font-medium mt-1 text-[#4A5330]/60">
                          The Pet Pantry
                        </span>
                      </div>
                    )}

                    {/* Stock badge overlay */}
                    <div className="absolute top-2 right-2">
                      {inStock ? (
                        <span className="bg-white/90 backdrop-blur-xs text-[#4A5330] text-[11px] font-bold px-2 py-0.5 rounded-full border border-[#838F58]/30 shadow-xs">
                          {hasOptions ? `${activeVariants.length} options` : `In stock (${totalStock})`}
                        </span>
                      ) : (
                        <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Category */}
                  {product.categoryName && (
                    <span className="text-[11px] font-bold text-[#838F58] tracking-wider uppercase block mb-1">
                      {product.categoryName}
                    </span>
                  )}

                  {/* Title linking to detail page */}
                  <Link
                    href={`/product/${product.id}`}
                    className="font-bold text-base text-[#4A5330] line-clamp-2 leading-snug hover:text-[#FF5C93] transition"
                  >
                    {product.name}
                  </Link>

                  {/* Color dots for options on home card (exact color_hex in sort_order) */}
                  {hasOptions && (
                    <div className="flex items-center gap-1.5 my-2">
                      {activeVariants.slice(0, 5).map((v) => (
                        v.color_hex ? (
                          <span
                            key={v.id}
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: v.color_hex }}
                            title={v.name}
                          />
                        ) : (
                          <span
                            key={v.id}
                            className="w-3.5 h-3.5 rounded-full bg-gray-300 border border-black/10 shrink-0"
                            title={v.name}
                          />
                        )
                      ))}
                      {activeVariants.length > 5 && (
                        <span className="text-[10px] text-gray-400 font-bold">
                          +{activeVariants.length - 5}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500 ml-1">
                        {activeVariants.length} {activeVariants.length === 1 ? "color" : "colors"}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  {product.description && (
                    <p className="text-xs text-[#4A5330]/75 line-clamp-2 mt-1">
                      {product.description}
                    </p>
                  )}
                </div>

                {/* Price and Action Button */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs text-gray-400 block -mb-0.5">Price</span>
                    <span className="text-lg font-black text-[#FF5C93]">
                      ₱{Number(product.price).toFixed(2)}
                    </span>
                  </div>

                  {/* Add to cart button (Change 1: replaces Choose Option) */}
                  {hasOptions ? (
                    <button
                      onClick={(e) => handleOpenColorModal(product, e)}
                      disabled={!inStock}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                        !inStock
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-[#4A5330] hover:bg-[#4A5330]/90 text-white"
                      }`}
                    >
                      {!inStock ? (
                        "Sold Out"
                      ) : (
                        <>
                          <span>+</span>
                          <span>Add to cart</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAddDirectToCart(product, coverImage)}
                      disabled={!inStock || reachedMax}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        !inStock
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : reachedMax
                          ? "bg-amber-100 text-amber-800 cursor-not-allowed"
                          : isJustAdded
                          ? "bg-[#838F58] text-white"
                          : "bg-[#4A5330] hover:bg-[#4A5330]/90 text-white shadow-xs"
                      }`}
                    >
                      {!inStock ? (
                        "Sold Out"
                      ) : isJustAdded ? (
                        "✓ Added!"
                      ) : reachedMax ? (
                        "Max in Cart"
                      ) : (
                        <>
                          <span>+</span>
                          <span>Add to cart</span>
                          {inCartQty > 0 && ` (${inCartQty})`}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CHANGE 1: COLOR MODAL (Bottom sheet on mobile, centered dialog on desktop) */}
      {modalProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-product-title"
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl p-5 sm:p-6 relative border border-gray-100 animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
              <div>
                <span className="text-[11px] font-bold text-[#838F58] uppercase tracking-wider block">
                  {modalProduct.categoryName || "Pet Pantry"}
                </span>
                <h2
                  id="modal-product-title"
                  className="text-lg sm:text-xl font-black text-[#4A5330] leading-snug"
                >
                  {modalProduct.name}
                </h2>
              </div>
              <button
                onClick={handleCloseModal}
                aria-label="Close dialog"
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 py-4">
              {/* Large Image Preview */}
              <div className="relative w-full aspect-4/3 rounded-2xl bg-[#F9D1D9]/40 overflow-hidden border border-[#838F58]/20 flex items-center justify-center">
                {activePreviewImage ? (
                  <img
                    src={activePreviewImage}
                    alt={modalProduct.name}
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#838F58]">
                    <span className="text-5xl">🥫</span>
                    <span className="text-xs font-semibold mt-2 text-[#4A5330]/60">
                      The Pet Pantry
                    </span>
                  </div>
                )}
              </div>

              {/* Small thumbnails of selected color's photos */}
              {modalSelectedColorPhotos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {modalSelectedColorPhotos.map((photo, idx) => {
                    const isPhotoActive = activePreviewImage === photo.url;
                    return (
                      <button
                        key={photo.id || idx}
                        type="button"
                        onClick={() => setActivePreviewImage(photo.url)}
                        className={`min-h-[44px] min-w-[44px] w-12 h-12 rounded-xl overflow-hidden border-2 p-0.5 transition shrink-0 ${
                          isPhotoActive
                            ? "border-[#4A5330] ring-2 ring-[#4A5330]/30"
                            : "border-gray-200 hover:border-gray-400 opacity-80"
                        }`}
                      >
                        <img
                          src={photo.url}
                          alt={`${selectedVariant?.name || "Color"} thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Price display */}
              <div className="flex items-baseline justify-between gap-2 pt-1">
                <div>
                  <span className="text-xs text-gray-400 block">Price</span>
                  <span className="text-2xl font-black text-[#FF5C93]">
                    ₱{modalCurrentPrice.toFixed(2)}
                  </span>
                </div>
                {selectedVariant && (
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block">Stock</span>
                    <span
                      className={`text-xs font-bold ${
                        selectedVariant.stock_qty > 0 ? "text-[#4A5330]" : "text-red-500"
                      }`}
                    >
                      {selectedVariant.stock_qty > 0
                        ? `${selectedVariant.stock_qty} available`
                        : "Out of stock"}
                    </span>
                  </div>
                )}
              </div>

              {/* Color Swatches Section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#4A5330] tracking-wide">
                    Choose a color
                  </span>
                  {selectedVariant && (
                    <span className="text-xs font-semibold text-[#838F58]">
                      Selected: <strong className="text-[#4A5330]">{selectedVariant.name}</strong>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  {modalActiveVariants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const isOutOfStock = v.stock_qty <= 0;

                    // Option photo thumbnail if no hex
                    const optPhotos = (modalProduct.product_images || [])
                      .filter((img) => String(img.variant_id) === String(v.id))
                      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                    const optThumb = optPhotos[0]?.url || null;

                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        disabled={isOutOfStock}
                        title={isOutOfStock ? `${v.name} (Out of stock)` : v.name}
                        className={`flex flex-col items-center gap-1 min-h-[44px] min-w-[44px] p-1 rounded-xl transition cursor-pointer ${
                          isOutOfStock ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center relative transition-transform ${
                            isSelected
                              ? "ring-2 ring-offset-2 ring-[#4A5330] scale-110 shadow-sm"
                              : "border border-gray-300"
                          } ${isOutOfStock ? "border-dashed border-gray-400" : ""}`}
                          style={{
                            backgroundColor: v.color_hex || undefined,
                          }}
                        >
                          {!v.color_hex && optThumb && (
                            <img
                              src={optThumb}
                              alt={v.name}
                              className="w-full h-full object-cover rounded-full"
                            />
                          )}
                          {!v.color_hex && !optThumb && (
                            <span className="text-[10px] font-bold text-gray-500">
                              {v.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-full text-red-600 font-bold text-[10px]">
                              ✕
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[11px] font-medium max-w-[64px] truncate text-center ${
                            isSelected ? "font-bold text-[#4A5330]" : "text-gray-600"
                          }`}
                        >
                          {v.name}
                        </span>
                        {isOutOfStock && (
                          <span className="text-[9px] font-bold text-red-500 -mt-1">
                            Out of stock
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                <span className="text-xs font-bold text-[#4A5330]">Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                    disabled={!selectedVariant || modalQty <= 1}
                    aria-label="Decrease quantity"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 text-base font-bold flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-black text-[#4A5330]">
                    {modalQty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setModalQty((q) =>
                        Math.min(q + 1, selectedVariant ? selectedVariant.stock_qty : 9999)
                      )
                    }
                    disabled={
                      !selectedVariant ||
                      modalQty >= (selectedVariant ? selectedVariant.stock_qty : 1)
                    }
                    aria-label="Increase quantity"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 text-base font-bold flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Primary Action Button */}
            <div className="pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleConfirmAddToCart}
                disabled={!selectedVariant || selectedVariant.stock_qty <= 0}
                className={`w-full min-h-[48px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                  !selectedVariant
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : selectedVariant.stock_qty <= 0
                    ? "bg-red-100 text-red-600 cursor-not-allowed"
                    : "bg-[#4A5330] hover:bg-[#4A5330]/90 text-white"
                }`}
              >
                {!selectedVariant ? (
                  "Choose a color"
                ) : selectedVariant.stock_qty <= 0 ? (
                  "Out of stock"
                ) : (
                  <>
                    <span>Add to cart</span>
                    <span>•</span>
                    <span>₱{(modalCurrentPrice * modalQty).toFixed(2)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
