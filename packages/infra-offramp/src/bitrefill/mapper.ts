import { err, ok, type Result } from '@pouch/shared';

import type { Amount, DomainError, OffRampCategory, Order, OrderStatus, Product, Quote, WebhookEvent } from '@pouch/domain';

import type { BitrefillInvoiceDto, BitrefillOrderDto, BitrefillPackageDto, BitrefillProductDto } from './types';

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function inferCategory(product: BitrefillProductDto, fallback?: OffRampCategory): OffRampCategory {
  if (fallback) {
    return fallback;
  }

  const haystack = `${product.id} ${product.name}`.toLowerCase();

  if (haystack.includes('esim')) {
    return 'esim';
  }

  if (haystack.includes('phone') || haystack.includes('topup') || haystack.includes('refill')) {
    return 'topup';
  }

  if (haystack.includes('bill')) {
    return 'billpay';
  }

  return 'giftcard';
}

function mapPaymentMethod(method: string | undefined): { chainId: number; token: string } {
  switch (method) {
    case 'usdc_arbitrum':
      return { chainId: 42161, token: 'USDC' };
    case 'usdc_base':
      return { chainId: 8453, token: 'USDC' };
    case 'usdc_polygon':
      return { chainId: 137, token: 'USDC' };
    case 'usdc_erc20':
      return { chainId: 1, token: 'USDC' };
    case 'eth_arbitrum':
      return { chainId: 42161, token: 'ETH' };
    case 'eth_base':
      return { chainId: 8453, token: 'ETH' };
    case 'ethereum':
      return { chainId: 1, token: 'ETH' };
    default:
      return { chainId: 0, token: method?.split('_')[0]?.toUpperCase() ?? 'UNKNOWN' };
  }
}

function toPaymentAmount(value: number): Amount {
  return {
    value: Number(value.toFixed(2)),
    currency: 'USD',
  };
}

function toRedemption(order: BitrefillOrderDto | undefined): Order['redemption'] | undefined {
  if (!order) {
    return undefined;
  }

  const link = order.redemption_info?.link ?? order.claim_url ?? order.redeem_url;
  const code = order.redemption_info?.code;
  const instructions = order.redemption_info?.instructions ?? order.instructions;

  if (!code && !link && !instructions) {
    return undefined;
  }

  return {
    ...(code ? { code } : {}),
    ...(link ? { link } : {}),
    ...(instructions ? { instructions } : {}),
  };
}

export class BitrefillMapper {
  toProduct(product: BitrefillProductDto, options: { category?: OffRampCategory } = {}): Product {
    const denominations = product.packages
      ?.map((entry) => toNumber(entry.value))
      .filter((value): value is number => value !== undefined);

    const mappedProduct: Product = {
      id: product.id,
      providerId: 'bitrefill',
      name: product.name,
      brand: product.name,
      category: inferCategory(product, options.category),
      ...(product.image ? { image: product.image } : {}),
      ...(denominations?.length ? { denominations } : {}),
      ...(product.range
        ? {
            range: {
              min: product.range.min,
              max: product.range.max,
              ...(product.range.step ? { step: product.range.step } : {}),
            },
          }
        : {}),
    };

    Object.defineProperty(mappedProduct, '__bitrefill', {
      enumerable: false,
      value: {
        packages:
          product.packages
            ?.map((entry) => {
              const value = toNumber(entry.value);

              if (value === undefined) {
                return null;
              }

              return {
                id: entry.id,
                value,
              };
            })
            .filter((entry): entry is { id: string; value: number } => entry !== null) ?? [],
      },
    });

    return mappedProduct;
  }

  findMatchingPackage(product: BitrefillProductDto, amount: Amount): BitrefillPackageDto | null {
    return product.packages?.find((entry) => toNumber(entry.value) === amount.value) ?? null;
  }

