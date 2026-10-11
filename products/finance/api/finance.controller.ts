import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SimpleFinanceCategoryType, SimpleFinanceEntryKind } from '@prisma/client';
import { SimpleFinanceService } from './finance.service';

@Controller('simple-finance-bots/:botId')
export class SimpleFinanceController {
  constructor(private readonly finance: SimpleFinanceService) {}
  private async profile(botId: string, session?: string) { return this.finance.profileFromSession(botId, session); }
  @Post('auth') async auth(@Param('botId') botId:string,@Headers('x-telegram-init-data') initData:string|undefined,@Res({passthrough:true}) res:Response) { const state=await this.finance.bootstrap(botId,initData); res.cookie('simple_finance_session',state.token,{httpOnly:true,sameSite:'lax',secure:false,path:`/api/simple-finance-bots/${botId}`,maxAge:30*24*60*60*1000}); return {authenticated:true}; }
  @Get('session') async session(@Param('botId') botId:string,@Headers('cookie') cookie?:string) { try { await this.profile(botId,this.cookie(cookie)); return {authenticated:true}; } catch { return {authenticated:false}; } }
  @Get('dashboard') async dashboard(@Param('botId') b:string,@Headers('cookie') c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.dashboard(p.id)}
  @Get('catalog') async catalog(@Param('botId') b:string,@Headers('cookie') c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.listCatalog(p.id)}
  @Post('accounts') async createAccount(@Param('botId')b:string,@Headers('cookie')c:string|undefined,@Body()body:{name:string;emoji?:string;initialBalanceMinor?:string}){const p=await this.profile(b,this.cookie(c));return this.finance.createAccount(p.id,body)}
  @Patch('accounts/:id') async updateAccount(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c:string|undefined,@Body()body:{name?:string;emoji?:string;initialBalanceMinor?:string}){const p=await this.profile(b,this.cookie(c));return this.finance.updateAccount(p.id,id,body)}
  @Delete('accounts/:id') async deleteAccount(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.deleteAccount(p.id,id)}
  @Post('categories') async createCategory(@Param('botId')b:string,@Headers('cookie')c:string|undefined,@Body()body:{name:string;emoji?:string;type:SimpleFinanceCategoryType}){const p=await this.profile(b,this.cookie(c));return this.finance.createCategory(p.id,body)}
  @Patch('categories/:id') async updateCategory(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c:string|undefined,@Body()body:{name?:string;emoji?:string;type?:SimpleFinanceCategoryType}){const p=await this.profile(b,this.cookie(c));return this.finance.updateCategory(p.id,id,body)}
  @Delete('categories/:id') async deleteCategory(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.deleteCategory(p.id,id)}
  @Get('entries') async entries(@Param('botId')b:string,@Headers('cookie')c:string|undefined,@Query('kind')kind?:SimpleFinanceEntryKind){const p=await this.profile(b,this.cookie(c));return this.finance.entries(p.id,kind)}
  @Post('entries') async createEntry(@Param('botId')b:string,@Headers('cookie')c:string|undefined,@Body()body:any){const p=await this.profile(b,this.cookie(c));return this.finance.saveEntry(p.id,body)}
  @Patch('entries/:id') async updateEntry(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c:string|undefined,@Body()body:any){const p=await this.profile(b,this.cookie(c));return this.finance.saveEntry(p.id,body,id)}
  @Delete('entries/:id') async deleteEntry(@Param('botId')b:string,@Param('id')id:string,@Headers('cookie')c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.deleteEntry(p.id,id)}
  @Get('analytics') async analytics(@Param('botId')b:string,@Headers('cookie')c?:string){const p=await this.profile(b,this.cookie(c));return this.finance.analytics(p.id)}
  private cookie(header?:string){return header?.split(';').map(x=>x.trim()).find(x=>x.startsWith('simple_finance_session='))?.slice('simple_finance_session='.length)}
}
