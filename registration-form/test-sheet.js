/* Runs the real Code.gs against a sample submission and prints the rows it
   would write. Google's services are stubbed, so this checks the actual
   column mapping rather than a description of it.

       node test-sheet.js
*/
const fs = require('fs');

let written = [];
let headerRow = null;

const sheet = {
  _rows: 0,
  getLastRow() { return this._rows; },
  appendRow(r) { headerRow = r; this._rows++; },
  getRange(row, col, numRows, numCols) {
    return {
      setValues(vals) { written = written.concat(vals); sheet._rows += vals.length; return this; },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; }
    };
  },
  setFrozenRows() {}, setFrozenColumns() {}
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: () => null,
    insertSheet: () => sheet
  })
};
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.Session = { getScriptTimeZone: () => 'America/New_York' };
global.Utilities = {
  formatDate: (d) => d.toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 15)
};
global.ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) })
};
global.MailApp = { sendEmail() {} };

eval(fs.readFileSync('Code.gs', 'utf8'));

const payload = {
  submittedAt: new Date().toISOString(),
  language: 'en',
  academicYear: '2026-2027',
  studentCount: 2,
  students: [
    { fullName: 'Aisha Bah', dob: '2016-04-12', age: '10', gender: 'Female',
      level: 'Beginner', dismissal: 'Parent/Guardian dismissal',
      hasAllergies: 'Yes', allergyDetails: 'Peanuts', hasMedical: 'No',
      medicalDetails: '', prevSchool: 'PS 149', afterschool: 'Yes' },
    { fullName: 'Yusuf Bah', dob: '2013-09-30', age: '12', gender: 'Male',
      level: 'Advanced', dismissal: 'Self-dismissed',
      hasAllergies: 'No', allergyDetails: '', hasMedical: 'Yes',
      medicalDetails: 'Asthma inhaler', prevSchool: '', afterschool: 'No' }
  ],
  g1Name: 'Mamadou Bah', g1Rel: 'Father', g1Phone: '212 555 0123',
  g1Email: 'bah@example.com', g1Address: '32 W 123rd St, New York, NY 10027',
  g2Name: 'Mariama Bah', g2Rel: 'Mother', g2Phone: '212 555 0199', g2Email: '',
  emName: 'Ibrahim Diallo', emRel: 'Uncle', emPhone: '917 555 0147',
  paymentPlan: 'Monthly', monthlyTuition: 100, registrationFee: 100,
  tuitionPaidNow: 300, discount: 0, dueToday: 400, thenEachMonth: 100,
  rulesAcknowledged: 'Yes', policiesAgreed: 'Yes', mediaConsent: 'Yes',
  sigName: 'Mamadou Bah', signature: 'Mamadou Bah', sigDate: '2026-09-12'
};

const res = doPost({ postData: { contents: JSON.stringify(payload) } });
console.log('Apps Script replied:', res.getContent());
console.log('');
console.log('Rows written to the sheet:', written.length, '(one per child)');
console.log('');

headerRow.forEach((h, i) => {
  const a = String(written[0][i] === '' ? '-' : written[0][i]);
  const b = String(written[1][i] === '' ? '-' : written[1][i]);
  console.log('  ' + String(i + 1).padStart(2) + '  ' + h.padEnd(23) +
              a.slice(0, 26).padEnd(28) + b.slice(0, 26));
});
