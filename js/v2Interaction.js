/**
 * v2Interaction.js — V2-CTA-INTERACTION-01: the CTA tools of the plan tab, driven by the server V2 state.
 *
 * Off unless CZ_V2_INTERACTION_ENABLED === true and the V2 strategy state is enabled (shadowDiagnosis.js).
 * Reads GET /v1/diagnoses/:id/user-choices, writes POST /v1/evaluations/:eid/user-choices. Strategy,
 * eligible debts, expense categories and amounts, caps and the resulting financial actions all come from
 * the server; the client only renders them and sends the user's choice. Debt names are display-only.
 *
 * Tools: expense widget (CONTENCION / MANTENIMIENTO without surplus), lower payment intent
 * (CONTENCION / REDUCCION_CARGA), surplus allocation (CONSOLIDACION / MANTENIMIENTO with surplus),
 * creditor contact step (REGULARIZACION). Amounts the user types are what they think they could cut,
 * never a reduction achieved.
 *
 * Also: the missing-data card of an incomplete V2 result (each reason -> existing V1/B1 editor), the
 * panorama view ui.js uses to let V2 own hero / next step, and the separate debt-management interest
 * opt-in (POST /v1/evaluations/:eid/debt-management-opt-in; hidden until its copy is configured).
 *
 * Depends on (browser): config.js (flags, parseHumanAmount), ui.js, shadowDiagnosis.js. Loads after
 * shadowDiagnosis.js, before app.js. Node: require() exposes the pure functions for tests.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CZV2Interaction = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  var PANEL_ID = "cz-v2-interaction";
  var EXPENSE_LABELS = {
    vivienda: "Vivienda",
    alimentacion: "Alimentación",
    servicios: "Servicios",
    transporte: "Transporte",
    salud: "Salud",
    educacion: "Educación",
    hijos_familia: "Hijos y familia",
    ocio: "Ocio y entretenimiento",
  };
  var RESERVE_LABELS = { emergency_fund: "un fondo de emergencia", planned_goal: "una meta planificada" };
  var RESERVE_OPTION_LABELS = { emergency_fund: "Fondo de emergencia", planned_goal: "Meta planificada" };
  var ERROR_TEXT = {
    AMOUNT_OUT_OF_RANGE: "El monto tiene que ser mayor a 0 y no puede superar el máximo indicado.",
    INVALID_AMOUNT: "Revisá el monto: usá punto para los miles y coma para los centavos (ej: 5.000 o 5.000,50).",
    EXPENSE_NOT_ELIGIBLE: "Este gasto ya no está disponible. Actualizá la página.",
    DEBT_NOT_ELIGIBLE: "Esta deuda ya no está disponible. Actualizá la página.",
    SURPLUS_NOT_AVAILABLE: "Ya no hay sobrante disponible. Actualizá la página.",
    NO_TARGET: "Elegí un destino para tu sobrante.",
  };
  var GENERIC_ERROR = "No pudimos guardar tu elección. Probá de nuevo en un momento.";
  var STRATEGIES = ["CONTENCION", "REGULARIZACION", "REDUCCION_CARGA", "CONSOLIDACION", "MANTENIMIENTO_OPTIMIZACION"];
  // Same format the server accepts for consent_text_version (userChoice/service.js VERSION_RE).
  var CONSENT_VERSION_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

  // Verification reasons (classifier catalog) -> existing V1/B1 mechanism. "person" reasons open a whole
  // screen; debt reasons open the existing editor of that debt (data-deuda-editar, app.js). Reasons with
  // no mechanism are listed as missing information without any input.
  var PERSON_REASONS = {
    EXPENSES_UNKNOWN: { text: "Faltan tus gastos mensuales.", action: "open-expenses", label: "Completar gastos" },
    DEBT_SET_INCOMPLETE: { text: "Falta confirmar si tenés deudas.", action: "open-debts", label: "Confirmar mis deudas" },
    NO_DEBTS_DECLARED_WITH_DEBTS: { text: "Indicaste que no tenés deudas, pero hay deudas registradas.", action: "open-debts", label: "Confirmar mis deudas" },
    INCOME_UNKNOWN: { text: "Falta tu ingreso mensual.", action: null },
    INCOME_PREFILL_UNCONFIRMED: { text: "Tu ingreso mensual vino precargado y todavía no lo confirmaste.", action: null },
  };
  var DEBT_REASONS = {
    DEBT_SITUATION_UNSURE: { text: "Falta indicar si está al día o atrasada.", editable: true },
    DEBT_SITUATION_MISSING: { text: "Falta indicar si está al día o atrasada.", editable: true },
    DEBT_BALANCE_UNKNOWN: { text: "Falta el saldo pendiente.", editable: true },
    DEBT_MORA_STATE_BALANCE_UNKNOWN: { text: "Falta el saldo pendiente.", editable: true },
    DEBT_PAYMENT_DECLARED_BALANCE_UNKNOWN: { text: "Falta el saldo pendiente.", editable: true },
    DEBT_BALANCE_ZERO_NOT_SETTLED: { text: "El saldo figura en 0 pero no está marcada como pagada.", editable: true },
    DEBT_MORA_STATE_BALANCE_ZERO: { text: "El saldo figura en 0 pero no está marcada como pagada.", editable: true },
    DEBT_PAYMENT_DECLARED_BALANCE_ZERO: { text: "El saldo figura en 0 pero no está marcada como pagada.", editable: true },
    DEBT_PAYMENT_UNKNOWN: { text: "Falta la cuota mensual.", editable: true },
    // shadow-02 only (legacy mora_reclamo / atrasado_pagando without a current payment): no input.
    DEBT_PAYMENT_ONLY_LAST_KNOWN: { text: "Falta la cuota mensual actual: solo tenemos el último pago.", editable: false },
    DEBT_PROBLEM_DECLARED_MORA_UNKNOWN: { text: "Falta información sobre su situación de pago.", editable: false },
  };
  var GENERIC_MISSING = "Falta información para completar tu diagnóstico.";
  var PENDING_NOTE = "Este dato todavía no se puede completar desde Mi Plan.";
  // shadow-03: a debt in reclamo / disputa is not missing data — no input, no correction, no pending note.
  var DISPUTE_CODE = "DEBT_IN_DISPUTE";
  var DISPUTE_TEXT = "Mi Plan no asigna automáticamente una estrategia financiera sobre esa deuda mientras esté en reclamo o disputa.";

  // ---------------------------------------------------------------- pure helpers

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return "$" + v.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function list(v) {
    return Array.isArray(v) ? v : [];
  }

  /** Catalog label, or "Otro gasto n" for custom:n (custom descriptions never reach the server). */
  function expenseLabel(ref) {
    if (Object.prototype.hasOwnProperty.call(EXPENSE_LABELS, ref)) return EXPENSE_LABELS[ref];
    var m = /^custom:([1-9][0-9]{0,3})$/.exec(String(ref));
    return m ? "Otro gasto " + m[1] : "Gasto";
  }

  /** Operative case of a user-choice state (null when there is nothing to offer). */
  function resolveInteractionCase(state) {
    if (!isObj(state) || state.classification_status !== "classified" || !isObj(state.action_context)) return null;
    var ac = state.action_context;
    var choices = isObj(state.choices) ? state.choices : {};
    switch (state.strategy) {
      case "CONTENCION":
        return list(choices.lower_payment_intent).length ? "CONTENCION_WITH_DEBT" : "CONTENCION_NO_ELIGIBLE_DEBT";
      case "MANTENIMIENTO_OPTIMIZACION":
        return isObj(ac.monthly_surplus) ? "MANTENIMIENTO_SURPLUS" : "MANTENIMIENTO_FLOW_ZERO";
      case "REGULARIZACION":
      case "REDUCCION_CARGA":
      case "CONSOLIDACION":
        return state.strategy;
      default:
        return null;
    }
  }

  /** Human amount (Uruguay format) -> number with at most 2 decimals, or an error code. */
  function parseAmountInput(raw) {
    var parsed;
    if (typeof root.parseHumanAmount === "function") {
      parsed = root.parseHumanAmount(raw);
    } else {
      var s = typeof raw === "string" ? raw.trim() : "";
      parsed = !s ? { status: "empty" } : /^\d+(\.\d{1,2})?$/.test(s) ? { status: "valid", value: Number(s) } : { status: "invalid" };
    }
    if (parsed.status === "empty") return { ok: false, error: "EMPTY" };
    if (parsed.status !== "valid") return { ok: false, error: "INVALID_AMOUNT" };
    return { ok: true, value: Math.round(parsed.value * 100) / 100 };
  }

  /** 0 < amount <= max (the server checks the same against the stored evaluation). */
  function validateAmount(raw, max) {
    var p = parseAmountInput(raw);
    if (!p.ok) return p;
    if (!(p.value > 0) || p.value > Number(max)) return { ok: false, error: "AMOUNT_OUT_OF_RANGE" };
    return p;
  }

  function withDiagnosis(body, diagnosisId) {
    if (diagnosisId) body.diagnosis_id = diagnosisId;
    return body;
  }

  var bodies = {
    expense: function (ref, amount, diagnosisId) {
      return withDiagnosis(amount == null
        ? { choice_type: "expense_reduction_intent", expense_ref: ref, state: "unmarked" }
        : { choice_type: "expense_reduction_intent", expense_ref: ref, state: "marked", amount: amount }, diagnosisId);
    },
    lower: function (debtIndex, state, diagnosisId) {
      return withDiagnosis({ choice_type: "lower_payment_intent", debt_index: debtIndex, state: state }, diagnosisId);
    },
    contact: function (debtIndex, state, diagnosisId) {
      return withDiagnosis({ choice_type: "creditor_contact_step", debt_index: debtIndex, state: state }, diagnosisId);
    },
    surplus: function (target, amount, diagnosisId) {
      var m = /^(debt|reserve):(.+)$/.exec(String(target || ""));
      if (!m) return null;
      if (m[1] === "debt") {
        var idx = Number(m[2]);
        if (!Number.isInteger(idx) || idx < 0) return null;
        return withDiagnosis({ choice_type: "surplus_to_debt", debt_index: idx, amount: amount }, diagnosisId);
      }
      if (!Object.prototype.hasOwnProperty.call(RESERVE_LABELS, m[2])) return null;
      return withDiagnosis({ choice_type: "surplus_reserve", destination: m[2], amount: amount }, diagnosisId);
    },
    /** Never sends a missing or malformed consent_text_version (null when it cannot be sent). */
    optIn: function (state, textVersion, diagnosisId) {
      if (state !== "opted_in" && state !== "withdrawn") return null;
      if (typeof textVersion !== "string" || !CONSENT_VERSION_RE.test(textVersion)) return null;
      return withDiagnosis({ state: state, consent_text_version: textVersion }, diagnosisId);
    },
  };

  /** Approved opt-in copy (config CZ_V2_DEBT_MANAGEMENT_OPTIN_COPY) or null when incomplete / absent. */
  function optInCopyOf(raw) {
    if (!isObj(raw) || typeof raw.text_version !== "string" || !CONSENT_VERSION_RE.test(raw.text_version)) return null;
    var keys = ["title", "body", "consent_label"];
    for (var i = 0; i < keys.length; i++) {
      if (typeof raw[keys[i]] !== "string" || !raw[keys[i]].trim()) return null;
    }
    return { text_version: raw.text_version, title: raw.title, body: raw.body, consent_label: raw.consent_label };
  }

  /**
   * What the plan tab shows from the current V2 strategy state (getCurrentV2Strategy()):
   * classified -> the V2 strategy owns the panorama; incomplete -> missing-data state; otherwise null (legacy).
   */
  function panoramaViewOf(v2) {
    if (!isObj(v2) || !v2.diagnosis_id || !isObj(v2.result) || v2.result.survey_version !== 2) return null;
    var r = v2.result;
    var id = String(v2.diagnosis_id);
    if (r.classification_status === "classified" && STRATEGIES.indexOf(r.strategy) !== -1) {
      return { kind: "classified", diagnosis_id: id, strategy: r.strategy, entry_reasons: list(r.reasons).slice(),
        key: "classified:" + id + ":" + r.strategy };
    }
    if (r.classification_status === "incomplete" && isObj(r.verification)) {
      var reasons = clone(list(r.verification.reasons));
      return { kind: "incomplete", diagnosis_id: id, verification_reasons: reasons,
        dispute_only: isDisputeOnly(reasons), key: "incomplete:" + id };
    }
    return null;
  }

  /** Incomplete only because of debts in reclamo / disputa: nothing for the user to complete. */
  function isDisputeOnly(reasons) {
    return reasons.length > 0 && reasons.every(function (r) { return isObj(r) && r.code === DISPUTE_CODE; });
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // ---------------------------------------------------------------- render (pure: state -> HTML)

  var S = {
    card: "margin:0 0 18px;padding:18px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);",
    title: "font-size:17px;font-weight:800;color:rgba(255,255,255,.95);margin:0 0 6px;",
    text: "font-size:14px;color:rgba(255,255,255,.7);line-height:1.5;margin:0 0 12px;",
    row: "padding:12px 0;border-top:1px solid rgba(255,255,255,.08);",
    label: "font-size:15px;font-weight:700;color:rgba(255,255,255,.92);",
    sub: "font-size:13px;color:rgba(255,255,255,.55);margin:2px 0 8px;",
    input: "width:100%;max-width:220px;box-sizing:border-box;padding:8px 10px;border-radius:10px;",
    btn: "margin:6px 8px 0 0;padding:8px 14px;border-radius:10px;border:1px solid rgba(64,215,255,.4);background:rgba(64,215,255,.12);color:#40d7ff;font-weight:700;cursor:pointer;",
    ghost: "margin:6px 8px 0 0;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:rgba(255,255,255,.75);font-weight:600;cursor:pointer;",
    ok: "font-size:13px;color:#7be495;margin:4px 0 0;",
    err: "font-size:13px;color:#ff8a8a;margin:6px 0 0;",
  };

  function errorLine(ui, key) {
    var code = ui && ui.errors ? ui.errors[key] : null;
    if (!code) return "";
    return '<div style="' + S.err + '" data-v2i-error="' + esc(key) + '">' + esc(ERROR_TEXT[code] || GENERIC_ERROR) + "</div>";
  }

  function declaredTotal(state) {
    return list(state.choices && state.choices.expense_reduction_intent).reduce(function (sum, c) {
      return c.state === "marked" && typeof c.amount === "number" ? Math.round((sum + c.amount) * 100) / 100 : sum;
    }, 0);
  }

  function renderExpenseWidget(state, kase, ui) {
    var categories = list(state.action_context.expense_categories);
    if (!categories.length) return "";
    var intents = {};
    list(state.choices.expense_reduction_intent).forEach(function (c) { intents[c.expense_ref] = c; });
    var gap = isObj(state.action_context.monthly_gap) ? state.action_context.monthly_gap : null;
    var intro;
    if (kase === "MANTENIMIENTO_FLOW_ZERO") {
      intro = "Hoy tus ingresos y tus gastos quedan parejos. Marcá los gastos donde creés que podrías recortar para generar margen, y cuánto por mes.";
    } else {
      intro = "Marcá los gastos donde creés que podrías recortar y cuánto por mes. Es lo que vos estimás, no un recorte ya hecho.";
    }
    var rows = categories.map(function (c) {
      var ref = String(c.expense_ref);
      var intent = intents[ref];
      var marked = intent && intent.state === "marked";
      return '<div style="' + S.row + '" data-v2i-row="expense" data-ref="' + esc(ref) + '">'
        + '<div style="' + S.label + '">' + esc(expenseLabel(ref)) + "</div>"
        + '<div style="' + S.sub + '">Gasto actual: ' + esc(money(c.amount)) + " por mes</div>"
        + (marked ? '<div style="' + S.ok + '">Pensás recortar ' + esc(money(intent.amount)) + " por mes.</div>" : "")
        + '<input type="text" inputmode="decimal" autocomplete="off" style="' + S.input + '" data-v2i-input="amount" value="" '
        + 'placeholder="¿Cuánto podrías recortar?" aria-label="Cuánto podrías recortar en ' + esc(expenseLabel(ref)) + '"/>'
        + "<div>"
        + '<button type="button" style="' + S.btn + '" data-v2i="expense-save" data-ref="' + esc(ref) + '">' + (marked ? "Cambiar monto" : "Guardar") + "</button>"
        + (marked ? '<button type="button" style="' + S.ghost + '" data-v2i="expense-remove" data-ref="' + esc(ref) + '">Quitar</button>' : "")
        + "</div>"
        + errorLine(ui, "expense:" + ref)
        + "</div>";
    }).join("");
    var total = declaredTotal(state);
    var summary = "";
    if (kase !== "MANTENIMIENTO_FLOW_ZERO" && gap) {
      summary = '<div style="' + S.text + 'margin-top:12px;" data-v2i-summary="gap">'
        + "Recorte que estimaste: " + esc(money(total)) + " por mes. "
        + "Diferencia actual entre ingresos y gastos: " + (gap.certainty === "lower_bound" ? "al menos " : "") + esc(money(gap.amount)) + " por mes."
        + "</div>";
    } else if (total > 0) {
      summary = '<div style="' + S.text + 'margin-top:12px;" data-v2i-summary="total">Recorte que estimaste: ' + esc(money(total)) + " por mes.</div>";
    }
    return '<section style="' + S.card + '" data-v2i-widget="expense">'
      + '<h3 style="' + S.title + '">' + (kase === "MANTENIMIENTO_FLOW_ZERO" ? "Generar margen en tus gastos" : "Recortar gastos") + "</h3>"
      + '<p style="' + S.text + '">' + intro + "</p>"
      + rows + summary + "</section>";
  }

  function renderLowerPayment(state, ctx, ui) {
    var debts = list(state.choices.lower_payment_intent);
    if (!debts.length) return "";
    var payments = {};
    list(state.action_context.active_debts).forEach(function (d) { payments[d.debt_index] = d.monthly_debt_payment; });
    var rows = debts.map(function (d) {
      var marked = d.state === "marked";
      return '<div style="' + S.row + '" data-v2i-row="lower" data-index="' + esc(d.debt_index) + '">'
        + '<div style="' + S.label + '">' + esc(ctx.debtLabel(d.debt_index)) + "</div>"
        + (typeof payments[d.debt_index] === "number" ? '<div style="' + S.sub + '">Cuota actual: ' + esc(money(payments[d.debt_index])) + " por mes</div>" : "")
        + (marked ? '<div style="' + S.ok + '">Vas a pedir una cuota más baja.</div>' : "")
        + '<button type="button" style="' + (marked ? S.ghost : S.btn) + '" data-v2i="lower" data-index="' + esc(d.debt_index) + '" data-state="'
        + (marked ? "unmarked" : "marked") + '">' + (marked ? "Ya no" : "Quiero pedir una cuota más baja") + "</button>"
        + errorLine(ui, "lower:" + d.debt_index)
        + "</div>";
    }).join("");
    return '<section style="' + S.card + '" data-v2i-widget="lower">'
      + '<h3 style="' + S.title + '">Pedir una cuota más baja</h3>'
      + '<p style="' + S.text + '">Marcá las deudas en las que querés pedirle al acreedor una cuota mensual más baja.</p>'
      + rows + "</section>";
  }

  function renderSurplus(state, ctx, ui) {
    var surplus = isObj(state.action_context.monthly_surplus) ? state.action_context.monthly_surplus.amount : null;
    if (!(typeof surplus === "number" && surplus > 0)) return "";
    var current = state.choices.surplus_allocation;
    var currentTarget = !isObj(current) ? ""
      : current.choice_type === "surplus_to_debt" ? "debt:" + current.debt_index : "reserve:" + current.destination;
    var options = ['<option value="" disabled' + (currentTarget ? "" : " selected") + ">Elegí un destino</option>"];
    list(state.choices.surplus_to_debt_targets).forEach(function (d) {
      var v = "debt:" + d.debt_index;
      options.push('<option value="' + esc(v) + '"' + (v === currentTarget ? " selected" : "") + ">Pagar más de " + esc(ctx.debtLabel(d.debt_index)) + "</option>");
    });
    Object.keys(RESERVE_OPTION_LABELS).forEach(function (k) {
      var v = "reserve:" + k;
      options.push('<option value="' + esc(v) + '"' + (v === currentTarget ? " selected" : "") + ">" + RESERVE_OPTION_LABELS[k] + "</option>");
    });
    var currentLine = "";
    if (isObj(current)) {
      currentLine = '<div style="' + S.ok + '">Elegiste destinar ' + esc(money(current.amount)) + " por mes a "
        + (current.choice_type === "surplus_to_debt" ? "pagar más de " + esc(ctx.debtLabel(current.debt_index)) : esc(RESERVE_LABELS[current.destination] || "una reserva"))
        + ".</div>";
    }
    return '<section style="' + S.card + '" data-v2i-widget="surplus">'
      + '<h3 style="' + S.title + '">Usar tu sobrante</h3>'
      + '<p style="' + S.text + '">Cada mes te quedan ' + esc(money(surplus)) + ". Elegí a qué destinar una parte o todo.</p>"
      + currentLine
      + '<div data-v2i-row="surplus">'
      + '<select style="' + S.input + 'max-width:320px;margin-bottom:8px;" data-v2i-input="target" aria-label="Destino del sobrante">' + options.join("") + "</select>"
      + '<input type="text" inputmode="decimal" autocomplete="off" style="' + S.input + '" data-v2i-input="amount" value="" placeholder="Monto por mes (hasta '
      + esc(money(surplus)) + ')" aria-label="Monto por mes"/>'
      + '<div><button type="button" style="' + S.btn + '" data-v2i="surplus-save">Guardar</button></div>'
      + errorLine(ui, "surplus")
      + "</div></section>";
  }

  function renderContact(state, ctx, ui) {
    var steps = list(state.choices.creditor_contact_step);
    if (!steps.length) return "";
    var rows = steps.map(function (s) {
      var i = s.debt_index;
      var status = s.state === "planned" ? "Vas a contactar al acreedor."
        : s.state === "contacted" ? "Ya contactaste al acreedor." : "";
      var buttons = "";
      if (s.state !== "planned") buttons += '<button type="button" style="' + S.btn + '" data-v2i="contact" data-index="' + esc(i) + '" data-state="planned">Voy a contactar al acreedor</button>';
      if (s.state !== "contacted") buttons += '<button type="button" style="' + S.btn + '" data-v2i="contact" data-index="' + esc(i) + '" data-state="contacted">Ya lo contacté</button>';
      if (s.state !== "none") buttons += '<button type="button" style="' + S.ghost + '" data-v2i="contact" data-index="' + esc(i) + '" data-state="none">Deshacer</button>';
      return '<div style="' + S.row + '" data-v2i-row="contact" data-index="' + esc(i) + '">'
        + '<div style="' + S.label + '">' + esc(ctx.debtLabel(i)) + "</div>"
        + (status ? '<div style="' + S.ok + '">' + status + "</div>" : "")
        + "<div>" + buttons + "</div>"
        + (s.state === "contacted"
          ? '<div style="' + S.sub + 'margin-top:8px;">Si cambió algo de esta deuda, podés actualizarla en '
            + '<button type="button" style="' + S.ghost + '" data-v2i="open-debts">Tus deudas</button></div>'
          : "")
        + errorLine(ui, "contact:" + i)
        + "</div>";
    }).join("");
    return '<section style="' + S.card + '" data-v2i-widget="contact">'
      + '<h3 style="' + S.title + '">Hablar con tus acreedores</h3>'
      + '<p style="' + S.text + '">Para ponerte al día, el primer paso es hablar con cada acreedor de las deudas atrasadas. Registrá en qué punto estás.</p>'
      + rows + "</section>";
  }

  function actionLine(a, ctx) {
    var p = a.params || {};
    switch (a.action_type) {
      case "LOWER_PAYMENT_REQUEST":
        return "Pedir una cuota más baja para " + esc(ctx.debtLabel(p.debt_index)) + " (hoy pagás " + esc(money(p.monthly_debt_payment)) + " por mes).";
      case "EXPENSE_REDUCTION_TARGET":
        return "Intentar recortar " + esc(money(p.target_reduction)) + " por mes en " + esc(expenseLabel(p.expense_ref)) + " (gasto actual " + esc(money(p.current_amount)) + ").";
      case "EXTRA_DEBT_PAYMENT":
        return "Destinar " + esc(money(p.amount)) + " por mes a pagar más de " + esc(ctx.debtLabel(p.debt_index)) + ".";
      case "MONTHLY_RESERVE":
        return "Reservar " + esc(money(p.amount)) + " por mes para " + esc(RESERVE_LABELS[p.destination] || "una reserva") + ".";
      default:
        return "";
    }
  }

  function renderNextSteps(state, ctx) {
    var lines = list(state.financial_actions).map(function (a) { return actionLine(a, ctx); }).filter(Boolean);
    list(state.choices.creditor_contact_step).forEach(function (s) {
      if (s.state === "planned") lines.push("Contactar al acreedor de " + esc(ctx.debtLabel(s.debt_index)) + ".");
      if (s.state === "contacted") lines.push("Contactaste al acreedor de " + esc(ctx.debtLabel(s.debt_index)) + ".");
    });
    if (!lines.length) return "";
    return '<section style="' + S.card + '" data-v2i-widget="next-steps">'
      + '<h3 style="' + S.title + '">Tus próximos pasos</h3>'
      + '<ul style="margin:0;padding-left:18px;">' + lines.map(function (l) {
        return '<li style="' + S.text + 'margin:0 0 6px;" data-v2i-step="1">' + l + "</li>";
      }).join("") + "</ul></section>";
  }

  /**
   * Debt-management interest: commercial and optional, outside "Tus próximos pasos". Hidden without an
   * approved copy (ctx.optInCopy). Offered when the evaluation has debts; kept while opted in so the
   * person can withdraw.
   */
  function renderOptIn(state, ctx, ui) {
    var copy = ctx.optInCopy;
    if (!copy) return "";
    var current = isObj(state.debt_management_opt_in) ? state.debt_management_opt_in.state : "none";
    var ac = state.action_context;
    var hasDebts = list(ac.active_debts).length > 0 || list(ac.mora_debts).length > 0;
    if (current !== "opted_in" && !hasDebts) return "";
    var inner;
    if (current === "opted_in") {
      inner = '<div style="' + S.ok + '" data-v2i-optin-state="opted_in">Registraste tu interés.</div>'
        + '<button type="button" style="' + S.ghost + '" data-v2i="optin" data-state="withdrawn">Retirar mi interés</button>';
    } else {
      inner = (current === "withdrawn" ? '<div style="' + S.sub + '" data-v2i-optin-state="withdrawn">Retiraste tu interés.</div>' : "")
        + '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:0 0 10px;">'
        + '<input type="checkbox" data-v2i-input="optin-consent" style="width:16px;height:16px;margin-top:1px;flex-shrink:0;accent-color:#40d7ff;cursor:pointer;">'
        + '<span style="font-size:12px;color:#c5cde0;line-height:1.45;">' + esc(copy.consent_label) + "</span></label>"
        + '<button type="button" style="' + S.btn + 'opacity:.45;" data-v2i="optin" data-state="opted_in" disabled>Registrar mi interés</button>';
    }
    return '<section style="' + S.card + '" data-v2i-widget="debt-optin" data-v2i-row="optin">'
      + '<h3 style="' + S.title + '">' + esc(copy.title) + "</h3>"
      + '<p style="' + S.text + '">' + esc(copy.body) + "</p>"
      + inner
      + errorLine(ui, "optin")
      + "</section>";
  }

  /**
   * Missing-data card for an incomplete V2 result: each verification reason points to the existing
   * mechanism that fixes it. The re-evaluation is the existing one (recalcDiagYGuardar / dashboard).
   * @param {object} result validated V2 result (classification_status incomplete)
   * @param {{ debtLabel: function(number): string }} [ctx]
   */
  function renderVerificationCard(result, ctx) {
    if (!isObj(result) || result.classification_status !== "incomplete" || !isObj(result.verification)) return "";
    var reasons = list(result.verification.reasons);
    if (!reasons.length) return "";
    ctx = ctx || {};
    var label = typeof ctx.debtLabel === "function" ? ctx.debtLabel : function (i) { return "Deuda #" + (Number(i) + 1); };
    var personRows = [];
    var seenPerson = {};
    var debtOrder = [];
    var debts = {};
    reasons.forEach(function (r) {
      if (r.subject === "debt" && typeof r.debt_index === "number") {
        var i = r.debt_index;
        if (!debts[i]) {
          debts[i] = [];
          debtOrder.push(i);
        }
        debts[i].push(r.code);
        return;
      }
      var def = PERSON_REASONS[r.code];
      var key = def ? r.code : "GENERIC";
      if (seenPerson[key]) return;
      seenPerson[key] = true;
      var text = def ? def.text : GENERIC_MISSING;
      var action = def && def.action;
      personRows.push('<div style="' + S.row + '" data-v2i-verify="' + esc(key) + '">'
        + '<div style="' + S.label + '">' + esc(text) + "</div>"
        + (action
          ? '<button type="button" style="' + S.btn + '" data-v2i="' + action + '">' + esc(def.label) + "</button>"
          : '<div style="' + S.sub + '" data-v2i-pending="1">' + PENDING_NOTE + "</div>")
        + "</div>");
    });
    var debtRows = debtOrder.map(function (i) {
      var codes = debts[i];
      var moraReclamo = codes.indexOf("DEBT_PROBLEM_DECLARED_MORA_UNKNOWN") !== -1;
      var dispute = codes.indexOf(DISPUTE_CODE) !== -1;
      var lines = [];
      var editable = false;
      var pending = false;
      codes.forEach(function (code) {
        if (code === DISPUTE_CODE) return;
        var def = DEBT_REASONS[code];
        // mora_reclamo also emits DEBT_PAYMENT_UNKNOWN: same pending payment contract, no input.
        var canEdit = !!def && def.editable && !(code === "DEBT_PAYMENT_UNKNOWN" && moraReclamo);
        var text = def ? def.text : GENERIC_MISSING;
        if (code === "DEBT_PAYMENT_UNKNOWN" && moraReclamo) text = DEBT_REASONS.DEBT_PROBLEM_DECLARED_MORA_UNKNOWN.text;
        if (canEdit) editable = true;
        else pending = true;
        if (lines.indexOf(text) === -1) lines.push(text);
      });
      return '<div style="' + S.row + '" data-v2i-verify="debt" data-index="' + esc(i) + '">'
        + '<div style="' + S.label + '">' + esc(label(i)) + "</div>"
        + (dispute ? '<div style="' + S.sub + 'margin:2px 0;" data-v2i-dispute="1">' + esc(DISPUTE_TEXT) + "</div>" : "")
        + lines.map(function (t) { return '<div style="' + S.sub + 'margin:2px 0;">' + esc(t) + "</div>"; }).join("")
        + (pending ? '<div style="' + S.sub + '" data-v2i-pending="1">' + PENDING_NOTE + "</div>" : "")
        + (editable ? '<button type="button" style="' + S.btn + '" data-deuda-editar="' + esc(i) + '">Editar esta deuda</button>' : "")
        + "</div>";
    });
    if (isDisputeOnly(reasons)) {
      return '<section style="' + S.card + '" data-v2i-widget="verification" data-v2i-outcome="dispute">'
        + '<h3 style="' + S.title + '">Deuda en reclamo o disputa</h3>'
        + debtRows.join("")
        + "</section>";
    }
    return '<section style="' + S.card + '" data-v2i-widget="verification">'
      + '<h3 style="' + S.title + '">Qué datos faltan</h3>'
      + '<p style="' + S.text + '">Completá estos datos para terminar tu diagnóstico.</p>'
      + personRows.join("") + debtRows.join("")
      + "</section>";
  }

  /**
   * @param {object} state public GET user-choices state
   * @param {{ debtLabel: function(number): string, optInCopy?: object }} ctx
   * @param {{ errors?: object }} [ui]
   */
  function renderPanel(state, ctx, ui) {
    var kase = resolveInteractionCase(state);
    if (!kase) return "";
    ctx = ctx || {};
    if (typeof ctx.debtLabel !== "function") ctx.debtLabel = function (i) { return "Deuda #" + (Number(i) + 1); };
    var parts = [];
    if (kase === "CONTENCION_WITH_DEBT") {
      parts.push('<p style="' + S.text + '" data-v2i-note="two-levers">Tenés dos caminos para achicar la diferencia: bajar alguna cuota y recortar gastos. '
        + "Podés usar uno o los dos; ninguno por sí solo asegura cubrirla.</p>");
    }
    parts.push(renderLowerPayment(state, ctx, ui));
    parts.push(renderExpenseWidget(state, kase, ui));
    parts.push(renderSurplus(state, ctx, ui));
    parts.push(renderContact(state, ctx, ui));
    parts.push(renderNextSteps(state, ctx));
    parts.push(renderOptIn(state, ctx, ui));
    return '<div data-v2i-case="' + esc(kase) + '">' + parts.join("") + "</div>";
  }

  // ---------------------------------------------------------------- browser glue

  var cache = { diagnosisId: null, state: null, incomplete: null, loading: false, loadError: false, errors: {}, busy: false, token: 0 };
  // Panorama key the plan tab was last rendered with (ui.js); refresh() re-renders the tab when it changes.
  var renderedViewKey = null;

  function readFlag(name) {
    try {
      if (typeof root[name] !== "undefined") return root[name];
    } catch (_e) {}
    return undefined;
  }

  function shadow() {
    return root.CZShadowDiagnosis || null;
  }

  function isEnabled() {
    var sd = shadow();
    return readFlag("CZ_V2_INTERACTION_ENABLED") === true && !!sd &&
      typeof sd.isV2StrategyStateEnabled === "function" && sd.isV2StrategyStateEnabled() === true &&
      typeof sd.getApiBaseUrl === "function" && !!sd.getApiBaseUrl();
  }

  function anonymousId() {
    var id = root.CZIdentity && root.CZIdentity.anonymous_id;
    if (!id) {
      try {
        id = root.localStorage.getItem("cz_anonymous_id");
      } catch (_e) {}
    }
    return id ? String(id) : null;
  }

  function currentV2() {
    var sd = shadow();
    return sd && typeof sd.getCurrentV2Strategy === "function" ? sd.getCurrentV2Strategy() : null;
  }

  /** Panorama view of the current V2 state; null when disabled or without a current valid V2 result. */
  function currentPanoramaView() {
    if (!isEnabled()) return null;
    return panoramaViewOf(currentV2());
  }

  /** ui.js renderTabPlan(): remember which V2 view the legacy tab was rendered with. */
  function markRendered(view) {
    renderedViewKey = view && view.key ? view.key : null;
  }

  function optInCopy() {
    return optInCopyOf(readFlag("CZ_V2_DEBT_MANAGEMENT_OPTIN_COPY"));
  }

  function debtLabel(i) {
    var st = root.CZState;
    var d = st && Array.isArray(st.deudas) ? st.deudas[i] : null;
    if (d && typeof root._deudaDisplayName === "function") {
      try {
        return String(root._deudaDisplayName(d, i));
      } catch (_e) {}
    }
    return "Deuda #" + (Number(i) + 1);
  }

  function requestJson(method, path, body) {
    var anon = anonymousId();
    if (!anon) return Promise.reject(new Error("NO_ANONYMOUS_ID"));
    var headers = { "X-MiPlan-Anonymous-Id": anon };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return root.fetch(shadow().getApiBaseUrl() + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        return { ok: res.ok, status: res.status, json: json };
      });
    });
  }

  function panelEl() {
    return root.document ? root.document.getElementById(PANEL_ID) : null;
  }

  function removePanel() {
    var p = panelEl();
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  function render() {
    var p = panelEl();
    if (!p) return;
    if (cache.incomplete) {
      p.innerHTML = renderVerificationCard(cache.incomplete, { debtLabel: debtLabel });
      return;
    }
    if (!cache.state) {
      p.innerHTML = cache.loadError
        ? '<section style="' + S.card + '"><p style="' + S.text + '">No pudimos cargar tus herramientas. </p>'
          + '<button type="button" style="' + S.ghost + '" data-v2i="retry">Reintentar</button></section>'
        : "";
      return;
    }
    p.innerHTML = renderPanel(cache.state, { debtLabel: debtLabel, optInCopy: optInCopy() }, { errors: cache.errors });
  }

  function load() {
    var id = cache.diagnosisId;
    var token = ++cache.token;
    cache.loading = true;
    cache.loadError = false;
    return requestJson("GET", "/v1/diagnoses/" + encodeURIComponent(id) + "/user-choices")
      .then(function (r) {
        if (token !== cache.token || id !== cache.diagnosisId) return;
        cache.loading = false;
        if (r.ok && isObj(r.json) && r.json.evaluation_id) cache.state = r.json;
        else cache.loadError = true;
        render();
      })
      .catch(function () {
        if (token !== cache.token) return;
        cache.loading = false;
        cache.loadError = true;
        render();
      });
  }

  function send(key, body, endpoint) {
    if (!cache.state || cache.busy || !body) return Promise.resolve();
    cache.busy = true;
    var id = cache.diagnosisId;
    return requestJson("POST", "/v1/evaluations/" + encodeURIComponent(cache.state.evaluation_id) + "/" + (endpoint || "user-choices"), body)
      .then(function (r) {
        cache.busy = false;
        if (id !== cache.diagnosisId) return;
        if (r.ok) {
          delete cache.errors[key];
          return load();
        }
        cache.errors[key] = (r.json && r.json.error) || "GENERIC";
        render();
      })
      .catch(function () {
        cache.busy = false;
        cache.errors[key] = "GENERIC";
        render();
      });
  }

  function rowInput(btn, name) {
    var row = btn.closest("[data-v2i-row]");
    return row ? row.querySelector('[data-v2i-input="' + name + '"]') : null;
  }

  function onClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-v2i]") : null;
    if (!btn) return;
    var kind = btn.getAttribute("data-v2i");
    if (kind === "retry") return load();
    if (kind === "open-debts") {
      if (typeof root.switchTab === "function") root.switchTab("deudas");
      return;
    }
    if (kind === "open-expenses") {
      if (typeof root.goToEditGastosFromDashboard === "function") root.goToEditGastosFromDashboard();
      return;
    }
    if (!cache.state) return;
    var diag = cache.diagnosisId;
    var idx = Number(btn.getAttribute("data-index"));
    if (kind === "expense-save" || kind === "expense-remove") {
      var ref = btn.getAttribute("data-ref");
      var key = "expense:" + ref;
      if (kind === "expense-remove") return send(key, bodies.expense(ref, null, diag));
      var cat = list(cache.state.action_context.expense_categories).filter(function (c) { return c.expense_ref === ref; })[0];
      var input = rowInput(btn, "amount");
      var v = validateAmount(input ? input.value : "", cat ? cat.amount : 0);
      if (!v.ok) {
        cache.errors[key] = v.error === "EMPTY" ? "INVALID_AMOUNT" : v.error;
        return render();
      }
      return send(key, bodies.expense(ref, v.value, diag));
    }
    if (kind === "lower") return send("lower:" + idx, bodies.lower(idx, btn.getAttribute("data-state"), diag));
    if (kind === "contact") return send("contact:" + idx, bodies.contact(idx, btn.getAttribute("data-state"), diag));
    if (kind === "surplus-save") {
      var target = rowInput(btn, "target");
      var amountEl = rowInput(btn, "amount");
      var surplus = cache.state.action_context.monthly_surplus ? cache.state.action_context.monthly_surplus.amount : 0;
      var sv = validateAmount(amountEl ? amountEl.value : "", surplus);
      var body = sv.ok ? bodies.surplus(target ? target.value : "", sv.value, diag) : null;
      if (!body) {
        cache.errors.surplus = sv.ok ? "NO_TARGET" : sv.error === "EMPTY" ? "INVALID_AMOUNT" : sv.error;
        return render();
      }
      return send("surplus", body);
    }
    if (kind === "optin") {
      var copy = optInCopy();
      var optState = btn.getAttribute("data-state");
      if (optState === "opted_in") {
        var consent = rowInput(btn, "optin-consent");
        if (!consent || !consent.checked) return;
      }
      return send("optin", bodies.optIn(optState, copy ? copy.text_version : null, diag), "debt-management-opt-in");
    }
  }

  /** Opt-in checkbox enables / disables its button (same pattern as the legacy MiDeuda card). */
  function onChange(e) {
    var el = e.target;
    if (!el || !el.getAttribute || el.getAttribute("data-v2i-input") !== "optin-consent") return;
    var row = el.closest("[data-v2i-row]");
    var btn = row ? row.querySelector('[data-v2i="optin"][data-state="opted_in"]') : null;
    if (!btn) return;
    btn.disabled = !el.checked;
    btn.style.opacity = el.checked ? "1" : ".45";
  }

  /** Called by ui.js renderTab() after the plan tab is rendered. No DOM change unless enabled. */
  function mount(container) {
    if (!isEnabled()) {
      removePanel();
      return;
    }
    var v2 = currentV2();
    var view = panoramaViewOf(v2);
    if (!view || !container) {
      removePanel();
      return;
    }
    // ui.js leaves a slot right after the hero when V2 owns the panorama; top of the tab otherwise.
    var host = container.querySelector ? container.querySelector("[data-v2i-slot]") : null;
    var p = panelEl();
    var created = false;
    if (!p || p.parentNode !== (host || container)) {
      removePanel();
      p = root.document.createElement("div");
      p.id = PANEL_ID;
      p.addEventListener("click", onClick);
      p.addEventListener("change", onChange);
      if (host) host.appendChild(p);
      else container.insertBefore(p, container.firstChild);
      created = true;
    }
    if (view.kind === "incomplete") {
      cache = { diagnosisId: null, state: null, incomplete: v2.result, loading: false, loadError: false, errors: {}, busy: false, token: cache.token + 1 };
      render();
      return;
    }
    if (cache.diagnosisId !== view.diagnosis_id) {
      cache = { diagnosisId: view.diagnosis_id, state: null, incomplete: null, loading: false, loadError: false, errors: {}, busy: false, token: cache.token + 1 };
      render();
      load();
      return;
    }
    // Same diagnosis and panel still mounted: keep it as is (amounts being typed survive).
    if (created) render();
  }

  /** Called when the V2 strategy state changes (shadowDiagnosis.js). */
  function refresh() {
    if (!isEnabled()) {
      removePanel();
      return;
    }
    var st = root.CZState;
    if (!st || st.step !== 3 || (st.tab || "plan") !== "plan" || !root.document) return;
    var view = currentPanoramaView();
    var key = view ? view.key : null;
    // The legacy tab was rendered for another V2 view (or none): re-render it; renderTab() mounts again.
    if (key !== renderedViewKey && root.CredizonaUI && typeof root.CredizonaUI.renderTab === "function") {
      root.CredizonaUI.renderTab();
      return;
    }
    mount(root.document.getElementById("tab-content"));
  }

  return {
    PANEL_ID: PANEL_ID,
    expenseLabel: expenseLabel,
    resolveInteractionCase: resolveInteractionCase,
    parseAmountInput: parseAmountInput,
    validateAmount: validateAmount,
    bodies: bodies,
    renderPanel: renderPanel,
    renderVerificationCard: renderVerificationCard,
    panoramaViewOf: panoramaViewOf,
    optInCopyOf: optInCopyOf,
    isEnabled: isEnabled,
    currentPanoramaView: currentPanoramaView,
    markRendered: markRendered,
    mount: mount,
    refresh: refresh,
  };
});
