/**
 * Google Apps Script: receive workout sync POST and append to Sheet.
 *
 * Setup:
 * 1. Create a Google Sheet
 * 2. Extensions > Apps Script
 * 3. Paste this code
 * 4. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 5. Copy the web app URL to Workout App Settings
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const session = payload.session;
    const sets = payload.sets || [];

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Append session row: date, dayType, blockId, weekNumber, status
    sheet.appendRow([
      session.date || '',
      session.dayType || '',
      session.blockId || '',
      session.weekNumber || '',
      session.status || ''
    ]);

    // Append set rows: sessionId, exerciseSlot, exerciseName, setNumber, weight, reps, rpe, isWarmup, timestamp
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      sheet.appendRow([
        s.sessionId || '',
        s.exerciseSlot || '',
        s.exerciseName || '',
        s.setNumber || '',
        s.weight || '',
        s.reps || '',
        s.rpe || '',
        s.isWarmup || false,
        s.timestamp ? new Date(s.timestamp).toISOString() : ''
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
