# Guia de Setup — Desenvolvimento Local (VSCode)

## Pré-requisitos

Instala estas ferramentas antes de começar:

| Ferramenta | Versão | Link |
|------------|--------|------|
| **Bun** | >= 1.3 | https://bun.sh |
| **Node.js** | >= 20 | https://nodejs.org (necessário para alguns scripts) |
| **VSCode** | latest | https://code.visualstudio.com |
| **Git** | any | https://git-scm.com |

### Instalar Bun (macOS / Linux)
```bash
curl -fsSL https://bun.sh/install | bash
```

### Extensões VSCode recomendadas
- **ESLint** — `dbaeumer.vscode-eslint`
- **Tailwind CSS IntelliSense** — `bradlc.vscode-tailwindcss`
- **Drizzle ORM** — `drizzle-team.drizzle-orm-vscode` (syntax highlight no schema)
- **Pretty TypeScript Errors** — `yoavbls.pretty-ts-errors`

---

## 1. Clonar e instalar

```bash
git clone <URL_DO_REPO> condominio
cd condominio
bun install
```

`bun install` instala **tudo** (monorepo com workspaces) — não precisas de entrar em cada pasta.

---

## 2. Variáveis de ambiente

Cria o ficheiro `.env` na raiz do projecto (nunca commitar):

```bash
cp .env.template .env
```

Preenche os valores no `.env`:

```env
NODE_ENV=development
WEBSITE_URL=http://localhost:4200

# Better Auth — gera um secret aleatório:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BETTER_AUTH_SECRET=coloca_aqui_um_secret_aleatorio

# Base de dados Turso
DATABASE_URL=libsql://c42c4bf1-3827-4b9b-89d8-132fcb6cc308-runable.aws-us-east-2.turso.io
DATABASE_AUTH_TOKEN=eyJhbGci...  # o token longo do Turso
```

> Os valores de `DATABASE_URL` e `DATABASE_AUTH_TOKEN` já existem — estão na instância actual do Runable. Pede-os ao administrador ou vai ao dashboard do Turso em https://turso.tech

---

## 3. Correr em desenvolvimento

```bash
bun run dev
```

Abre o browser em **http://localhost:4200**

O comando inicia:
- **Vite** (frontend React + HMR)
- **Hono** (API REST em `/api/*`) via plugin SSR do Vite

Tudo num só processo — não há dois servidores separados.

---

## 4. Comandos úteis

```bash
# Desenvolvimento
bun run dev                    # inicia app (porta 4200)

# Base de dados
cd packages/web
bun run db:studio              # abre Drizzle Studio (UI para ver/editar DB)
bun run db:push                # sincroniza schema.ts → DB (sem migrações)
bun run db:generate            # gera ficheiros de migração
bun run db:migrate             # corre migrações pendentes

# Build produção
bun run build
```

---

## 5. Estrutura do projecto — onde está cada coisa

```
buildingmind/
├── .env                        ← variáveis de ambiente (NÃO commitar)
├── package.json                ← scripts raiz + workspaces
│
└── packages/
    └── web/                    ← tudo o que interessa está aqui
        ├── index.html          ← entry HTML
        ├── vite.config.ts      ← configuração Vite
        ├── drizzle.config.ts   ← configuração Drizzle ORM
        │
        └── src/
            ├── api/            ← BACKEND (Hono)
            │   ├── index.ts         ← regista todas as rotas
            │   ├── auth.ts          ← configuração Better Auth
            │   ├── database/
            │   │   ├── schema.ts    ← ★ SCHEMA DA DB (começa aqui)
            │   │   └── index.ts     ← cliente Turso/LibSQL
            │   ├── middleware/
            │   │   └── auth.ts      ← middleware JWT
            │   ├── routes/          ← ★ ROTAS DA API
            │   │   ├── quotas.ts
            │   │   ├── recibos.ts
            │   │   ├── fracoes.ts
            │   │   ├── despesas.ts
            │   │   ├── bank.ts      ← sincronização bancária
            │   │   └── ...
            │   └── lib/
            │       ├── pdf-generator.ts        ← geração de recibos PDF
            │       └── reconciliation-engine.ts ← motor bancário
            │
            └── web/            ← FRONTEND (React)
                ├── main.tsx         ← entry point React
                ├── app.tsx          ← routing (Wouter)
                ├── styles.css       ← Tailwind CSS
                ├── components/
                │   ├── Layout.tsx   ← sidebar + header
                │   ├── ProtectedRoute.tsx
                │   └── ui/          ← componentes base (Button, Modal, etc.)
                ├── pages/           ← ★ PÁGINAS (uma por rota)
                │   ├── index.tsx    ← dashboard
                │   ├── quotas.tsx
                │   ├── recibos.tsx
                │   └── ...
                ├── hooks/
                └── lib/
                    ├── api.ts       ← cliente API tipado (Hono client)
                    └── auth.ts      ← authClient (Better Auth)
```

