/* ============================================================
   MOTOR DO RAIO-X POP — extraido de analisefranquia/index.html (motor v2)
   Sem DOM. Mesmas contas da Maquina de Analise de Lojas.
   Entrada: linhas normalizadas (linhasDoBI a partir do CSV, ou o mapeamento
   do banco de compras na rotina noturna). Saida: o objeto R do diagnostico.
   ============================================================ */
'use strict';
/* ---------- Parser CSV (sep ;, aspas, BOM, CRLF) ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const primeirasLinhas = text.split('\n').slice(0, 5).join('\n'); /* não só a 1ª linha: alguns exports têm uma linha de título antes do cabeçalho, sem separador nenhum */
  const sep = primeirasLinhas.includes(';') ? ';' : ','; /* alguns exports do One Pet usam vírgula em vez de ; */
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (!rows.length) return [];
  /* Alguns exports do One Pet (ex.: relatório de entrada/compra) têm uma linha de
     título sozinha ("ONEPET") antes do cabeçalho de verdade. O cabeçalho real é a
     primeira linha com mais de 3 campos — uma linha de título não passa disso. */
  let headerIdx = rows.findIndex(r => r.length > 3);
  if (headerIdx < 0) headerIdx = 0;
  const head = rows[headerIdx].map(h => h.trim());
  return rows.slice(headerIdx + 1).map(r => { const o = {}; head.forEach((h, j) => o[h] = (r[j] !== undefined ? r[j].trim() : '')); return o; });
}

/* ---------- Conversores BR ---------- */
function num(s) {
  if (s === undefined || s === null || s === '') return NaN;
  let t = String(s).replace(/R\$|\s|%/g, '');
  /* Formato BR (ponto=milhar, vírgula=decimal) só quando há vírgula.
     Sem vírgula, o ponto já É o separador decimal — corrige o caso dos
     "itens a granel" (peso em kg), que o ABC exporta em formato "72.44"
     em vez de "72,44". Tratar sempre o ponto como milhar nesse caso
     inflava a quantidade vendida em milhões de vezes. */
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(t); return isNaN(v) ? NaN : v;
}
function n0(s) { const v = num(s); return isNaN(v) ? 0 : v; }
function pDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
const mesKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const mesLabel = k => MES_PT[+k.slice(5) - 1] + '/' + k.slice(2, 4);
const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = a => a.reduce((x, y) => x + y, 0);
const fmtData = d => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();

/* ---------- Estoque parado (produtos com muito tempo sem vender) ---------- */
/* Classificação 100% derivada dos dados: o "prazo razoável" de giro é o próprio
   período analisado (ex.: se a loja mandou 7 meses de BI, um item cujo estoque
   demoraria mais de 7 meses para vender no ritmo atual está com giro muito lento —
   não é um número arbitrário, é o próprio histórico da loja). */
function analisaEstoqueParado(abcProd, periodoDias) {
  if (!abcProd || !abcProd.length) return null;
  const todosGranel = abcProd.filter(r => (r['Grupo Linha'] || '').toUpperCase().trim() === 'ITENS A GRANEL');
  const granelNeg = todosGranel.filter(r => n0(r['Estoque']) < 0).length;
  const itensRaw = abcProd.map(r => ({
    desc: r['Descrição'] || r['Descricao'] || '(sem descrição)',
    grupo: (r['Grupo Linha'] || '').toUpperCase().trim(),
    classe: (r['Classe'] || '').trim(),
    estoque: n0(r['Estoque']), qtd: n0(r['Qtd.Vendida'] || r['Qtd Vendida']), valor: n0(r['Valor Vendido'])
  })).filter(r => r.estoque > 0);
  if (!itensRaw.length) return null;

  const grpPreco = {};
  itensRaw.forEach(r => { if (r.qtd > 0) { const g = grpPreco[r.grupo] = grpPreco[r.grupo] || { v: 0, q: 0 }; g.v += r.valor; g.q += r.qtd; } });
  const precoGrupo = g => grpPreco[g] && grpPreco[g].q ? grpPreco[g].v / grpPreco[g].q : 0;

  const itens = itensRaw.map(r => {
    const precoUnit = r.qtd > 0 ? r.valor / r.qtd : precoGrupo(r.grupo);
    const valorParado = r.estoque * precoUnit;
    const meses = r.qtd > 0 ? (r.estoque / (r.qtd / periodoDias)) / 30 : Infinity;
    let status;
    if (r.qtd === 0) status = 'sem_giro';
    else if (meses > 60) status = 'suspeito'; /* +5 anos de estoque é implausível — provável erro de unidade/lançamento, não vira número confiável */
    else if (meses * 30 > periodoDias) status = 'muito_lento';
    else if (meses * 30 > periodoDias / 2) status = 'lento';
    else status = 'normal';
    return Object.assign({}, r, { precoUnit, valorParado, meses, status, critico: status === 'sem_giro' });
  });
  const parado = itens.filter(i => i.status === 'sem_giro' || i.status === 'muito_lento').sort((a, b) => b.valorParado - a.valorParado);
  const lento = itens.filter(i => i.status === 'lento');
  const suspeitos = itens.filter(i => i.status === 'suspeito').sort((a, b) => b.estoque - a.estoque);
  const mais60 = itens.filter(i => i.status !== 'normal' && i.status !== 'suspeito' && (i.status === 'sem_giro' || i.meses * 30 > 60));
  return {
    fonte: 'derivado', periodoDias, nCritico: parado.filter(i => i.status === 'sem_giro').length,
    nMuitoLento: parado.filter(i => i.status === 'muito_lento').length, nLento: lento.length,
    totalParadoValor: sum(parado.map(i => i.valorParado)), totalLentoValor: sum(lento.map(i => i.valorParado)),
    top: parado.slice(0, 10), granelTotal: todosGranel.length, granelNeg,
    nSuspeitos: suspeitos.length, topSuspeitos: suspeitos.slice(0, 6),
    n60Mais: mais60.length, valor60Mais: sum(mais60.map(i => i.valorParado))
  };
}

/* Estoque parado a partir do relatório nativo do One Pet (mais preciso: dias reais sem
   venda e custo real, em vez de estimativa). Nenhuma loja física guarda milhares de
   unidades (ou kg) de um único produto numa prateleira — acima disso é praticamente
   sempre erro de unidade/lançamento na exportação, não estoque real. */
