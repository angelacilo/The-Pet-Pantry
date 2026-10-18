export interface QuickColor {
  name: string;
  hex: string;
}

export const QUICK_COLORS: QuickColor[] = [
  { name: "Black", hex: "#1F1F1F" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Gray", hex: "#9E9E9E" },
  { name: "Red", hex: "#E53935" },
  { name: "Pink", hex: "#F48FB1" },
  { name: "Orange", hex: "#FB8C00" },
  { name: "Yellow", hex: "#FDD835" },
  { name: "Green", hex: "#43A047" },
  { name: "Blue", hex: "#1E88E5" },
  { name: "Purple", hex: "#8E24AA" },
  { name: "Brown", hex: "#6D4C41" },
];

interface QuickColorChipsProps {
  onSelectColor: (color: QuickColor) => void;
  disabled?: boolean;
}

export default function QuickColorChips({ onSelectColor, disabled }: QuickColorChipsProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
        Quick Color Chips:
      </span>
      <div className="flex flex-wrap gap-2">
        {QUICK_COLORS.map((c) => (
          <button
            key={c.name}
            type="button"
            disabled={disabled}
            onClick={() => onSelectColor(c)}
            className="min-h-[44px] px-3 py-1.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-2 text-xs font-semibold text-[#4A5330] shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title={`Add ${c.name} option`}
          >
            <span
              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
              style={{ backgroundColor: c.hex }}
            />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
