import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountNo } = await params;
    const { searchParams } = new URL(req.url);
    const datasetId = searchParams.get('datasetId');

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }
    
    const account = await prisma.account.findUnique({
      where: { 
        datasetId_accountNo: {
          datasetId,
          accountNo
        }
      }
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const findings = await prisma.finding.findMany({
      where: { accountId: account.id },
      include: {
        comments: {
          include: {
            author: { select: { username: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const formattedAccount = {
      'Account No': account.accountNo,
      'Account Name': account.accountName,
      'Customer ID': account.customerId,
      'Account Product': account.accountProduct,
      'Sanctioned Limit': account.sanctionedLimit,
      'Outstanding Balance': account.outstandingBalance,
      'Total Findings': findings.length,
    };

    const formattedFindings = findings.map(f => ({
      'Account No': account.accountNo, // Using accountNo here for frontend compatibility
      'Sanctioned Date': account.sanctionedDate,
      'Interest Rate (%)': account.interestRate,
      'Category Name': f.categoryName,
      'Subcategory Name': f.subcategoryName,
      'SL No': f.slNo,
      'Observation (Audit Checkpoint)': f.observation,
      'Risk': f.risk,
      'Status': f.status,
      'Auditor Comment': f.auditorComment,
      'Auditor Name': f.auditorName,
      'Comment Date': f.commentDate,
      // Pass the comments list directly
      comments: f.comments.map(c => ({
        id: c.id,
        text: c.text,
        type: c.type,
        username: c.author.username,
        createdAt: c.createdAt
      }))
    }));

    return NextResponse.json({
      account: formattedAccount,
      findings: formattedFindings
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