function analisaEstoqueParadoNativo(rows) {
  if (!rows || !rows.length) return null;
  const LIMITE_FISICO = 5000;
  const todos = rows.map(r => ({
    desc: r['Produto'] || '(sem descrição)', grupo: (r['Grupo Linha'] || '').toUpperCase().trim(),
    fornecedor: r['Fornecedor'] || '', dias: n0(r['Dias no estoque sem venda']),
    estoque: n0(r['Estoque atual']), custoTotal: n0(r['Total Preço de Custo'])
  })).filter(r => r.estoque > 0);
  if (!todos.length) return null;

  const suspeitos = todos.filter(r => r.estoque > LIMITE_FISICO).sort((a, b) => b.estoque - a.estoque);
  const itens = todos.filter(r => r.estoque <= LIMITE_FISICO && r.custoTotal > 0).map(r => {
    const status = r.dias >= 365 ? 'estagnado' : r.dias >= 180 ? 'muito_lento' : 'lento';
    return Object.assign({}, r, { valorParado: r.custoTotal, status, critico: status === 'estagnado' });
  });
  const parado = itens.filter(i => i.status === 'estagnado' || i.status === 'muito_lento').sort((a, b) => b.valorParado - a.valorParado);
  const lento = itens.filter(i => i.status === 'lento');
  const mais60 = itens.filter(i => i.dias > 60);
  return {
    fonte: 'nativo', nCritico: parado.filter(i => i.status === 'estagnado').length,
    nMuitoLento: parado.filter(i => i.status === 'muito_lento').length, nLento: lento.length,
    totalParadoValor: sum(parado.map(i => i.valorParado)), totalLentoValor: sum(lento.map(i => i.valorParado)),
    top: parado.slice(0, 10), granelTotal: 0, granelNeg: 0,
    nSuspeitos: suspeitos.length, topSuspeitos: suspeitos.slice(0, 6),
    diasMin: Math.min(...todos.map(r => r.dias)), diasMax: Math.max(...todos.map(r => r.dias)),
    n60Mais: mais60.length, valor60Mais: sum(mais60.map(i => i.valorParado))
  };
}

/* ---------- Constantes da metodologia (fixas, não editáveis) ---------- */
const K = { RESGATE: 0.15, JANELA_BT_ATIVO: 60 };

/* ---------- Bandas de recência (fixas) ---------- */
const BANDAS = [
  { id: '0-30',  rot: 'Em dia',     max: 30,       cor: '#009150' },
  { id: '31-45', rot: 'No limite',  max: 45,       cor: '#A8D3C4' },
  { id: '46-60', rot: 'Resgatar',   max: 60,       cor: '#FDAE25' },
  { id: '61-90', rot: 'Urgente',    max: 90,       cor: '#E67E22' },
  { id: '90+',   rot: 'Reativar',   max: Infinity, cor: '#C0392B' }
];
const bandaDe = dias => BANDAS.find(b => dias <= b.max);
function pDataHora(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}
const VAZIO = v => !v || !v.trim() || /^N[ÃA]O INFORMADO$/i.test(v.trim());

/* Classificação por faixa (%): usada no card de clientes identificados e para gerar tarefas.
   <30% vermelho (cobre o "<20% crítico") · 30–60% laranja · 61–80% amarelo · 81–100% verde */
function nivelPct(pct) {
  if (pct < 30) return { nivel: 'vermelho', cor: '#C0392B', bg: '#FBECEA', label: 'Crítico' };
  if (pct <= 60) return { nivel: 'laranja', cor: '#E67E22', bg: '#FDEEE1', label: 'Atenção' };
  if (pct <= 80) return { nivel: 'amarelo', cor: '#8A5A00', bg: '#FFF3D6', label: 'Regular' };
  return { nivel: 'verde', cor: '#009150', bg: '#E4F5EB', label: 'Bom' };
}

/* ---------- Detecção de tipo de arquivo ---------- */
function detectType(rows) {
  if (!rows.length) return 'vazio';
  const h = Object.keys(rows[0]);
  if (h.includes('N. Pedido') && h.includes('Total Item')) return 'bi';
  if (h.includes('Dias no estoque sem venda') && h.includes('Estoque atual')) return 'estoqueparado';
  if (h.some(k => k.startsWith('Estoque ATUAL FILIAL')) && h.includes('TOTAL PREÇO DE CUSTO')) return 'estoqueatual';
  if (h.includes('Nº Entradas') && h.includes('Total Produto')) return 'abccompras';
  if (h.includes('Número da NF') && h.includes('Custo final')) return 'entrada';
  if (h.includes('Estoque') && (h.includes('Qtd.Vendida') || h.includes('Qtd Vendida'))) return 'abcprod';
  if (h.includes('Última Compra') || h.includes('Ultima Compra')) return 'abccli';
  return 'desconhecido';
}
function explicaDesconhecido(rows) {
  if (!rows.length) return 'o arquivo está vazio.';
  const h = new Set(Object.keys(rows[0]));
  const falta = need => need.filter(c => !h.has(c));
  const fBi = falta(['N. Pedido', 'Total Item']), fProd = falta(['Estoque', 'Qtd.Vendida']), fCli = falta(['Última Compra']);
  if (fBi.length <= 1) return `parece um export de BI, mas falta a coluna "${fBi[0]}".`;
  if (fProd.length <= 1) return `parece um ABC de produtos, mas falta a coluna "${fProd[0]}".`;
  if (fCli.length === 0) return 'parece um ABC de clientes — confira se o nome do arquivo bate.';
  return 'não reconheço nenhuma das colunas esperadas (BI: "N. Pedido"/"Total Item" · ABC produtos: "Estoque"/"Qtd.Vendida"). Confira se é mesmo um export do One Pet.';
}

