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
const READ_PATH = /^(?:(?:\.[A-Za-z_$][\w$]*)|(?:\["[^"]+"\])|(?:\['[^']+'\])|(?:\[\d+\]))+$/;
const STRING_TRANSFORM_SUFFIX = /\.(toLowerCase|toUpperCase|trim)\(\)$/;

type StringTransform = 'toLowerCase' | 'toUpperCase' | 'trim';

function parseExpression(expression: string): {
  rootName: keyof ExpressionContext;
  path: string;
  transforms: StringTransform[];
} {
  if (FORBIDDEN.test(expression)) {
    throw new M2MError('EXPRESSION_FORBIDDEN', 'Expression contains a forbidden identifier');
  }

  const trimmed = expression.trim();
  const root = /^\$(json|node|env|workflow|execution)/.exec(trimmed);
  if (!root) {
    throw new M2MError('EXPRESSION_INVALID', `Unsupported expression: ${trimmed}`);
  }

  let path = trimmed.slice(root[0].length);
  const transforms: StringTransform[] = [];
  while (true) {
    const match = STRING_TRANSFORM_SUFFIX.exec(path);
    if (!match) break;
    transforms.unshift(match[1] as StringTransform);
    path = path.slice(0, -match[0].length);
  }

  if (path && !READ_PATH.test(path)) {
    throw new M2MError(
      'EXPRESSION_INVALID',
      'Expressions may only read properties and array indexes, followed by approved string transforms',
    );
  }

  return {
    rootName: root[1] as keyof ExpressionContext,
    path,
    transforms,
  };
}

function pathValue(root: unknown, path: string): unknown {
  if (root === undefined || root === null) return undefined;
  if (!path || path === '') return root;

  // If root is a primitive string and path is text-related, return root
  if (typeof root === 'string') {
    if (['.text', '.content', '.result', '.output', '.prompt', '.message', '.data'].includes(path)) {
      return root;
    }
  }

  const tokens = [...path.matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)|\["([^"]+)"\]|\['([^']+)'\]|\[(\d+)\]/g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4])
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
  let value: unknown = root;
  for (const token of tokens) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && ['text', 'content', 'result', 'output', 'prompt', 'message'].includes(token)) {
        return value;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, token) || token in record) {
      value = record[token];
    } else if (token === 'text' && typeof record.content === 'string') {
      value = record.content;
    } else if (token === 'text' && typeof record.result === 'string') {
      value = record.result;
    } else if (token === 'text' && typeof record.prompt === 'string') {
      value = record.prompt;
    } else if (token === 'text' && typeof record.message === 'string') {
      value = record.message;
    } else if (token === 'text' && typeof record.description === 'string') {
      value = record.description;
    } else {
      value = record[token];
    }
  }
  return value;
}

export function validateExpression(expression: string): void {
  parseExpression(expression);
}

export function evaluateExpression(expression: string, context: ExpressionContext): unknown {
  const parsed = parseExpression(expression);
  let value = pathValue(context[parsed.rootName], parsed.path);

  for (const transform of parsed.transforms) {
    if (typeof value !== 'string') {
      throw new M2MError('EXPRESSION_TYPE_ERROR', `${transform}() requires a string value`);
    }
    if (transform === 'toLowerCase') value = value.toLowerCase();
    else if (transform === 'toUpperCase') value = value.toUpperCase();
    else value = value.trim();
  }

  return value;
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
    const evaluated = evaluateExpression(matches[0][1], context);
    return evaluated !== undefined ? evaluated : '';
  }
  return value.replace(EXPRESSION, (_, expression: string) => {
    const result = evaluateExpression(expression, context);
    return result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
  });
}
