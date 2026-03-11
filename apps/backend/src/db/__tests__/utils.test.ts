import { describe, expect, it } from 'vitest';
import { camelCase, snakeCase } from '../utils.js';

describe('snakeCase', () => {
  it('converts simple camelCase to snake_case', () => {
    expect(snakeCase('chunkId')).toBe('chunk_id');
    expect(snakeCase('documentId')).toBe('document_id');
    expect(snakeCase('createdAt')).toBe('created_at');
    expect(snakeCase('updatedAt')).toBe('updated_at');
  });

  it('converts longer camelCase chains', () => {
    expect(snakeCase('similarityScore')).toBe('similarity_score');
    expect(snakeCase('ingestionRunId')).toBe('ingestion_run_id');
    expect(snakeCase('sourcetermId')).toBe('sourceterm_id');
  });

  it('handles consecutive uppercase (acronyms)', () => {
    expect(snakeCase('fileURLToPath')).toBe('file_url_to_path');
  });

  it('passes through single lowercase words unchanged', () => {
    expect(snakeCase('id')).toBe('id');
    expect(snakeCase('text')).toBe('text');
    expect(snakeCase('status')).toBe('status');
  });

  it('passes through * wildcard unchanged', () => {
    expect(snakeCase('*')).toBe('*');
  });

  it('passes through already-snake_case strings unchanged', () => {
    expect(snakeCase('chunk_id')).toBe('chunk_id');
    expect(snakeCase('created_at')).toBe('created_at');
  });
});

describe('camelCase', () => {
  it('converts simple snake_case to camelCase', () => {
    expect(camelCase('chunk_id')).toBe('chunkId');
    expect(camelCase('document_id')).toBe('documentId');
    expect(camelCase('created_at')).toBe('createdAt');
    expect(camelCase('updated_at')).toBe('updatedAt');
  });

  it('converts longer snake_case chains', () => {
    expect(camelCase('similarity_score')).toBe('similarityScore');
    expect(camelCase('ingestion_run_id')).toBe('ingestionRunId');
    expect(camelCase('source_term_id')).toBe('sourceTermId');
  });

  it('passes through single words unchanged', () => {
    expect(camelCase('id')).toBe('id');
    expect(camelCase('text')).toBe('text');
    expect(camelCase('status')).toBe('status');
  });

  it('passes through already-camelCase strings unchanged', () => {
    expect(camelCase('chunkId')).toBe('chunkId');
    expect(camelCase('createdAt')).toBe('createdAt');
  });
});

describe('round-trip', () => {
  it('camelCase(snakeCase(x)) === x for standard identifiers', () => {
    const identifiers = [
      'chunkId',
      'documentId',
      'createdAt',
      'updatedAt',
      'similarityScore',
      'ingestionRunId',
      'sourceTermId',
      'targetTermId',
      'relationshipType',
      'tokenCount',
      'chunkIndex',
    ];
    for (const id of identifiers) {
      expect(camelCase(snakeCase(id))).toBe(id);
    }
  });
});
