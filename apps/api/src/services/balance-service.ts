import type { AccountProvider, Balance, DomainError } from '@pouch/domain';
import type { Result } from '@pouch/shared';

export interface BalanceServiceLike {
  getBalance(userId: string): Promise<Result<Balance, DomainError>>;
}

export class BalanceService implements BalanceServiceLike {
  constructor(private readonly accountProvider: AccountProvider) {}

  async getBalance(userId: string): Promise<Result<Balance, DomainError>> {
    return this.accountProvider.getUnifiedBalance(userId);
  }
}
