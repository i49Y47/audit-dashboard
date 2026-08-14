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
    const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const dataset = await prisma.dataset.create({
      data: {
        name: `Imported on ${istTime}`
      }
    });

    const datasetId = dataset.id;

    // 2. Pre-process accounts and findings to merge missing data
    const accountUpdatesFromFindings = new Map<string, { date?: string, interest?: number }>();
    for (const f of findingsData as any[]) {
      if (!f['Account No']) continue;
      const accountNo = String(f['Account No']);
      
      const update: any = {};
      if (f['Sanctioned Date']) update.date = String(f['Sanctioned Date']);
      if (f['Interest Rate (%)']) update.interest = Number(f['Interest Rate (%)']);
      
      if (Object.keys(update).length > 0) {
        const existing = accountUpdatesFromFindings.get(accountNo) || {};
        accountUpdatesFromFindings.set(accountNo, { ...existing, ...update });
      }
    }

    // 3. Prepare Account data for bulk insert
    const accountsToInsert = [];
    const processedAccountNos = new Set<string>(); // avoid duplicates in same upload
    
    for (const acc of accountsData as any[]) {
      if (!acc['Account No']) continue;
      const accountNo = String(acc['Account No']);
      if (processedAccountNos.has(accountNo)) continue;
      
      processedAccountNos.add(accountNo);
      
      const updates = accountUpdatesFromFindings.get(accountNo) || {};
      
      accountsToInsert.push({
        accountNo,
        datasetId,
        accountName: String(acc['Account Name'] || ''),
        customerId: String(acc['Customer ID'] || ''),
        accountProduct: String(acc['Account Product'] || ''),
        sanctionedLimit: Number(acc['Sanctioned Limit']) || 0,
        outstandingBalance: Number(acc['Outstanding Balance']) || 0,
        sanctionedDate: updates.date || undefined,
        interestRate: updates.interest !== undefined ? updates.interest : undefined,
      });
    }

    // 4. Bulk Insert Accounts
    if (accountsToInsert.length > 0) {
      await prisma.account.createMany({
        data: accountsToInsert
      });
    }

    // 5. Fetch inserted accounts to get their MongoDB ObjectIDs
    const insertedAccounts = await prisma.account.findMany({
      where: { datasetId },
      select: { id: true, accountNo: true }
    });
    
    const accountMap = new Map<string, string>(); // accountNo -> mongodb _id
    for (const acc of insertedAccounts) {
      accountMap.set(acc.accountNo, acc.id);
    }

    // 6. Prepare Findings data for bulk insert
    const findingsToInsert = [];
    
    for (const f of findingsData as any[]) {
      if (!f['SL No'] || !f['Account No']) continue;
      
      const accountNo = String(f['Account No']);
      const accountId = accountMap.get(accountNo);
      
      if (!accountId) continue; // Skip finding if account not in dataset
      
      findingsToInsert.push({
        slNo: String(f['SL No']),
        accountId,
        categoryName: String(f['Category Name'] || ''),
        subcategoryName: String(f['Subcategory Name'] || ''),
        observation: String(f['Observation (Audit Checkpoint)'] || ''),
        risk: String(f['Risk'] || ''),
        status: String(f['Status'] || 'Not Complied'),
        auditorComment: String(f['Auditor Comment'] || ''),
        auditorName: String(f['Auditor Name'] || ''),
        commentDate: String(f['Comment Date'] || ''),
      });
    }

    // 7. Bulk Insert Findings
    if (findingsToInsert.length > 0) {
      await prisma.finding.createMany({
        data: findingsToInsert
      });
    }

    return NextResponse.json({ success: true, message: 'Data imported successfully', dataset });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
