const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'autotest.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let initPromise = null;

function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

async function getDb() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');

    // Execute schema (multiple statements)
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      db.run(stmt + ';');
    }
    // Migrations for existing databases
    try { db.run('ALTER TABLE test_runs ADD COLUMN ai_prompt TEXT'); } catch { /* already exists */ }
    try { db.run('ALTER TABLE discovered_pages ADD COLUMN ui_elements TEXT DEFAULT \'{}\''); } catch { /* already exists */ }

    saveDb();

    // Auto-save periodically
    setInterval(saveDb, 5000);

    return db;
  })();

  return initPromise;
}

// Helper: run a query and return all rows as objects
function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query and return first row as object
function get(db, sql, params = []) {
  const rows = all(db, sql, params);
  return rows[0] || null;
}

// Helper: run an INSERT/UPDATE/DELETE and return info
function run(db, sql, params = []) {
  db.run(sql, params);
  const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
  const changesResult = db.exec('SELECT changes() as c');
  saveDb();
  return {
    lastInsertRowid: lastIdResult.length ? lastIdResult[0].values[0][0] : 0,
    changes: changesResult.length ? changesResult[0].values[0][0] : 0,
  };
}

module.exports = { getDb, all, get, run, saveDb };
