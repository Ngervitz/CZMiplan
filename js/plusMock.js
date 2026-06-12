/**
 * Mi Plan Plus V2 — design mock (P1b)
 * Review-only sandbox. Does not mutate CZState, plan, debt, or localStorage.
 */
(function(global) {
  "use strict";

  /** Review build only — set false before production release. */
  var PLUS_MOCK_MODE = true;

  /** Single source for Plus mock price display — edit here only. */
  var CZ_PLUS_PRICE_DISPLAY = "UYU 1.290 IVA incluido";

  var PLUS_MOCK_DATA = {
    peor: {
      verificationResult: {
        emoji: "🔴",
        status: "Requiere atención adicional",
        message: "Detectamos diferencias relevantes entre la información declarada y los registros consultados.",
      },
      coincidence: {
        label: "Coincidencia parcial",
        pct: 72,
        message: "Comparamos la información declarada con registros consultados y encontramos diferencias relevantes.",
      },
      diagnosis: {
        inicialPlan: 2,
        verificadoPlan: 4,
        message: "Tu diagnóstico cambió debido a información adicional detectada en registros consultados.",
      },
      hallazgos: [
        "Detectamos 3 obligaciones no consideradas inicialmente",
        "Existen registros de mora en 2 acreedores",
        "El endeudamiento total es superior al estimado",
        "Tu principal riesgo es la dispersión de deuda",
      ],
      diferencias: [
        { concepto: "Plan", declarado: "2", verificado: "4" },
        { concepto: "Acreedores", declarado: "2", verificado: "5" },
        { concepto: "Deuda total", declarado: "$300.000", verificado: "$890.000" },
        { concepto: "Mora", declarado: "No", verificado: "Sí" },
        { concepto: "Productos", declarado: "2", verificado: "6" },
      ],
      prioridades: [
        "Regularizar mora con acreedor principal",
        "Revisar deudas no declaradas",
        "Evaluar consolidación de obligaciones",
      ],
      iaPreview: [
        "El cruce entre tu declaración y los registros consultados muestra un perfil más expuesto de lo estimado inicialmente.",
        "Las moras activas y las obligaciones no declaradas concentran el riesgo principal: conviene priorizar regularización antes de nuevas consultas crediticias.",
        "Un plan verificado con foco en consolidación y pagos al día puede mejorar la percepción de tu situación en futuras evaluaciones.",
      ],
    },
    similar: {
      verificationResult: {
        emoji: "🟡",
        status: "Coincide con lo estimado",
        message: "La información declarada coincide ampliamente con los registros consultados.",
      },
      coincidence: {
        label: "Alta coincidencia",
        pct: 91,
        message: "Tu percepción coincide ampliamente con los registros consultados.",
      },
      diagnosis: {
        inicialPlan: 3,
        verificadoPlan: 3,
        message: "Tu diagnóstico se mantiene consistente con los registros consultados.",
      },
      hallazgos: [
        "La información declarada coincide con los registros",
        "No se detectaron obligaciones adicionales relevantes",
        "Los montos declarados son consistentes",
        "Tu perfil muestra estabilidad en los registros",
      ],
      diferencias: [
        { concepto: "Plan", declarado: "3", verificado: "3" },
        { concepto: "Acreedores", declarado: "3", verificado: "3" },
        { concepto: "Deuda total", declarado: "$450.000", verificado: "$470.000" },
        { concepto: "Mora", declarado: "No", verificado: "No" },
        { concepto: "Productos", declarado: "3", verificado: "3" },
      ],
      prioridades: [
        "Mantener pagos al día",
        "Continuar con el plan de reducción actual",
        "Monitorear registros periódicamente",
      ],
      iaPreview: [
        "Los registros consultados confirman la foto general que declaraste, con variaciones menores en montos.",
        "No aparecen obligaciones ocultas relevantes ni moras nuevas: tu perfil verificado respalda la estrategia actual.",
        "El siguiente paso es sostener el ritmo de pagos y revisar el plan trimestralmente para mantener la alineación.",
      ],
    },
    mejor: {
      verificationResult: {
        emoji: "🟢",
        status: "Mejor de lo esperado",
        message: "Los registros muestran una situación más favorable de la estimada inicialmente.",
      },
      coincidence: {
        label: "Alta coincidencia",
        pct: 94,
        message: "Los registros muestran una situación mejor de la estimada inicialmente.",
      },
      diagnosis: {
        inicialPlan: 4,
        verificadoPlan: 2,
        message: "Los registros muestran una situación más favorable de la estimada inicialmente.",
      },
      hallazgos: [
        "Algunos registros de deuda ya no están activos",
        "No se detectaron moras en registros consultados",
        "Tu endeudamiento real es inferior al estimado",
        "Tu perfil verificado es más favorable de lo esperado",
      ],
      diferencias: [
        { concepto: "Plan", declarado: "4", verificado: "2" },
        { concepto: "Acreedores", declarado: "4", verificado: "2" },
        { concepto: "Deuda total", declarado: "$600.000", verificado: "$280.000" },
        { concepto: "Mora", declarado: "Sí", verificado: "No" },
        { concepto: "Productos", declarado: "4", verificado: "2" },
      ],
      prioridades: [
        "Aprovechar la mejora de perfil para revisar condiciones",
        "Considerar solicitud de crédito con perfil actualizado",
        "Mantener el orden financiero actual",
      ],
      iaPreview: [
        "Los registros consultados reflejan una situación más ordenada que la estimada en tu diagnóstico inicial.",
        "Deudas cerradas y ausencia de moras activas abren margen para renegociar condiciones o planificar un nuevo objetivo financiero.",
        "Conviene documentar esta mejora y mantener el comportamiento de pago que la sustenta.",
      ],
    },
  };

  var _session = {
    accessState: "blocked",
    scenario: "peor",
  };

  function _esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _wrap(inner) {
    return '<div class="fade plus-tab-wrap">' + inner + "</div>";
  }

  function _card(inner) {
    return '<div class="plan-card plus-screen-card">' + inner + "</div>";
  }

  function _checkItem(text) {
    return '<li class="plus-check-item"><span class="plus-check-mark" aria-hidden="true">✓</span>'
      + "<span>" + text + "</span></li>";
  }

  function _robotHighlight() {
    return '<div class="plus-ai-highlight">'
      + '<div class="plus-ai-highlight-icon" aria-hidden="true">🤖</div>'
      + '<div class="plus-ai-highlight-content">'
      + "<strong>Análisis con Inteligencia Artificial</strong>"
      + "<p>Tu información se cruza con registros consultados. "
      + "La IA detecta diferencias, patrones y oportunidades específicas para tu caso.</p>"
      + "</div></div>";
  }

  function _reviewBar(session) {
    var blockedActive = session.accessState === "blocked" ? " plus-mock-segment-btn-active" : "";
    var unlockedActive = session.accessState === "unlocked" ? " plus-mock-segment-btn-active" : "";
    var html = '<div class="plus-mock-review-bar" role="group" aria-label="Revisión mock Mi Plan Plus">'
      + '<div class="plus-mock-review-label">Revisión interna (mock)</div>'
      + '<div class="plus-mock-segment">'
      + '<button type="button" class="plus-mock-segment-btn' + blockedActive + '" id="btn-plus-mock-blocked">'
      + "Estado bloqueado</button>"
      + '<button type="button" class="plus-mock-segment-btn' + unlockedActive + '" id="btn-plus-mock-unlocked">'
      + "Estado desbloqueado</button>"
      + "</div>";

    if (session.accessState === "unlocked") {
      var scenarios = ["peor", "similar", "mejor"];
      var labels = { peor: "Escenario: Peor", similar: "Escenario: Similar", mejor: "Escenario: Mejor" };
      html += '<div class="plus-mock-segment plus-mock-scenario-segment">';
      scenarios.forEach(function(key) {
        var active = session.scenario === key ? " plus-mock-segment-btn-active" : "";
        html += '<button type="button" class="plus-mock-segment-btn' + active + '" id="btn-plus-mock-scenario-' + key + '">'
          + _esc(labels[key]) + "</button>";
      });
      html += "</div>";
    }

    html += "</div>";
    return html;
  }

  function _outcomeBlock(title, body) {
    return '<div class="plus-block plus-mock-outcome-block">'
      + '<h3 class="plus-block-title plus-mock-outcome-title">' + title + "</h3>"
      + '<p class="plus-diff-text plus-mock-outcome-body">' + body + "</p>"
      + "</div>";
  }

  function _ctaIncludesList() {
    var items = [
      "Diagnóstico verificado",
      "Informe IA personalizado",
      "Registros consultados",
      "Plan editable",
    ];
    return '<div class="plus-mock-cta-includes">'
      + '<div class="plus-mock-cta-includes-label">Incluye:</div>'
      + '<ul class="plus-mock-cta-includes-list">'
      + items.map(function(item) { return "<li>" + _esc(item) + "</li>"; }).join("")
      + "</ul></div>";
  }

  function _renderPlanTransition(diag) {
    var samePlan = diag.inicialPlan === diag.verificadoPlan;
    var arrow = samePlan ? "=" : "↓";
    return '<div class="plus-mock-plan-transition" aria-label="Transición de diagnóstico">'
      + '<div class="plus-mock-plan-transition-from">'
      + '<span class="plus-mock-plan-transition-tag">Inicial</span>'
      + '<div class="plus-mock-plan-transition-num">Plan ' + diag.inicialPlan + "</div>"
      + "</div>"
      + '<div class="plus-mock-plan-transition-arrow" aria-hidden="true">' + arrow + "</div>"
      + '<div class="plus-mock-plan-transition-to">'
      + '<span class="plus-mock-plan-transition-tag plus-mock-plan-transition-tag-verified">Verificado</span>'
      + '<div class="plus-mock-plan-transition-num plus-mock-plan-transition-num-verified">Plan '
      + diag.verificadoPlan + "</div>"
      + "</div></div>";
  }

  function _renderBlocked() {
    return _wrap(
      _reviewBar(_session)
      + _card(
        '<div class="plus-header-icon plus-mock-header-icon" aria-hidden="true">★</div>'
        + '<h2 class="plus-header-title plus-mock-hero-title">¿Tu situación financiera real coincide con lo que recordás?</h2>'
        + '<p class="plus-header-subtitle plus-mock-hero-subtitle">Descubrí diferencias, riesgos y oportunidades '
        + "que pueden estar afectando tu perfil financiero.</p>"
        + '<div class="plus-mock-positioning" aria-label="Percepción vs situación verificada">'
        + '<div class="plus-mock-positioning-row plus-mock-positioning-base">'
        + '<span class="plus-mock-positioning-label">Tu percepción</span>'
        + '<span class="plus-mock-positioning-desc">Lo que recordás o declaraste</span>'
        + "</div>"
        + '<div class="plus-mock-positioning-vs" aria-hidden="true">VS</div>'
        + '<div class="plus-mock-positioning-row plus-mock-positioning-premium">'
        + '<span class="plus-mock-positioning-label">Tu situación verificada</span>'
        + '<span class="plus-mock-positioning-desc">Lo que encontramos en registros consultados</span>'
        + "</div></div>"
        + _robotHighlight()
        + _outcomeBlock(
          "Podrías estar peor de lo que creés",
          "Detectamos deudas, moras o inconsistencias que pueden afectar tu situación financiera."
        )
        + _outcomeBlock(
          "Podrías estar mejor de lo que creés",
          "Algunas personas descubren que su situación real es más favorable de lo que estimaban."
        )
        + _outcomeBlock(
          "Recibí un plan basado en información verificada",
          "Tu diagnóstico se actualiza utilizando registros consultados."
        )
        + '<div class="plus-mock-cta-zone">'
        + '<button type="button" class="btn btn-primary plus-cta-btn plus-mock-cta-primary" id="btn-plus-mock-unlock-cta" disabled>'
        + '<span class="plus-mock-cta-icon" aria-hidden="true">🔒</span>'
        + "Ver mi situación financiera real</button>"
        + '<p class="plus-mock-price">' + _esc(CZ_PLUS_PRICE_DISPLAY) + "</p>"
        + '<p class="plus-mock-price-once">Pago único</p>'
        + '<p class="plus-mock-price-access">Acceso completo al informe</p>'
        + _ctaIncludesList()
        + '<p class="plus-mock-reassurance">Disponible inmediatamente luego de completar la verificación.</p>'
        + "</div>"
      )
    );
  }

  function _section(title, inner) {
    return '<div class="plus-section-card">' + '<h3 class="plus-section-title">' + title + "</h3>" + inner + "</div>";
  }

  function _renderUnlocked(data) {
    var vr = data.verificationResult;
    var coin = data.coincidence;
    var diag = data.diagnosis;

    var html = _wrap(
      _reviewBar(_session)
      + '<div class="plus-mock-unlocked">'
      + '<div class="plus-mock-verification-status">'
      + '<span class="plus-mock-verification-emoji" aria-hidden="true">' + vr.emoji + "</span>"
      + "<div>"
      + '<div class="plus-mock-verification-title">' + _esc(vr.status) + "</div>"
      + '<p class="plus-mock-verification-msg">' + _esc(vr.message) + "</p>"
      + "</div></div>"

      + '<div class="plus-section-card plus-mock-diag-shift-card">'
      + '<h3 class="plus-section-title plus-mock-diag-shift-title">Tu diagnóstico podría cambiar</h3>'
      + _renderPlanTransition(diag)
      + '<div class="plus-mock-diag-compare">'
      + '<div class="plus-section-card plus-mock-diag-card plus-mock-diag-card-inicial">'
      + '<h3 class="plus-section-title plus-mock-diag-title-muted">Diagnóstico inicial</h3>'
      + '<div class="plus-mock-diag-plan plus-mock-diag-plan-inicial">Plan ' + diag.inicialPlan + "</div>"
      + '<p class="plus-report-p plus-mock-diag-caption-muted">Basado en información declarada</p>'
      + "</div>"
      + '<div class="plus-section-card plus-mock-diag-card plus-mock-verified-card">'
      + '<div class="plus-mock-verified-head">'
      + '<h3 class="plus-section-title">Diagnóstico verificado ⭐</h3>'
      + '<span class="plus-badge plus-badge-alta plus-mock-verified-badge plus-mock-verified-badge-prominent">Verificado</span>'
      + "</div>"
      + '<div class="plus-mock-diag-plan plus-mock-diag-plan-verified">Plan ' + diag.verificadoPlan + "</div>"
      + '<p class="plus-report-p plus-mock-diag-caption-verified">Basado en registros consultados</p>'
      + "</div>"
      + "</div>"
      + '<p class="plus-mock-diag-message">' + _esc(diag.message) + "</p>"
      + "</div>"

      + _section(
        "⭐ Tu diagnóstico verificado",
        '<div class="plus-mock-coincidence">'
        + '<div class="plus-mock-coincidence-label">' + _esc(coin.label) + "</div>"
        + '<div class="plus-mock-coincidence-pct">' + coin.pct + "<span>%</span></div>"
        + '<p class="plus-report-p">' + _esc(coin.message) + "</p>"
        + "</div>"
      )

      + _section(
        "Principales hallazgos",
        '<ul class="plus-report-list plus-mock-findings">'
        + data.hallazgos.map(function(item) { return "<li>" + _esc(item) + "</li>"; }).join("")
        + "</ul>"
      )

      + _section(
        "Diferencias detectadas",
        '<div class="plus-mock-table-wrap"><table class="plus-mock-compare-table">'
        + "<thead><tr><th>Concepto</th><th>Declarado</th><th>Verificado</th></tr></thead><tbody>"
        + data.diferencias.map(function(row) {
          return "<tr><td>" + _esc(row.concepto) + "</td><td>" + _esc(row.declarado)
            + "</td><td>" + _esc(row.verificado) + "</td></tr>";
        }).join("")
        + "</tbody></table></div>"
      )

      + _section(
        "Prioridades",
        '<ol class="plus-mock-priorities">'
        + data.prioridades.map(function(item) { return "<li>" + _esc(item) + "</li>"; }).join("")
        + "</ol>"
      )

      + _section(
        "Análisis IA",
        '<div class="plus-mock-ia-preview">'
        + data.iaPreview.map(function(p) { return '<p class="plus-report-p">' + _esc(p) + "</p>"; }).join("")
        + "</div>"
        + '<button type="button" class="btn btn-secondary plus-cta-btn plus-cta-secondary" disabled>'
        + "Ver informe completo</button>"
        + '<p class="plus-mock-helper">Disponible al completar la verificación</p>'
      )

      + '<div class="plus-mock-docs">'
      + '<h3 class="plus-section-title">Centro de documentos</h3>'
      + '<p class="plus-mock-docs-included">Incluido con Mi Plan Plus</p>'
      + '<div class="plus-mock-docs-grid">'
      + _docCard("📄", "Informe IA", "Análisis personalizado de tu situación", "Descargar")
      + _docCard("📋", "Registros consultados", "Información obtenida de fuentes verificadas", "Descargar")
      + _docCard("📊", "Plan editable", "Tu plan de acción en formato editable", "Abrir Sheet")
      + "</div></div>"

      + "</div>"
    );

    return html;
  }

  function _docCard(icon, title, desc, btnLabel) {
    return '<div class="plus-section-card plus-mock-doc-card">'
      + '<div class="plus-mock-doc-icon" aria-hidden="true">' + icon + "</div>"
      + "<strong>" + _esc(title) + "</strong>"
      + '<p class="plus-report-p">' + _esc(desc) + "</p>"
      + '<button type="button" class="btn btn-secondary plus-mock-doc-btn" disabled>' + _esc(btnLabel) + "</button>"
      + '<p class="plus-mock-helper">Disponible al completar la verificación</p>'
      + "</div>";
  }

  function renderPlusMockTab(/* st */) {
    if (_session.accessState === "blocked") {
      return _renderBlocked();
    }
    var scenario = _session.scenario;
    var data = PLUS_MOCK_DATA[scenario] || PLUS_MOCK_DATA.peor;
    return _renderUnlocked(data);
  }

  function handlePlusMockClick(e) {
    if (global.PLUS_MOCK_MODE !== true) return false;
    var targetId = e && e.target ? e.target.id : "";

    if (targetId === "btn-plus-mock-blocked") {
      _session.accessState = "blocked";
      _rerender();
      return true;
    }
    if (targetId === "btn-plus-mock-unlocked") {
      _session.accessState = "unlocked";
      _rerender();
      return true;
    }
    if (targetId === "btn-plus-mock-scenario-peor") {
      _session.scenario = "peor";
      _rerender();
      return true;
    }
    if (targetId === "btn-plus-mock-scenario-similar") {
      _session.scenario = "similar";
      _rerender();
      return true;
    }
    if (targetId === "btn-plus-mock-scenario-mejor") {
      _session.scenario = "mejor";
      _rerender();
      return true;
    }
    return false;
  }

  function getPlusTabNavDisplay() {
    if (global.PLUS_MOCK_MODE !== true) return null;
    if (_session.accessState === "blocked") {
      return { icon: "🔒", label: "Mi Plan Plus", locked: true };
    }
    return { icon: "★", label: "Mi Plan Plus Activo", unlocked: true };
  }

  function _rerender() {
    if (global.CredizonaUI) {
      if (typeof global.CredizonaUI.syncTabsNav === "function") {
        global.CredizonaUI.syncTabsNav();
      }
      if (typeof global.CredizonaUI.renderTab === "function") {
        global.CredizonaUI.renderTab();
      }
    }
  }

  global.PLUS_MOCK_MODE = PLUS_MOCK_MODE;
  global.PLUS_MOCK_DATA = PLUS_MOCK_DATA;
  global.CZ_PLUS_PRICE_DISPLAY = CZ_PLUS_PRICE_DISPLAY;
  global.renderPlusMockTab = renderPlusMockTab;
  global.handlePlusMockClick = handlePlusMockClick;
  global.getPlusTabNavDisplay = getPlusTabNavDisplay;

  global.PlusMock = {
    isActive: function() { return global.PLUS_MOCK_MODE === true; },
    renderTab: renderPlusMockTab,
    handleControlClick: function(id) { return handlePlusMockClick({ target: { id: id } }); },
    getData: function() { return PLUS_MOCK_DATA; },
    getSession: function() { return _session; },
    _setModeForQA: function(v) { global.PLUS_MOCK_MODE = !!v; },
    _resetSessionForQA: function() {
      _session.accessState = "blocked";
      _session.scenario = "peor";
    },
  };
})(typeof window !== "undefined" ? window : global);
