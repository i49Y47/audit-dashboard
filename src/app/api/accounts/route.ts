import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const datasetId = searchParams.get('datasetId');

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    const accounts = await prisma.account.findMany({
      where: {
        datasetId,
        ...(query ? {
          OR: [
            { accountNo: { contains: query, mode: 'insensitive' } },
            { accountName: { contains: query, mode: 'insensitive' } }
          ]
        } : {})
      },
      take: 50,
      include: {
        _count: {
          select: { findings: true }
        }
      }
    });

    const formattedAccounts = accounts.map(acc => ({
      'Account No': acc.accountNo, // changed from acc.id
      'Account Name': acc.accountName,
      'Account Product': acc.accountProduct,
      'Sanctioned Limit': acc.sanctionedLimit,
      'Total Findings': acc._count.findings
    }));

    return NextResponse.json({ accounts: formattedAccounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
