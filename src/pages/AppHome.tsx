import { UserPanel } from "@/components/wolf/UserPanel";

// The member console owns `/app`, `/m` and `/pc`. These two helpers used to be
// defined here; they now live in Identity.tsx and are re-exported so existing
// imports (admin console) keep working.
export { WolfAvatar, displayName } from "@/components/wolf/Identity";

export default function AppHome({ variant }: { variant?: "mobile" | "desktop" } = {}) {
  return <UserPanel variant={variant} />;
}
