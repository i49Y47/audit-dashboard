import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const datasetId = searchParams.get('datasetId');
    
    if (!datasetId) {
      return new NextResponse('datasetId is required', { status: 400 });
    }

    const accounts = await prisma.account.findMany({
      where: { datasetId },
      include: {
        findings: {
          include: {
            comments: {
              include: { author: true },
              orderBy: { createdAt: 'asc' }
            }
          }
        }
      }
    });

    if (!accounts || accounts.length === 0) {
      return new NextResponse('No data found for this dataset', { status: 404 });
    }

    // Format Data for "By Account" Sheet
    const byAccountData = accounts.map(acc => ({
      'Account No': acc.accountNo,
      'Account Name': acc.accountName,
      'Customer ID': acc.customerId || '',
      'Account Product': acc.accountProduct || '',
      'Sanctioned Limit': acc.sanctionedLimit || '',
      'Outstanding Balance': acc.outstandingBalance || ''
    }));

    // Format Data for "Findings" Sheet
    const findingsData: any[] = [];
    accounts.forEach(acc => {
      acc.findings.forEach(f => {
        // Format threaded comments
        const platformComments = f.comments.map(c => 
          `[${c.type === 'PRIVATE' ? 'Private' : 'Shared'}] ${c.author.username} (${new Date(c.createdAt).toLocaleDateString()}): ${c.text}`
        ).join('\n\n');

        findingsData.push({
          'SL No': f.slNo,
          'Account No': acc.accountNo,
          'Category Name': f.categoryName || '',
          'Subcategory Name': f.subcategoryName || '',
          'Observation (Audit Checkpoint)': f.observation || '',
          'Risk': f.risk || '',
          'Status': f.status || '',
          'Auditor Comment': f.auditorComment || '',
          'Auditor Name': f.auditorName || '',
          'Comment Date': f.commentDate || '',
          'Platform Comments': platformComments || '',
          'Sanctioned Date': acc.sanctionedDate || '',
          'Interest Rate (%)': acc.interestRate || ''
        });
      });
    });

    // Create Excel Workbook
    const wb = xlsx.utils.book_new();
    const wsAccounts = xlsx.utils.json_to_sheet(byAccountData);
    const wsFindings = xlsx.utils.json_to_sheet(findingsData);

    xlsx.utils.book_append_sheet(wb, wsAccounts, 'By Account');
    xlsx.utils.book_append_sheet(wb, wsFindings, 'Findings');

    // Generate buffer
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="Audit_Export_${new Date().toISOString().split('T')[0]}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });

  } catch (error: any) {
    console.error(error);
    return new NextResponse(error.message, { status: 500 });
  }
}
