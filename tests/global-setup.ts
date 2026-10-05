import { execSync } from "node:child_process";
import { Pool } from "pg";

/** Maakt een schone testdatabase en past de migraties toe. Vereist een lokale Postgres. */
export default async function setup() {
  const admin = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
  const name = "clubsupport_test";
  const pool = new Pool({ connectionString: admin });
  await pool.query(`drop database if exists ${name} with (force)`);
  await pool.query(`create database ${name}`);
  await pool.end();
  const url = admin.replace(/\/[^/]*$/, `/${name}`);
  process.env.DATABASE_URL = url;
  process.env.TEST_DATABASE_URL = url;
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
