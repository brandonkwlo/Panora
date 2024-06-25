import { Injectable } from '@nestjs/common';
import { PrismaService } from '@@core/prisma/prisma.service';
import { LoggerService } from '@@core/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '@@core/utils/types';
import { throwTypedError } from '@@core/utils/errors';
import { WebhookService } from '@@core/webhook/webhook.service';
import {
  UnifiedPaymentInput,
  UnifiedPaymentOutput,
} from '../types/model.unified';

import { FieldMappingService } from '@@core/field-mapping/field-mapping.service';
import { ServiceRegistry } from './registry.service';
import { OriginalPaymentOutput } from '@@core/utils/types/original/original.accounting';

import { IPaymentService } from '../types';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private webhook: WebhookService,
    private fieldMappingService: FieldMappingService,
    private serviceRegistry: ServiceRegistry,
  ) {
    this.logger.setContext(PaymentService.name);
  }

  async addPayment(
    unifiedPaymentData: UnifiedPaymentInput,
    connection_id: string,
    integrationId: string,
    linkedUserId: string,
    remote_data?: boolean,
  ): Promise<UnifiedPaymentOutput> {
    return;
  }

  async getPayment(
    id_paymenting_payment: string,
    linkedUserId: string,
    integrationId: string,
    remote_data?: boolean,
  ): Promise<UnifiedPaymentOutput> {
    return;
  }

  async getPayments(
    connectionId: string,
    integrationId: string,
    linkedUserId: string,
    limit: number,
    remote_data?: boolean,
    cursor?: string,
  ): Promise<UnifiedPaymentOutput[]> {
    return;
  }
}
