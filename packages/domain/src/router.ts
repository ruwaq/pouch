import { err, isOk, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { CashOutIntent, OffRampProvider, Product, Quote, RoutingDecision } from './types';

export interface RoutingStrategy {
  select(quotes: Quote[], intent: CashOutIntent): Quote;
}

export class CheapestStrategy implements RoutingStrategy {
  select(quotes: Quote[]): Quote {
    return [...quotes].sort((left, right) => left.paymentAmount.value - right.paymentAmount.value)[0]!;
  }
}

export class OffRampRouter {
  constructor(
    private readonly providers: readonly OffRampProvider[],
    private readonly strategy: RoutingStrategy = new CheapestStrategy(),
  ) {}

  async findBestOption(intent: CashOutIntent): Promise<Result<RoutingDecision, DomainError>> {
    const candidates = this.providers.filter((provider) => provider.categories.includes(intent.category));

    if (candidates.length === 0) {
      return err({
        type: 'NO_PROVIDER_AVAILABLE',
        category: intent.category,
      });
    }

    const results = await Promise.allSettled(
      candidates.map(async (provider) => {
        const products = await provider.searchProducts(intent.brand ?? '', { category: intent.category });

        if (!isOk(products)) {
          return products;
        }

        const selectedProduct = this.pickBestProduct(products.value, intent);

        if (!selectedProduct) {
          return err<DomainError>({
            type: 'INVALID_PROVIDER_RESPONSE',
            providerId: provider.id,
            message: 'Provider did not return a matching product.',
          });
        }

        return provider.getQuote(selectedProduct, intent.amount);
      }),
    );

    const quotes = results.flatMap((result) => {
      if (result.status !== 'fulfilled' || !isOk(result.value)) {
        return [];
      }

      return [result.value.value];
    });

    if (quotes.length === 0) {
      return err({ type: 'ALL_PROVIDERS_FAILED' });
    }

    return ok({
      quote: this.strategy.select(quotes, intent),
      consideredProviders: candidates.map((provider) => provider.id),
    });
  }

  private pickBestProduct(products: Product[], intent: CashOutIntent): Product | null {
    const categoryMatches = products.filter((product) => product.category === intent.category);

    if (categoryMatches.length === 0) {
      return null;
    }

    if (!intent.brand) {
      return categoryMatches[0] ?? null;
    }

    const normalizedBrand = intent.brand.toLowerCase();

    return (
      categoryMatches.find((product) => {
        const candidates = [product.name, product.brand].filter((value): value is string => Boolean(value));
        return candidates.some((value) => value.toLowerCase().includes(normalizedBrand));
      }) ?? categoryMatches[0] ?? null
    );
  }
}
