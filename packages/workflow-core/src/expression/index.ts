import { M2MError, type NodeExecutionResult } from '@m2m/shared';

export interface ExpressionContext {
  json: unknown;
  node: Readonly<Record<string, NodeExecutionResult>>;
  env: Readonly<Record<string, string>>;
  workflow: Readonly<{ id: string }>;
  execution: Readonly<{ id: string }>;
}

const FORBIDDEN = /(?:\bprocess\b|\brequire\b|\bimport\b|\bglobalThis\b|\bFunction\b|\beval\b|__proto__|constructor|prototype)/;
const EXPRESSION = /\{\{([\s\S]*?)\}\}/g;

function pathValue(root: unknown, path: string): unknown {
  const tokens = [...path.matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)|\["([^"]+)"\]|\['([^']+)'\]|\[(\d+)\]/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? match[4],
  );
  let value = root;
  for (const token of tokens) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

export function validateExpression(expression: string): void {
  if (FORBIDDEN.test(expression)) {
    throw new M2MError('EXPRESSION_FORBIDDEN', 'Expression contains a forbidden identifier');
  }
  const trimmed = expression.trim();
  const root = /^\$(json|node|env|workflow|execution)/.exec(trimmed);
  if (!root) {
    throw new M2MError('EXPRESSION_INVALID', `Unsupported expression: ${trimmed}`);
  }
  const path = trimmed.slice(root[0].length);
  if (path && !/^(?:(?:\.[A-Za-z_$][\w$]*)|(?:\["[^"]+"\])|(?:\['[^']+'\])|(?:\[\d+\]))+$/.test(path)) {
    throw new M2MError('EXPRESSION_INVALID', 'Expressions may only read properties and array indexes');
  }
}

export function evaluateExpression(expression: string, context: ExpressionContext): unknown {
  validateExpression(expression);
  const normalized = expression.trim();
  const rootMatch = /^\$(json|node|env|workflow|execution)/.exec(normalized);
  if (!rootMatch) throw new M2MError('EXPRESSION_INVALID', 'Expression root is missing');
  const rootName = rootMatch[1] as 'json' | 'node' | 'env' | 'workflow' | 'execution';
  return pathValue(context[rootName], normalized.slice(rootMatch[0].length));
}

export function resolveExpressions(value: unknown, context: ExpressionContext): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveExpressions(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveExpressions(item, context)]),
    );
  }
  if (typeof value !== 'string') return value;
  const matches = [...value.matchAll(EXPRESSION)];
  if (matches.length === 0) return value;
  if (matches.length === 1 && matches[0][0] === value) {
    return evaluateExpression(matches[0][1], context);
  }
  return value.replace(EXPRESSION, (_, expression: string) => {
    const result = evaluateExpression(expression, context);
    return result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
  });
}
