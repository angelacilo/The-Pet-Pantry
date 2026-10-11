"use client";

import { useEffect, useState, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  full_name: string | null;
  contact_number: string | null;
  role: "customer" | "staff" | "admin";
}

export function useProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the profile for a given user id
  const fetchProfile = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, contact_number, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error.message);
      }

      if (data) {
        setProfile(data as Profile);
      } else {
        // Fallback profile if row is not created yet
        setProfile({
          id: currentUser.id,
          full_name: currentUser.user_metadata?.full_name || null,
          contact_number: null,
          role: "customer",
        });
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Get initial user session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      fetchProfile(user);
    });

    // 2. Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      fetchProfile(currentUser);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);
    await fetchProfile(currentUser);
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const role = profile?.role ?? null;
  const isStaff = role === "staff" || role === "admin";

  return {
    user,
    profile,
    role,
    isStaff,
    loading,
    refreshProfile,
    signOut,
  };
}
