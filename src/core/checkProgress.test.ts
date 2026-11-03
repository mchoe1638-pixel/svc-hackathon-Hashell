import { describe, expect, it } from 'vitest';

import { checkProgress } from './checkProgress';

const ITEMS = [{ id: 'item-a' }, { id: 'item-b' }, { id: 'item-c' }];

describe('checkProgress', () => {
  it('is 0 of 0 when there are no items', () => {
    expect(checkProgress([], [])).toEqual({ checkedItems: 0, totalItems: 0 });
  });

  it('counts none as checked when nobody has checked anything', () => {
    expect(checkProgress(ITEMS, [])).toEqual({ checkedItems: 0, totalItems: 3 });
  });

  it('counts the items that have at least one check', () => {
    const shares = [{ itemId: 'item-a' }, { itemId: 'item-c' }];

    expect(checkProgress(ITEMS, shares)).toEqual({ checkedItems: 2, totalItems: 3 });
  });

  it('counts an item once however many checks it has, including repeated rows', () => {
    const shares = [{ itemId: 'item-a' }, { itemId: 'item-a' }, { itemId: 'item-a' }, { itemId: 'item-b' }];

    expect(checkProgress(ITEMS, shares)).toEqual({ checkedItems: 2, totalItems: 3 });
  });

  it('ignores checks on items that are not in the list', () => {
    const shares = [{ itemId: 'item-a' }, { itemId: 'item-elsewhere' }];

    expect(checkProgress(ITEMS, shares)).toEqual({ checkedItems: 1, totalItems: 3 });
  });

  it('is all of them when every item has a check', () => {
    const shares = ITEMS.map((item) => ({ itemId: item.id }));

    expect(checkProgress(ITEMS, shares)).toEqual({ checkedItems: 3, totalItems: 3 });
  });

  it('treats items that share an id as one item', () => {
    const items = [{ id: 'item-a' }, { id: 'item-a' }];

    expect(checkProgress(items, [{ itemId: 'item-a' }])).toEqual({ checkedItems: 1, totalItems: 1 });
  });
});
