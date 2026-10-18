"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";

interface DeliverySettings {
  id: number;
  enabled: boolean;
  origin_lat: number | null;
  origin_lng: number | null;
  base_fee: number;
  base_km: number;
  per_km_fee: number;
  road_factor: number;
  max_km: number;
  round_to: number;
}

export default function StaffDeliverySettingsPage() {
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Fields
  const [enabled, setEnabled] = useState(true);
  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [baseFee, setBaseFee] = useState("50");
  const [baseKm, setBaseKm] = useState("3");
  const [perKmFee, setPerKmFee] = useState("10");
  const [roadFactor, setRoadFactor] = useState("1.3");
  const [maxKm, setMaxKm] = useState("20");
  const [roundTo, setRoundTo] = useState("5");

  // Geolocation state
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("delivery_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        const s = data as DeliverySettings;
        setSettings(s);
        setEnabled(!!s.enabled);
        setOriginLat(s.origin_lat !== null && s.origin_lat !== undefined ? String(s.origin_lat) : "");
        setOriginLng(s.origin_lng !== null && s.origin_lng !== undefined ? String(s.origin_lng) : "");
        setBaseFee(String(s.base_fee ?? 50));
        setBaseKm(String(s.base_km ?? 3));
        setPerKmFee(String(s.per_km_fee ?? 10));
        setRoadFactor(String(s.road_factor ?? 1.3));
        setMaxKm(String(s.max_km ?? 20));
        setRoundTo(String(s.round_to ?? 5));
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load delivery settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Use my current location handler
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
        setOriginLat(String(pos.coords.latitude));
        setOriginLng(String(pos.coords.longitude));
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Please allow location access or paste coordinates."
            : "Could not retrieve location: " + err.message
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Save Settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsedLat = originLat.trim() ? parseFloat(originLat) : null;
      const parsedLng = originLng.trim() ? parseFloat(originLng) : null;
      const parsedBaseFee = parseFloat(baseFee) || 0;
      const parsedBaseKm = parseFloat(baseKm) || 0;
      const parsedPerKmFee = parseFloat(perKmFee) || 0;
      const parsedRoadFactor = parseFloat(roadFactor) || 1.3;
      const parsedMaxKm = parseFloat(maxKm) || 0;
      const parsedRoundTo = parseInt(roundTo, 10) || 1;

      const { error } = await supabase
        .from("delivery_settings")
        .update({
          enabled,
          origin_lat: parsedLat,
          origin_lng: parsedLng,
          base_fee: parsedBaseFee,
          base_km: parsedBaseKm,
          per_km_fee: parsedPerKmFee,
          road_factor: parsedRoadFactor,
          max_km: parsedMaxKm,
          round_to: parsedRoundTo,
        })
        .eq("id", 1);

      if (error) throw new Error(error.message);

      setSuccessMsg("Delivery settings saved successfully!");
      await fetchSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save delivery settings");
    } finally {
      setSaving(false);
    }
  };

  // Preview table calculations (browser reference only)
  const sampleDistances = [1, 2, 3, 5, 8, 10, 15];

  const previewRows = useMemo(() => {
    const numBaseFee = parseFloat(baseFee) || 0;
    const numBaseKm = parseFloat(baseKm) || 0;
    const numPerKm = parseFloat(perKmFee) || 0;
    const numRoadFactor = parseFloat(roadFactor) || 1.3;
    const numMaxKm = parseFloat(maxKm) || 0;
    const numRoundTo = parseInt(roundTo, 10) || 1;

    return sampleDistances.map((straightLineKm) => {
      const roadKm = straightLineKm * numRoadFactor;
      const isBeyond = numMaxKm > 0 && roadKm > numMaxKm;
      const extraKm = Math.max(0, roadKm - numBaseKm);
      const rawFee = numBaseFee + extraKm * numPerKm;
      const roundedFee =
        numRoundTo > 0 ? Math.ceil(rawFee / numRoundTo) * numRoundTo : Math.ceil(rawFee);

      return {
        straightLineKm,
        roadKm: roadKm.toFixed(1),
        extraKm: extraKm.toFixed(1),
        rawFee: rawFee.toFixed(2),
        roundedFee,
        isBeyond,
      };
    });
  }, [baseFee, baseKm, perKmFee, roadFactor, maxKm, roundTo]);

  if (loading) {
    return (
      <RequireStaff>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8">
          <div className="w-10 h-10 border-4 border-[#838F58] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-[#4A5330]">Loading delivery settings...</p>
        </div>
      </RequireStaff>
    );
  }

  return (
    <RequireStaff>
      <div className="space-y-6 pb-20 max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Delivery Settings</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Delivery Fee Calculator Settings</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Configure automatic GPS-based delivery fee calculations, shop coordinates, and distance rates.
            </p>
          </div>

          <Link
            href="/staff/orders"
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#F9D1D9]/70 hover:bg-[#F9D1D9] text-[#4A5330] transition border border-[#838F58]/30 flex items-center justify-center"
          >
            ← View Orders
          </Link>
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

        {/* Main Settings Form */}
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Card 1: Toggle & Shop Location */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                  <span>⚡</span> Enable Automatic Delivery Fee
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, customer checkout automatically computes Maxim fees via GPS pin.
                </p>
              </div>

              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4A5330]"></div>
              </label>
            </div>

            {/* Shop Coordinates */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A5330] flex items-center gap-1.5">
                  <span>📍</span> Shop Location Coordinates
                </h3>

                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={geoLoading}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-[#838F58]/20 hover:bg-[#838F58]/30 text-[#4A5330] transition border border-[#838F58]/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                >
                  <span>🎯</span>
                  <span>{geoLoading ? "Locating..." : "Use my current location (I am at the shop)"}</span>
                </button>
              </div>

              {geoError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  {geoError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                    Origin Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={originLat}
                    onChange={(e) => setOriginLat(e.target.value)}
                    placeholder="e.g. 14.599512"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#4A5330] mb-1">
                    Origin Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={originLng}
                    onChange={(e) => setOriginLng(e.target.value)}
                    placeholder="e.g. 120.984222"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div className="pt-1">
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#838F58] hover:text-[#FF5C93] hover:underline inline-flex items-center gap-1 min-h-[44px]"
                >
                  <span>In Google Maps, right-click your shop and click the coordinates to copy them</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Fee Formula Inputs */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-5">
            <h2 className="text-base font-bold text-[#4A5330] border-b border-gray-100 pb-3 flex items-center gap-2">
              <span>📐</span> Distance &amp; Fee Rates
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Base Fee */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Base Fee (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={baseFee}
                  onChange={(e) => setBaseFee(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Starting minimum delivery fee</p>
              </div>

              {/* Included km */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Included km (Base km) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={baseKm}
                  onChange={(e) => setBaseKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Distance covered by the base fee</p>
              </div>

              {/* Per km fee */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Fee per Extra km (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={perKmFee}
                  onChange={(e) => setPerKmFee(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Added for each km beyond included km</p>
              </div>

              {/* Road factor */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Road Factor *
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  max="3"
                  required
                  value={roadFactor}
                  onChange={(e) => setRoadFactor(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Straight-line distance is multiplied by this to estimate road distance
                </p>
              </div>

              {/* Max km */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Maximum km *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  value={maxKm}
                  onChange={(e) => setMaxKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Beyond this, customer gets manual quote</p>
              </div>

              {/* Round up to */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4A5330] mb-1">
                  Round Up to Nearest (₱) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={roundTo}
                  onChange={(e) => setRoundTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm font-bold text-[#4A5330] outline-none min-h-[44px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">Round up to the nearest peso amount (e.g. 5)</p>
              </div>
            </div>

            {/* Formula in plain words */}
            <div className="bg-[#F9D1D9]/30 p-4 rounded-xl border border-[#838F58]/20 text-xs sm:text-sm text-[#4A5330] space-y-1">
              <span className="font-bold block text-xs uppercase tracking-wider text-[#838F58]">
                Calculation Formula in Plain Words:
              </span>
              <p className="font-mono text-xs text-[#4A5330] font-bold">
                distance = straight-line km × road factor; fee = base fee + extra km × per-km fee, rounded up
              </p>
            </div>
          </div>

          {/* Card 3: Preview Table */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#4A5330] flex items-center gap-2">
                <span>📊</span> Live Rate Preview Table (For Reference Only)
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Simulated fees at various straight-line distances using the formula above. The actual final fee is calculated solely by the database.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#F9D1D9]/40 border-b border-gray-100 text-gray-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Straight-line km</th>
                    <th className="py-2.5 px-3">Est. Road Distance</th>
                    <th className="py-2.5 px-3">Extra km</th>
                    <th className="py-2.5 px-3">Computed Fee</th>
                    <th className="py-2.5 px-3 text-right">Final Customer Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono text-xs">
                  {previewRows.map((row) => (
                    <tr
                      key={row.straightLineKm}
                      className={`hover:bg-[#F9D1D9]/10 transition ${
                        row.isBeyond ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-bold text-[#4A5330]">
                        {row.straightLineKm} km
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {row.roadKm} km
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {row.extraKm} km
                      </td>
                      <td className="py-2.5 px-3 text-gray-500">
                        ₱{row.rawFee}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-[#FF5C93]">
                        {row.isBeyond ? (
                          <span className="text-amber-800 font-sans text-xs font-bold">
                            Manual quote (&gt; {maxKm} km)
                          </span>
                        ) : (
                          `₱${row.roundedFee.toFixed(2)}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] px-8 py-3 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {saving ? "Saving Settings..." : "Save Delivery Settings"}
            </button>
          </div>
        </form>
      </div>
    </RequireStaff>
  );
}
