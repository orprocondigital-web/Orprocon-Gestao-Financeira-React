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
| Apuração de ICMS, Auditor IBS/CBS, ISS, Vencimentos, Em Dia, Controle de horas | 🟡 Abrem no quadro (versão anterior); refazer um por um |
| Integração contábil, contas, unidades, movimentos e cadastros | ⏳ A fazer |
| Conciliação | ⏳ A fazer |
| Usuários (administração) | ⏳ A fazer |
| Ligar os dados à API (lançamentos, cadastros, módulos) | ⏳ A fazer, junto com cada tela |
| App instalável e modo sem internet (PWA) | ⏳ A fazer |

Ordem sugerida: Usuários → Integração contábil (contas e cadastros) → Conciliação → módulos, dos mais
simples (Vencimentos, ISS) aos maiores. Cada parte numa branch `feat/...` com Pull Request.
