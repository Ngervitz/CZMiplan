// =============================================================================
// survey.js — Algoritmo encuesta conductual P1-P10
// Depende de: config.js
// Algoritmo: reset_v2_simple — suma directa, escala 0-30
// =============================================================================

// Convierte respuesta letra a numero
function p2n(r) {
  return r === "A" ? 3 : r === "B" ? 2 : r === "C" ? 1 : r === "D" ? 0 : null;
}

// True when URL carried survey params OR in-app SEO IA has a complete A–D set.
function surveyIsActive(resp) {
  if (!resp) return false;
  if (typeof TIENE_ENCUESTA !== "undefined" && TIENE_ENCUESTA) return true;
  for (var i = 1; i <= 10; i++) {
    var v = resp["p" + i];
    if (v !== "A" && v !== "B" && v !== "C" && v !== "D") return false;
  }
  return true;
}

function calcularEncuesta(resp) {
  if (!resp || !surveyIsActive(resp)) {
    return {
      score: 0,
      nivel: "B",
      bPlus: false,
      flagsRiesgo: [],
      version: "reset_v2_simple",
    };
  }

  const v = k => p2n(resp["p" + k]);

  // Suma directa P1-P10, maximo 30 puntos
  const score = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .reduce((s, k) => {
      const val = v(k);
      return s + (val !== null ? val : 0);
    }, 0);

  // Segmentacion: A=24-30, B=15-23, C=0-14
  let nivel = score >= 24 ? "A" : score >= 15 ? "B" : "C";
  const flags = [];

  // Reglas duras — forzar C
  if (resp.p6  === "D") { nivel = "C"; flags.push("prestamo_informal"); }
  if (resp.p8  === "D") { nivel = "C"; flags.push("sin_accion_reciente"); }
  if (resp.p10 === "D") { nivel = "C"; flags.push("sin_constancia"); }

  // Flag B+: nivel B con buena disposicion al cambio
  const bPlus = nivel === "B"
    && resp.p8  === "A"
    && (resp.p3 === "A" || resp.p3 === "B")
    && (resp.p10 === "A" || resp.p10 === "B");

  return {
    score,
    nivel: bPlus ? "B+" : nivel,
    nivelBase: nivel,
    bPlus,
    flagsRiesgo: flags,
    version: "reset_v2_simple",
  };
}

// SEO IA onboarding — weighted 0–100 score (separate from funnel reset_v2_simple).
function calcularEncuestaSeoIa(resp) {
  if (!resp) {
    return {
      score_v2: 0,
      baseline_nivel: "C",
      nivel_final: "C",
      flags_riesgo: [],
      b_plus: false,
      version_cuestionario: "seo_ia_v1_weighted",
    };
  }

  var v = function(k) { return p2n(resp["p" + k]); };
  var b1 = v(1) + v(2) + v(7);
  var b2 = v(4) + v(6) + v(10);
  var b3 = v(3) + v(9);
  var b4 = v(5) + v(8);

  var score_v2 = Math.round(
    (b1 / 9) * 30 +
    (b2 / 9) * 30 +
    (b3 / 6) * 20 +
    (b4 / 6) * 20
  );
  score_v2 = clamp(score_v2, 0, 100);

  var baseline_nivel = score_v2 >= 70 ? "A" : score_v2 >= 40 ? "B" : "C";
  var nivel_final = baseline_nivel;
  var flags = [];

  if (resp.p6  === "D") { nivel_final = "C"; flags.push("prestamo_informal"); }
  if (resp.p8  === "D") { nivel_final = "C"; flags.push("sin_accion_reciente"); }
  if (resp.p10 === "D") { nivel_final = "C"; flags.push("sin_constancia"); }

  if (baseline_nivel === "A" && nivel_final !== "C") {
    if (resp.p3 === "C" || resp.p3 === "D" || resp.p5 === "D" || resp.p7 === "D") {
      nivel_final = "B";
      flags.push("degraded_from_a");
    }
  }

  var b_plus = nivel_final === "B"
    && resp.p8 === "A"
    && (resp.p3 === "A" || resp.p3 === "B")
    && (resp.p10 === "A" || resp.p10 === "B");

  if (b_plus) nivel_final = "B+";

  return {
    score_v2: score_v2,
    baseline_nivel: baseline_nivel,
    nivel_final: nivel_final,
    flags_riesgo: flags,
    b_plus: b_plus,
    version_cuestionario: "seo_ia_v1_weighted",
  };
}
