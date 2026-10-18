"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/lib/cart";
import {
  getLastDetails,
  saveLastDetails,
  addOrderToken,
} from "@/lib/myOrders";
import "leaflet/dist/leaflet.css";

interface QuoteResult {
  status: "ok" | "too_far" | "manual";
  distance_km?: number;
  fee?: number;
  max_km?: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [deliveryOption, setDeliveryOption] = useState<"maxim" | "pickup">("maxim");
  const [address, setAddress] = useState("");
  const [pickupSchedule, setPickupSchedule] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Delivery Pin & Geolocation
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Delivery fee quote from DB
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const tileAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "";

  // Prefill details from localStorage
  useEffect(() => {
    const last = getLastDetails();
    if (last) {
      if (last.fullName) setFullName(last.fullName);
      if (last.contactNumber) setContactNumber(last.contactNumber);
      if (last.deliveryOption) setDeliveryOption(last.deliveryOption);
      if (last.address) setAddress(last.address);
      if (last.pickupSchedule) setPickupSchedule(last.pickupSchedule);
    }
  }, []);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Initialize or update optional Leaflet map when tileUrl is provided
  useEffect(() => {
    if (deliveryOption !== "maxim" || !tileUrl || !mapContainerRef.current) return;
    let isMounted = true;

    import("leaflet").then((LModule) => {
      if (!isMounted || !mapContainerRef.current) return;
      const L = LModule.default;

      if (!mapRef.current) {
        const initialLat = deliveryLat || 14.5995;
        const initialLng = deliveryLng || 120.9842;
        const zoom = deliveryLat && deliveryLng ? 15 : 12;

        const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], zoom);
        L.tileLayer(tileUrl, {
          attribution: tileAttribution,
          maxZoom: 19,
        }).addTo(map);

        const customIcon = L.divIcon({
          className: "custom-leaflet-pin",
          html: `<div style="background-color:#FF5C93;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;cursor:grab;">📍</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });

        if (deliveryLat && deliveryLng) {
          const marker = L.marker([deliveryLat, deliveryLng], {
            icon: customIcon,
            draggable: true,
          }).addTo(map);

          marker.on("dragend", (e: any) => {
            const pos = e.target.getLatLng();
            setDeliveryLat(pos.lat);
            setDeliveryLng(pos.lng);
          });
          markerRef.current = marker;
        }

        map.on("click", (e: any) => {
          const { lat, lng } = e.latlng;
          setDeliveryLat(lat);
          setDeliveryLng(lng);

          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            const marker = L.marker([lat, lng], {
              icon: customIcon,
              draggable: true,
            }).addTo(map);

            marker.on("dragend", (ev: any) => {
              const pos = ev.target.getLatLng();
              setDeliveryLat(pos.lat);
              setDeliveryLng(pos.lng);
            });
            markerRef.current = marker;
          }
        });

        mapRef.current = map;
      } else {
        if (deliveryLat && deliveryLng) {
          mapRef.current.setView([deliveryLat, deliveryLng], 15);
          if (markerRef.current) {
            markerRef.current.setLatLng([deliveryLat, deliveryLng]);
          } else {
            const customIcon = L.divIcon({
              className: "custom-leaflet-pin",
              html: `<div style="background-color:#FF5C93;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;cursor:grab;">📍</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 28],
            });
            const marker = L.marker([deliveryLat, deliveryLng], {
              icon: customIcon,
              draggable: true,
            }).addTo(mapRef.current);

            marker.on("dragend", (ev: any) => {
              const pos = ev.target.getLatLng();
              setDeliveryLat(pos.lat);
              setDeliveryLng(pos.lng);
            });
            markerRef.current = marker;
          }
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [deliveryOption, tileUrl, tileAttribution, deliveryLat, deliveryLng]);

