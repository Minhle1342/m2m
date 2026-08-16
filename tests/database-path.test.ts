import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDatabasePath } from '../packages/database/src/data-source.js';

describe('database path resolution', () => {
  it('resolves a relative DATABASE_PATH from the monorepo root', () => {
    expect(resolveDatabasePath('./data/example.sqlite')).toBe(path.resolve(process.cwd(), 'data/example.sqlite'));
  });

  it('preserves an absolute DATABASE_PATH', () => {
    const absolute = path.resolve(process.cwd(), '.runtime', 'example.sqlite');
    expect(resolveDatabasePath(absolute)).toBe(absolute);
  });
});
