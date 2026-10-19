# Gestão Financeira – Orprocon (React)

Nova versão da Gestão Financeira, em **React + Tailwind CSS**, que vai substituir a versão em HTML/JS
(repositório `Orprocon-Gestao-Financeira`). Mesma identidade visual, mesmas regras e mesmo backend
(API Java/Spring + PostgreSQL).

## Rodar no computador

Precisa do Node.js 20 ou mais novo.

```
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes das regras (os mesmos da versão anterior)
npm run build    # gera a pasta dist/ (o que vai para o ar)
```

Para testar com a API rodando no computador, abra uma vez `http://localhost:5173/?api=http://localhost:8080`
(e acrescente `http://localhost:5173` em `CORS_ORIGENS` da API).

## Como está organizado

| Pasta | O que tem |
|---|---|
| `src/legado/` | As **regras** do sistema, trazidas da versão anterior sem reescrever: extratos, planilhas, conciliação, integração com o Único, login, armazenamento e os dados de cada módulo. Testadas em `tests/`. |
| `src/lib/` | Ligação das regras com o React: `legado.js` (carrega as regras), `auth.jsx` (login), `menu.js`, `tema.js`, `contabil.mjs` + `useContabil.js` (Integração contábil) e `leitores.js` (planilhas, PDF, OFX, downloads). |
| `src/componentes/` | Peças da tela: menu e topo (`Layout`), janelas (`Janela`), avisos e confirmações (`Avisos`), `Suporte`, `Icone`; as janelas da Integração contábil ficam em `contabil/`. |
| `src/paginas/` | As telas: `Login`, `Inicio`, `Integracao`, `Conta`, `Cadastro`, `Usuarios`, `Modulo` e as que estão em construção (veja `docs/MIGRACAO.md`). |
| `public/modulos/` | Os módulos da versão anterior, abertos num quadro enquanto não são refeitos em React. |
| `tests/` | Testes automáticos (`node --test`). |
| `docs/` | `GIT.md` (fluxo de branches) e `MIGRACAO.md` (o que já foi passado para React). |

Configurações (modo de teste, endereço da API, suporte) ficam em `src/legado/config.js`.

## Dados

Publicado no mesmo endereço (`orprocondigital-web.github.io`), usa o **mesmo armazenamento** da versão
anterior: mesmos usuários e senha, mesmos lançamentos e dados dos módulos. Com a API ligada
(`apiUrl`), tudo passa a vir do servidor.

## Publicação

O GitHub Actions (`.github/workflows/publicar.yml`) roda os testes e compila em todo Pull Request,
e publica no GitHub Pages quando a `main` muda. Fluxo de branches em [`docs/GIT.md`](docs/GIT.md).
