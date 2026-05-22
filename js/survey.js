// =============================================================================
// survey.js — Algoritmo encuesta conductual P1-P10
// Depende de: config.js
// Algoritmo: reset_v2_simple — suma directa, escala 0-30
// =============================================================================

// Convierte respuesta letra a numero
function p2n(r) {
  return r === "A" ? 3 : r === "B" ? 2 : r === "C" ? 1 : r === "D" ? 0 : null;
}

function calcularEncuesta(resp) {
  if (!resp || !TIENE_ENCUESTA) {
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
