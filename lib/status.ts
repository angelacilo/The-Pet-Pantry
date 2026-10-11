// Friendly display labels for order statuses

export const STATUS_LABELS: Record<string, string> = {
  awaiting_fee: "Awaiting Delivery Fee",
  awaiting_payment: "Awaiting Payment",
  payment_submitted: "Payment Under Review",
  confirmed: "Confirmed",
  ready_for_pickup: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status.replace(/_/g, " ");
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
