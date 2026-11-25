import {cn} from '../lib/utils.js';

describe('cn', () => {
  it('merges conflicting tailwind classes', () => {
    expect(cn('px-2', 'px-4', 'text-white')).toBe('px-4 text-white');
  });
});
