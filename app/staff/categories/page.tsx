"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RequireStaff from "@/components/RequireStaff";

export interface Category {
  id: number | string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export default function StaffCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New category state
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editing state: categoryId -> { name, sort_order }
  const [editMap, setEditMap] = useState<Record<string | number, { name: string; sort_order: number }>>({});
  const [savingId, setSavingId] = useState<string | number | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);

      const list = (data as Category[]) || [];
      setCategories(list);

      const edits: Record<string | number, { name: string; sort_order: number }> = {};
      list.forEach((c) => {
        edits[c.id] = { name: c.name, sort_order: c.sort_order ?? 0 };
      });
      setEditMap(edits);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const maxSort = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
      const { error } = await supabase
        .from("categories")
        .insert({
          name: newName.trim(),
          sort_order: maxSort + 1,
          is_active: true,
        });

      if (error) throw new Error(error.message);

      setSuccessMsg(`Category "${newName.trim()}" created successfully!`);
      setNewName("");
      await fetchCategories();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCategory = async (cat: Category) => {
    const edit = editMap[cat.id];
    if (!edit || !edit.name.trim()) return;

    setSavingId(cat.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from("categories")
        .update({
          name: edit.name.trim(),
          sort_order: Number(edit.sort_order) || 0,
        })
        .eq("id", cat.id);

      if (error) throw new Error(error.message);

      setSuccessMsg(`Category "${edit.name.trim()}" updated!`);
      await fetchCategories();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const nextActive = !cat.is_active;
      const { error } = await supabase
        .from("categories")
        .update({ is_active: nextActive })
        .eq("id", cat.id);

      if (error) throw new Error(error.message);

      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextActive } : c))
      );
      setSuccessMsg(`Category "${cat.name}" is now ${nextActive ? "visible" : "hidden"}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to toggle visibility");
    }
  };

  return (
    <RequireStaff>
      <div className="space-y-6 pb-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#838F58] mb-1">
              <Link href="/staff" className="hover:underline">
                Staff Portal
              </Link>
              <span>/</span>
              <span className="text-[#4A5330]">Categories</span>
            </div>
            <h1 className="text-2xl font-black text-[#4A5330]">Category Management</h1>
            <p className="text-xs sm:text-sm text-[#4A5330]/75">
              Organize your catalog with custom categories, ordering, and visibility.
            </p>
          </div>

          <Link
            href="/staff/products"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#4A5330] text-white hover:bg-[#4A5330]/90 transition shadow-xs min-h-[44px] flex items-center justify-center"
          >
            Manage Products →
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

        {/* Add Category Form */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20">
          <h2 className="text-base font-bold text-[#4A5330] mb-3 flex items-center gap-2">
            <span>✨</span> Add New Category
          </h2>
          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dog Food, Cat Treats, Accessories..."
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-[#4A5330] text-sm outline-none min-h-[44px]"
            />
            <button
              type="submit"
              disabled={submitting || !newName.trim()}
              className="px-5 py-2.5 rounded-xl bg-[#4A5330] hover:bg-[#4A5330]/90 text-white font-bold text-sm shadow-xs transition disabled:opacity-50 min-h-[44px] cursor-pointer"
            >
              {submitting ? "Adding..." : "+ Add Category"}
            </button>
          </form>
        </div>

        {/* Categories List */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#838F58]/20 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-[#4A5330]">
              Categories ({categories.length})
            </h2>
            <span className="text-xs text-gray-400">
              Lowest sort order appears first in store filters
            </span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No categories yet. Create your first category above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F9D1D9]/40 border-b border-gray-100 text-gray-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Sort Order</th>
                    <th className="py-2.5 px-3">Category Name</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categories.map((cat) => {
                    const edit = editMap[cat.id] || { name: cat.name, sort_order: cat.sort_order };
                    const hasChanges =
                      edit.name.trim() !== cat.name ||
                      Number(edit.sort_order) !== Number(cat.sort_order);
                    const isSaving = savingId === cat.id;

                    return (
                      <tr
                        key={cat.id}
                        className={`hover:bg-[#F9D1D9]/10 transition ${
                          !cat.is_active ? "opacity-60 bg-gray-50/50" : ""
                        }`}
                      >
                        {/* Sort Order Input */}
                        <td className="py-3 px-3 w-28">
                          <input
                            type="number"
                            value={edit.sort_order}
                            onChange={(e) =>
                              setEditMap({
                                ...editMap,
                                [cat.id]: {
                                  ...edit,
                                  sort_order: parseInt(e.target.value, 10) || 0,
                                },
                              })
                            }
                            className="w-20 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-[#4A5330] focus:border-[#4A5330] outline-none min-h-[38px]"
                          />
                        </td>

                        {/* Name Input */}
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            value={edit.name}
                            onChange={(e) =>
                              setEditMap({
                                ...editMap,
                                [cat.id]: {
                                  ...edit,
                                  name: e.target.value,
                                },
                              })
                            }
                            className="w-full max-w-xs px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-[#4A5330] focus:border-[#4A5330] outline-none min-h-[38px]"
                          />
                        </td>

                        {/* Visibility (Hide/Show) */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(cat)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition min-h-[44px] cursor-pointer ${
                              cat.is_active
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                            }`}
                          >
                            {cat.is_active ? "Visible" : "Hidden"}
                          </button>
                        </td>

                        {/* Save Action */}
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveCategory(cat)}
                            disabled={!hasChanges || isSaving}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition min-h-[44px] cursor-pointer ${
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
          )}
        </div>
      </div>
    </RequireStaff>
  );
}
