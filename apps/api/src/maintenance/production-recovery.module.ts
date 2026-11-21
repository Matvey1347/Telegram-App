import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { RequestContextMiddleware } from '../common/request-context/request-context.middleware';
import { ProductionRecoveryController } from './production-recovery.controller';
import { ProductionOperatorPublicationController } from './production-operator-publication.controller';
import { productionRecoveryProviders } from './production-recovery.providers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PrismaModule,
    RequestContextModule,
  ],
  controllers: [ProductionRecoveryController, ProductionOperatorPublicationController],
  providers: productionRecoveryProviders,
})
export class ProductionRecoveryModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