/* ---------- Motor principal ---------- */
/* ---------- Compras e fornecedores (relatório de entrada + ABC de compras) ---------- */
function analisaCompras(entradaRowsArr, abcCompras, estoqueParado) {
  const linhas = [];
  (entradaRowsArr || []).forEach(rows => rows.forEach(r => {
    const d = pDate(r['Data']); if (!d) return;
    const custo = n0(r['Custo final']), qtd = n0(r['Quantidade']);
    linhas.push({ d, nf: r['Número da NF'], fornecedor: (r['Fornecedor'] || '(sem fornecedor)').trim(), produto: (r['Produto'] || '').trim(), qtd, custo, total: custo * qtd });
  }));
  if (!linhas.length && !(abcCompras && abcCompras.length)) return null;

  let porFornecedor = null, periodoIni = null, periodoFim = null, totalComprado = 0;
  if (linhas.length) {
    linhas.sort((a, b) => a.d - b.d);
    periodoIni = linhas[0].d; periodoFim = linhas[linhas.length - 1].d;
    const fMap = {};
    linhas.forEach(l => { const f = fMap[l.fornecedor] = fMap[l.fornecedor] || { total: 0, nfs: new Set(), produtos: new Set() }; f.total += l.total; f.nfs.add(l.nf); f.produtos.add(l.produto); });
    totalComprado = sum(Object.values(fMap).map(f => f.total));
    porFornecedor = Object.entries(fMap).map(([nome, f]) => ({ nome, total: f.total, nNotas: f.nfs.size, nProdutos: f.produtos.size, share: totalComprado ? 100 * f.total / totalComprado : 0 })).sort((a, b) => b.total - a.total);
  } else {
    const fMap = {};
    abcCompras.forEach(r => { const f = (r['Fornecedor'] || '(sem fornecedor)').trim(); fMap[f] = (fMap[f] || 0) + n0(r['Total Produto']); });
    totalComprado = sum(Object.values(fMap));
    porFornecedor = Object.entries(fMap).map(([nome, total]) => ({ nome, total, nNotas: null, nProdutos: null, share: totalComprado ? 100 * total / totalComprado : 0 })).sort((a, b) => b.total - a.total);
  }
  const top3Share = porFornecedor ? sum(porFornecedor.slice(0, 3).map(f => f.share)) : 0;

  const custoSubindo = [];
  if (linhas.length) {
    const porProduto = {};
    linhas.forEach(l => { (porProduto[l.produto] = porProduto[l.produto] || []).push(l); });
    Object.entries(porProduto).forEach(([produto, ls]) => {
      if (ls.length < 2 || !produto) return;
      ls.sort((a, b) => a.d - b.d);
      const primeiro = ls[0], ultimo = ls[ls.length - 1];
      if (primeiro.custo > 0 && ultimo.d > primeiro.d) {
        const variacao = 100 * (ultimo.custo / primeiro.custo - 1);
        if (variacao > 15) custoSubindo.push({ produto, fornecedor: ultimo.fornecedor, custoIni: primeiro.custo, custoFim: ultimo.custo, variacao, dataIni: primeiro.d, dataFim: ultimo.d });
      }
    });
    custoSubindo.sort((a, b) => b.variacao - a.variacao);
  }

  const recompraParado = [];
  if (linhas.length && estoqueParado && estoqueParado.top && estoqueParado.top.length) {
    const refData = linhas[linhas.length - 1].d, janela90 = 90 * 864e5;
    const nomesParados = {};
    estoqueParado.top.forEach(i => { nomesParados[i.desc.toUpperCase().trim()] = i; });
    const vistos = new Set();
    linhas.forEach(l => {
      const key = l.produto.toUpperCase();
      if (nomesParados[key] && (refData - l.d) < janela90 && !vistos.has(key)) { vistos.add(key); recompraParado.push({ produto: l.produto, fornecedor: l.fornecedor, dataCompra: l.d, qtd: l.qtd }); }
    });
  }

  return { periodoIni, periodoFim, totalComprado, porFornecedor, top3Share, nFornecedores: porFornecedor.length, temDetalhe: linhas.length > 0, custoSubindo: custoSubindo.slice(0, 8), recompraParado: recompraParado.slice(0, 8) };
}

/* ---------- Posição de estoque atual (foto completa do catálogo, não só o parado) ---------- */
function analisaEstoqueAtual(rows, filialBI) {
  if (!rows || !rows.length) return null;
  const colEstoque = Object.keys(rows[0]).find(k => k.startsWith('Estoque ATUAL FILIAL'));
  if (!colEstoque) return null;
  const filialArquivo = colEstoque.replace('Estoque ATUAL FILIAL:', '').trim();
  const itens = rows.filter(r => (r['Cód'] || '').trim() !== '' && (r['Nome'] || '').toUpperCase().trim() !== 'TOTAL GERAL').map(r => ({
    nome: r['Nome'] || '(sem nome)', grupo: (r['Grupo Linha'] || '').toUpperCase().trim(), fornecedor: r['Fornecedor'] || '',
    estoque: n0(r[colEstoque]), custo: n0(r['Custo']), precoTabela: n0(r['Preço Tabela']),
    totalCusto: n0(r['TOTAL PREÇO DE CUSTO']), totalVenda: n0(r['TOTAL PREÇO DE VENDA'])
  }));
  if (!itens.length) return null;

  const negativos = itens.filter(i => i.estoque < 0);
  const positivos = itens.filter(i => i.estoque > 0);
  const semPreco = positivos.filter(i => i.precoTabela <= 0);
  const abaixoCusto = positivos.filter(i => i.precoTabela > 0 && i.custo > 0 && i.precoTabela < i.custo)
    .map(i => Object.assign({}, i, { prejuizoUnit: i.custo - i.precoTabela, prejuizoTotal: (i.custo - i.precoTabela) * i.estoque }))
    .sort((a, b) => b.prejuizoTotal - a.prejuizoTotal);

  const valorCusto = sum(positivos.map(i => i.totalCusto));
  const valorVenda = sum(positivos.map(i => i.totalVenda));

  const gMap = {};
  positivos.forEach(i => { gMap[i.grupo] = (gMap[i.grupo] || 0) + i.totalCusto; });
  const porCategoria = Object.entries(gMap).map(([grupo, total]) => ({ grupo, total, share: valorCusto ? 100 * total / valorCusto : 0 })).sort((a, b) => b.total - a.total).slice(0, 8);

  const fMap = {};
  positivos.forEach(i => { const f = i.fornecedor || '(sem fornecedor)'; fMap[f] = (fMap[f] || 0) + i.totalCusto; });
  const porFornecedor = Object.entries(fMap).map(([nome, total]) => ({ nome, total, share: valorCusto ? 100 * total / valorCusto : 0 })).sort((a, b) => b.total - a.total).slice(0, 6);

  const filialDivergente = filialBI && filialArquivo && !filialBI.toUpperCase().includes(filialArquivo.toUpperCase().split(' - ')[0]) ? filialArquivo : null;

  return {
    filialArquivo, filialDivergente, nSKUs: positivos.length, valorCusto, valorVenda,
    margemPotencial: valorVenda ? 100 * (valorVenda - valorCusto) / valorVenda : 0,
    nNegativos: negativos.length, valorNegativos: sum(negativos.map(i => i.totalCusto)), topNegativos: negativos.sort((a, b) => a.estoque - b.estoque).slice(0, 6),
    nSemPreco: semPreco.length, topSemPreco: semPreco.slice(0, 6),
    nAbaixoCusto: abaixoCusto.length, valorAbaixoCusto: sum(abaixoCusto.map(i => i.prejuizoTotal)), topAbaixoCusto: abaixoCusto.slice(0, 8),
    porCategoria, porFornecedor
  };
}

