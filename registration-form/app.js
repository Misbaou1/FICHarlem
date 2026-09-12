/*
 * FUTA Islamic School - registration form.
 *
 * Wording for both languages lives in text.js. The fields for each child are
 * cloned from the <template> at the foot of index.html.
 *
 * Everything is scoped to this IIFE so the page leaks nothing onto window;
 * TEXT is passed in to make the one dependency explicit.
 */
(function (TEXT) {
  'use strict';

  // Google Apps Script web app URL. Blank runs the form in local test mode:
  // it validates and confirms as normal but logs instead of sending.
  var ENDPOINT = '';

  var SCHOOL_YEAR = '2026-2027';
  var MIN_CHILDREN = 1;
  var MAX_CHILDREN = 10;
  var REGISTRATION_PER_CHILD = 50;
  var FULL_YEAR_DISCOUNT = 0.05;
  var SUBMIT_TIMEOUT_MS = 20000;
  var DRAFT_KEY = 'futa.registration.draft.v1';
  var LANG_KEY = 'futa.registration.lang';

  // Never restored from a draft. Agreeing to the rules and signing are acts the
  // parent has to perform deliberately each time, not something a saved draft
  // should tick on their behalf. 'website' is the spam trap.
  var SKIP_IN_DRAFT = ['rulesAck', 'signature', 'website'];

  // ---------------------------------------------------------------- money --
  // Rates come from the 2026-2027 Rules & Regulations: 1 child $60, 2 $100,
  // 3 $120, then $40 for each child beyond the third.
  function monthlyTuition(children) {
    if (children <= 0) return 0;
    if (children === 1) return 60;
    if (children === 2) return 100;
    if (children === 3) return 120;
    return 120 + (children - 3) * 40;
  }

  // Monthly plan: registration plus three months up front (the first month and
  // the final two), then nine regular payments. Full year: twelve months less
  // 5%; registration is never discounted.
  function quote(children, plan) {
    var monthly = monthlyTuition(children);
    var registration = REGISTRATION_PER_CHILD * children;

    if (plan === 'Full year') {
      var year = monthly * 12;
      var discount = Math.round(year * FULL_YEAR_DISCOUNT);
      return {
        monthly: monthly,
        registration: registration,
        tuitionNow: year - discount,
        discount: discount,
        dueToday: registration + year - discount,
        thenEachMonth: 0
      };
    }

    return {
      monthly: monthly,
      registration: registration,
      tuitionNow: monthly * 3,
      discount: 0,
      dueToday: registration + monthly * 3,
      thenEachMonth: monthly
    };
  }

  // ------------------------------------------------------------------ dom --
  var form = document.getElementById('registrationForm');
  var countInput = document.getElementById('studentCount');
  var cardHost = document.getElementById('studentsContainer');
  var cardTemplate = document.getElementById('studentTemplate');
  var statusLine = document.getElementById('statusMsg');
  var submitButton = document.getElementById('submitBtn');
  var successPanel = document.getElementById('successPanel');
  var decButton = document.getElementById('decBtn');
  var incButton = document.getElementById('incBtn');

  var lang = 'en';
  var cardSeq = 0;
  var sending = false;
  var dirty = false;

  function t(key) {
    return (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || '';
  }

  function fill(template, values) {
    return Object.keys(values).reduce(function (out, k) {
      return out.replace('{' + k + '}', values[k]);
    }, template);
  }

  function storage(fn, fallback) {
    // private browsing throws on access rather than returning null
    try { return fn(); } catch (err) { return fallback; }
  }

  // ------------------------------------------------------------------ i18n --
  // Pass a card to translate only that card, which is what happens after a
  // clone; pass nothing to redo the whole page.
  function translate(root) {
    var scope = root || document;

    scope.querySelectorAll('[data-t]').forEach(function (el) {
      var words = t(el.dataset.t);
      if (!words) return;

      // several labels carry a red asterisk in a child span; keep it
      var star = el.querySelector('.req');
      el.textContent = words;
      if (star) {
        el.appendChild(document.createTextNode(' '));
        el.appendChild(star);
      }
    });

    scope.querySelectorAll('[data-ph]').forEach(function (el) {
      el.placeholder = t(el.dataset.ph);
    });

    if (!root) {
      document.documentElement.lang = lang;
      renderFees();
    }
  }

  function setLanguage(next) {
    lang = next;
    document.querySelectorAll('.lang').forEach(function (b) {
      var on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    translate();
    storage(function () { return localStorage.setItem(LANG_KEY, lang); });
  }

  document.querySelectorAll('.lang').forEach(function (button) {
    button.addEventListener('click', function () {
      setLanguage(button.dataset.lang);
    });
  });

  // ---------------------------------------------------------- child cards --
  // Cards are added and removed one at a time rather than the list being
  // rebuilt, so a parent who changes the number of children keeps everything
  // already typed.
  function syncCards() {
    var target = parseInt(countInput.value, 10);
    if (isNaN(target)) target = MIN_CHILDREN;
    target = Math.min(MAX_CHILDREN, Math.max(MIN_CHILDREN, target));
    countInput.value = target;

    var cards = cardHost.querySelectorAll('.student-card');
    var i;

    for (i = cards.length; i < target; i++) addCard();
    for (i = cards.length - 1; i >= target; i--) cards[i].remove();

    refresh();
  }

  function addCard() {
    var fragment = cardTemplate.content.cloneNode(true);
    var card = fragment.querySelector('.student-card');
    var seq = ++cardSeq;

    // Radios only behave as one group when they share a name, and ids have to
    // be unique across the document, so everything gets stamped per card.
    card.querySelectorAll('.choices[data-name]').forEach(function (group) {
      var name = group.dataset.name + seq;
      group.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.name = name;
      });
    });

    wireLabels(card, seq);
    translate(card);
    cardHost.appendChild(card);
  }

  // The template cannot carry ids, so labels and their controls are joined up
  // here. Without this a screen reader reads the inputs out as unnamed.
  function wireLabels(card, seq) {
    var n = 0;

    card.querySelectorAll('.field').forEach(function (field) {
      n++;
      var error = field.querySelector('.error');
      var errorId = null;

      if (error) {
        errorId = 'err-' + seq + '-' + n;
        error.id = errorId;
      }

      var control = field.querySelector('input:not([type="radio"]), textarea');
      if (control) {
        control.id = 'fld-' + seq + '-' + n;
        var label = field.querySelector('label:not(.choice)');
        if (label) label.setAttribute('for', control.id);
        if (errorId) control.setAttribute('aria-describedby', errorId);
        return;
      }

      // radio group: the fieldset's legend names it, the error describes it
      var group = field.querySelector('.choices');
      if (group) {
        group.setAttribute('role', 'radiogroup');
        if (errorId) group.setAttribute('aria-describedby', errorId);
      }
    });
  }

  function childCount() {
    return cardHost.querySelectorAll('.student-card').length;
  }

  function refresh() {
    var cards = cardHost.querySelectorAll('.student-card');

    cards.forEach(function (card, i) {
      card.querySelector('.student-num').textContent = i + 1;
      // removing the only child makes no sense
      card.querySelector('.remove-btn').hidden = cards.length <= MIN_CHILDREN;
    });

    renderFees();
    decButton.disabled = cards.length <= MIN_CHILDREN;
    incButton.disabled = cards.length >= MAX_CHILDREN;
  }

  function selectedPlan() {
    var picked = form.querySelector('input[name="plan"]:checked');
    return picked ? picked.value : 'Monthly';
  }

  function renderFees() {
    var children = childCount();
    var monthlyPlan = quote(children, 'Monthly');
    var yearPlan = quote(children, 'Full year');
    var chosen = quote(children, selectedPlan());

    // both cards always show a price so the two can be compared
    document.getElementById('planMonthlyDue').textContent = '$' + monthlyPlan.dueToday;
    document.getElementById('planYearDue').textContent = '$' + yearPlan.dueToday;
    document.getElementById('planMonthlyAfter').textContent =
      fill(t('afterThat'), { monthly: monthlyPlan.monthly });

    document.getElementById('regFee').textContent = '$' + chosen.registration;
    document.getElementById('regBasis').textContent =
      children === 1 ? t('regOne') : fill(t('regMany'), { n: children });

    document.getElementById('tuitionNow').textContent = '$' + chosen.tuitionNow;
    document.getElementById('tuitionBasis').textContent =
      selectedPlan() === 'Full year'
        ? t('twelveMonths')
        : fill(t('threeMonths'), { monthly: '$' + chosen.monthly });

    document.getElementById('dueNow').textContent = '$' + chosen.dueToday;
  }

  incButton.addEventListener('click', function () {
    countInput.value = Math.min(MAX_CHILDREN, Number(countInput.value) + 1);
    syncCards();

    var cards = cardHost.querySelectorAll('.student-card');
    var last = cards[cards.length - 1];
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  decButton.addEventListener('click', function () {
    countInput.value = Math.max(MIN_CHILDREN, Number(countInput.value) - 1);
    syncCards();
  });

  // Cards come and go, so these listeners sit on the container.
  cardHost.addEventListener('click', function (e) {
    var button = e.target.closest('.remove-btn');
    if (!button) return;

    button.closest('.student-card').remove();
    countInput.value = childCount();
    refresh();
    saveDraft();
  });

  cardHost.addEventListener('change', function (e) {
    var el = e.target;

    if (el.dataset.field === 'dob') {
      el.closest('.student-card').querySelector('[data-field="age"]').value =
        ageOn(el.value);
    }

    if (el.classList.contains('toggle')) revealFollowUp(el);
  });

  // The Yes/No buttons open a follow-up box underneath.
  function revealFollowUp(radio) {
    var card = radio.closest('.student-card');
    var panel = card.querySelector('[data-panel="' + radio.dataset.reveals + '"]');
    var show = radio.value === 'Yes';

    panel.hidden = !show;
    if (show) return;

    // clear it, or a stale answer gets submitted after switching to No
    var box = panel.querySelector('textarea');
    box.value = '';
    box.classList.remove('invalid');
    box.removeAttribute('aria-invalid');
    panel.querySelector('.error').textContent = '';
  }

  function ageOn(dateString) {
    if (!dateString) return '';

    // parse as local midnight; bare yyyy-mm-dd is read as UTC and can land a
    // day early west of Greenwich
    var born = new Date(dateString + 'T00:00:00');
    if (isNaN(born)) return '';

    var today = new Date();
    var age = today.getFullYear() - born.getFullYear();
    var months = today.getMonth() - born.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < born.getDate())) age--;

    return age >= 0 ? String(age) : '';
  }

  // ------------------------------------------------------------ validation --
  function flagField(el, message) {
    var field = el.closest('.field') || el.closest('.plan-set');
    el.classList.add('invalid');
    el.setAttribute('aria-invalid', 'true');

    var slot = (field && field.querySelector('.error')) ||
               document.querySelector('[data-error-for="' + el.id + '"]');
    if (slot) slot.textContent = message;
  }

  function clearFieldError(el) {
    var field = el.closest('.field') || el.closest('.plan-set');
    if (!field) return;

    field.querySelectorAll('.invalid').forEach(function (node) {
      node.classList.remove('invalid');
      node.removeAttribute('aria-invalid');
    });
    field.classList.remove('invalid');

    var slot = field.querySelector('.error');
    if (slot) slot.textContent = '';
  }

  function clearAllErrors() {
    form.querySelectorAll('.invalid').forEach(function (el) {
      el.classList.remove('invalid');
      el.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('.error').forEach(function (el) {
      el.textContent = '';
    });
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function digitsIn(value) {
    return value.replace(/\D/g, '').length;
  }

  function validate() {
    clearAllErrors();

    var firstBad = null;
    function flag(el, message) {
      flagField(el, message);
      if (!firstBad) firstBad = el;
    }

    form.querySelectorAll('[required]').forEach(function (el) {
      if (el.closest('[hidden]')) return;

      var blank = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      if (blank) {
        flag(el, el.type === 'checkbox' ? t('errCheck') : t('errRequired'));
      }
    });

    form.querySelectorAll('.choices[data-required]').forEach(function (group) {
      if (group.closest('[hidden]')) return;
      if (group.querySelector('input:checked')) return;

      group.classList.add('invalid');
      group.setAttribute('aria-invalid', 'true');

      var holder = group.closest('.field') || group.closest('.plan-set');
      var slot = holder && holder.querySelector('.error');
      if (slot) slot.textContent = t('errPick');
      if (!firstBad) firstBad = group;
    });

    // the four agreement boxes share one message beneath them
    var policies = Array.prototype.slice.call(document.querySelectorAll('.policy'));
    var unticked = policies.filter(function (box) { return !box.checked; });
    if (unticked.length) {
      document.querySelector('[data-error-for="policies"]').textContent = t('errPolicies');
      if (!firstBad) firstBad = unticked[0];
    }

    ['g1Email', 'g2Email'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el.value.trim() && !looksLikeEmail(el.value.trim())) flag(el, t('errEmail'));
    });

    ['g1Phone', 'emPhone'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el.value.trim() && digitsIn(el.value) < 10) flag(el, t('errPhone'));
    });

    cardHost.querySelectorAll('[data-field="dob"]').forEach(function (el) {
      if (el.value && new Date(el.value) > new Date()) flag(el, t('errFuture'));
    });

    // catches initials or "same as above" in the signature box
    var printed = document.getElementById('sigName').value.trim().toLowerCase();
    var signed = document.getElementById('signature');
    if (signed.value.trim() && printed &&
        signed.value.trim().toLowerCase() !== printed) {
      flag(signed, t('errSignature'));
    }

    if (!firstBad) return true;

    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof firstBad.focus === 'function') firstBad.focus({ preventScroll: true });
    return false;
  }

  // --------------------------------------------------------------- payload --
  function value(id) {
    return document.getElementById(id).value.trim();
  }

  function chosen(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function readChildren() {
    return Array.prototype.map.call(
      cardHost.querySelectorAll('.student-card'),
      function (card) {
        var child = {};
        card.querySelectorAll('[data-field]').forEach(function (el) {
          var key = el.dataset.field;
          if (el.type === 'radio') {
            if (el.checked) child[key] = el.value;
            else if (!(key in child)) child[key] = '';
          } else {
            child[key] = el.value.trim();
          }
        });
        return child;
      }
    );
  }

  function buildPayload() {
    var children = readChildren();
    var plan = selectedPlan();
    var money = quote(children.length, plan);
    var allAgreed = Array.prototype.every.call(
      document.querySelectorAll('.policy'),
      function (box) { return box.checked; }
    );

    return {
      submittedAt: new Date().toISOString(),
      language: lang,
      academicYear: SCHOOL_YEAR,
      studentCount: children.length,
      students: children,

      g1Name: value('g1Name'),
      g1Rel: chosen('g1Rel'),
      g1Phone: value('g1Phone'),
      g1Email: value('g1Email'),
      g1Address: value('g1Address'),

      g2Name: value('g2Name'),
      g2Rel: chosen('g2Rel'),
      g2Phone: value('g2Phone'),
      g2Email: value('g2Email'),

      emName: value('emName'),
      emRel: value('emRel'),
      emPhone: value('emPhone'),

      paymentPlan: plan,
      monthlyTuition: money.monthly,
      registrationFee: money.registration,
      tuitionPaidNow: money.tuitionNow,
      discount: money.discount,
      dueToday: money.dueToday,
      thenEachMonth: money.thenEachMonth,

      rulesAcknowledged: document.getElementById('rulesAck').checked ? 'Yes' : 'No',
      policiesAgreed: allAgreed ? 'Yes' : 'No',
      mediaConsent: document.getElementById('noMedia').checked ? 'No' : 'Yes',

      sigName: value('sigName'),
      signature: value('signature'),
      sigDate: value('sigDate')
    };
  }

  // ----------------------------------------------------------------- draft --
  // A family with four children is a long form to lose to a stray back button
  // or a phone running out of battery, so keep a copy as they go.
  // The four .policy boxes have no id and so are never captured here, which is
  // intentional and matches SKIP_IN_DRAFT.
  function saveDraft() {
    if (sending) return;
    storage(function () {
      var snapshot = {
        count: childCount(),
        plan: selectedPlan(),
        children: readChildren(),
        fields: {}
      };
      form.querySelectorAll('input[id], textarea[id]').forEach(function (el) {
        if (el.closest('.student-card')) return;
        if (SKIP_IN_DRAFT.indexOf(el.id) !== -1) return;
        snapshot.fields[el.id] = el.type === 'checkbox' ? el.checked : el.value;
      });
      ['g1Rel', 'g2Rel'].forEach(function (n) { snapshot[n] = chosen(n); });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    });
  }

  function restoreDraft() {
    var raw = storage(function () { return localStorage.getItem(DRAFT_KEY); }, null);
    if (!raw) return false;

    var saved;
    try { saved = JSON.parse(raw); } catch (err) { return false; }
    if (!saved || !saved.children || !saved.children.length) return false;

    countInput.value = saved.children.length;
    syncCards();

    cardHost.querySelectorAll('.student-card').forEach(function (card, i) {
      var child = saved.children[i] || {};
      Object.keys(child).forEach(function (key) {
        if (!child[key]) return;
        var radio = card.querySelector(
          '[data-field="' + key + '"][value="' + CSS.escape(child[key]) + '"]');
        if (radio) {
          radio.checked = true;
          if (radio.classList.contains('toggle')) revealFollowUp(radio);
          return;
        }
        var el = card.querySelector('[data-field="' + key + '"]');
        if (el) el.value = child[key];
      });
    });

    Object.keys(saved.fields || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = saved.fields[id];
      else el.value = saved.fields[id];
    });

    ['g1Rel', 'g2Rel'].forEach(function (n) {
      if (!saved[n]) return;
      var el = form.querySelector('input[name="' + n + '"][value="' + CSS.escape(saved[n]) + '"]');
      if (el) el.checked = true;
    });

    if (saved.plan) {
      var plan = form.querySelector('input[name="plan"][value="' + CSS.escape(saved.plan) + '"]');
      if (plan) plan.checked = true;
    }

    refresh();
    return true;
  }

  function dropDraft() {
    storage(function () { return localStorage.removeItem(DRAFT_KEY); });
  }

  var saveTimer = null;
  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }

  form.addEventListener('input', function (e) {
    clearFieldError(e.target);
    scheduleSave();
  });

  form.addEventListener('change', function (e) {
    clearFieldError(e.target);
    if (e.target.name === 'plan') renderFees();
    scheduleSave();
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty || sending) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------------------------------------------------------------- submit --
  function send(payload) {
    // A plain string body keeps this a simple request; declaring a JSON
    // content-type triggers a preflight and Apps Script cannot answer OPTIONS.
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, SUBMIT_TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (result) {
        if (!result || result.result !== 'success') {
          throw new Error((result && result.message) || 'Rejected by the server');
        }
        return result;
      })
      .finally(function () { clearTimeout(timer); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    // a bot filling every field trips this; nobody sees it
    if (document.getElementById('website').value) return;

    if (!validate()) {
      statusLine.textContent = t('errTop');
      statusLine.className = 'status err';
      return;
    }

    var payload = buildPayload();

    sending = true;
    submitButton.disabled = true;
    submitButton.textContent = t('sending');
    statusLine.textContent = '';
    statusLine.className = 'status';

    if (!ENDPOINT) {
      window.console.log('No endpoint set. Would have sent:', payload);
      setTimeout(function () { showSuccess(payload); }, 500);
      return;
    }

    send(payload).then(function () {
      showSuccess(payload);
    }).catch(function (err) {
      window.console.error(err);
      sending = false;
      submitButton.disabled = false;
      submitButton.textContent = t('submit');
      statusLine.textContent = t('errSend');
      statusLine.className = 'status err';
      statusLine.focus();
    });
  });

  function showSuccess(payload) {
    var line = payload.studentCount === 1 ? t('doneOne') : t('doneMany');

    document.getElementById('successEmail').textContent = payload.g1Email;
    document.getElementById('successSummary').textContent =
      fill(line, { n: payload.studentCount, due: payload.dueToday });

    dirty = false;
    dropDraft();

    form.hidden = true;
    successPanel.hidden = false;
    successPanel.setAttribute('tabindex', '-1');
    successPanel.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('anotherBtn').addEventListener('click', function () {
    form.reset();
    cardHost.textContent = '';
    countInput.value = MIN_CHILDREN;
    syncCards();
    clearAllErrors();
    stampToday();

    sending = false;
    dirty = false;
    submitButton.disabled = false;
    submitButton.textContent = t('submit');
    statusLine.textContent = '';
    successPanel.hidden = true;
    form.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function stampToday() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('sigDate').value = local.toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------------ boot --
  var savedLang = storage(function () { return localStorage.getItem(LANG_KEY); }, null);
  setLanguage(savedLang && TEXT[savedLang] ? savedLang : 'en');

  stampToday();
  if (!restoreDraft()) syncCards();
})(window.TEXT);
