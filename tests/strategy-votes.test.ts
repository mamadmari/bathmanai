import { expect, test } from "bun:test";
import { independentVotes, confirmationFamilies } from "../server/src/strategy-votes";

test("duplicate and correlated strategies cannot create independent confirmations", () => {
  const votes = [
    { key: "a", family: "trend", direction: "long" as const, weight: 1, confidence: 0.8 },
    { key: "b", family: "trend", direction: "long" as const, weight: 1, confidence: 0.8 },
    { key: "c", family: "momentum", direction: "neutral" as const, weight: 1, confidence: 1 },
  ];
  const normalized = independentVotes([...votes, votes[0]]);
  expect(normalized.length).toBe(3);
  expect(normalized.filter((vote) => vote.family === "trend").reduce((sum, vote) => sum + vote.weight, 0)).toBe(1);
  expect(confirmationFamilies(votes, "long")).toBe(1);
  expect(confirmationFamilies(votes, "short")).toBe(0);
});