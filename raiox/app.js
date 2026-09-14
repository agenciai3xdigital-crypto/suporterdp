/* Raio-X POP · app.js · v1.0 · 14/09/2026
   Lê as tabelas raiox_* da Central POP e a agenda; inicia a consultoria de faturamento. */
'use strict';
const SUPABASE_URL = 'https://klcxavgxonpsbsbzqcil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsY3hhdmd4b25wc2JzYnpxY2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzQwMDAsImV4cCI6MjA5OTExMDAwMH0.UJK09SljKG0tJqDcGYQfuk41i1SN8GymL1hTTeE2ruY';
const VERSAO = 'v1.2';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => 'R$ ' + br(Math.round(n || 0));
const kmil = n => n >= 995000 ? 'R$ ' + br(n / 1e6, 2) + ' mi' : n >= 1000 ? 'R$ ' + br(n / 1000, 1) + ' mil' : money(n);
const pc = (n, d = 1) => (n == null || !isFinite(n)) ? '—' : br(n, d) + '%';
const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const mesBR = ym => { const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return ym ? M[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4) : '—'; };
const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
function toast(t) { const el = $('toast'); el.textContent = t || 'salvo ✓'; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1400); }
function erro(e) { console.error(e); alert('Erro: ' + (e.message || e)); }

let sb, usuario, perfil, PERFIS = [], FRQ = [], SNAPS = {}, CONS = [], ESTQ = {}, FILA = new Set();
let rdFiltro = 'todas', lojaAtual = null, rdOrd = { k: 'score', asc: true };
const ehAdmin = () => !!(perfil && perfil.is_admin);
const nomeDe = uid => ((PERFIS.find(p => p.id === uid) || {}).nome || '—');
const primeiro = n => String(n || '').split(' ')[0];
const frqDe = fra => FRQ.find(f => f.fra === fra) || { fra, nome: 'FRA ' + fra };
const rotulo = fra => { const f = frqDe(fra); return 'FRA ' + fra + ' · ' + (f.nome || ''); };
// consultor da loja (texto do cadastro, ex. "JOAO") -> perfil da central
function perfilDoConsultor(txt) {
  const t = semAcento(txt); if (!t) return null;
  return PERFIS.find(p => semAcento(primeiro(p.nome_sults || p.nome)) === t.split(' ')[0]) || null;
}
const minhaCarteira = fra => { const p = perfilDoConsultor(frqDe(fra).consultor); return p && p.id === usuario.id; };

/* ================= login ================= */
async function iniciar() {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (session) await entrou(session);
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
}
async function entrou(session) {
  usuario = session.user;
  const { data: p } = await sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults').eq('id', usuario.id).maybeSingle();
  perfil = p || { nome: usuario.email, is_admin: false, papeis: [] };
  $('quem').textContent = perfil.nome + (perfil.is_admin ? ' · admin' : '') + ' · ' + VERSAO;
  $('login').style.display = 'none'; $('app').style.display = ''; $('btnSair').style.display = '';
  if (ehAdmin()) $('btnRecalcRede').style.display = '';
  try { await carregarTudo(); desenharRede(); desenharConsultorias(); desenharArquivos(); }
  catch (e) { erro(e); }
  const fraUrl = new URLSearchParams(location.search).get('fra');
  if (fraUrl) abrirLoja(+fraUrl);
}
$('loginForm').onsubmit = async ev => {
  ev.preventDefault(); const b = $('loginBtn'), er = $('loginErro'); b.disabled = true; er.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginSenha').value });
  b.disabled = false;
  if (error) { er.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha inválidos.' : error.message; return; }
  await entrou(data.session);
};
$('btnSair').onclick = async () => { await sb.auth.signOut(); };

/* ================= dados ================= */
async function fetchAll(builder, step = 1000) {
  let all = [], from = 0;
  while (true) { const { data, error } = await builder().range(from, from + step - 1); if (error) throw error; all = all.concat(data || []); if (!data || data.length < step) break; from += step; }
  return all;
}
async function carregarTudo() {
  const [pf, fq, sn, cs, es, fl] = await Promise.all([
    sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults,cor').order('criado_em'),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor,ativo').order('fra'),
    fetchAll(() => sb.from('raiox_snapshots_atual').select('fra,mes_ref,janela_meses,perfil,calculado_em,score,sem_nota_motivo,sub,kpis,tarefas').order('fra')),
    sb.from('raiox_consultorias').select('*').order('criado_em', { ascending: false }),
    fetchAll(() => sb.from('raiox_estoque').select('id,fra,tipo,arquivo,enviado_em,enviado_por,resumo').order('enviado_em', { ascending: false }).order('id')),
    sb.from('raiox_fila').select('fra').is('processado_em', null)
  ]);
  PERFIS = (pf.data || []).filter(p => !/robo\.raiox/i.test(p.nome || ''));
  FRQ = (fq.data || []);
  SNAPS = {}; (sn || []).forEach(s => { SNAPS[s.fra] = s; });   // a vista já traz só o mais recente por loja
  CONS = cs.data || [];
  ESTQ = {}; (es || []).forEach(e => { const k = e.fra + '|' + e.tipo; if (!ESTQ[k]) ESTQ[k] = e; });
  FILA = new Set((fl.data || []).map(f => f.fra));
}
async function recarregar(o) {
  if (o === 'cons') { const { data } = await sb.from('raiox_consultorias').select('*').order('criado_em', { ascending: false }); CONS = data || []; }
  if (o === 'estoque') { const es = await fetchAll(() => sb.from('raiox_estoque').select('id,fra,tipo,arquivo,enviado_em,enviado_por,resumo').order('enviado_em', { ascending: false }).order('id')); ESTQ = {}; es.forEach(e => { const k = e.fra + '|' + e.tipo; if (!ESTQ[k]) ESTQ[k] = e; }); }
}
function quartis() {
  const v = Object.values(SNAPS).filter(s => s.score != null).map(s => s.score).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { q1: q(.75), q2: q(.5), q3: q(.25), n: v.length, media: v.reduce((a, b) => a + b, 0) / v.length };
}
function classeScore(s, Q) {
  if (s == null) return 'sn';
  if (!Q) return 'q2';
  return s >= Q.q1 ? 'q1' : s >= Q.q2 ? 'q2' : s >= Q.q3 ? 'q3' : 'q4';
}
const consAtiva = fra => CONS.find(c => c.fra === fra && c.status === 'ativa');

