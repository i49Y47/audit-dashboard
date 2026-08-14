import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string, slNo: string } }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountNo = params.id;
    const slNo = params.slNo;
    const { searchParams } = new URL(req.url);
    const datasetId = searchParams.get('datasetId');

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    const body = await req.json();
    
    // Find the specific account
    const account = await prisma.account.findUnique({
      where: {
        datasetId_accountNo: { datasetId, accountNo }
      }
    });

    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    // Find the specific finding
    const finding = await prisma.finding.findUnique({
      where: {
        accountId_slNo: { accountId: account.id, slNo }
      }
    });

    if (!finding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

    // Update status if provided
    if (body.status !== undefined) {
      await prisma.finding.update({
        where: { id: finding.id },
        data: { status: body.status }
      });
    }

    // Add shared comment if provided
    if (body.shared_comment && String(body.shared_comment).trim() !== '') {
      await prisma.comment.create({
        data: {
          text: String(body.shared_comment).trim(),
          type: 'SHARED',
          authorId: session.userId,
          findingId: finding.id
        }
      });
    }

    // Add private comment if provided
    if (body.private_comment && String(body.private_comment).trim() !== '') {
      await prisma.comment.create({
        data: {
          text: String(body.private_comment).trim(),
          type: 'PRIVATE',
          authorId: session.userId,
          findingId: finding.id
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
