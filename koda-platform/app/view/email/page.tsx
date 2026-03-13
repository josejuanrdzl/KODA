import { getViewToken } from '@/lib/portal/portal.tokens';
import { redirect } from 'next/navigation';
import EmailClient from './EmailClient';

export default async function EmailPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.t === 'string' ? searchParams.t : null;
  
  if (!token) {
    redirect('/view/expired');
  }

  const viewData = await getViewToken(token);
  if (!viewData || viewData.type !== 'email') {
    redirect('/view/expired');
  }

  return <EmailClient data={viewData.data} viewToken={token} />;
}
