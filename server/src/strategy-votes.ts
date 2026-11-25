import { strategyDefs } from "./strategies.js";

const families = new Map(strategyDefs().map((strategy) => [strategy.key, strategy.category]));
export type StrategyVote = { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number; family?: string };

/** One family has at most one unit of evidence, regardless of registry size. */
export function independentVotes(votes: StrategyVote[]): StrategyVote[] {
  const unique = [...new Map(votes.map((vote) => [vote.key, vote])).values()];
  const totals = new Map<string, number>();
  for (const vote of unique) {
    const family = vote.family ?? families.get(vote.key) ?? vote.key;
    totals.set(family, (totals.get(family) ?? 0) + Math.max(0, vote.weight));
  }
  return unique.map((vote) => {
    const family = vote.family ?? families.get(vote.key) ?? vote.key;
    return { ...vote, family, confidence: Math.max(0, Math.min(1, vote.confidence)), weight: Math.max(0, vote.weight) / Math.max(1, totals.get(family) ?? 1) };
  });
}

export function confirmationFamilies(votes: StrategyVote[], direction?: "long" | "short"): number {
  return new Set(independentVotes(votes).filter((vote) => vote.direction !== "neutral" && (!direction || vote.direction === direction)).map((vote) => vote.family)).size;
}