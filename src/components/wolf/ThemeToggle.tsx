import { Moon, Sparkles, Sun } from "lucide-react";
import { useWolfTheme, WOLF_THEME_LABEL } from "@/lib/wolf-theme";
import { useI18n } from "@/lib/i18n";

/** Cycles gold → casino → light. Shared by the public pages and both shells. */
export function WolfThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useWolfTheme();
  const { lang } = useI18n();
  const fa = lang === "fa";
  const next = WOLF_THEME_LABEL[theme];
  const Icon = theme === "light" ? Moon : theme === "casino" ? Sparkles : Sun;
  return (
    <button
      type="button"
      onClick={toggle}
      className={`w-btn w-btn-ghost w-btn-icon ${className}`.trim()}
      aria-label={fa ? next.fa : next.en}
      title={(fa ? "تم فعلی: " : "Theme: ") + (fa ? next.fa : next.en)}
    >
      <Icon size={16} />
    </button>
  );
}
