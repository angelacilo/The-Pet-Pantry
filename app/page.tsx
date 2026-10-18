"use client";

import React, { useEffect, useState, useMemo } from "react";
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
            product_variants ( id, name, color_hex, stock_qty, is_active, sort_order )
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

  const handleAddToCart = (product: Product, coverImage: string | null) => {
    add({
      product_id: product.id,
      name: product.name,
      price: product.price,
      stock_qty: product.stock_qty,
      image_url: coverImage || product.image_url,
    });

    setAddedId(product.id);
    setTimeout(() => {
      setAddedId(null);
    }, 1200);
  };

  return (
    <div className="space-y-6 pb-12">
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

            // Cover image: first general photo or product.image_url
            const coverImage = generalPhotos[0]?.url || product.image_url || null;

            // Active variants sorted
            const activeVariants = (product.product_variants || [])
              .filter((v) => v.is_active)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            const hasOptions = activeVariants.length > 0;

            // Stock calculation
            const totalStock = hasOptions
              ? activeVariants.reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0)
              : product.stock_qty;

            const inStock = totalStock > 0;

            // Check cart quantity for products without variants
            const cartItem = items.find((i) => String(i.product_id) === String(product.id) && i.variant_id === null);
            const inCartQty = cartItem?.qty || 0;
            const reachedMax = inCartQty >= product.stock_qty;
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

                  {/* Color dots for options on home card */}
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

                  {/* If product has options, customer must choose a variant on detail page */}
                  {hasOptions ? (
                    <Link
                      href={`/product/${product.id}`}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9] text-[#4A5330] hover:bg-[#F9D1D9]/80 transition flex items-center gap-1 shadow-xs"
                    >
                      <span>Choose Option →</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(product, coverImage)}
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
    </div>
  );
}
