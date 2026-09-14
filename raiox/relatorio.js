/* ============================================================
   RAIO-X POP — relatório completo alimentado pelo banco da Central
   Página: raiox/relatorio.html?fra=57  (aberta dentro da aba Loja)
   Usa o renderizador original da Máquina de Análise de Lojas
   (buildReportHTML, gráficos SVG, lista de resgate, tarefas) e
   acrescenta: evolução mês a mês, comparativo com o início da
   consultoria, andamento do plano de 90 dias e exportações.
   ============================================================ */
(async function () {
  'use strict';
  const URL_ = 'https://klcxavgxonpsbsbzqcil.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsY3hhdmd4b25wc2JzYnpxY2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzQwMDAsImV4cCI6MjA5OTExMDAwMH0.UJK09SljKG0tJqDcGYQfuk41i1SN8GymL1hTTeE2ruY';
  const $ = id => document.getElementById(id);
  const rx = window.__rx;                      // ponte para o app original (initResgate, initTarefas, state…)
  const rep = $('report');
  const aviso = (msg, cls) => { rep.innerHTML = `<div class="wrap" style="padding:40px 20px"><div class="alerta-filial" style="${cls === 'ok' ? 'background:#00573F' : ''}">${msg}</div></div>`; avisarPai(); };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesBR = ym => ym ? MESES[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4) : '—';
  const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
  /* linha com eixo em qualquer unidade (a svgLinha original só sabe R$ em "k") */
  function svgSerie(labels, valsIn, cor, fmt) {
    const vals = valsIn.map(v => (v == null || !isFinite(v)) ? 0 : v);
    const W = 720, H = 200, L = 46, Rr = 14, T = 14, B = 30, iw = W - L - Rr, ih = H - T - B;
    const mxRaw = Math.max(...vals, 1), mx = fmt === 'int' && mxRaw <= 100 ? 100 : mxRaw * 1.15, gap = iw / labels.length;
    const pts = vals.map((v, i) => [L + i * gap + gap / 2, T + ih - v / mx * ih]);
    const id = __regChart({ type: 'line', labels, vals, fmt, L, T, ih, gap, bw: gap, mn: 0, mx });
    const rot = v => fmt === 'pct' ? br(v, 0) + '%' : fmt === 'int' ? br(v, 0) : v >= 1000 ? br(v / 1000, 0) + 'k' : br(v, 0);
    let s = `<div class="chart-wrap" id="wrap-${id}"><svg id="${id}" viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto">`;
    ejeY(0, mx, 4).forEach(v => { const y = T + ih - v / mx * ih; s += `<line x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}" stroke="#E8F0EB"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#4A6157">${rot(v)}</text>`; });
    s += `<path d="M${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')} L${(L + iw - gap / 2).toFixed(1)},${T + ih} L${(L + gap / 2).toFixed(1)},${T + ih} Z" fill="${cor}" opacity=".12"/>`;
    s += `<path d="M${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')}" fill="none" stroke="${cor}" stroke-width="2.5"/>`;
    pts.forEach((p, i) => s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="${cor}"/><text x="${p[0]}" y="${p[1] - 8}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${cor}">${rot(vals[i])}</text>`);
    labels.forEach((l, i) => s += `<text x="${L + i * gap + gap / 2}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="#4A6157">${esc(l)}</text>`);
    s += `<line id="hl-${id}" class="hl-line" x1="0" x2="0" y1="${T}" y2="${T + ih}"/><circle id="pt-${id}" class="hl-pt" r="5" cx="0" cy="0"/>`;
    return s + '</svg></div>';
  }
  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);

  /* ---- avisa a página-mãe (aba Loja) da altura, para o iframe crescer sem barra dupla ---- */
  function avisarPai() {
    if (window.parent === window) return;
    const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.parent.postMessage({ raiox: 'altura', altura: h, fra: FRA }, location.protocol === 'file:' ? '*' : location.origin);
  }
  const FRA = parseInt(new URLSearchParams(location.search).get('fra'), 10);
  if (!Number.isInteger(FRA)) return aviso('Informe a loja: relatorio.html?fra=57');

  const sb = window.supabase.createClient(URL_, ANON);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return aviso('Sessão expirada — entre de novo na Central POP para ver este relatório.');

  /* ---------- carga: só o que este relatório precisa ---------- */
  const [atualQ, histQ, consQ, frqQ, estQ] = await Promise.all([
    sb.from('raiox_snapshots_atual').select('*').eq('fra', FRA).maybeSingle(),
    sb.from('raiox_snapshots').select('fra,mes_ref,calculado_em,score,sem_nota_motivo,sub,kpis').eq('fra', FRA).order('mes_ref'),
    sb.from('raiox_consultorias').select('*').eq('fra', FRA).order('criado_em', { ascending: false }),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor').eq('fra', FRA).maybeSingle(),
    sb.from('raiox_estoque').select('id,fra,tipo,arquivo,enviado_em,resumo').eq('fra', FRA).order('enviado_em', { ascending: false })
  ]);
  const S = atualQ.data;
  if (!S) return aviso('Esta loja ainda não tem raio-x calculado. Depois da carga do BI de vendas, a rotina noturna calcula sozinha.');
  const [fullQ, resgQ] = await Promise.all([
    sb.from('raiox_snapshots').select('dados,tarefas').eq('fra', FRA).eq('mes_ref', S.mes_ref).single(),
    sb.from('raiox_resgate').select('cliente_cod,nome,telefone,dias,banda,compras,gasto,gasto_mes,racao,bt,ultima').eq('fra', FRA).eq('mes_ref', S.mes_ref).order('gasto_mes', { ascending: false })
  ]);
  if (fullQ.error) return aviso('Não consegui ler o diagnóstico: ' + fullQ.error.message);
  const F = frqQ.data || { fra: FRA, nome: 'FRA ' + FRA };
  const CONS = consQ.data || [], HIST = (histQ.data || []).slice().sort((a, b) => a.mes_ref.localeCompare(b.mes_ref)), EST = {};
  (estQ.data || []).forEach(e => { if (!EST[e.tipo]) EST[e.tipo] = e; });

  /* ---------- reconstrói o objeto R que o renderizador original espera ---------- */
  const R = fullQ.data.dados;
  R.K = K;
  R.tarefas = fullQ.data.tarefas || R.tarefas || [];
  const reviver = o => { if (o && typeof o === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o)) return new Date(o); return o; };
  R.ref = reviver(R.ref);
  if (R.compras) {
    R.compras.periodoIni = reviver(R.compras.periodoIni); R.compras.periodoFim = reviver(R.compras.periodoFim);
    (R.compras.recompraParado || []).forEach(i => { i.dataCompra = reviver(i.dataCompra); });
    (R.compras.custoSubindo || []).forEach(i => { i.dataIni = reviver(i.dataIni); i.dataFim = reviver(i.dataFim); });
  }
  // lista de resgate: o banco guarda os 300 inativos de maior valor (código, nome, telefone)
  R.clientes = (resgQ.data || []).map(c => ({
    cli: c.cliente_cod, nome: c.nome || ('Cód. ' + c.cliente_cod), tel: c.telefone || '', ultima: c.ultima ? new Date(c.ultima + 'T12:00:00') : R.ref,
    dias: c.dias, banda: c.banda, compras: c.compras, gasto: +c.gasto || 0, gastoMes: +c.gasto_mes || 0, racao: !!c.racao, bt: !!c.bt, pacote: false
  }));
  // arquivos de estoque enviados na aba "Arquivos de estoque" entram como se tivessem sido anexados
  const estPar = EST.estoqueparado && EST.estoqueparado.resumo, estAbc = EST.abcprod && EST.abcprod.resumo, estAtu = EST.estoqueatual && EST.estoqueatual.resumo;
  if (estPar && estPar.fonte) R.estoqueParado = estPar;
  if (estAbc) {
    if (estAbc.ruptura) R.ruptura = estAbc.ruptura;
    else if (estAbc.top) R.ruptura = { totalA: estAbc.totalA, nZer: estAbc.nZer, valZer: estAbc.valZer, nNeg: estAbc.nNeg, top: (estAbc.top || []).slice(0, 8), pctRec: R.totReceita ? 100 * estAbc.valZer / R.totReceita : 0 };
    if (R.ruptura && R.ruptura.pctRec == null) R.ruptura.pctRec = R.totReceita ? 100 * R.ruptura.valZer / R.totReceita : 0;
    if (!R.estoqueParado && estAbc.parado && estAbc.parado.fonte) R.estoqueParado = estAbc.parado;
  }
  if (estAtu && estAtu.porCategoria) R.estoqueAtual = estAtu;
  // tarefas que só existem com arquivo de estoque (mesma regra do motor original)
  const tem = ch => R.tarefas.some(t => t.chave === ch);
  if (R.ruptura && R.ruptura.nZer > 0 && !tem('ruptura')) R.tarefas.push({ sev: 'alta', chave: 'ruptura', dados: { n: R.ruptura.nZer, valor: R.ruptura.valZer } });
  if (R.estoqueParado && R.estoqueParado.totalParadoValor > 0.03 * R.totReceita && !tem('estoqueParado')) R.tarefas.push({ sev: 'media', chave: 'estoqueParado', dados: { n: R.estoqueParado.nCritico + R.estoqueParado.nMuitoLento, valor: R.estoqueParado.totalParadoValor } });
  if (R.estoqueAtual && R.estoqueAtual.nAbaixoCusto > 0 && !tem('precoAbaixoCusto')) R.tarefas.push({ sev: 'alta', chave: 'precoAbaixoCusto', dados: { n: R.estoqueAtual.nAbaixoCusto, valor: R.estoqueAtual.valorAbaixoCusto, pior: R.estoqueAtual.topAbaixoCusto[0] } });
  if (R.estoqueAtual && R.estoqueAtual.filialDivergente && !tem('filialEstoqueDivergente')) R.tarefas.push({ sev: 'alta', chave: 'filialEstoqueDivergente', dados: { filialArquivo: R.estoqueAtual.filialArquivo } });
  if (R.estoqueParado && R.estoqueParado.granelTotal > 0 && R.estoqueParado.granelNeg / R.estoqueParado.granelTotal > 0.3 && !tem('granel')) R.tarefas.push({ sev: 'baixa', chave: 'granel', dados: { n: R.estoqueParado.granelNeg, total: R.estoqueParado.granelTotal } });
  const ordemSev = { alta: 0, media: 1, baixa: 2 };
  R.tarefas.sort((a, b) => ordemSev[a.sev] - ordemSev[b.sev]);
  TASK_TEXT.custoZero = d => ({ titulo: 'Cadastrar custo nos produtos sem custo', desc: `${pc(d.pct)} da receita de produto (${kmil(d.valor)}) está sem custo cadastrado no One Pet — a margem reportada fica inflada e, acima de 20%, a loja fica sem nota. Cadastrar o custo nos itens (a maior parte costuma ser granel/balança) antes do próximo fechamento.` });
  R.tarefas = R.tarefas.filter(t => TASK_TEXT[t.chave]);
  // nota oficial (com trava de custo sem cadastro) prevalece sobre a nota crua do motor
  const scoreOficial = S.score;
  if (scoreOficial == null) R.score = R.score; else R.score = scoreOficial;

  /* ---------- renderiza com o motor visual original ---------- */
  const lojaLabel = (F.nome || ('FRA ' + FRA)) + ' · FRA ' + FRA;
  window.__diagR = R; rx.state.R = R; rx.state.lojaLabel = lojaLabel;
  rep.innerHTML = buildReportHTML(R, { lojaLabel });
  rx.initResgate(R); initChartHovers(); rx.initTarefas();
  $('toolbar').style.display = 'block';
  $('tbTitulo').textContent = 'Raio-X · ' + lojaLabel + ' · ' + (S.score == null ? 'sem nota' : 'Score ' + S.score + '/100');
  document.title = 'Raio-X · ' + lojaLabel;

  // avisos do banco (trava de nota, dado defasado, custo sem cadastro) no topo do relatório
  const avisos = [];
  if (S.sem_nota_motivo) avisos.push('<b>Sem nota:</b> ' + esc(S.sem_nota_motivo) + ' A nota crua do motor (' + br(fullQ.data.dados.score, 0) + ') aparece no cartão só como referência.');
  if (S.kpis.mes_parcial) avisos.push('<b>Carga parcial:</b> ' + mesBR(S.kpis.mes_parcial.mes) + ' entrou no banco com só ' + br(S.kpis.mes_parcial.cupons) + ' vendas (a loja faz ~' + br(S.kpis.mes_parcial.esperado) + ' por mês). Para não derrubar a nota de crescimento, a janela fechou em ' + mesBR(S.mes_ref) + '. Reenvie o BI de ' + mesBR(S.kpis.mes_parcial.mes) + ' completo no painel de Inteligência Comercial, com a recarga marcada, e peça o recálculo.');
  if ((S.kpis.defasagem_meses || 0) >= 2) avisos.push('<b>Dado defasado:</b> a última venda carregada é de ' + mesBR(S.mes_ref) + '. Carregue o BI mais recente no painel de Inteligência Comercial antes de usar estes números.');
  const cz = S.tarefas && S.tarefas.find(t => t.chave === 'custoZero');
  if (cz) avisos.push('<b>Custo sem cadastro:</b> ' + pc(cz.dados.pct) + ' da receita de produto (' + kmil(cz.dados.valor) + ') está sem custo no One Pet — a margem reportada está inflada; a máquina usa a margem ajustada.');
  if (avisos.length) rep.insertAdjacentHTML('afterbegin', '<div class="wrap" style="padding-top:16px">' + avisos.map(a => `<div class="alerta-filial" style="margin:0 0 8px;background:#8A5A00">${a}</div>`).join('') + '</div>');
  const fonte = rep.querySelector('.hero .sub.num');
  if (fonte) fonte.innerHTML = `Fonte: banco de compras da Rede POP (BI One Pet carregado no painel de Inteligência Comercial) · ${mesBR(S.kpis.mes_ini)} a ${mesBR(S.mes_ref)} · ${br(R.nM)} meses fechados · ${br(R.totCupons)} vendas · calculado em ${new Date(S.calculado_em).toLocaleDateString('pt-BR')}.`;

  /* ---------- EVOLUÇÃO mês a mês + consultoria ---------- */
  rep.insertAdjacentHTML('beforeend', buildEvolucaoHTML());
  initChartHovers();   // registra também os gráficos novos
  await buildConsultoriaHTML();
  buildTarefasTab();
  montarAbas();
  ligarExportacoes();
  ajustarModais();
  avisarPai(); new ResizeObserver(avisarPai).observe(document.body);
  window.addEventListener('message', ev => { if (ev.origin !== location.origin || !ev.data) return; if (ev.data.raiox === 'ir') { const el = document.getElementById(ev.data.alvo); if (el) el.scrollIntoView({ behavior: 'smooth' }); } });

  /* ===== evolução: uma linha por snapshot mensal (janela móvel de 12 meses) ===== */
  function buildEvolucaoHTML() {
    const hs = HIST.filter(h => h.kpis);
    const labels = hs.map(h => mesBR(h.mes_ref));
    const base = CONS.find(c => c.status === 'ativa') || CONS[0];
    let corpo;
    if (hs.length < 2) {
      corpo = `<div class="card"><div class="callout"><b>Ainda só há ${hs.length} leitura mensal desta loja.</b> A curva de evolução nasce a partir do segundo mês: a rotina noturna guarda um instantâneo a cada fechamento de mês (o admin pode pedir o histórico dos meses anteriores pela rotina, opção <i>backfill</i>).</div>
        ${desenhaMensal()}</div>`;
    } else {
      const scores = hs.map(h => h.score == null ? null : h.score);
      const scoresOk = scores.map((s, i) => s == null ? (i ? scores[i - 1] || 0 : 0) : s);
      const rec = hs.map(h => h.kpis.receita_mes || 0), mg = hs.map(h => h.kpis.margem_adj || 0), vaz = hs.map(h => h.kpis.vaz_total || 0), ret = hs.map(h => h.kpis.ret45 || 0), ident = hs.map(h => h.kpis.ident_pct || 0);
      const primeiro = hs[0], ultimo = hs[hs.length - 1];
      const d = (a, b, fmt, hb) => deltaBadge(a, b, fmt, hb);
      corpo = `<div class="kpi-grid num" style="margin-bottom:16px">
        <div class="kpi"><div class="lab">Score · ${labels[0]} → ${labels[labels.length - 1]}</div><div class="val">${primeiro.score ?? '—'} → ${ultimo.score ?? '—'}</div><div class="delta">${d(primeiro.score, ultimo.score, v => br(v, 0), true)}</div></div>
        <div class="kpi"><div class="lab">Receita/mês (média 12m)</div><div class="val">${kmil(ultimo.kpis.receita_mes)}</div><div class="delta">${d(primeiro.kpis.receita_mes, ultimo.kpis.receita_mes, kmil, true)}</div></div>
        <div class="kpi"><div class="lab">Margem ajustada</div><div class="val">${pc(ultimo.kpis.margem_adj)}</div><div class="delta">${d(primeiro.kpis.margem_adj, ultimo.kpis.margem_adj, v => pc(v), true)}</div></div>
        <div class="kpi"><div class="lab">Vazamento/mês</div><div class="val">${kmil(ultimo.kpis.vaz_total)}</div><div class="delta">${d(primeiro.kpis.vaz_total, ultimo.kpis.vaz_total, kmil, false)}</div></div>
        <div class="kpi"><div class="lab">Ração em dia (≤45 d)</div><div class="val">${pc(ultimo.kpis.ret45, 0)}</div><div class="delta">${d(primeiro.kpis.ret45, ultimo.kpis.ret45, v => pc(v, 0), true)}</div></div>
        <div class="kpi"><div class="lab">Receita identificada</div><div class="val">${pc(ultimo.kpis.ident_pct, 0)}</div><div class="delta">${d(primeiro.kpis.ident_pct, ultimo.kpis.ident_pct, v => pc(v, 0), true)}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>Score de lucratividade</h3><div class="note">Uma leitura por mês fechado · janela móvel de 12 meses${base ? ' · consultoria iniciada em ' + dBR(base.inicio) + ' (nota ' + (base.score_inicial ?? '—') + ')' : ''}</div>${svgSerie(labels, scoresOk, '#00573F', 'int')}<div class="chart-hint">passe o mouse para ver o valor</div></div>
        <div class="card"><h3>Receita média/mês (janela de 12 meses)</h3><div class="note">Média mensal da janela que fecha em cada leitura</div>${svgSerie(labels, rec, '#009150', 'money')}</div>
        <div class="card"><h3>Margem bruta ajustada</h3><div class="note">Já descontadas as linhas sem custo cadastrado</div>${svgSerie(labels, mg, '#FDAE25', 'pct')}</div>
        <div class="card"><h3>Vazamento recuperável (R$/mês)</h3><div class="note">Quanto menor, melhor — soma de farmácia, churn de ração, B&amp;T sem pacote e balcão</div>${svgSerie(labels, vaz, '#C0392B', 'money')}</div>
        <div class="card"><h3>Clientes de ração em dia (≤45 dias)</h3><div class="note">Retenção da carteira de ração</div>${svgSerie(labels, ret, '#009150', 'pct')}</div>
        <div class="card"><h3>Receita com cliente identificado</h3><div class="note">Qualidade do cadastro no caixa</div>${svgSerie(labels, ident, '#71C5E8', 'pct')}</div>
      </div>
      <div class="card" style="margin-top:16px"><h3>Leituras mensais</h3><div class="note">Cada linha é o raio-x fechado naquele mês; a mais recente é a que alimenta o relatório acima</div>
        <div class="tbl-scroll"><table class="num"><thead><tr><th>Mês</th><th class="num">Score</th><th class="num">Receita/mês</th><th class="num">Lucro/mês</th><th class="num">Margem</th><th class="num">Ticket</th><th class="num">Ativos</th><th class="num">Identif.</th><th class="num">Vazamento</th><th class="num">Tarefas graves</th><th>Calculado</th></tr></thead><tbody>
        ${hs.slice().reverse().map(h => `<tr><td><b>${mesBR(h.mes_ref)}</b></td><td class="num">${h.score == null ? '<span class="badge-zero">sem nota</span>' : '<b>' + h.score + '</b>'}</td><td class="num">${kmil(h.kpis.receita_mes)}</td><td class="num">${kmil(h.kpis.lucro_mes)}</td><td class="num">${pc(h.kpis.margem_adj)}</td><td class="num">${money(h.kpis.ticket)}</td><td class="num">${br(h.kpis.ativos_ult)}</td><td class="num">${pc(h.kpis.ident_pct, 0)}</td><td class="num">${kmil(h.kpis.vaz_total)}</td><td class="num">${br(h.kpis.tarefas_alta || 0)}</td><td>${dBR(h.calculado_em)}</td></tr>`).join('')}
        </tbody></table></div></div>
      ${desenhaMensal()}`;
    }
    return `<section id="evolucao"><div class="wrap">
      <div class="sec-head"><h2>Evolução da loja</h2><span class="hint">Como os indicadores caminham mês a mês — é aqui que se enxerga se a consultoria está pegando</span></div>
      ${corpo}</div></section>`;
  }
  /* série mensal real (12 meses da janela) com a marca do início da consultoria */
  function desenhaMensal() {
    const base = CONS.find(c => c.status === 'ativa') || CONS[0];
    const m = R.mensal || []; if (!m.length) return '';
    const labels = m.map(x => x.label), rec = m.map(x => x.receita), luc = m.map(x => x.lucro);
    const mkIni = base ? base.inicio.slice(0, 7) : null;
    const marca = mkIni ? m.findIndex(x => x.mk === mkIni) : -1;
    return `<div class="card" style="margin-top:16px"><h3>Receita e lucro bruto, mês a mês (12 meses da janela)</h3><div class="note">${marca >= 0 ? 'Barras a partir de <b>' + labels[marca] + '</b> são os meses de consultoria' : base ? 'Consultoria iniciada em ' + dBR(base.inicio) + ' — fora da janela atual' : 'Sem consultoria nesta loja'}</div>
      ${svgBarra(labels, rec, '#A8D3C4', '#00573F')}${svgBarra(labels, luc, '#00573F', '#00573F')}
      <div class="chart-hint">acima: receita · abaixo: lucro bruto</div>${marca >= 0 ? `<div class="callout num"><b>Antes × depois da consultoria:</b> receita média ${kmil(media(rec.slice(0, marca)))}/mês nos ${marca} meses anteriores contra ${kmil(media(rec.slice(marca)))}/mês nos ${m.length - marca} meses desde o início · lucro bruto ${kmil(media(luc.slice(0, marca)))} → ${kmil(media(luc.slice(marca)))}.</div>` : ''}</div>`;
  }

  /* ===== consultoria: comparativo com o início + andamento do plano ===== */
  async function buildConsultoriaHTML() {
    const c = CONS.find(x => x.status === 'ativa') || CONS[0];
    if (!c) return;
    const [itensQ, perfQ, baseQ] = await Promise.all([
      sb.from('agenda_eventos').select('id,titulo,tipo,data,ini,prazo,concluida,concluida_em,user_id').eq('consultoria_id', c.id).order('data'),
      sb.from('perfis').select('id,nome').in('id', [c.consultor_id, c.franqueado_id].filter(Boolean)),
      c.mes_ref_base ? sb.from('raiox_snapshots').select('fra,mes_ref,calculado_em,score,sub,kpis,dados->metas,dados->governanca,dados->churnGeral,tarefas').eq('fra', FRA).eq('mes_ref', c.mes_ref_base).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const itens = itensQ.data || [], nomes = {}; (perfQ.data || []).forEach(p => { nomes[p.id] = p.nome; });
    const tarefas = itens.filter(i => i.tipo === 'tarefa'), reunioes = itens.filter(i => i.tipo !== 'tarefa');
    const tConcl = tarefas.filter(t => t.concluida), tAtras = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < hojeISO), tProx = tarefas.filter(t => !t.concluida && (!t.prazo || t.prazo >= hojeISO));
    const rPass = reunioes.filter(r => r.data < hojeISO), rFeitas = rPass.filter(r => r.concluida), rPend = rPass.filter(r => !r.concluida), rProx = reunioes.filter(r => r.data >= hojeISO);
    const total = Math.max(1, diasEntre(c.inicio, c.fim_previsto || c.inicio)), decorrido = Math.max(0, Math.min(total, diasEntre(c.inicio, hojeISO)));
    const pctTempo = 100 * decorrido / total, pctTarefas = tarefas.length ? 100 * tConcl.length / tarefas.length : 0;
    const ritmo = pctTarefas >= pctTempo - 10 ? { l: 'No ritmo', c: '#009150' } : pctTarefas >= pctTempo - 30 ? { l: 'Atrasando', c: '#E67E22' } : { l: 'Travada', c: '#C0392B' };
    const gargalos = [];
    if (tAtras.length) gargalos.push(`<b>${br(tAtras.length)} tarefa(s) vencida(s)</b>: ${tAtras.slice(0, 4).map(t => esc(t.titulo) + ' (' + dBR(t.prazo) + ')').join(' · ')}${tAtras.length > 4 ? ' …' : ''}`);
    if (rPend.length) gargalos.push(`<b>${br(rPend.length)} reunião(ões) passada(s) sem marcação de realizada</b>: ${rPend.slice(0, 3).map(r => esc(r.titulo) + ' (' + dBR(r.data) + ')').join(' · ')} — se aconteceram, marque como concluídas na agenda; se não, reagende.`);
    const dScore = (S.score != null && c.score_inicial != null) ? S.score - c.score_inicial : null;
    if (dScore != null && decorrido >= 45 && dScore <= 0) gargalos.push(`<b>Nota não subiu</b> depois de ${br(decorrido)} dias (${c.score_inicial} → ${S.score}). Revise se as tarefas concluídas atacam os achados de maior peso (identificação de cliente e margem pesam mais na nota).`);
    if (S.mes_ref === c.mes_ref_base && decorrido >= 40) gargalos.push(`<b>O raio-x ainda é o mesmo do início</b> (${mesBR(S.mes_ref)}): carregar o BI do mês seguinte no painel de Inteligência Comercial para a evolução aparecer.`);
    if (!gargalos.length) gargalos.push('<b>Nenhum gargalo identificado</b> — plano dentro do prazo e reuniões em dia.');

    let cmp = '';
    const B = baseQ.data;
    if (B && B.mes_ref !== S.mes_ref) {
      const snapDe = (row, dados) => ({
        loja: lojaLabel, geradoEm: row.calculado_em, score: row.score ?? 0, sub: row.sub,
        periodo: { inicio: mesBR(row.kpis.mes_ini), fim: mesBR(row.mes_ref), nMeses: row.kpis.meses },
        kpis: { receitaMes: row.kpis.receita_mes, lucroMes: row.kpis.lucro_mes, margemRep: row.kpis.margem_rep, margemAdj: row.kpis.margem_adj, ticketMedio: row.kpis.ticket, cuponsMes: row.kpis.cupons_mes, ativosUlt: row.kpis.ativos_ult, identPct: row.kpis.ident_pct },
        vazamentos: { v1: row.kpis.v1, v2: row.kpis.v2, v3: row.kpis.v3, v4: row.kpis.v4, total: row.kpis.vaz_total },
        metas: dados.metas, churn: dados.churnGeral || { inativos90: row.kpis.inativos_90, naoRacaoInativo: 0 },
        tarefas: { total: (row.tarefas || []).length, alta: (row.tarefas || []).filter(t => t.sev === 'alta').length },
        governanca: dados.governanca || {}
      });
      const a = snapDe(B, { metas: B.metas, governanca: B.governanca, churnGeral: B.churnGeral }), b = snapDe(S, R);
      // reaproveita o comparativo original, sem o cabeçalho/rodapé dele
      const html = buildCompareHTML(a, b).replace(/<header[\s\S]*?<\/header>/, '').replace(/<footer[\s\S]*<\/footer>/, '').replace('class="wrap kpis"', 'class="wrap"');
      cmp = `<div class="sec-head" style="margin-top:28px"><h2>Início da consultoria × hoje</h2><span class="hint num">A = raio-x de ${mesBR(c.mes_ref_base)} (quando a consultoria começou) · B = raio-x atual, ${mesBR(S.mes_ref)}</span></div><div style="margin:0 -20px">${html}</div>`;
    } else if (c.mes_ref_base) {
      cmp = `<div class="callout" style="margin-top:16px"><b>Comparativo início × hoje:</b> o raio-x atual ainda é o mesmo de quando a consultoria começou (${mesBR(c.mes_ref_base)}). Ele aparece aqui automaticamente quando fechar o próximo mês de vendas.</div>`;
    }

    rep.insertAdjacentHTML('beforeend', `<section id="consultoria"><div class="wrap">
      <div class="sec-head"><h2>Consultoria de faturamento</h2><span class="hint num">${esc(nomes[c.consultor_id] || 'consultor')} · ${dBR(c.inicio)} a ${dBR(c.fim_previsto)} · dia ${br(decorrido)} de ${br(total)} · status ${esc(c.status)}${c.obs ? ' · ' + esc(c.obs) : ''}</span></div>
      <div class="kpi-grid num" style="margin-bottom:16px">
        <div class="kpi"><div class="lab">Ritmo do plano</div><div class="val" style="color:${ritmo.c}">${ritmo.l}</div><div class="delta neutro">${pc(pctTarefas, 0)} das tarefas feitas · ${pc(pctTempo, 0)} do prazo</div></div>
        <div class="kpi"><div class="lab">Nota</div><div class="val">${c.score_inicial ?? '—'} → ${S.score ?? '—'}</div><div class="delta">${dScore == null ? '' : deltaBadge(c.score_inicial, S.score, v => br(v, 0), true)}</div></div>
        <div class="kpi"><div class="lab">Tarefas</div><div class="val">${br(tConcl.length)}/${br(tarefas.length)}</div><div class="delta ${tAtras.length ? 'down' : 'neutro'}">${tAtras.length ? br(tAtras.length) + ' vencida(s)' : br(tProx.length) + ' a fazer'}</div></div>
        <div class="kpi"><div class="lab">Reuniões</div><div class="val">${br(rFeitas.length)}/${br(reunioes.length)}</div><div class="delta ${rPend.length ? 'down' : 'neutro'}">${rPend.length ? br(rPend.length) + ' passada(s) sem confirmação' : br(rProx.length) + ' agendada(s)'}</div></div>
        <div class="kpi"><div class="lab">Próxima reunião</div><div class="val" style="font-size:1rem">${rProx.length ? dBR(rProx[0].data) + ' ' + String(rProx[0].ini || '').slice(0, 5) : '—'}</div><div class="delta neutro">${rProx.length ? esc(rProx[0].titulo) : 'nenhuma agendada'}</div></div>
        <div class="kpi"><div class="lab">Próxima tarefa</div><div class="val" style="font-size:1rem">${tProx.length ? dBR(tProx.sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)))[0].prazo) : '—'}</div><div class="delta neutro">${tProx.length ? esc(tProx[0].titulo) : 'nada pendente'}</div></div>
      </div>
      <div class="card"><h3>Gargalos da consultoria</h3><div class="note">O que está segurando o resultado — calculado da agenda e dos raios-x, não de opinião</div>${gargalos.map(g => `<div class="callout ${/vencida|não subiu|Travada/.test(g) ? 'red' : ''}">${g}</div>`).join('')}</div>
      <div class="callout" style="margin-top:16px">Os ${br(itens.length)} itens do plano de 90 dias (reuniões e tarefas) ficam na aba <b>Tarefas</b>, onde dá para marcar o que foi feito.</div>
      ${cmp}
    </div></section>`);
    initChartHovers();
    window.__consultoria = { c, itens, tarefas, reunioes, tAtras, rPend, ritmo, pctTarefas, pctTempo, nomes };
  }

  /* ===== aba TAREFAS: plano da consultoria (com ação) + achados do raio-x ===== */
  function buildTarefasTab() {
    const cc = window.__consultoria;
    const sec = document.createElement('section'); sec.id = 'planoCons'; sec.className = 'plano-cons';
    const secTarefas = document.getElementById('tarefas');
    const secTit = secTarefas && secTarefas.querySelector('h2'); if (secTit) secTit.textContent = 'Achados do raio-x';
    if (!cc) {
      sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Plano de trabalho</h2><span class="hint">Nasce quando o consultor inicia a consultoria de faturamento (botão no topo da aba Loja)</span></div>
        <div class="card"><div class="callout">Esta loja ainda não tem consultoria ativa. Os achados abaixo já mostram por onde começar; ao iniciar a consultoria, cada achado vira tarefa com prazo na agenda do consultor, e as reuniões quinzenais com o franqueado ficam marcadas.</div></div></div>`;
      rep.insertBefore(sec, secTarefas); return;
    }
    const { c, itens, nomes } = cc;
    const venc = i => i.tipo === 'tarefa' ? i.prazo : i.data;
    const em7 = (() => { const d = new Date(hoje); d.setDate(d.getDate() + 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const abertos = itens.filter(i => !i.concluida).sort((a, b) => String(venc(a)).localeCompare(String(venc(b))));
    const G = { venc: abertos.filter(i => venc(i) && venc(i) < hojeISO), hoje: abertos.filter(i => venc(i) === hojeISO), semana: abertos.filter(i => venc(i) > hojeISO && venc(i) <= em7), depois: abertos.filter(i => !venc(i) || venc(i) > em7), feitas: itens.filter(i => i.concluida).sort((a, b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || ''))) };
    const item = i => { const v = venc(i), cls = i.concluida ? 'feita' : (v && v < hojeISO) ? 'venc' : v === hojeISO ? 'hoje' : '';
      return `<div class="item-plano ${cls}"><div><div class="tt">${i.tipo === 'tarefa' ? '☐' : '📅'} ${esc(i.titulo)}</div><div class="sub">${i.tipo === 'tarefa' ? 'prazo ' + dBR(v) : 'reunião ' + dBR(v) + (i.ini ? ' às ' + String(i.ini).slice(0, 5) : '')}${i.concluida ? ' · feita' + (i.concluida_em ? ' em ' + dBR(i.concluida_em) : '') : cls === 'venc' ? ' · <b style="color:var(--alerta)">vencida há ' + br(diasEntre(v, hojeISO)) + ' dia(s)</b>' : ''} · ${esc(nomes[i.user_id] || '')}</div></div>
        <div class="acao">${i.concluida ? `<button type="button" class="feita" data-reabrir="${esc(i.id)}">reabrir</button>` : `<button type="button" data-concluir="${esc(i.id)}">${i.tipo === 'tarefa' ? '✓ feita' : '✓ realizada'}</button>`}</div></div>`; };
    const grupo = (tit, lista, vazio) => `<div class="grupo"><h4>${tit} · ${br(lista.length)}</h4>${lista.length ? lista.map(item).join('') : `<div style="font-size:.78rem;color:var(--ink-2);padding:4px 0 8px">${vazio}</div>`}</div>`;
    sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Plano de 90 dias</h2><span class="hint num">${esc(nomes[c.consultor_id] || 'consultor')} · ${dBR(c.inicio)} a ${dBR(c.fim_previsto)} · ${br(itens.length)} itens · marcar aqui atualiza a agenda da Central</span></div>
      <div class="resumo-tarefas num">
        <div class="kpi"><div class="lab">Vencidas</div><div class="val" style="color:${G.venc.length ? 'var(--alerta)' : 'inherit'}">${br(G.venc.length)}</div></div>
        <div class="kpi"><div class="lab">Hoje + 7 dias</div><div class="val">${br(G.hoje.length + G.semana.length)}</div></div>
        <div class="kpi"><div class="lab">Feitas</div><div class="val">${br(G.feitas.length)}<span style="font-size:.6em;color:var(--ink-2)"> / ${br(itens.length)}</span></div></div>
        <div class="kpi"><div class="lab">Ritmo</div><div class="val" style="font-size:1.1rem;color:${cc.ritmo.c}">${cc.ritmo.l}</div><div class="delta neutro">${pc(cc.pctTarefas, 0)} feitas · ${pc(cc.pctTempo, 0)} do prazo</div></div>
      </div>
      <div class="card">
        ${grupo('Vencidas', G.venc, 'Nada vencido.')}
        ${grupo('Hoje', G.hoje, 'Nada para hoje.')}
        ${grupo('Próximos 7 dias', G.semana, 'Nada nesta semana.')}
        ${grupo('Depois', G.depois, 'Nada mais agendado.')}
        ${grupo('Feitas', G.feitas, 'Nenhuma ainda.')}
        <div class="note" style="margin-top:12px">Quem marca: o consultor responsável ou um admin. Editar prazo, título ou apagar continua só na agenda, por admin.</div>
      </div></div>`;
    rep.insertBefore(sec, secTarefas);
    sec.querySelectorAll('[data-concluir],[data-reabrir]').forEach(b => b.onclick = async () => {
      const id = b.dataset.concluir || b.dataset.reabrir, feito = !!b.dataset.concluir;
      b.disabled = true;
      const { data, error } = await sb.from('agenda_eventos').update({ concluida: feito, concluida_em: feito ? new Date().toISOString() : null }).eq('id', id).select('id');
      if (error || !data || !data.length) { b.disabled = false; alert(error ? error.message : 'Sem permissão: só o consultor responsável ou um admin marca este item.'); return; }
      const it = itens.find(x => x.id === id); if (it) { it.concluida = feito; it.concluida_em = feito ? new Date().toISOString() : null; }
      const tarefas = itens.filter(i => i.tipo === 'tarefa'), reunioes = itens.filter(i => i.tipo !== 'tarefa');
      cc.tAtras = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < hojeISO); cc.rPend = reunioes.filter(r => r.data < hojeISO && !r.concluida);
      cc.pctTarefas = tarefas.length ? 100 * tarefas.filter(t => t.concluida).length / tarefas.length : 0;
      cc.ritmo = cc.pctTarefas >= cc.pctTempo - 10 ? { l: 'No ritmo', c: '#009150' } : cc.pctTarefas >= cc.pctTempo - 30 ? { l: 'Atrasando', c: '#E67E22' } : { l: 'Travada', c: '#C0392B' };
      sec.remove(); buildTarefasTab(); montarAbas(true);
    });
  }

  /* ===== abas: cada bloco do relatório vai para uma aba; cabeçalho e KPIs ficam sempre ===== */
  function montarAbas(manter) {
    const de = el => {
      if (el.id === 'evolucao') return 'evolucao';
      if (el.id === 'consultoria') return 'consultoria';
      if (el.id === 'planoCons' || el.id === 'tarefas') return 'tarefas';
      const h = el.querySelector && el.querySelector('h2'); const t = h ? h.textContent : '';
      if (/Lista de resgate/i.test(t)) return 'clientes';
      if (/prateleira|Sobrando parado|Posição de estoque|Compras e fornecedores/i.test(t)) return 'estoque';
      if (el.tagName === 'SECTION' || el.tagName === 'FOOTER') return 'diag';
      return null;   // hero, kpis, avisos: sempre visíveis
    };
    [...rep.children].forEach(el => { const a = de(el); if (a) el.setAttribute('data-aba', a); else el.removeAttribute('data-aba'); });
    const cc = window.__consultoria, nAbertas = cc ? cc.tAtras.length + cc.rPend.length : 0;
    const bd = $('abaTarefasN'); if (bd) { bd.textContent = nAbertas; bd.style.display = nAbertas ? '' : 'none'; }
    const pedida = new URLSearchParams(location.search).get('aba');
    const ligada = document.querySelector('.abas .aba.on');
    const atual = manter && ligada ? ligada.dataset.aba : null;
    const ir = (aba, rolar) => {
      document.querySelectorAll('.abas .aba').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
      rep.querySelectorAll('[data-aba]').forEach(el => el.classList.toggle('on', el.dataset.aba === aba));
      if (rolar && window.parent !== window) window.parent.postMessage({ raiox: 'topo', fra: FRA }, location.protocol === 'file:' ? '*' : location.origin);
      avisarPai();
    };
    document.querySelectorAll('.abas .aba').forEach(b => b.onclick = () => ir(b.dataset.aba, true));
    ir(atual || (['diag', 'tarefas', 'clientes', 'estoque', 'evolucao', 'consultoria'].includes(pedida) ? pedida : 'diag'), false);
    const ex = $('exportar');
    if (ex && !ex.dataset.ligado) { ex.dataset.ligado = '1'; $('btnExportar').onclick = () => ex.classList.toggle('on'); document.addEventListener('click', e => { if (!ex.contains(e.target)) ex.classList.remove('on'); }); }
  }

  /* ===== modais: "fixed" dentro do iframe cai no meio do documento inteiro; abre onde o usuário clicou ===== */
  function ajustarModais() {
    let ultimoY = 0; document.addEventListener('click', e => { ultimoY = e.pageY; }, true);
    const ov = $('mixModal'); if (!ov) return;
    const reposiciona = () => { ov.style.position = 'absolute'; ov.style.top = '0'; ov.style.height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 'px'; ov.style.alignItems = 'flex-start'; ov.style.paddingTop = Math.max(20, ultimoY - 140) + 'px'; };
    ['abrirMixMes', 'abrirGateInfo'].forEach(fn => { const orig = window[fn]; if (typeof orig === 'function') window[fn] = function () { orig.apply(this, arguments); reposiciona(); }; });
  }

  /* ===== exportações (arquivos para mandar ao franqueado / guardar) ===== */
  function ligarExportacoes() {
    const baixar = (nome, conteudo, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    const seg = v => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
    const tag = 'FR' + FRA + '_' + S.mes_ref;
    // instantâneo (JSON), resgate (CSV), tarefas (CSV) e PDF já são os botões originais da máquina
    // evolução mensal em CSV
    const bEvo = $('btnEvolucaoCSV');
    if (bEvo) bEvo.onclick = () => {
      const l = ['mes;score;receita_mes;lucro_mes;margem_adj;ticket;cupons_mes;ativos;ident_pct;ret45;vazamento_mes;tarefas_graves;calculado_em'];
      HIST.forEach(h => l.push([h.mes_ref, h.score ?? '', h.kpis.receita_mes, h.kpis.lucro_mes, h.kpis.margem_adj, h.kpis.ticket, h.kpis.cupons_mes, h.kpis.ativos_ult, h.kpis.ident_pct, h.kpis.ret45, h.kpis.vaz_total, h.kpis.tarefas_alta || 0, String(h.calculado_em).slice(0, 10)].map(v => typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : seg(v)).join(';')));
      baixar('evolucao_' + tag + '.csv', '﻿' + l.join('\r\n'), 'text/csv;charset=utf-8');
    };
    // plano da consultoria em CSV
    const bPl = $('btnPlanoCSV');
    if (bPl) bPl.onclick = () => {
      const cc = window.__consultoria; if (!cc) return alert('Esta loja não tem consultoria.');
      const l = ['tipo;item;data_ou_prazo;situacao;concluida_em'];
      cc.itens.forEach(i => { const venc = i.tipo === 'tarefa' ? i.prazo : i.data; l.push([i.tipo === 'tarefa' ? 'tarefa' : 'reuniao', '"' + String(i.titulo || '').replace(/"/g, '""') + '"', venc || '', i.concluida ? 'feita' : (venc && venc < hojeISO ? 'vencida' : 'a fazer'), i.concluida_em ? String(i.concluida_em).slice(0, 10) : ''].join(';')); });
      baixar('plano_consultoria_' + tag + '.csv', '﻿' + l.join('\r\n'), 'text/csv;charset=utf-8');
    };
  }
})().catch(e => { console.error(e); const r = document.getElementById('report'); if (r) r.innerHTML = '<div class="wrap" style="padding:40px 20px"><div class="alerta-filial">Erro ao montar o relatório: ' + String(e.message || e).replace(/[<>]/g, '') + '</div></div>'; });
