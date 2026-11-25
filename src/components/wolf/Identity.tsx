import { useState } from "react";

/** Telegram avatar with an initials fallback — shared by the panel and the admin console. */
export function WolfAvatar({ user, size = 40 }: { user: any; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = user?.image ? String(user.image) : "";
  const initials = String(user?.firstName || user?.name || user?.tgUsername || "W")
    .trim()
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="w-avatar"
      style={{
        width: size, height: size, fontSize: Math.max(11, size * 0.36),
        display: "inline-grid", placeItems: "center", borderRadius: "50%", overflow: "hidden",
        background: "linear-gradient(145deg, #7c5cff, #22c55e)", color: "#fff", fontWeight: 800, flex: "none",
      }}
      title={displayName(user, true)}
    >
      {src && !broken ? (
        <img src={src} alt={initials} onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <b>{initials}</b>
      )}
    </span>
  );
}

export function displayName(user: any, fa: boolean): string {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return (
    full ||
    (user?.tgUsername ? `@${user.tgUsername}` : "") ||
    user?.name ||
    user?.username ||
    (fa ? "کاربر گرگ" : "Wolf trader")
  );
}
