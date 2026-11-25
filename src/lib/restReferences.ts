/** REST-only function references used by the legacy-compatible UI. */
type Ref = string;
const namespace = (name: string): Record<string, Ref> => new Proxy({}, { get: (_target, fn) => `${name}:${String(fn)}` });
export const api: Record<string, Record<string, Ref>> = new Proxy({}, { get: (_target, ns) => namespace(String(ns)) });
export type Id<T = string> = string;
export function getFunctionName(reference: unknown): string {
  if (typeof reference === "string") return reference;
  const value = reference as any;
  return String(value?.__functionName ?? value?.name ?? "");
}
