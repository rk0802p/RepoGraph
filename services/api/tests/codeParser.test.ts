
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCode } from "../src/services/codeParser.js";

test("extracts JavaScript functions, classes, and imports", () => {
  const source = `
    import express from "express";

    function greet(name) {
      return name;
    }

    class UserService {}
  `;

  const result = parseCode(source, ".js");

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "greet" && symbol.kind === "function"
    )
  );

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "UserService" && symbol.kind === "class"
    )
  );

  assert.ok(
    result.imports.some((item) => item.source === "express")
  );
});

test("extracts TypeScript interfaces and type aliases", () => {
  const source = `
    interface User {
      id: number;
    }

    type UserName = string;
  `;

  const result = parseCode(source, ".ts");

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "User" && symbol.kind === "interface"
    )
  );

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "UserName" && symbol.kind === "type"
    )
  );
});

test("extracts imports and symbols from TSX", () => {
  const source = `
    import React from "react";

    const App = () => <div>Hello</div>;
  `;

  const result = parseCode(source, ".tsx");

  assert.ok(
    result.imports.some((item) => item.source === "react")
  );

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "App" && symbol.kind === "function"
    )
  );
});


test("excludes local variables and recognizes top-level arrow functions", () => {
  const source = `
    const greet = (name: string) => name;

    function run() {
      const internalValue = 42;
      return internalValue;
    }
  `;

  const result = parseCode(source, ".ts");

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "greet" && symbol.kind === "function"
    )
  );

  assert.ok(
    result.symbols.some(
      (symbol) => symbol.name === "run" && symbol.kind === "function"
    )
  );

  assert.ok(
    !result.symbols.some(
      (symbol) => symbol.name === "internalValue"
    )
  );
});

test("extracts names from destructured top-level declarations", () => {
  const source = `
    const [health, setHealth] = useState(null);
    const { name, age: userAge } = user;
  `;

  const result = parseCode(source, ".ts");

  const names = result.symbols.map((symbol) => symbol.name);

  assert.ok(names.includes("health"));
  assert.ok(names.includes("setHealth"));
  assert.ok(names.includes("name"));
  assert.ok(names.includes("userAge"));
  assert.ok(!names.includes("age"));
});
