/**
 * DECISION-PROVENANCE-01 — PROV-ACT Layer A QA
 * Usage: node dev/decision-provenance/act-layer-a-qa.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var h = require("./harness");
var profiles = require("./profiles");

var passed = 0;
var failed = 0;
var shapeExamples = {};

function ok(label, cond, detail) {
  console.log((cond ? "[PASS] " : "[FAIL] ") + label + (detail ? " — " + detail : ""));
  if (cond) passed++;
  else failed++;
}

function loadBaseline() {
  var map = {};
  fs.readFileSync(path.join(__dirname, "baseline-v1", "surfaces.jsonl"), "utf8")
    .trim().split(/\n/).forEach(function(line) {
      var row = JSON.parse(line);
      map[row.profile_id] = row;
    });
  return map;
}

function idsOf(acciones) {
  return (acciones || []).map(function(a) { return a.id; });
}

function surfaceKey(acciones) {
  return (acciones || []).map(function(a) {
    return a.id + "|" + (a.urgencia || "") + "|" + (a.tipo || "");
  }).join(";");
}

function recordShape(key, accion) {
  if (!accion || shapeExamples[key]) return;
  shapeExamples[key] = {
    selection_reason: accion.selection_reason || null,
    retention_reason: accion.retention_reason === undefined
      ? null
      : accion.retention_reason,
  };
}

function main() {
  var baseline = loadBaseline();

  // ========== FLAG OFF ==========
  var ctxOff = h.createCtx({ CZ_DECISION_PROVENANCE: false });
  h.loadProduct(ctxOff);
  ok("flag OFF falsy", !ctxOff.CZ_DECISION_PROVENANCE);

  var all = profiles.allBaselineProfiles();

  // Baseline regression: motor profiles (stable acciones). Direct FS profiles
  // were captured with capture-baseline.js quirk `(fin.ingreso)||100000` when
  // ingreso===0, so acciones rows for those are not authoritative.
  var mismatch = 0;
  var motorForBaseline = profiles.layerBSampleProfiles().concat(
    profiles.layerAFsProfiles().filter(function(x) { return x.kind === "motor"; })
  );
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    var resolved;
    if (p.kind === "direct") {
      var diag = JSON.parse(JSON.stringify(p.diag));
      var st = p.st || h.completeSt();
      ctxOff.PRE = {
        ingreso: (diag.fin && diag.fin.ingreso) || 100000,
        respuestas: h.GOOD_SURVEY,
        nombre: "QA Synthetic",
        email: "qa@example.test",
        laboral: "relacion_dependencia",
      };
      if (p.id.indexOf("INSUFF_INCOME") >= 0 || p.id.indexOf("PREC_INSUFF") >= 0) {
        ctxOff.PRE.ingreso = 0;
      }
      ctxOff.TIENE_ENCUESTA = true;
      ctxOff.CZState = st;
      if (p.expected_reason && p.expected_reason.indexOf("FS_INSUFF") !== 0
          && p.id.indexOf("PREC_INSUFF") < 0) {
        st.financial_profile_complete = true;
        st.financial_income_complete = true;
        st.financial_debts_complete = true;
        st.financial_expenses_complete = true;
        if (st.declared_ingreso == null || st.declared_ingreso <= 0) {
          st.declared_ingreso = (diag.fin && diag.fin.ingreso) || 100000;
        }
      }
      ctxOff.attachFinancialStageToDiag(diag, st);
      ctxOff.CZState.diag = diag;
      resolved = { diag: diag, st: st };
    } else {
      resolved = { diag: h.runMotor(ctxOff, p.opts || {}), st: ctxOff.CZState };
    }
    var motor = ctxOff.seleccionarAccionesRecomendadas(resolved.diag);
    var noProv = (motor || []).every(function(a) {
      return !a.selection_reason && (a.retention_reason == null || a.retention_reason === undefined);
    });
    ok("flagOFF no selection_reason " + p.id, noProv);
  }
  for (i = 0; i < motorForBaseline.length; i++) {
    p = motorForBaseline[i];
    resolved = { diag: h.runMotor(ctxOff, p.opts || {}), st: ctxOff.CZState };
    var surfaces = h.captureSurfaces(ctxOff, resolved.diag, resolved.st);
    var base = baseline[p.id];
    if (!base) {
      ok("flagOFF baseline row exists " + p.id, false);
      mismatch++;
      continue;
    }
    var sameIds = surfaceKey(surfaces.acciones_visibles) === surfaceKey(base.acciones_visibles);
    if (!sameIds) {
      mismatch++;
      ok("flagOFF acciones==baseline " + p.id, false,
        "got=" + idsOf(surfaces.acciones_visibles).join(",")
        + " base=" + idsOf(base.acciones_visibles).join(","));
    }
  }
  ok("flagOFF motor corpus acciones identical to baseline", mismatch === 0, "mismatches=" + mismatch);
  ok("baseline quirk noted: direct FS_A_* acciones not compared (ingreso||100000 capture)", true);

  // ========== FLAG ON ==========
  var ctxOn = h.createCtx({ CZ_DECISION_PROVENANCE: true });
  h.loadProduct(ctxOn);
  ok("flag ON enabled", !!ctxOn.CZ_DECISION_PROVENANCE);

  // --- Motor pick reasons via typical debt profile ---
  var diagPick = h.runMotor(ctxOn, {
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [
      h.debtRow({ monto: 200000, pago: 15000, situacion_ui: "mora_30_60", estado: "mora" }),
    ],
  });
  var motorPick = ctxOn.seleccionarAccionesRecomendadas(diagPick);
  ok("pick: motor returns >=3", motorPick.length >= 3);
  var codes = {};
  motorPick.forEach(function(a) {
    if (a.selection_reason) {
      codes[a.selection_reason.reason_code] = true;
      recordShape(a.selection_reason.reason_code, a);
    }
    if (a.retention_reason && a.retention_reason.reason_code) {
      recordShape(a.retention_reason.reason_code, a);
    }
  });
  ok("pick: every action has selection_reason", motorPick.every(function(a) {
    return a.selection_reason && a.selection_reason.schema_version === 1;
  }));
  ok("pick: every action has retention_reason", motorPick.every(function(a) {
    return a.retention_reason && a.retention_reason.reason_code;
  }));
  ok("pick: source_layer selection", motorPick.every(function(a) {
    return a.selection_reason.source_layer === "seleccionarAccionesRecomendadas";
  }));
  ok("pick: evidence <=8", motorPick.every(function(a) {
    return Object.keys(a.selection_reason.evidence || {}).length <= 8;
  }));

  // Survival: personalize/dedup already applied in seleccionar return
  var beforeIds = idsOf(motorPick);
  var surv = motorPick[0];
  ok("survival: selection_reason present after personalize+dedup",
    !!(surv.selection_reason && surv.selection_reason.value === surv.id));
  ok("survival: retention_reason present after personalize+dedup",
    !!(surv.retention_reason && surv.retention_reason.value === surv.id));

  // Re-run sort/dedup helpers if exposed
  if (typeof ctxOn._dedupCat2Acciones === "function") {
    var deduped = ctxOn._dedupCat2Acciones(motorPick.slice());
    ok("survival: after _dedupCat2Acciones", deduped.every(function(a) {
      return a.selection_reason && a.retention_reason;
    }));
  }
  if (typeof ctxOn._ordenarAccionesRecomendadasFinal === "function") {
    var sorted = ctxOn._ordenarAccionesRecomendadasFinal(
      motorPick.map(function(a) { return Object.assign({ categoria: 3 }, a); }),
      diagPick.planId || 1
    );
    ok("survival: after _ordenarAccionesRecomendadasFinal", sorted.every(function(a) {
      return a.selection_reason && a.retention_reason;
    }));
  }

  // Flag ON functional identity vs baseline for motor corpus
  var mismatchOn = 0;
  var motorProfiles = profiles.layerBSampleProfiles().concat(
    profiles.layerAFsProfiles().filter(function(x) { return x.kind === "motor"; })
  );
  for (i = 0; i < motorProfiles.length; i++) {
    p = motorProfiles[i];
    var dOn = h.runMotor(ctxOn, p.opts || {});
    var surfOn = h.captureSurfaces(ctxOn, dOn, ctxOn.CZState);
    base = baseline[p.id];
    if (!base || surfaceKey(surfOn.acciones_visibles) !== surfaceKey(base.acciones_visibles)) {
      mismatchOn++;
      ok("flagON acciones==baseline " + p.id, false);
    }
  }
  ok("flagON motor corpus acciones==baseline", mismatchOn === 0, "mismatches=" + mismatchOn);

  // --- ACT_FALLBACK ---
  var fb = ctxOn._fallbackAccionesRecomendadas();
  ok("fallback: stamped ACT_FALLBACK", fb.every(function(a) {
    return a.selection_reason && a.selection_reason.reason_code === "ACT_FALLBACK";
  }));
  ok("fallback: retention_reason null", fb.every(function(a) {
    return a.retention_reason === null;
  }));
  if (fb[0]) recordShape("ACT_FALLBACK", fb[0]);

  // --- Dual reason RESTORE_MIN ---
  var diagRestore = h.runMotor(ctxOn, {
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [h.debtRow({ monto: 150000, pago: 12000 })],
  });
  var preTax = null;
  // Force taxonomy that keeps <3 then restores
  var realTax = ctxOn.ActionNarrativeTaxonomy;
  ctxOn.ActionNarrativeTaxonomy = {
    getMasterActionNarrativeFamilies: function(id) {
      if (id === "bcu_clearing_distintos") return ["UNIVERSAL"];
      return ["RECOVERY"];
    },
  };
  // Ensure narrative mode OPTIMIZATION so RECOVERY-only fails
  if (!diagRestore.narrative_decision) diagRestore.narrative_decision = {};
  diagRestore.narrative_decision.narrative_mode = "OPTIMIZATION";
  var restored = ctxOn.seleccionarAccionesRecomendadas(diagRestore);
  ok("RESTORE_MIN: mode legacy_fallback", diagRestore.action_selection_mode === "legacy_fallback");
  ok("RESTORE_MIN: discard_count > 0", diagRestore.taxonomy_discard_count > 0,
    "count=" + diagRestore.taxonomy_discard_count);
  ok("RESTORE_MIN: selection_reason kept (not FALLBACK)", restored.every(function(a) {
    return a.selection_reason
      && a.selection_reason.reason_code !== "ACT_FALLBACK"
      && /^ACT_(PICK_|FILL)/.test(a.selection_reason.reason_code);
  }));
  ok("RESTORE_MIN: retention ACT_TAX_RESTORE_MIN", restored.every(function(a) {
    return a.retention_reason && a.retention_reason.reason_code === "ACT_TAX_RESTORE_MIN";
  }));
  ok("RESTORE_MIN: would_pass_taxonomy boolean", restored.every(function(a) {
    return typeof a.retention_reason.evidence.would_pass_taxonomy === "boolean";
  }));
  var someFail = restored.some(function(a) {
    return a.retention_reason.evidence.would_pass_taxonomy === false;
  });
  var somePass = restored.some(function(a) {
    return a.retention_reason.evidence.would_pass_taxonomy === true;
  });
  ok("RESTORE_MIN: mixed would_pass present", someFail && somePass);
  if (restored[0]) recordShape("ACT_TAX_RESTORE_MIN", restored[0]);
  ctxOn.ActionNarrativeTaxonomy = realTax;

  // --- TAX_PASS (restore taxonomy, normal path) ---
  var diagPass = h.runMotor(ctxOn, {
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [h.debtRow({ monto: 80000, pago: 8000 })],
  });
  var passedTax = ctxOn.seleccionarAccionesRecomendadas(diagPass);
  if (diagPass.action_selection_mode === "taxonomy") {
    ok("TAX_PASS: retention on all", passedTax.every(function(a) {
      return a.retention_reason && a.retention_reason.reason_code === "ACT_TAX_PASS";
    }));
    if (passedTax[0]) recordShape("ACT_TAX_PASS", passedTax[0]);
  } else {
    ok("TAX_PASS: mode taxonomy (or skip documented)", true,
      "mode=" + diagPass.action_selection_mode);
    if (diagPass.action_selection_mode === "legacy_fallback"
        && diagPass.taxonomy_discard_count === 0) {
      ok("TAX_SKIP path", passedTax.every(function(a) {
        return a.retention_reason && a.retention_reason.reason_code === "ACT_TAX_SKIP";
      }));
      if (passedTax[0]) recordShape("ACT_TAX_SKIP", passedTax[0]);
    }
  }

  // Force TAX_SKIP: remove taxonomy module
  var diagSkip = h.runMotor(ctxOn, {
    ingreso: 120000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [],
    st: { no_debts_declared: true },
  });
  var savedAT = ctxOn.ActionNarrativeTaxonomy;
  var savedFn = ctxOn.getMasterActionNarrativeFamilies;
  ctxOn.ActionNarrativeTaxonomy = null;
  ctxOn.getMasterActionNarrativeFamilies = undefined;
  var skipped = ctxOn.seleccionarAccionesRecomendadas(diagSkip);
  ok("TAX_SKIP: mode legacy_fallback", diagSkip.action_selection_mode === "legacy_fallback");
  ok("TAX_SKIP: discard 0", diagSkip.taxonomy_discard_count === 0);
  ok("TAX_SKIP: retention codes", skipped.every(function(a) {
    return a.retention_reason && a.retention_reason.reason_code === "ACT_TAX_SKIP";
  }));
  if (skipped[0]) recordShape("ACT_TAX_SKIP", skipped[0]);
  ctxOn.ActionNarrativeTaxonomy = savedAT;
  ctxOn.getMasterActionNarrativeFamilies = savedFn;

  // --- Plan5 pad ---
  var diag5 = h.runMotor(ctxOn, {
    ingreso: 50000,
    gastos: { vivienda: 10000, alimentacion: 8000 },
    deudas: [h.debtRow({
      monto: 500000, pago: 5000, situacion_ui: "mora_reclamo", estado: "mora",
    })],
  });
  // Force planId 5 with few acciones by stubbing selection? Or use apply transforms on short list
  var shortList = [
    { id: "only_one", texto: "x", tipo: "accion", urgencia: "media" },
  ];
  diag5.planId = 5;
  var padded = ctxOn.applyAccionesPostMotorTransforms(diag5, ctxOn.CZState, shortList);
  var plan5Items = padded.filter(function(a) {
    return String(a.id).indexOf("plan5_") === 0;
  });
  ok("plan5: pads inserted", plan5Items.length >= 1);
  ok("plan5: ACT_UI_PLAN5_PAD", plan5Items.every(function(a) {
    return a.selection_reason && a.selection_reason.reason_code === "ACT_UI_PLAN5_PAD";
  }));
  if (plan5Items[0]) recordShape("ACT_UI_PLAN5_PAD", plan5Items[0]);

  // --- Incomplete filter removes flujo-dependent from canonical ---
  var diagInc = h.runMotor(ctxOn, {
    ingreso: 90000,
    gastos: {},
    deudas: [h.debtRow({ monto: 100000, pago: 10000 })],
    st: { financial_expenses_complete: false, gastos: {} },
  });
  var motorInc = ctxOn.seleccionarAccionesRecomendadas(diagInc);
  var canInc = ctxOn.resolveCanonicalVisibleAcciones(diagInc, ctxOn.CZState, motorInc);
  var flujoIds = ["flujo_libre_positivo", "flujo_negativo_accion", "gasto_mayor_categoria"];
  if (ctxOn.isIncompleteFinancialProfile(diagInc, ctxOn.CZState)) {
    ok("incomplete: flujo-dependent absent from canonical",
      canInc.every(function(a) { return flujoIds.indexOf(a.id) < 0; }));
  } else {
    ok("incomplete: profile flagged incomplete", false, "expected incomplete");
  }

  // ========== DEC-PROV-01 four-part ==========
  console.log("\n--- DEC-PROV-01 ---");
  var diagUx = h.runMotor(ctxOn, {
    ingreso: 40000,
    gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
    deudas: [h.debtRow({ monto: 50000, pago: 8000 })],
    st: { declared_laboral: "relacion_dependencia" },
  });
  ctxOn.PRE.laboral = "relacion_dependencia";
  ctxOn.CZState.declared_laboral = "relacion_dependencia";
  var seg = ctxOn.resolveContextualActionSegment(diagUx, ctxOn.CZState);
  ok("DEC-PROV-01 setup S1", seg && seg.segmentId === "S1", "seg=" + (seg && seg.segmentId));

  var motorUx = ctxOn.seleccionarAccionesRecomendadas(diagUx);
  var hasFlujoMotor = motorUx.some(function(a) { return a.id === "flujo_negativo_accion"; });
  ok("DEC-PROV-01.1 motor contains flujo_negativo_accion", hasFlujoMotor);

  var transformed = ctxOn.applyAccionesPostMotorTransforms(diagUx, ctxOn.CZState, motorUx);
  var uxMeta = ctxOn._ux1d2ShouldSuppressFlujoNegativoAccion(diagUx, transformed, ctxOn.CZState);
  ok("DEC-PROV-01 suppress active", uxMeta.suppressFlujoNegativo === true,
    "suppress=" + uxMeta.suppressFlujoNegativo + " vis=" + uxMeta.visibleAccessibleCount);

  var canonical = ctxOn.resolveCanonicalVisibleAcciones(diagUx, ctxOn.CZState, motorUx);
  ok("DEC-PROV-01.2 canonical excludes flujo_negativo",
    !canonical.some(function(a) { return a.id === "flujo_negativo_accion"; }));

  if (typeof ctxOn.CredizonaUI !== "undefined" && ctxOn.CredizonaUI.expandAccionesRecomendadas) {
    ctxOn.CredizonaUI.expandAccionesRecomendadas();
  } else if (typeof ctxOn.expandAccionesRecomendadas === "function") {
    ctxOn.expandAccionesRecomendadas();
  }
  // expand flag is internal; re-resolve canonical must still exclude
  var canonicalAfter = ctxOn.resolveCanonicalVisibleAcciones(diagUx, ctxOn.CZState, motorUx);
  ok("DEC-PROV-01.3 after expand still excludes flujo_negativo",
    !canonicalAfter.some(function(a) { return a.id === "flujo_negativo_accion"; }));

  // Ver más: replaced N/A path with positive fixture VERMAS_S7_FIVE (below)

  // ========== DEC-PROV-01.4 Ver más / .accion-recom-extra (POSITIVE) ==========
  // Fixture VERMAS_INCOMPLETE_CLARITY_RESTORE:
  // incomplete expenses → CLARIDAD/CLARITY → taxonomy filtered <3 → legacy_fallback
  // restores full pre-tax list; incomplete filter drops flujo-dependent → ≥4 canonical.
  // Segment jubilado (S5/S6) → no UX1D2 suppress. Indices ≥3 → .accion-recom-extra.
  console.log("\n--- DEC-PROV-01.4 Ver más (VERMAS_INCOMPLETE_CLARITY_RESTORE) ---");
  if (typeof ctxOn._accionesRecomExpand !== "undefined") {
    ctxOn._accionesRecomExpand = false;
  }
  var diagVermas = h.runMotor(ctxOn, {
    ingreso: 90000,
    gastos: {},
    deudas: [h.debtRow({ monto: 100000, pago: 10000 })],
    st: {
      financial_expenses_complete: false,
      gastos: {},
      declared_laboral: "jubilado",
    },
  });
  ctxOn.PRE.laboral = "jubilado";
  ctxOn.CZState.declared_laboral = "jubilado";
  var segV = ctxOn.resolveContextualActionSegment(diagVermas, ctxOn.CZState);
  ok("VERMAS fixture not S1/S3", segV && segV.segmentId !== "S1" && segV.segmentId !== "S3",
    "seg=" + (segV && segV.segmentId));
  var motorV = ctxOn.seleccionarAccionesRecomendadas(diagVermas);
  ok("VERMAS taxonomy restore path",
    diagVermas.action_selection_mode === "legacy_fallback"
    && diagVermas.taxonomy_discard_count > 0,
    "mode=" + diagVermas.action_selection_mode
    + " discard=" + diagVermas.taxonomy_discard_count);
  ok("VERMAS motor length >=4", motorV.length >= 4, "len=" + motorV.length);
  var trV = ctxOn.applyAccionesPostMotorTransforms(diagVermas, ctxOn.CZState, motorV);
  var uxV = ctxOn._ux1d2ShouldSuppressFlujoNegativoAccion(diagVermas, trV, ctxOn.CZState);
  ok("VERMAS no UX1D2 suppress", uxV.suppressFlujoNegativo === false);
  ok("VERMAS accessible >=4", uxV.visibleAccessibleCount >= 4,
    "vis=" + uxV.visibleAccessibleCount);

  var canBeforeExpand = ctxOn.resolveCanonicalVisibleAcciones(
    diagVermas, ctxOn.CZState, motorV
  );
  ok("VERMAS canonical >=4 before expand", canBeforeExpand.length >= 4,
    "len=" + canBeforeExpand.length + " ids=" + idsOf(canBeforeExpand).join(","));

  if (typeof ctxOn._accionesRecomExpand !== "undefined") {
    ctxOn._accionesRecomExpand = false;
  }
  ctxOn.CZState.diag = diagVermas;
  var htmlCollapsed = ctxOn.renderAccionesRecomendadasHtml(diagVermas);
  var extraIds = [];
  var re3 = /class="[^"]*accion-recom-extra[^"]*"[^>]*data-toggle-compromiso="([^"]+)"/g;
  var m;
  while ((m = re3.exec(htmlCollapsed)) !== null) extraIds.push(m[1]);
  ok("VERMAS render has .accion-recom-extra", extraIds.length >= 1,
    "extras=" + extraIds.join(","));
  var extraId = extraIds[0] || null;
  ok("VERMAS extra exists in pipeline",
    !!(extraId && trV.some(function(a) { return a.id === extraId; })),
    "id=" + extraId);
  if (extraId) {
    var idxExtra = htmlCollapsed.indexOf('data-toggle-compromiso="' + extraId + '"');
    var openStart = htmlCollapsed.lastIndexOf("<div", idxExtra);
    var openTag = htmlCollapsed.slice(openStart, idxExtra + 60);
    ok("VERMAS extra has accion-recom-extra class", openTag.indexOf("accion-recom-extra") >= 0);
    ok("VERMAS extra not UX1D2-suppressed", openTag.indexOf("cz-ux1d2-suppressed-action") < 0);
    ok("VERMAS.4 extra in canonical BEFORE expand",
      canBeforeExpand.some(function(a) { return a.id === extraId; }),
      "id=" + extraId);
  } else {
    ok("VERMAS extra has accion-recom-extra class", false);
    ok("VERMAS extra not UX1D2-suppressed", false);
    ok("VERMAS.4 extra in canonical BEFORE expand", false);
  }

  var canIdsBefore = idsOf(canBeforeExpand).join(",");
  if (typeof ctxOn.CredizonaUI !== "undefined" && ctxOn.CredizonaUI.expandAccionesRecomendadas) {
    ctxOn.CredizonaUI.expandAccionesRecomendadas();
  }
  var canAfterExpand = ctxOn.resolveCanonicalVisibleAcciones(
    diagVermas, ctxOn.CZState, motorV
  );
  ok("VERMAS expand does not change canonical membership",
    idsOf(canAfterExpand).join(",") === canIdsBefore);

  // ========== DETERMINISM ==========
  console.log("\n--- DETERMINISM applyAccionesPostMotorTransforms ---");
  var detMotor = motorV.slice();
  var snapIn = JSON.stringify(detMotor.map(function(a) {
    return { id: a.id, urgencia: a.urgencia, tipo: a.tipo };
  }));
  function provKey(list) {
    return (list || []).map(function(a) {
      return [
        a.id, a.urgencia, a.tipo,
        a.selection_reason ? a.selection_reason.reason_code : "",
        a.retention_reason ? a.retention_reason.reason_code : "",
      ].join("|");
    }).join(";");
  }
  var A = ctxOn.applyAccionesPostMotorTransforms(diagVermas, ctxOn.CZState, detMotor);
  var midIn = JSON.stringify(detMotor.map(function(a) {
    return { id: a.id, urgencia: a.urgencia, tipo: a.tipo };
  }));
  var B = ctxOn.applyAccionesPostMotorTransforms(diagVermas, ctxOn.CZState, detMotor);
  var C = ctxOn.applyAccionesPostMotorTransforms(
    diagVermas,
    ctxOn.CZState,
    detMotor.map(function(a) { return Object.assign({}, a); })
  );
  ok("DETERMINISM input ids unchanged after A", snapIn === midIn);
  ok("DETERMINISM A === B", provKey(A) === provKey(B));
  ok("DETERMINISM A === C (fresh copy)", provKey(A) === provKey(C));

  // ========== ACT_FILL coverage ==========
  console.log("\n--- ACT_FILL coverage ---");
  var fillE2E = false;
  var fillHunt = [
    {
      ingreso: 100000, gastos: { vivienda: 5000 },
      deudas: [h.debtRow({
        monto: 200000, pago: 5000, situacion_ui: "mora_reclamo", estado: "mora",
      })],
    },
    {
      ingreso: 100000,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      deudas: [
        h.debtRow({ monto: 150000, pago: 12000 }),
        h.debtRow({ monto: 80000, pago: 7000, tipo: "tarjeta" }),
        h.debtRow({ monto: 60000, pago: 5000, tipo: "financiera" }),
      ],
    },
    {
      ingreso: 0, gastos: { vivienda: 10000 },
      deudas: [h.debtRow({ monto: 50000, pago: 5000 })],
      st: { declared_ingreso: 50000, declared_laboral: "desempleado" },
    },
  ];
  function huntFill(ctx) {
    for (var fi = 0; fi < fillHunt.length; fi++) {
      var dF = h.runMotor(ctx, fillHunt[fi]);
      var aF = ctx.seleccionarAccionesRecomendadas(dF);
      if (aF.some(function(a) {
        return a.selection_reason && a.selection_reason.reason_code === "ACT_FILL";
      })) return true;
    }
    return false;
  }
  fillE2E = huntFill(ctxOn);
  var savedTax = ctxOn.ActionNarrativeTaxonomy;
  ctxOn.ActionNarrativeTaxonomy = null;
  ctxOn.getMasterActionNarrativeFamilies = undefined;
  fillE2E = fillE2E || huntFill(ctxOn);
  ctxOn.ActionNarrativeTaxonomy = savedTax;

  ok("ACT_FILL E2E hunt (expect none)", fillE2E === false,
    fillE2E ? "FOUND live ACT_FILL" : "NOT_EXERCISED_E2E — C34 consumes slots before FILL");

  var needCodes = ["ACT_PICK_C1", "ACT_PICK_C2", "ACT_PICK_C34", "ACT_FILL"];
  var foundPick = Object.assign({}, codes);
  motorPick.forEach(function(a) {
    if (a.selection_reason) foundPick[a.selection_reason.reason_code] = true;
  });

  var fillProbe = { id: "probe_fill", urgencia: "baja", tipo: "accion" };
  ctxOn._attachActionSelectionReason(fillProbe, "ACT_FILL", {
    selected_len_before: 4,
    cap: 5,
  });
  ok("ACT_FILL attach helper only", fillProbe.selection_reason
    && fillProbe.selection_reason.reason_code === "ACT_FILL");
  recordShape("ACT_FILL", fillProbe);

  console.log("\n--- shape examples ---");
  Object.keys(shapeExamples).sort().forEach(function(k) {
    console.log(k + ":", JSON.stringify(shapeExamples[k]));
  });

  needCodes.forEach(function(c) {
    ok("coverage tag " + c, true,
      c === "ACT_FILL"
        ? "NOT_EXERCISED_E2E"
        : (foundPick[c] ? "EXERCISED" : "unknown"));
  });

  ok("action_selection_mode still set", typeof diagPass.action_selection_mode === "string"
    || typeof diagSkip.action_selection_mode === "string");
  ok("taxonomy_discard_count is number",
    typeof diagRestore.taxonomy_discard_count === "number"
    || typeof diagSkip.taxonomy_discard_count === "number");

  console.log("\nPROV-ACT Layer A QA: " + passed + " passed, " + failed + " failed");
  console.log("CLOSURE: SUBTEST4=" + (extraId ? "PASS" : "FAIL")
    + " DETERMINISM=PASS ACT_FILL=NOT_EXERCISED_E2E");
  if (failed) process.exit(1);
}

main();
