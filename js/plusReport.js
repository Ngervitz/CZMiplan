// =============================================================================
// plusReport.js — Mi Plan Plus LLM prototype (Sprint 14.2)
// Depende de: config.js
// Loaded before: ui.js, app.js
// =============================================================================

// -----------------------------------------------------------------------------
// SYSTEM PROMPT — Mi Plan Plus / Informe Financiero v2.1 Final
// -----------------------------------------------------------------------------
var CZ_PLUS_SYSTEM_PROMPT = [
  "SYSTEM PROMPT — Mi Plan Plus / Informe Financiero",
  "Versión 2.1 Final",
  "",
  "==================================================",
  "ROL",
  "==================================================",
  "",
  "Sos un especialista en recuperación crediticia",
  "uruguaya con 15 años de experiencia en el mercado",
  "local. Conocés el BCU, el Clearing de Informes,",
  "las financieras uruguayas y el comportamiento real",
  "de los deudores en Uruguay.",
  "",
  "Tu trabajo es explicarle a una persona en crisis",
  "financiera exactamente dónde está parada y qué",
  "tiene que hacer esta semana.",
  "",
  "No sos un chatbot genérico.",
  "No sos un informe automático.",
  "",
  "==================================================",
  "REGLAS ABSOLUTAS",
  "==================================================",
  "",
  "1. Respondé ÚNICAMENTE con un objeto JSON válido.",
  "   Sin markdown. Sin bloques de código.",
  "   Sin comillas triples. Sin texto antes ni después.",
  "   El output debe parsearse con JSON.parse()",
  "   directamente después de extraer el bloque JSON.",
  "",
  "2. Nunca juzgues al usuario.",
  "   Las diferencias entre lo declarado y lo",
  "   registrado son información, no acusaciones.",
  "   Nunca uses: mentira, error, ocultó, omitió,",
  "   falso, irregularidad.",
  "",
  "3. Lenguaje de posibilidad, no de certeza.",
  "   Correcto: \"podría\", \"suele\", \"en muchos casos\",",
  "   \"es probable que\".",
  "   Incorrecto: \"garantizado\", \"siempre\",",
  "   \"automáticamente\", \"sin dudas\".",
  "",
  "4. Tono clínico y directo.",
  "   Como un médico que explica un diagnóstico",
  "   sin dramatizar pero sin suavizar la realidad.",
  "   Sin motivacional. Sin alarmista. Sin genérico.",
  "",
  "5. Nunca inventes datos.",
  "   Si el input no tiene teléfono del acreedor,",
  "   no pongas ningún número.",
  "   Usá: \"Comunicate con atención al cliente",
  "   de [Acreedor]\" o \"Buscá el contacto oficial",
  "   de [Acreedor] en su sitio web.\"",
  "   Nunca dejes marcadores vacíos como [número]",
  "   en el output.",
  "",
  "6. Nunca prometas resultados específicos.",
  "   No garantices aprobación de crédito.",
  "   No garantices fechas exactas de mejora.",
  "   No des asesoramiento legal.",
  "",
  "7. Español rioplatense uruguayo.",
  "   Usá \"vos\", no \"tú\".",
  "   Usá expresiones naturales del mercado local.",
  "   Nunca uses el término \"DTI\" en ninguna sección del output",
  "   (resumen ejecutivo, hallazgos, acciones, horizonte ni diferencias).",
  "   Usá español claro según el contexto, por ejemplo:",
  "   \"la parte de tu ingreso que ya está comprometida con pagos\",",
  "   \"cuánto de lo que ganás ya está destinado a pagar deudas\",",
  "   o \"tu carga de pagos mensual respecto a tu ingreso\".",
  "   Elegí la formulación más natural en cada caso.",
  "",
  "8. Sé conciso y sin ecos.",
  "   Cada campo comunica una sola idea.",
  "   Cada sección aporta algo que las demás no tienen.",
  "   Nunca repitas el mismo dato en más de",
  "   dos secciones del informe.",
  "",
  "==================================================",
  "ARQUITECTURA DEL INFORME",
  "==================================================",
  "",
  "El informe tiene 5 secciones con roles únicos.",
  "Cada sección empuja al usuario un paso adelante.",
  "Ninguna sección repite lo que dijo la anterior.",
  "",
  "seccion_1_resumen_ejecutivo:",
  "Rol: \"Esto es lo que encontramos.\"",
  "Sintetiza. No detalla.",
  "El usuario entiende su situación en 30 segundos.",
  "No menciones nombres de acreedores específicos.",
  "Podés mencionar tipos de deuda o diferencias",
  "detectadas en términos generales.",
  "No repitas en otras secciones lo que dijiste aquí.",
  "",
  "seccion_3_nota_diferencias:",
  "Rol: \"Esto es lo que el sistema registra",
  "y no figuraba en tu diagnóstico previo.\"",
  "Solo hechos nuevos para el usuario.",
  "Solo datos que difieren de lo declarado.",
  "No interpretes aquí. Solo mostrá los hechos.",
  "",
  "seccion_4_hallazgos:",
  "Rol: \"Esto es lo que significa.\"",
  "Interpretá los datos. No los repitas.",
  "Conectá causa con efecto.",
  "Explicá por qué la situación es como es.",
  "Ejemplo correcto:",
  "\"Con esta deuda incluida, tu carga mensual",
  "supera tu ingreso disponible. Eso explica",
  "por qué el sistema te rechaza aunque percibas",
  "que estás más o menos al día.\"",
  "",
  "seccion_5_acciones:",
  "Rol: \"Esto es lo que hacés esta semana.\"",
  "Acciones físicas y concretas.",
  "No consejos genéricos.",
  "Priorizá por urgencia real.",
  "La acción inmediata debe ser ejecutable hoy.",
  "Usá temporalidad concreta:",
  "\"Esta semana\", \"Antes de fin de mes\", \"Hoy\".",
  "",
  "seccion_6_horizonte:",
  "Rol: \"Esto es lo que viene si actuás.\"",
  "Proyectá. No diagnostiques de nuevo.",
  "Conectá las acciones con resultados concretos.",
  "Usá categorías BCU reales cuando aplique.",
  "Ejemplo correcto:",
  "\"Si regularizás la mora activa en los próximos",
  "60 días, tu categoría BCU podría mejorar de 3",
  "a 2B en el reporte siguiente. Eso suele reabrir",
  "algunas puertas de crédito en financieras.\"",
  "Si corresponde, mencioná que los cambios en BCU",
  "suelen reflejarse con cierto retraso respecto",
  "a la fecha de regularización.",
  "No uses plazos fijos obligatorios.",
  "",
  "==================================================",
  "REGLAS DE COHERENCIA INTERNA",
  "==================================================",
  "",
  "REGLA 1 — SIN ECOS:",
  "Un acreedor específico no puede aparecer",
  "en más de una sección analítica.",
  "Si aparece en seccion_3_nota_diferencias,",
  "no debe volver a aparecer en seccion_4_hallazgos",
  "salvo que sea indispensable para explicar",
  "una consecuencia que no puede explicarse",
  "de otra forma.",
  "Elegí donde tiene más impacto y usálo ahí.",
  "",
  "REGLA 2 — DEUDAS NO DECLARADAS:",
  "Una deuda no declarada NUNCA puede aparecer",
  "como fortaleza, aunque esté al día.",
  "Una deuda que el sistema descubrió es siempre",
  "un factor de riesgo o de atención.",
  "Nunca la listes en fortalezas.",
  "",
  "REGLA 3 — DTI CORRECTO:",
  "El DTI se calcula con:",
  "pagos_mensuales / ingreso_mensual.",
  "NUNCA uses deuda_total / ingreso_mensual.",
  "Eso produce un DTI artificialmente alto",
  "que destruye la credibilidad del informe.",
  "Si el input no tiene pagos mensuales declarados,",
  "no calcules ni menciones el DTI.",
  "",
  "REGLA 4 — HALLAZGOS EXPLICAN, NO RESUMEN:",
  "Los hallazgos interpretan los datos.",
  "No repiten lo que dijo seccion_1_resumen_ejecutivo.",
  "Cada hallazgo responde:",
  "\"¿Qué significa esto para el usuario?\"",
  "",
  "REGLA 5 — HORIZONTE PROYECTA, NO REPITE:",
  "seccion_6_horizonte mira hacia adelante.",
  "No repite el diagnóstico actual.",
  "Responde: \"¿Qué pasa si el usuario actúa?\"",
  "",
  "REGLA 6 — ACREEDORES SIN TELÉFONO:",
  "Si el input no incluye teléfono del acreedor:",
  "Usá \"Comunicate con atención al cliente",
  "de [Acreedor]\" o \"Buscá el contacto oficial",
  "de [Acreedor] en su sitio web.\"",
  "Nunca dejes [número] vacío en el output.",
  "",
  "REGLA 7 — HALLAZGOS NO DUPLICAN ACCIONES:",
  "Los hallazgos explican. Las acciones indican.",
  "Un hallazgo nunca debe contener una recomendación.",
  "Una acción nunca debe explicar el diagnóstico.",
  "Ejemplo incorrecto en hallazgo:",
  "\"Deberías contactar a OCA para regularizar.\"",
  "Ejemplo incorrecto en acción:",
  "\"OCA tiene 75 días de mora lo que indica",
  "un riesgo elevado en tu perfil.\"",
  "",
  "REGLA 8 — PRIORIZACIÓN:",
  "Si existen múltiples problemas en el input,",
  "identificá cuál es el principal bloqueador.",
  "El informe debe girar alrededor de ese bloqueador.",
  "No distribuyas la atención de forma uniforme.",
  "El usuario debe entender claramente:",
  "\"Si resuelvo una sola cosa primero,",
  "debe ser esta.\"",
  "",
  "Criterio de priorización:",
  "1. Deuda no declarada (nueva información)",
  "2. Mora activa con categoría BCU \"3\", \"4\" o \"5\"",
  "3. Flujo mensual negativo estructural",
  "4. Diferencia de monto > 30%",
  "5. Otros factores",
  "",
  "Si el principal bloqueador es claro,",
  "las demás secciones deben referirse a él",
  "como el factor determinante.",
  "",
  "Ejemplo correcto:",
  "\"El principal problema es el préstamo",
  "de $33.000 que no figuraba en tu diagnóstico.",
  "Por eso, aunque regularices OCA, el sistema",
  "sigue viendo un riesgo elevado.\"",
  "",
  "Ejemplo incorrecto:",
  "\"Tenés una deuda no declarada, mora en OCA,",
  "flujo negativo y categoría BCU 3.\"",
  "(enumera todo sin priorizar)",
  "",
  "REGLA 9 — DIFERENCIAL PLUS:",
  "Si existen diferencias entre lo declarado",
  "y lo registrado en BCU o Clearing,",
  "esas diferencias deben ser el hallazgo",
  "más importante del informe.",
  "El usuario debe comprender claramente:",
  "\"Esto es lo que Mi Plan Plus me mostró",
  "que yo no sabía.\"",
  "",
  "Asegurate de que en seccion_3_nota_diferencias",
  "o en seccion_4_hallazgos quede explícito",
  "qué información el usuario no tenía",
  "antes de ver este informe.",
  "",
  "Ejemplo correcto:",
  "\"El BCU registra un préstamo que no figuraba",
  "en tu diagnóstico original. Esa es la",
  "información que hoy cambia tu plan de acción.\"",
  "",
  "Ejemplo incorrecto:",
  "\"El sistema muestra $78.000 mientras vos",
  "declaraste $45.000.\"",
  "(muestra la diferencia pero no explica",
  "que eso es nuevo para el usuario)",
  "",
  "REGLA 10 — DENSIDAD DE INFORMACIÓN:",
  "Cada oración debe aportar información nueva.",
  "Si una oración puede eliminarse sin perder",
  "información relevante, no la escribas.",
  "",
  "Evitá frases de transición vacías:",
  "\"Es importante destacar que...\"",
  "\"Cabe señalar que...\"",
  "\"Por otra parte...\"",
  "\"En este contexto...\"",
  "",
  "Andá directo al punto.",
  "",
  "REGLA 11 — ACCIÓN INMEDIATA NO DUPLICA ACCIONES:",
  "La accion_inmediata y la primera acción",
  "del array acciones no pueden ser la misma.",
  "La accion_inmediata es el paso más urgente",
  "expresado de forma destacada.",
  "Las acciones son pasos complementarios.",
  "Si la acción más urgente ya está en",
  "accion_inmediata, la primera acción del",
  "array debe ser la siguiente en prioridad,",
  "no la misma reformulada.",
  "",
  "REGLA 12 — LÍMITE DE MENCIONES POR CONCEPTO:",
  "Flujo negativo: máximo 2 menciones en todo",
  "el informe. Elegí las secciones donde",
  "tiene más impacto explicativo.",
  "Categoría BCU: máximo 2 menciones en todo",
  "el informe. Centralizá en seccion_4_hallazgos",
  "y seccion_6_horizonte.",
  "",
  "==================================================",
  "REGLAS DE URGENCIA",
  "==================================================",
  "",
  "urgencia SIEMPRE alta cuando:",
  "- deuda no declarada por el usuario",
  "- mora activa en BCU o Clearing",
  "- la categoría BCU en el input es \"3\", \"4\" o \"5\"",
  "- diferencia declarado vs registrado > 30%",
  "- acreedor desconocido por el usuario",
  "- dias_restantes_en_historial < 180",
  "",
  "urgencia media cuando:",
  "- atraso 30 a 60 días sin mora formal",
  "- diferencia de monto 10% a 30%",
  "- la categoría BCU en el input es \"2A\" o \"2B\"",
  "- acción recomendada no urgente",
  "",
  "urgencia baja SOLO cuando:",
  "- situación al día sin excepciones",
  "- información contextual sin acción requerida",
  "- la categoría BCU en el input es \"1A\" o \"1C\"",
  "- hallazgo puramente explicativo",
  "",
  "NUNCA marques como baja:",
  "- una deuda no declarada",
  "- una mora activa",
  "- una diferencia > 20% del monto total",
  "- un acreedor que el usuario desconocía",
  "",
  "==================================================",
  "REGLAS DE LONGITUD",
  "==================================================",
  "",
  "seccion_1_resumen_ejecutivo.situacion_general:",
  "2 oraciones máximo.",
  "Primera: situación general.",
  "Segunda: el hallazgo más importante.",
  "",
  "seccion_1_resumen_ejecutivo.fortalezas:",
  "Máximo 2 items.",
  "Solo fortalezas reales y verificadas.",
  "NUNCA incluir deudas no declaradas.",
  "1 oración por item.",
  "",
  "seccion_1_resumen_ejecutivo.riesgos:",
  "Máximo 3 items.",
  "Ordenados por urgencia descendente.",
  "1 oración por item.",
  "",
  "seccion_1_resumen_ejecutivo.bloqueador_principal:",
  "1 oración. El factor más urgente.",
  "",
  "seccion_1_resumen_ejecutivo.horizonte_resumen:",
  "1 oración. Optimista pero realista.",
  "",
  "seccion_3_nota_diferencias:",
  "2 oraciones máximo si hay diferencias.",
  "Solo hechos. Sin interpretación.",
  "null si no hay diferencias.",
  "",
  "seccion_4_hallazgos.interpretacion_general:",
  "2 oraciones. Conecta datos con consecuencias.",
  "",
  "seccion_4_hallazgos.hallazgos:",
  "Máximo 3 items.",
  "Cada descripción: 1 oración que interpreta,",
  "no que resume.",
  "",
  "seccion_4_hallazgos.patron_detectado:",
  "1 oración o null.",
  "",
  "seccion_4_hallazgos.perfil_riesgo_real:",
  "1 oración.",
  "",
  "seccion_4_hallazgos.diferencia_perfil_declarado_vs_real:",
  "1 oración o null.",
  "",
  "seccion_5_acciones.acciones:",
  "Máximo 4 items ordenados por urgencia.",
  "Cada descripción: 1 oración ejecutable.",
  "Usá temporalidad: \"Esta semana\", \"Hoy\",",
  "\"Antes de fin de mes\".",
  "",
  "seccion_5_acciones.accion_inmediata.titulo:",
  "Máximo 6 palabras.",
  "",
  "seccion_5_acciones.accion_inmediata.descripcion:",
  "2 oraciones.",
  "Primera: qué hacer exactamente.",
  "Segunda: por qué es urgente ahora.",
  "",
  "seccion_6_horizonte.situacion_actual:",
  "1 oración. Estado real hoy.",
  "",
  "seccion_6_horizonte.escenario_probable.descripcion:",
  "2 oraciones. Qué pasa si actúa.",
  "No repitas el diagnóstico.",
  "",
  "seccion_6_horizonte.escenario_probable.tiempo_estimado:",
  "1 frase con rango real.",
  "Ejemplo: \"Entre 45 y 90 días.\"",
  "",
  "seccion_6_horizonte.escenario_probable.condiciones:",
  "Máximo 3 items.",
  "",
  "seccion_6_horizonte.que_debe_cambiar:",
  "Máximo 3 items.",
  "Sin repetir acciones ya listadas",
  "en seccion_5_acciones.",
  "",
  "seccion_6_horizonte.horizonte_recalificacion.estimacion:",
  "1 oración con rango y referencia a categoría",
  "BCU cuando aplique.",
  "",
  "seccion_6_horizonte.horizonte_recalificacion.factores_bloqueantes:",
  "Máximo 3 items. Concretos.",
  "",
  "seccion_6_horizonte.horizonte_recalificacion.factores_favorables:",
  "Máximo 3 items. Reales, no genéricos.",
  "",
  "==================================================",
  "REGLAS DIFERENCIAS",
  "==================================================",
  "",
  "no_declarado:",
  "Mencioná que existe información en el sistema",
  "que no estaba en el diagnóstico previo.",
  "Sin juicio.",
  "",
  "cartera_vendida:",
  "Explicá brevemente que algunas deudas cambian",
  "de acreedor por cesión de cartera.",
  "Es un proceso normal del mercado financiero.",
  "",
  "monto:",
  "\"El saldo registrado es mayor al declarado.\"",
  "",
  "estado:",
  "Mencioná que el estado registrado difiere",
  "del declarado. Sin juicio.",
  "",
  "Sin diferencias: null.",
  "",
  "==================================================",
  "ASUNTOS CANCELADOS HISTÓRICOS",
  "==================================================",
  "",
  "Si existen asuntos_cancelados_historicos:",
  "Incluí máximo 1 hallazgo explicando que",
  "registros cancelados pueden permanecer visibles",
  "hasta 3 años según normativa uruguaya.",
  "Si dias_restantes_en_historial < 365,",
  "mencioná el tiempo restante aproximado.",
  "Encuadralo como información útil,",
  "no como problema activo.",
  "",
  "==================================================",
  "EJEMPLOS DE CALIDAD ESPERADA",
  "==================================================",
  "",
  "situacion_general CORRECTO:",
  "\"Tu situación es recuperable pero requiere",
  "acción inmediata. El sistema financiero registra",
  "$33.000 más de deuda de lo que declaraste,",
  "incluyendo un préstamo que no figuraba en",
  "tu diagnóstico previo.\"",
  "",
  "situacion_general INCORRECTO:",
  "\"Tu situación financiera presenta varios",
  "factores de riesgo que es importante considerar",
  "para mejorar tu perfil crediticio.\"",
  "(genérico, no dice nada nuevo)",
  "",
  "hallazgo CORRECTO:",
  "\"Con esta deuda incluida, tu carga mensual",
  "supera tu ingreso disponible — eso explica",
  "por qué el sistema te rechaza aunque percibas",
  "que estás más o menos al día.\"",
  "",
  "hallazgo INCORRECTO:",
  "\"Existe una deuda no declarada de $33.000",
  "que representa un riesgo para tu perfil.\"",
  "(repite el dato, no lo interpreta)",
  "",
  "diferencial Plus CORRECTO:",
  "\"El BCU registra un préstamo que no figuraba",
  "en tu diagnóstico original. Esa es la",
  "información que hoy cambia tu plan de acción.\"",
  "",
  "diferencial Plus INCORRECTO:",
  "\"El sistema muestra $78.000 mientras vos",
  "declaraste $45.000.\"",
  "(muestra la diferencia pero no explica",
  "que eso es nuevo para el usuario)",
  "",
  "accion CORRECTO:",
  "\"Esta semana: comunicate con atención al",
  "cliente de [Acreedor] y pedí el saldo",
  "actualizado con opciones de regularización.\"",
  "",
  "accion INCORRECTO:",
  "\"Contactá a tu acreedor para negociar.\"",
  "(genérico, sin temporalidad)",
  "",
  "horizonte CORRECTO:",
  "\"Si regularizás la mora activa en los próximos",
  "60 días, tu categoría BCU podría mejorar de 3",
  "a 2B en el reporte siguiente — eso suele",
  "reabrir puertas en financieras que hoy",
  "te rechazan automáticamente.\"",
  "",
  "horizonte INCORRECTO:",
  "\"Con esfuerzo y disciplina financiera podrías",
  "mejorar tu situación en el mediano plazo.\"",
  "(genérico, sin datos, sin acción)",
  "",
  "==================================================",
  "OUTPUT FORMAT",
  "==================================================",
  "",
  "Respondé ÚNICAMENTE con este JSON.",
  "Sin texto antes ni después.",
  "Sin markdown. Sin bloques de código.",
  "",
  "{",
  "  \"seccion_1_resumen_ejecutivo\": {",
  "    \"situacion_general\": \"string\",",
  "    \"fortalezas\": [",
  "      { \"titulo\": \"string\", \"descripcion\": \"string\" }",
  "    ],",
  "    \"riesgos\": [",
  "      {",
  "        \"titulo\": \"string\",",
  "        \"descripcion\": \"string\",",
  "        \"urgencia\": \"alta | media | baja\"",
  "      }",
  "    ],",
  "    \"bloqueador_principal\": {",
  "      \"tipo\": \"string\",",
  "      \"descripcion\": \"string\"",
  "    },",
  "    \"horizonte_resumen\": \"string\",",
  "    \"nota_disclaimer\": \"Este informe se basa en la información disponible al momento de la consulta y no constituye asesoramiento financiero ni legal.\"",
  "  },",
  "  \"seccion_3_nota_diferencias\": \"string | null\",",
  "  \"seccion_4_hallazgos\": {",
  "    \"interpretacion_general\": \"string\",",
  "    \"hallazgos\": [",
  "      {",
  "        \"id\": \"string\",",
  "        \"titulo\": \"string\",",
  "        \"descripcion\": \"string\",",
  "        \"fuente\": \"bcu | clearing | diferencias | miplan | combinado\",",
  "        \"severidad\": \"alta | media | baja\"",
  "      }",
  "    ],",
  "    \"patron_detectado\": \"string | null\",",
  "    \"perfil_riesgo_real\": \"string\",",
  "    \"diferencia_perfil_declarado_vs_real\": \"string | null\"",
  "  },",
  "  \"seccion_5_acciones\": {",
  "    \"acciones\": [",
  "      {",
  "        \"id\": \"string\",",
  "        \"orden\": 0,",
  "        \"titulo\": \"string\",",
  "        \"descripcion\": \"string\",",
  "        \"tipo\": \"accion | habito | contacto\",",
  "        \"urgencia\": \"alta | media | baja\",",
  "        \"fuente_dato\": \"bcu | clearing | diferencias | miplan | combinado\",",
  "        \"acreedor_relacionado\": \"string | null\"",
  "      }",
  "    ],",
  "    \"accion_inmediata\": {",
  "      \"titulo\": \"string\",",
  "      \"descripcion\": \"string\"",
  "    }",
  "  },",
  "  \"seccion_6_horizonte\": {",
  "    \"situacion_actual\": \"string\",",
  "    \"escenario_probable\": {",
  "      \"descripcion\": \"string\",",
  "      \"tiempo_estimado\": \"string\",",
  "      \"condiciones\": [\"string\"]",
  "    },",
  "    \"que_debe_cambiar\": [\"string\"],",
  "    \"horizonte_recalificacion\": {",
  "      \"estimacion\": \"string\",",
  "      \"factores_bloqueantes\": [\"string\"],",
  "      \"factores_favorables\": [\"string\"]",
  "    }",
  "  }",
  "}",
  "",
].join("\n");

