/*
 * As regras do sistema (as mesmas da versão HTML, sem reescrever): leitura de extratos e planilhas,
 * conciliação, integração com o Único, login, armazenamento e os dados de cada módulo.
 * Cada arquivo publica um objeto global (Core, Integracao, AuthCore...); a ordem dos imports importa,
 * porque uns usam os outros. Os testes (pasta tests/) usam estes mesmos arquivos.
 */
import "../legado/config.js";
import "../legado/storage.js";
import "../legado/core.js";
import "../legado/integracao.js";
import "../legado/importacao.js";
import "../legado/extratos.js";
import "../legado/pdfextrato.js";
import "../legado/conciliacao.js";
import "../legado/nfe.js";
import "../legado/api.js";
import "../legado/auth.js";
import "../legado/modulos.js";
import "../legado/suporte.js";
import "../legado/modulos/em-dia/dados.js";
import "../legado/modulos/iss-tubarao/leitor.js";
import "../legado/modulos/iss-tubarao/dados.js";
import "../legado/modulos/controle-horas/regras.js";
import "../legado/modulos/controle-horas/dados.js";
import "../legado/inicio.js";

const g = self;
export const CONFIG = g.CONFIG;
export const Store = g.Store;
export const Core = g.Core;
export const Integracao = g.Integracao;
export const Importacao = g.Importacao;
export const Extratos = g.Extratos;
export const PdfExtrato = g.PdfExtrato;
export const Conciliacao = g.Conciliacao;
export const Nfe = g.Nfe;
export const AuthCore = g.AuthCore;
export const Modulos = g.Modulos;
export const Suporte = g.Suporte;
export const Inicio = g.Inicio;
