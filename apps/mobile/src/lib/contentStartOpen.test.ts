import { describe, expect, it } from 'vitest';

import {
  fallbackStartToastStorageKey,
  messageForContentStartToast,
  smartStartToastStorageKey,
} from '@/src/lib/contentStartOpenCopy';

describe('contentStartOpen', () => {
  it('uses spec keys for AsyncStorage', () => {
    expect(smartStartToastStorageKey('u1', 'b2')).toBe('brivai:smartStartToast:v1:u1:b2');
    expect(fallbackStartToastStorageKey('u1', 'b2')).toBe('brivai:fallbackStartToast:v1:u1:b2');
  });

  it('returns spec copy for heuristic/llm and fallback', () => {
    expect(messageForContentStartToast('heuristic', 7)).toBe(
      'Opened near where the main text begins (page 7). You can use Previous to go back.',
    );
    expect(messageForContentStartToast('llm', 12)).toContain('page 12');
    expect(messageForContentStartToast('fallback_default', 1)).toBe(
      "We couldn't detect a chapter start for this PDF; opened at page 1.",
    );
  });
});