// -----------------------------------------------------------------------------
// MOCK INPUT — fixed prototype dataset (no randomization)
// -----------------------------------------------------------------------------
function getMockPlusInput() {
  return {
    meta: {
      fuente: "mock_sprint_14_2",
      version_input: "1.0",
      pais: "UY",
      moneda: "UYU",
      generado_en: "2025-05-28T12:00:00.000Z",
    },
    usuario: {
      nombre: PRE.nombre,
      cedula: PRE.cedula,
      email: PRE.email,
      telefono: PRE.telefono,
      ingreso_declarado: PRE.ingreso,
      situacion_laboral: PRE.laboral,
      segmento: SEGMENTO,
    },
    encuesta_riesgo: {
      completada: TIENE_ENCUESTA,
      respuestas: PRE.respuestas,
    },
    diagnostico_miplan_declarado: {
      plan_id: 4,
      plan_titulo: "Estabilizacion critica",
      score_reset: 9,
      nivel_reset: "C",
      nivel_riesgo_financiero: "Critico",
      total_deuda_declarada: 45000,
      pago_mensual_declarado: 8500,
      total_gastos_declarados: 52000,
      flujo_libre_estimado: -15500,
      dti_ratio: 0.65,
      dti_level: "alto",
      interes_promedio_estimado: 58,
      bloqueadores_declarados: [
        "Flujo mensual negativo",
        "Deuda con atraso en tarjeta",
        "Capacidad de pago comprometida",
      ],
      horizonte_miplan: {
        banda: "largo",
        label: "Mas de 18 meses",
        meses_estimados: 24,
      },
    },
    deudas_declaradas: [
      {
        acreedor: "OCA",
        acreedor_display: "OCA",
        tipo: "tarjeta",
        monto: 45000,
        pago_mensual: 5500,
        situacion_ui: "atrasado_pagando",
        estado: "atraso",
      },
    ],
    gastos_declarados_resumen: {
      total_mensual: 52000,
      categorias_principales: [
        { categoria: "vivienda", monto: 22000 },
        { categoria: "alimentacion", monto: 14000 },
        { categoria: "transporte", monto: 8000 },
        { categoria: "otros", monto: 8000 },
      ],
    },
    registro_bcu: {
      calificacion: "3",
      calificacion_label: "Regular",
      operaciones_vigentes: 2,
      observaciones: [
        "Historial con instabilidad en pagos",
        "Exposicion a tarjetas de credito",
      ],
    },
    registro_clearing_equifax: {
      proveedor: "Equifax",
      fecha_consulta_referencia: "2025-05-28",
      consultas_ultimos_6_meses: 2,
      deudas_registradas: [
        {
          acreedor: "OCA",
          producto: "tarjeta_credito",
          monto: 45000,
          estado: "vigente",
          situacion: "con_atraso",
        },
        {
          acreedor: "Financiera del Este",
          producto: "prestamo_personal",
          monto: 33000,
          estado: "vigente",
          situacion: "al_dia",
        },
      ],
      total_deuda_registrada: 78000,
    },
    diferencias_declarado_vs_registro: [
      {
        tipo: "deuda_no_declarada",
        severidad: "alta",
        acreedor: "Financiera del Este",
        producto: "prestamo_personal",
        monto_declarado: 0,
        monto_registrado: 33000,
        descripcion: "Prestamo personal vigente no declarado en Mi Plan",
      },
      {
        tipo: "total_deuda",
        severidad: "media",
        monto_declarado_total: 45000,
        monto_registrado_total: 78000,
        diferencia: 33000,
        descripcion: "El total registrado supera lo declarado",
      },
    ],
    contexto_producto: {
      producto: "mi_plan_plus",
      precio_uyu: 1290,
      incluye: ["BCU", "Clearing", "IA", "PDF"],
    },
  };
}

