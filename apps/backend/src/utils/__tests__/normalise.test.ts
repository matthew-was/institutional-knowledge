import { describe, expect, it } from 'vitest';
import { normaliseTermText } from '../normalise.js';

describe('normaliseTermText', () => {
  describe('lowercasing', () => {
    it('lowercases ASCII uppercase letters', () => {
      expect(normaliseTermText('John Smith')).toBe('john smith');
    });

    it('lowercases already-lowercase input unchanged', () => {
      expect(normaliseTermText('john smith')).toBe('john smith');
    });

    it('lowercases mixed-case input', () => {
      expect(normaliseTermText('West FARM Holdings')).toBe(
        'west farm holdings',
      );
    });
  });

  describe('punctuation stripping', () => {
    it("strips apostrophes (O'Brien → obrien)", () => {
      expect(normaliseTermText("O'Brien")).toBe('obrien');
    });

    it('strips ampersands (Acme & Co. → acme co)', () => {
      expect(normaliseTermText('Acme & Co.')).toBe('acme co');
    });

    it('strips trailing periods', () => {
      expect(normaliseTermText('Corp.')).toBe('corp');
    });

    it('strips hyphens', () => {
      expect(normaliseTermText('Smith-Jones')).toBe('smithjones');
    });

    it('strips commas', () => {
      expect(normaliseTermText('Jones, Robert')).toBe('jones robert');
    });

    it('strips parentheses', () => {
      expect(normaliseTermText('Ministry (UK)')).toBe('ministry uk');
    });

    it('strips slash characters', () => {
      expect(normaliseTermText('income/expenditure')).toBe('incomeexpenditure');
    });

    it('strips all punctuation from a heavily-punctuated term', () => {
      expect(normaliseTermText('A.B.C. & Co., Ltd.')).toBe('abc co ltd');
    });
  });

  describe('whitespace handling', () => {
    it('trims leading whitespace', () => {
      expect(normaliseTermText('  West Farm')).toBe('west farm');
    });

    it('trims trailing whitespace', () => {
      expect(normaliseTermText('West Farm ')).toBe('west farm');
    });

    it('trims both ends', () => {
      expect(normaliseTermText('  West Farm ')).toBe('west farm');
    });

    it('collapses internal runs of spaces to a single space', () => {
      expect(normaliseTermText('West  Farm')).toBe('west farm');
    });

    it('collapses tabs to a single space', () => {
      expect(normaliseTermText('West\tFarm')).toBe('west farm');
    });

    it('collapses mixed whitespace', () => {
      expect(normaliseTermText('West  \t Farm')).toBe('west farm');
    });
  });

  describe('unicode support', () => {
    it('preserves unicode letters (accented characters)', () => {
      expect(normaliseTermText('Ångström')).toBe('ångström');
    });

    it('preserves unicode letters (non-latin script)', () => {
      expect(normaliseTermText('München')).toBe('münchen');
    });

    it('strips unicode punctuation', () => {
      expect(normaliseTermText('Café\u2019s')).toBe('cafés');
    });

    it('preserves digits', () => {
      expect(normaliseTermText('Property 42')).toBe('property 42');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(normaliseTermText('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normaliseTermText('   ')).toBe('');
    });

    it('returns empty string for punctuation-only input', () => {
      expect(normaliseTermText('...')).toBe('');
    });

    it('handles a single word with no transformations needed', () => {
      expect(normaliseTermText('farm')).toBe('farm');
    });
  });

  describe('deduplication consistency (ADR-028)', () => {
    it('produces identical output for the same term regardless of casing', () => {
      expect(normaliseTermText('John Smith')).toBe(
        normaliseTermText('JOHN SMITH'),
      );
    });

    it("produces identical output for O'Brien variants", () => {
      expect(normaliseTermText("O'Brien")).toBe(normaliseTermText("o'brien"));
    });

    it('produces identical output for terms differing only in surrounding whitespace', () => {
      expect(normaliseTermText('  West Farm  ')).toBe(
        normaliseTermText('West Farm'),
      );
    });
  });
});
