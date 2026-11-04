/*
 * Ler certificado digital (.pfx / .p12) sem digitar nada: titular, CNPJ/CPF, emissão e vencimento saem de dentro do
 * arquivo. A leitura acontece só no navegador (o arquivo e a senha não vão para o servidor e não são guardados).
 *
 * O PKCS#12 é aberto com a biblioteca node-forge (carregada só quando alguém usa o botão, ver leitores.js).
 * Aqui ficam as regras, sem tela: testadas em tests/certificado.test.js.
 */
const txt = (v) => String(v == null ? "" : v).trim();

/**
 * Senhas para tentar, tiradas do nome do arquivo (padrão da pasta do escritório:
 * "EMPRESA LTDA senha.123456 val.10.09.2027.pfx", "senha. Abc123(asterisco)", "senha_Pp848103"...).
 * A primeira é a mais provável; depois vêm as palavras do nome e as senhas mais comuns da pasta.
 */
export function senhasDoNome(nome) {
  const base = txt(nome).replace(/\.(pfx|p12)$/i, "");
  const lista = [];
  const add = (s) => { if (s != null && !lista.includes(s)) lista.push(s); };
  const comAst = base.replace(/\((e um )?asterisco\)|\s+asterisco\b/gi, "*");
  const m = /senha?s?\s*[._:-]?\s*(\S+?)(?=\s+(?:val|venc|validade)|\s*$|-val)/i.exec(comAst.replace(/sennha/gi, "senha"));
  if (m) { add(m[1].replace(/\.$/, "")); add(m[1]); }
  ["123456", "12345678", "12345", "1234", ""].forEach(add);
  comAst.split(/\s+/).forEach((parte) => {
    [parte].concat(parte.split(/[._]/), [parte.split(".").slice(1).join("."), parte.split("-")[0]]).forEach((x) => {
      x = txt(x);
      if (x) { add(x); add(x + "*"); add(x.replace(/\*+$/, "")); }
    });
  });
  return lista;
}

/** Validade escrita no nome do arquivo ("val.10.09.2027", "vence 08-04-26"), só como apoio. ISO ou "". */
export function validadeDoNome(nome) {
  const m = /(?:val|venc\w*|validade)\.?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i.exec(txt(nome));
  if (!m) return "";
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return ano + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

/** Data do certificado (UTC) no dia de Brasília. */
function diaBrasilia(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "EMPRESA LTDA:12345678000199" → { titular, documento }. */
export function titularDoCN(cn) {
  const t = txt(cn);
  const m = /^(.*?):\s*(\d{11}|\d{14})\s*$/.exec(t);
  return m ? { titular: m[1].replace(/\s+/g, " ").trim(), documento: m[2] } : { titular: t.replace(/\s+/g, " "), documento: "" };
}

const CN = "2.5.4.3";
const valorDe = (subject, oid) => { const a = subject && subject.attributes && subject.attributes.find((x) => x.type === oid); return a ? a.value : ""; };

/** Converte o arquivo (ArrayBuffer/Uint8Array) para a "string binária" que o forge usa. */
function binario(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return s;
}

/**
 * Abre o certificado com a primeira senha que funcionar.
 * Devolve { ok: true, titular, documento, emissao, vencimento, emissor } ou { ok: false, motivo: "senha" | "arquivo" }.
 */
export function lerCertificado(forge, bytes, senhas) {
  let asn1;
  try { asn1 = forge.asn1.fromDer(binario(bytes), { strict: false, parseAllBytes: false }); } catch (e) { return { ok: false, motivo: "arquivo" }; }
  let p12 = null;
  for (const s of senhas) {
    try { p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, s); break; } catch (e) { /* senha errada: tenta a próxima */ }
  }
  if (!p12) return { ok: false, motivo: "senha" };
  const oid = forge.pki.oids.certBag;
  const certs = ((p12.getBags({ bagType: oid })[oid]) || []).map((b) => b.cert).filter(Boolean);
  if (!certs.length) return { ok: false, motivo: "arquivo" };
  // o do titular: o CN termina em ":CNPJ" ou ":CPF" (padrão ICP-Brasil); senão o que não é de autoridade certificadora
  const ehCA = (c) => { const bc = c.getExtension && c.getExtension("basicConstraints"); return !!(bc && bc.cA); };
  const cert = certs.find((c) => /:\s*\d{11,14}\s*$/.test(valorDe(c.subject, CN))) || certs.find((c) => !ehCA(c)) || certs[0];
  const { titular, documento } = titularDoCN(valorDe(cert.subject, CN));
  return {
    ok: true, titular, documento,
    emissao: diaBrasilia(cert.validity.notBefore), vencimento: diaBrasilia(cert.validity.notAfter),
    emissor: txt(valorDe(cert.issuer, "2.5.4.10") || valorDe(cert.issuer, CN)) };
}

/** CNPJ/CPF com pontuação. */
export function formatarDocumento(d) {
  const x = txt(d).replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return x;
}

/**
 * Um certificado por CNPJ/CPF (se vierem vários arquivos do mesmo titular, fica o de vencimento mais longe), com o
 * documento pontuado, prontos para depCadastro.previaCertificados / gravarCertificados.
 */
export function unicosPorDocumento(lidos) {
  const melhor = {};
  lidos.filter((l) => l && l.ok && l.vencimento).forEach((l) => {
    const k = txt(l.documento).replace(/\D/g, "") || "n:" + txt(l.titular).toUpperCase();
    if (!melhor[k] || melhor[k].vencimento < l.vencimento) melhor[k] = l;
  });
  return Object.keys(melhor).map((k) => Object.assign({}, melhor[k], { documento: formatarDocumento(melhor[k].documento) }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
