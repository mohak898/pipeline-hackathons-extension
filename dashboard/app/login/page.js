import LoginClient from './LoginClient';

export const metadata = { title: 'Sign in — Pipeline' };

export default async function LoginPage({ searchParams }) {
  const { code } = await searchParams;
  return <LoginClient code={code || ''} />;
}
