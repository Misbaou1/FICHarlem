// Backend for the FUTA Islamic School registration form.
// Paste this into Extensions > Apps Script on a Google Sheet, then deploy it
// as a web app. Setup steps are in README.md.
//
// One row per child. The family details repeat on each row and siblings from
// the same submission share a Registration ID, so the sheet can be sorted by
// class level or age and still show who to call.

var SHEET_NAME = 'Registrations';

// Put an address here to get an email on every submission. Leave '' for none.
var NOTIFY_EMAIL = '';

var HEADERS = [
  'Timestamp', 'Registration ID', 'School Year', 'Language',
  'Child #', 'Children in Family',
  'Child Full Name', 'Date of Birth', 'Age', 'Gender', 'Class Level',
  'Dismissal', 'Allergies?', 'Allergy Details',
  'Health/Learning Needs?', 'Details', 'Previous School', 'Afterschool Program',
  'Parent 1 Name', 'Parent 1 Relationship', 'Parent 1 Phone',
  'Parent 1 Email', 'Parent 1 Address',
  'Parent 2 Name', 'Parent 2 Relationship', 'Parent 2 Phone', 'Parent 2 Email',
  'Emergency Name', 'Emergency Relationship', 'Emergency Phone',
  'Payment Plan', 'Monthly Tuition', 'Registration Fee', 'Tuition Paid Now',
  'Discount', 'Due Today', 'Then Each Month',
  'Rules Agreed', 'Policies Agreed', 'Photo Consent',
  'Signed By', 'Signature', 'Signature Date'
];

function doPost(e) {
  // stops two families landing on the same row if they submit together
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    var regId = 'REG-' + Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var stamp = new Date();
    var kids = data.students || [];
    var rows = [];

    for (var i = 0; i < kids.length; i++) {
      var s = kids[i];
      rows.push([
        stamp, regId, data.academicYear || '', data.language || '',
        i + 1, kids.length,
        s.fullName || '', s.dob || '', s.age || '', s.gender || '', s.level || '',
        s.dismissal || '', s.hasAllergies || '', s.allergyDetails || '',
        s.hasMedical || '', s.medicalDetails || '', s.prevSchool || '', s.afterschool || '',
        data.g1Name || '', data.g1Rel || '', data.g1Phone || '',
        data.g1Email || '', data.g1Address || '',
        data.g2Name || '', data.g2Rel || '', data.g2Phone || '', data.g2Email || '',
        data.emName || '', data.emRel || '', data.emPhone || '',
        data.paymentPlan || '', data.monthlyTuition || '', data.registrationFee || '',
        data.tuitionPaidNow || '', data.discount || 0, data.dueToday || '',
        data.thenEachMonth || 0,
        data.rulesAcknowledged || '', data.policiesAgreed || '', data.mediaConsent || '',
        data.sigName || '', data.signature || '', data.sigDate || ''
      ]);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
           .setValues(rows);
    }

    if (NOTIFY_EMAIL) notify_(data, regId);

    return json_({ result: 'success', registrationId: regId, rows: rows.length });

  } catch (err) {
    return json_({ result: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Open the /exec URL in a browser to check the deployment is live.
function doGet() {
  return json_({ result: 'success', message: 'FUTA registration endpoint is live.' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#1d5c33')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
  }
  return sheet;
}

function notify_(data, regId) {
  var names = (data.students || []).map(function (s) { return s.fullName; }).join(', ');
  var body =
    'New registration: ' + regId + '\n\n' +
    'Children (' + data.studentCount + '): ' + names + '\n' +
    'Parent: ' + data.g1Name + ' - ' + data.g1Phone + ' - ' + data.g1Email + '\n' +
    'Plan: ' + data.paymentPlan + '\n' +
    'Due today: $' + data.dueToday + '\n';

  MailApp.sendEmail(NOTIFY_EMAIL, 'New registration - ' + data.g1Name, body);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
