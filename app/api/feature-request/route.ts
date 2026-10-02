import { NextRequest } from 'next/server';
import { handleSubmission } from '@/lib/submissions';
export async function POST(request: NextRequest) { return handleSubmission(request, 'feature'); }
