import { getActionToken } from '@/lib/portal/portal.tokens';
import { redirect } from 'next/navigation';
import ReplyClient from './ReplyClient';

export default async function ReplyPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.t === 'string' ? searchParams.t : null;
  
  if (!token) {
    redirect('/view/expired');
  }

  const actionData = await getActionToken(token);
  // Optional: check if action is specifically 'reply'
  if (!actionData || actionData.action !== 'reply') {
    redirect('/view/expired');
  }

  return <ReplyClient data={actionData.data} actionToken={token} />;
}