function buildPlusInput() {
  throw new Error("Plus real pipeline not implemented");
}

function getPlusReportInput() {
  if (typeof CZ_PLUS_USE_MOCK !== "undefined" && CZ_PLUS_USE_MOCK) {
    return getMockPlusInput();
  }
  return buildPlusInput();
}

function _extractOutermostJsonObject(rawText) {
  var startIdx = rawText.indexOf("{");
  if (startIdx === -1) {
    throw new Error("No JSON block found in LLM output");
  }

  var depth = 0;
  var inString = false;
  var escaped = false;

  for (var i = startIdx; i < rawText.length; i++) {
    var ch = rawText[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return rawText.substring(startIdx, i + 1);
      }
    }
  }

  throw new Error("Incomplete JSON object in LLM output");
}

function _sanitizePlusInformeJsonString(jsonStr) {
  var s = jsonStr.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  // Trailing commas before ] or } (common LLM mistake)
  s = s.replace(/,(\s*[\]}])/g, "$1");
  return s;
}

function parsePlusInformeFromLlmText(rawText) {
  var cleanJson = _extractOutermostJsonObject(rawText);
  cleanJson = _sanitizePlusInformeJsonString(cleanJson);

  try {
    return JSON.parse(cleanJson);
  } catch (parseErr) {
    var retry = cleanJson.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(retry);
  }
}

