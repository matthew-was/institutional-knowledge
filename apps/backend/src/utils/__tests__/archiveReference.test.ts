/**
 * Unit tests for the archiveReference pure function (ADR-023).
 *
 * archiveReference is a standalone utility exported from @institutional-knowledge/shared.
 * These tests cover all edge cases. Integration tests that exercise code paths
 * calling this function assert only a single happy-path output.
 */

import { describe, expect, it } from 'vitest';
import { archiveReference } from '@institutional-knowledge/shared';

describe('archiveReference', () => {
  describe('dated documents', () => {
    it('formats a standard dated reference as "YYYY-MM-DD — description"', () => {
      expect(archiveReference('1987-06-15', 'Wedding photograph')).toBe(
        '1987-06-15 — Wedding photograph',
      );
    });

    it('handles a minimal single-word description', () => {
      expect(archiveReference('1950-01-01', 'Letter')).toBe(
        '1950-01-01 — Letter',
      );
    });

    it('preserves special characters in the description', () => {
      expect(archiveReference('2001-01-01', 'Smith & Sons — Invoice')).toBe(
        '2001-01-01 — Smith & Sons — Invoice',
      );
    });
  });

  describe('undated documents', () => {
    it('uses [undated] prefix when date is null', () => {
      expect(archiveReference(null, 'Undated photo')).toBe(
        '[undated] — Undated photo',
      );
    });

    it('uses [undated] prefix when date is an empty string', () => {
      expect(archiveReference('', 'A document')).toBe(
        '[undated] — A document',
      );
    });
  });
});
