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
  };

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
    list(state.action_context.active_debts).forEach(function (d) {
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
   * @param {object} state public GET user-choices state
   * @param {{ debtLabel: function(number): string }} ctx
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
    return '<div data-v2i-case="' + esc(kase) + '">' + parts.join("") + "</div>";
  }

  // ---------------------------------------------------------------- browser glue

  var cache = { diagnosisId: null, state: null, loading: false, loadError: false, errors: {}, busy: false, token: 0 };

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

  function currentDiagnosisId() {
    var sd = shadow();
    var v2 = sd && typeof sd.getCurrentV2Strategy === "function" ? sd.getCurrentV2Strategy() : null;
    return v2 && v2.diagnosis_id && v2.result && v2.result.strategy ? String(v2.diagnosis_id) : null;
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
    if (!cache.state) {
      p.innerHTML = cache.loadError
        ? '<section style="' + S.card + '"><p style="' + S.text + '">No pudimos cargar tus herramientas. </p>'
          + '<button type="button" style="' + S.ghost + '" data-v2i="retry">Reintentar</button></section>'
        : "";
      return;
    }
    p.innerHTML = renderPanel(cache.state, { debtLabel: debtLabel }, { errors: cache.errors });
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

  function send(key, body) {
    if (!cache.state || cache.busy || !body) return Promise.resolve();
    cache.busy = true;
    var id = cache.diagnosisId;
    return requestJson("POST", "/v1/evaluations/" + encodeURIComponent(cache.state.evaluation_id) + "/user-choices", body)
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
    if (!btn || !cache.state) {
      if (btn && btn.getAttribute("data-v2i") === "retry") load();
      return;
    }
    var kind = btn.getAttribute("data-v2i");
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
    if (kind === "open-debts" && typeof root.switchTab === "function") root.switchTab("deudas");
  }

  /** Called by ui.js renderTab() after the plan tab is rendered. No DOM change unless enabled. */
  function mount(container) {
    if (!isEnabled()) {
      removePanel();
      return;
    }
    var diagnosisId = currentDiagnosisId();
    if (!diagnosisId || !container) {
      removePanel();
      return;
    }
    var p = panelEl();
    var created = false;
    if (!p || p.parentNode !== container) {
      removePanel();
      p = root.document.createElement("div");
      p.id = PANEL_ID;
      p.addEventListener("click", onClick);
      container.insertBefore(p, container.firstChild);
      created = true;
    }
    if (cache.diagnosisId !== diagnosisId) {
      cache = { diagnosisId: diagnosisId, state: null, loading: false, loadError: false, errors: {}, busy: false, token: cache.token + 1 };
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
    isEnabled: isEnabled,
    mount: mount,
    refresh: refresh,
  };
});
