import test from "node:test";
import { BUILT_IN_PARSERS } from "../pages/data-extractor.js";
import assert from "node:assert";
import testObj from "./test.json" with { type: "json" };

/**
 * @param {string} text
 */
function checkParser(text) {
  const res = BUILT_IN_PARSERS.find(
    (parser) => {
      return parser.matches.every((s) =>
        text.toLowerCase().includes(s.toLowerCase())
      );
    },
  );
  if (res) {
    const { metadata, table: tableRegex, func } = res;
    return func(text, metadata, tableRegex);
  }
}

for (const testStructure of testObj) {
  const { name, text, expected } = testStructure;
  test(name, () => {
    const result = checkParser(text);
    console.log(JSON.stringify(result));
    assert.deepEqual(expected, result);
  });
}