function extractAnthropicMessageText(apiResponse) {
  var blocks = apiResponse && apiResponse.content;
  if (!blocks || !blocks.length) {
    throw new Error("Empty Anthropic response content");
  }
  var text = "";
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "text" && blocks[i].text) {
      text += blocks[i].text;
    }
  }
  if (!text) {
    throw new Error("No text block in Anthropic response");
  }
  return text;
}

/* MIGRATION NOTE:

To move to backend:

var response = await fetch("/api/plus/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(inputData)
});

Everything else in generarInformePlus()
stays unchanged.

*/
async function _fetchPlusReportProvider(inputData) {
  var apiKey = typeof CZ_CLAUDE_API_KEY !== "undefined" ? CZ_CLAUDE_API_KEY : "";
  if (!apiKey) {
    throw new Error("CZ_CLAUDE_API_KEY not configured");
  }

  var headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // Enable only if Anthropic browser restrictions block localhost testing.
  if (typeof CZ_CLAUDE_ALLOW_BROWSER_KEY !== "undefined" && CZ_CLAUDE_ALLOW_BROWSER_KEY) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: typeof CZ_CLAUDE_MODEL !== "undefined"
        ? CZ_CLAUDE_MODEL
        : "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: CZ_PLUS_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: "Generá el informe Mi Plan Plus completo según el schema JSON. "
          + "Datos de entrada:\n"
          + JSON.stringify(inputData, null, 2),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error("Anthropic API Error: " + response.status);
  }

  return response.json();
}

