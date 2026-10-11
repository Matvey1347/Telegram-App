import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SimpleFinanceCategoryType, SimpleFinanceEntryKind, TelegramBotApplicationType } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '@api/prisma/prisma.service';
import { TokenEncryptionService } from '@api/common/security/token-encryption.service';

type EntryInput = { kind: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amountMinor: string; accountId?: string; categoryId?: string; fromAccountId?: string; toAccountId?: string; name?: string; emoji?: string; comment?: string; occurredAt: string };
const money = (value: string) => {
  if (!/^\d{1,16}$/.test(value) || BigInt(value) <= 0n) throw new BadRequestException('Сума має бути більшою за нуль');
  return new Prisma.Decimal(value);
};
const clean = (value: string | undefined, max: number) => value?.trim().slice(0, max) || null;

@Injectable()
export class SimpleFinanceService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: TokenEncryptionService) {}

  async bootstrap(botId: string, initData: string | undefined) {
    if (!initData) throw new ForbiddenException('Потрібна авторизація Telegram Mini App');
    const runtime = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botId, isActive: true, applicationType: TelegramBotApplicationType.SIMPLE_FINANCE }, include: { runtimeInstances: { where: { runtimeStatus: 'ACTIVE' }, take: 1 } } });
    const selected = runtime?.runtimeInstances[0];
    if (!runtime || !selected) throw new NotFoundException('Finance bot не знайдено');
    const token = this.encryption.decrypt({ encrypted: selected.botTokenEncrypted, iv: selected.botTokenIv, authTag: selected.botTokenAuthTag });
    const params = new URLSearchParams(initData); const received = params.get('hash'); params.delete('hash');
    const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
    const key = createHmac('sha256', 'WebAppData').update(token).digest(); const expected = createHmac('sha256', key).update(check).digest('hex');
    if (!received || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new ForbiddenException('Невірні дані Telegram');
    const userRaw = params.get('user'); if (!userRaw) throw new ForbiddenException('Користувача Telegram не знайдено');
    const user = JSON.parse(userRaw) as { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
    const telegramUser = await this.prisma.telegramBotUser.upsert({ where: { botIntegrationId_telegramUserId: { botIntegrationId: botId, telegramUserId: String(user.id) } }, create: { workspaceId: runtime.workspaceId, botIntegrationId: botId, runtimeInstanceId: selected.id, telegramUserId: String(user.id), telegramChatId: String(user.id), firstName: user.first_name, lastName: user.last_name, username: user.username, languageCode: user.language_code, startedAt: new Date() }, update: { firstName: user.first_name, lastName: user.last_name, username: user.username, languageCode: user.language_code, lastInteractionAt: new Date() } });
    const profile = await this.prisma.simpleFinanceProfile.upsert({ where: { botIntegrationId_telegramBotUserId: { botIntegrationId: botId, telegramBotUserId: telegramUser.id } }, create: { botIntegrationId: botId, telegramBotUserId: telegramUser.id }, update: {} });
    return { profileId: profile.id, token: this.sessionToken(botId, profile.id, token) };
  }

  async profileFromSession(botId: string, session: string | undefined) {
    if (!session) throw new ForbiddenException('Потрібна авторизація');
    const [profileId, signature] = session.split('.'); if (!profileId || !signature) throw new ForbiddenException('Недійсна сесія');
    const profile = await this.prisma.simpleFinanceProfile.findFirst({ where: { id: profileId, botIntegrationId: botId } });
    if (!profile) throw new ForbiddenException('Недійсна сесія');
    const runtime = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botId, applicationType: TelegramBotApplicationType.SIMPLE_FINANCE }, include: { runtimeInstances: { where: { runtimeStatus: 'ACTIVE' }, take: 1 } } });
    const r = runtime?.runtimeInstances[0]; if (!r) throw new ForbiddenException('Бот недоступний');
    const key = this.encryption.decrypt({ encrypted: r.botTokenEncrypted, iv: r.botTokenIv, authTag: r.botTokenAuthTag });
    const expected = this.sessionToken(botId, profileId, key).split('.')[1]!;
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new ForbiddenException('Недійсна сесія');
    return profile;
  }
  private sessionToken(botId: string, profileId: string, secret: string) { return `${profileId}.${createHmac('sha256', secret).update(`simple-finance:${botId}:${profileId}`).digest('base64url')}`; }

  async dashboard(profileId: string) {
    const [accounts, entries] = await this.prisma.$transaction([this.prisma.simpleFinanceAccount.findMany({ where: { profileId }, orderBy: { createdAt: 'asc' } }), this.prisma.simpleFinanceEntry.findMany({ where: { profileId }, include: { account: true, category: true, fromAccount: true, toAccount: true }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 100 })]);
    const balances = new Map(accounts.map(a => [a.id, BigInt(a.initialBalanceMinor.toString())]));
    for (const e of entries) { const v = BigInt(e.amountMinor.toString()); if (e.kind === 'INCOME' && e.accountId) balances.set(e.accountId, (balances.get(e.accountId) ?? 0n) + v); if (e.kind === 'EXPENSE' && e.accountId) balances.set(e.accountId, (balances.get(e.accountId) ?? 0n) - v); if (e.kind === 'TRANSFER') { if (e.fromAccountId) balances.set(e.fromAccountId, (balances.get(e.fromAccountId) ?? 0n) - v); if (e.toAccountId) balances.set(e.toAccountId, (balances.get(e.toAccountId) ?? 0n) + v); } }
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); let income = 0n, expense = 0n;
    for (const e of entries) if (e.occurredAt >= monthStart) { const v = BigInt(e.amountMinor.toString()); if (e.kind === 'INCOME') income += v; if (e.kind === 'EXPENSE') expense += v; }
    return { accounts: accounts.map(a => ({ ...a, initialBalanceMinor: a.initialBalanceMinor.toString(), balanceMinor: (balances.get(a.id) ?? 0n).toString() })), totalBalanceMinor: [...balances.values()].reduce((a,b) => a+b, 0n).toString(), month: { incomeMinor: income.toString(), expenseMinor: expense.toString(), balanceMinor: (income-expense).toString() }, entries: entries.map(this.entryView) };
  }
  async listCatalog(profileId: string) { return { accounts: await this.prisma.simpleFinanceAccount.findMany({ where: { profileId }, orderBy: { createdAt: 'asc' } }), categories: await this.prisma.simpleFinanceCategory.findMany({ where: { profileId }, orderBy: { createdAt: 'asc' } }) }; }
  async createAccount(profileId: string, input: { name: string; emoji?: string; initialBalanceMinor?: string }) { return this.prisma.simpleFinanceAccount.create({ data: { profileId, name: this.required(input.name, 80), emoji: clean(input.emoji, 32) ?? '💳', initialBalanceMinor: new Prisma.Decimal(input.initialBalanceMinor ?? '0') } }); }
  async updateAccount(profileId: string, id: string, input: { name?: string; emoji?: string; initialBalanceMinor?: string }) { await this.account(profileId, id); return this.prisma.simpleFinanceAccount.update({ where: { id }, data: { ...(input.name === undefined ? {} : { name: this.required(input.name, 80) }), ...(input.emoji === undefined ? {} : { emoji: clean(input.emoji, 32) ?? '💳' }), ...(input.initialBalanceMinor === undefined ? {} : { initialBalanceMinor: new Prisma.Decimal(input.initialBalanceMinor) }) } }); }
  async deleteAccount(profileId: string, id: string) { await this.account(profileId,id); const used = await this.prisma.simpleFinanceEntry.count({ where: { profileId, OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }] } }); if (used) throw new BadRequestException('Не можна видалити рахунок з історією операцій'); await this.prisma.simpleFinanceAccount.delete({ where: { id } }); return { deleted: true }; }
  async createCategory(profileId: string, input: { name: string; emoji?: string; type: SimpleFinanceCategoryType }) { return this.prisma.simpleFinanceCategory.create({ data: { profileId, name: this.required(input.name,80), emoji: clean(input.emoji,32) ?? '🏷️', type: input.type } }); }
  async updateCategory(profileId: string,id:string,input:{name?:string;emoji?:string;type?:SimpleFinanceCategoryType}) { await this.category(profileId,id); return this.prisma.simpleFinanceCategory.update({where:{id},data:{...(input.name===undefined?{}:{name:this.required(input.name,80)}),...(input.emoji===undefined?{}:{emoji:clean(input.emoji,32)??'🏷️'}),...(input.type===undefined?{}:{type:input.type})}}); }
  async deleteCategory(profileId:string,id:string) { await this.category(profileId,id); if (await this.prisma.simpleFinanceEntry.count({where:{profileId,categoryId:id}})) throw new BadRequestException('Не можна видалити категорію, яка є в історії'); await this.prisma.simpleFinanceCategory.delete({where:{id}}); return {deleted:true}; }
  async saveEntry(profileId:string,input:EntryInput,id?:string) { const amountMinor=money(input.amountMinor); const occurredAt=new Date(input.occurredAt); if (Number.isNaN(occurredAt.valueOf())) throw new BadRequestException('Невірна дата'); if (input.kind === 'TRANSFER') { if (!input.fromAccountId || !input.toAccountId || input.fromAccountId === input.toAccountId) throw new BadRequestException('Оберіть два різні рахунки'); await Promise.all([this.account(profileId,input.fromAccountId),this.account(profileId,input.toAccountId)]); } else { if (!input.accountId || !input.categoryId) throw new BadRequestException('Оберіть рахунок і категорію'); await this.account(profileId,input.accountId); const category=await this.category(profileId,input.categoryId); if (category.type !== input.kind) throw new BadRequestException('Тип категорії не відповідає операції'); }
    const data = { kind: input.kind as SimpleFinanceEntryKind, amountMinor, accountId: input.kind === 'TRANSFER' ? null : input.accountId!, categoryId: input.kind === 'TRANSFER' ? null : input.categoryId!, fromAccountId: input.kind === 'TRANSFER' ? input.fromAccountId! : null, toAccountId: input.kind === 'TRANSFER' ? input.toAccountId! : null, name: clean(input.name,120), emoji: clean(input.emoji,32), comment: clean(input.comment,500), occurredAt };
    const entry = id ? await this.entry(profileId,id).then(() => this.prisma.simpleFinanceEntry.update({where:{id},data})) : await this.prisma.simpleFinanceEntry.create({data:{profileId,...data}}); return this.entryDetail(entry.id,profileId);
  }
  async entries(profileId:string, kind?:SimpleFinanceEntryKind) { const entries=await this.prisma.simpleFinanceEntry.findMany({where:{profileId,...(kind?{kind}:{})},include:{account:true,category:true,fromAccount:true,toAccount:true},orderBy:[{occurredAt:'desc'},{id:'desc'}],take:100}); return entries.map(this.entryView); }
  async deleteEntry(profileId:string,id:string) { await this.entry(profileId,id); await this.prisma.simpleFinanceEntry.delete({where:{id}}); return {deleted:true}; }
  async analytics(profileId:string) { const entries=await this.prisma.simpleFinanceEntry.findMany({where:{profileId,occurredAt:{gte:new Date(new Date().getFullYear(),new Date().getMonth(),1)}},include:{category:true}}); let income=0n, expense=0n; const groups=new Map<string,{name:string;emoji:string;type:string;amount:bigint}>(); for(const e of entries){const v=BigInt(e.amountMinor.toString());if(e.kind==='INCOME')income+=v;if(e.kind==='EXPENSE')expense+=v;if(e.category){const g=groups.get(e.categoryId!)??{name:e.category.name,emoji:e.category.emoji,type:e.category.type,amount:0n};g.amount+=v;groups.set(e.categoryId!,g)}} return {incomeMinor:income.toString(),expenseMinor:expense.toString(),balanceMinor:(income-expense).toString(),categories:[...groups.values()].map(g=>({...g,amountMinor:g.amount.toString()}))}; }
  private async account(profileId:string,id:string){const x=await this.prisma.simpleFinanceAccount.findFirst({where:{id,profileId}});if(!x)throw new NotFoundException('Рахунок не знайдено');return x} private async category(profileId:string,id:string){const x=await this.prisma.simpleFinanceCategory.findFirst({where:{id,profileId}});if(!x)throw new NotFoundException('Категорію не знайдено');return x} private async entry(profileId:string,id:string){const x=await this.prisma.simpleFinanceEntry.findFirst({where:{id,profileId}});if(!x)throw new NotFoundException('Операцію не знайдено');return x} private required(value:string,max:number){const result=value?.trim();if(!result||result.length>max)throw new BadRequestException('Заповніть назву');return result} private async entryDetail(id:string,profileId:string){const e=await this.prisma.simpleFinanceEntry.findFirstOrThrow({where:{id,profileId},include:{account:true,category:true,fromAccount:true,toAccount:true}});return this.entryView(e)} private entryView=(e:any)=>({...e,amountMinor:e.amountMinor.toString()});
}
