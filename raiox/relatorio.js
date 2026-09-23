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
  const { data: PERFIL } = await sb.from('perfis').select('id,nome,is_admin,papeis').eq('id', session.user.id).maybeSingle();
  const EH_ADMIN = !!(PERFIL && PERFIL.is_admin), EH_FRANQ = !!(PERFIL && !PERFIL.is_admin && (PERFIL.papeis || []).includes('franqueado')), EH_EQUIPE = !EH_FRANQ;
  const [atualQ, histQ, consQ, frqQ, estQ] = await Promise.all([
    sb.from('raiox_snapshots_atual').select('*').eq('fra', FRA).maybeSingle(),
    sb.from('raiox_snapshots').select('fra,mes_ref,calculado_em,score,sem_nota_motivo,sub,kpis').eq('fra', FRA).order('mes_ref'),
    sb.from('raiox_consultorias').select('*').eq('fra', FRA).order('criado_em', { ascending: false }),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor').eq('fra', FRA).maybeSingle(),
    sb.from('raiox_estoque').select('id,fra,tipo,arquivo,enviado_em,resumo').eq('fra', FRA).order('enviado_em', { ascending: false })
  ]);
  const S = atualQ.data;
  if (!S) return aviso('Esta loja ainda não tem raio-x calculado. Depois da carga do BI de vendas, a rotina noturna calcula sozinha.');
  const [fullQ, resgQ, cttQ] = await Promise.all([
    sb.from('raiox_snapshots').select('dados,tarefas').eq('fra', FRA).eq('mes_ref', S.mes_ref).single(),
    sb.from('raiox_resgate').select('cliente_cod,nome,telefone,dias,banda,compras,gasto,gasto_mes,racao,bt,ultima').eq('fra', FRA).eq('mes_ref', S.mes_ref).order('gasto_mes', { ascending: false }),
    sb.from('raiox_resgate_contatos').select('cliente_cod,por,em').eq('fra', FRA)
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
  // lista de resgate: a Central guarda todos os clientes identificados da loja (código, nome, telefone); quem vê é regra do banco (carteira do consultor, franqueado da loja, admin/supervisão)
  // contatos de resgate já feitos (clique no WhatsApp): gravados na Central por loja + cliente, com quem clicou e quando
  const CTT = {}; (cttQ.data || []).forEach(x => { CTT[x.cliente_cod] = { em: x.em, por: x.por }; });
  const porIds = [...new Set(Object.values(CTT).map(x => x.por).filter(Boolean))];
  const NOMES = {};
  if (porIds.length) { const { data: pf } = await sb.from('perfis').select('id,nome').in('id', porIds); (pf || []).forEach(p => { NOMES[p.id] = p.nome; }); }
  Object.values(CTT).forEach(x => { x.por_nome = NOMES[x.por] || (x.por === session.user.id ? (PERFIL && PERFIL.nome) || 'você' : ''); });
  R.clientes = (resgQ.data || []).map(c => ({
    cli: c.cliente_cod, nome: c.nome || ('Cód. ' + c.cliente_cod), tel: c.telefone || '', ultima: c.ultima ? new Date(c.ultima + 'T12:00:00') : R.ref,
    dias: c.dias, banda: c.banda, compras: c.compras, gasto: +c.gasto || 0, gastoMes: +c.gasto_mes || 0, racao: !!c.racao, bt: !!c.bt, pacote: false,
    contato: CTT[c.cliente_cod] || null
  }));
  window.__rxContatos = {
    marcar: async (cli, feito) => {
      const { data, error } = await sb.rpc('raiox_marcar_contato', { p_fra: FRA, p_cliente_cod: String(cli), p_feito: !!feito });
      if (error) throw new Error(error.message);
      return { em: data && data.em, por: session.user.id, por_nome: (PERFIL && PERFIL.nome) || 'você' };
    }
  };
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
  // v3.5: erros de fracionamento (motor v2.2) — custo da embalagem fechada lançado na unidade vendida
  TASK_TEXT.fracionamento = d => ({ titulo: `Corrigir fracionamento no cadastro: ${br(d.n)} produto${d.n === 1 ? '' : 's'}`, desc: `Produtos vendidos por unidade ou kg estão com o custo da embalagem fechada (caixa, fardo, saco) — por isso aparecem ${kmil(d.prejuizo)} de "prejuízo" que não existe e a margem reportada cai. Maior caso: ${d.pior}. No One Pet, conferir no cadastro de cada produto a unidade de compra × unidade de venda (fator de conversão) e o custo; se a nota entrou com a caixa como 1 unidade, corrigir a entrada. A lista completa está na seção "Erros de fracionamento" do diagnóstico.` });
  R.tarefas = R.tarefas.filter(t => TASK_TEXT[t.chave]);
  // nota oficial (com trava de custo sem cadastro) prevalece sobre a nota crua do motor
  const scoreOficial = S.score;
  if (scoreOficial == null) R.score = R.score; else R.score = scoreOficial;

  /* ---------- renderiza com o motor visual original ---------- */
  const lojaLabel = (F.nome || ('FRA ' + FRA)) + ' · FRA ' + FRA;
  window.__diagR = R; rx.state.R = R; rx.state.lojaLabel = lojaLabel;
  rep.innerHTML = buildReportHTML(R, { lojaLabel });
  inserirFracionamento();
  window.__rxAchadosDB = true;
  rx.initResgate(R); initChartHovers(); rx.initTarefas(); await ligarAchados();
  if (window.parent !== window) document.body.classList.add('embed');
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
  buildAvaliacaoTab();
  buildHistoricoTab();
  montarAbas();
  ligarExportacoes();
  ajustarModais();
  avisarPai(); new ResizeObserver(avisarPai).observe(document.body);
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || !ev.data || ev.source !== window.parent) return;
    if (ev.data.raiox === 'ir') { const el = document.getElementById(ev.data.alvo); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    if (ev.data.raiox === 'aba' && window.__rxIr) window.__rxIr(String(ev.data.aba), false);
    if (ev.data.raiox === 'exportar') { const b = document.getElementById(String(ev.data.botao)); if (b && /^btn[A-Za-z0-9]+$/.test(String(ev.data.botao))) b.click(); }
  });

  /* ===== v3.5 · erros de fracionamento: seção no Diagnóstico, logo antes do Gate 0 ===== */
  function inserirFracionamento() {
    const Fr = R.fracionamento;
    if (!Fr || !Fr.n) return;
    const rs = v => v == null || !isFinite(v) ? '—' : 'R$ ' + br(v, v < 100 ? 2 : 0);
    const dt = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? x.toLocaleDateString('pt-BR') : '—'; };
    const fat = i => i.fator == null ? '—' : '≈' + br(i.fator, i.fator >= 10 ? 0 : 1) + '×';
    const linhas = Fr.itens.map(i => `<tr>
      <td><b>${esc(i.produto)}</b><div class="note" style="margin:2px 0 0">${esc(i.grupo || '')} · ${br(i.linhas)} venda${i.linhas === 1 ? '' : 's'} · ${dt(i.dataIni)} a ${dt(i.dataFim)}</div></td>
      <td class="num">${rs(i.precoUn)}</td>
      <td class="num"><b style="color:var(--alerta)">${rs(i.custoUn)}</b></td>
      <td class="num" title="custo lançado ÷ ${i.fatorBase === 'custo' ? 'custo normal do produto' : 'preço de venda'} — fica perto do tamanho da embalagem">${fat(i)}</td>
      <td>${i.nf ? `NF ${esc(i.nf.nf || '?')} · ${dt(i.nf.d)}<div class="note" style="margin:2px 0 0">${esc(i.nf.fornecedor || '')} · ${rs(i.nf.custo)}/un</div>` : '<span class="note">cadastro do produto</span>'}</td>
      <td class="num"><b>${kmil(i.prejuizo)}</b></td></tr>`).join('');
    const html = `<section id="fracionamento"><div class="wrap">
      <div class="sec-head"><h2>Erros de fracionamento</h2><span class="hint">Custo da embalagem fechada (caixa, fardo, saco) lançado na unidade ou no kg vendido — é cadastro, não prejuízo</span></div>
      <div class="kpi-grid num" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
        <div class="kpi"><div class="lab">Produtos a corrigir</div><div class="val" style="color:var(--alerta)">${br(Fr.n)}</div></div>
        <div class="kpi"><div class="lab">"Prejuízo" que não existe</div><div class="val" style="color:var(--alerta)">${kmil(Fr.prejuizo)}</div></div>
        <div class="kpi"><div class="lab">Do custo da loja é fantasma</div><div class="val">${pc(Fr.pctCusto)}</div></div>
        <div class="kpi"><div class="lab">Vendas fora da margem</div><div class="val">${br(Fr.linhas)}</div></div>
      </div>
      <div class="card">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><h3 style="flex:1">Produtos com custo de embalagem na unidade</h3><button type="button" class="btn" id="btnCopiarFrac" style="border:1.5px solid var(--linha);background:#fff;border-radius:9px;padding:7px 12px;font-weight:700;cursor:pointer">📋 Copiar para o franqueado</button></div>
        <div class="tbl-scroll"><table class="num"><thead><tr><th>Produto</th><th class="num">Preço/un</th><th class="num">Custo/un lançado</th><th class="num">Fator</th><th>Onde corrigir</th><th class="num">"Prejuízo"</th></tr></thead><tbody>${linhas}</tbody></table></div>
        ${Fr.n > Fr.itens.length ? `<div class="note" style="margin-top:8px">Mostrando os ${br(Fr.itens.length)} maiores de ${br(Fr.n)}.</div>` : ''}
        <div class="callout"><b>Como corrigir no One Pet:</b> no cadastro de cada produto, conferir a unidade de compra × unidade de venda (fator de conversão/fracionamento) e o custo. Quando aparece uma nota na coluna "Onde corrigir", a entrada foi lançada com a caixa como 1 unidade — corrigir a entrada. Enquanto não corrige, essas vendas ficam fora da margem ajustada, da margem por categoria, dos vazamentos e do ranking de vendedores; depois da correção o Raio-X recalcula na rodada seguinte.</div>
      </div></div></section>`;
    const gate = [...rep.querySelectorAll('section')].find(s => /Gate 0/i.test((s.querySelector('h2') || {}).textContent || ''));
    if (gate) gate.insertAdjacentHTML('beforebegin', html); else rep.insertAdjacentHTML('beforeend', html);
    const b = $('btnCopiarFrac'); if (!b) return;
    b.onclick = async () => {
      const top = Fr.itens.slice(0, 10).map((i, k) => `${k + 1}. ${i.produto} — vendido a ${rs(i.precoUn)}/un com custo de ${rs(i.custoUn)}/un` + (i.nf ? ` (NF ${i.nf.nf}, ${dt(i.nf.d)}, ${i.nf.fornecedor})` : '')).join('\n');
      const txt = `${F.nome || 'FRA ' + FRA} · FRA ${FRA} — produtos com erro de fracionamento no cadastro\n\n` +
        `Estes produtos estão com o custo da embalagem fechada (caixa, fardo, saco) em cada unidade vendida. Isso gera ${kmil(Fr.prejuizo)} de prejuízo que não existe e derruba a margem da loja no Raio-X.\n\n${top}` +
        (Fr.n > 10 ? `\n… e mais ${Fr.n - 10} no Raio-X.` : '') +
        `\n\nComo corrigir no One Pet: no cadastro de cada produto, conferir unidade de compra × unidade de venda (fator de conversão) e o custo. Se a nota entrou com a caixa como 1 unidade, corrigir a entrada. Depois da correção o Raio-X recalcula sozinho.`;
      try { await navigator.clipboard.writeText(txt); }
      catch (_) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      b.textContent = '✓ Copiado'; setTimeout(() => { b.textContent = '📋 Copiar para o franqueado'; }, 1800);
    };
  }

  /* ===== achados do raio-x marcados como feitos: gravados na Central (fra + chave), por consultor ou franqueado ===== */
  async function ligarAchados() {
    const { data } = await sb.from('raiox_achados').select('chave,concluida,por,em').eq('fra', FRA);
    const feitos = {}; (data || []).forEach(a => { feitos[a.chave] = a; });
    document.querySelectorAll('.task-check[data-chave]').forEach(cb => {
      const ch = cb.dataset.chave, row = cb.closest('.task-row');
      if (feitos[ch] && feitos[ch].concluida) { cb.checked = true; row.classList.add('done'); }
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        const { error } = await sb.from('raiox_achados').upsert({ fra: FRA, chave: ch, concluida: cb.checked, por: session.user.id, em: new Date().toISOString() }, { onConflict: 'fra,chave' });
        cb.disabled = false;
        if (error) { cb.checked = !cb.checked; alert('Não salvou: ' + error.message); return; }
        row.classList.toggle('done', cb.checked);
      });
    });
  }

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
    const [itensQ, perfQ, baseQ, avQ] = await Promise.all([
      sb.from('agenda_eventos').select('id,titulo,tipo,data,ini,prazo,concluida,concluida_em,concluida_por,user_id,responsavel,descricao').eq('consultoria_id', c.id).is('cancelado_em', null).order('data').order('id'),
      sb.from('perfis').select('id,nome').in('id', [c.consultor_id, c.franqueado_id, session.user.id].filter(Boolean)),
      c.mes_ref_base ? sb.from('raiox_snapshots').select('fra,mes_ref,calculado_em,score,sub,kpis,dados->metas,dados->governanca,dados->churnGeral,tarefas').eq('fra', FRA).eq('mes_ref', c.mes_ref_base).maybeSingle() : Promise.resolve({ data: null }),
      sb.from('raiox_avaliacoes').select('*').eq('consultoria_id', c.id).order('semana', { ascending: false })
    ]);
    const AVS = avQ.data || [];
    const itens = itensQ.data || [], nomes = {}; (perfQ.data || []).forEach(p => { nomes[p.id] = p.nome; });
    const tarefas = itens.filter(i => i.tipo === 'tarefa' && !/^Avalia/.test(i.titulo || '')), reunioes = itens.filter(i => i.tipo !== 'tarefa' && !/^Avalia/.test(i.titulo || ''));
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
    // o que o franqueado está dizendo
    if (AVS.length) {
      const ult = AVS[0], duasPiorou = AVS.length >= 2 && AVS[0].andamento === 'piorou' && AVS[1].andamento === 'piorou';
      const semResposta = AVS.filter(a => (a.sugestao || a.nota <= 2 || a.andamento === 'piorou') && !a.resposta).length;
      if (duasPiorou) gargalos.push(`<b>Franqueado diz que piorou duas avaliações seguidas</b> (notas ${AVS[1].nota} e ${AVS[0].nota}/5). Conversar antes da próxima reunião — a percepção dele é parte do resultado.`);
      else if (ult.nota <= 2) gargalos.push(`<b>Última avaliação do franqueado: ${ult.nota}/5 (${esc(ult.andamento)})</b>${ult.comentario ? ' — "' + esc(ult.comentario.slice(0, 140)) + '"' : ''}.`);
      if (semResposta) gargalos.push(`<b>${br(semResposta)} avaliação(ões) do franqueado sem resposta</b> — sugestão ou nota baixa esperando retorno na aba Avaliação.`);
      const diasSem = diasEntre(AVS[0].semana, hojeISO);
      if (c.status === 'ativa' && diasSem >= 21) gargalos.push(`<b>Franqueado sem avaliar há ${br(diasSem)} dias</b> — última referência: ${dBR(AVS[0].semana)}. Marcar a reunião como realizada abre a avaliação dele.`);
    } else if (c.status === 'ativa' && decorrido >= 10) gargalos.push('<b>O franqueado ainda não avaliou nenhuma reunião</b> — confirmar se ele tem o login do Raio-X e se as reuniões estão sendo marcadas como realizadas.');
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
      <div class="callout" style="margin-top:16px">Os ${br(itens.length)} itens do plano de 90 dias (reuniões e tarefas) ficam na aba <b>Tarefas</b>${EH_FRANQ ? '' : ', onde dá para marcar o que foi feito'}.</div>
      ${resultadoHTML(c, AVS)}
      ${cmp}
    </div></section>`);
    initChartHovers();
    window.__consultoria = { c, itens, tarefas, reunioes, tAtras, rPend, ritmo, pctTarefas, pctTempo, nomes, avs: AVS };
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
      return `<div class="item-plano ${cls}"><div><div class="tt">${i.tipo === 'tarefa' ? '☐' : '📅'} ${esc(i.titulo)}</div><div class="sub">${i.tipo === 'tarefa' ? 'prazo ' + dBR(v) : 'reunião ' + dBR(v) + (i.ini ? ' às ' + String(i.ini).slice(0, 5) : '')}${i.concluida ? ' · feita' + (i.concluida_em ? ' em ' + dBR(i.concluida_em) : '') + (i.concluida_por ? ' por ' + esc(nomes[i.concluida_por] || 'equipe') : '') : cls === 'venc' ? ' · <b style="color:var(--alerta)">vencida há ' + br(diasEntre(v, hojeISO)) + ' dia(s)</b>' : ''} · ${esc(nomes[i.user_id] || '')}</div></div>
        <div class="acao">${c.status !== 'ativa' ? '' : i.concluida ? `<button type="button" class="feita" data-reabrir="${esc(i.id)}">reabrir</button>` : `<button type="button" data-concluir="${esc(i.id)}">${i.tipo === 'tarefa' ? '✓ feita' : '✓ realizada'}</button>`}${PODE_GERIR && i.tipo === 'tarefa' && !i.concluida ? ` <button type="button" class="feita" data-editar="${esc(i.id)}" title="Editar título, prazo, responsável ou descrição">✎</button> <button type="button" class="feita" data-remover="${esc(i.id)}" title="Remover esta tarefa da consultoria">✕</button>` : ''}</div></div>${PODE_GERIR && i.tipo === 'tarefa' && !i.concluida ? `<div class="edit-tarefa" data-edit-de="${esc(i.id)}" style="display:none">${formTarefa(i)}</div>` : ''}`; };
    // só admin cria/edita/remove tarefas da consultoria (a regra também está no banco: RPC raiox_tarefa_gerir)
    const PODE_GERIR = EH_ADMIN && c.status === 'ativa';
    const formTarefa = (t) => `<div class="ft-grid">
        <label>Tarefa<input class="ftT" maxlength="200" value="${esc(t ? t.titulo : '')}" placeholder="O que precisa ser feito"></label>
        <label>Prazo<input class="ftP" type="date" value="${esc(t && t.prazo ? t.prazo : '')}"></label>
        <label>Responsável<select class="ftR"><option value="consultor"${!t || t.responsavel !== 'franqueado' ? ' selected' : ''}>consultor</option><option value="franqueado"${t && t.responsavel === 'franqueado' ? ' selected' : ''}>franqueado</option></select></label>
        <label class="full">Descrição / como fazer (opcional)<textarea class="ftD" rows="2" maxlength="4000">${esc(t ? t.descricao || '' : '')}</textarea></label>
        <div class="full ft-acoes"><button type="button" class="ft-salvar">${t ? 'Salvar alterações' : '+ Adicionar tarefa'}</button>${t ? ' <button type="button" class="ft-cancelar">Cancelar</button>' : ''}</div>
      </div>`;
    const grupo = (tit, lista, vazio) => `<div class="grupo"><h4>${tit} · ${br(lista.length)}</h4>${lista.length ? lista.map(item).join('') : `<div style="font-size:.78rem;color:var(--ink-2);padding:4px 0 8px">${vazio}</div>`}</div>`;
    sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Plano de 90 dias</h2><span class="hint num">${esc(nomes[c.consultor_id] || 'consultor')} · ${dBR(c.inicio)} a ${dBR(c.fim_previsto)} · ${br(itens.length)} itens · marcar aqui atualiza a agenda da Central</span></div>
      <div class="resumo-tarefas num">
        <div class="kpi"><div class="lab">Vencidas</div><div class="val" style="color:${G.venc.length ? 'var(--alerta)' : 'inherit'}">${br(G.venc.length)}</div></div>
        <div class="kpi"><div class="lab">Hoje + 7 dias</div><div class="val">${br(G.hoje.length + G.semana.length)}</div></div>
        <div class="kpi"><div class="lab">Feitas</div><div class="val">${br(G.feitas.length)}<span style="font-size:.6em;color:var(--ink-2)"> / ${br(itens.length)}</span></div></div>
        <div class="kpi"><div class="lab">Ritmo</div><div class="val" style="font-size:1.1rem;color:${cc.ritmo.c}">${cc.ritmo.l}</div><div class="delta neutro">${pc(cc.pctTarefas, 0)} feitas · ${pc(cc.pctTempo, 0)} do prazo</div></div>
      </div>
      <div class="card">
        ${PODE_GERIR ? `<div class="grupo" style="margin-top:0"><h4>Nova tarefa para o consultor · admin</h4><div class="edit-tarefa nova">${formTarefa(null)}</div></div>` : ''}
        ${grupo('Vencidas', G.venc, 'Nada vencido.')}
        ${grupo('Hoje', G.hoje, 'Nada para hoje.')}
        ${grupo('Próximos 7 dias', G.semana, 'Nada nesta semana.')}
        ${grupo('Depois', G.depois, 'Nada mais agendado.')}
        ${grupo('Feitas', G.feitas, 'Nenhuma ainda.')}
        <div class="note" style="margin-top:12px">${EH_FRANQ ? 'Você pode marcar o que já foi feito; fica registrado com seu nome e data, e o consultor vê na agenda dele.' : 'Quem marca: o consultor responsável, o franqueado da loja ou um admin — fica registrado quem marcou. ' + (EH_ADMIN ? 'Como admin, você também cria (✚), edita (✎) e remove (✕) tarefas aqui; a agenda do consultor na Central atualiza na hora.' : 'Criar, editar prazo/título ou apagar tarefas: só admin.')}</div>
      </div></div>`;
    rep.insertBefore(sec, secTarefas);
    sec.querySelectorAll('[data-concluir],[data-reabrir]').forEach(b => b.onclick = async () => {
      const id = b.dataset.concluir || b.dataset.reabrir, feito = !!b.dataset.concluir;
      b.disabled = true;
      const { data, error } = await sb.rpc('raiox_concluir_item', { p_id: id, p_concluida: feito });
      if (error || !data) { b.disabled = false; alert(error ? error.message : 'Sem permissão para marcar este item.'); return; }
      const it = itens.find(x => x.id === id); if (it) { it.concluida = feito; it.concluida_em = feito ? new Date().toISOString() : null; it.concluida_por = feito ? session.user.id : null; }
      if (!nomes[session.user.id] && PERFIL) nomes[session.user.id] = PERFIL.nome;
      const tarefas = itens.filter(i => i.tipo === 'tarefa' && !/^Avalia/.test(i.titulo || '')), reunioes = itens.filter(i => i.tipo !== 'tarefa' && !/^Avalia/.test(i.titulo || ''));
      cc.tAtras = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < hojeISO); cc.rPend = reunioes.filter(r => r.data < hojeISO && !r.concluida);
      cc.pctTarefas = tarefas.length ? 100 * tarefas.filter(t => t.concluida).length / tarefas.length : 0;
      cc.ritmo = cc.pctTarefas >= cc.pctTempo - 10 ? { l: 'No ritmo', c: '#009150' } : cc.pctTarefas >= cc.pctTempo - 30 ? { l: 'Atrasando', c: '#E67E22' } : { l: 'Travada', c: '#C0392B' };
      sec.remove(); buildTarefasTab(); montarAbas(true);
    });
    if (!PODE_GERIR) return;
    /* --- gestão de tarefas (admin): criar / editar / remover via RPC raiox_tarefa_gerir --- */
    const recarregar = async () => {
      const { data } = await sb.from('agenda_eventos').select('id,titulo,tipo,data,ini,prazo,concluida,concluida_em,concluida_por,user_id,responsavel,descricao').eq('consultoria_id', c.id).is('cancelado_em', null).order('data').order('id');
      itens.length = 0; (data || []).forEach(i => itens.push(i));
      const tarefas = itens.filter(i => i.tipo === 'tarefa' && !/^Avalia/.test(i.titulo || '')), reunioes = itens.filter(i => i.tipo !== 'tarefa' && !/^Avalia/.test(i.titulo || ''));
      cc.tarefas = tarefas; cc.reunioes = reunioes;
      cc.tAtras = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < hojeISO); cc.rPend = reunioes.filter(r => r.data < hojeISO && !r.concluida);
      cc.pctTarefas = tarefas.length ? 100 * tarefas.filter(t => t.concluida).length / tarefas.length : 0;
      cc.ritmo = cc.pctTarefas >= cc.pctTempo - 10 ? { l: 'No ritmo', c: '#009150' } : cc.pctTarefas >= cc.pctTempo - 30 ? { l: 'Atrasando', c: '#E67E22' } : { l: 'Travada', c: '#C0392B' };
      sec.remove(); buildTarefasTab(); montarAbas(true);
    };
    const gerir = async (args, btn) => {
      if (btn) btn.disabled = true;
      const { error } = await sb.rpc('raiox_tarefa_gerir', args);
      if (error) { if (btn) btn.disabled = false; alert('Não deu: ' + error.message); return false; }
      await recarregar(); return true;
    };
    const lerForm = box => ({ titulo: box.querySelector('.ftT').value.trim(), prazo: box.querySelector('.ftP').value || null, resp: box.querySelector('.ftR').value, desc: box.querySelector('.ftD').value.trim() });
    sec.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { const f = sec.querySelector(`[data-edit-de="${b.dataset.editar}"]`); if (f) f.style.display = f.style.display === 'none' ? '' : 'none'; avisarPai(); });
    sec.querySelectorAll('.ft-cancelar').forEach(b => b.onclick = () => { b.closest('.edit-tarefa').style.display = 'none'; avisarPai(); });
    sec.querySelectorAll('[data-remover]').forEach(b => b.onclick = () => {
      const it = itens.find(x => x.id === b.dataset.remover); if (!it) return;
      if (!confirm('Remover a tarefa "' + it.titulo + '" desta consultoria? Ela sai da agenda do consultor.')) return;
      gerir({ p_acao: 'remover', p_id: it.id }, b);
    });
    sec.querySelectorAll('.edit-tarefa').forEach(box => {
      const salvar = box.querySelector('.ft-salvar'); if (!salvar) return;
      salvar.onclick = () => {
        const v = lerForm(box);
        if (!v.titulo) return alert('Escreva o título da tarefa.');
        if (box.classList.contains('nova')) gerir({ p_acao: 'criar', p_consultoria: c.id, p_titulo: v.titulo, p_descricao: v.desc || null, p_prazo: v.prazo, p_responsavel: v.resp }, salvar);
        else gerir({ p_acao: 'editar', p_id: box.dataset.editDe, p_titulo: v.titulo, p_descricao: v.desc, p_prazo: v.prazo, p_responsavel: v.resp }, salvar);
      };
    });
  }

  /* ===== resultado da consultoria (documento de comparação) ===== */
  function resultadoHTML(c, avs) {
    const r = c.resultado;
    const cor = v => v === 'positiva' ? '#009150' : v === 'negativa' ? '#C0392B' : v === 'não fez diferença' ? '#E67E22' : '#5A7268';
    const fmtD = (v, f) => v == null ? '—' : (v >= 0 ? '+' : '') + f(v);
    if (!r) {
      if (c.status === 'ativa') return `<div class="card" style="margin-top:16px"><h3>Resultado da consultoria</h3><div class="note">Sai no encerramento: compara o raio-x do início com o mais recente e junta a avaliação do franqueado. Enquanto isso, acompanhe na aba Evolução.</div></div>`;
      return `<div class="card" style="margin-top:16px"><h3>Resultado da consultoria</h3><div class="note">Consultoria ${esc(c.status)} em ${dBR(c.encerrada_em)} sem resultado calculado (encerrada antes da v3).</div></div>`;
    }
    const notas = (avs || []).map(a => a.nota);
    const barras = [5, 4, 3, 2, 1].map(n => { const q = notas.filter(x => x === n).length; return `<div class="rec-row"><div>${'★'.repeat(n)}</div><div class="rec-bar"><i style="--w:${notas.length ? (100 * q / notas.length).toFixed(0) : 0}%;--c:${n >= 4 ? '#009150' : n === 3 ? '#FDAE25' : '#C0392B'}"></i></div><div class="qt">${q}</div></div>`; }).join('');
    return `<div class="card" id="resultado" style="margin-top:16px"><h3>Resultado da consultoria</h3><div class="note num">${dBR(c.inicio)} a ${dBR(c.encerrada_em)} · raio-x de ${mesBR(r.mes_base)} contra ${mesBR(r.mes_fim)} · calculado em ${dBR(r.calculado_em)}</div>
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:10px 0 14px"><span class="veredito" style="background:${cor(r.veredito)}">${esc(r.veredito.toUpperCase())}</span><span style="font-size:.9rem">Nota <b>${r.score_ini ?? '—'} → ${r.score_fim ?? '—'}</b>${r.d_score != null ? ' (' + fmtD(r.d_score, v => br(v, 0)) + ')' : ''}</span></div>
      <div class="kpi-grid num" style="margin-bottom:14px">
        <div class="kpi"><div class="lab">Lucro bruto/mês</div><div class="val">${fmtD(r.d_lucro_pct, v => br(v, 1) + '%')}</div></div>
        <div class="kpi"><div class="lab">Receita/mês</div><div class="val">${fmtD(r.d_receita_pct, v => br(v, 1) + '%')}</div></div>
        <div class="kpi"><div class="lab">Margem ajustada</div><div class="val">${fmtD(r.d_margem_pp, v => br(v, 1) + ' pp')}</div></div>
        <div class="kpi"><div class="lab">Receita identificada</div><div class="val">${fmtD(r.d_ident_pp, v => br(v, 1) + ' pp')}</div></div>
        <div class="kpi"><div class="lab">Ração em dia</div><div class="val">${fmtD(r.d_ret45_pp, v => br(v, 1) + ' pp')}</div></div>
        <div class="kpi"><div class="lab">Plano executado</div><div class="val">${br(r.tarefas_feitas)}/${br(r.tarefas)}</div><div class="delta neutro">${br(r.reunioes_feitas)}/${br(r.reunioes)} reuniões</div></div>
      </div>
      <p style="font-size:.86rem;line-height:1.6">${esc(r.texto)}</p>
      ${c.encerramento_obs ? `<div class="callout" style="margin-top:10px"><b>Observação do encerramento:</b> ${esc(c.encerramento_obs)}</div>` : ''}
      <div class="grid-2" style="margin-top:14px"><div><h3 style="font-size:.9rem">Como o franqueado avaliou</h3><div class="note">${notas.length ? br(notas.length) + ' semana(s) · média ' + br(r.avaliacao_media, 1) + '/5' : 'nenhuma avaliação registrada'}</div><div class="num">${barras}</div></div>
      <div><h3 style="font-size:.9rem">Regra do veredito</h3><div class="note">Positiva: nota +5 ou mais, ou lucro/mês +5% com nota não caindo. Negativa: nota −5 ou lucro −5%. Entre isso: não fez diferença. Só compara meses fechados diferentes.</div></div></div>
      <div class="print-note">Documento gerado pelo Raio-X POP · Central POP · Rede POP Pet Center</div></div>`;
  }

  /* ===== aba AVALIAÇÃO: o franqueado avalia a semana; a equipe responde ===== */
  function segundaDe(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function buildAvaliacaoTab() {
    const cc = window.__consultoria;
    const sec = document.createElement('section'); sec.id = 'avaliacao';
    const ROT = { melhorou: 'Melhorou', igual: 'Na mesma', piorou: 'Piorou' };
    const ROTC = { sim: 'Sim', mais_ou_menos: 'Mais ou menos', nao: 'Não' };
    const PISO = 21;   // dias sem avaliar que abrem uma avaliação avulsa
    const nomeDe = uid => (cc && cc.nomes && cc.nomes[uid]) || (PERFIL && PERFIL.id === uid ? PERFIL.nome : 'franqueado');
    if (!cc) {
      sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Avaliação da consultoria</h2></div><div class="card"><div class="callout">A avaliação começa quando a consultoria de faturamento é iniciada: a cada reunião realizada, você diz como foi.</div></div></div>`;
      rep.appendChild(sec); return;
    }
    const { c, avs, itens } = cc;
    const minhas = avs.filter(a => a.user_id === session.user.id);
    const jaAvaliadas = new Set(minhas.map(a => a.evento_id).filter(Boolean));
    const realizadas = itens.filter(i => i.tipo !== 'tarefa' && i.concluida && !/^Avalia/.test(i.titulo)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const pendentes = c.status === 'ativa' ? realizadas.filter(r => !jaAvaliadas.has(r.id)) : [];
    const ultimaMinha = minhas.map(a => a.semana).sort().pop() || null;
    const diasSem = diasEntre(ultimaMinha || c.inicio, hojeISO);
    const semanaAtual = segundaDe(hoje);
    const cabeAvulsa = c.status === 'ativa' && !pendentes.length && diasSem >= PISO && !minhas.some(a => !a.evento_id && a.semana === semanaAtual);
    // dá para corrigir a última avaliação enquanto ela não foi respondida
    const ultAv = minhas.slice().sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0];
    const editando = !!(EH_FRANQ && window.__avalEditar && ultAv && window.__avalEditar === ultAv.id && !ultAv.resposta);
    const alvoEv = editando ? (realizadas.find(r => r.id === ultAv.evento_id) || null) : (pendentes[0] || null);
    const temForm = EH_FRANQ && c.status === 'ativa' && (editando || pendentes.length > 0 || cabeAvulsa);
    window.__avalPendente = EH_FRANQ && c.status === 'ativa' && (pendentes.length > 0 || cabeAvulsa);
    const base = editando ? ultAv : null;

    const tituloEv = {}; itens.forEach(i => { tituloEv[i.id] = i.titulo; });
    const item = a => `<div class="av-item" data-av="${esc(a.id)}"><div class="top"><b style="color:var(--ink)">${a.evento_id ? 'Reunião de ' + dBR(a.semana) : 'Avaliação avulsa · semana de ' + dBR(a.semana)}</b><span style="color:var(--amarelo);font-size:1rem;letter-spacing:1px">${'★'.repeat(a.nota)}<span style="color:#D9E3DD">${'★'.repeat(5 - a.nota)}</span></span></div>
      <div class="sub">${a.evento_id && tituloEv[a.evento_id] ? esc(tituloEv[a.evento_id]) + ' · ' : ''}a loja ${ROT[a.andamento] ? ROT[a.andamento].toLowerCase() : esc(a.andamento)}${a.clareza ? ' · saiu sabendo o que fazer: ' + (ROTC[a.clareza] || a.clareza).toLowerCase() : ''} · ${esc(nomeDe(a.user_id))}</div>
      ${a.comentario ? `<p style="font-size:.86rem;margin-top:8px">${esc(a.comentario)}</p>` : ''}
      ${a.sugestao ? `<p style="font-size:.86rem;margin-top:6px"><b>Sugestão:</b> ${esc(a.sugestao)}</p>` : ''}
      ${a.resposta ? `<div class="resp"><b>Resposta${a.respondido_por ? ' de ' + esc(nomeDe(a.respondido_por)) : ''}${a.respondido_em ? ' · ' + dBR(a.respondido_em) : ''}:</b> ${esc(a.resposta)}</div>`
        : (EH_EQUIPE ? `<div style="margin-top:8px"><textarea class="resp-txt" placeholder="Responder ao franqueado…" style="min-height:60px"></textarea><button type="button" class="btn btn-pdf" data-resp="${esc(a.id)}" style="margin-top:6px">Responder</button></div>`
        : (EH_FRANQ && ultAv && a.id === ultAv.id ? `<div style="margin-top:6px"><button type="button" class="btn" data-editar="${esc(a.id)}" style="font-size:.78rem;padding:4px 10px">Corrigir esta avaliação</button></div>` : ''))}
    </div>`;

    const cabecalho = alvoEv
      ? `<h3>Como foi a reunião de ${dBR(alvoEv.data)}? <span class="note" style="display:inline">· ${esc(alvoEv.titulo)}</span></h3>`
      : `<h3>Como estão as últimas semanas? <span class="note" style="display:inline">· avaliação avulsa, ${br(diasSem)} dias sem avaliar</span></h3>`;
    const form = temForm ? `<div class="card form-av" id="formAv">${cabecalho}
      ${pendentes.length > 1 ? `<div class="callout" style="margin-bottom:10px">Faltam <b>${br(pendentes.length)}</b> reuniões para avaliar. Depois desta, a próxima aparece aqui.</div>` : ''}
      <label>Nota para ${alvoEv ? 'esta reunião' : 'este período'}</label><div class="estrelas" id="avEstrelas">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${base && n <= base.nota ? 'on' : ''}">★</button>`).join('')}</div>
      <label>A loja, desde o último contato</label><div class="opc" id="avAnd">${['melhorou', 'igual', 'piorou'].map(k => `<button type="button" data-k="${k}" class="${base && base.andamento === k ? 'on' : ''}">${ROT[k]}</button>`).join('')}</div>
      ${alvoEv ? `<label>Saiu da reunião sabendo o que fazer?</label><div class="opc" id="avClar">${['sim', 'mais_ou_menos', 'nao'].map(k => `<button type="button" data-k="${k}" class="${base && base.clareza === k ? 'on' : ''}">${ROTC[k]}</button>`).join('')}</div>` : ''}
      <label>O que aconteceu (opcional)</label><textarea id="avCom" placeholder="O que funcionou, o que travou, o que a equipe sentiu…">${base ? esc(base.comentario || '') : ''}</textarea>
      <label>Sugestão ou pedido de mudança (opcional)</label><textarea id="avSug" placeholder="Ex.: trocar a reunião para terça; mandar modelo de mensagem para a régua…">${base ? esc(base.sugestao || '') : ''}</textarea>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-pdf" id="avSalvar">${editando ? 'Salvar correção' : 'Enviar avaliação'}</button>${editando ? '<button type="button" class="btn" id="avCancelar">Cancelar</button>' : ''}<span class="note" id="avMsg" style="margin:0">Vai para o consultor e para o painel da franqueadora.</span></div></div>`
      : (EH_FRANQ && c.status === 'ativa'
        ? `<div class="card"><div class="callout">Nada para avaliar agora. A próxima avaliação abre quando o consultor marcar a próxima reunião como realizada${diasSem >= 0 ? ' — ou sozinha, se passarem ' + PISO + ' dias sem nenhuma' : ''}.</div></div>`
        : '');

    const naoAvaliadas = realizadas.filter(r => !avs.some(a => a.evento_id === r.id));
    const cobertura = EH_EQUIPE ? `<div class="card" style="margin-top:16px"><h3>Cobertura</h3>
      <div class="note">${br(realizadas.length - naoAvaliadas.length)} de ${br(realizadas.length)} reunião(ões) realizada(s) foram avaliadas${ultimaMinha || avs.length ? ' · último retorno há ' + br(diasEntre(avs.map(a => a.semana).sort().pop(), hojeISO)) + ' dia(s)' : ''}.</div>
      ${naoAvaliadas.length ? `<div class="note" style="margin-top:6px">Sem avaliação: ${naoAvaliadas.map(r => dBR(r.data)).join(' · ')}</div>` : ''}</div>` : '';

    sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Avaliação da consultoria</h2><span class="hint">${EH_FRANQ ? 'A cada reunião com o consultor, sua leitura de como foi — é o que mostra se a consultoria está fazendo diferença para você' : 'O que o franqueado respondeu depois de cada reunião'}</span></div>
      ${form}${cobertura}
      <div class="card" style="margin-top:16px"><h3>Histórico de avaliações</h3><div class="note">${avs.length ? br(avs.length) + ' avaliação(ões) · média ' + br(avs.reduce((x, a) => x + a.nota, 0) / avs.length, 1) + '/5' : 'Nenhuma avaliação ainda.'}</div>
        <div style="margin-top:10px">${avs.map(item).join('') || ''}</div></div></div>`;
    rep.appendChild(sec);

    // interação
    let nota = base ? base.nota : 0, andamento = base ? base.andamento : '', clareza = base ? base.clareza : '';
    sec.querySelectorAll('#avEstrelas button').forEach(b => b.onclick = () => { nota = +b.dataset.n; sec.querySelectorAll('#avEstrelas button').forEach(x => x.classList.toggle('on', +x.dataset.n <= nota)); });
    sec.querySelectorAll('#avAnd button').forEach(b => b.onclick = () => { andamento = b.dataset.k; sec.querySelectorAll('#avAnd button').forEach(x => x.classList.toggle('on', x === b)); });
    sec.querySelectorAll('#avClar button').forEach(b => b.onclick = () => { clareza = b.dataset.k; sec.querySelectorAll('#avClar button').forEach(x => x.classList.toggle('on', x === b)); });
    const recarregar = async () => {
      const { data: novas } = await sb.from('raiox_avaliacoes').select('*').eq('consultoria_id', c.id).order('semana', { ascending: false });
      cc.avs = novas || []; sec.remove(); buildAvaliacaoTab(); montarAbas(true);
      const s2 = document.getElementById('avaliacao'); if (s2) s2.scrollIntoView({ behavior: 'smooth' });
    };
    const bc = sec.querySelector('#avCancelar'); if (bc) bc.onclick = () => { window.__avalEditar = null; sec.remove(); buildAvaliacaoTab(); montarAbas(true); };
    sec.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { window.__avalEditar = b.dataset.editar; sec.remove(); buildAvaliacaoTab(); montarAbas(true); const s2 = document.getElementById('avaliacao'); if (s2) s2.scrollIntoView({ behavior: 'smooth' }); });
    const bs = sec.querySelector('#avSalvar');
    if (bs) bs.onclick = async () => {
      const msg = sec.querySelector('#avMsg');
      const falta = !nota || !andamento || (alvoEv && !clareza);
      if (falta) { msg.textContent = 'Escolha a nota, diga como a loja está e' + (alvoEv ? ' se saiu sabendo o que fazer.' : ' pronto.'); msg.style.color = 'var(--alerta)'; return; }
      bs.disabled = true;
      const comum = { nota, andamento, clareza: alvoEv ? clareza : null, comentario: sec.querySelector('#avCom').value.trim() || null, sugestao: sec.querySelector('#avSug').value.trim() || null };
      const { error } = editando
        ? await sb.from('raiox_avaliacoes').update(comum).eq('id', base.id)
        : await sb.from('raiox_avaliacoes').insert(Object.assign({ consultoria_id: c.id, fra: FRA, user_id: session.user.id, semana: alvoEv ? alvoEv.data : semanaAtual, evento_id: alvoEv ? alvoEv.id : null }, comum));
      if (error) { bs.disabled = false; msg.textContent = 'Não salvou: ' + error.message; msg.style.color = 'var(--alerta)'; return; }
      window.__avalEditar = null;
      await recarregar();
    };
    sec.querySelectorAll('[data-resp]').forEach(b => b.onclick = async () => {
      const box = b.closest('.av-item'), txt = box.querySelector('.resp-txt').value.trim(); if (!txt) return;
      b.disabled = true;
      const { data, error } = await sb.from('raiox_avaliacoes').update({ resposta: txt }).eq('id', b.dataset.resp).select('id');
      if (error || !data || !data.length) { b.disabled = false; alert(error ? error.message : 'Sem permissão para responder.'); return; }
      // a tarefa "Avaliação do franqueado" da agenda fecha junto
      await sb.from('agenda_eventos').update({ concluida: true, concluida_em: new Date().toISOString(), concluida_por: session.user.id }).eq('consultoria_id', c.id).is('cancelado_em', null).eq('concluida', false).ilike('titulo', 'Avalia%do franqueado%');
      await recarregar();
    });
  }

  /* ===== aba HISTÓRICO: linha do tempo da loja (raios-x, consultoria, plano, avaliações) ===== */
  function buildHistoricoTab() {
    const cc = window.__consultoria;
    const sec = document.createElement('section'); sec.id = 'historico';
    const ev = [];
    HIST.forEach(h => ev.push({ d: (h.calculado_em || '').slice(0, 10), cls: '', t: `Raio-x de ${mesBR(h.mes_ref)} calculado`, q: h.score == null ? 'sem nota' : 'nota ' + h.score + ' · receita ' + kmil(h.kpis.receita_mes) + '/mês · margem ' + pc(h.kpis.margem_adj) }));
    CONS.forEach(c => {
      ev.push({ d: c.inicio, cls: 'marco', t: 'Início da consultoria de faturamento', q: 'nota inicial ' + (c.score_inicial ?? '—') + (c.obs ? ' · ' + c.obs : '') });
      if (c.encerrada_em) ev.push({ d: c.encerrada_em.slice(0, 10), cls: 'marco', t: 'Consultoria ' + c.status + (c.resultado ? ' · resultado: ' + c.resultado.veredito : ''), q: c.resultado ? 'nota ' + (c.resultado.score_ini ?? '—') + ' → ' + (c.resultado.score_fim ?? '—') : '' });
    });
    if (cc) {
      cc.itens.forEach(i => { const v = i.tipo === 'tarefa' ? i.prazo : i.data; if (i.concluida) ev.push({ d: (i.concluida_em || v || '').slice(0, 10), cls: '', t: (i.tipo === 'tarefa' ? 'Tarefa feita: ' : 'Reunião realizada: ') + i.titulo, q: i.tipo === 'tarefa' ? 'prazo ' + dBR(v) : dBR(v) }); else if (v && v < hojeISO && !/^Avalia/.test(i.titulo)) ev.push({ d: v, cls: 'venc', t: (i.tipo === 'tarefa' ? 'Tarefa vencida: ' : 'Reunião sem confirmação: ') + i.titulo, q: 'vencida há ' + br(diasEntre(v, hojeISO)) + ' dia(s)' }); });
      cc.avs.forEach(a => ev.push({ d: a.semana, cls: 'av', t: 'Avaliação do franqueado: ' + a.nota + '/5 · ' + a.andamento, q: (a.comentario ? a.comentario.slice(0, 120) : '') + (a.resposta ? ' · respondida' : '') }));
    }
    ev.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    const porMes = {}; ev.forEach(e => { const k = String(e.d).slice(0, 7); (porMes[k] = porMes[k] || []).push(e); });
    const meses = Object.keys(porMes).sort().reverse();
    sec.innerHTML = `<div class="wrap"><div class="sec-head"><h2>Histórico da loja</h2><span class="hint">Tudo que aconteceu com esta loja no Raio-X: leituras mensais, consultoria, plano e avaliações — os mesmos itens ficam na agenda da franquia na Central</span></div>
      <div class="card">${meses.length ? meses.map(m => `<h3 style="margin:${m === meses[0] ? 0 : 18}px 0 8px">${mesBR(m)}</h3><div class="linha-tempo">${porMes[m].map(e => `<div class="lt-item ${e.cls}"><b>${esc(e.t)}</b><div class="q">${dBR(e.d)}${e.q ? ' · ' + esc(e.q) : ''}</div></div>`).join('')}</div>`).join('') : '<div class="callout">Nada registrado ainda.</div>'}</div></div>`;
    rep.appendChild(sec);
  }

  /* ===== abas: cada bloco do relatório vai para uma aba; cabeçalho e KPIs ficam sempre ===== */
  function montarAbas(manter) {
    const de = el => {
      if (el.id === 'evolucao') return 'evolucao';
      if (el.id === 'consultoria') return 'consultoria';
      if (el.id === 'planoCons' || el.id === 'tarefas') return 'tarefas';
      if (el.id === 'avaliacao') return 'avaliacao';
      if (el.id === 'historico') return 'historico';
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
      if (window.parent !== window) window.parent.postMessage({ raiox: 'abas', fra: FRA, atual: aba, badges: { tarefas: nAbertas, avaliacao: !!(EH_FRANQ && window.__avalPendente) } }, location.protocol === 'file:' ? '*' : location.origin);
    };
    window.__rxIr = ir;
    document.querySelectorAll('.abas .aba').forEach(b => b.onclick = () => ir(b.dataset.aba, true));
    const bA = $('abaAvalN'); if (bA) bA.style.display = (EH_FRANQ && window.__avalPendente) ? '' : 'none';
    ir(atual || (['diag', 'tarefas', 'clientes', 'estoque', 'evolucao', 'consultoria', 'avaliacao', 'historico'].includes(pedida) ? pedida : (EH_FRANQ && window.__avalPendente ? 'avaliacao' : 'diag')), false);
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
    // lista de resgate = nome + telefone de clientes: cada download fica registrado (quem, quando, quantas linhas)
    const bCli = $('btnCSV');
    if (bCli) bCli.addEventListener('click', () => { sb.from('raiox_exportacoes').insert({ user_id: session.user.id, fra: FRA, tipo: 'resgate_csv', linhas: (R.clientes || []).length }).then(() => {}); });
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