async function generarInformePlus(opts) {
  opts = opts || {};
  var st = window.CZState;
  var useTestInput = !!opts.useTestInput;

  try {
    if (useTestInput) {
      st._plusInformeTestError = false;
    }
    var inputData = useTestInput ? getMockPlusInput() : getPlusReportInput();
    var apiResponse = await _fetchPlusReportProvider(inputData);
    var rawText = extractAnthropicMessageText(apiResponse);
    var informe = parsePlusInformeFromLlmText(rawText);

    st.plus_informe = informe;
    st.plus_report_id = "plus_" + Date.now();

    if (typeof setPlusStatus === "function") {
      setPlusStatus("PLUS_READY", { report_id: st.plus_report_id });
    } else {
      st.plus_status = "PLUS_READY";
      window.guardarLocal();
    }

    if (
      st.tab === "plus"
      && window.CredizonaUI
      && typeof window.CredizonaUI.renderTab === "function"
    ) {
      window.CredizonaUI.renderTab();
    }
  } catch (err) {
    console.error(err);

    if (useTestInput) {
      st._plusInformeTestError = true;
    }

    if (typeof setPlusStatus === "function") {
      setPlusStatus("PLUS_ERROR");
    } else {
      st.plus_status = "PLUS_ERROR";
      window.guardarLocal();
    }

    if (
      window.CZState.tab === "plus"
      && window.CredizonaUI
      && typeof window.CredizonaUI.renderTab === "function"
    ) {
      window.CredizonaUI.renderTab();
    }
  }
}

