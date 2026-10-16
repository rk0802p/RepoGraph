
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "@sengac/tree-sitter-typescript";

export type CodeSymbol = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable";
  startLine: number;
  endLine: number;
};

export type CodeImport = {
  source: string;
  startLine: number;
};

export type ParsedCode = {
  symbols: CodeSymbol[];
  imports: CodeImport[];
};

const javascriptParser = new Parser();
javascriptParser.setLanguage(JavaScript);

const typescriptParser = new Parser();
typescriptParser.setLanguage(TypeScript.typescript);

const tsxParser = new Parser();
tsxParser.setLanguage(TypeScript.tsx);

function parseNodeTree(
  source: string,
  extension: string
): Parser.SyntaxNode {
  const parser =
    extension === ".tsx"
      ? tsxParser
      : extension === ".ts"
        ? typescriptParser
        : javascriptParser;

  return parser.parse(source).rootNode;
}

function collectBindingNames(node: Parser.SyntaxNode): string[] {
  if (node.type === "identifier") {
    return [node.text];
  }

  if (
    node.type === "shorthand_property_identifier_pattern"
  ) {
    return [node.text];
  }

  if (node.type === "pair_pattern") {
    const value = node.childForFieldName("value");
    return value ? collectBindingNames(value) : [];
  }

  if (
    node.type === "assignment_pattern" ||
    node.type === "object_assignment_pattern"
  ) {
    const left = node.childForFieldName("left");
    return left ? collectBindingNames(left) : [];
  }

  if (
    node.type === "array_pattern" ||
    node.type === "object_pattern"
  ) {
    return node.namedChildren.flatMap(collectBindingNames);
  }

  return [];
}

function getDeclarationNode(
  node: Parser.SyntaxNode
): Parser.SyntaxNode {
  if (node.type !== "export_statement") {
    return node;
  }

  return (
    node.namedChildren.find(
      (child) =>
        child.type.endsWith("_declaration") ||
        child.type === "lexical_declaration" ||
        child.type === "variable_declaration"
    ) ?? node
  );
}

function classifyVariable(
  declarator: Parser.SyntaxNode
): CodeSymbol["kind"] {
  const value = declarator.childForFieldName("value");

  if (
    value?.type === "arrow_function" ||
    value?.type === "function_expression" ||
    value?.type === "generator_function"
  ) {
    return "function";
  }

  return "variable";
}

function extractSymbols(
  root: Parser.SyntaxNode
): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  // Only inspect declarations directly inside the program,
  // unwrapping export statements when necessary.
  for (const topLevelNode of root.namedChildren) {
    if (topLevelNode.type === "import_statement") {
      continue;
    }

    const declaration = getDeclarationNode(topLevelNode);

    if (declaration === topLevelNode &&
        topLevelNode.type === "export_statement") {
      continue;
    }

    const addSymbol = (
      name: string,
      kind: CodeSymbol["kind"],
      node: Parser.SyntaxNode
    ) => {
      symbols.push({
        name,
        kind,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    };

    if (
      declaration.type === "function_declaration" ||
      declaration.type === "generator_function_declaration" ||
      declaration.type === "class_declaration" ||
      declaration.type === "interface_declaration" ||
      declaration.type === "type_alias_declaration"
    ) {
      const nameNode = declaration.childForFieldName("name");

      if (!nameNode) continue;

      const kind: CodeSymbol["kind"] =
        declaration.type === "class_declaration"
          ? "class"
          : declaration.type === "interface_declaration"
            ? "interface"
            : declaration.type === "type_alias_declaration"
              ? "type"
              : "function";

      addSymbol(nameNode.text, kind, declaration);
      continue;
    }

    if (
      declaration.type === "lexical_declaration" ||
      declaration.type === "variable_declaration"
    ) {
      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== "variable_declarator") {
          continue;
        }

        const nameNode = declarator.childForFieldName("name");
        if (!nameNode) continue;

        const kind = classifyVariable(declarator);
        const names = collectBindingNames(nameNode);

        for (const name of names) {
          addSymbol(name, kind, declarator);
        }
      }
    }
  }

  return symbols;
}

function extractImports(root: Parser.SyntaxNode): CodeImport[] {
  const imports: CodeImport[] = [];

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === "import_statement") {
      const sourceNode = node.namedChildren.find(
        (child) =>
          child.type === "string" ||
          child.type === "string_fragment"
      );

      if (sourceNode) {
        imports.push({
          source: sourceNode.text.replace(/^['"]|['"]$/g, ""),
          startLine: node.startPosition.row + 1,
        });
      }
    }

    for (const child of node.namedChildren) {
      visit(child);
    }
  }

  visit(root);
  return imports;
}

export function parseCode(
  source: string,
  extension: string
): ParsedCode {
  const root = parseNodeTree(source, extension);

  return {
    symbols: extractSymbols(root),
    imports: extractImports(root),
  };
}
