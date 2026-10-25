import { describe, expect, it } from 'vitest';
import { analyticsAmount, analyticsDescriptor, analyticsRows } from './analytics-groups';

const t=(uk: string)=>uk;
const account=()=>({id:'bank',name:'Bank',emoji:'💳'});
const category=()=>({id:'food',name:'Продукти',emoji:'🛒'});

describe('analytics groups',()=>{
 it('keeps borrowed cash and repaid debts separate from earned income',()=>{
  const rows=[
   {id:'earned',type:'income',purpose:'ORDINARY',amount:80,economicAmount:80,date:'2026-10-05'},
   {id:'borrowed',type:'income',purpose:'PASS_THROUGH',amount:500,economicAmount:0,date:'2026-10-06'},
   {id:'returned',type:'income',purpose:'REIMBURSEMENT',amount:200,economicAmount:0,date:'2026-10-07'},
  ];
  expect(analyticsRows(rows,'income','category',null).map((x: { id: string })=>x.id)).toEqual(['earned']);
  expect(analyticsRows(rows,'income','incomeSource',null).map((x: { id: string })=>x.id)).toEqual(['earned','borrowed','returned']);
  expect(rows.map((x: Record<string, unknown>)=>analyticsDescriptor(x,'incomeSource',account,category,t).key)).toEqual(['earned','borrowed','returned']);
 });

 it('uses recorded recurring occurrences, not the payment schedule, for the split',()=>{
  const rows=[
   {id:'regular',type:'expense',purpose:'ORDINARY',amount:20,economicAmount:20,recurringId:'payment-1',date:'2026-10-04'},
   {id:'oneoff',type:'expense',purpose:'ORDINARY',amount:80,economicAmount:80,date:'2026-10-05'},
   {id:'loan',type:'expense',purpose:'DEBT_REPAYMENT',amount:500,economicAmount:0,date:'2026-10-06'},
  ];
  const selected=analyticsRows(rows,'expense','regularity',{from:'2026-10-01',to:'2026-10-31'});
  expect(selected.map((x: { id: string })=>x.id)).toEqual(['regular','oneoff']);
  expect(selected.map((x: Record<string, unknown>)=>analyticsDescriptor(x,'regularity',account,category,t).key)).toEqual(['regular','oneoff']);
  expect(analyticsAmount(rows[2],'commitments')).toBe(500);
 });
});
