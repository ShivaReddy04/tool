  Day 1 (Apr 7) — Routing + Auth Connection

  Morning: Install dependencies & add routing

  Step 1: Install packages
  cd frontend && npm i react-router-dom

  Step 2: Create route structure in App.tsx
  - /login → LoginPage
  - /signup → SignupPage
  - /dashboard → DeveloperDashboard (protected)
  - /unauthorized → UnauthorizedPage
  - Add ProtectedRoute wrapper that checks isAuthenticated + role

  Step 3: Update LoginPage and SignupPage to use useNavigate() instead of the onSwitchToLogin/onSwitchToSignup props

  Afternoon: Rewrite AuthContext to use real backend

  Step 4: Rewrite AuthContext.tsx:
  - Remove all localStorage user/password storage (the btoa system)
  - signup() → calls POST /api/auth/signup via api/client.ts
  - loginWithCredentials() → calls POST /api/auth/login
  - logout() → calls POST /api/auth/logout
  - Store accessToken in state, not localStorage
  - On app load, try POST /api/auth/refresh-token to restore session

  Step 5: Fix role casing mismatch
  - Backend uses 'developer', 'architect' (lowercase)
  - Update frontend types/index.ts: change UserRole to lowercase values
  - Update all components that compare roles (RoleGuard, SignupPage, etc.)

  Step 6: Remove role selection from signup — hardcode developer, only admins change roles

  How to verify Day 1 is done:

  1. Start backend: cd backend && npm run dev
  2. Start frontend: cd frontend && npm start
  3. Go to http://localhost:3000 → redirects to /login
  4. Click "Create one" → goes to /signup
  5. Sign up → user created in PostgreSQL → redirected to /dashboard
  6. Refresh page → still logged in (token refresh works)
  7. Logout → redirected to /login

  ---
  Day 2 (Apr 8) — Database Schema + Cluster Management with DB Types

  Morning: Design and create DART database tables

  Step 1: Install migration tool
  cd backend && npm i node-pg-migrate

  Step 2: Create migration for the domain tables:

  -- clusters: stores target database connections
  CREATE TABLE clusters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      db_type VARCHAR(20) NOT NULL CHECK (db_type IN ('postgresql', 'mysql', 'mssql', 'redshift')),
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      database_name VARCHAR(100) NOT NULL,
      username VARCHAR(100) NOT NULL,
      password_encrypted VARCHAR(500) NOT NULL,
      region VARCHAR(50),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- schemas
  CREATE TABLE schemas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE
  );

  -- business_areas
  CREATE TABLE business_areas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      description TEXT
  );

  -- table_definitions
  CREATE TABLE table_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      schema_id UUID NOT NULL REFERENCES schemas(id) ON DELETE CASCADE,
      table_name VARCHAR(255) NOT NULL,
      entity_logical_name VARCHAR(255),
      distribution_style VARCHAR(20),  -- nullable, only for Redshift
      keys TEXT,
      vertical_name VARCHAR(100),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'applied')),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  -- column_definitions
  CREATE TABLE column_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id UUID NOT NULL REFERENCES table_definitions(id) ON DELETE CASCADE,
      column_name VARCHAR(255) NOT NULL,
      data_type VARCHAR(50) NOT NULL,
      is_nullable BOOLEAN DEFAULT true,
      is_primary_key BOOLEAN DEFAULT false,
      data_classification VARCHAR(20) DEFAULT 'Internal',
      data_domain VARCHAR(100),
      attribute_definition TEXT,
      default_value TEXT,
      action VARCHAR(20) DEFAULT 'No Change' CHECK (action IN ('No Change', 'Modify', 'Add', 'Drop')),
      sort_order INTEGER DEFAULT 0
  );

  -- submissions (review workflow)
  CREATE TABLE submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id UUID NOT NULL REFERENCES table_definitions(id),
      submitted_by UUID NOT NULL REFERENCES users(id),
      reviewed_by UUID REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      rejection_reason TEXT,
      submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMPTZ
  );

  Afternoon: Build cluster APIs + DB-type-aware data types

  Step 3: Create backend files:
  - models/cluster.model.ts — CRUD queries for clusters
  - controllers/cluster.controller.ts — endpoint handlers
  - routes/cluster.routes.ts — route definitions
  - Encrypt cluster passwords with crypto.createCipheriv before storing

  Step 4: Build endpoints:
  POST   /api/clusters           (create cluster with DB connection details)
  GET    /api/clusters           (list clusters)
  GET    /api/clusters/:id       (get cluster details)
  PUT    /api/clusters/:id       (update cluster)
  DELETE /api/clusters/:id       (delete cluster)
  POST   /api/clusters/:id/test  (test database connection)

  Step 5: Create utils/dataTypes.ts — data types per DB:
  export const DATA_TYPES: Record<string, string[]> = {
    postgresql: ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL',
                 'DOUBLE PRECISION', 'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT',
                 'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'JSON', 'JSONB', 'UUID'],
    mysql:      ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT',
                 'DOUBLE', 'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT', 'DATE',
                 'DATETIME', 'TIMESTAMP', 'JSON', 'ENUM'],
    mssql:      ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT',
                 'BIT', 'CHAR', 'VARCHAR', 'NVARCHAR', 'TEXT', 'DATE',
                 'DATETIME', 'DATETIME2', 'UNIQUEIDENTIFIER'],
    redshift:   ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'REAL',
                 'DOUBLE PRECISION', 'BOOLEAN', 'CHAR', 'VARCHAR', 'DATE',
                 'TIMESTAMP', 'TIMESTAMPTZ', 'SUPER'],
  };

  Step 6: Add endpoint GET /api/clusters/:id/data-types that returns the valid data types for that cluster's DB type.

  How to verify Day 2 is done:

  1. Run migration: npx node-pg-migrate up
  2. POST /api/clusters with PostgreSQL connection → creates cluster
  3. POST /api/clusters/:id/test → "Connection successful"
  4. GET /api/clusters → returns list with db_type
  5. GET /api/clusters/:id/data-types → returns correct types for that DB

  ---
  Day 3 (Apr 9) — Schema, Table, Column APIs

  Morning: Schema + Business Area + Table endpoints

  Step 1: Build schema APIs:
  GET    /api/schemas?clusterId=X     (list schemas for cluster)
  POST   /api/schemas                 (create schema)

  Step 2: Build business area APIs:
  GET    /api/business-areas
  POST   /api/business-areas

  Step 3: Build table APIs:
  GET    /api/tables?schemaId=X       (list tables for schema)
  GET    /api/tables/:id              (get table + columns)
  POST   /api/tables                  (create table + columns)
  PUT    /api/tables/:id              (update table + columns)
  DELETE /api/tables/:id              (delete table)

  Afternoon: Column endpoints

  Step 4: Columns are managed as part of the table, but add:
  PUT    /api/tables/:id/columns      (bulk update columns)
  POST   /api/tables/:id/columns      (add column)
  DELETE /api/tables/:id/columns/:colId (remove column)

  Step 5: Add validation with zod:
  cd backend && npm i zod
  Validate all request bodies — table name format, column data type must match cluster's DB type, required fields present.

  How to verify Day 3 is done:

  1. Create a cluster (Day 2)
  2. POST /api/schemas → creates schema under cluster
  3. POST /api/tables with columns array → creates table + columns
  4. GET /api/tables/:id → returns full table with columns
  5. PUT /api/tables/:id → updates columns, changes actions
  6. DELETE /api/tables/:id → deletes table and columns

  ---
  Day 4 (Apr 10) — Wire Frontend to All APIs

  Morning: Replace TODO placeholders in DashboardContext

  Step 1: Install react-query
  cd frontend && npm i @tanstack/react-query

  Step 2: Create API service files in frontend/src/api/:
  - clusters.ts — fetchClusters(), testConnection()
  - schemas.ts — fetchSchemas(clusterId)
  - tables.ts — fetchTables(schemaId), fetchTable(id), createTable(), updateTable(), deleteTable()
  - businessAreas.ts — fetchBusinessAreas()

  Step 3: Update DashboardContext.tsx:
  - On mount → fetch clusters, business areas
  - On cluster select → fetch schemas for that cluster + fetch data types for that DB type
  - On schema select → fetch tables
  - On table select → fetch table definition + columns
  - Save → PUT /api/tables/:id
  - Create → POST /api/tables
  - Delete → DELETE /api/tables/:id

  Afternoon: Update frontend types + UI for multi-DB

  Step 4: Update types/index.ts:
  - Add dbType field to Cluster type: dbType: 'postgresql' | 'mysql' | 'mssql' | 'redshift'
  - Change RedshiftDataType to DataType = string (dynamic based on cluster)
  - Make distributionStyle optional (only Redshift uses it)

  Step 5: Update the column data type dropdown to use data types fetched from GET /api/clusters/:id/data-types

  Step 6: Hide Redshift-specific fields (distribution style) when cluster is not Redshift

  How to verify Day 4 is done:

  1. Open dashboard → clusters load from API
  2. Select cluster → schemas load
  3. Select schema → tables load
  4. Select table → columns appear in data grid
  5. Edit a column → save → refresh → changes persisted
  6. Create new table → appears in list
  7. Data type dropdown shows correct types for the DB type

  ---
  Day 5 (Apr 11) — Review Workflow + DDL Engine

  Morning: Review/approval APIs

  Step 1: Build submission endpoints:
  POST   /api/tables/:id/submit          (developer submits)
  GET    /api/submissions/pending         (architect gets pending reviews)
  GET    /api/submissions/:id             (get submission details)
  POST   /api/submissions/:id/approve     (architect approves)
  POST   /api/submissions/:id/reject      (architect rejects, with reason)

  Step 2: Build notification endpoints:
  GET    /api/notifications               (get user's notifications)
  PATCH  /api/notifications/:id/read      (mark as read)
  POST   /api/notifications/read-all      (mark all read)

  Step 3: Wire frontend review flow — replace the client-side-only notification system with real API calls

  Afternoon: Build the DDL generation engine

  Step 4: Create backend/src/services/ddl/ folder:

  services/ddl/
  ├── index.ts              # DDLGenerator interface + factory
  ├── postgresql.ddl.ts     # PostgreSQL DDL
  ├── mysql.ddl.ts          # MySQL DDL
  ├── mssql.ddl.ts          # SQL Server DDL
  └── redshift.ddl.ts       # Redshift DDL

  Step 5: Each generator implements:
  interface DDLGenerator {
    createTable(table: TableDefinition, columns: ColumnDefinition[]): string;
    alterTableAdd(tableName: string, column: ColumnDefinition): string;
    alterTableModify(tableName: string, column: ColumnDefinition): string;
    alterTableDrop(tableName: string, columnName: string): string;
    generateFullDDL(table: TableDefinition, columns: ColumnDefinition[]): string;
    // generateFullDDL looks at each column's "action" field and builds the complete script
  }

  Example output for PostgreSQL:
  -- For a table with mixed actions:
  ALTER TABLE schema.dim_customer
    ADD COLUMN lifetime_value DECIMAL DEFAULT 0.00,
    ALTER COLUMN email TYPE VARCHAR(500),
    DROP COLUMN old_field;

  Example output for MySQL (different syntax):
  ALTER TABLE schema.dim_customer
    ADD COLUMN lifetime_value DECIMAL DEFAULT 0.00,
    MODIFY COLUMN email VARCHAR(500),
    DROP COLUMN old_field;

  How to verify Day 5 is done:

  1. Developer submits table → POST creates submission
  2. Login as Architect → GET /api/submissions/pending returns it
  3. Approve → status changes to "approved"
  4. Call DDL generator → returns correct SQL for the cluster's DB type

  ---
  Day 6 (Apr 12) — Apply to Database + Connection Layer

  Morning: Build database connector service

  Step 1: Install DB drivers:
  cd backend && npm i mysql2 mssql
  # pg is already installed

  Step 2: Create backend/src/services/connector/:
  services/connector/
  ├── index.ts             # DatabaseConnector interface + factory
  ├── postgresql.conn.ts   # pg Pool connect + execute
  ├── mysql.conn.ts        # mysql2 connect + execute
  ├── mssql.conn.ts        # mssql connect + execute
  └── redshift.conn.ts     # same as pg, different config

  Each connector implements:
  interface DatabaseConnector {
    testConnection(): Promise<boolean>;
    execute(sql: string): Promise<void>;
    disconnect(): Promise<void>;
  }

  Step 3: Build the "Apply to Database" endpoint:
  POST /api/tables/:id/apply
  This endpoint:
  1. Checks table status is approved
  2. Gets cluster connection details, decrypts password
  3. Creates a DatabaseConnector for the cluster's db_type
  4. Generates DDL using the correct DDLGenerator
  5. Executes the DDL against the target database
  6. Updates table status to applied
  7. Returns the executed SQL to the frontend

  Afternoon: Frontend "Apply to Database" UI

  Step 4: After approval, show an "Apply to Database" button in the UI

  Step 5: On click:
  1. Show a confirmation modal with the generated DDL preview (fetch from GET /api/tables/:id/ddl-preview)
  2. User reviews the SQL
  3. User clicks "Execute" → calls POST /api/tables/:id/apply
  4. Show success/failure result
  5. On success, update table status to applied

  Step 6: Add a DDL preview endpoint:
  GET /api/tables/:id/ddl-preview    (returns the SQL that would be executed)

  How to verify Day 6 is done:

  1. Full flow: create table → submit → approve → click "Apply to Database"
  2. See DDL preview in modal (correct syntax for DB type)
  3. Click Execute → table/columns actually created in target database
  4. Connect to target DB and verify the table exists
  5. Test with at least 2 DB types (PostgreSQL + MySQL)

  ---
  Day 7 (Apr 13) — Security + Error Handling

  Morning: Security hardening

  Step 1: Install security packages:
  cd backend && npm i express-rate-limit helmet

  Step 2: Add to app.ts:
  - helmet() for security headers
  - Rate limit on /api/auth/* — 5 requests per 15 minutes per IP
  - Rate limit on /api/tables/:id/apply — 3 requests per minute (DDL execution is dangerous)

  Step 3: Fix JWT — remove fallback secrets in jwt.ts, throw error if env vars missing

  Step 4: Encrypt cluster passwords at rest:
  - Use crypto.createCipheriv with a key from env var (ENCRYPTION_KEY)
  - Encrypt before saving to clusters table
  - Decrypt only when connecting to target DB

  Step 5: Add request validation with zod on all remaining endpoints

  Step 6: Add httpOnly cookie for refresh token instead of sending it in response body

  Afternoon: Error handling + logging

  Step 7: Install pino:
  cd backend && npm i pino pino-pretty
  Replace all console.log/error with structured logging

  Step 8: Add React ErrorBoundary component wrapping the dashboard

  Step 9: Add proper error toasts on the frontend for API failures — not just silent failures

  How to verify Day 7 is done:

  1. Hit /api/auth/login 6 times fast → rate limited
  2. Remove JWT env var → server refuses to start (not silently using default)
  3. Check cluster in DB → password is encrypted, not plaintext
  4. Break an API call → frontend shows error toast
  5. Check backend logs → structured JSON output

  ---
  Day 8 (Apr 14) — Seed Data + Polish + Testing

  Morning: Seed script + admin features

  Step 1: Create backend/scripts/seed.ts:
  - Insert 3-4 clusters (mix of PostgreSQL, MySQL, Redshift)
  - Insert schemas for each cluster
  - Insert business areas
  - Insert a few sample tables with columns
  - Create a default admin user

  Step 2: Add an "Add Cluster" form in the frontend (only for admin/architect role):
  - Name, DB Type (dropdown), Host, Port, Database, Username, Password
  - "Test Connection" button before saving

  Afternoon: Full end-to-end testing

  Step 3: Test every flow manually:

  [ ] Sign up as developer
  [ ] Log in
  [ ] See clusters load
  [ ] Select cluster → schemas load
  [ ] Select schema → tables load
  [ ] Create new table with columns
  [ ] Edit columns (change actions to Add/Modify/Drop)
  [ ] Save changes
  [ ] Submit for review
  [ ] Log out
  [ ] Sign up as architect
  [ ] See pending submission in notifications
  [ ] Open review drawer → see table + columns
  [ ] Approve submission
  [ ] Click "Apply to Database"
  [ ] See DDL preview
  [ ] Execute → success
  [ ] Verify table exists in target DB
  [ ] Reject flow: submit → reject with reason → developer sees rejection

  Step 4: Fix any bugs found during testing

  Step 5: Add loading states and empty states for all data-fetching screens

  How to verify Day 8 is done:

  All checkboxes above pass. App works end-to-end with real databases.

  ---
  Day 9 (Apr 15) — Deploy

  Morning: Prepare for deployment

  Step 1: Choose hosting:
  - Backend + DART DB: Railway or Render (free tier has PostgreSQL included)
  - Frontend: Vercel or Netlify

  Step 2: Backend production config:
  NODE_ENV=production
  PORT=5000
  DB_HOST=<railway-pg-host>
  DB_PORT=5432
  DB_NAME=dart_db
  DB_USER=<railway-user>
  DB_PASSWORD=<strong-password>
  JWT_ACCESS_SECRET=<random-64-char-string>
  JWT_REFRESH_SECRET=<random-64-char-string>
  ENCRYPTION_KEY=<random-32-char-hex>
  FRONTEND_URL=https://your-app.vercel.app

  Step 3: Run migrations + seed on production DB

  Step 4: Deploy backend → get production URL

  Step 5: Frontend production config:
  REACT_APP_API_URL=https://your-backend.railway.app/api

  Step 6: npm run build → deploy to Vercel

  Afternoon: Final verification

  Step 7: Production checklist:
  [ ] HTTPS on both frontend and backend
  [ ] CORS set to production frontend URL only
  [ ] Rate limiting active
  [ ] No console.log in production
  [ ] JWT secrets are strong random values
  [ ] Cluster passwords encrypted in DB
  [ ] Health check returns OK
  [ ] Full user flow works on production URL
  [ ] Test connection to at least one real external database

  ---
  Files You'll Create (total)

  backend/src/
  ├── services/
  │   ├── ddl/
  │   │   ├── index.ts
  │   │   ├── postgresql.ddl.ts
  │   │   ├── mysql.ddl.ts
  │   │   ├── mssql.ddl.ts
  │   │   └── redshift.ddl.ts
  │   └── connector/
  │       ├── index.ts
  │       ├── postgresql.conn.ts
  │       ├── mysql.conn.ts
  │       ├── mssql.conn.ts
  │       └── redshift.conn.ts
  ├── models/
  │   ├── cluster.model.ts
  │   ├── schema.model.ts
  │   ├── table.model.ts
  │   ├── submission.model.ts
  │   └── notification.model.ts
  ├── controllers/
  │   ├── cluster.controller.ts
  │   ├── schema.controller.ts
  │   ├── table.controller.ts
  │   └── submission.controller.ts
  ├── routes/
  │   ├── cluster.routes.ts
  │   ├── schema.routes.ts
  │   ├── table.routes.ts
  │   └── submission.routes.ts
  ├── utils/
  │   ├── dataTypes.ts
  │   └── encryption.ts
  └── scripts/
      └── seed.ts

  frontend/src/
  ├── api/
  │   ├── clusters.ts
  │   ├── schemas.ts
  │   ├── tables.ts
  │   └── submissions.ts

  ---
  Want me to start executing Day 1 now — installing React Router and rewriting AuthContext?