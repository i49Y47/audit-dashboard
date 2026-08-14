import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetId = searchParams.get('datasetId');

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    const totalAccounts = await prisma.account.count({ where: { datasetId } });
    
    const accounts = await prisma.account.findMany({
      where: { datasetId },
      include: {
        _count: {
          select: { findings: true }
        }
      }
    });

    const totalSanctioned = accounts.reduce((sum, acc) => sum + (acc.sanctionedLimit || 0), 0);
    const totalOutstanding = accounts.reduce((sum, acc) => sum + (acc.outstandingBalance || 0), 0);

    // Fetch findings for this dataset to calculate risk
    const findings = await prisma.finding.findMany({
      where: { account: { datasetId } },
      select: { risk: true }
    });

    const highRisk = findings.filter(f => f.risk?.toUpperCase() === 'HIGH').length;
    const mediumRisk = findings.filter(f => f.risk?.toUpperCase() === 'MEDIUM').length;
    const lowRisk = findings.filter(f => f.risk?.toUpperCase() === 'LOW').length;

    const topRisky = accounts
      .sort((a, b) => b._count.findings - a._count.findings)
      .slice(0, 5)
      .map(acc => ({
        'Account No': acc.accountNo, // changed from acc.id to acc.accountNo
        'Account Name': acc.accountName,
        'Total Findings': acc._count.findings,
        'Sanctioned Limit': acc.sanctionedLimit
      }));

    return NextResponse.json({
      total_accounts: totalAccounts,
      total_sanctioned: totalSanctioned,
      total_outstanding: totalOutstanding,
      risk_distribution: [
        { name: "High", value: highRisk, fill: "#991B1B" },
        { name: "Medium", value: mediumRisk, fill: "#92400E" },
        { name: "Low", value: lowRisk, fill: "#065F46" }
      ],
      top_risky_accounts: topRisky
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
