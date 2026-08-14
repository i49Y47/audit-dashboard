import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const wb = xlsx.read(buffer, { type: 'array' });

    if (!wb.SheetNames.includes('By Account') || !wb.SheetNames.includes('Findings')) {
      return NextResponse.json({ error: 'Missing required sheets (By Account, Findings)' }, { status: 400 });
    }

    const accountsData = xlsx.utils.sheet_to_json(wb.Sheets['By Account']);
    const findingsData = xlsx.utils.sheet_to_json(wb.Sheets['Findings']);

    // 1. Create a new Dataset for this upload
    const dataset = await prisma.dataset.create({
      data: {
        name: `Imported on ${new Date().toLocaleString()}`
      }
    });

    const datasetId = dataset.id;
    const accountMap = new Map<string, string>(); // accountNo -> mongodb _id

    // 2. Process Accounts
    for (const acc of accountsData as any[]) {
      if (!acc['Account No']) continue;
      
      const accountNo = String(acc['Account No']);
      
      const createdAccount = await prisma.account.create({
        data: {
          accountNo,
          datasetId,
          accountName: String(acc['Account Name'] || ''),
          customerId: String(acc['Customer ID'] || ''),
          accountProduct: String(acc['Account Product'] || ''),
          sanctionedLimit: Number(acc['Sanctioned Limit']) || 0,
          outstandingBalance: Number(acc['Outstanding Balance']) || 0,
        }
      });
      accountMap.set(accountNo, createdAccount.id);
    }

    // 3. Process Findings
    for (const f of findingsData as any[]) {
      if (!f['SL No'] || !f['Account No']) continue;
      
      const slNo = String(f['SL No']);
      const accountNo = String(f['Account No']);
      const accountId = accountMap.get(accountNo);
      
      if (!accountId) continue; // Skip finding if account not in dataset

      // Update account with missing date/interest if available
      if (f['Sanctioned Date'] || f['Interest Rate (%)']) {
        await prisma.account.update({
          where: { id: accountId },
          data: {
            sanctionedDate: f['Sanctioned Date'] ? String(f['Sanctioned Date']) : undefined,
            interestRate: f['Interest Rate (%)'] ? Number(f['Interest Rate (%)']) : undefined,
          }
        });
      }

      await prisma.finding.create({
        data: {
          slNo,
          accountId,
          categoryName: String(f['Category Name'] || ''),
          subcategoryName: String(f['Subcategory Name'] || ''),
          observation: String(f['Observation (Audit Checkpoint)'] || ''),
          risk: String(f['Risk'] || ''),
          status: String(f['Status'] || 'Not Complied'),
          auditorComment: String(f['Auditor Comment'] || ''),
          auditorName: String(f['Auditor Name'] || ''),
          commentDate: String(f['Comment Date'] || ''),
        }
      });
    }

    return NextResponse.json({ success: true, message: 'Data imported successfully', dataset });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
