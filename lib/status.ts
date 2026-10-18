// Friendly display labels for order statuses

export const STATUS_LABELS: Record<string, string> = {
  awaiting_fee: "Awaiting Delivery Fee",
  awaiting_payment: "Awaiting Payment",
  payment_submitted: "Payment Under Review", // kept for any legacy data
  confirmed: "Order received",
  ready_for_pickup: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  pending: "Payment to verify",
  verified: "Payment verified",
  cash: "Cash on pickup/delivery",
  rejected: "Payment rejected",
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status.replace(/_/g, " ");
}

export function getPaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status] || status.replace(/_/g, " ");
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-[#838F58]/20 text-[#4A5330] border border-[#838F58]/30";
    case "confirmed":
    case "ready_for_pickup":
    case "out_for_delivery":
      return "bg-[#838F58]/15 text-[#4A5330] border border-[#838F58]/20";
    case "awaiting_payment":
    case "payment_submitted":
      return "bg-[#FF5C93]/15 text-[#FF5C93] border border-[#FF5C93]/30";
    case "awaiting_fee":
      return "bg-amber-100 text-amber-800 border border-amber-300";
    case "cancelled":
      return "bg-gray-100 text-gray-500 border border-gray-300";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function getPaymentStatusBadgeClass(status: string): string {
  switch (status) {
    case "verified":
      return "bg-green-100 text-green-800 border border-green-300";
    case "pending":
      return "bg-amber-100 text-amber-800 border border-amber-300";
    case "cash":
      return "bg-blue-100 text-blue-800 border border-blue-300";
    case "rejected":
      return "bg-red-100 text-red-700 border border-red-300";
    case "unpaid":
    default:
      return "bg-gray-100 text-gray-600 border border-gray-300";
  }
}
