/* Sprint 15.email QA — node scripts/test-plus-email-url-qa.js */
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
  console.log("PASS — " + msg);
};

const vm = require("vm");

function runWithSearch(search, fn) {
  global.window = { location: { search: search } };
  vm.runInThisContext(
    require("fs")
      .readFileSync(require("path").join(__dirname, "../js/config.js"), "utf8")
      .replace(/\bconst /g, "var "),
    { filename: "config.js" }
  );
  fn();
}

// A — valid email
runWithSearch("?nombre=Test&ingreso=50000&email=Usuario@Ejemplo.COM", () => {
  assert(sanitizeUrlEmail("x") === null, "invalid no @");
  assert(PRE.email === "usuario@ejemplo.com", "A PRE.email sanitized");
});

// C — invalid
runWithSearch("?email=notanemail", () => {
  assert(PRE.email === "", "C invalid param → empty PRE.email");
  assert(sanitizeUrlEmail("bad@host") === null, "C no dot");
});

// B — missing
runWithSearch("?ingreso=50000", () => {
  assert(PRE.email === "martin@email.com", "B default when param absent");
});

// preload simulation
runWithSearch("?email=url@credizona.com.uy", () => {
  const email = sanitizeUrlEmail(new URLSearchParams(window.location.search).get("email"));
  assert(email === "url@credizona.com.uy", "E URL email for CZState preload");
});

console.log("\nAll Sprint 15.email URL checks passed.");