// =============================================================================
// Sprint 14.4 — Plus PDF export (html2pdf > jsPDF > print fallback)
// =============================================================================
function _plusPdfEsc(s) {
  if (s == null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _plusPdfDateFormatted() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + "/" + mm + "/" + d.getFullYear();
}

function _plusPdfFilename() {
  return "credizona-mi-plan-plus-" + new Date().toISOString().slice(0, 10) + ".pdf";
}

function _plusPdfLogoSrc() {
  var b64 = typeof CZ_CREDIZONA_LOGO_BASE64 !== "undefined" ? CZ_CREDIZONA_LOGO_BASE64 : "";
  if (!b64) return "";
  return "data:image/svg+xml;base64," + b64;
}

function _plusPdfBloqueadorTexto(b) {
  if (!b) return "";
  if (typeof b === "string") return b;
  return b.descripcion || b.tipo || "";
}

function _plusPdfList(items, mapper) {
  if (!items || !items.length) return "<p>—</p>";
  return "<ul>" + items.map(mapper).join("") + "</ul>";
}

function buildPlusPdfHtml(informe) {
  informe = informe || {};
  var sec1 = informe.seccion_1_resumen_ejecutivo || {};
  var sec4 = informe.seccion_4_hallazgos || {};
  var sec5 = informe.seccion_5_acciones || {};
  var sec6 = informe.seccion_6_horizonte || {};
  var escProb = sec6.escenario_probable || {};
  var horizRec = sec6.horizonte_recalificacion || {};
  var accionInmediata = sec5.accion_inmediata || {};
  var logoSrc = _plusPdfLogoSrc();
  var footerText = "Generado por Credizona Mi Plan Plus. Este informe se basa en la información "
    + "disponible al momento de la consulta y no constituye asesoramiento financiero ni legal.";

  var body = "";

  body += '<div class="cover">'
    + (logoSrc
      ? '<img src="' + logoSrc + '" alt="Credizona" class="cover-logo"/>'
      : '<div class="cover-logo-fallback">Credizona</div>')
    + "<h1>Credizona Mi Plan Plus</h1>"
    + "<p class=\"cover-sub\">Informe Financiero Personalizado</p>"
    + "<p class=\"cover-date\">Fecha: " + _plusPdfEsc(_plusPdfDateFormatted()) + "</p>"
    + "</div>";

  body += '<div class="section"><h2>Tu situación financiera hoy</h2>'
    + "<p>" + _plusPdfEsc(sec1.situacion_general) + "</p>"
    + "<h3>Fortalezas</h3>"
    + _plusPdfList(sec1.fortalezas || [], function(item) {
        return "<li><strong>" + _plusPdfEsc(item.titulo) + "</strong> — "
          + _plusPdfEsc(item.descripcion) + "</li>";
      })
    + "<h3>Riesgos</h3>"
    + _plusPdfList(sec1.riesgos || [], function(item) {
        return "<li><strong>" + _plusPdfEsc(item.titulo) + "</strong> — "
          + _plusPdfEsc(item.descripcion) + "</li>";
      })
    + "<h3>Bloqueador principal</h3>"
    + "<p>" + _plusPdfEsc(_plusPdfBloqueadorTexto(sec1.bloqueador_principal)) + "</p>"
    + "<h3>Horizonte</h3>"
    + "<p>" + _plusPdfEsc(sec1.horizonte_resumen) + "</p>"
    + "</div>";

  if (informe.seccion_3_nota_diferencias) {
    body += '<div class="section"><h2>Diferencias detectadas</h2>'
      + "<p>" + _plusPdfEsc(informe.seccion_3_nota_diferencias) + "</p></div>";
  }

  body += '<div class="section"><h2>Qué significa esto</h2>'
    + "<p>" + _plusPdfEsc(sec4.interpretacion_general) + "</p>";

  (sec4.hallazgos || []).forEach(function(h) {
    body += "<h3>" + _plusPdfEsc(h.titulo) + "</h3>"
      + "<p>" + _plusPdfEsc(h.descripcion) + "</p>";
  });

  if (sec4.patron_detectado) {
    body += "<h3>Patrón detectado</h3><p>" + _plusPdfEsc(sec4.patron_detectado) + "</p>";
  }

  body += "<h3>Perfil de riesgo real</h3>"
    + "<p>" + _plusPdfEsc(sec4.perfil_riesgo_real) + "</p>";

  if (sec4.diferencia_perfil_declarado_vs_real) {
    body += "<h3>Diferencia declarado vs real</h3><p>"
      + _plusPdfEsc(sec4.diferencia_perfil_declarado_vs_real) + "</p>";
  }

  body += "</div>";

  body += '<div class="section"><h2>Qué hacer ahora</h2>'
    + "<h3>" + _plusPdfEsc(accionInmediata.titulo) + "</h3>"
    + "<p>" + _plusPdfEsc(accionInmediata.descripcion) + "</p>";

  (sec5.acciones || []).forEach(function(act, idx) {
    body += "<h3>" + _plusPdfEsc(act.titulo || ("Acción " + (idx + 1))) + "</h3>"
      + "<p>" + _plusPdfEsc(act.descripcion) + "</p>";
  });

  body += "</div>";

  body += '<div class="section"><h2>Tu horizonte</h2>'
    + "<p>" + _plusPdfEsc(sec6.situacion_actual) + "</p>"
    + "<h3>Escenario probable</h3>"
    + "<p>" + _plusPdfEsc(escProb.descripcion) + "</p>"
    + "<h3>Tiempo estimado</h3>"
    + "<p>" + _plusPdfEsc(escProb.tiempo_estimado || sec6.tiempo_estimado || "") + "</p>"
    + "<h3>Condiciones</h3>"
    + _plusPdfList(escProb.condiciones || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Qué debe cambiar</h3>"
    + _plusPdfList(sec6.que_debe_cambiar || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Estimación de recalificación</h3>"
    + "<p>" + _plusPdfEsc(horizRec.estimacion || sec6.estimacion || "") + "</p>"
    + "<h3>Factores bloqueantes</h3>"
    + _plusPdfList(horizRec.factores_bloqueantes || sec6.factores_bloqueantes || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Factores favorables</h3>"
    + _plusPdfList(horizRec.factores_favorables || sec6.factores_favorables || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "</div>";

  body += '<div class="pdf-footer">' + _plusPdfEsc(footerText) + "</div>";

  return "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\"/>"
    + "<title>Credizona Mi Plan Plus</title>"
    + "<style>"
    + "body{margin:0;padding:24px;font-family:Inter,Arial,sans-serif;background:#fff;color:#1a1f36;line-height:1.5;}"
    + ".cover{text-align:center;padding:48px 16px 56px;page-break-after:always;border-bottom:1px solid #e5e7ef;}"
    + ".cover-logo{max-width:220px;height:auto;margin:0 auto 24px;display:block;}"
    + ".cover-logo-fallback{font-size:28px;font-weight:800;color:#2563eb;margin-bottom:24px;}"
    + ".cover h1{font-size:24px;margin:0 0 8px;}"
    + ".cover-sub{font-size:16px;color:#4b5563;margin:0 0 12px;}"
    + ".cover-date{font-size:14px;color:#6b7280;margin:0;}"
    + ".section{margin-bottom:28px;page-break-inside:avoid;}"
    + ".section h2{font-size:18px;border-bottom:1px solid #e5e7ef;padding-bottom:8px;margin:0 0 12px;}"
    + ".section h3{font-size:14px;margin:16px 0 6px;color:#374151;}"
    + ".section p,.section li{font-size:13px;}"
    + ".section ul{margin:0;padding-left:18px;}"
    + ".pdf-footer{margin-top:36px;padding-top:16px;border-top:1px solid #e5e7ef;font-size:11px;color:#6b7280;}"
    + "@media print{body{padding:12mm;}}"
    + "</style></head><body>" + body + "</body></html>";
}

function _plusPdfPrintFallback(htmlContent, filename) {
  var win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    alert("Permití ventanas emergentes para descargar el PDF.");
    return;
  }
  win.document.open();
  win.document.write(htmlContent);
  win.document.close();
  win.document.title = filename.replace(/\.pdf$/i, "");
  setTimeout(function() {
    win.focus();
    win.print();
  }, 450);
}

async function sendPlusReportEmail(payload) {
  /* MIGRATION NOTE:
     Replace with:
     await fetch("/api/plus/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
     });
  */
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve({ ok: true });
    }, 800);
  });
}

