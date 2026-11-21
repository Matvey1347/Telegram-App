'use client';

import { useParams } from 'next/navigation';
import { AdCampaignDetail } from '@/components/features/growth/ad-campaigns/ad-campaign-detail';

export default function AdCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AdCampaignDetail id={id} />;
}
