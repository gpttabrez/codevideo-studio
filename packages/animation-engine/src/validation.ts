import ts from 'typescript';

const ALLOWED_MODULES = new Set([
  '@motion-canvas/2d',
  '@motion-canvas/core',
  '@codevideo/animation',
]);

const FORBIDDEN_IDENTIFIERS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'eval',
  'Function',
  'globalThis',
  'window',
  'document',
  'process',
  'require',
  'module',
  'exports',
  'importScripts',
  'setTimeout',
  'setInterval',
  'navigator',
  'crypto',
]);

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateAnimationSource(source: string): ValidationResult {
  const errors: string[] = [];

  if (typeof source !== 'string' || source.trim().length === 0) {
    return {ok: false, errors: ['Animation source is empty.']};
  }
  if (source.length > 200_000) {
    return {ok: false, errors: ['Animation source exceeds the 200 KB limit.']};
  }

  const compiled = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: 'scene.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      isolatedModules: true,
    },
  });

  for (const diagnostic of compiled.diagnostics ?? []) {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );
    errors.push(
      diagnostic.start !== undefined
        ? `Line ${getLine(source, diagnostic.start)}: ${message}`
        : message,
    );
  }

  const sourceFile = ts.createSourceFile(
    'scene.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (
        !ts.isStringLiteral(specifier) ||
        !ALLOWED_MODULES.has(specifier.text)
      ) {
        errors.push(
          `Unsupported import: ${ts.isStringLiteral(specifier) ? specifier.text : '<dynamic>'}. ` +
            `Allowed: ${[...ALLOWED_MODULES].join(', ')}.`,
        );
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      errors.push('Dynamic import() is not allowed in animation source.');
    }

    if (
      ts.isIdentifier(node) &&
      FORBIDDEN_IDENTIFIERS.has(node.text) &&
      !isPropertyOrDeclarationName(node)
    ) {
      errors.push(`Identifier "${node.text}" is not allowed in the sandbox.`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {ok: errors.length === 0, errors: [...new Set(errors)]};
}

function isPropertyOrDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return true;
  }
  if (ts.isPropertySignature(parent) && parent.name === node) {
    return true;
  }
  if (ts.isMethodDeclaration(parent) && parent.name === node) {
    return true;
  }
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return false;
}

function getLine(source: string, position: number): number {
  return source.slice(0, position).split('\n').length;
}
