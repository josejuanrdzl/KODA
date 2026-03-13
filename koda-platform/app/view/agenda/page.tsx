import { getActionToken, getViewToken } from '@/lib/portal/portal.tokens';
import { redirect } from 'next/navigation';
import AgendaClient from './AgendaClient';

export default async function AgendaPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.t === 'string' ? searchParams.t : null;
  const viewToken = typeof searchParams.v === 'string' ? searchParams.v : null;
  
  if (!token && !viewToken) {
    redirect('/view/expired');
  }

  let data = null;
  if (token) {
    const actionData = await getActionToken(token);
    if (!actionData || actionData.action !== 'agenda') {
      redirect('/view/expired');
    }
    data = actionData.data;
  } else if (viewToken) {
    const vData = await getViewToken(viewToken);
    if (!vData || vData.viewType !== 'agenda') {
      redirect('/view/expired');
    }
    data = vData.data;
  }

  return <AgendaClient data={data} />;
}
