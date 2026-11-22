import JoinClient from './JoinClient';

export const metadata = { title: 'Join workspace — Pipeline' };

export default async function JoinPage({ params, searchParams }) {
  const { ws } = await params;
  const { code } = await searchParams;
  return <JoinClient wsId={ws} code={code || ''} />;
}
