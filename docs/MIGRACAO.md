# Migração para React

A versão HTML continua no ar enquanto esta fica pronta. Ela está **congelada**: só recebe correção de
erro; novidades entram só aqui. Quando tudo abaixo estiver feito, esta versão passa a ser a oficial e a
anterior é arquivada.

| Parte | Situação |
|---|---|
| Regras (extratos, planilhas, conciliação, integração, login, módulos) | ✅ Trazidas sem reescrever, com os testes |
| Login (mesmo administrador, modo de teste, primeiro acesso, importar acessos, senha provisória) | ✅ React |
| Menu, topo, tema claro/escuro, menu no celular, menu recolhido | ✅ React |
| Início (capa com as ferramentas e mini cards do dia) | ✅ React |
| Suporte (WhatsApp) | ✅ React |
| Departamento Cadastro: Certidões e Alvarás (com vencimento e renovação), Faturamentos e Demonstrativos contábeis | ✅ React (substitui o Painel de vencimentos; os dados dele continuam) |
| Apuração de ICMS, Auditor IBS/CBS, ISS, Em Dia, Controle de horas | 🟡 Abrem no quadro (versão anterior); refazer um por um |
| Integração contábil: painel do mês, importar planilha e extratos, distribuir por unidade, gerar TXTs (atual e Único), backup | ✅ React |
| Contas bancárias, unidades, outras movimentações (lançamentos, busca, filtros, editar, excluir com Desfazer) | ✅ React |
| Cadastros (importar a aba ou cadastrar à mão, editar, excluir com Desfazer) | ✅ React |
| Conciliação por conta (extrato × lançamentos, conciliar à mão, conferido, exportar) | ✅ React |
| Conciliação Extrato × planilha (planilha, balancete de fornecedores, XML de NF-e, conciliações salvas) | ⏳ Próxima entrega |
| Usuários (administração), trocar a minha senha | ✅ React (com confirmações no visual do sistema e "Desfazer" ao desativar) |
| Ligar os dados à API (lançamentos, cadastros, módulos) | ⏳ A fazer, junto com cada tela |
| App instalável, abre sem internet, aviso de versão nova (PWA) | ✅ React (`pwa/`: o `sw.js` é gerado a cada build) |

Ordem sugerida: Conciliação → virada (esta versão vira a oficial) → dados no servidor → módulos, dos mais
simples (Vencimentos, ISS) aos maiores. Cada parte numa branch `feat/...` com Pull Request.

## Onde ficam as regras da Integração contábil

- `src/lib/contabil.mjs`: contas, lançamentos, cadastros, mês de trabalho, importação, extratos, distribuição,
  TXTs e backup. Sem tela; testado em `tests/contabil.test.js`. Usa as mesmas chaves de dados da versão HTML,
  então os dois sistemas mostram os mesmos dados no navegador (e um restaura o backup do outro).
- `src/lib/useContabil.js`: a instância única e o hook que redesenha as telas a cada gravação.
- `src/lib/leitores.js`: leitura de planilha, PDF, OFX e download de arquivos (os leitores grandes só baixam quando usados).
- `src/lib/conciliar.mjs`: resultado da conciliação (cruzamento + o que foi feito à mão), testado em `tests/conciliar.test.js`.
- `src/lib/depCadastro.mjs`: Departamento Cadastro. Certidões e alvarás continuam na chave do antigo painel (`painelVencimentos:v1`); faturamentos e demonstrativos em `depCadastro:v1`. Testado em `tests/depCadastro.test.js`.
- Telas: `src/paginas/DepCadastro.jsx`, `src/paginas/Conciliacao.jsx`, `src/paginas/Integracao.jsx`, `Conta.jsx`, `Cadastro.jsx` e as janelas em `src/componentes/contabil/`.
