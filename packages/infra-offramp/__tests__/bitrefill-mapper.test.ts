import { describe, expect, it } from 'vitest';

import { BitrefillMapper } from '../src/bitrefill/mapper';

describe('BitrefillMapper', () => {
  it('maps a catalog product into the domain shape with fixed denominations', () => {
    const mapper = new BitrefillMapper();

    const product = mapper.toProduct(
      {
        id: 'amazon-us',
        name: 'Amazon.com',
        image: 'https://img.example/amazon.png',
        packages: [
          { id: 'amazon-us<&>25', value: 25, price: 25 },
          { id: 'amazon-us<&>50', value: 50, price: 50 },
        ],
      },
      { category: 'giftcard' },
    );

    expect(product).toEqual({
      id: 'amazon-us',
      providerId: 'bitrefill',
      name: 'Amazon.com',
      brand: 'Amazon.com',
      category: 'giftcard',
      image: 'https://img.example/amazon.png',
      denominations: [25, 50],
    });
  });

  it('maps a catalog product into the domain shape with flexible range', () => {
    const mapper = new BitrefillMapper();

    const product = mapper.toProduct(
      {
        id: 'airalo-global',
        name: 'Airalo Global',
        range: {
          min: 10,
          max: 100,
          step: 5,
        },
      },
      { category: 'esim' },
    );

    expect(product.range).toEqual({ min: 10, max: 100, step: 5 });
    expect(product.category).toBe('esim');
  });
});
