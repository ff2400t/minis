import test from "node:test";
import { BUILT_IN_PARSERS, generalDocumentParser } from "../pages/data-extractor.js";
import assert from "node:assert";
import testObj from "./test.json" with { type: "json" };

function checkParser(text) {
  const [name, matches, meta, table, func] = BUILT_IN_PARSERS.find((parser) => {
    return parser[1].every((s) => text.toLowerCase().includes(s.toLowerCase()));
  });
  return func(text, meta, table);
}

for (const testStructure of testObj) {
  const {name,text , expected} = testStructure;
  test(name,() => {
    const result= checkParser(text);
    assert(expected,result )
  })
}
