/**
 * server/bin/janus-export-db-local-test.js — MIPLAN-JANUS-EXPORT-01 SQL contract (export + ACK).
 *
 * DB CLASSIFICATION: LOCAL. In-process, in-memory PGlite (Postgres compiled to WASM); never reads
 * SUPABASE_* env vars and never opens a network connection. PGlite is not a repo dependency:
 * PGLITE_DIR points at an installed @electric-sql/pglite
 * (default: %TEMP%/stage2-pglite/node_modules/@electric-sql/pglite). Exit 2 = SKIPPED.
 *
 * Applies the real export migration over stubs of the tables it reads (same column names and,
 * for debt_management_opt_in_events, the same CHECKs as 20261001120000), then drives it through
 * the real repository + service.
 *
 * node server/bin/janus-export-db-local-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");

var createJanusExportRepository = require("../modules/janusExport/repository").createJanusExportRepository;
var exportService = require("../modules/janusExport/service");

var PGLITE_DIR = process.env.PGLITE_DIR || path.join(os.tmpdir(), "stage2-pglite", "node_modules", "@electric-sql", "pglite");
var MIGRATION = path.join(__dirname, "..", "migrations", "20261006120000_miplan_janus_debt_optin_export.sql");
var B2 = "local-b2-secret";

var STUBS = [
  "SET TimeZone = 'UTC';",
  "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;",
  "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;",
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;",
  "CREATE SCHEMA miplan_private;",
  "CREATE TABLE miplan_private.backend_secrets (name text PRIMARY KEY, secret text NOT NULL);",
  "INSERT INTO miplan_private.backend_secrets VALUES ('b2_persist', '" + B2 + "');",
  "CREATE TABLE public.journeys (journey_id uuid PRIMARY KEY, anonymous_id text NOT NULL, entry_type text NOT NULL, bootstrap_key text UNIQUE);",
  "CREATE TABLE public.diagnoses (diagnosis_id uuid PRIMARY KEY, anonymous_id text NOT NULL, journey_id uuid, created_at timestamptz NOT NULL DEFAULT now(), input_snapshot jsonb NOT NULL);",
  "CREATE TABLE public.financial_strategy_evaluations (evaluation_id uuid PRIMARY KEY, journey_id uuid NOT NULL, anonymous_id text NOT NULL, strategy text, result jsonb NOT NULL DEFAULT '{}', origin_diagnosis_id uuid NOT NULL REFERENCES public.diagnoses);",
  "CREATE TABLE public.debt_management_opt_in_events (",
  "  event_id uuid PRIMARY KEY, journey_id uuid NOT NULL REFERENCES public.journeys, anonymous_id text NOT NULL,",
  "  scope text NOT NULL, state text NOT NULL, contract_version text NOT NULL, source text NOT NULL,",
  "  consent_text_version text NULL, origin_evaluation_id uuid NOT NULL REFERENCES public.financial_strategy_evaluations,",
  "  origin_diagnosis_id uuid NULL REFERENCES public.diagnoses, seq integer NOT NULL,",
  "  supersedes_event_id uuid NULL, supersedes_seq integer NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),",
  "  CHECK (scope = 'debt_management_interest'), CHECK (state IN ('opted_in','withdrawn')),",
  "  CHECK (contract_version = 'debt_management_opt_in_v1'), CHECK (source = 'miplan_v2'),",
  "  CHECK (consent_text_version IS NULL OR consent_text_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),",
  "  UNIQUE (journey_id, scope, seq));",
  "REVOKE ALL ON TABLE public.debt_management_opt_in_events FROM PUBLIC, anon, authenticated;",
].join("\n");

function u(prefix, n) {
  return prefix + "-0000-4000-8000-" + String(n).padStart(12, "0");
}
var J = { h1: u("a1000000", 1), virgin: u("a1000000", 2), badhash: u("a1000000", 3), h4: u("a1000000", 4) };
var D = { d1: u("d1000000", 1), d2: u("d1000000", 2), d3: u("d1000000", 3), d4a: u("d1000000", 4), d4b: u("d1000000", 5) };
var EVAL = { e1: u("e1000000", 1), e2: u("e1000000", 2), e3: u("e1000000", 3), e4: u("e1000000", 4) };
var EV = { e1: u("0e000000", 1), e2: u("0e000000", 2), e3: u("0e000000", 3), e4: u("0e000000", 4),
  e5: u("0e000000", 5), e6: u("0e000000", 6), e7: u("0e000000", 7), late: u("0e000000", 8) };
var UNKNOWN = u("0e000000", 99);
var HASH1 = "a".repeat(64);
var HASH4 = "b".repeat(64);
var ANON = "anon-secret-should-never-leave-1234";

var D1_DEBTS = [
  { id: "c-1", tipo: "tarjeta", acreedor_raw: "Tarjeta OCA", acreedor: "oca", acreedor_display: "OCA", acreedor_normalizado: "oca",
    monto: "15000", pago: 1200, situacion_ui: "atrasada", estado: "atrasada", atraso_tiempo: "3_6m", debt_confidence: "alta",
    ingreso_estimado: 99999, nota_privada: "no exportar" },
  { id: "c-2", acreedor: "anda", monto: 500, cancelada: true },
  { id: "c-3", acreedor: "brou", monto: 700, situacion_ui: "pagada" },
  { id: "c-4", acreedor: "creditel", monto: 900, _is_draft_add: true },
  5,
  { id: "c-6", acreedor: "santander", monto: 3000, situacion_ui: "reclamo_disputa", cancelada: false, _is_draft_add: false },
  null,
];

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}

async function main() {
  var PGlite;
  try {
    PGlite = require(PGLITE_DIR).PGlite;
  } catch (_e) {
    console.error("PGlite not available at " + PGLITE_DIR + " (set PGLITE_DIR). SKIPPED.");
    process.exit(2);
  }
  var db = new PGlite();
  await db.exec(STUBS);
  var sql = fs.readFileSync(MIGRATION, "utf8");
  await db.exec(sql);
  await db.exec(sql);
  check("[LOCAL] migration applies twice (idempotent)", true);

  async function q(text, params) {
    return (await db.query(text, params || [])).rows;
  }
  await q("INSERT INTO journeys VALUES ($1,$5,'janus_handoff','handoff:'||$6), ($2,$5,'virgin_miplan',NULL), ($3,$5,'janus_handoff','handoff:NOT-A-HASH'), ($4,$5,'janus_handoff','handoff:'||$7)",
    [J.h1, J.virgin, J.badhash, J.h4, ANON, HASH1, HASH4]);
  await q("INSERT INTO diagnoses (diagnosis_id, anonymous_id, journey_id, input_snapshot, created_at) VALUES " +
    "($1,$6,$7,$8::jsonb, now()-interval '20 min'), ($2,$6,$9,'{\"deudas\":[{\"acreedor\":\"oca\",\"monto\":1}]}', now()-interval '20 min'), " +
    "($3,$6,$10,'{\"ingreso\":1}', now()-interval '20 min'), ($4,$6,$11,'{\"deudas\":[{\"acreedor\":\"ute\",\"monto\":10}]}', now()-interval '20 min'), " +
    "($5,$6,$11,'{\"deudas\":[{\"acreedor\":\"ute\",\"monto\":10},{\"acreedor\":\"antel\",\"monto\":20}]}', now()-interval '1 min')",
    [D.d1, D.d2, D.d3, D.d4a, D.d4b, ANON, J.h1, JSON.stringify({ deudas: D1_DEBTS, ingreso: 50000 }), J.virgin, J.badhash, J.h4]);
  await q("INSERT INTO financial_strategy_evaluations (evaluation_id, journey_id, anonymous_id, strategy, origin_diagnosis_id) VALUES " +
    "($1,$5,$9,'CONTENCION',$10), ($2,$6,$9,'CONTENCION',$11), ($3,$7,$9,NULL,$12), ($4,$8,$9,NULL,$13)",
    [EVAL.e1, EVAL.e2, EVAL.e3, EVAL.e4, J.h1, J.virgin, J.badhash, J.h4, ANON, D.d1, D.d2, D.d3, D.d4a]);
  var INS = "INSERT INTO debt_management_opt_in_events (event_id, journey_id, anonymous_id, scope, state, contract_version, source, " +
    "consent_text_version, origin_evaluation_id, origin_diagnosis_id, seq, created_at) VALUES " +
    "($1,$2,'" + ANON + "','debt_management_interest',$3,'debt_management_opt_in_v1','miplan_v2',$4,$5,$6,$7, now() - $8::interval)";
  await q(INS, [EV.e1, J.h1, "opted_in", "dm-optin-v1", EVAL.e1, D.d1, 1, "10 min"]);
  var tie = (await q("SELECT now() - interval '9 min' AS t"))[0].t;
  await q(INS.replace("now() - $8::interval", "$8::timestamptz"), [EV.e2, J.h1, "withdrawn", "dm-optin-v1", EVAL.e1, D.d1, 2, tie]);
  await q(INS.replace("now() - $8::interval", "$8::timestamptz"), [EV.e3, J.h1, "opted_in", "dm-optin-v1", EVAL.e1, D.d1, 3, tie]);
  await q(INS, [EV.e4, J.virgin, "opted_in", "dm-optin-v1", EVAL.e2, D.d2, 1, "8 min"]);
  await q(INS, [EV.e5, J.badhash, "opted_in", null, EVAL.e3, D.d3, 1, "7 min"]);
  await q(INS, [EV.e6, J.h4, "opted_in", "dm-optin-v1", EVAL.e4, null, 1, "6 min"]);
  await q(INS, [EV.e7, J.h4, "withdrawn", "dm-optin-v1", EVAL.e4, null, 2, "0 seconds"]);

  async function rpc(secret, limit) {
    return (await q("SELECT public.miplan_export_debt_optin_events($1,$2) AS r", [secret, limit]))[0].r;
  }
  async function rpcError(secret, limit) {
    try { await rpc(secret, limit); return null; } catch (e) { return String(e.message); }
  }
  async function ack(secret, acks) {
    return (await q("SELECT public.miplan_ack_debt_optin_events($1,$2::jsonb) AS r", [secret, acks == null ? null : JSON.stringify(acks)]))[0].r;
  }
  async function ackError(secret, acks) {
    try { await ack(secret, acks); return null; } catch (e) { return String(e.message); }
  }
  async function ackRows() {
    return q("SELECT event_id, acked_at, janus_ingest_status, ack_contract_version FROM janus_debt_optin_delivery_acks ORDER BY event_id");
  }
  async function consentDigest() {
    return (await q("SELECT count(*)::int AS n, md5(string_agg(to_jsonb(o)::text, '|' ORDER BY event_id)) AS h FROM debt_management_opt_in_events o"))[0];
  }
  var client = {
    rpc: function (name, params) {
      var p = name === "miplan_ack_debt_optin_events"
        ? q("SELECT public.miplan_ack_debt_optin_events($1,$2::jsonb) AS r", [params.p_secret, JSON.stringify(params.p_acks)])
        : q("SELECT public.miplan_export_debt_optin_events($1,$2) AS r", [params.p_secret, params.p_limit]);
      return p.then(function (rows) { return { data: rows[0].r, error: null }; }, function (e) { return { data: null, error: { message: String(e.message) } }; });
    },
  };
  var service = exportService.createJanusExportService({ repository: createJanusExportRepository({ client: client, backendSecret: B2 }) });
  var consentBefore = await consentDigest();

  // ---- auth / arguments ----
  check("wrong p_secret -> MIPLAN_UNAUTHORIZED", /MIPLAN_UNAUTHORIZED/.test(await rpcError("nope", 10)));
  check("null p_secret -> MIPLAN_UNAUTHORIZED", /MIPLAN_UNAUTHORIZED/.test(await rpcError(null, 10)));
  check("limit 0 -> INVALID_EXPORT_LIMIT", /INVALID_EXPORT_LIMIT/.test(await rpcError(B2, 0)));
  check("limit 201 -> INVALID_EXPORT_LIMIT", /INVALID_EXPORT_LIMIT/.test(await rpcError(B2, 201)));

  // ---- full pending page ----
  var all = await rpc(B2, 200);
  var ids = all.events.map(function (e) { return e.event_id; });
  check("selection: only handoff journeys, order (created_at, event_id), no time lag (event created now is pending)",
    JSON.stringify(ids) === JSON.stringify([EV.e1, EV.e2, EV.e3, EV.e5, EV.e6, EV.e7]) && all.has_more === false, ids);
  check("envelope keys: events + has_more only (no cursor)", JSON.stringify(Object.keys(all).sort()) === JSON.stringify(["events", "has_more"]), Object.keys(all));
  check("virgin journey event never exported", ids.indexOf(EV.e4) === -1);
  var byId = {};
  all.events.forEach(function (e) { byId[e.event_id] = e; });
  var e1 = byId[EV.e1];
  check("handoff_token_hash = hash in bootstrap_key", e1.handoff_token_hash === HASH1 && byId[EV.e6].handoff_token_hash === HASH4);
  check("non-hex handoff bootstrap_key -> exported with handoff_token_hash null", byId[EV.e5].handoff_token_hash === null);
  check("snapshot D = origin_diagnosis_id", e1.snapshot_diagnosis_id === D.d1 && e1.origin_diagnosis_id === D.d1);
  check("snapshot D falls back to evaluation.origin_diagnosis_id", byId[EV.e6].origin_diagnosis_id === null && byId[EV.e6].snapshot_diagnosis_id === D.d4a);
  check("later diagnosis of the journey NOT included (only D's debts)",
    byId[EV.e6].debts.length === 1 && byId[EV.e6].debts[0].acreedor === "ute" && byId[EV.e6].excluded_count === 0, byId[EV.e6]);
  check("exclusions: cancelada, pagada, draft, non-objects removed; reclamo_disputa kept; ordinality positions",
    JSON.stringify(e1.debts.map(function (d) { return d.position; })) === "[0,5]" && e1.excluded_count === 5 &&
    e1.debts[1].situacion_ui === "reclamo_disputa", e1.debts);
  check("numeric strings exported as-is (JANUS coerces)", e1.debts[0].monto === "15000" && e1.debts[0].pago === 1200);
  check("client_debt_id from deudas[].id", e1.debts[0].client_debt_id === "c-1");
  check("missing deudas array -> opted_in with debts [] and excluded_count 0",
    Array.isArray(byId[EV.e5].debts) && byId[EV.e5].debts.length === 0 && byId[EV.e5].excluded_count === 0 && byId[EV.e5].consent_text_version === null, byId[EV.e5]);
  check("withdrawn: debts null, excluded_count null", byId[EV.e2].debts === null && byId[EV.e2].excluded_count === null, byId[EV.e2]);
  var evKeys = exportService.EVENT_FIELDS.concat(["debts"]).sort();
  check("SQL event keys = contract (no extras)", all.events.every(function (e) { return JSON.stringify(Object.keys(e).sort()) === JSON.stringify(evKeys); }), Object.keys(e1));
  check("SQL debt keys = contract (no extras)",
    e1.debts.every(function (d) { return JSON.stringify(Object.keys(d).sort()) === JSON.stringify(exportService.DEBT_FIELDS.slice().sort()); }), Object.keys(e1.debts[0]));
  var text = JSON.stringify(all);
  [ANON, "50000", "ingreso", "nota_privada", "no exportar", "CONTENCION", "cancelada", "_is_draft_add", "anda", "brou", "creditel"].forEach(function (needle) {
    check("no leakage from SQL: '" + (needle === ANON ? "<anonymous_id>" : needle) + "'", text.indexOf(needle) === -1);
  });

  // ---- [A] exported but never acked -> exported again (no implicit delivery) ----
  var again = await rpc(B2, 200);
  check("[A] without ACK the same events are re-exported (export is not delivery)",
    JSON.stringify(again.events.map(function (e) { return e.event_id; })) === JSON.stringify(ids));
  var p1 = await service.listEvents({ limit: "2" });
  check("page limit 2: first two pending, has_more true",
    p1.events.length === 2 && p1.events[0].event_id === EV.e1 && p1.events[1].event_id === EV.e2 && p1.has_more === true, p1);
  var p1b = await service.listEvents({ limit: "2" });
  check("[A] same page again until acked (no cursor advance)", JSON.stringify(p1b) === JSON.stringify(p1));

  // ---- ACK argument validation (fail closed) ----
  check("ack: wrong secret -> MIPLAN_UNAUTHORIZED", /MIPLAN_UNAUTHORIZED/.test(await ackError("nope", [{ event_id: EV.e1, janus_status: "inserted" }])));
  var badAcks = [
    ["null", null], ["object", { event_id: EV.e1 }], ["empty", []],
    ["bad uuid", [{ event_id: "x", janus_status: "inserted" }]],
    ["bad status", [{ event_id: EV.e1, janus_status: "failed" }]],
    ["non-object element", [5]],
    ["duplicate", [{ event_id: EV.e1, janus_status: "inserted" }, { event_id: EV.e1, janus_status: "inserted" }]],
  ];
  for (var b = 0; b < badAcks.length; b++) {
    check("ack: " + badAcks[b][0] + " -> INVALID_ACK_REQUEST", /INVALID_ACK_REQUEST/.test(String(await ackError(B2, badAcks[b][1]))));
  }
  var big = [];
  for (var k = 0; k < 201; k++) big.push({ event_id: u("0e000000", 1000 + k), janus_status: "inserted" });
  check("ack: 201 items -> INVALID_ACK_REQUEST", /INVALID_ACK_REQUEST/.test(String(await ackError(B2, big))));
  check("[E] ack of nonexistent event_id -> ACK_EVENT_NOT_EXPORTABLE",
    /ACK_EVENT_NOT_EXPORTABLE/.test(String(await ackError(B2, [{ event_id: UNKNOWN, janus_status: "inserted" }]))));
  check("[E] ack of a non-exportable (virgin journey) event -> ACK_EVENT_NOT_EXPORTABLE",
    /ACK_EVENT_NOT_EXPORTABLE/.test(String(await ackError(B2, [{ event_id: EV.e4, janus_status: "inserted" }]))));
  check("[E] mixed batch (valid + unknown) rejected atomically",
    /ACK_EVENT_NOT_EXPORTABLE/.test(String(await ackError(B2, [{ event_id: EV.e1, janus_status: "inserted" }, { event_id: UNKNOWN, janus_status: "inserted" }]))));
  check("[E] no ack row was written by any rejected request", (await ackRows()).length === 0);

  // ---- [B] ACK -> no longer pending ----
  var a1 = await service.ackEvents({ contract_version: "miplan_debt_optin_export_v1", acks: [
    { event_id: EV.e1, janus_status: "inserted" }, { event_id: EV.e2, janus_status: "inserted" }] });
  check("[B] ack through the service -> acked 2, already 0", a1.acked === 2 && a1.already_acked === 0, a1);
  var p2 = await service.listEvents({ limit: "2" });
  check("[B] acked events are no longer exported; next pending page starts at e3",
    p2.events.map(function (e) { return e.event_id; }).join(",") === [EV.e3, EV.e5].join(","), p2.events.map(function (e) { return e.event_id; }));
  var rowsAfterFirst = await ackRows();
  check("ack row: acked_at set by Mi Plan, status + contract recorded",
    rowsAfterFirst.length === 2 && rowsAfterFirst.every(function (r) { return r.acked_at instanceof Date && r.janus_ingest_status === "inserted" && r.ack_contract_version === "miplan_debt_optin_export_v1"; }), rowsAfterFirst);

  // ---- [D] repeated ACK -> safe no-op; first ack row never rewritten ----
  var a2 = await ack(B2, [{ event_id: EV.e1, janus_status: "already_ingested" }]);
  check("[D] repeated ack -> acked 0, already_acked 1", a2.acked === 0 && a2.already_acked === 1, a2);
  var rowsAfterRepeat = await ackRows();
  check("[D] repeated ack keeps the original ack row (time and status unchanged)",
    JSON.stringify(rowsAfterRepeat) === JSON.stringify(rowsAfterFirst), rowsAfterRepeat);
  var a3 = await ack(B2, [{ event_id: EV.e1, janus_status: "inserted" }, { event_id: EV.e3, janus_status: "already_ingested" }]);
  check("[C] replayed ingest (already_ingested) is ackable; mixed batch counts new vs repeated", a3.acked === 1 && a3.already_acked === 1, a3);

  // ---- drain: each pending event delivered until acked, then never again ----
  var delivered = [];
  for (var guard = 0; guard < 10; guard++) {
    var pg = await service.listEvents({ limit: "1" });
    if (!pg.events.length) break;
    delivered.push(pg.events[0].event_id);
    await service.ackEvents({ contract_version: "miplan_debt_optin_export_v1", acks: [{ event_id: pg.events[0].event_id, janus_status: "inserted" }] });
  }
  check("drain with limit 1: remaining pending events delivered once each, in order",
    delivered.join(",") === [EV.e5, EV.e6, EV.e7].join(","), delivered);
  var empty = await rpc(B2, 200);
  check("nothing pending after all acks", empty.events.length === 0 && empty.has_more === false, empty);

  // ---- late commit: an event whose created_at is OLDER than acked ones is still delivered ----
  await q(INS, [EV.late, J.h4, "opted_in", "dm-optin-v1", EVAL.e4, null, 3, "1 hour"]);
  var late = await rpc(B2, 200);
  check("late-committed event with an old created_at is pending (no temporal cursor can skip it)",
    late.events.length === 1 && late.events[0].event_id === EV.late, late.events.map(function (e) { return e.event_id; }));

  // ---- append-only delivery log ----
  async function mutationError(stmt) {
    try { await q(stmt); return null; } catch (e) { return String(e.message); }
  }
  check("ack log: UPDATE forbidden", /JANUS_DELIVERY_ACK_APPEND_ONLY/.test(String(await mutationError("UPDATE janus_debt_optin_delivery_acks SET janus_ingest_status = 'inserted'"))));
  check("ack log: DELETE forbidden", /JANUS_DELIVERY_ACK_APPEND_ONLY/.test(String(await mutationError("DELETE FROM janus_debt_optin_delivery_acks"))));
  check("ack log: TRUNCATE forbidden", /JANUS_DELIVERY_ACK_APPEND_ONLY/.test(String(await mutationError("TRUNCATE janus_debt_optin_delivery_acks"))));
  check("ack log: FK — cannot ack a nonexistent consent event even by direct insert",
    /foreign key|violates/.test(String(await mutationError("INSERT INTO janus_debt_optin_delivery_acks (event_id, janus_ingest_status, ack_contract_version) VALUES ('" + UNKNOWN + "','inserted','miplan_debt_optin_export_v1')"))));
  check("ack log: 6 rows, never deleted", (await ackRows()).length === 6);

  // ---- consent state untouched by export + ack ----
  var consentAfter = await consentDigest();
  check("consent events unchanged by export/ack (only the late test insert added)",
    consentAfter.n === consentBefore.n + 1 && (await q("SELECT count(*)::int c FROM debt_management_opt_in_events WHERE event_id <> $1", [EV.late]))[0].c === consentBefore.n);
  var cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name = 'debt_management_opt_in_events' ORDER BY ordinal_position")).map(function (r) { return r.column_name; });
  check("no delivery column added to the consent table", cols.every(function (c) { return !/ack|deliver|export|janus/.test(c); }), cols);

  // ---- function properties and grants ----
  var fns = await q("SELECT p.proname, p.prosecdef, p.provolatile, p.proconfig FROM pg_proc p WHERE p.proname IN ('miplan_export_debt_optin_events','miplan_ack_debt_optin_events') ORDER BY p.proname");
  var fnAck = fns.filter(function (f) { return f.proname === "miplan_ack_debt_optin_events"; })[0];
  var fnExp = fns.filter(function (f) { return f.proname === "miplan_export_debt_optin_events"; })[0];
  check("export: single signature, SECURITY DEFINER, STABLE, pinned search_path",
    fns.length === 2 && fnExp.prosecdef === true && fnExp.provolatile === "s" && String(fnExp.proconfig).indexOf("search_path") !== -1, fns);
  check("ack: SECURITY DEFINER, VOLATILE, pinned search_path",
    fnAck.prosecdef === true && fnAck.provolatile === "v" && String(fnAck.proconfig).indexOf("search_path") !== -1, fnAck);
  await q("CREATE ROLE stranger NOLOGIN");
  var sigs = ["public.miplan_export_debt_optin_events(text, integer)", "public.miplan_ack_debt_optin_events(text, jsonb)"];
  for (var s = 0; s < sigs.length; s++) {
    var priv = (await q("SELECT has_function_privilege('anon', '" + sigs[s] + "', 'EXECUTE') a, has_function_privilege('service_role', '" + sigs[s] + "', 'EXECUTE') s, has_function_privilege('authenticated', '" + sigs[s] + "', 'EXECUTE') au, has_function_privilege('stranger', '" + sigs[s] + "', 'EXECUTE') x"))[0];
    check(sigs[s] + ": EXECUTE anon + service_role only (not authenticated, not PUBLIC)",
      priv.a === true && priv.s === true && priv.au === false && priv.x === false, priv);
  }
  await q("SET ROLE anon");
  var anonOk = null;
  var anonBad = null;
  var anonTable = null;
  var anonAckTable = null;
  var anonAckBad = null;
  try { anonOk = (await q("SELECT public.miplan_export_debt_optin_events($1,1) AS r", [B2]))[0].r; } catch (e) { anonOk = String(e.message); }
  try { await q("SELECT public.miplan_export_debt_optin_events('guess',1)"); } catch (e) { anonBad = String(e.message); }
  try { await q("SELECT count(*) FROM public.debt_management_opt_in_events"); } catch (e) { anonTable = String(e.message); }
  try { await q("SELECT count(*) FROM public.janus_debt_optin_delivery_acks"); } catch (e) { anonAckTable = String(e.message); }
  try { await q("SELECT public.miplan_ack_debt_optin_events('guess', $1::jsonb)", [JSON.stringify([{ event_id: EV.late, janus_status: "inserted" }])]); } catch (e) { anonAckBad = String(e.message); }
  await q("RESET ROLE");
  check("anon with the backend secret reads through the definer function", anonOk && Array.isArray(anonOk.events) && anonOk.events.length === 1, anonOk);
  check("anon without the secret is denied (export)", /MIPLAN_UNAUTHORIZED/.test(String(anonBad)), anonBad);
  check("anon without the secret is denied (ack)", /MIPLAN_UNAUTHORIZED/.test(String(anonAckBad)), anonAckBad);
  check("anon cannot read the opt-in table directly", /permission denied/.test(String(anonTable)), anonTable);
  check("anon cannot read the ack table directly", /permission denied/.test(String(anonAckTable)), anonAckTable);

  await db.close();
  var failed = results.filter(function (x) { return !x.ok; }).length;
  console.log("JANUS_EXPORT_DB_LOCAL_TEST [LOCAL]: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error("JANUS_EXPORT_DB_LOCAL_TEST crashed: " + (e && e.stack));
  process.exitCode = 1;
});
