# Graph Report - .  (2026-07-06)

## Corpus Check
- 162 files · ~87,450 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 948 nodes · 1760 edges · 58 communities (56 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Mobile Performance Dashboard|Mobile Performance Dashboard]]
- [[_COMMUNITY_Backend Services|Backend Services]]
- [[_COMMUNITY_Mobile Tracking|Mobile Tracking]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Mobile Offline Queue|Mobile Offline Queue]]
- [[_COMMUNITY_Dependencies & Package|Dependencies & Package]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Mobile Performance Dashboard|Mobile Performance Dashboard]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile API & Auth|Mobile API & Auth]]
- [[_COMMUNITY_Mobile Tracking|Mobile Tracking]]
- [[_COMMUNITY_Devdependencies & Eslint|Devdependencies & Eslint]]
- [[_COMMUNITY_Mobile API & Auth|Mobile API & Auth]]
- [[_COMMUNITY_Mobile API & Auth|Mobile API & Auth]]
- [[_COMMUNITY_Payment Processing|Payment Processing]]
- [[_COMMUNITY_Tsconfig & Compileroptions|Tsconfig & Compileroptions]]
- [[_COMMUNITY_Tsconfig & Compileroptions|Tsconfig & Compileroptions]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Mobile API & Auth|Mobile API & Auth]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile Tracking|Mobile Tracking]]
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Bcryptjs & Dependencies|Bcryptjs & Dependencies]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile Tracking|Mobile Tracking]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_GPS Tracking|GPS Tracking]]
- [[_COMMUNITY_Web Portal Pages|Web Portal Pages]]
- [[_COMMUNITY_Backend Services|Backend Services]]
- [[_COMMUNITY_Description & Package|Description & Package]]
- [[_COMMUNITY_Codes & Xlsx|Codes & Xlsx]]
- [[_COMMUNITY_Build & Compileroptions|Build & Compileroptions]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Backend API Routes|Backend API Routes]]
- [[_COMMUNITY_Mobile Features|Mobile Features]]
- [[_COMMUNITY_Devdependencies & Package|Devdependencies & Package]]

## God Nodes (most connected - your core abstractions)
1. `pool` - 49 edges
2. `errorMessage()` - 30 edges
3. `asyncHandler()` - 27 edges
4. `requirePermission()` - 25 edges
5. `authenticate` - 24 edges
6. `HttpError` - 23 edges
7. `hashPassword()` - 20 edges
8. `createApp()` - 19 edges
9. `api` - 18 edges
10. `scripts` - 17 edges

## Surprising Connections (you probably didn't know these)
- `AuthProvider()` --indirect_call--> `refresh()`  [INFERRED]
  frontend/src/auth/AuthContext.tsx → backend/src/services/auth-service.ts
- `ImportWizard()` --calls--> `errorMessage()`  [EXTRACTED]
  frontend/src/pages/ImportPage.tsx → frontend/src/api/client.ts
