import { handle } from '@/lib/server/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dispatch = async (req, { params }) => handle(req, (await params).path || []);

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