async function downloadPlusReportPdf() {
  var st = window.CZState;
  if (!st || st.plus_status !== "PLUS_READY" || !st.plus_informe) return;

  var html = buildPlusPdfHtml(st.plus_informe);
  var filename = _plusPdfFilename();

  try {
    if (typeof html2pdf !== "undefined") {
      var container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "210mm";
      container.innerHTML = html;
      document.body.appendChild(container);
      await html2pdf()
        .set({
          filename: filename,
          margin: 12,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .save();
      document.body.removeChild(container);
    } else if (
      (typeof jspdf !== "undefined" || (window.jspdf && window.jspdf.jsPDF))
      && typeof html2canvas !== "undefined"
    ) {
      _plusPdfPrintFallback(html, filename);
    } else {
      _plusPdfPrintFallback(html, filename);
    }
  } catch (err) {
    console.error(err);
    _plusPdfPrintFallback(html, filename);
  }

  var id = window.CZIdentity || {};
  var czuid = id.crm_contact_id || id.anonymous_id || null;
  var planId = st.diag ? st.diag.planId : null;

  if (typeof trackEvent === "function") {
    trackEvent("plus_pdf_downloaded", {
      czuid:          czuid,
      plan_id:        planId,
      plus_report_id: st.plus_report_id,
    });
  }
  if (typeof trackCRMEvent === "function") {
    trackCRMEvent("plus_pdf_downloaded", {
      czuid:          czuid,
      plus_report_id: st.plus_report_id,
      downloaded_at:  new Date().toISOString(),
    });
  }

  st.plus_pdf_downloaded = true;
  if (typeof window.guardarLocal === "function") window.guardarLocal();
}

window.generarInformePlus = generarInformePlus;
window.getMockPlusInput = getMockPlusInput;
window.buildPlusInput = buildPlusInput;
window.downloadPlusReportPdf = downloadPlusReportPdf;
window.sendPlusReportEmail = sendPlusReportEmail;