---

## 6. Como adicionar uma nova feature — passo a passo

### Exemplo: nova página "Assembleias"

**1. Schema (se precisar de nova tabela)**
```ts
// packages/web/src/api/database/schema.ts
export const assembleias = sqliteTable("assembleias", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  ata: text("ata"),
  createdAt: integer("created_at", { mode: "timestamp" })
});
```
Depois: `bun run db:push`

**2. Rota API**
```ts
// packages/web/src/api/routes/assembleias.ts
import { Hono } from "hono";
import { db } from "../database";
import { assembleias } from "../database/schema";

const app = new Hono();

app.get("/", async (c) => {
  const rows = await db.select().from(assembleias);
  return c.json(rows);
});

export default app;
```

**3. Registar a rota**
```ts
// packages/web/src/api/index.ts
import assembleias from "./routes/assembleias";
app.route("/assembleias", assembleias);
```

**4. Página React**
```tsx
// packages/web/src/web/pages/assembleias.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function AssembleiasPage() {
  const { data } = useQuery({
    queryKey: ["assembleias"],
    queryFn: () => api.assembleias.$get().then(r => r.json())
  });
  // ...
}
```

**5. Adicionar ao routing**
```tsx
// packages/web/src/web/app.tsx
import AssembleiasPage from "./pages/assembleias";
<Route path="/assembleias" component={AssembleiasPage} />
```

**6. Adicionar ao sidebar**
```tsx
// packages/web/src/web/components/Layout.tsx
{ href: "/assembleias", label: "Assembleias", icon: ... }
```

---

## 7. Stack em detalhe — o que estudar

| O quê | Docs |
|-------|------|
| **Hono** — API REST | https://hono.dev/docs |
| **Drizzle ORM** — queries DB | https://orm.drizzle.team/docs |
| **Better Auth** — autenticação | https://www.better-auth.com/docs |
| **React Query** — fetch/cache no frontend | https://tanstack.com/query/latest |
| **Wouter** — routing React (simples) | https://github.com/molefrog/wouter |
| **Tailwind CSS** — estilos | https://tailwindcss.com/docs |
| **Turso** — base de dados SQLite cloud | https://docs.turso.tech |
| **Zod** — validação de dados | https://zod.dev |

---

## 8. Fluxo de dados — como funciona

```
Browser (React)
    ↓  fetch via api.ts (Hono client tipado)
/api/* (Hono)
    ↓  middleware de auth verifica JWT
Route Handler
    ↓  Drizzle ORM
Turso (SQLite cloud)
```

O cliente API em `src/web/lib/api.ts` é gerado automaticamente pelo Hono com tipos — autocomplete total no VSCode.

---

## 9. Base de dados — tabelas existentes

| Tabela | Descrição |
|--------|-----------|
| `user` | Utilizadores (admin + condóminos) |
| `account` | Credenciais Better Auth |
| `session` | Sessões activas |
| `fracoes` | Frações do condomínio (A–AJ) |
| `quotas` | Quotas mensais e extras por fração |
| `quota_tipos` | Tipos de quota (mensal, elevadores, portão, incêndio) |
| `recibos` | Recibos gerados |
| `despesas` | Despesas do condomínio |
| `fornecedores` | Fornecedores/prestadores |
| `configuracoes` | Configurações globais |
| `bank_connections` | Ligações bancárias |
| `bank_sync_logs` | Logs de sincronização |
| `import_logs` | Histórico de importações |

Ver schema completo: `packages/web/src/api/database/schema.ts`
