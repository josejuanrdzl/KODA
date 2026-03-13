import { getActionToken } from '@/lib/portal/portal.tokens';
import { redirect } from 'next/navigation';
import NewEventClient from './NewEventClient';

export default async function NewEventPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.t === 'string' ? searchParams.t : null;
  
  if (!token) {
    redirect('/view/expired');
  }

  const actionData = await getActionToken(token);
  // Ensure the action matches what we expect
  if (!actionData || actionData.action !== 'new-event') {
    redirect('/view/expired');
  }

  return <NewEventClient data={actionData.data} actionToken={token} />;
}
