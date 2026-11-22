import Shell from '@/components/Shell';

export default async function WorkspaceLayout({ children, params }) {
  const { ws } = await params;
  return <Shell wsId={ws}>{children}</Shell>;
}
