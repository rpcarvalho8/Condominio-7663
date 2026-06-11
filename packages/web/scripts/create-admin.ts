/**
 * Cria utilizador admin na BD local usando o mesmo hash do better-auth
 * Uso: bun run scripts/create-admin.ts
 */

import { createClient } from "@libsql/client";
import { scryptAsync } from "@noble/hashes/scrypt";
import { bytesToHex, randomBytes } from "@noble/hashes/utils";

const DB_PATH = "file:/home/user/Condominio-7663/packages/web/local.db";
const EMAIL = "admin@condominio.local";
const PASSWORD = "admin123";

const client = createClient({ url: DB_PATH });

async function hashPassword(password: string): Promise<string> {
  const saltBytes = randomBytes(16);
  const salt = bytesToHex(saltBytes);
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N: 16384, r: 16, p: 1, dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${bytesToHex(key)}`;
}

async function main() {
  // Apagar utilizador anterior se existir
  await client.execute({ sql: `DELETE FROM "account" WHERE user_id IN (SELECT id FROM "user" WHERE email = ?)`, args: [EMAIL] });
  await client.execute({ sql: `DELETE FROM "user" WHERE email = ?`, args: [EMAIL] });

  const now = Date.now();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const hashedPw = await hashPassword(PASSWORD);

  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, email_verified, role, fracao_id, created_at, updated_at) VALUES (?, ?, ?, 1, 'admin', NULL, ?, ?)`,
    args: [userId, "Administrador", EMAIL, now, now],
  });

  await client.execute({
    sql: `INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    args: [accountId, userId, userId, hashedPw, now, now],
  });

  console.log("✅ Admin criado com sucesso!");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
