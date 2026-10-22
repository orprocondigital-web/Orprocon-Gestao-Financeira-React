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
| Departamento Cadastro: importar PDFs (lê tipo, CNPJ, datas e número; PDF anexado), planilha do Excel, demonstração e limpar | ✅ React (PDFs em `src/lib/arquivos.js`, banco próprio do navegador, fora do backup) |
| Em Dia simples: grade empresas × obrigações por setor e mês, responsáveis, passagem de bastão, diário, importar CSV de entregas e planilha de controle | ✅ React (`src/lib/emDia.mjs`, dados em `emDia:v2`; o Em Dia antigo saiu do menu) |
| Cadastro geral de empresas (Departamento Cadastro › Empresas): código, regime, matriz/filial pelo CNPJ, cliente desde/até, responsável de cada setor | ✅ React (mesma chave `painelVencimentos:v1`; responsáveis gravados no Em Dia) |
| Em Dia: regras de cada obrigação (meses, regimes, tipo do Lucro Real, vencimento em dia fixo ou último dia útil, código, ativa) e pendência atrasada; visão do ano (JAN–DEZ) por empresa e por pessoa, com Excel | ✅ React (regras em `emDia:v2`, campo `regras`; o formato antigo com `freq` continua sendo lido) |
| Cadastro de empresas: sócios (filial usa os da matriz), tipo do Lucro Real, Imune e Isenta, data de baixa, segmento e contato; importa a aba Empresas do sistema do Depto. Contábil (sem as colunas de senha) | ✅ React |
| Em Dia: responsável por competência (histórico); a troca vale a partir de um mês e não muda os meses anteriores | ✅ React (`histResp` em `emDia:v2`) |
| Distribuição de lucros (do sistema do Depto. Contábil): registro por sócio, IRRF de 10% (base = líquido ÷ 90 × 100), sugestão de retenção acima de R$ 50 mil no mês, saldo de ata, prazos do DARF 1841 e da REINF, Excel | ✅ React (`src/lib/lucros.mjs`, dados em `lucros:v1`, área `contabil-lucros`) |
| REINF por competência: matrizes clientes no mês, notas de serviço, lucros distribuídos, confirmação, prazo do mês | ✅ React (mesmo módulo) |
| Encerramento do exercício: estoque inicial, compras, estoque final, receita, CMV, lucro bruto e %, resultado antes do estoque e do período; matriz + filiais + consolidado; encerrar/reabrir; sócios com o distribuído no ano e "Adicionar distribuição" em 31/12; Excel. Falta o rateio por faturamento (a fórmula está no JavaScript.html, que não veio) | ✅ React (`/encerramento`, `src/lib/encerramento.mjs`, dados em `encerramento:v1`) |
| Fechamento contábil (o "mês fechado" do Depto. Contábil): visto por empresa e mês, filial segue a matriz, progresso por pessoa e equipe, Excel; cartões no Início com o fechamento e a REINF | ✅ React (`/fechamento`, regras em `src/lib/emDia.mjs`, dados em `emDia:v2`) |
| Apuração de ICMS, Auditor IBS/CBS, ISS, Controle de horas | 🟡 Abrem no quadro (versão anterior); refazer um por um |
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
