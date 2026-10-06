/**
 * server/app.js — Express application factory (no listen).
 */
"use strict";

var express = require("express");
var cors = require("cors");
var createHealthRouter = require("./http/routes/health").createHealthRouter;
var createDiagnosesRouter = require("./http/routes/diagnoses").createDiagnosesRouter;
var createHandoffRouter = require("./http/routes/handoff").createHandoffRouter;
var createUserChoicesRouter = require("./http/routes/userChoices").createUserChoicesRouter;
var notFoundHandler = require("./http/middleware/notFound").notFoundHandler;
var errorHandler = require("./http/middleware/errorHandler").errorHandler;
var createSupabaseClient = require("./modules/persistence/supabaseClient").createSupabaseClient;
var createDiagnosisRepository = require("./modules/diagnosis/repository").createDiagnosisRepository;
var createDiagnosisService = require("./modules/diagnosis/service").createDiagnosisService;
var createJourneyRepository = require("./modules/journey/repository").createJourneyRepository;
var createMemoryJourneyRepository = require("./modules/journey/repository").createMemoryJourneyRepository;
var createJourneyService = require("./modules/journey/service").createJourneyService;
var createUserChoiceRepository = require("./modules/userChoice/repository").createUserChoiceRepository;
var createUserChoiceService = require("./modules/userChoice/service").createUserChoiceService;
var createHandoffConsentRepository = require("./modules/handoffConsent/repository").createHandoffConsentRepository;
var createMemoryHandoffConsentRepository =
  require("./modules/handoffConsent/repository").createMemoryHandoffConsentRepository;
var createHandoffConsentService = require("./modules/handoffConsent/service").createHandoffConsentService;

/**
 * @param {ReturnType<typeof import('./config').loadConfig>} config
 * @param {object} [overrides] test injection
 */
function createApp(config, overrides) {
  overrides = overrides || {};
  var app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (config.corsAllowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }
        var err = new Error("CORS_NOT_ALLOWED");
        err.status = 403;
        err.code = "CORS_NOT_ALLOWED";
        return callback(err);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-MiPlan-Anonymous-Id"],
    })
  );

  app.use(express.json({ limit: "256kb" }));

  var diagnosisService = overrides.diagnosisService;
  var journeyService = overrides.journeyService;
  var sharedClient = null;
  var memoryJourneyRepository = null;

  if (!journeyService) {
    if (config.persistenceConfigured) {
      sharedClient = createSupabaseClient(config);
      journeyService = createJourneyService({
        repository: createJourneyRepository({
          client: sharedClient,
          backendSecret: config.backendSecret,
          tenantId: config.defaultTenantId,
        }),
        tenantId: config.defaultTenantId,
      });
    } else if (config.nodeEnv !== "production") {
      // Local/unit tests without Supabase: in-memory durable-within-process store.
      memoryJourneyRepository = createMemoryJourneyRepository();
      journeyService = createJourneyService({
        repository: memoryJourneyRepository,
        tenantId: config.defaultTenantId,
      });
    }
  }

  if (!diagnosisService) {
    if (!config.persistenceConfigured) {
      // Lazy fail on request rather than crash boot — health still works.
      diagnosisService = {
        createDiagnosis: function () {
          var err = new Error("SUPABASE_CONFIG_MISSING");
          err.status = 503;
          err.code = "SUPABASE_CONFIG_MISSING";
          return Promise.reject(err);
        },
        recordShadowResult: function () {
          var err = new Error("SUPABASE_CONFIG_MISSING");
          err.status = 503;
          err.code = "SUPABASE_CONFIG_MISSING";
          return Promise.reject(err);
        },
      };
    } else {
      var client = sharedClient || createSupabaseClient(config);
      var repository = createDiagnosisRepository({
        client: client,
        backendSecret: config.backendSecret,
        tenantId: config.defaultTenantId,
      });
      diagnosisService = createDiagnosisService({
        repository: repository,
        tenantId: config.defaultTenantId,
        journeyService: journeyService,
      });
    }
  }

  var userChoiceService = overrides.userChoiceService;
  if (!userChoiceService) {
    if (!config.persistenceConfigured) {
      var unavailable = function () {
        var err = new Error("USER_CHOICE_UNAVAILABLE");
        err.status = 503;
        err.code = "USER_CHOICE_UNAVAILABLE";
        return Promise.reject(err);
      };
      userChoiceService = { getState: unavailable, recordChoice: unavailable, recordOptIn: unavailable };
    } else {
      userChoiceService = createUserChoiceService({
        repository: createUserChoiceRepository({
          client: sharedClient || createSupabaseClient(config),
          backendSecret: config.backendSecret,
        }),
        interactionEnabled: config.v2InteractionEnabled,
      });
    }
  }

  var handoffConsentService = overrides.handoffConsentService || null;
  if (!handoffConsentService) {
    if (config.persistenceConfigured) {
      handoffConsentService = createHandoffConsentService({
        repository: createHandoffConsentRepository({
          client: sharedClient || createSupabaseClient(config),
          backendSecret: config.backendSecret,
        }),
      });
    } else if (memoryJourneyRepository) {
      handoffConsentService = createHandoffConsentService({
        repository: createMemoryHandoffConsentRepository(memoryJourneyRepository),
      });
    }
  }

  app.use(createHealthRouter(config));
  app.use(createDiagnosesRouter({ diagnosisService: diagnosisService }));
  app.use(createUserChoicesRouter({ userChoiceService: userChoiceService }));
  app.use(
    createHandoffRouter({
      config: config,
      journeyService: journeyService,
      handoffConsentService: handoffConsentService,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp: createApp };