function linhasDoBI(biRowsArr) {
  const rows = [];
  biRowsArr.forEach(rs => rs.forEach(r => {
    const d = pDate(r['Data']); if (!d) return;
    rows.push({
      ped: r['N. Pedido'], d, mk: mesKey(d),
      qtd: n0(r['Qtd']), pb: n0(r['Preço Bruto']), desc: n0(r['Deconto Produto %']),
      tot: n0(r['Total Item']), custo: num(r['Custo Total']), lucro: n0(r['Lucro Total']),
      grupo: (r['Grupo Linha'] || '').toUpperCase().trim(),
      tipo: r['Tipo'] || '', cli: r['Cod. Cliente.'] || r['Cod. Cliente'] || '',
      cliNome: r['Cliente'] || '', cel: r['Celular'] || '', fone: r['Fone'] || '',
      vend: (r['Vendedor'] || '').trim(), esp: (r['Especie'] || '').trim(),
      prod: r['Produto'] || '', filial: r['Filial'] || '',
      dataPag: pDataHora(r['Data Pagamento']), canal: r['Canal venda'] || '', bairro: r['Bairro'] || '',
      aval: r['Avaliação'] || r['Feedback'] || '', opBT: (r['Entrada'] || r['Saida'] || r['Escovação'] || ''),
      vetNome: r['Veterinário'] || '', delivery: r['Delivery'] || ''
    });
  }));
  return rows;
}
function analisar(rows, abcProd, estoqueNativo, entradaRowsArr, abcCompras, estoqueAtualRows) {
  if (!rows.length) throw new Error('Nenhuma linha válida encontrada no BI.');
  rows.sort((a, b) => a.d - b.d);
  const ref = rows[rows.length - 1].d;
  const semCad = r => !r.cliNome || /SEM CADASTRO/i.test(r.cliNome);
  const ident = rows.filter(r => !semCad(r));
  const filial = (rows.find(r => r.filial) || {}).filial || '';
  const filiaisSet = new Set(rows.map(r => r.filial).filter(Boolean));
  const filialAlerta = filiaisSet.size > 1 ? { lista: [...filiaisSet] } : null;

  /* --- mensal --- */
  const meses = [...new Set(rows.map(r => r.mk))].sort();
  const mensal = meses.map(mk => {
    const rs = rows.filter(r => r.mk === mk);
    const receita = sum(rs.map(r => r.tot)), lucro = sum(rs.map(r => r.lucro));
    const cupons = new Set(rs.map(r => r.ped)).size, itens = sum(rs.map(r => r.qtd));
    return { mk, label: mesLabel(mk), receita, lucro, margem: 100 * lucro / receita, cupons, ticket: receita / cupons, itensCupom: itens / cupons };
  });
  const nM = mensal.length;
  const totReceita = sum(mensal.map(m => m.receita)), totLucro = sum(mensal.map(m => m.lucro));
  const totCupons = sum(mensal.map(m => m.cupons));

  /* --- margem ajustada --- */
  const prodRows = rows.filter(r => r.tipo === 'Produto');
  const cz = prodRows.filter(r => !(r.custo > 0));
  const czRec = sum(cz.map(r => r.tot));
  const okRows = rows.filter(r => !(r.tipo === 'Produto' && !(r.custo > 0)));
  const margemAdj = 100 * sum(okRows.map(r => r.lucro)) / sum(okRows.map(r => r.tot));
  const margemRep = 100 * totLucro / totReceita;

  /* --- mix por grupo --- */
  const gAll = {};
  rows.forEach(r => { (gAll[r.grupo] = gAll[r.grupo] || { rec: 0, lucro: 0, qtd: 0 }); gAll[r.grupo].rec += r.tot; gAll[r.grupo].lucro += r.lucro; gAll[r.grupo].qtd += r.qtd; });
  const mixTop = Object.entries(gAll).map(([g, v]) => ({ grupo: g, rec: v.rec, share: 100 * v.rec / totReceita, margem: 100 * v.lucro / v.rec, qtd: v.qtd })).sort((a, b) => b.rec - a.rec);
  const mix9 = mixTop.slice(0, 9);
  const demais = mixTop.slice(9);
  if (demais.length) mix9.push({ grupo: 'DEMAIS', rec: sum(demais.map(x => x.rec)), share: sum(demais.map(x => x.share)), margem: 100 * sum(demais.map(x => x.rec * x.margem / 100)) / Math.max(1, sum(demais.map(x => x.rec))) });
  const GS = ['BANHO E TOSA','PACOTES DE SERVICOS','CONSULTORIO VETERINARIO','SERVICOS DE TRANSPORTE'];
  const servShare = 100 * sum(rows.filter(r => GS.includes(r.grupo)).map(r => r.tot)) / totReceita;

  /* --- mix por grupo, mês a mês (usado no popup ao clicar numa barra do gráfico) --- */
  const gPorMes = {};
  rows.forEach(r => {
    const gm = gPorMes[r.mk] = gPorMes[r.mk] || {};
    (gm[r.grupo] = gm[r.grupo] || { rec: 0, lucro: 0, qtd: 0 });
    gm[r.grupo].rec += r.tot; gm[r.grupo].lucro += r.lucro; gm[r.grupo].qtd += r.qtd;
  });
  const mixPorMes = meses.map(mk => {
    const gm = gPorMes[mk] || {};
    const receitaMes = (mensal.find(m => m.mk === mk) || {}).receita || 0;
    const arr = Object.entries(gm).map(([g, v]) => ({ grupo: g, rec: v.rec, share: receitaMes ? 100 * v.rec / receitaMes : 0, margem: v.rec ? 100 * v.lucro / v.rec : 0 })).sort((a, b) => b.rec - a.rec);
    const top = arr.slice(0, 9), demais = arr.slice(9);
    if (demais.length) top.push({ grupo: 'DEMAIS', rec: sum(demais.map(x => x.rec)), share: sum(demais.map(x => x.share)), margem: 100 * sum(demais.map(x => x.rec * x.margem / 100)) / Math.max(1, sum(demais.map(x => x.rec))) });
    return { mk, label: mesLabel(mk), receita: receitaMes, itens: top };
  });

  /* --- farmácia --- */
  const GF = ['MEDICAMENTOS','ANTIPARASITARIOS'];
  const farmaM = meses.map(mk => sum(rows.filter(r => r.mk === mk && GF.includes(r.grupo)).map(r => r.tot)));
  const farmaRows = rows.filter(r => GF.includes(r.grupo));
  const farmaMg = farmaRows.length ? sum(farmaRows.map(r => r.lucro)) / Math.max(1, sum(farmaRows.map(r => r.tot))) : 0.4;

  /* --- FICHA POR CLIENTE (base de tudo: lista de resgate, B&T, churn) --- */
  const GR = ['RACAO','ALIMENTOS'];
  const d60 = new Date(ref.getTime() - K.JANELA_BT_ATIVO * 864e5);
  const cliMap = {};
  ident.forEach(r => {
    const c = cliMap[r.cli] = cliMap[r.cli] || { cli: r.cli, nome: r.cliNome, tel: '', peds: new Set(), ultima: r.d, primeiro: r.mk, ultimaRac: null, ultimaBT: null, gasto: 0, gastoBT: 0, mks: new Set(), racao: false, bt: false, pacote: false, temProd: false };
    if (r.d > c.ultima) c.ultima = r.d;
    if (r.mk < c.primeiro) c.primeiro = r.mk;
    c.peds.add(r.ped); c.gasto += r.tot; c.mks.add(r.mk);
    if (!c.tel) { const t = (r.cel || r.fone).split('/')[0].trim(); if (t && t !== '-') c.tel = t; }
    if (GR.includes(r.grupo)) { c.racao = true; if (!c.ultimaRac || r.d > c.ultimaRac) c.ultimaRac = r.d; }
    if (r.grupo === 'BANHO E TOSA') { c.bt = true; c.gastoBT += r.tot; if (!c.ultimaBT || r.d > c.ultimaBT) c.ultimaBT = r.d; }
    if (r.grupo === 'PACOTES DE SERVICOS') c.pacote = true;
    if (r.tipo === 'Produto') c.temProd = true;
  });
  const clientes = Object.values(cliMap).map(c => {
    const dias = Math.floor((ref - c.ultima) / 864e5);
    return { cli: c.cli, nome: c.nome, tel: c.tel, ultima: c.ultima, primeiro: c.primeiro, dias, banda: bandaDe(dias).id,
      compras: c.peds.size, gasto: c.gasto, gastoMes: c.gasto / c.mks.size,
      racao: c.racao, bt: c.bt, pacote: c.pacote,
      gastoBTmes: c.gastoBT / c.mks.size, btAtivo: c.ultimaBT ? c.ultimaBT >= d60 : false,
      diasRac: c.ultimaRac ? Math.floor((ref - c.ultimaRac) / 864e5) : null, temProd: c.temProd };
  });
  const cliTot = clientes.length;
  const bucketsGeral = {}; BANDAS.forEach(b => bucketsGeral[b.id] = 0);
  clientes.forEach(c => bucketsGeral[c.banda]++);

  /* --- recorrência de ração (para o gráfico e o plano) --- */
  const cliRacArr = clientes.filter(c => c.racao);
  const buckets = {}; BANDAS.forEach(b => buckets[b.id] = 0);
  cliRacArr.forEach(c => buckets[bandaDe(c.diasRac).id]++);
  const inativosRac = cliRacArr.filter(c => c.diasRac > 60);
  const gastoMensalHist = inativosRac.length ? sum(inativosRac.map(c => c.gastoMes)) / inativosRac.length : 0;
  const datasCli = {};
  ident.filter(r => GR.includes(r.grupo)).forEach(r => { (datasCli[r.cli] = datasCli[r.cli] || new Set()).add(r.d.toDateString()); });
  const gaps = [];
  Object.values(datasCli).forEach(s => { if (s.size >= 3) { const ds = [...s].map(x => +new Date(x)).sort((a, b) => a - b); for (let i = 1; i < ds.length; i++) gaps.push((ds[i] - ds[i - 1]) / 864e5); } });
  const ciclo = Math.round(median(gaps) || 0);
  const lastMk = meses[nM - 1];
  const ativosUlt = new Set(ident.filter(r => r.mk === lastMk).map(r => r.cli)).size;
  const identPct = 100 * sum(ident.map(r => r.tot)) / totReceita;

  /* --- B&T: números reais da loja --- */
  const btRows = rows.filter(r => r.grupo === 'BANHO E TOSA');
  const btM = meses.map(mk => ({ rec: sum(btRows.filter(r => r.mk === mk).map(r => r.tot)), serv: sum(btRows.filter(r => r.mk === mk).map(r => r.qtd)) }));
  const btCli = clientes.filter(c => c.bt).length;
  const spendBT = clientes.filter(c => c.bt).map(c => c.gasto);
  const spendN = clientes.filter(c => !c.bt).map(c => c.gasto);
  const gastoBT = spendBT.length ? sum(spendBT) / spendBT.length : 0;
  const gastoN = spendN.length ? sum(spendN) / spendN.length : 0;
  const crossBT = btCli ? 100 * clientes.filter(c => c.bt && c.temProd).length / btCli : 0;
  const pacRows = rows.filter(r => r.grupo === 'PACOTES DE SERVICOS');
  const valorPacote = pacRows.length ? sum(pacRows.map(r => r.tot)) / Math.max(1, sum(pacRows.map(r => r.qtd))) : (btRows.length ? 4 * sum(btRows.map(r => r.tot)) / Math.max(1, sum(btRows.map(r => r.qtd))) : 0);
  const pacotesMesAtual = pacRows.length ? sum(pacRows.map(r => r.qtd)) / nM : 0;
  /* meta real: clientes com banho avulso nos últimos 60 dias que NÃO têm pacote */
  const avulsos = clientes.filter(c => c.btAtivo && !c.pacote);
  const metaPacotes = avulsos.length;
  const v3 = sum(avulsos.map(c => Math.max(0, valorPacote - c.gastoBTmes)));

  /* --- vendedores --- */
  const vd = {};
  rows.forEach(r => {
    if (!r.vend) return;
    (vd[r.vend] = vd[r.vend] || { rec: 0, lucro: 0, ped: new Set(), n: 0, descN: 0, descRS: 0 });
    const v = vd[r.vend];
    v.rec += r.tot; v.lucro += r.lucro; v.ped.add(r.ped); v.n++;
    if (r.desc > 0) v.descN++;
    v.descRS += Math.max(0, r.pb * r.qtd - r.tot);
  });
  const vend = Object.entries(vd).map(([n, v]) => ({ nome: n, rec: v.rec, cupons: v.ped.size, ticket: v.rec / v.ped.size, margem: 100 * v.lucro / v.rec, descPct: v.n ? 100 * v.descN / v.n : 0, descRS: v.descRS, n: v.n })).filter(v => v.cupons >= 0.1 * totCupons).sort((a, b) => b.rec - a.rec);
  let vazBalcao = 0, balcaoAchado = null, maiorGap = 0;
  vend.forEach(v => {
    const outros = vend.filter(o => o !== v);
    if (!outros.length) return;
    const mOut = 100 * sum(outros.map(o => o.rec * o.margem / 100)) / sum(outros.map(o => o.rec));
    const gap = mOut - v.margem;
    if (gap > 3) {
      vazBalcao += gap / 100 * (v.rec / nM);
      if (gap > maiorGap) {
        maiorGap = gap;
        const nOutros = sum(outros.map(o => o.n));
        const descOutrosPct = nOutros ? 100 * sum(outros.map(o => o.descPct * o.n / 100)) / nOutros : 0;
        balcaoAchado = { vendedor: v.nome, margemVend: v.margem, margemOutros: mOut, descPctVend: v.descPct, descPctOutros: descOutrosPct, gapMargem: gap, gapDesc: v.descPct - descOutrosPct };
      }
    }
  });

  /* --- gate 0 extras --- */
  const descItens = 100 * rows.filter(r => r.desc > 0).length / rows.length;
  const descRS = sum(rows.map(r => Math.max(0, r.pb * r.qtd - r.tot)));
  const negG = {};
  rows.filter(r => r.lucro < 0).forEach(r => negG[r.grupo] = (negG[r.grupo] || 0) + r.lucro);
  const piorGrupoNeg = Object.entries(negG).sort((a, b) => a[1] - b[1])[0] || null;
  const espT = {}; ident.forEach(r => { if (r.esp) espT[r.esp] = (espT[r.esp] || 0) + r.tot; });
  const espSum = sum(Object.values(espT));
  const felinos = espSum ? 100 * (espT['Felina'] || 0) / espSum : 0;
  const czPct = prodRows.length ? 100 * cz.length / prodRows.length : 0;
  const semTel = clientes.filter(c => !c.tel).length;

  /* --- ruptura (abc-produtos) --- */
  let ruptura = null;
  if (abcProd && abcProd.length) {
    const A = abcProd.filter(r => (r['Classe'] || '').trim() === 'A')
      .map(r => ({ desc: r['Descrição'] || r['Descricao'], est: n0(r['Estoque']), vv: n0(r['Valor Vendido']), qv: n0(r['Qtd.Vendida'] || r['Qtd Vendida']) }));
    const zer = A.filter(r => r.est <= 0).sort((a, b) => b.vv - a.vv);
    ruptura = { totalA: A.length, nZer: zer.length, valZer: sum(zer.map(r => r.vv)), nNeg: zer.filter(r => r.est < 0).length, top: zer.slice(0, 8), pctRec: 0 };
    ruptura.pctRec = 100 * ruptura.valZer / totReceita;
  }
  const periodoDias = Math.round((ref - rows[0].d) / 864e5) + 1;
  const estoqueParado = analisaEstoqueParadoNativo(estoqueNativo) || analisaEstoqueParado(abcProd, periodoDias);
  const compras = analisaCompras(entradaRowsArr, abcCompras, estoqueParado);
  const estoqueAtual = analisaEstoqueAtual(estoqueAtualRows, filial);

  /* --- horário e dia de pico (escala de equipe) --- */
  const pedHora = {};
  rows.forEach(r => { if (r.dataPag && !pedHora[r.ped]) pedHora[r.ped] = r.dataPag; });
  const comHorario = Object.values(pedHora);
  const coberturaHorario = 100 * comHorario.length / totCupons;
  let horaSemana = null;
  if (coberturaHorario >= 30) {
    const HORAS = Array.from({ length: 15 }, (_, i) => i + 7); // 7h–21h
    const DIAS_LBL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const horaCount = HORAS.map(h => comHorario.filter(d => d.getHours() === h).length);
    const diaCount = DIAS_LBL.map((_, i) => comHorario.filter(d => (d.getDay() + 6) % 7 === i).length);
    horaSemana = { cobertura: coberturaHorario, horas: HORAS.map(h => h + 'h'), horaCount, dias: DIAS_LBL, diaCount };
  }

  /* --- delivery vs loja --- */
  const dGrp = { SIM: { rec: 0, ped: new Set() }, NAO: { rec: 0, ped: new Set() } };
  rows.forEach(r => { const k = /SIM/i.test(r.delivery) ? 'SIM' : 'NAO'; dGrp[k].rec += r.tot; dGrp[k].ped.add(r.ped); });
  const ticketDeliv = dGrp.SIM.ped.size ? dGrp.SIM.rec / dGrp.SIM.ped.size : 0;
  const ticketLojaD = dGrp.NAO.ped.size ? dGrp.NAO.rec / dGrp.NAO.ped.size : 0;
  const entrega = { receita: dGrp.SIM.rec, peds: dGrp.SIM.ped.size, ticket: ticketDeliv, share: 100 * dGrp.SIM.rec / totReceita, ticketLoja: ticketLojaD, premio: ticketLojaD ? 100 * (ticketDeliv / ticketLojaD - 1) : 0 };

  /* --- novos clientes por mês (qualidade do crescimento) --- */
  const primeiroMesCli = {};
  Object.values(cliMap).forEach(c => { primeiroMesCli[c.cli] = c.primeiro; });
  const novosPorMes = meses.map(mk => ({ mk, label: mesLabel(mk), n: Object.values(primeiroMesCli).filter(p => p === mk).length }));
  const receitaPorMesSplit = meses.map(mk => {
    let rNova = 0, rRec = 0;
    ident.filter(r => r.mk === mk).forEach(r => { if (primeiroMesCli[r.cli] === mk) rNova += r.tot; else rRec += r.tot; });
    return { mk, label: mesLabel(mk), novos: rNova, recorrentes: rRec };
  });

  /* --- churn total (qualquer categoria, não só ração) --- */
  const naoRacaoInativo = clientes.filter(c => !c.racao && c.dias > 60).length;
  const churnGeral = { bucketsGeral, naoRacaoInativo, inativos90: bucketsGeral['90+'], inativos6190: bucketsGeral['61-90'] };

  /* --- governança de dado (campos que existem no One Pet e a loja não preenche) --- */
  const btRowsG = rows.filter(r => r.grupo === 'BANHO E TOSA');
  const vetRowsG = rows.filter(r => r.grupo === 'CONSULTORIO VETERINARIO');
  const canalPct = 100 * rows.filter(r => !VAZIO(r.canal)).length / rows.length;
  const bairroPct = 100 * rows.filter(r => !VAZIO(r.bairro)).length / rows.length;
  const avalPct = btRowsG.length ? 100 * btRowsG.filter(r => !VAZIO(r.aval)).length / btRowsG.length : null;
  const opBTPct = btRowsG.length ? 100 * btRowsG.filter(r => !VAZIO(r.opBT)).length / btRowsG.length : null;
  const vetPct = vetRowsG.length ? 100 * vetRowsG.filter(r => !VAZIO(r.vetNome)).length / vetRowsG.length : null;
  const nomesVend = new Set(rows.map(r => r.vend.toUpperCase()).filter(Boolean));
  const nomesVet = new Set(vetRowsG.map(r => r.vetNome.toUpperCase().trim()).filter(x => x && !VAZIO(x)));
  let vetSuspeito = false;
  if (nomesVet.size) { let inter = 0; nomesVet.forEach(n => { if (nomesVend.has(n)) inter++; }); vetSuspeito = inter / nomesVet.size > 0.5; }
  const governanca = { canalPct, bairroPct, avalPct, opBTPct, vetPct, vetSuspeito, temVet: vetRowsG.length > 0 };

  /* --- vazamentos (todos automáticos) --- */
  const peakF = Math.max(...farmaM), lastF = farmaM[farmaM.length - 1];
  const v1 = Math.max(0, (peakF - lastF)) * (farmaMg || 0.4);
  const v2 = inativosRac.length * gastoMensalHist * K.RESGATE * (margemAdj / 100);
  const v4 = vazBalcao;
  const vazTotal = v1 + v2 + v3 + v4;
  const lucroMes = totLucro / nM;

  /* --- score --- */
  const g1 = mensal[0], gN = mensal[nM - 1];
  const growR = nM > 1 ? 100 * (gN.receita / g1.receita - 1) : 0;
  const growC = nM > 1 ? 100 * (gN.cupons / g1.cupons - 1) : 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sReceita = clamp(5 + growR / 3 + growC / 8, 0, 10);
  const sMargem = clamp((margemAdj - 20) / 3.2, 0, 10);
  const sMix = clamp(servShare / 3.3, 0, 10);
  const ret45 = cliRacArr.length ? 100 * (buckets['0-30'] + buckets['31-45']) / cliRacArr.length : 0;
  const sRet = clamp(ret45 / 10, 0, 10);
  const sDado = clamp(10 - czPct * 0.2 - (100 - identPct) * 0.3 - (ruptura && ruptura.nNeg ? 0.5 : 0), 0, 10);
  const score = Math.round(2.5 * sReceita + 2.0 * sMargem + 1.5 * sMix + 2.5 * sRet + 1.5 * sDado);

  /* --- metas / previsão (100% derivadas do histórico da própria loja) --- */
  const tendencia = (serie) => {
    const dl = [];
    for (let i = 1; i < serie.length; i++) if (serie[i - 1] > 0) dl.push(serie[i] / serie[i - 1] - 1);
    return clamp(dl.length ? median(dl) : 0, -0.05, 0.10); // limitado a -5%/+10% ao mês p/ não extrapolar com poucos meses de dado
  };
  const last3 = mensal.slice(-Math.min(3, nM));
  const baseReceita = sum(last3.map(m => m.receita)) / last3.length;
  const baseLucro = sum(last3.map(m => m.lucro)) / last3.length;
  const trendReceita = tendencia(mensal.map(m => m.receita));
  const trendLucro = tendencia(mensal.map(m => m.lucro));
  const baseCupons = sum(last3.map(m => m.cupons)) / last3.length;
  const trendCupons = tendencia(mensal.map(m => m.cupons));
  const metas = {
    baseReceita, baseLucro, trendReceita, trendLucro,
    receita: {
      piso: baseReceita,
      meta: baseReceita * (1 + Math.max(0, trendReceita)) + 0.5 * vazTotal / (margemAdj / 100),
      ouro: baseReceita * (1 + Math.max(0, trendReceita)) + vazTotal / (margemAdj / 100)
    },
    lucro: {
      piso: baseLucro,
      meta: baseLucro * (1 + Math.max(0, trendLucro)) + 0.5 * vazTotal,
      ouro: baseLucro * (1 + Math.max(0, trendLucro)) + vazTotal
    },
    cupons: { piso: baseCupons, meta: baseCupons * (1 + Math.max(0, trendCupons)) },
    resgateAlvo: Math.round(inativosRac.length * K.RESGATE),
    btAlvo30: Math.ceil(metaPacotes / 3), btAlvoTotal: metaPacotes,
    farmaAlvo: peakF, atualReceita: gN.receita, atualLucro: gN.lucro
  };

  /* --- tarefas (geradas a partir dos alertas do próprio diagnóstico) --- */
  const tarefas = [];
  const identSev = identPct < 30 ? 'alta' : identPct <= 60 ? 'media' : identPct <= 80 ? 'baixa' : null;
  if (filialAlerta) tarefas.push({ sev: 'alta', chave: 'filialMista', dados: { lista: filialAlerta.lista } });
  if (identSev) tarefas.push({ sev: identSev, chave: 'identificacao', dados: { identPct } });
  if (ruptura && ruptura.nZer > 0) tarefas.push({ sev: 'alta', chave: 'ruptura', dados: { n: ruptura.nZer, valor: ruptura.valZer } });
  if (v1 > 200) tarefas.push({ sev: 'media', chave: 'farmacia', dados: { peak: peakF, last: lastF } });
  if (v2 > 200) tarefas.push({ sev: 'media', chave: 'churn', dados: { n: inativosRac.length, resgateAlvo: Math.round(inativosRac.length * K.RESGATE) } });
  if (v3 > 200) tarefas.push({ sev: 'baixa', chave: 'bt', dados: { n: metaPacotes, valorPacote } });
  if (v4 > 200) tarefas.push({ sev: 'baixa', chave: 'balcao', dados: balcaoAchado || {} });
  if (estoqueParado && estoqueParado.totalParadoValor > 0.03 * totReceita) tarefas.push({ sev: 'media', chave: 'estoqueParado', dados: { n: estoqueParado.nCritico + estoqueParado.nMuitoLento, valor: estoqueParado.totalParadoValor } });
  if (governanca.canalPct < 20) tarefas.push({ sev: 'media', chave: 'canal', dados: { pct: governanca.canalPct } });
  if (governanca.bairroPct < 50) tarefas.push({ sev: 'baixa', chave: 'bairro', dados: { pct: governanca.bairroPct } });
  if (governanca.avalPct !== null && governanca.avalPct < 10) tarefas.push({ sev: 'baixa', chave: 'avaliacao', dados: { pct: governanca.avalPct } });
  if (governanca.opBTPct !== null && governanca.opBTPct < 20) tarefas.push({ sev: 'baixa', chave: 'opBT', dados: { pct: governanca.opBTPct } });
  if (governanca.temVet && governanca.vetSuspeito) tarefas.push({ sev: 'baixa', chave: 'vet', dados: {} });
  if (compras && compras.recompraParado.length) tarefas.push({ sev: 'media', chave: 'recompraParado', dados: { n: compras.recompraParado.length, itens: compras.recompraParado } });
  if (compras && compras.custoSubindo.length) tarefas.push({ sev: 'baixa', chave: 'custoSubindo', dados: { n: compras.custoSubindo.length, pior: compras.custoSubindo[0] } });
  if (estoqueAtual && estoqueAtual.nAbaixoCusto > 0) tarefas.push({ sev: 'alta', chave: 'precoAbaixoCusto', dados: { n: estoqueAtual.nAbaixoCusto, valor: estoqueAtual.valorAbaixoCusto, pior: estoqueAtual.topAbaixoCusto[0] } });
  if (estoqueAtual && estoqueAtual.filialDivergente) tarefas.push({ sev: 'alta', chave: 'filialEstoqueDivergente', dados: { filialArquivo: estoqueAtual.filialArquivo } });
  if (felinos > 0 && felinos < 8) tarefas.push({ sev: 'baixa', chave: 'felinos', dados: { pct: felinos } });
  if (estoqueParado && estoqueParado.granelTotal > 0 && estoqueParado.granelNeg / estoqueParado.granelTotal > 0.3) tarefas.push({ sev: 'baixa', chave: 'granel', dados: { n: estoqueParado.granelNeg, total: estoqueParado.granelTotal } });
  const ordemSev = { alta: 0, media: 1, baixa: 2 };
  tarefas.sort((a, b) => ordemSev[a.sev] - ordemSev[b.sev]);

  return {
    filial, filialAlerta, ref, nM, meses, mensal, totReceita, totLucro, totCupons, lucroMes,
    margemRep, margemAdj, czPct, czRec, mix9, mixPorMes, servShare, farmaM, farmaMg, peakF, lastF,
    clientes, bucketsGeral, cliTot, ativosUlt, identPct, semTel,
    buckets, cliRac: cliRacArr.length, inativos: inativosRac.length, gastoMensalHist, ciclo,
    btM, btCli, crossBT, gastoBT, gastoN, valorPacote, pacotesMesAtual, metaPacotes,
    vend, descItens, descRS, piorGrupoNeg, felinos, ruptura, estoqueParado, metas, balcaoAchado, compras, estoqueAtual,
    horaSemana, entrega, novosPorMes, receitaPorMesSplit, churnGeral, governanca, tarefas,
    v1, v2, v3, v4, vazTotal, K,
    score, sub: { receita: sReceita, margem: sMargem, mix: sMix, ret: sRet, dado: sDado }
  };
}


function analyze(biRowsArr, abcProd, estoqueNativo, entradaRowsArr, abcCompras, estoqueAtualRows) {
  return analisar(linhasDoBI(biRowsArr), abcProd, estoqueNativo, entradaRowsArr, abcCompras, estoqueAtualRows);
}

/* exportacao dupla: Node (testes) e ESM/Deno (Edge Function) */
const MOTOR = { parseCSV, num, n0, pDate, pDataHora, mesKey, mesLabel, median, sum, K, BANDAS, bandaDe, VAZIO, nivelPct,
  detectType, analisaEstoqueParado, analisaEstoqueParadoNativo, analisaCompras, analisaEstoqueAtual, linhasDoBI, analisar, analyze };
if (typeof module !== 'undefined' && module.exports) module.exports = MOTOR;
if (typeof globalThis !== 'undefined') globalThis.MOTOR = MOTOR;