- `createApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  backend/src/app.ts → backend/src/middleware/error-handler.ts
- `createApp()` --indirect_call--> `notFoundHandler()`  [INFERRED]
  backend/src/app.ts → backend/src/middleware/error-handler.ts
- `run()` --calls--> `hashPassword()`  [EXTRACTED]
  backend/src/migrations/seed_admin.ts → backend/src/services/auth-service.ts

## Import Cycles
- None detected.

## Communities (58 total, 2 thin omitted)

### Community 0 - "Backend API Routes"
Cohesion: 0.11
Nodes (28): asyncHandler(), authenticate, requireAnyPermission(), requirePermission(), HttpError, assignBody, gpsSchema, bodySchema (+20 more)

### Community 1 - "Mobile Performance Dashboard"
Cohesion: 0.06
Nodes (46): ConsumerWidget, Map, build, data, decimalPattern, l, label, _lakh (+38 more)

### Community 2 - "Backend Services"
Cohesion: 0.08
Nodes (21): pool, run(), run(), USERS, hashPassword(), app, PUNE, app (+13 more)

### Community 3 - "Mobile Tracking"
Cohesion: 0.06
Nodes (35): ApiClient get, DateTime?, double?, bucket, companyName, Customer, customerName, customFields (+27 more)

### Community 4 - "Backend API Routes"
Cohesion: 0.10
Nodes (29): loginSchema, otpRequestSchema, otpVerifySchema, passwordSchema, phoneSchema, refreshSchema, router, capabilitySchema (+21 more)

### Community 5 - "Backend API Routes"
Cohesion: 0.09
Nodes (29): filtersSchema, METRIC_TITLES, router, agentBreakdown(), AgentReportRow, baseConditions(), ClassifiedAggregates, classifiedCtes() (+21 more)

### Community 6 - "Backend API Routes"
Cohesion: 0.10
Nodes (26): commitSchema, mappingSchema, previewSchema, router, upload, uploadKeySchema, cellToString(), ColumnMapping (+18 more)

### Community 7 - "Mobile Offline Queue"
Cohesion: 0.07
Nodes (28): _box, clearError, clientKey, copyWith, createdAt, enqueue, fromJson, _init (+20 more)

### Community 8 - "Dependencies & Package"
Cohesion: 0.07
Nodes (27): dependencies, @ant-design/icons, @ant-design/plots, antd, axios, dayjs, leaflet, react (+19 more)

### Community 9 - "Backend API Routes"
Cohesion: 0.09
Nodes (19): createApp(), errorHandler(), notFoundHandler(), router, router, router, router, router (+11 more)

### Community 10 - "Backend API Routes"
Cohesion: 0.12
Nodes (11): Env, envSchema, logger, purgeOldLocationPings(), startScheduledJobs(), router, app, ConsoleSmsProvider (+3 more)

### Community 11 - "Web Portal Pages"
Cohesion: 0.19
Nodes (18): compactCount(), lakh(), metricValue(), pctText(), arcPath(), Gauge(), GaugeProps, polar() (+10 more)

### Community 12 - "Mobile Performance Dashboard"
Cohesion: 0.10
Nodes (24): core/auth/auth_provider.dart, core/router.dart, core/tracking/tracking_service.dart, authProvider, routerProvider, _submit, build, createState (+16 more)

### Community 13 - "Web Portal Pages"
Cohesion: 0.11
Nodes (20): api, errorMessage(), BranchesPage(), Bucket, BucketsPage(), Company, CompaniesPage(), DepositRow (+12 more)

### Community 14 - "Mobile Features"
Cohesion: 0.09
Nodes (22): ../../core/models/disposition_code.dart, DispositionCode?, _amountCtrl, build, CallLogScreen, _CallLogScreenState, createState, customer (+14 more)

### Community 15 - "Mobile API & Auth"
Cohesion: 0.11
Nodes (22): dart:io, File?, apiClientProvider, flush, offlineQueueProvider, _submit, build, createState (+14 more)

### Community 16 - "Mobile Tracking"
Cohesion: 0.10
Nodes (20): @pragma, Box, dart:convert, _box, _boxKey, _capturePing, _dio, _flush (+12 more)

### Community 17 - "Devdependencies & Eslint"
Cohesion: 0.10
Nodes (20): devDependencies, eslint, @eslint/js, node-pg-migrate, pino-pretty, prettier, supertest, tsx (+12 more)

### Community 18 - "Mobile API & Auth"
Cohesion: 0.11
Nodes (18): ../../core/api/api_client.dart, ../../core/models/customer.dart, List, children, customer, _dial, label, _navigate (+10 more)

### Community 19 - "Mobile API & Auth"
Cohesion: 0.12
Nodes (17): ../api/api_client.dart, bool get, ApiClient, _api, AuthNotifier, AuthState, _getDeviceId, init (+9 more)

### Community 20 - "Payment Processing"
Cohesion: 0.12
Nodes (17): scripts, build, dev, format, lint, migrate, migrate:create, migrate:down (+9 more)

### Community 21 - "Tsconfig & Compileroptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit, outDir (+8 more)

### Community 22 - "Tsconfig & Compileroptions"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 23 - "Mobile Features"
Cohesion: 0.12
Nodes (16): _amountCtrl, build, _closeCustomer, createState, customer, _dateCtrl, dispose, _error (+8 more)

### Community 24 - "Backend API Routes"
Cohesion: 0.13
Nodes (13): IMAGE_CONTENT_TYPES, IMAGE_EXTENSIONS, router, saveImage(), upload, visitBody, markDepositedSchema, paymentBody (+5 more)

### Community 25 - "Mobile API & Auth"
Cohesion: 0.12
Nodes (15): Dio, _baseUrl, buildDio, clearTokens, _dio, hasTokens, _kAccessToken, _kRefreshToken (+7 more)

### Community 26 - "Mobile Features"
Cohesion: 0.14
Nodes (14): ConsumerState, ConsumerStatefulWidget, FormState, build, createState, dispose, _error, _formKey (+6 more)

### Community 27 - "Mobile Tracking"
Cohesion: 0.18
Nodes (14): ../../core/offline/offline_queue.dart, ../../core/tracking/attendance_provider.dart, attendanceProvider, worklistProvider, build, createState, customer, _DutyBanner (+6 more)

### Community 28 - "Authentication"
Cohesion: 0.25
Nodes (11): clearTokens(), getTokens(), refreshAccessToken(), setTokens(), TOKEN_KEYS, AuthContext, AuthContextValue, AuthProvider() (+3 more)

### Community 29 - "Web Portal Pages"
Cohesion: 0.20
Nodes (10): DashboardPage, RequireAuth(), useAuth(), AppLayout(), DispositionsPage(), FormValues, NEEDS_FLAGS, EmployeesPage() (+2 more)

### Community 30 - "Mobile Features"
Cohesion: 0.13
Nodes (14): actionCode, description, display, DispositionCode, fromJson, id, needsAmount, needsDate (+6 more)

### Community 31 - "Bcryptjs & Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, cors, dotenv, exceljs, express, helmet, jsonwebtoken (+6 more)

### Community 32 - "Web Portal Pages"
Cohesion: 0.20
Nodes (10): AlertsBell(), alertText(), TrackingAlert, dotIcon(), FALLBACK_CENTER, LiveAgent, LiveMap(), RoutePoint (+2 more)

### Community 33 - "Web Portal Pages"
Cohesion: 0.22
Nodes (9): Product, EmployeeFormValues, Branch, Capability, CAPABILITY_LABELS, Customer, Employee, SYSTEM_FIELD_LABELS (+1 more)

### Community 34 - "Mobile Features"
Cohesion: 0.20
Nodes (11): Customer, api, build, customer, _date, ptpListProvider, PtpsScreen, res (+3 more)

### Community 35 - "Mobile Tracking"
Cohesion: 0.17
Nodes (11): currentPosition, ensurePermissions, initCommunicationPort, isRunning, start, stop, TrackingService, package:flutter_foreground_task/flutter_foreground_task.dart (+3 more)

### Community 36 - "Mobile Features"
Cohesion: 0.18
Nodes (10): ../features/auth/login_screen.dart, ../features/call_log/call_log_screen.dart, ../features/field_visit/field_visit_screen.dart, ../features/home/home_shell.dart, ../features/payment/payment_screen.dart, ../features/ptps/ptps_screen.dart, ../features/worklist/customer_detail_screen.dart, GoRouter (+2 more)

### Community 37 - "Web Portal Pages"
Cohesion: 0.25
Nodes (7): AllocatedList(), baseColumns, Product, UnallocatedQueue(), useAssignableAgents(), useCompanyFilters(), AllocationLog

### Community 38 - "Backend API Routes"
Cohesion: 0.22
Nodes (7): bulkRowSchema, bulkSchema, METRICS, monthSchema, router, SCOPE_TYPES, upload

### Community 39 - "GPS Tracking"
Cohesion: 0.22
Nodes (5): app, BASE, PHONES, tokens, userIds

### Community 40 - "Web Portal Pages"
Cohesion: 0.22
Nodes (6): CommitResult, ImportWizard(), PreviewResult, SYSTEM_FIELDS, ImportRun, ImportTemplate

### Community 41 - "Backend Services"
Cohesion: 0.25
Nodes (7): composeRemark(), createsPtp(), DispositionCodeRow, DispositionFields, FLAG_TO_FIELD, missingRequiredFields(), PLACEHOLDER_PATTERNS

### Community 42 - "Description & Package"
Cohesion: 0.33
Nodes (5): description, main, name, type, version

### Community 43 - "Codes & Xlsx"
Cohesion: 0.40
Nodes (5): xlsx, detectNeeds(), FILE_PATH, run(), SheetRow

### Community 44 - "Build & Compileroptions"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, rootDir, extends, include

### Community 45 - "Mobile Features"
Cohesion: 0.60
Nodes (3): FlutterEngine, Keep, GeneratedPluginRegistrant

### Community 46 - "Mobile Features"
Cohesion: 0.60
Nodes (3): gradlew script, die(), warn()

### Community 47 - "Mobile Features"
Cohesion: 0.40
Nodes (5): build, Route /call-log, Route /field-visit, Route /payment, Route /ptps

### Community 48 - "Mobile Features"
Cohesion: 0.40
Nodes (4): main, package:flutter/material.dart, package:flutter_test/flutter_test.dart, package:rudrayani_mobile/main.dart

### Community 49 - "Backend API Routes"
Cohesion: 0.50
Nodes (3): batchSchema, pingSchema, router

## Knowledge Gaps
- **448 isolated node(s):** `name`, `version`, `description`, `main`, `type` (+443 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `refresh()` connect `Backend API Routes` to `Authentication`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `AuthProvider()` connect `Authentication` to `Backend API Routes`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _449 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.10740203193033382 - nodes in this community are weakly interconnected._
- **Should `Mobile Performance Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.05585106382978723 - nodes in this community are weakly interconnected._
- **Should `Backend Services` be split into smaller, more focused modules?**
  _Cohesion score 0.07549361207897794 - nodes in this community are weakly interconnected._
- **Should `Mobile Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._