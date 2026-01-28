/**
 * Bulk Session Creation Script
 * Purpose: Create multiple badminton sessions for February 2026.
 * Usage: npx ts-node scripts/create-bulk-sessions.ts
 */

const API_URL = 'https://vmito.com/api/sessions';
const TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWt5OXkzemQwMDE5cDUwMTh6cGZlMHVqIiwiZW1haWwiOiJtaW5obGVAZ21haWwuY29tIiwicm9sZSI6IkhPU1QiLCJpYXQiOjE3Njk2MTk4Nzh9.OptO2V8ABqrJVIOsB0XmTrjphNisLai8WE-DlFLmBZ8';

const DRY_RUN = process.env.DRY_RUN === 'true';

const sessionBase = {
  name: "Dưỡng sinh buổi sáng",
  description: "Kèo dưỡng sinh cho bà con dậy sớm healthy ạ",
  location: "Sân cầu lông 18B Cộng hòa",
  hostName: "Minh Lê",
  hostPhone: "0910325641",
  numberOfCourts: 2,
  maxPlayersPerCourt: 8,
  courts: [
    { courtNumber: 1, courtName: "Sân 1" },
    { courtNumber: 2, courtName: "Sân 2" }
  ],
  feeConfig: {
    feeType: "FIXED",
    maleFee: 75000,
    femaleFee: 65000,
    notes: "Free trà đá"
  }
};

const dates = [2, 3, 4, 5, 6]; // February 2, 3, 4, 5, 6 (2026)

async function createSessions() {
  console.log(`Starting bulk session creation... ${DRY_RUN ? '[DRY RUN MODE]' : ''}`);
  
  for (const day of dates) {
    const dayStr = day.toString().padStart(2, '0');
    const startTimeStr = `2026-02-${dayStr}T05:00:00+07:00`;
    const endTimeStr = `2026-02-${dayStr}T07:00:00+07:00`;

    const payload = {
      ...sessionBase,
      startTime: startTimeStr,
      endTime: endTimeStr
    };

    console.log(`\n--- Session for Feb ${dayStr}, 2026 ---`);
    console.log(`Time: 05:00 - 07:00 (ICT)`);
    
    if (DRY_RUN) {
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('[DRY RUN] Skipping actual request.');
      continue;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': TOKEN
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await (response.json() as any);
        console.log(`✅ Success: Session created with ID: ${data.id}`);
      } else {
        const error = await response.text();
        console.error(`❌ Error ${response.status}: ${error}`);
      }
    } catch (e: any) {
      console.error(`❌ Fetch error: ${e.message}`);
    }
  }

  console.log('\nBulk creation finished.');
}

createSessions().catch(console.error);
