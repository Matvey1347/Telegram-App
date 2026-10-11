import { SimpleFinanceApp } from '@finance/web/components/simple-finance-app';
export const metadata = { title: 'Finance', description: 'Простий облік особистих фінансів' };
export default async function Page({params}:{params:Promise<{botId:string}>}) { const {botId}=await params; return <SimpleFinanceApp botId={botId}/>; }
