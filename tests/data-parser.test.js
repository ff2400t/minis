import test from "node:test";
import {
  BUILT_IN_PARSERS,
  generalDocumentParser,
} from "../pages/data-extractor.js";
import assert from "node:assert";
import testObj from "./test.json" with { type: "json" };

function checkParser(text) {
  const { name, match, metaRegex, tableRegex, func } = BUILT_IN_PARSERS.find(
    (parser) => {
      return parser.match.every((s) =>
        text.toLowerCase().includes(s.toLowerCase())
      );
    },
  );
  return func(text, metaRegex, tableRegex);
}

for (const testStructure of testObj) {
  const { name, text, expected } = testStructure;
  test(name, () => {
    const result = checkParser(text);
    console.log(JSON.stringify(result));
    assert.deepEqual(expected, result);
  });
}
