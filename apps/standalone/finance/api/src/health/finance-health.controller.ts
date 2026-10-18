import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { FinancePrismaService } from '../prisma/finance-prisma.service';

@Controller('health')
export class FinanceHealthController {
  constructor(private readonly prisma: FinancePrismaService) {}

  @Get()
  health() {
    return { status: 'ok', service: 'finance-api' };
  }

  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', service: 'finance-api', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'finance-api',
        database: 'unavailable',
      });
    }
  }
}
