// Helpers for storing and retrieving guest order tokens and customer details in localStorage

export interface LastCustomerDetails {
  fullName: string;
  contactNumber: string;
  deliveryOption: "maxim" | "pickup";
  address?: string;
  pickupSchedule?: string;
}

const ORDER_TOKENS_STORAGE_KEY = "pet_pantry_order_tokens";
const LAST_DETAILS_STORAGE_KEY = "pet_pantry_last_customer_details";

/**
 * Retrieve all saved order access tokens from localStorage
 */
export function getOrderTokens(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read order tokens from localStorage", err);
    return [];
  }
}

/**
 * Add a newly created order token to localStorage (most recent first)
 */
export function addOrderToken(token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    const existing = getOrderTokens();
    const updated = [token, ...existing.filter((t) => t !== token)];
    localStorage.setItem(ORDER_TOKENS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to save order token to localStorage", err);
  }
}

/**
 * Get the last customer details used during checkout
 */
export function getLastDetails(): LastCustomerDetails | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_DETAILS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastCustomerDetails;
  } catch (err) {
    console.warn("Failed to read last customer details from localStorage", err);
    return null;
  }
}

/**
 * Save customer details to prefill future guest checkout forms
 */
export function saveLastDetails(details: LastCustomerDetails): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_DETAILS_STORAGE_KEY, JSON.stringify(details));
  } catch (err) {
    console.warn("Failed to save last customer details to localStorage", err);
  }
}
