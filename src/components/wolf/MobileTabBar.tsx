import type { ReactNode } from "react";

/**
 * Bottom tab bar for the mobile app mode (/m).
 * Rules taken from the ui-ux-pro-max skill: ≤5 destinations, 48px bar plus
 * safe-area inset, vector icons only, aria-current on the active tab, and
 * labels that stay visible (never icon-only navigation).
 */
export function MobileTabBar({
  items,
  active,
  onSelect,
  label = "ناوبری موبایل",
}: {
  items: { key: string; label: string; icon: ReactNode }[];
  active: string;
  onSelect: (key: string) => void;
  label?: string;
}) {
  return (
    <nav className="w-mtabs" aria-label={label}>
      {items.slice(0, 5).map((item) => (
        <button
          key={item.key}
          type="button"
          aria-current={active === item.key ? "page" : undefined}
          onClick={() => onSelect(item.key)}
        >
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center" }}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
