import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { RequestContextMiddleware } from '../common/request-context/request-context.middleware';
import { ProductionRecoveryController } from './production-recovery.controller';
import { productionRecoveryProviders } from './production-recovery.providers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    RequestContextModule,
  ],
  controllers: [ProductionRecoveryController],
  providers: productionRecoveryProviders,
})
export class ProductionRecoveryModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