/* ================= REDE ================= */
function desenharRede() {
  const Q = quartis();
  const snaps = Object.values(SNAPS);
  const lojasAtivas = FRQ.filter(f => f.ativo !== false && f.fra > 0);
  const comRaiox = snaps.length, semNota = snaps.filter(s => s.score == null).length;
  const defasadas = snaps.filter(s => (s.kpis.defasagem_meses || 0) >= 2).length;
  const semDado = lojasAtivas.filter(f => !SNAPS[f.fra]).length;
  const ativas = CONS.filter(c => c.status === 'ativa').length;
  $('rdResumo').innerHTML =
    `<div class="kpi"><div class="n">${comRaiox}</div><div class="l">Lojas com raio-x</div></div>`
    + `<div class="kpi${Q ? '' : ''}"><div class="n">${Q ? br(Q.media, 0) : '—'}</div><div class="l">Nota média da rede</div></div>`
    + `<div class="kpi${semNota ? ' alerta' : ''}"><div class="n">${semNota}</div><div class="l">Sem nota (custo sem cadastro)</div></div>`
    + `<div class="kpi${defasadas ? ' atencao' : ''}"><div class="n">${defasadas}</div><div class="l">Com dado defasado (2+ meses)</div></div>`
    + `<div class="kpi"><div class="n">${semDado}</div><div class="l">Aguardando carga</div></div>`
    + `<div class="kpi${ativas ? ' ok' : ''}"><div class="n">${ativas}</div><div class="l">Consultorias ativas</div></div>`;

  const PF = { todas: 'Todas', minha: 'Minha carteira', piores: 'Q4 (piores)', semnota: 'Sem nota', consult: 'Em consultoria', semraiox: 'Aguardando carga' };
  $('rdPills').innerHTML = Object.keys(PF).map(k => `<button class="pill${rdFiltro === k ? ' on' : ''}" data-f="${k}" type="button">${PF[k]}</button>`).join('');
  $('rdPills').querySelectorAll('.pill').forEach(b => b.onclick = () => { rdFiltro = b.dataset.f; desenharRede(); });
  const sc = $('rdCons'); if (sc.options.length <= 1) { const cs = [...new Set(FRQ.map(f => (f.consultor || '').trim()).filter(Boolean))].sort(); sc.innerHTML = '<option value="">Todos os consultores</option>' + cs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
  const su = $('rdUf'); if (su.options.length <= 1) { const ufs = [...new Set(FRQ.map(f => f.estado).filter(Boolean))].sort(); su.innerHTML = '<option value="">Todas as UFs</option>' + ufs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join(''); }
  const busca = ($('rdBusca').value || '').trim().toLowerCase(), cons = sc.value, uf = su.value;

  let lista = lojasAtivas.map(f => ({ f, s: SNAPS[f.fra] || null }));
  lista = lista.filter(({ f, s }) => {
    if (cons && (f.consultor || '').trim() !== cons) return false;
    if (uf && f.estado !== uf) return false;
    if (busca && !(('fra ' + f.fra + ' ' + f.nome + ' ' + (f.cidade || '')).toLowerCase().includes(busca))) return false;
    if (rdFiltro === 'minha') return minhaCarteira(f.fra);
    if (rdFiltro === 'piores') return s && s.score != null && classeScore(s.score, Q) === 'q4';
    if (rdFiltro === 'semnota') return s && s.score == null;
    if (rdFiltro === 'consult') return !!consAtiva(f.fra);
    if (rdFiltro === 'semraiox') return !s;
    return true;
  });
  const val = (x, k) => {
    if (k === 'fra') return x.f.fra;
    if (k === 'loja') return x.f.nome || '';
    if (!x.s) return null;
    if (k === 'score') return x.s.score;
    return x.s.kpis[k];
  };
  lista.sort((a, b) => { const va = val(a, rdOrd.k), vb = val(b, rdOrd.k); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return (va < vb ? -1 : va > vb ? 1 : 0) * (rdOrd.asc ? 1 : -1); });

  const th = (k, t, cls = '') => `<th class="${cls}" data-k="${k}">${t}${rdOrd.k === k ? (rdOrd.asc ? ' ▲' : ' ▼') : ''}</th>`;
  const mini = (v, inv) => { if (v == null) return '—'; const p = Math.max(0, Math.min(100, v)); const cls = inv ? (p > 20 ? 'r' : p > 5 ? 'm' : '') : (p < 50 ? 'r' : p < 75 ? 'm' : ''); return `<span class="mini ${cls}"><i style="width:${p}%"></i></span>${br(v, 0)}%`; };
  const tab = $('rdTab');
  if (!lista.length) { tab.innerHTML = '<tr><td><div class="vazio">Nenhuma loja com esses filtros.</div></td></tr>'; return; }
  tab.innerHTML = '<thead><tr>' + th('fra', 'FRA') + th('loja', 'Loja') + th('score', 'Nota', 'r') + th('ident_pct', 'Identificação') + th('cz_rec_pct', 'Sem custo') + th('ret45', 'Ração em dia') + th('vaz_total', 'Vazamento/mês', 'r') + th('tarefas_alta', 'Graves', 'r') + '<th>Situação</th></tr></thead><tbody>'
    + lista.map(({ f, s }) => {
      const c = consAtiva(f.fra);
      const situ = !s ? '<span class="st cinza">aguardando carga</span>'
        : [(s.kpis.defasagem_meses || 0) >= 2 ? `<span class="st lar" title="último mês com venda: ${mesBR(s.mes_ref)}">dado de ${mesBR(s.mes_ref)}</span>` : '',
          c ? `<span class="st roxo">consultoria desde ${dBR(c.inicio)}</span>` : '',
          FILA.has(f.fra) ? '<span class="st cinza">↻ na fila</span>' : ''].filter(Boolean).join(' ');
      return `<tr data-fra="${f.fra}"><td class="num">${f.fra}</td><td><div class="t">${esc(f.nome)}</div><div class="s">${esc((f.cidade || '') + (f.estado ? '/' + f.estado : ''))}${f.consultor ? ' · ' + esc(f.consultor) : ''}</div></td>`
        + `<td class="r">${s ? (s.score == null ? '<span class="score sn" title="' + esc(s.sem_nota_motivo || '') + '">sem nota</span>' : `<span class="score ${classeScore(s.score, Q)}">${s.score}</span>`) : '—'}</td>`
        + `<td>${s ? mini(s.kpis.ident_pct) : '—'}</td><td>${s ? mini(s.kpis.cz_rec_pct, true) : '—'}</td><td>${s ? mini(s.kpis.ret45) : '—'}</td>`
        + `<td class="r num">${s ? kmil(s.kpis.vaz_total) : '—'}</td><td class="r num">${s ? (s.kpis.tarefas_alta || 0) : '—'}</td><td>${situ}</td></tr>`;
    }).join('') + '</tbody>';
  tab.querySelectorAll('th[data-k]').forEach(t => t.onclick = () => { const k = t.dataset.k; rdOrd = { k, asc: rdOrd.k === k ? !rdOrd.asc : (k === 'score' || k === 'fra' || k === 'loja' || k === 'ident_pct' || k === 'ret45') }; desenharRede(); });
  tab.querySelectorAll('tr[data-fra]').forEach(tr => tr.onclick = () => abrirLoja(+tr.dataset.fra));
}
['rdCons', 'rdUf'].forEach(id => $(id).onchange = desenharRede);
$('rdBusca').addEventListener('input', () => { clearTimeout(window._b); window._b = setTimeout(desenharRede, 180); });
$('btnRecalcRede').onclick = async () => {
  if (!confirm('Pedir o recálculo de todas as lojas? A rotina atende na próxima rodada (a cada 2 horas).')) return;
  const fras = Object.keys(SNAPS).map(Number).filter(f => !FILA.has(f));
  if (!fras.length) { toast('já está tudo na fila'); return; }
  const { error } = await sb.from('raiox_fila').insert(fras.map(fra => ({ fra, pedido_por: usuario.id })));
  if (error) return erro(error);
  fras.forEach(f => FILA.add(f)); toast(fras.length + ' loja(s) na fila'); desenharRede();
};

/* ================= LOJA ================= */
async function abrirLoja(fra) {
  lojaAtual = fra;
  document.querySelectorAll('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.v === 'loja'));
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('ativa', v.id === 'v-loja'));
  $('abaLoja').textContent = 'FRA ' + fra;
  history.replaceState(null, '', '?fra=' + fra);
  const box = $('ljConteudo');
  const s = SNAPS[fra], f = frqDe(fra);
  if (!s) { box.innerHTML = cabecaLoja(f, null) + '<div class="vazio">Esta loja ainda não tem raio-x: o banco de compras não recebeu o BI de vendas dela. Depois da carga, a rotina noturna calcula sozinha.</div>'; return; }
  box.innerHTML = cabecaLoja(f, s) + '<div class="vazio">Carregando a ficha…</div>';
  const [{ data: full, error }, { data: resg }] = await Promise.all([
    sb.from('raiox_snapshots').select('dados').eq('fra', fra).eq('mes_ref', s.mes_ref).single(),
    sb.from('raiox_resgate').select('*').eq('fra', fra).eq('mes_ref', s.mes_ref).order('gasto_mes', { ascending: false })
  ]);
  if (error) return erro(error);
  const R = full.dados;
  box.innerHTML = cabecaLoja(f, s) + fichaHTML(f, s, R, resg || []);
  ligarFicha(f, s, R, resg || []);
}
function cabecaLoja(f, s) {
  const Q = quartis(); const c = consAtiva(f.fra); const pc_ = perfilDoConsultor(f.consultor);
  const podeIniciar = !c && (ehAdmin() || (perfil.papeis || []).includes('consultor'));
  return `<div class="painel"><div class="ficha-topo">
    <div class="big">${s ? (s.score == null ? '<span style="font-size:22px;color:var(--tinta-suave)">sem nota</span>' : `<span class="score ${classeScore(s.score, Q)}" style="font-size:44px;height:auto;padding:6px 14px">${s.score}</span>`) : '—'}<small>nota · ${s ? mesBR(s.kpis.mes_ini) + ' a ' + mesBR(s.mes_ref) : 'sem raio-x'}</small></div>
    <div style="flex:1;min-width:240px">
      <h2 style="font-family:'Archivo';font-size:20px;line-height:1.2">${esc(f.nome || 'FRA ' + f.fra)}</h2>
      <div style="font-size:13px;color:var(--tinta-suave)">FRA ${f.fra} · ${esc((f.cidade || '') + (f.estado ? '/' + f.estado : ''))}${f.consultor ? ' · consultor ' + esc(f.consultor) + (pc_ ? '' : ' <span class="st lar" title="não existe perfil com esse nome na Central">sem login</span>') : ''}</div>
      ${s && s.sem_nota_motivo ? `<div style="margin-top:8px;font-size:13px;color:var(--verm)">⚠ ${esc(s.sem_nota_motivo)}</div>` : ''}
      ${s && (s.kpis.defasagem_meses || 0) >= 2 ? `<div style="margin-top:6px;font-size:13px;color:#a34608">⚠ Última venda carregada em ${mesBR(s.mes_ref)} — carregar o BI mais recente antes de usar estes números.</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        ${c ? `<span class="st roxo" style="align-self:center">consultoria ativa desde ${dBR(c.inicio)} · ${esc(primeiro(nomeDe(c.consultor_id)))}</span>` : (podeIniciar && s ? '<button class="btn laranja" id="btnIniciarCons">▶ Iniciar consultoria de faturamento</button>' : '')}
        ${s ? `<button class="btn claro" id="btnRecalc"${FILA.has(f.fra) ? ' disabled' : ''}>${FILA.has(f.fra) ? '↻ na fila' : '↻ Recalcular'}</button>` : ''}
        ${s ? '<button class="btn claro" id="btnImprimir">🖨 Imprimir / PDF</button>' : ''}
      </div>
    </div>
    ${s && s.sub ? `<div class="subs">${[['receita', 'Crescimento'], ['margem', 'Margem'], ['mix', 'Serviços'], ['ret', 'Retenção'], ['dado', 'Dado']].map(([k, t]) => `<div class="sub"><b>${br(s.sub[k], 1)}</b><span>${t} · de 10</span><div class="bar"><i style="width:${Math.round(s.sub[k] * 10)}%"></i></div></div>`).join('')}</div>` : ''}
  </div></div>`;
}
const TXT_TAREFA = {
  custoZero: d => `Cadastrar custo nos produtos sem custo — ${pc(d.pct)} da receita de produto (${kmil(d.valor)}) está sem custo cadastrado`,
  identificacao: d => `Cadastrar cliente em toda venda — só ${pc(d.identPct)} da receita está identificada`,
  ruptura: d => `Repor ${br(d.n)} produtos zerados da curva A (${kmil(d.valor)} vendidos no período)`,
  farmacia: d => `Recuperar a farmácia — caiu de ${kmil(d.peak)} para ${kmil(d.last)}/mês`,
  churn: d => `Rodar a régua de resgate em ${br(d.n)} clientes de ração (meta: ${br(d.resgateAlvo)} de volta)`,
  bt: d => `Oferecer pacote de banho e tosa a ${br(d.n)} clientes avulsos (pacote de ${money(d.valorPacote)})`,
  balcao: d => d.vendedor ? `Investigar margem de ${esc(d.vendedor)}: ${pc(d.margemVend, 0)} contra ${pc(d.margemOutros, 0)} dos demais` : 'Investigar diferença de margem entre vendedores',
  filialMista: d => `Arquivos misturam ${br(d.lista.length)} filiais — conferir antes de confiar nos números`,
  estoqueParado: d => `Negociar ${br(d.n)} produtos parados (${kmil(d.valor)} de capital empatado)`,
  canal: d => `Ativar o campo Canal de venda — só ${pc(d.pct, 0)} das vendas registram origem`,
  bairro: d => `Completar bairro no cadastro — só ${pc(d.pct, 0)} têm`,
  avaliacao: d => `Ativar avaliação pós banho e tosa (${pc(d.pct, 0)} hoje)`,
  opBT: d => `Registrar entrada/saída do banho e tosa (${pc(d.pct, 0)} hoje)`,
  vet: () => 'Corrigir o campo Veterinário — parece registrar quem passou no caixa',
  felinos: d => `Abrir frente de felinos — só ${pc(d.pct, 0)} da receita identificada`,
  granel: d => `Recontar a balança: ${br(d.n)} de ${br(d.total)} itens a granel com estoque negativo`,
  recompraParado: d => `Rever compra de ${br(d.n)} produto(s) já parado(s)`,
  custoSubindo: d => `Renegociar ${br(d.n)} produto(s) com custo em alta — pior: ${esc(d.pior.produto)} (${pc(d.pior.variacao, 0)})`,
  precoAbaixoCusto: d => `Corrigir preço de ${br(d.n)} produto(s) abaixo do custo (${money(d.valor)} de prejuízo potencial)`,
  filialEstoqueDivergente: d => `Conferir a filial do relatório de estoque ("${esc(d.filialArquivo)}")`
};
const txtTarefa = t => { try { return TXT_TAREFA[t.chave] ? TXT_TAREFA[t.chave](t.dados || {}) : esc(t.chave); } catch (_) { return esc(t.chave); } };
const sevOk = s => ['alta', 'media', 'baixa'].includes(s) ? s : 'baixa';

function fichaHTML(f, s, R, resg) {
  const k = s.kpis;
  const serie = R.mensal || [];
  const maxR = Math.max(...serie.map(m => m.receita), 1);
  const CORES = ['#00573F', '#009150', '#A8D3C4', '#FF6B15', '#FDAE25', '#5B4A9E', '#E67E22', '#8A5A00', '#C0392B', '#5A7268'];
  const mix = (R.mix9 || []);
  const bandas = R.buckets || {}, geral = R.bucketsGeral || {};
  const est = { par: ESTQ[f.fra + '|estoqueparado'], atu: ESTQ[f.fra + '|estoqueatual'], abc: ESTQ[f.fra + '|abcprod'] };
  let h = '';
  // 1 · números do período
  h += `<div class="painel"><h3>Números do período <small>${mesBR(k.mes_ini)} a ${mesBR(s.mes_ref)} · ${k.meses} meses · ${br(k.linhas)} linhas de venda · calculado ${dBR(s.calculado_em)}</small></h3>
    <div class="resumo">
      <div class="kpi"><div class="n">${kmil(k.receita_mes)}</div><div class="l">Receita média / mês</div></div>
      <div class="kpi"><div class="n">${kmil(k.lucro_mes)}</div><div class="l">Lucro bruto / mês</div></div>
      <div class="kpi"><div class="n">${pc(k.margem_adj)}</div><div class="l">Margem ajustada <span title="reportada: ${pc(k.margem_rep)} — inflada pelas linhas sem custo">(rep. ${pc(k.margem_rep, 0)})</span></div></div>
      <div class="kpi"><div class="n">${money(k.ticket)}</div><div class="l">Ticket médio · ${br(k.cupons_mes, 0)} cupons/mês</div></div>
      <div class="kpi${k.ident_pct < 60 ? ' alerta' : ''}"><div class="n">${pc(k.ident_pct, 0)}</div><div class="l">Receita identificada</div></div>
      <div class="kpi${k.cz_rec_pct > 5 ? ' alerta' : ''}"><div class="n">${pc(k.cz_rec_pct)}</div><div class="l">Receita de produto sem custo</div></div>
    </div>
    <div class="serie">${serie.map((m, i) => `<div class="col${i === serie.length - 1 ? ' ref' : ''}" title="${m.label}: receita ${money(m.receita)} · lucro ${money(m.lucro)} · ${br(m.cupons)} cupons"><div class="b" style="height:${Math.max(3, 100 * m.receita / maxR)}px"><i style="height:${Math.max(0, 100 * (m.lucro / Math.max(m.receita, 1)))}%"></i></div><div class="l">${m.label.slice(0, 3)}</div></div>`).join('')}</div>
    <div class="leg" style="margin-top:6px"><span><i style="background:var(--verde-claro)"></i>receita</span><span><i style="background:var(--verde)"></i>lucro (proporção)</span></div></div>`;
  // 2 · vazamentos + metas
  h += `<div class="grid2"><div class="painel"><h3>Vazamentos <small>R$ por mês, calculados dos dados da loja</small></h3>
    <div class="lin"><span>Farmácia abaixo do pico</span><b>${money(R.v1)}</b></div>
    <div class="lin"><span>Clientes de ração inativos (${br(R.inativos)} × ${money(R.gastoMensalHist)} × 15%)</span><b>${money(R.v2)}</b></div>
    <div class="lin"><span>Banho avulso sem pacote (${br(R.metaPacotes)} clientes)</span><b>${money(R.v3)}</b></div>
    <div class="lin"><span>Margem no balcão (vendedor abaixo dos demais)</span><b>${money(R.v4)}</b></div>
    <div class="lin" style="font-weight:800"><span>Total recuperável</span><b>${money(R.vazTotal)}/mês</b></div></div>
    <div class="painel"><h3>Metas <small>derivadas do histórico da própria loja</small></h3>
    <div class="lin"><span>Receita · piso</span><b>${money(R.metas.receita.piso)}</b></div>
    <div class="lin"><span>Receita · meta</span><b>${money(R.metas.receita.meta)}</b></div>
    <div class="lin"><span>Receita · ouro</span><b>${money(R.metas.receita.ouro)}</b></div>
    <div class="lin"><span>Lucro · meta</span><b>${money(R.metas.lucro.meta)}</b></div>
    <div class="lin"><span>Cupons · meta</span><b>${br(R.metas.cupons.meta, 0)}/mês</b></div>
    <div class="lin"><span>Resgatar clientes de ração</span><b>${br(R.metas.resgateAlvo)}</b></div>
    <div class="lin"><span>Pacotes de B&T em 30 dias</span><b>${br(R.metas.btAlvo30)} de ${br(R.metas.btAlvoTotal)}</b></div></div></div>`;
  // 3 · plano de acao
  h += `<div class="painel"><h3>Plano de ação sugerido <small>${R.tarefas.length} item(ns) · ordem de gravidade</small></h3>` +
    (R.tarefas.length ? R.tarefas.map(t => `<div class="tarefa"><span class="tag ${sevOk(t.sev)}" style="align-self:flex-start;margin-top:2px">${sevOk(t.sev)}</span><div class="tx"><b>${txtTarefa(t)}</b></div></div>`).join('') : '<div class="vazio">Nenhum alerta. Os indicadores estão dentro do esperado.</div>') + '</div>';
  // 4 · mix + clientes
  h += `<div class="grid2"><div class="painel"><h3>Mix por grupo <small>serviços: ${pc(R.servShare)} da receita</small></h3>
    <div class="mix">${mix.map((g, i) => `<i style="width:${g.share}%;background:${CORES[i % CORES.length]}" title="${esc(g.grupo)} ${pc(g.share)} · margem ${pc(g.margem, 0)}"></i>`).join('')}</div>
    <div class="leg">${mix.map((g, i) => `<span><i style="background:${CORES[i % CORES.length]}"></i>${esc(g.grupo)} ${pc(g.share, 0)} · mg ${pc(g.margem, 0)}</span>`).join('')}</div>
    ${R.piorGrupoNeg ? `<div class="lin" style="margin-top:8px"><span>Grupo com mais prejuízo em linhas</span><b>${esc(R.piorGrupoNeg[0])} · ${money(R.piorGrupoNeg[1])}</b></div>` : ''}
    <div class="lin"><span>Delivery</span><b>${pc(R.entrega.share)} da receita · ticket ${money(R.entrega.ticket)} (${R.entrega.premio >= 0 ? '+' : ''}${pc(R.entrega.premio, 0)} vs loja)</b></div>
    <div class="lin"><span>Itens com desconto</span><b>${pc(R.descItens)} · ${money(R.descRS)} no período</b></div></div>
    <div class="painel"><h3>Clientes <small>${br(R.cliTot)} identificados · ${br(R.ativosUlt)} ativos no último mês</small></h3>
    <div class="lin"><span>Ciclo de recompra de ração</span><b>${R.ciclo ? R.ciclo + ' dias' : '—'}</b></div>
    <div class="lin"><span>Carteira de ração em dia (≤45 d)</span><b>${pc(k.ret45, 0)} de ${br(R.cliRac)}</b></div>
    <div class="lin"><span>Ração · resgatar / urgente / reativar</span><b>${br(bandas['46-60'])} / ${br(bandas['61-90'])} / ${br(bandas['90+'])}</b></div>
    <div class="lin"><span>Geral · 90+ dias sem comprar</span><b>${br(geral['90+'])}</b></div>
    <div class="lin"><span>Sem telefone no cadastro</span><b>${br(R.semTel)}</b></div>
    <div class="lin"><span>Banho e tosa · clientes / com produto</span><b>${br(R.btCli)} / ${pc(R.crossBT, 0)}</b></div>
    <div class="lin"><span>Gasto médio: cliente de B&T × sem B&T</span><b>${money(R.gastoBT)} × ${money(R.gastoN)}</b></div></div></div>`;
  // 5 · equipe + horario
  const vend = (R.vend || []).slice(0, 8);
  h += `<div class="grid2"><div class="painel"><h3>Vendedores <small>com ≥10% dos cupons</small></h3>${vend.length ? `<table class="lista"><tr><th>Nome</th><th class="r">Receita</th><th class="r">Ticket</th><th class="r">Margem</th><th class="r">Desc.</th></tr>${vend.map(v => `<tr><td>${esc(v.nome)}</td><td class="r">${kmil(v.rec)}</td><td class="r">${money(v.ticket)}</td><td class="r">${pc(v.margem, 0)}</td><td class="r">${pc(v.descPct, 0)}</td></tr>`).join('')}</table>` : '<div class="vazio">Sem vendedor registrado.</div>'}</div>
    <div class="painel"><h3>Horário de pico <small>${R.horaSemana ? 'cupons por hora · cobertura ' + pc(R.horaSemana.cobertura, 0) : 'sem hora de pagamento nesta carga'}</small></h3>
    ${R.horaSemana ? `<div class="hora">${R.horaSemana.horaCount.map(c => `<div style="height:${Math.max(2, 100 * c / Math.max(...R.horaSemana.horaCount, 1))}%" title="${c} cupons"></div>`).join('')}</div><div class="hora-l">${R.horaSemana.horas.map(x => `<span>${x}</span>`).join('')}</div>
    <div class="lin" style="margin-top:8px"><span>Dias</span><b>${R.horaSemana.dias.map((d, i) => d + ' ' + br(R.horaSemana.diaCount[i])).join(' · ')}</b></div>` : '<div class="vazio">A hora do pagamento entra com a carga nova do BI (v6.24 do painel).</div>'}</div></div>`;
  // 6 · governanca + compras
  const g = R.governanca || {};
  h += `<div class="grid2"><div class="painel"><h3>Governança do cadastro</h3>
    <div class="lin"><span>Canal de venda preenchido</span><b>${pc(g.canalPct, 0)}</b></div>
    <div class="lin"><span>Bairro preenchido</span><b>${pc(g.bairroPct, 0)}</b></div>
    <div class="lin"><span>Avaliação do banho</span><b>${g.avalPct == null ? 'não medido pelo BI' : pc(g.avalPct, 0)}</b></div>
    <div class="lin"><span>Operador do B&T</span><b>${g.opBTPct == null ? 'não medido pelo BI' : pc(g.opBTPct, 0)}</b></div>
    <div class="lin"><span>Veterinário</span><b>${g.temVet ? pc(g.vetPct, 0) + (g.vetSuspeito ? ' · suspeito' : '') : 'sem consultório'}</b></div></div>
    <div class="painel"><h3>Compras <small>${R.compras ? 'relatório de entradas · ' + dBR(R.compras.periodoIni) + ' a ' + dBR(R.compras.periodoFim) : 'sem entradas no período'}</small></h3>
    ${R.compras ? `<div class="lin"><span>Total comprado</span><b>${kmil(R.compras.totalComprado)}</b></div><div class="lin"><span>Fornecedores · top 3</span><b>${br(R.compras.nFornecedores)} · ${pc(R.compras.top3Share, 0)}</b></div>
    ${(R.compras.porFornecedor || []).slice(0, 5).map(x => `<div class="lin"><span>${esc(x.nome)}</span><b>${pc(x.share, 0)}</b></div>`).join('')}
    ${(R.compras.custoSubindo || []).length ? `<div class="lin"><span>Custo subindo &gt;15%</span><b>${br(R.compras.custoSubindo.length)} item(ns)</b></div>` : ''}` : '<div class="vazio">Sem relatório de entradas carregado para esta loja.</div>'}</div></div>`;
  // 7 · estoque (uploads)
  h += `<div class="painel"><h3>Estoque e ruptura <small>dos arquivos enviados na aba Arquivos</small></h3>` + resumoEstoqueHTML(est) + '</div>';
  // 8 · resgate
  h += `<div class="painel"><h3>Lista de resgate <small>${br(resg.length)} clientes inativos com maior gasto · código do One Pet + telefone, sem nome</small>
    <span style="flex:1"></span><div class="pills" id="rgPills"><button class="pill on" data-b="" type="button">Todos</button><button class="pill" data-b="46-60" type="button">Resgatar 46–60</button><button class="pill" data-b="61-90" type="button">Urgente 61–90</button><button class="pill" data-b="90+" type="button">Reativar 90+</button><button class="pill" data-b="racao" type="button">Só ração</button></div>
    <button class="btn claro" id="btnResgCSV" type="button">⬇ CSV para a loja</button></h3>
    <div class="tw" id="rgBox"></div></div>`;
  return h;
}
function resumoEstoqueHTML(est) {
  let h = '';
  if (est.par) { const r = est.par.resumo; h += `<div class="lin"><span>Estoque parado (${dBR(est.par.enviado_em)}) · ${br(r.nCritico || 0)} críticos, ${br(r.nMuitoLento || 0)} muito lentos</span><b>${kmil(r.totalParadoValor || 0)} empatados</b></div>`; }
  if (est.abc) { const r = est.abc.resumo; h += `<div class="lin"><span>Ruptura classe A (${dBR(est.abc.enviado_em)}) · ${br(r.nZer || 0)} de ${br(r.totalA || 0)} zerados${r.nNeg ? ', ' + br(r.nNeg) + ' negativos' : ''}</span><b>${kmil(r.valZer || 0)} vendidos</b></div>`; }
  if (est.atu) { const r = est.atu.resumo; h += `<div class="lin"><span>Posição de estoque (${dBR(est.atu.enviado_em)}) · ${br(r.nItens || 0)} itens${r.nAbaixoCusto ? ' · ' + br(r.nAbaixoCusto) + ' abaixo do custo' : ''}</span><b>${kmil(r.valorEstoque || 0)}</b></div>`; }
  return h || '<div class="vazio">Nenhum arquivo de estoque enviado para esta loja. Use a aba Arquivos de estoque.</div>';
}
function ligarFicha(f, s, R, resg) {
  let banda = '';
  const desenharResg = () => {
    const lista = resg.filter(c => banda === '' ? true : banda === 'racao' ? c.racao : c.banda === banda);
    $('rgBox').innerHTML = lista.length ? `<table class="lista"><tr><th>Código</th><th>Telefone</th><th class="r">Dias</th><th>Faixa</th><th class="r">Compras</th><th class="r">Gasto/mês</th><th>Ração</th><th>B&T</th><th>Última</th></tr>` +
      lista.slice(0, 150).map(c => `<tr><td class="num">${esc(c.cliente_cod)}</td><td class="num">${esc(c.telefone || '—')}</td><td class="r num">${c.dias}</td><td><span class="banda b${c.banda.replace('+', '').slice(0, 2)}">${c.banda}</span></td><td class="r">${c.compras}</td><td class="r">${money(c.gasto_mes)}</td><td>${c.racao ? '●' : ''}</td><td>${c.bt ? '●' : ''}</td><td>${dBR(c.ultima)}</td></tr>`).join('') + '</table>' + (lista.length > 150 ? `<p class="aviso">Mostrando 150 de ${lista.length}. O CSV leva todos.</p>` : '') : '<div class="vazio">Ninguém nessa faixa.</div>';
  };
  $('rgPills').querySelectorAll('.pill').forEach(b => b.onclick = () => { banda = b.dataset.b; $('rgPills').querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b)); desenharResg(); });
  desenharResg();
  $('btnResgCSV').onclick = () => {
    const linhas = ['codigo_cliente;telefone;dias_sem_comprar;faixa;compras;gasto_total;gasto_mes;racao;banho_tosa;ultima_compra'];
    const seg = v => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
    resg.forEach(c => linhas.push([seg(c.cliente_cod), seg(c.telefone), c.dias, c.banda, c.compras, String(c.gasto).replace('.', ','), String(c.gasto_mes).replace('.', ','), c.racao ? 'sim' : '', c.bt ? 'sim' : '', dBR(c.ultima)].join(';')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = `resgate_FR${f.fra}_${s.mes_ref}.csv`; a.click();
  };
  const bi = $('btnIniciarCons'); if (bi) bi.onclick = () => abrirModalConsultoria(f, s, R);
  const br_ = $('btnRecalc'); if (br_) br_.onclick = async () => { const { error } = await sb.from('raiox_fila').insert({ fra: f.fra, pedido_por: usuario.id }); if (error) return erro(error); FILA.add(f.fra); br_.disabled = true; br_.textContent = '↻ na fila'; toast('pedido registrado — a rotina atende em até 2 h'); };
  const bp = $('btnImprimir'); if (bp) bp.onclick = () => window.print();
  // ao trocar de loja, a aba "Loja" volta ao topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= CONSULTORIA ================= */
function abrirModalConsultoria(f, s, R) {
  const consultores = PERFIS.filter(p => p.is_admin || (p.papeis || []).includes('consultor'));
  const sugerido = perfilDoConsultor(f.consultor) || perfil;
  const keys = new Set(R.tarefas.map(t => t.chave));
  $('mBox').innerHTML = `<h3>▶ Iniciar consultoria de faturamento</h3>
    <p style="font-size:13px;color:var(--tinta-suave)">${esc(f.nome)} · nota ${s.score == null ? 'sem nota' : s.score} · ${R.tarefas.length} achado(s). O plano de 90 dias nasce na agenda: 8 reuniões de alinhamento (abertura, quinzenais e fechamento) e as tarefas ligadas aos achados desta loja, espaçadas por gravidade.</p>
    <div class="form">
      <label>Consultor responsável</label><select id="csCons"${ehAdmin() ? '' : ' disabled'}>${consultores.map(p => `<option value="${p.id}"${p.id === (ehAdmin() ? sugerido.id : usuario.id) ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <label>Início</label><input type="date" id="csInicio" value="${hojeISO()}">
      <label>Horário padrão das reuniões</label><select id="csHora"><option value="10:00">10:00–11:00</option><option value="09:00">09:00–10:00</option><option value="14:00">14:00–15:00</option><option value="16:00">16:00–17:00</option></select>
      <label>Observação (opcional)</label><textarea id="csObs" placeholder="Ex.: franqueado pediu foco em banho e tosa"></textarea>
    </div>
    <div id="csPrev" style="margin-top:12px;font-size:12.5px;color:var(--tinta-suave)"></div>
    <div class="acoes"><button class="btn claro" id="mFechar" type="button">Cancelar</button><button class="btn laranja" id="csOk" type="button" disabled>Criar consultoria e plano</button></div>`;
  $('mBg').classList.add('on');
  $('mFechar').onclick = fecharModal;
  const prev = async () => {
    const { data: modelo } = await sb.from('raiox_plano_modelo').select('*').eq('ativo', true).order('ordem');
    const itens = (modelo || []).filter(m => !m.chave || keys.has(m.chave));
    const nR = itens.filter(m => m.tipo === 'reuniao').length, nT = itens.length - nR;
    $('csPrev').innerHTML = `Vai criar <b>${nR} reuniões</b> e <b>${nT} tarefas</b> na agenda de ${esc(nomeDe($('csCons').value))}, de ${dBR($('csInicio').value)} a ${dBR(addDias($('csInicio').value, 90))}. Só admin edita ou cancela depois.`;
    $('csOk').onclick = () => criarConsultoria(f, s, R, itens); $('csOk').disabled = false;
  };
  $('csCons').onchange = prev; $('csInicio').onchange = prev; prev();
}
function fecharModal() { $('mBg').classList.remove('on'); }
$('mBg').onclick = ev => { if (ev.target === $('mBg')) fecharModal(); };
function diaUtil(iso) { const d = new Date(iso + 'T12:00:00'); const w = d.getDay(); if (w === 6) d.setDate(d.getDate() + 2); if (w === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
const unesc = h => { const t = document.createElement('textarea'); t.innerHTML = String(h || '').replace(/<[^>]+>/g, ''); return t.value; };
function detalheAchado(R, chave) { const t = R.tarefas.find(x => x.chave === chave); return t ? unesc(txtTarefa(t)) : ''; }
async function criarConsultoria(f, s, R, itens) {
  const consultor = ehAdmin() ? $('csCons').value : usuario.id, inicio = $('csInicio').value, hora = $('csHora').value, obs = $('csObs').value.trim();
  if (!inicio) return alert('Defina a data de início.');
  $('csOk').disabled = true;
  try {
    // agenda do consultor no período, para não sobrepor reunião
    const { data: ocup } = await sb.from('agenda_eventos').select('data,ini,fim').eq('user_id', consultor).neq('tipo', 'tarefa').gte('data', inicio).lte('data', addDias(inicio, 95));
    const ocupado = new Set((ocup || []).map(o => o.data + '|' + String(o.ini).slice(0, 5)));
    const horas = [hora, '14:00', '16:00', '09:00', '11:00', '15:00'].filter((v, i, a) => a.indexOf(v) === i);
    const linhas = itens.map(m => {
      const dia = diaUtil(addDias(inicio, m.dia));
      const det = m.chave ? detalheAchado(R, m.chave) : '';
      const descricao = (m.descricao || '') + (det ? '\n\nRaio-X ' + mesBR(s.mes_ref) + ': ' + det : '') + '\n\nConsultoria de faturamento · ' + rotulo(f.fra);
      if (m.tipo === 'reuniao') {
        let h0 = horas.find(hh => !ocupado.has(dia + '|' + hh)) || hora; ocupado.add(dia + '|' + h0);
        const h1 = String(+h0.slice(0, 2) + 1).padStart(2, '0') + ':' + h0.slice(3);
        return { titulo: m.titulo, data: dia, ini: h0, fim: h1, tipo: 'compromisso', descricao };
      }
      return { titulo: m.titulo, data: inicio, tipo: 'tarefa', descricao, prazo: dia };
    });
    // uma transação no servidor: consultoria + itens da agenda, ou nada
    const { error: e2 } = await sb.rpc('raiox_iniciar_consultoria', { p_fra: f.fra, p_consultor: consultor, p_inicio: inicio, p_obs: obs, p_score_inicial: s.score, p_mes_ref: s.mes_ref, p_itens: linhas });
    if (e2) throw e2;
    fecharModal(); toast('consultoria criada: ' + linhas.length + ' itens na agenda');
    await recarregar('cons'); desenharRede(); desenharConsultorias(); abrirLoja(f.fra);
  } catch (e) { erro(e); $('csOk').disabled = false; }
}
function desenharConsultorias() {
  const ativas = CONS.filter(c => c.status === 'ativa'), concl = CONS.filter(c => c.status === 'concluida').length, canc = CONS.filter(c => c.status === 'cancelada').length;
  $('cntCons').textContent = ativas.length; $('cntCons').style.display = ativas.length ? '' : 'none';
  $('csResumo').innerHTML = `<div class="kpi ok"><div class="n">${ativas.length}</div><div class="l">Ativas</div></div><div class="kpi"><div class="n">${concl}</div><div class="l">Concluídas</div></div><div class="kpi"><div class="n">${canc}</div><div class="l">Canceladas</div></div>`;
  const box = $('csLista');
  if (!CONS.length) { box.innerHTML = '<div class="vazio">Nenhuma consultoria ainda. Abra a ficha de uma loja e use "Iniciar consultoria de faturamento".</div>'; return; }
  box.innerHTML = `<div class="tw"><table class="rede"><thead><tr><th>Loja</th><th>Consultor</th><th>Início</th><th>Fim previsto</th><th class="r">Nota inicial</th><th class="r">Nota atual</th><th>Status</th><th></th></tr></thead><tbody>` +
    CONS.map(c => { const f = frqDe(c.fra), s = SNAPS[c.fra]; const dias = Math.round((new Date(c.fim_previsto) - new Date()) / 864e5);
      return `<tr data-fra="${c.fra}"><td><div class="t">${esc(f.nome)}</div><div class="s">FRA ${c.fra}</div></td><td>${esc(primeiro(nomeDe(c.consultor_id)))}</td><td>${dBR(c.inicio)}</td><td>${dBR(c.fim_previsto)}${c.status === 'ativa' ? ` <span class="s">(${dias >= 0 ? dias + ' d' : 'venceu'})</span>` : ''}</td><td class="r num">${c.score_inicial ?? '—'}</td><td class="r num">${s && s.score != null ? s.score : '—'}</td><td><span class="st ${c.status === 'ativa' ? 'roxo' : c.status === 'concluida' ? 'q1' : 'cinza'}">${c.status}</span></td>
        <td>${ehAdmin() && c.status === 'ativa' ? `<button class="btn claro" data-enc="${c.id}" type="button" style="padding:4px 10px;font-size:12px">Encerrar</button> <button class="btn verm" data-canc="${c.id}" type="button" style="padding:4px 10px;font-size:12px">Cancelar</button>` : ''}</td></tr>`; }).join('') + '</tbody></table></div>';
  box.querySelectorAll('tr[data-fra]').forEach(tr => tr.onclick = ev => { if (ev.target.closest('button')) return; abrirLoja(+tr.dataset.fra); });
  box.querySelectorAll('[data-enc],[data-canc]').forEach(b => b.onclick = async () => {
    const id = b.dataset.enc || b.dataset.canc, status = b.dataset.enc ? 'concluida' : 'cancelada';
    if (!confirm(status === 'concluida' ? 'Encerrar a consultoria como concluída?' : 'Cancelar a consultoria? As tarefas e reuniões ficam na agenda para você apagar, se quiser.')) return;
    const { error } = await sb.from('raiox_consultorias').update({ status, encerrada_em: new Date().toISOString(), encerrada_por: usuario.id }).eq('id', id);
    if (error) return erro(error); await recarregar('cons'); desenharConsultorias(); desenharRede(); toast();
  });
}

/* ================= ARQUIVOS DE ESTOQUE ================= */
function desenharArquivos() {
  const sel = $('arqFra'); const lojas = FRQ.filter(f => f.fra > 0 && f.ativo !== false).sort((a, b) => a.fra - b.fra);
  sel.innerHTML = '<option value="">— escolha a loja —</option>' + lojas.map(f => `<option value="${f.fra}"${lojaAtual === f.fra ? ' selected' : ''}>FRA ${f.fra} · ${esc(f.nome)}</option>`).join('');
  const rec = Object.values(ESTQ).sort((a, b) => b.enviado_em.localeCompare(a.enviado_em)).slice(0, 40);
  $('arqLista').innerHTML = rec.length ? `<table class="lista"><tr><th>Quando</th><th>Loja</th><th>Tipo</th><th>Arquivo</th><th>Resumo</th><th>Por</th><th></th></tr>` + rec.map(e => `<tr><td>${dBR(e.enviado_em)}</td><td>FRA ${e.fra}</td><td>${{ abcprod: 'ABC produtos', estoqueparado: 'Estoque parado', estoqueatual: 'Posição de estoque' }[e.tipo]}</td><td>${esc(e.arquivo || '')}</td><td>${esc(resumoCurto(e))}</td><td>${esc(primeiro(nomeDe(e.enviado_por)))}</td><td>${(e.enviado_por === usuario.id || ehAdmin()) ? `<button class="btn claro" data-del="${e.id}" type="button" style="padding:3px 8px;font-size:12px">apagar</button>` : ''}</td></tr>`).join('') + '</table>' : '<div class="vazio">Nenhum arquivo enviado ainda.</div>';
  $('arqLista').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Apagar este envio?')) return; const { error } = await sb.from('raiox_estoque').delete().eq('id', b.dataset.del); if (error) return erro(error); await recarregar('estoque'); desenharArquivos(); toast('apagado'); });
}
function resumoCurto(e) { const r = e.resumo || {}; if (e.tipo === 'estoqueparado') return `${br(r.nCritico || 0)} críticos · ${kmil(r.totalParadoValor || 0)} parados`; if (e.tipo === 'abcprod') return `${br(r.nZer || 0)} de ${br(r.totalA || 0)} itens A zerados`; return `${br(r.nItens || 0)} itens · ${kmil(r.valorEstoque || 0)}`; }
const drop = $('arqDrop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('on'); }));
drop.addEventListener('drop', e => processarArquivos([...e.dataTransfer.files]));
$('arqEscolher').onclick = () => $('arqInput').click();
$('arqInput').onchange = e => { processarArquivos([...e.target.files]); e.target.value = ''; };
async function processarArquivos(files) {
  const fra = +$('arqFra').value; const st = $('arqStatus');
  if (!fra) { st.className = 'status err'; st.textContent = 'Escolha a loja antes de enviar.'; return; }
  const s = SNAPS[fra]; const periodoDias = s ? s.kpis.meses * 30 : 365;
  for (const f of files) {
    try {
      const txt = await f.text(); const rows = MOTOR.parseCSV(txt); const tipo = MOTOR.detectType(rows);
      let resumo = null, t = null;
      if (tipo === 'estoqueparado') { const r = MOTOR.analisaEstoqueParadoNativo(rows); t = 'estoqueparado'; resumo = r && { nCritico: r.nCritico, nMuitoLento: r.nMuitoLento, totalParadoValor: r.totalParadoValor, granelTotal: r.granelTotal, granelNeg: r.granelNeg, top: (r.top || []).slice(0, 15) }; }
      else if (tipo === 'abcprod') {
        const A = rows.filter(r => (r['Classe'] || '').trim() === 'A').map(r => ({ desc: r['Descrição'] || r['Descricao'], est: MOTOR.n0(r['Estoque']), vv: MOTOR.n0(r['Valor Vendido']), qv: MOTOR.n0(r['Qtd.Vendida'] || r['Qtd Vendida']) }));
        const zer = A.filter(r => r.est <= 0).sort((a, b) => b.vv - a.vv);
        const par = MOTOR.analisaEstoqueParado(rows, periodoDias);
        t = 'abcprod'; resumo = { totalA: A.length, nZer: zer.length, valZer: zer.reduce((x, r) => x + r.vv, 0), nNeg: zer.filter(r => r.est < 0).length, top: zer.slice(0, 15), parado: par && { nCritico: par.nCritico, nMuitoLento: par.nMuitoLento, totalParadoValor: par.totalParadoValor } };
      }
      else if (tipo === 'estoqueatual') { const r = MOTOR.analisaEstoqueAtual(rows, 'FR ' + fra); t = 'estoqueatual'; resumo = r && { nItens: r.nItens, valorEstoque: r.valorEstoque, nAbaixoCusto: r.nAbaixoCusto, valorAbaixoCusto: r.valorAbaixoCusto, topAbaixoCusto: (r.topAbaixoCusto || []).slice(0, 15), filialArquivo: r.filialArquivo, filialDivergente: r.filialDivergente }; }
      else { st.className = 'status err'; st.textContent = f.name + ': não reconheci como estoque parado, posição de estoque ou ABC de produtos (é um BI de vendas? esse vai pelo painel de Inteligência Comercial).'; continue; }
      if (!resumo) { st.className = 'status err'; st.textContent = f.name + ': arquivo vazio ou sem as colunas esperadas.'; continue; }
      const { error } = await sb.from('raiox_estoque').insert({ fra, tipo: t, arquivo: f.name, enviado_por: usuario.id, resumo });
      if (error) throw error;
      st.className = 'status ok'; st.textContent = f.name + ' ✓ guardado para a FRA ' + fra;
    } catch (e) { st.className = 'status err'; st.textContent = f.name + ': ' + (e.message || e); }
  }
  await recarregar('estoque'); desenharArquivos(); if (lojaAtual === fra) abrirLoja(fra);
}

/* ================= navegação ================= */
document.querySelectorAll('.aba').forEach(a => a.onclick = () => {
  document.querySelectorAll('.aba').forEach(x => x.classList.toggle('ativa', x === a));
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('ativa', v.id === 'v-' + a.dataset.v));
  if (a.dataset.v === 'arquivos') desenharArquivos();
});
iniciar();
