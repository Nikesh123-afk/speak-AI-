import test from "node:test";
import assert from "node:assert/strict";
import { analyseAnswer, buildFeedback } from "../server.js";

test("speaking analysis returns IELTS-compatible half bands", () => {
  const result = analyseAnswer("I enjoy my hometown because it is lively. However, the nearby mountains give residents a quiet place to relax, and for example my family goes hiking there every weekend.");
  for (const value of [result.fluency, result.vocabulary, result.grammar, result.pronunciation]) {
    assert.ok(value >= 4 && value <= 9);
    assert.equal(value * 2, Math.round(value * 2));
  }
});

test("feedback contains all four speaking criteria and useful advice", () => {
  const feedback = buildFeedback([{ answer: "I study computer science because I enjoy solving practical problems. For example, last month I built a small scheduling application for my classmates. Although it was difficult, the experience was extremely useful and encouraged me to continue learning." }]);
  assert.deepEqual(Object.keys(feedback.criteria), ["Fluency & Coherence", "Lexical Resource", "Grammatical Range", "Pronunciation"]);
  assert.ok(feedback.strengths.length > 0);
  assert.ok(feedback.improvements.length > 0);
  assert.match(feedback.summary, /not an official IELTS result/);
});