  toQuoteFromCatalogProduct(product: BitrefillProductDto, amount: Amount): Result<Quote, DomainError> {
    const mappedProduct = this.toProduct(product);
    const matchingPackage = this.findMatchingPackage(product, amount);

    if (product.packages?.length) {
      if (!matchingPackage) {
        return err({
          type: 'UNKNOWN',
          message: `Bitrefill does not support ${amount.value} USD for ${product.id}.`,
        });
      }

      return ok({
        providerId: 'bitrefill',
        productId: product.id,
        faceValue: amount,
        paymentAmount: toPaymentAmount(matchingPackage.price ?? amount.value),
        estimatedDelivery: 'instant',
      });
    }

    if (product.range) {
      const withinRange = amount.value >= product.range.min && amount.value <= product.range.max;
      const stepMatches = product.range.step ? (amount.value - product.range.min) % product.range.step === 0 : true;

      if (!withinRange || !stepMatches) {
        return err({
          type: 'UNKNOWN',
          message: `Bitrefill does not support ${amount.value} USD for ${product.id}.`,
        });
      }

      return ok({
        providerId: 'bitrefill',
        productId: product.id,
        faceValue: amount,
        paymentAmount: toPaymentAmount((product.range.price_rate ?? 1) * amount.value),
        estimatedDelivery: 'instant',
      });
    }

    return this.toQuote(mappedProduct, amount);
  }

  toQuote(product: Product, amount: Amount): Result<Quote, DomainError> {
    if (product.denominations && !product.denominations.includes(amount.value)) {
      return err({
        type: 'UNKNOWN',
        message: `Bitrefill does not support ${amount.value} USD for ${product.id}.`,
      });
    }

    if (product.range) {
      const withinRange = amount.value >= product.range.min && amount.value <= product.range.max;
      const stepMatches = product.range.step ? (amount.value - product.range.min) % product.range.step === 0 : true;

      if (!withinRange || !stepMatches) {
        return err({
          type: 'UNKNOWN',
          message: `Bitrefill does not support ${amount.value} USD for ${product.id}.`,
        });
      }
    }

    return ok({
      providerId: 'bitrefill',
      productId: product.id,
      faceValue: amount,
      paymentAmount: amount,
      estimatedDelivery: 'instant',
    });
  }

  toOrder(
    invoice: BitrefillInvoiceDto,
    context: { product: Product; amount: Amount; idempotencyKey: string },
  ): Order {
    const firstOrder = invoice.orders?.[0];
    const payment = mapPaymentMethod(invoice.payment?.method);

    return {
      id: invoice.id,
      ...(firstOrder?.id ? { providerOrderId: firstOrder.id } : {}),
      providerId: 'bitrefill',
      product: context.product,
      faceValue: context.amount,
      payment: {
        ...(invoice.payment?.address ? { address: invoice.payment.address } : {}),
        amount: {
          value: invoice.payment?.price ?? context.amount.value,
          currency: 'USD',
        },
        chainId: payment.chainId,
        token: payment.token,
      },
      status: this.toOrderStatus(invoice.status),
      idempotencyKey: context.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  toWebhookEvent(invoice: BitrefillInvoiceDto, order?: BitrefillOrderDto): WebhookEvent {
    return {
      eventId: invoice.id,
      orderId: invoice.orders?.[0]?.id ?? invoice.id,
      providerId: 'bitrefill',
      status: this.toOrderStatus(invoice.status),
      ...(toRedemption(order) ? { redemption: toRedemption(order) } : {}),
      payload: invoice,
    };
  }

  toOrderStatus(status: string | undefined): OrderStatus {
    switch (status) {
      case 'complete':
      case 'delivered':
        return 'delivered';
      case 'paid':
        return 'paid';
      case 'denied':
      case 'payment_error':
      case 'failed':
        return 'failed';
      case 'refunded':
        return 'refunded';
      case 'unpaid':
      case 'not_delivered':
      default:
        return 'payment_pending';
    }
  }
}
