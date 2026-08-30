import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: { sub: string; email: string; ver?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { authVersion: true },
    });
    // Tokens issued before authVersion existed are version zero. They remain
    // valid until the first password reset increments the persisted version.
    if (!user || (payload.ver ?? 0) !== user.authVersion) {
      throw new UnauthorizedException(
        'Session is invalid. Please sign in again.',
      );
    }
    return payload;
  }
}
