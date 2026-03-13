import { getViewToken } from '@/lib/portal/portal.tokens';
import { redirect } from 'next/navigation';
import EmailsClient from './EmailsClient';

export default async function EmailsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.t === 'string' ? searchParams.t : null;
  
  if (!token) {
    redirect('/view/expired');
  }

  const viewData = await getViewToken(token);
  if (!viewData || viewData.type !== 'emails') {
    redirect('/view/expired');
  }

  return <EmailsClient data={viewData.data} viewToken={token} />;
}
