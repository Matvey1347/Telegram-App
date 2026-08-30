import { ResetPasswordForm } from '@/components/features/identity/auth/auth-forms';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return <ResetPasswordForm token={token} />;
}