  // Debounced quote_delivery call when a pin exists
  useEffect(() => {
    if (deliveryOption !== "maxim") {
      setQuoteResult(null);
      return;
    }

    if (deliveryLat === null || deliveryLng === null) {
      setQuoteResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data, error } = await supabase.rpc("quote_delivery", {
          p_lat: deliveryLat,
          p_lng: deliveryLng,
        });

        if (error) {
          console.warn("quote_delivery error:", error.message);
          setQuoteResult({ status: "manual" });
        } else {
          setQuoteResult(data as QuoteResult);
        }
      } catch (err) {
        console.warn("quote_delivery exception:", err);
        setQuoteResult({ status: "manual" });
      } finally {
        setQuoting(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [deliveryOption, deliveryLat, deliveryLng]);

  // Geolocation button handler
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDeliveryLat(lat);
        setDeliveryLng(lng);
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            "Location permission was denied. Please allow location permissions in your browser settings, or enter your complete address and staff will confirm your fee."
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError("Location information is unavailable on your device.");
        } else if (err.code === err.TIMEOUT) {
          setGeoError("Location request timed out. Please try again.");
        } else {
          setGeoError("Could not retrieve current location: " + err.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Empty Cart Check
  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center border border-[#838F58]/20">
          <span className="text-4xl block mb-3">🛒</span>
          <h2 className="text-xl font-bold text-[#4A5330]">Your Cart is Empty</h2>
          <p className="text-sm text-[#4A5330]/80 mt-1 mb-6">
            Add items to your cart before proceeding to checkout.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-[#4A5330] text-white text-sm font-bold min-h-[44px] leading-none flex items-center justify-center mx-auto"
          >
            Go to Shop
          </Link>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check: If filled by a bot, silently do nothing
    if (honeypot && honeypot.trim() !== "") {
      return;
    }

    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg("Please enter your full name");
      return;
    }
    if (!contactNumber.trim()) {
      setErrorMsg("Please provide your contact number");
      return;
    }
    if (deliveryOption === "maxim" && !address.trim()) {
      setErrorMsg("Please enter your complete delivery address for Maxim delivery");
      return;
    }
    if (deliveryOption === "pickup" && !pickupSchedule.trim()) {
      setErrorMsg("Please provide your preferred pickup schedule");
      return;
    }

    setSubmitting(true);

    try {
      // Format items for place_order RPC: jsonb of { product_id, variant_id, qty }
      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
      }));

      // Call database function place_order (returns uuid token string)
      const { data: orderToken, error: rpcError } = await supabase.rpc(
        "place_order",
        {
          p_full_name: fullName.trim(),
          p_contact: contactNumber.trim(),
          p_delivery: deliveryOption,
          p_address: deliveryOption === "maxim" ? address.trim() : null,
          p_pickup: deliveryOption === "pickup" ? pickupSchedule.trim() : null,
          p_items: rpcItems,
          p_lat: deliveryOption === "maxim" && deliveryLat !== null ? deliveryLat : null,
          p_lng: deliveryOption === "maxim" && deliveryLng !== null ? deliveryLng : null,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!orderToken) {
        throw new Error("Did not receive an order token. Please try again.");
      }

      const tokenStr = String(orderToken);

      // Save token to localStorage list of order tokens
      addOrderToken(tokenStr);

      // Save customer details to prefill next checkout
      saveLastDetails({
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        deliveryOption,
        address: deliveryOption === "maxim" ? address.trim() : undefined,
        pickupSchedule: deliveryOption === "pickup" ? pickupSchedule.trim() : undefined,
      });

      // Clear cart
      clear();

      // Redirect to guest order page using the returned uuid token
      router.push(`/orders/${tokenStr}`);
    } catch (err: unknown) {
      console.error("place_order error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to place order");
      setSubmitting(false);
    }
  };

  const deliveryFeeNumber =
    deliveryOption === "maxim" && quoteResult?.status === "ok" && typeof quoteResult.fee === "number"
      ? quoteResult.fee
      : null;

  const finalTotalPreview =
    deliveryOption === "pickup"
      ? subtotal
      : deliveryFeeNumber !== null
      ? subtotal + deliveryFeeNumber
      : subtotal;

  return (
    <div className="space-y-6 pb-28 sm:pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#4A5330]">Guest Checkout</h1>
          <p className="text-xs sm:text-sm text-[#4A5330]/75">
            Quick ordering — no sign-up or password required!
          </p>
        </div>
        <Link
          href="/cart"
          className="text-xs font-bold text-[#838F58] hover:underline"
        >
          ← Edit Cart
        </Link>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <form id="checkout-form" onSubmit={handlePlaceOrder} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact & Delivery Form */}
        <div className="md:col-span-2 space-y-5">
          {/* Hidden Honeypot Input */}
          <div style={{ display: "none" }} aria-hidden="true">
            <label htmlFor="website_url">Do not fill this</label>
            <input
              id="website_url"
              type="text"
              name="website_url"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {/* Customer Info Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>👤</span> Recipient Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Maria Santos"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Contact Number *
                </label>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="0917 123 4567"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Delivery Option Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
              <span>🚚</span> Delivery or Pickup Option
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                  deliveryOption === "maxim"
                    ? "border-[#4A5330] bg-[#838F58]/10"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="delivery_option"
                  value="maxim"
                  checked={deliveryOption === "maxim"}
                  onChange={() => setDeliveryOption("maxim")}
                  className="mt-1 accent-[#4A5330]"
                />
                <div>
                  <span className="font-bold text-sm text-[#4A5330] block">
                    Maxim Delivery
                  </span>
                  <span className="text-xs text-[#4A5330]/75">
                    Rider dispatched directly to your doorstep with instant GPS distance fee.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition ${
                  deliveryOption === "pickup"
                    ? "border-[#4A5330] bg-[#838F58]/10"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="delivery_option"
                  value="pickup"
                  checked={deliveryOption === "pickup"}
                  onChange={() => setDeliveryOption("pickup")}
                  className="mt-1 accent-[#4A5330]"
                />
                <div>
                  <span className="font-bold text-sm text-[#4A5330] block">
                    Store Self-Pickup
                  </span>
                  <span className="text-xs text-[#4A5330]/75">
                    Free pickup at The Pet Pantry shop at your scheduled time.
                  </span>
                </div>
              </label>
            </div>

            {/* Maxim Address & Location field */}
            {deliveryOption === "maxim" && (
              <div className="pt-2 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                    Complete Delivery Address *
                  </label>
                  <textarea
                    rows={3}
                    required
                    autoComplete="street-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House/Unit #, Street, Barangay, City, Landmark (e.g. Near Blue Gate)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition"
                  />
                </div>

                {/* Delivery Location Section */}
                <div className="bg-[#838F58]/10 p-4 rounded-xl border border-[#838F58]/25 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-[#4A5330] flex items-center gap-1.5">
                        <span>📍</span> Delivery Location
                      </h3>
                      <p className="text-[11px] text-[#4A5330]/75 mt-0.5">
                        Pin your exact delivery spot for accurate fee computation.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGetCurrentLocation}
                      disabled={geoLoading}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <span>🎯</span>
                      <span>{geoLoading ? "Locating..." : "Use my current location"}</span>
                    </button>
                  </div>

                  {geoError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                      {geoError}
                    </div>
                  )}

                  {/* Pin Status & Google Maps Link */}
                  {deliveryLat !== null && deliveryLng !== null ? (
                    <div className="p-3 bg-white rounded-xl border border-[#838F58]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-green-800 font-bold">
                        <span>✓</span>
                        <span>Location pinned: ({deliveryLat.toFixed(5)}, {deliveryLng.toFixed(5)})</span>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${deliveryLat},${deliveryLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#4A5330] underline hover:text-[#FF5C93] transition flex items-center gap-1"
                      >
                        <span>Open in Google Maps</span>
                        <span>↗</span>
                      </a>
                    </div>
                  ) : null}

                  {/* Optional Leaflet Map if tileUrl is configured */}
                  {tileUrl && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[#4A5330]/70">
                        Tap anywhere on the map or drag the pin to set your delivery spot:
                      </p>
                      <div
                        ref={mapContainerRef}
                        className="w-full h-56 rounded-xl border border-[#838F58]/30 overflow-hidden shadow-inner z-0"
                      />
                    </div>
                  )}

                  {/* Quote Result Banner */}
                  <div className="pt-1">
                    {quoting ? (
                      <p className="text-xs text-[#838F58] font-bold animate-pulse">
                        Calculating delivery fee...
                      </p>
                    ) : quoteResult?.status === "ok" ? (
                      <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-900 text-xs font-bold flex items-center justify-between">
                        <span>
                          About {quoteResult.distance_km} km — Delivery fee: ₱{quoteResult.fee?.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-green-700 uppercase tracking-wide">
                          Instant Auto-Quote
                        </span>
                      </div>
                    ) : quoteResult?.status === "too_far" ? (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium">
                        ⚠️ This address is beyond our automatic delivery range (max {quoteResult.max_km} km).
                        Choose self-pickup, or place the order and our staff will send you a delivery quote.
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-white/70 border border-gray-200 text-xs text-[#4A5330]/80">
                        💬 We will confirm your delivery fee after you place your order. Tap <strong>Use my current location</strong> for an instant fee.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Self Pickup schedule field */}
            {deliveryOption === "pickup" && (
              <div className="pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1.5">
                  Preferred Pickup Schedule *
                </label>
                <input
                  type="text"
                  required
                  value={pickupSchedule}
                  onChange={(e) => setPickupSchedule(e.target.value)}
                  placeholder="e.g. Today at 3:30 PM, or Tomorrow morning"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none transition min-h-[44px]"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  🏬 The Pet Pantry is open daily from 9:00 AM to 7:00 PM.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary Sidebar */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 sticky top-20 space-y-4">
            <h2 className="text-base font-bold text-[#4A5330] border-b border-gray-100 pb-3">
              Order Review
            </h2>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs">
                  <div className="pr-2 line-clamp-1">
                    <span className="font-bold text-[#4A5330]">{item.qty}x</span>{" "}
                    <span className="text-[#4A5330]/80">
                      {item.name}
                      {item.variant_name ? ` (${item.variant_name})` : ""}
                    </span>
                  </div>
                  <span className="font-bold text-[#4A5330] shrink-0">
                    ₱{(item.price * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2 text-xs text-[#4A5330]">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Delivery:</span>
                <span>
                  {deliveryOption === "pickup"
                    ? "Free (Pickup)"
                    : deliveryFeeNumber !== null
                    ? `₱${deliveryFeeNumber.toFixed(2)}`
                    : "Quoted after order"}
                </span>
              </div>
              <div className="flex justify-between font-black text-sm text-[#FF5C93] pt-2 border-t border-gray-100">
                <span>Total Due:</span>
                <span>₱{finalTotalPreview.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] py-3.5 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Placing Order..." : "Confirm & Place Order →"}
            </button>

            <p className="text-[11px] text-[#4A5330]/70 text-center leading-tight">
              By placing this order, you will be redirected to your private order link to review payment details.
            </p>
          </div>
        </div>
      </form>

      {/* Sticky bottom bar — mobile only */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#838F58]/20 shadow-lg px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 font-semibold">Total Due</p>
          <p className="text-xl font-black text-[#FF5C93]">₱{finalTotalPreview.toFixed(2)}</p>
        </div>
        <button
          type="submit"
          form="checkout-form"
          disabled={submitting}
          className="flex-1 max-w-[200px] min-h-[44px] py-3 px-4 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm text-center shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center"
        >
          {submitting ? "Placing..." : "Place Order →"}
        </button>
      </div>
    </div>
  );
}
