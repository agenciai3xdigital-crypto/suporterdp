/* Raio-X POP · app.js · v3.3 · 15/09/2026
   Lê as tabelas raiox_* da Central POP e a agenda; inicia a consultoria de faturamento. */
'use strict';
const SUPABASE_URL = 'https://klcxavgxonpsbsbzqcil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsY3hhdmd4b25wc2JzYnpxY2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzQwMDAsImV4cCI6MjA5OTExMDAwMH0.UJK09SljKG0tJqDcGYQfuk41i1SN8GymL1hTTeE2ruY';
const VERSAO = 'v3.13'; // v3.13 · 23/09/2026 · franqueado ganha a aba Tarefas da loja (Consultoria de campo, mesmo login) · v3.12 · 22/09/2026 · aba Roteiro da visita; barra de abas não segue mais a rolagem; sai o botão Imprimir (o Exportar já faz) · v3.11 · 22/09/2026 · clusters da rede na aba Rede (filtros por faixa, colunas Potencial, Tend. e Franq.) · v3.10 · 21/09/2026 · botão Simulador de alavancas na ficha da loja · v3.9 Barra POP no cabeçalho
const FN_FRANQ = SUPABASE_URL + '/functions/v1/raiox-franqueados';
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
const diasDesde = iso => Math.round((Date.now() - new Date(iso)) / 864e5);
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
function toast(t) { const el = $('toast'); el.textContent = t || 'salvo ✓'; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1400); }
function erro(e) { console.error(e); alert('Erro: ' + (e.message || e)); }

let sb, usuario, perfil, PERFIS = [], FRQ = [], SNAPS = {}, CONS = [], ITENS = [], ESTQ = {}, FILA = new Set(), FQ_LOJAS = [], FQ_MAPA = [];
let FQ_CARTEIRA = [], FQ_PAPEL = '', FQ_LISTA = {};
let rdFiltro = 'todas', lojaAtual = null, rdOrd = { k: 'score', asc: true };
// clusters da rede (reunião de 21/09/2026): CLUS[fra] = linha de v_loja_clusters; rdCl = filtros ligados {dimensao: faixa}; rdClDim = dimensão aberta nos chips
let CLUS = {}, rdCl = {}, rdClDim = '';
const CL_DIM = { faixa_faturamento: 'Faturamento', faixa_multi: 'Multifranqueado', faixa_score: 'Score da loja', faixa_potencial: 'Potencial', faixa_engaj_franqueadora: 'Engaj. franqueadora', faixa_maturidade: 'Maturidade', faixa_delivery: 'Delivery', faixa_servicos: 'Serviços', faixa_tendencia: 'Tendência', faixa_lucratividade: 'Lucratividade', faixa_inadimplencia: 'Inadimplência' };
const CL_ORDEM = { faixa_potencial: ['muito abaixo do potencial', 'abaixo do potencial', 'no potencial', 'acima do potencial', 'sem dado'], faixa_score: ['prioridade', 'atenção', 'saudável', 'referência', 'sem nota'], faixa_tendencia: ['caindo', 'estável', 'crescendo', 'sem dado'], faixa_maturidade: ['nova (< 1 ano)', '1–3 anos', '3–7 anos', 'madura (> 7 anos)', 'sem dado'], faixa_delivery: ['sem delivery', 'baixo (< 5%)', 'médio (5–15%)', 'alto (≥ 15%)', 'sem dado'], faixa_servicos: ['sem serviço', 'baixo (< 5%)', 'médio (5–15%)', 'alto (≥ 15%)', 'sem dado'], faixa_lucratividade: ['baixa (< 35%)', 'média (35–42%)', 'alta (≥ 42%)', 'sem dado'], faixa_inadimplencia: ['em dia', 'até 5 mil vencido', '5–20 mil vencido', '> 20 mil vencido'], faixa_engaj_franqueadora: ['baixo', 'parcial', 'engajado', 'consultoria iniciada', 'sem consultoria'] };
const ehAdmin = () => !!(perfil && perfil.is_admin);
const ehFranq = () => !!(perfil && !perfil.is_admin && (perfil.papeis || []).includes('franqueado'));
const ehConsultor = () => !!(perfil && !perfil.is_admin && (perfil.papeis || []).includes('consultor'));
const podeFranq = () => ehAdmin() || ehConsultor();   // quem pode abrir a aba Franqueados
const carteiraFras = () => FRQ.filter(f => f.consultor_id === usuario.id).map(f => f.fra);
const nomeDe = uid => ((PERFIS.find(p => p.id === uid) || {}).nome || '—');
const primeiro = n => String(n || '').split(' ')[0];
const frqDe = fra => FRQ.find(f => f.fra === fra) || { fra, nome: 'FRA ' + fra };
const rotulo = fra => { const f = frqDe(fra); return 'FRA ' + fra + ' · ' + (f.nome || ''); };
// consultor da loja (texto do cadastro, ex. "JOAO") -> perfil da central
function perfilDoConsultor(txt) {
  const t = semAcento(txt); if (!t) return null;
  return PERFIS.find(p => semAcento(primeiro(p.nome_sults || p.nome)) === t.split(' ')[0]) || null;
}
// consultor da loja: vale o vinculo (franquias.consultor_id); o texto do cadastro e so fallback
const perfilDaLoja = fra => { const f = frqDe(fra); return (f.consultor_id ? PERFIS.find(p => p.id === f.consultor_id) : null) || perfilDoConsultor(f.consultor); };
const minhaCarteira = fra => { const p = perfilDaLoja(fra); return !!(p && p.id === usuario.id); };

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
  $('quem').textContent = perfil.nome + (perfil.is_admin ? ' · admin' : ehFranq() ? ' · franqueado' : '') + ' · ' + VERSAO;
  // v3.9: Barra POP — nome e papel no cabeçalho; franqueado não tem Central, então some a trilha e o logo não leva para lá
  if (window.BarraPop) {
    BarraPop.quem(perfil.nome, (perfil.is_admin ? 'admin' : ehFranq() ? 'franqueado' : 'consultor') + ' · ' + VERSAO);
    if (ehFranq()) { document.querySelectorAll('.pb-pai,.pb-sep').forEach(e => e.remove()); const m = document.querySelector('.pb-marca'); if (m) { m.href = './'; m.title = 'Raio-X POP'; } }
    else BarraPop.sessao();
    BarraPop.sairVisivel(true);
  }
  $('login').style.display = 'none'; $('app').style.display = '';
  sb.from('acessos').insert({ user_id: usuario.id, origem: 'raiox' }).then(() => {});
  if (ehAdmin()) $('btnRecalcRede').style.display = '';
  if (podeFranq()) $('abaFranq').style.display = '';   // admin ve a rede; consultor ve a carteira dele
  if (ehAdmin() || (perfil.papeis || []).some(p => ['supervisor', 'diretoria'].includes(p))) { const bd = $('btnDash'); if (bd) bd.style.display = ''; }
  const qs = new URLSearchParams(location.search), fraUrl = qs.get('fra');
  if (ehFranq()) { await entrouFranqueado(fraUrl ? +fraUrl : null, qs.get('aba')); return; }
  // ?cl=faixa_potencial:muito%20abaixo%20do%20potencial — link vindo do Dash "Rede por cluster"
  const clUrl = qs.get('cl'); if (clUrl && clUrl.includes(':')) { const i = clUrl.indexOf(':'), k = clUrl.slice(0, i); if (CL_DIM[k]) { rdCl[k] = clUrl.slice(i + 1); rdClDim = k; } }
  try { await carregarTudo(); desenharRede(); desenharConsultorias(); desenharArquivos(); if (podeFranq()) desenharFranqueados(); }
  catch (e) { erro(e); }
  if (fraUrl) abrirLoja(+fraUrl, qs.get('aba'));
}
$('loginForm').onsubmit = async ev => {
  ev.preventDefault(); const b = $('loginBtn'), er = $('loginErro'); b.disabled = true; er.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginSenha').value });
  b.disabled = false;
  if (error) { er.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha inválidos.' : error.message; return; }
  await entrou(data.session);
};
$('btnSair').onclick = async () => { await sb.auth.signOut(); };

/* ================= modo FRANQUEADO ================= */
// v3.13: quantas tarefas da Consultoria de campo estão abertas para as lojas do franqueado (mesmo login)
async function contarTarefas() {
  try {
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    const mes = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    const r = await fetch(SUPABASE_URL + '/functions/v1/campo-api?consultant=eduardo&month=' + mes, { headers: { Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return; const d = await r.json();
    const n = (d.blocks || []).filter(b => b.status === 'approved').reduce((t, b) => t + (b.tasks || []).filter(x => ['open', 'reopened'].includes(x.status)).length, 0);
    if (n) { $('cntTar').textContent = n; $('cntTar').style.display = ''; }
  } catch (e) { /* sem contagem: a aba continua funcionando */ }
}
async function entrouFranqueado(fraPedida, aba) {
  // esconde tudo que não é dele: abas de rede/consultorias/arquivos e o link para a Central
  document.querySelectorAll('.aba[data-v=rede],.aba[data-v=consult],.aba[data-v=arquivos],.aba[data-v=franq]').forEach(a => a.style.display = 'none');
  document.querySelectorAll('a[href="../"], a[href="../index.html"], #btnCentral').forEach(a => a.remove());
  $('v-rede').classList.remove('ativa');
  const [{ data: fl }, { data: fq }, { data: pf }] = await Promise.all([
    sb.from('franqueado_lojas').select('fra').eq('user_id', usuario.id),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor,ativo'),
    sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults,cor')
  ]);
  FQ_LOJAS = (fl || []).map(x => x.fra).sort((a, b) => a - b); FRQ = fq || []; PERFIS = pf || [];
  if (!FQ_LOJAS.length) { $('v-loja').classList.add('ativa'); $('ljConteudo').innerHTML = '<div class="vazio">Seu login ainda não está ligado a nenhuma loja. Fale com a franqueadora.</div>'; return; }
  const [{ data: sn }, { data: cs }] = await Promise.all([
    sb.from('raiox_snapshots_atual').select('fra,mes_ref,janela_meses,perfil,calculado_em,score,sem_nota_motivo,sub,kpis,tarefas').in('fra', FQ_LOJAS),
    sb.from('raiox_consultorias').select('*').in('fra', FQ_LOJAS).order('criado_em', { ascending: false })
  ]);
  SNAPS = {}; (sn || []).forEach(x => { SNAPS[x.fra] = x; }); CONS = cs || [];
  $('abaTarefas').style.display = ''; contarTarefas();
  const barra = $('fqBarra'); barra.style.display = FQ_LOJAS.length > 1 ? '' : 'none';
  $('fqLojas').innerHTML = FQ_LOJAS.map(f => `<button class="pill" data-fra="${f}" type="button">FRA ${f} · ${esc(frqDe(f).nome)}</button>`).join('');
  $('fqLojas').querySelectorAll('.pill').forEach(b => b.onclick = () => abrirLoja(+b.dataset.fra));
  const fra = FQ_LOJAS.includes(fraPedida) ? fraPedida : FQ_LOJAS[0];
  abrirLoja(fra, aba);
}

/* ================= dados ================= */
async function fetchAll(builder, step = 1000) {
  let all = [], from = 0;
  while (true) { const { data, error } = await builder().range(from, from + step - 1); if (error) throw error; all = all.concat(data || []); if (!data || data.length < step) break; from += step; }
  return all;
}
async function carregarTudo() {
  const [pf, fq, sn, cs, es, fl, it, cl] = await Promise.all([
    sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults,cor').order('criado_em'),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor,consultor_id,ativo').order('fra'),
    fetchAll(() => sb.from('raiox_snapshots_atual').select('fra,mes_ref,janela_meses,perfil,calculado_em,score,sem_nota_motivo,sub,kpis,tarefas').order('fra')),
    sb.from('raiox_consultorias').select('*').order('criado_em', { ascending: false }),
    fetchAll(() => sb.from('raiox_estoque').select('id,fra,tipo,arquivo,enviado_em,enviado_por,resumo').order('enviado_em', { ascending: false }).order('id')),
    sb.from('raiox_fila').select('fra').is('processado_em', null),
    fetchAll(() => sb.from('agenda_eventos').select('id,consultoria_id,titulo,tipo,data,prazo,concluida,concluida_em,user_id').not('consultoria_id', 'is', null).is('cancelado_em', null).order('data').order('id')),
    fetchAll(() => sb.from('v_loja_clusters').select('fra,grupo_id,lojas_grupo,faixa_faturamento,faixa_multi,faixa_score,faixa_potencial,realizado_pct,potencial_p50,potencial_conf,potencial_motivo,faixa_engaj_franqueadora,engaj_tarefas_pct,faixa_engaj_parceiros,faixa_maturidade,idade_meses,inauguracao,faixa_delivery,delivery_pct,faixa_servicos,faixa_tendencia,tendencia_pct,faixa_lucratividade,faixa_inadimplencia,inad_vencido,nota_faturamento,nota_potencial,nota_servicos,nota_lojas,score_franqueado_parcial,score_franqueado_criterios,score_franqueado_criterios_total').order('fra'))
  ]);
  ITENS = it || [];
  CLUS = {}; (cl || []).forEach(c => { CLUS[c.fra] = c; });
  PERFIS = (pf.data || []).filter(p => !/robo\.raiox/i.test(p.nome || ''));
  FRQ = (fq.data || []);
  SNAPS = {}; (sn || []).forEach(s => { SNAPS[s.fra] = s; });   // a vista já traz só o mais recente por loja
  CONS = cs.data || [];
  ESTQ = {}; (es || []).forEach(e => { const k = e.fra + '|' + e.tipo; if (!ESTQ[k]) ESTQ[k] = e; });
  FILA = new Set((fl.data || []).map(f => f.fra));
}
async function recarregar(o) {
  if (o === 'cons') { const { data } = await sb.from('raiox_consultorias').select('*').order('criado_em', { ascending: false }); CONS = data || []; ITENS = await fetchAll(() => sb.from('agenda_eventos').select('id,consultoria_id,titulo,tipo,data,prazo,concluida,concluida_em,user_id').not('consultoria_id', 'is', null).is('cancelado_em', null).order('data').order('id')); }
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
  const lojasAtivas = FRQ.filter(f => f.ativo !== false && f.fra > 0);
  // cada card do topo e um filtro: o numero do card e a quantidade de linhas que ele abre
  const media = Q ? Q.media : null;
  const comRaiox = lojasAtivas.filter(f => SNAPS[f.fra]).length;
  const semNota = lojasAtivas.filter(f => SNAPS[f.fra] && SNAPS[f.fra].score == null).length;
  const abaixo = media == null ? 0 : lojasAtivas.filter(f => SNAPS[f.fra] && SNAPS[f.fra].score != null && SNAPS[f.fra].score < media).length;
  const defasadas = lojasAtivas.filter(f => SNAPS[f.fra] && (SNAPS[f.fra].kpis.defasagem_meses || 0) >= 2).length;
  const semDado = lojasAtivas.filter(f => !SNAPS[f.fra]).length;
  const ativas = lojasAtivas.filter(f => consAtiva(f.fra)).length;
  const card = (f, n, l, cls, dica) => `<button type="button" class="kpi${cls ? ' ' + cls : ''}${rdFiltro === f ? ' on' : ''}" data-f="${f}" title="${esc(dica)}"><div class="n">${n}</div><div class="l">${l}</div></button>`;
  $('rdResumo').innerHTML =
      card('comraiox', comRaiox, 'Lojas com raio-x', '', 'Ver as ' + comRaiox + ' lojas que j\u00e1 t\u00eam raio-x calculado')
    + card('abaixo', Q ? br(Q.media, 0) : '\u2014', 'Nota m\u00e9dia da rede', '', Q ? 'Ver as ' + abaixo + ' lojas com nota abaixo da m\u00e9dia (' + br(Q.media, 0) + ')' : 'Nenhuma nota calculada ainda')
    + card('semnota', semNota, 'Sem nota (custo sem cadastro)', semNota ? 'alerta' : '', 'Ver as lojas sem nota por falta de custo cadastrado')
    + card('defasadas', defasadas, 'Com dado defasado (2+ meses)', defasadas ? 'atencao' : '', 'Ver as lojas cujo \u00faltimo m\u00eas com venda j\u00e1 tem 2 meses ou mais')
    + card('semraiox', semDado, 'Aguardando carga', '', 'Ver as lojas que ainda n\u00e3o t\u00eam raio-x')
    + card('consult', ativas, 'Consultorias ativas', ativas ? 'ok' : '', 'Ver as lojas em consultoria');
  $('rdResumo').querySelectorAll('.kpi[data-f]').forEach(b => b.onclick = () => { rdFiltro = rdFiltro === b.dataset.f ? 'todas' : b.dataset.f; desenharRede(); });

  const PF = { todas: 'Todas', minha: 'Minha carteira', piores: 'Q4 (piores)', semnota: 'Sem nota', consult: 'Em consultoria', semraiox: 'Aguardando carga', comraiox: 'Com raio-x', abaixo: 'Abaixo da m\u00e9dia', defasadas: 'Dado defasado' };
  const PILL_FIXAS = ['todas', 'minha', 'piores', 'semnota', 'consult', 'semraiox'];   // as demais so aparecem quando ligadas por um card
  const pills = PILL_FIXAS.includes(rdFiltro) ? PILL_FIXAS : PILL_FIXAS.concat([rdFiltro]);
  $('rdPills').innerHTML = pills.map(k => `<button class="pill${rdFiltro === k ? ' on' : ''}" data-f="${k}" type="button">${PF[k]}${rdFiltro === k && k !== 'todas' ? ' \u00d7' : ''}</button>`).join('');
  $('rdPills').querySelectorAll('.pill').forEach(b => b.onclick = () => { rdFiltro = (rdFiltro === b.dataset.f && b.dataset.f !== 'todas') ? 'todas' : b.dataset.f; desenharRede(); });
  const sc = $('rdCons'); if (sc.options.length <= 1) { const cs = [...new Set(FRQ.map(f => (f.consultor || '').trim()).filter(Boolean))].sort(); sc.innerHTML = '<option value="">Todos os consultores</option>' + cs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
  const su = $('rdUf'); if (su.options.length <= 1) { const ufs = [...new Set(FRQ.map(f => f.estado).filter(Boolean))].sort(); su.innerHTML = '<option value="">Todas as UFs</option>' + ufs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join(''); }
  const busca = ($('rdBusca').value || '').trim().toLowerCase(), cons = sc.value, uf = su.value;

  // ---- clusters (quadro "CLUSTERS REDE POP", 21/09/2026): escolher uma dimensão abre os chips com a contagem de cada faixa; clicar num chip filtra; vários filtros somam (E)
  const sd = $('rdClDim'); if (sd.options.length <= 1) sd.innerHTML = '<option value="">Ver rede por cluster…</option>' + Object.keys(CL_DIM).map(k => `<option value="${k}">${CL_DIM[k]}</option>`).join('');
  sd.value = rdClDim;
  const ligados = Object.keys(rdCl);
  const chipsOn = ligados.map(k => `<button class="pill on" data-cl="${k}" type="button" title="tirar este filtro">${CL_DIM[k]}: ${esc(rdCl[k])} ×</button>`).join('');
  let chipsDim = '';
  if (rdClDim) {
    const base = lojasAtivas.filter(f => { const c = CLUS[f.fra]; return c && ligados.every(k => k === rdClDim || c[k] === rdCl[k]); });
    const cont = {}; base.forEach(f => { const v = CLUS[f.fra][rdClDim] || 'sem dado'; cont[v] = (cont[v] || 0) + 1; });
    const ordem = CL_ORDEM[rdClDim] || Object.keys(cont).sort();
    const chaves = ordem.filter(k => cont[k]).concat(Object.keys(cont).filter(k => !ordem.includes(k)).sort());
    chipsDim = chaves.map(k => `<button class="pill${rdCl[rdClDim] === k ? ' on' : ''}" data-cldim="${rdClDim}" data-clval="${esc(k)}" type="button">${esc(k)} <b>${cont[k]}</b></button>`).join('');
  }
  $('rdClChips').innerHTML = chipsOn + (chipsOn && chipsDim ? '<span style="width:1px;background:var(--linha);margin:0 4px"></span>' : '') + chipsDim;
  $('rdClChips').querySelectorAll('[data-cl]').forEach(b => b.onclick = () => { delete rdCl[b.dataset.cl]; desenharRede(); });
  $('rdClChips').querySelectorAll('[data-cldim]').forEach(b => b.onclick = () => { const k = b.dataset.cldim, v = b.dataset.clval; if (rdCl[k] === v) delete rdCl[k]; else rdCl[k] = v; desenharRede(); });
  $('rdClLimpar').style.display = ligados.length ? '' : 'none';

  let lista = lojasAtivas.map(f => ({ f, s: SNAPS[f.fra] || null, c: CLUS[f.fra] || null }));
  lista = lista.filter(({ f, s, c }) => {
    if (cons && (f.consultor || '').trim() !== cons) return false;
    if (uf && f.estado !== uf) return false;
    if (ligados.length && !(c && ligados.every(k => c[k] === rdCl[k]))) return false;
    if (busca && !(('fra ' + f.fra + ' ' + f.nome + ' ' + (f.cidade || '')).toLowerCase().includes(busca))) return false;
    if (rdFiltro === 'minha') return minhaCarteira(f.fra);
    if (rdFiltro === 'piores') return s && s.score != null && classeScore(s.score, Q) === 'q4';
    if (rdFiltro === 'semnota') return s && s.score == null;
    if (rdFiltro === 'consult') return !!consAtiva(f.fra);
    if (rdFiltro === 'semraiox') return !s;
    if (rdFiltro === 'comraiox') return !!s;
    if (rdFiltro === 'abaixo') return !!(s && s.score != null && Q && s.score < Q.media);
    if (rdFiltro === 'defasadas') return !!(s && (s.kpis.defasagem_meses || 0) >= 2);
    return true;
  });
  const val = (x, k) => {
    if (k === 'fra') return x.f.fra;
    if (k === 'loja') return x.f.nome || '';
    if (!x.s) return null;
    if (k === 'score') return x.s.score;
    if (k === 'realizado_pct' || k === 'tendencia_pct' || k === 'score_franqueado_parcial') return x.c ? x.c[k] : null;
    return x.s.kpis[k];
  };
  lista.sort((a, b) => { const va = val(a, rdOrd.k), vb = val(b, rdOrd.k); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return (va < vb ? -1 : va > vb ? 1 : 0) * (rdOrd.asc ? 1 : -1); });

  const th = (k, t, cls = '') => `<th class="${cls}" data-k="${k}">${t}${rdOrd.k === k ? (rdOrd.asc ? ' ▲' : ' ▼') : ''}</th>`;
  const mini = (v, inv) => { if (v == null) return '—'; const p = Math.max(0, Math.min(100, v)); const cls = inv ? (p > 20 ? 'r' : p > 5 ? 'm' : '') : (p < 50 ? 'r' : p < 75 ? 'm' : ''); return `<span class="mini ${cls}"><i style="width:${p}%"></i></span>${br(v, 0)}%`; };
  const tab = $('rdTab');
  if (!lista.length) { tab.innerHTML = '<tr><td><div class="vazio">Nenhuma loja com esses filtros.</div></td></tr>'; return; }
  const tend = c => { if (!c || c.tendencia_pct == null) return '—'; const v = c.tendencia_pct; const cls = v <= -5 ? 'q4' : v >= 5 ? 'q1' : 'cinza'; return `<span class="st ${cls}" title="últimos 3 meses contra os 3 anteriores">${v > 0 ? '+' : ''}${br(v, 0)}%</span>`; };
  const pot = c => { if (!c || c.realizado_pct == null) return '—'; const v = c.realizado_pct; const cls = v < 70 ? 'q4' : v < 100 ? 'q3' : v < 130 ? 'q2' : 'q1'; return `<span class="st ${cls}" title="${esc((c.potencial_motivo || '') + ' · potencial típico ' + kmil(c.potencial_p50) + '/mês · confiança ' + (c.potencial_conf || '—'))}">${br(v, 0)}%</span>`; };
  const sfq = c => { if (!c || c.score_franqueado_parcial == null) return '—'; return `<span class="num" title="score do franqueado (parcial: ${c.score_franqueado_criterios} de ${c.score_franqueado_criterios_total} critérios) · ${c.lojas_grupo} loja(s) no grupo">${br(c.score_franqueado_parcial, 1)}</span>`; };
  tab.innerHTML = '<thead><tr>' + th('fra', 'FRA') + th('loja', 'Loja') + th('score', 'Nota', 'r') + th('realizado_pct', 'Potencial', 'r') + th('tendencia_pct', 'Tend.', 'r') + th('ident_pct', 'Identificação') + th('cz_rec_pct', 'Sem custo') + th('ret45', 'Ração em dia') + th('vaz_total', 'Vazamento/mês', 'r') + th('tarefas_alta', 'Graves', 'r') + th('score_franqueado_parcial', 'Franq.', 'r') + '<th>Situação</th></tr></thead><tbody>'
    + lista.map(({ f, s, c: cl }) => {
      const c = consAtiva(f.fra);
      const situ = !s ? '<span class="st cinza">aguardando carga</span>'
        : [(s.kpis.defasagem_meses || 0) >= 2 ? `<span class="st lar" title="último mês com venda: ${mesBR(s.mes_ref)}">dado de ${mesBR(s.mes_ref)}</span>` : '',
          s.kpis.mes_parcial ? `<span class="st lar" title="${mesBR(s.kpis.mes_parcial.mes)} entrou com ${s.kpis.mes_parcial.cupons} vendas (esperado ~${s.kpis.mes_parcial.esperado}); janela fechou em ${mesBR(s.mes_ref)}">carga parcial ${mesBR(s.kpis.mes_parcial.mes)}</span>` : '',
          c ? `<span class="st roxo">consultoria desde ${dBR(c.inicio)}</span>` : '',
          FILA.has(f.fra) ? '<span class="st cinza">↻ na fila</span>' : ''].filter(Boolean).join(' ');
      return `<tr data-fra="${f.fra}"><td class="num">${f.fra}</td><td><div class="t">${esc(f.nome)}</div><div class="s">${esc((f.cidade || '') + (f.estado ? '/' + f.estado : ''))}${f.consultor ? ' · ' + esc(f.consultor) : ''}</div></td>`
        + `<td class="r">${s ? (s.score == null ? '<span class="score sn" title="' + esc(s.sem_nota_motivo || '') + '">sem nota</span>' : `<span class="score ${classeScore(s.score, Q)}">${s.score}</span>`) : '—'}</td>`
        + `<td class="r">${pot(cl)}</td><td class="r">${tend(cl)}</td>`
        + `<td>${s ? mini(s.kpis.ident_pct) : '—'}</td><td>${s ? mini(s.kpis.cz_rec_pct, true) : '—'}</td><td>${s ? mini(s.kpis.ret45) : '—'}</td>`
        + `<td class="r num">${s ? kmil(s.kpis.vaz_total) : '—'}</td><td class="r num">${s ? (s.kpis.tarefas_alta || 0) : '—'}</td><td class="r">${sfq(cl)}</td><td>${situ}</td></tr>`;
    }).join('') + '</tbody>';
  tab.querySelectorAll('th[data-k]').forEach(t => t.onclick = () => { const k = t.dataset.k; rdOrd = { k, asc: rdOrd.k === k ? !rdOrd.asc : (k === 'score' || k === 'fra' || k === 'loja' || k === 'ident_pct' || k === 'ret45') }; desenharRede(); });
  tab.querySelectorAll('tr[data-fra]').forEach(tr => tr.onclick = () => abrirLoja(+tr.dataset.fra));
}
['rdCons', 'rdUf'].forEach(id => $(id).onchange = desenharRede);
$('rdClDim').onchange = () => { rdClDim = $('rdClDim').value; desenharRede(); };
$('rdClLimpar').onclick = () => { rdCl = {}; desenharRede(); };
$('rdBusca').addEventListener('input', () => { clearTimeout(window._b); window._b = setTimeout(desenharRede, 180); });
$('btnRecalcRede').onclick = async () => {
  if (!confirm('Pedir o recálculo de todas as lojas? A rotina atende na próxima rodada (a cada 2 horas). Lojas sem venda no banco são ignoradas por ela.')) return;
  // todas as ativas, não só as que já têm raio-x: assim a primeira leitura também sai pelo painel
  const fras = FRQ.filter(f => f.ativo !== false && f.fra > 0).map(f => f.fra).filter(f => !FILA.has(f));
  if (!fras.length) { toast('já está tudo na fila'); return; }
  const { error } = await sb.from('raiox_fila').insert(fras.map(fra => ({ fra, pedido_por: usuario.id })));
  if (error) return erro(error);
  fras.forEach(f => FILA.add(f)); toast(fras.length + ' loja(s) na fila'); desenharRede();
};

/* ================= ROTEIRO DA VISITA (v3.12 · 22/09/2026) =================
   O passo a passo que o consultor segue na reunião com o franqueado.
   Um roteiro por reunião da consultoria (decisão 1a). Ferramenta do consultor:
   o franqueado não abre esta aba, e o que for marcado "interno" não sai em nada
   que ele veja (decisão 2a). Tudo pode ser corrigido depois, com histórico (decisão 3a).
   Os números vêm do raio-x já calculado (kpis) e dos clusters (potencial, tendência,
   inadimplência) — a tela não recalcula nada, só conduz a conversa.                        */
let RT = null, rtEvento = null, rtSalvando = false;

const PASSOS = [
  { k: 'abertura', t: 'Abertura', p: 'Combinar o que a conversa é e conferir se o dado bate com o que ele vê.',
    dados: (f, s) => [['Período', mesBR(s.kpis.mes_ini) + ' a ' + mesBR(s.mes_ref)], ['Vendas no período', br(s.kpis.cupons_mes * (s.kpis.meses || 12), 0)], ['Calculado em', dBR(s.calculado_em)]],
    perg: 'Esses números batem com o que você vê no OnePet? Se não bate, o que está diferente?',
    dica: 'Se ele disser que não bate, pare aqui: o resto da conversa depende deste acordo. Anote o que ele aponta e confira a carga do BI antes de seguir.' },

  { k: 'solidez', t: '1. Solidez', p: 'Sem capital e sem crédito com fornecedor, qualquer plano de mix ou ação patina. É o primeiro pilar.',
    dados: (f, s, c) => [['Lucro bruto/mês', kmil(s.kpis.lucro_mes)], ['Margem ajustada', pc(s.kpis.margem_adj)], ['Vencido com a franqueadora', c && c.inad_vencido ? kmil(c.inad_vencido) + (c.inad_mes ? ' (' + mesBR(String(c.inad_mes).slice(0, 7)) + ')' : '') : 'em dia']],
    perg: 'Como está o capital de giro? Tem crédito aberto com os fornecedores? Está pagando em dia?',
    dica: 'A franqueadora não enxerga o caixa da loja — esse dado só existe se ele contar. Anote valores aproximados, não precisa de extrato.' },

  { k: 'pessoas', t: '2. Pessoas', p: 'Quem produz e quem não produz. Observação do consultor, reportada à franqueadora — não é conversa de feedback na loja.',
    dados: () => [['O sistema não mede pessoas', 'só a sua observação']],
    perg: 'Quantas pessoas trabalham hoje? Quem vende bem? Tem alguém que já devia ter saído?',
    dica: 'Este passo nasce marcado como interno: não sai em nada que o franqueado veja. Escreva o que observou, não o que combinou com ele.', interno: true },

  { k: 'alavancas', t: '3. As quatro alavancas', p: 'Venda = clientes × conversão × ticket × frequência. Mexer em qualquer uma muda o resultado.',
    dados: (f, s) => [['Ticket médio', money(s.kpis.ticket)], ['Vendas/mês', br(s.kpis.cupons_mes, 0)], ['Receita identificada', pc(s.kpis.ident_pct)], ['Fluxo e conversão', 'não medidos — só com contador de fluxo']],
    perg: 'Quantas pessoas entram na loja por dia, no seu chute? Quantas saem comprando?',
    dica: 'Abra o Simulador de alavancas com o número que ele chutar: mostrar na tela quanto 10% a mais de ticket faz no ano costuma ser o momento em que a conversa vira.', link: (f, s) => linkSimulador(f, s), linkT: '📈 Abrir o Simulador com os números desta loja' },

  { k: 'potencial', t: '4. Potencial', p: 'Quanto vendem as lojas mais parecidas com esta — mesma região, mesmo porte, mesmo perfil.',
    dados: (f, s, c) => c ? [['Vende hoje', kmil(s.kpis.receita_mes) + '/mês'], ['Típico das semelhantes', kmil(c.potencial_p50) + '/mês'], ['Realizado', c.realizado_pct != null ? c.realizado_pct + '% do típico' : '—'], ['Leitura', c.potencial_motivo || '—'], ['Confiança', c.potencial_conf || '—']] : [['Sem cálculo de potencial para esta loja', '']],
    perg: 'O que explica a diferença para as lojas parecidas? O que tem aqui que elas não têm, e o contrário?',
    dica: 'É estimativa, não meta: o modelo explica pouco da diferença entre lojas. Use como ponto de conversa. Se ele apontar um motivo real (rua sem movimento, concorrente novo), anote — vale mais que o modelo.',
    link: () => 'https://agenciai3xdigital-crypto.github.io/analise-geral-franquia/potencial.html', linkT: '🎯 Ver as 7 lojas semelhantes' },

  { k: 'mix', t: '5. Mix e serviços', p: 'Serviço segura cliente e puxa margem. Delivery traz fluxo que a loja não teria.',
    dados: (f, s, c) => [['Serviços na venda', pc(s.kpis.serv_share)], ['Faixa', c ? c.faixa_servicos : '—'], ['Delivery na venda', c && c.delivery_pct != null ? pc(c.delivery_pct) : 'sem dado']],
    perg: 'Tem banho e tosa? Está cheio ou tem agenda vaga? E os apps de entrega, está nos dois?',
    dica: 'Loja sem serviço e sem delivery depende só de quem passa na porta. Se ele já tem e não usa, o problema é de operação, não de investimento.' },

  { k: 'clientes', t: '6. Clientes', p: 'Ração é compra que se repete. Cliente que não volta em 45 dias comprou em outro lugar.',
    dados: (f, s) => [['Ração em dia', pc(s.kpis.ret45)], ['Clientes identificados', pc(s.kpis.ident_pct)], ['Inativos de ração', br(s.kpis.inativos_racao, 0)]],
    perg: 'Vocês ligam para quem sumiu? Quem faz isso e quando? O balconista pede o cadastro em toda venda?',
    dica: 'A lista de resgate está na aba Clientes, com telefone. Se ele disser que não tem tempo, combine um número pequeno por dia — 5 ligações rendem mais que uma promessa de 50.' },

  { k: 'dado', t: '7. Qualidade do dado', p: 'Custo sem cadastro infla a margem e cega a análise. É o passo que destrava todos os outros.',
    dados: (f, s) => [['Receita sem custo cadastrado', pc(s.kpis.cz_rec_pct)], ['Itens sem custo', pc(s.kpis.cz_pct)], ['Achados graves', br(s.kpis.tarefas_alta, 0)]],
    perg: 'Quem cadastra produto na loja? A nota de entrada é lançada sempre?',
    dica: 'Se a receita sem custo passa de 20%, a loja fica sem nota — e sem nota não dá para medir evolução. Esse costuma ser o primeiro compromisso a cobrar.' },

  { k: 'lucro', t: '8. Lucro', p: 'O objetivo é lucro, não faturamento. Loja de 80 mil pode lucrar mais que loja de 200 mil.',
    dados: (f, s) => [['Margem reportada', pc(s.kpis.margem_rep)], ['Margem ajustada', pc(s.kpis.margem_adj)], ['Vazamento/mês', kmil(s.kpis.vaz_total)]],
    perg: 'Você sabe quanto sobra no fim do mês? Compra direto da indústria ou de distribuidor?',
    dica: 'A diferença entre margem reportada e ajustada é o tamanho do erro de cadastro. Vazamento é dinheiro que sai sem virar venda: desconto sem critério, perda, item vendido abaixo do custo.' },

  { k: 'fechamento', t: '9. Fechamento', p: 'Três prioridades, com prazo e dono. Mais que três não sai do papel.',
    dados: (f, s) => [['Achados do raio-x', br((s.tarefas || []).length, 0)], ['Nota de hoje', s.score == null ? 'sem nota' : s.score + '/100']],
    perg: 'Dos pontos que vimos, quais três você começa esta semana? O que você precisa da franqueadora?',
    dica: 'Escreva o compromisso com as palavras dele. Na próxima reunião, a primeira pergunta é sobre estes três itens.', fecha: true }
];

function mostrarRoteiro(on) {
  const r = $('ljRoteiro'), pf = $('ljPainelFrame');
  if (!r || !pf) return;
  r.hidden = !on; pf.style.display = on ? 'none' : '';
  if (on) desenharRoteiro();
}
async function carregarRoteiro(fra, evento) {
  const { data, error } = await sb.rpc('roteiro_abrir', { p_fra: fra, p_evento: evento || null });
  if (error) { RT = { erro: error.message }; return; }
  RT = data; RT.fra = fra;
}
async function desenharRoteiro() {
  const box = $('ljRoteiro'); if (!box) return;
  const fra = lojaAtual, f = frqDe(fra), s = SNAPS[fra], c = CLUS[fra] || null;
  if (!s) { box.innerHTML = '<div class="painel"><div class="vazio">Sem raio-x calculado.</div></div>'; return; }
  if (!RT || RT.fra !== fra) { box.innerHTML = '<div class="painel"><div class="vazio">Carregando o roteiro…</div></div>'; await carregarRoteiro(fra, rtEvento); }
  if (RT && RT.erro) { box.innerHTML = `<div class="painel"><div class="vazio">${esc(RT.erro)}</div></div>`; return; }

  const feito = {}; (RT.passos || []).forEach(p => { feito[p.passo] = p; });
  const reun = RT.reunioes || [];
  if (rtEvento === null && reun.length) {
    const prox = reun.find(r => !r.concluida) || reun[reun.length - 1];
    rtEvento = prox.id; await carregarRoteiro(fra, rtEvento);
    (RT.passos || []).forEach(p => { feito[p.passo] = p; });
  }
  const preenchidos = PASSOS.filter(x => feito[x.k] && (feito[x.k].situacao || feito[x.k].anotacao)).length;

  const cab = `<div class="painel" style="margin-bottom:10px">
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <b style="font-family:'Archivo';font-size:17px">Roteiro da visita</b>
      ${reun.length ? `<select id="rtReuniao" style="padding:7px 10px;border:1.5px solid var(--linha);border-radius:9px;font:inherit;font-size:13.5px">
        ${reun.map(r => `<option value="${r.id}"${r.id === rtEvento ? ' selected' : ''}>${dBR(r.data)} · ${esc(r.titulo || 'reunião')}${r.concluida ? ' ✓' : ''}</option>`).join('')}</select>`
        : '<span class="st lar">sem consultoria ativa — o roteiro fica avulso, sem reunião ligada</span>'}
      <span style="flex:1"></span>
      <span style="font-size:13px;color:var(--tinta-suave)">${preenchidos} de ${PASSOS.length} passos</span>
      <span class="mini" style="width:120px"><i style="width:${Math.round(100 * preenchidos / PASSOS.length)}%"></i></span>
    </div>
    <p class="aviso" style="margin:10px 0 0">Ferramenta do consultor: o franqueado não vê esta aba. O que estiver marcado <b>interno</b> não entra em nenhum resumo que chegue a ele. Dá para voltar e corrigir depois — fica o histórico de quem mudou.</p>
  </div>`;

  const corpo = PASSOS.map(x => {
    const v = feito[x.k] || {};
    const dd = (x.dados ? x.dados(f, s, c) : []).map(([l, val]) => `<div class="rt-dado"><span>${esc(l)}</span><b>${esc(String(val))}</b></div>`).join('');
    const lk = x.link ? x.link(f, s) : null;
    const sit = (kk, rot) => `<button type="button" class="rt-sit${v.situacao === kk ? ' on ' + kk : ''}" data-sit="${kk}" data-passo="${x.k}">${rot}</button>`;
    const prio = x.fecha ? `<div class="rt-prio"><div class="rt-rot">Prioridades desta visita <small>marque até 3</small></div>${
      (s.tarefas || []).length ? (s.tarefas || []).slice(0, 12).map((t, i) => {
        const marc = ((v.dados && v.dados.prioridades) || []).includes(t.chave);
        return `<label class="rt-chk"><input type="checkbox" data-prio="${esc(t.chave)}" data-passo="${x.k}"${marc ? ' checked' : ''}> ${txtTarefa(t)}</label>`;
      }).join('') : '<span class="rt-vazio">Sem achados no raio-x desta loja.</span>'}</div>` : '';
    return `<section class="rt-passo${v.situacao ? ' ok' : ''}" data-p="${x.k}">
      <div class="rt-cab"><h3>${esc(x.t)}</h3><span class="rt-por">${esc(x.p)}</span></div>
      ${dd ? `<div class="rt-dados">${dd}</div>` : ''}
      <div class="rt-perg">${esc(x.perg)}</div>
      <div class="rt-dica">${esc(x.dica)}</div>
      ${lk ? `<a class="btn claro" href="${lk}" target="_blank" rel="noopener" style="margin:8px 0">${x.linkT}</a>` : ''}
      <div class="rt-acoes">${sit('confere', '✓ Confere')}${sit('nao_confere', '✗ Não confere')}${sit('nao_se_aplica', '— Não se aplica')}
        <input class="rt-valor" data-passo="${x.k}" placeholder="O que o franqueado informou (valor certo, número dele)" value="${esc(v.valor_informado || '')}">
      </div>
      ${prio}
      <textarea class="rt-nota" data-passo="${x.k}" rows="2" placeholder="Anotação da conversa">${esc(v.anotacao || '')}</textarea>
      <div class="rt-rod">
        <label class="rt-chk"><input type="checkbox" data-int="${x.k}"${(v.interno != null ? v.interno : !!x.interno) ? ' checked' : ''}> interno (não sai para o franqueado)</label>
        <span style="flex:1"></span>
        ${consAtiva(fra) ? `<button class="btn claro mini" data-tarefa="${x.k}" type="button">+ virar tarefa</button>` : ''}
        <span class="rt-salvo" data-salvo="${x.k}">${v.atualizado_em ? 'salvo ' + dBR(v.atualizado_em) : ''}</span>
      </div>
    </section>`;
  }).join('');

  box.innerHTML = cab + `<div class="painel rt-lista">${corpo}</div>`;
  ligarRoteiro(fra);
}
function ligarRoteiro(fra) {
  const box = $('ljRoteiro');
  const rs = $('rtReuniao'); if (rs) rs.onchange = async () => { rtEvento = rs.value; await carregarRoteiro(fra, rtEvento); desenharRoteiro(); };
  box.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => {
    const p = b.dataset.passo, atual = box.querySelector(`.rt-sit.on[data-passo="${p}"]`);
    const novo = (atual && atual.dataset.sit === b.dataset.sit) ? null : b.dataset.sit;
    box.querySelectorAll(`.rt-sit[data-passo="${p}"]`).forEach(x => { x.classList.remove('on', 'confere', 'nao_confere', 'nao_se_aplica'); });
    if (novo) b.classList.add('on', novo);
    salvarPasso(fra, p);
  });
  box.querySelectorAll('.rt-valor, .rt-nota').forEach(el => { el.onblur = () => salvarPasso(fra, el.dataset.passo); });
  box.querySelectorAll('[data-int]').forEach(el => { el.onchange = () => salvarPasso(fra, el.dataset.int); });
  box.querySelectorAll('[data-prio]').forEach(el => el.onchange = () => {
    const p = el.dataset.passo, marcados = [...box.querySelectorAll(`[data-prio][data-passo="${p}"]:checked`)];
    if (marcados.length > 3) { el.checked = false; toast('escolha no máximo 3'); return; }
    salvarPasso(fra, p);
  });
  box.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = () => virarTarefa(fra, b.dataset.tarefa));
}
async function salvarPasso(fra, passo) {
  if (rtSalvando) return; rtSalvando = true;
  const box = $('ljRoteiro');
  const sel = box.querySelector(`.rt-sit.on[data-passo="${passo}"]`);
  const val = box.querySelector(`.rt-valor[data-passo="${passo}"]`);
  const not = box.querySelector(`.rt-nota[data-passo="${passo}"]`);
  const int = box.querySelector(`[data-int="${passo}"]`);
  const prios = [...box.querySelectorAll(`[data-prio][data-passo="${passo}"]:checked`)].map(x => x.dataset.prio);
  const marca = box.querySelector(`[data-salvo="${passo}"]`);
  const { error } = await sb.rpc('roteiro_salvar', {
    p_fra: fra, p_evento: rtEvento || null, p_passo: passo,
    p_situacao: sel ? sel.dataset.sit : null,
    p_valor: val && val.value.trim() ? val.value.trim() : null,
    p_anotacao: not && not.value.trim() ? not.value.trim() : null,
    p_interno: !!(int && int.checked),
    p_dados: prios.length ? { prioridades: prios } : null
  });
  rtSalvando = false;
  if (error) { if (marca) { marca.textContent = 'não salvou: ' + error.message; marca.classList.add('erro'); } return; }
  if (marca) { marca.classList.remove('erro'); marca.textContent = 'salvo agora'; }
  const sec = box.querySelector(`.rt-passo[data-p="${passo}"]`); if (sec) sec.classList.toggle('ok', !!sel);
}
async function virarTarefa(fra, passo) {
  const c = consAtiva(fra); if (!c) return;
  const x = PASSOS.find(p => p.k === passo);
  const box = $('ljRoteiro');
  const not = box.querySelector(`.rt-nota[data-passo="${passo}"]`);
  const titulo = prompt('O que precisa ser feito?', (not && not.value.trim()) || x.t);
  if (!titulo) return;
  const prazo = prompt('Prazo (dd/mm/aaaa)', dBR(addDias(hojeISO(), 14)));
  if (!prazo) return;
  const iso = String(prazo).split('/').reverse().join('-');
  const { error } = await sb.rpc('raiox_tarefa_gerir', { p_acao: 'criar', p_consultoria: c.id, p_titulo: titulo.slice(0, 160),
    p_descricao: 'Nasceu no roteiro da visita · passo ' + x.t, p_prazo: iso, p_responsavel: 'franqueado' });
  if (error) { alert('Não criou a tarefa: ' + error.message); return; }
  toast('tarefa criada na agenda'); await recarregar('cons');
}

/* ================= LOJA ================= */
async function abrirLoja(fra, aba) {
  lojaAtual = fra;
  document.querySelectorAll('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.v === 'loja'));
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('ativa', v.id === 'v-loja'));
  $('abaLoja').textContent = 'FRA ' + fra;
  history.replaceState(null, '', '?fra=' + fra);
  if (ehFranq()) $('fqLojas').querySelectorAll('.pill').forEach(b => b.classList.toggle('on', +b.dataset.fra === fra));
  const box = $('ljConteudo');
  const s = SNAPS[fra], f = frqDe(fra);
  if (!s) { box.innerHTML = cabecaLoja(f, null) + '<div class="vazio">Esta loja ainda não tem raio-x: o banco de compras não recebeu o BI de vendas dela. Depois da carga, a rotina noturna calcula sozinha.</div>'; return; }
  // o relatório completo (motor visual original da máquina) roda em relatorio.html, alimentado pelo banco
  box.innerHTML = cabecaLoja(f, s) + `<div class="abas-pai" id="ljAbas"></div><div id="ljRoteiro" hidden></div><div class="painel" id="ljPainelFrame" style="padding:0;overflow:hidden"><iframe id="ljFrame" src="relatorio.html?fra=${fra}${aba ? '&aba=' + encodeURIComponent(aba) : ''}&v=${encodeURIComponent(VERSAO)}" title="Raio-X completo da FRA ${fra}" style="width:100%;border:0;min-height:70vh;display:block;background:#F6FAF7"></iframe></div>`;
  ligarFicha(f, s, { tarefas: s.tarefas || [] });
}
window.addEventListener('message', ev => {
  if (ev.origin !== location.origin || !ev.data || ev.data.fra !== lojaAtual) return;
  const fr = $('ljFrame'); if (!fr) return;
  if (ev.data.raiox === 'altura') fr.style.height = Math.max(400, ev.data.altura + 24) + 'px';
  if (ev.data.raiox === 'topo') rolarInicioLoja();
  if (ev.data.raiox === 'abas') { desenharAbasPai(ev.data); mostrarRoteiro(false); }
});
// ao trocar de aba o conteúdo muda de tamanho; a página volta ao início da ficha da loja (nota, cabeçalho), logo abaixo da barra fixa de abas
function rolarInicioLoja() {
  const box = $('ljConteudo'); if (!box) return;
  window.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + window.scrollY - 12), behavior: 'smooth' });
}
const ABAS_REL = [['roteiro', 'Roteiro da visita'], ['diag', 'Diagnóstico'], ['tarefas', 'Tarefas'], ['clientes', 'Clientes'], ['estoque', 'Estoque'], ['evolucao', 'Evolução'], ['consultoria', 'Consultoria'], ['avaliacao', 'Avaliação'], ['historico', 'Histórico']];
const EXPORTS_REL = [['btnPDF', '⬇ Relatório em PDF'], ['btnCSV', '⬇ Lista de resgate (CSV)'], ['btnTarefasCSV', '⬇ Achados do raio-x (CSV)'], ['btnPlanoCSV', '⬇ Plano da consultoria (CSV)'], ['btnEvolucaoCSV', '⬇ Evolução mensal (CSV)'], ['btnSnapshot', '⬇ Instantâneo (JSON)']];
function desenharAbasPai(d) {
  const box = $('ljAbas'), fr = $('ljFrame'); if (!box || !fr) return;
  const bd = d.badges || {};
  box.innerHTML = `<div class="abas-pai-in">${ABAS_REL.map(([k, t]) => `<button type="button" class="aba-rel${d.atual === k ? ' on' : ''}" data-aba="${k}">${t}${k === 'tarefas' && bd.tarefas ? ` <b class="bd">${bd.tarefas}</b>` : ''}${k === 'avaliacao' && bd.avaliacao ? ' <b class="bd">!</b>' : ''}</button>`).join('')}<span style="flex:1"></span><div class="exp-pai"><button type="button" class="btn claro" id="btnExpPai">⬇ Exportar ▾</button><div class="menu" id="menuExpPai">${EXPORTS_REL.map(([id, t]) => `<button type="button" data-exp="${id}">${t}</button>`).join('')}</div></div></div>`;
  box.querySelectorAll('.aba-rel').forEach(b => b.onclick = () => {
    const k = b.dataset.aba;
    box.querySelectorAll('.aba-rel').forEach(x => x.classList.toggle('on', x === b));
    mostrarRoteiro(k === 'roteiro');
    if (k !== 'roteiro') fr.contentWindow.postMessage({ raiox: 'aba', aba: k }, location.origin);
    rolarInicioLoja();
  });
  const m = $('menuExpPai'); $('btnExpPai').onclick = ev => { ev.stopPropagation(); m.classList.toggle('on'); };
  box.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { m.classList.remove('on'); fr.contentWindow.postMessage({ raiox: 'exportar', botao: b.dataset.exp }, location.origin); });
  document.addEventListener('click', () => m.classList.remove('on'), { once: true });
}
// v3.4: link para score.html (explicação do score) com as cinco notas da loja já preenchidas — vale para consultor e franqueado
function linkScore(f, s) {
  const q = new URLSearchParams({ fra: f.fra, loja: f.nome || '', mes: mesBR(s.kpis && s.kpis.mes_ini) + ' a ' + mesBR(s.mes_ref),
    receita: s.sub.receita, margem: s.sub.margem, mix: s.sub.mix, ret: s.sub.ret, dado: s.sub.dado });
  return 'score.html?' + q.toString();
}
// v3.10: link para o simulador de alavancas com a coluna "Atual" preenchida pelo raio-x (médias dos 12 meses fechados).
// Mês = dia × dias; dias = 26 é premissa editável na página. O OnePet não mede fluxo, então conversão entra 100%.
// Loja com >=80% da receita identificada: clientes/dia = compradores e frequência = cupons identificados ÷ clientes ativos;
// senão clientes/dia = cupons/dia e frequência 1x. Nos dois casos clientes × frequência × ticket × dias = receita/mês.
function linkSimulador(f, s) {
  const k = (s && s.kpis) || {}, dias = 26;
  const cupons = +k.cupons_mes || 0, rec = +k.receita_mes || 0, ident = +k.ident_pct || 0, ativos = +k.ativos_ult || 0;
  if (!cupons || !rec) return null;
  const tk = k.ticket ? +k.ticket : rec / cupons;
  let modo = 'cupons', cli = cupons / dias, fq = 1;
  if (ident >= 80 && ativos > 0) { const f_ = (cupons * ident / 100) / ativos; if (f_ >= 1) { modo = 'ident'; fq = f_; cli = cupons / dias / fq; } }
  const r = (v, d) => String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
  const q = new URLSearchParams({ fra: f.fra, nome: f.nome || '', ref: mesBR(k.mes_ini) + ' a ' + mesBR(s.mes_ref), dias: dias,
    cli: r(cli, 1), conv: 100, tk: r(tk, 2), fq: r(fq, 2), ident: r(ident, 0), modo });
  return 'simulador-alavancas-pop.html?' + q.toString();
}
function cabecaLoja(f, s) {
  const Q = quartis(); const c = consAtiva(f.fra); const pc_ = perfilDaLoja(f.fra);
  const podeIniciar = !c && !ehFranq() && (ehAdmin() || (perfil.papeis || []).includes('consultor'));
  return `<div class="painel"><div class="ficha-topo">
    <div class="big">${s ? (s.score == null ? '<span style="font-size:22px;color:var(--tinta-suave)">sem nota</span>' : `<span class="score ${classeScore(s.score, Q)}" style="font-size:44px;height:auto;padding:6px 14px">${s.score}</span>`) : '—'}<small>nota · ${s ? mesBR(s.kpis.mes_ini) + ' a ' + mesBR(s.mes_ref) : 'sem raio-x'}</small></div>
    <div style="flex:1;min-width:240px">
      <h2 style="font-family:'Archivo';font-size:20px;line-height:1.2">${esc(f.nome || 'FRA ' + f.fra)}</h2>
      <div style="font-size:13px;color:var(--tinta-suave)">FRA ${f.fra} · ${esc((f.cidade || '') + (f.estado ? '/' + f.estado : ''))}${f.consultor ? ' · consultor ' + esc(f.consultor) + (pc_ ? '' : ' <span class="st lar" title="não existe perfil com esse nome na Central">sem login</span>') : ''}</div>
      ${s && s.sem_nota_motivo ? `<div style="margin-top:8px;font-size:13px;color:var(--verm)">⚠ ${esc(s.sem_nota_motivo)}</div>` : ''}
      ${s && (s.kpis.defasagem_meses || 0) >= 2 ? `<div style="margin-top:6px;font-size:13px;color:#a34608">⚠ Última venda carregada em ${mesBR(s.mes_ref)} — carregar o BI mais recente antes de usar estes números.</div>` : ''}
      ${s && s.kpis.mes_parcial ? `<div style="margin-top:6px;font-size:13px;color:#a34608">⚠ ${mesBR(s.kpis.mes_parcial.mes)} entrou com só ${s.kpis.mes_parcial.cupons} vendas (esperado ~${s.kpis.mes_parcial.esperado}) — carga parcial; a janela fechou em ${mesBR(s.mes_ref)}. Reenvie o BI completo com a recarga marcada.</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        ${c ? `<span class="st roxo" style="align-self:center">consultoria ativa desde ${dBR(c.inicio)} · ${esc(primeiro(nomeDe(c.consultor_id)))}</span>` : (podeIniciar && s ? '<button class="btn laranja" id="btnIniciarCons">▶ Iniciar consultoria de faturamento</button>' : '')}
        ${s && !ehFranq() ? `<button class="btn claro" id="btnRecalc"${FILA.has(f.fra) ? ' disabled' : ''}>${FILA.has(f.fra) ? '↻ na fila' : '↻ Recalcular'}</button>` : ''}
        ${s && s.score != null && s.sub ? `<a class="btn verde" id="btnScore" href="${linkScore(f, s)}" target="_blank" rel="noopener" title="O que cada nota mede, o que ela diz da loja e o que fazer primeiro">💡 Entenda aqui seu score (nota)</a>` : ''}
        ${s && linkSimulador(f, s) ? `<a class="btn claro" id="btnSimulador" href="${linkSimulador(f, s)}" target="_blank" rel="noopener" title="Clientes × conversão × ticket × frequência: quanto cada alavanca muda o faturamento desta loja">📈 Simular alavancas</a>` : ''}
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

function ligarFicha(f, s, R) {
  const bi = $('btnIniciarCons'); if (bi) bi.onclick = () => abrirModalConsultoria(f, s, R);
  const br_ = $('btnRecalc'); if (br_) br_.onclick = async () => { const { error } = await sb.from('raiox_fila').insert({ fra: f.fra, pedido_por: usuario.id }); if (error) return erro(error); FILA.add(f.fra); br_.disabled = true; br_.textContent = '↻ na fila'; toast('pedido registrado — a rotina atende em até 2 h'); };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= CONSULTORIA ================= */
function abrirModalConsultoria(f, s, R) {
  const consultores = PERFIS.filter(p => p.is_admin || (p.papeis || []).includes('consultor'));
  const sugerido = perfilDaLoja(f.fra) || perfil;
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
    const nR = itens.filter(m => m.tipo === 'reuniao').length, nF = itens.filter(m => m.tipo !== 'reuniao' && m.responsavel === 'franqueado').length, nT = itens.length - nR - nF;
    $('csPrev').innerHTML = `Vai criar <b>${nR} reuniões</b>, <b>${nT} tarefas do consultor</b> e <b>${nF} tarefas do franqueado</b> na agenda de ${esc(nomeDe($('csCons').value))}, de ${dBR($('csInicio').value)} a ${dBR(addDias($('csInicio').value, 90))}. Só admin edita ou cancela depois.`;
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
    const { data: ocup } = await sb.from('agenda_eventos').select('data,ini,fim').eq('user_id', consultor).is('cancelado_em', null).neq('tipo', 'tarefa').gte('data', inicio).lte('data', addDias(inicio, 95));
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
      return { titulo: m.titulo, data: inicio, tipo: 'tarefa', descricao, prazo: dia, responsavel: m.responsavel === 'franqueado' ? 'franqueado' : 'consultor' };
    });
    // uma transação no servidor: consultoria + itens da agenda, ou nada
    const { error: e2 } = await sb.rpc('raiox_iniciar_consultoria', { p_fra: f.fra, p_consultor: consultor, p_inicio: inicio, p_obs: obs, p_score_inicial: s.score, p_mes_ref: s.mes_ref, p_itens: linhas });
    if (e2) throw e2;
    fecharModal(); toast('consultoria criada: ' + linhas.length + ' itens na agenda');
    await recarregar('cons'); desenharRede(); desenharConsultorias(); abrirLoja(f.fra);
  } catch (e) { erro(e); $('csOk').disabled = false; }
}
/* andamento de uma consultoria a partir dos itens da agenda */
function andamento(c) {
  const hj = hojeISO(), its = ITENS.filter(i => i.consultoria_id === c.id && !/^Avalia/.test(i.titulo || ''));
  const tarefas = its.filter(i => i.tipo === 'tarefa'), reunioes = its.filter(i => i.tipo !== 'tarefa');
  const tFeitas = tarefas.filter(t => t.concluida), tVenc = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < hj);
  const rPass = reunioes.filter(r => r.data < hj), rFeitas = rPass.filter(r => r.concluida), rPend = rPass.filter(r => !r.concluida), rProx = reunioes.filter(r => r.data >= hj);
  const total = Math.max(1, Math.round((new Date(c.fim_previsto || c.inicio) - new Date(c.inicio)) / 864e5));
  const decorrido = Math.max(0, Math.min(total, Math.round((new Date(hj) - new Date(c.inicio)) / 864e5)));
  const pctTempo = 100 * decorrido / total, pctTarefas = tarefas.length ? 100 * tFeitas.length / tarefas.length : 0;
  const s = SNAPS[c.fra]; const dScore = (s && s.score != null && c.score_inicial != null) ? s.score - c.score_inicial : null;
  let ritmo = c.status !== 'ativa' ? { l: c.status, cls: 'cinza' } : pctTarefas >= pctTempo - 10 ? { l: 'no ritmo', cls: 'q1' } : pctTarefas >= pctTempo - 30 ? { l: 'atrasando', cls: 'lar' } : { l: 'travada', cls: 'q4' };
  if (c.status === 'ativa' && rPend.length >= 2) ritmo = { l: 'sem reunião', cls: 'q4' };
  const dias = Math.round((new Date(c.fim_previsto) - new Date(hj)) / 864e5);
  return { its, tarefas, reunioes, tFeitas, tVenc, rPass, rFeitas, rPend, rProx, total, decorrido, pctTempo, pctTarefas, dScore, ritmo, dias, semEvolucao: c.status === 'ativa' && decorrido >= 45 && dScore != null && dScore <= 0 };
}
function desenharConsultorias() {
  const ativas = CONS.filter(c => c.status === 'ativa'), concl = CONS.filter(c => c.status === 'concluida').length, canc = CONS.filter(c => c.status === 'cancelada').length;
  $('cntCons').textContent = ativas.length; $('cntCons').style.display = ativas.length ? '' : 'none';
  const AND = {}; CONS.forEach(c => { AND[c.id] = andamento(c); });
  const travadas = ativas.filter(c => AND[c.id].ritmo.cls === 'q4').length, vencidas = ativas.reduce((n, c) => n + AND[c.id].tVenc.length, 0), reunPend = ativas.reduce((n, c) => n + AND[c.id].rPend.length, 0);
  const subiram = ativas.filter(c => AND[c.id].dScore != null && AND[c.id].dScore > 0).length, comNota = ativas.filter(c => AND[c.id].dScore != null).length;
  $('csResumo').innerHTML = `<div class="kpi ok"><div class="n">${ativas.length}</div><div class="l">Ativas</div></div><div class="kpi${travadas ? ' alerta' : ''}"><div class="n">${travadas}</div><div class="l">Travadas / sem reunião</div></div><div class="kpi${vencidas ? ' atencao' : ''}"><div class="n">${vencidas}</div><div class="l">Tarefas vencidas</div></div><div class="kpi${reunPend ? ' atencao' : ''}"><div class="n">${reunPend}</div><div class="l">Reuniões sem confirmação</div></div><div class="kpi"><div class="n">${comNota ? subiram + '/' + comNota : '—'}</div><div class="l">Lojas com nota subindo</div></div><div class="kpi"><div class="n">${concl}</div><div class="l">Concluídas · ${canc} canceladas</div></div>`;
  const box = $('csLista');
  if (!CONS.length) { box.innerHTML = '<div class="vazio">Nenhuma consultoria ainda. Abra a ficha de uma loja e use "Iniciar consultoria de faturamento".</div>'; $('csGargalos').innerHTML = '<div class="vazio">Sem consultorias, sem gargalos.</div>'; return; }
  const barra = (p, cls) => `<span class="mini ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></span>${br(p, 0)}%`;
  box.innerHTML = `<div class="tw"><table class="rede"><thead><tr><th>Loja</th><th>Consultor</th><th>Período</th><th>Ritmo</th><th>Tarefas</th><th>Reuniões</th><th class="r">Nota</th><th>Próximo passo</th><th></th></tr></thead><tbody>` +
    CONS.map(c => { const f = frqDe(c.fra), a = AND[c.id];
      const prox = a.rProx[0] ? '📅 ' + dBR(a.rProx[0].data) + ' ' + esc(a.rProx[0].titulo) : (a.tarefas.filter(t => !t.concluida).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)))[0] ? '☐ ' + dBR(a.tarefas.filter(t => !t.concluida).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)))[0].prazo) + ' ' + esc(a.tarefas.filter(t => !t.concluida).sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)))[0].titulo) : '—');
      return `<tr data-fra="${c.fra}"><td><div class="t">${esc(f.nome)}</div><div class="s">FRA ${c.fra}</div></td><td>${esc(primeiro(nomeDe(c.consultor_id)))}</td><td><div class="t">${dBR(c.inicio)} → ${dBR(c.fim_previsto)}</div><div class="s">${c.status === 'ativa' ? 'dia ' + a.decorrido + ' de ' + a.total + (a.dias < 0 ? ' · venceu' : '') : c.status}</div></td>
        <td><span class="st ${a.ritmo.cls}">${a.ritmo.l}</span>${a.semEvolucao ? '<div class="s" style="color:var(--verm)">nota não subiu</div>' : ''}</td>
        <td><div class="t">${barra(a.pctTarefas, a.tVenc.length ? 'r' : '')}</div><div class="s">${a.tFeitas.length}/${a.tarefas.length} feitas${a.tVenc.length ? ' · <b style="color:var(--verm)">' + a.tVenc.length + ' vencida(s)</b>' : ''}</div></td>
        <td><div class="t">${a.rFeitas.length}/${a.reunioes.length}</div><div class="s">${a.rPend.length ? '<b style="color:#a34608">' + a.rPend.length + ' passada(s) sem confirmação</b>' : a.rProx.length + ' agendada(s)'}</div></td>
        <td class="r num">${c.score_inicial ?? '—'} → ${SNAPS[c.fra] && SNAPS[c.fra].score != null ? SNAPS[c.fra].score : '—'}${a.dScore != null ? `<div class="s" style="color:${a.dScore > 0 ? 'var(--verde)' : a.dScore < 0 ? 'var(--verm)' : 'inherit'}">${a.dScore > 0 ? '+' : ''}${a.dScore}</div>` : ''}</td>
        <td style="font-size:12px;max-width:220px">${prox}</td>
        <td>${ehAdmin() && c.status === 'ativa' ? `<button class="btn claro" data-enc="${c.id}" type="button" style="padding:4px 10px;font-size:12px">Encerrar</button> <button class="btn verm" data-canc="${c.id}" type="button" style="padding:4px 10px;font-size:12px">Cancelar</button>` : ehAdmin() && c.status === 'concluida' && (!c.resultado || c.resultado.veredito === 'sem leitura') ? `<button class="btn claro" data-recalc="${c.id}" type="button" style="padding:4px 10px;font-size:12px" title="Refaz o veredito com o raio-x mais recente">↻ Resultado</button>` : ''}</td></tr>`; }).join('') + '</tbody></table></div>';
  box.querySelectorAll('[data-recalc]').forEach(b => b.onclick = async () => {
    const c = CONS.find(x => x.id === b.dataset.recalc); b.disabled = true;
    const resultado = await calcularResultado(c);
    const { error } = await sb.from('raiox_consultorias').update({ resultado }).eq('id', c.id);
    if (error) { b.disabled = false; return erro(error); }
    await recarregar('cons'); desenharConsultorias(); toast('resultado: ' + resultado.veredito);
  });
  box.querySelectorAll('tr[data-fra]').forEach(tr => tr.onclick = ev => { if (ev.target.closest('button')) return; abrirLoja(+tr.dataset.fra); });
  box.querySelectorAll('[data-enc],[data-canc]').forEach(b => b.onclick = async () => {
    const id = b.dataset.enc || b.dataset.canc, status = b.dataset.enc ? 'concluida' : 'cancelada';
    const c = CONS.find(x => x.id === id), a_ = AND[id];
    // CANCELAR: só admin, e leva junto as tarefas e reuniões pendentes (rpc faz tudo numa transação)
    if (status === 'cancelada') {
      if (!ehAdmin()) return alert('Consultoria já iniciada só a franqueadora cancela.');
      const nT = a_.tarefas.length - a_.tFeitas.length, nR = a_.reunioes.length - a_.rFeitas.length;
      if (!confirm('Cancelar a consultoria da FRA ' + c.fra + '?\n\n' + nT + ' tarefa(s) e ' + nR + ' reunião(ões) pendentes são canceladas junto e somem da agenda.\nO que já foi concluído fica no histórico.')) return;
      b.disabled = true;
      const { data: r, error: eC } = await sb.rpc('raiox_cancelar_consultoria', { p_consultoria: id, p_obs: null });
      if (eC) { b.disabled = false; return erro(eC); }
      await recarregar('cons'); desenharConsultorias(); desenharRede();
      toast('cancelada · ' + ((r && r.tarefas) || 0) + ' tarefa(s) e ' + ((r && r.reunioes) || 0) + ' reunião(ões) canceladas');
      return;
    }
    const obs = prompt('Encerrar a consultoria como concluída. Observação final (opcional):', '');
    if (obs === null) return;
    const resultado = await calcularResultado(c);
    const { error } = await sb.from('raiox_consultorias').update({ status, encerrada_em: new Date().toISOString(), encerrada_por: usuario.id, resultado, encerramento_obs: obs || null }).eq('id', id);
    if (error) return erro(error);
    // marco na agenda da franquia: fica no histórico da loja
    if (resultado) { const { error: eM } = await sb.from('agenda_eventos').insert({ user_id: c.consultor_id, titulo: `Encerramento da consultoria · FRA ${c.fra} · ${resultado.veredito} (nota ${c.score_inicial ?? '—'} → ${resultado.score_fim ?? '—'})`, data: hojeISO(), ini: '00:00', fim: '00:00', tipo: 'compromisso', categoria: 'reuniao', descricao: resultado.texto + (obs ? '\n\nObservação: ' + obs : ''), franquia_fra: c.fra, consultoria_id: c.id, concluida: true, criado_por: usuario.id, participantes: [], subtarefas: [] }); if (eM) alert('Consultoria encerrada, mas o marco não entrou na agenda: ' + eM.message); }
    await recarregar('cons'); desenharConsultorias(); desenharRede(); toast(resultado ? 'encerrada: ' + resultado.veredito : 'cancelada');
  });
  // ---- gargalos da rede: quais tarefas mais vencem, quais consultores acumulam atraso, lojas sem evolução
  const porTarefa = {}, porCons = {};
  ativas.forEach(c => { const a = AND[c.id];
    a.tVenc.forEach(t => { const k = t.titulo; porTarefa[k] = porTarefa[k] || { n: 0, lojas: new Set() }; porTarefa[k].n++; porTarefa[k].lojas.add(c.fra); });
    const pc_ = porCons[c.consultor_id] = porCons[c.consultor_id] || { n: 0, venc: 0, reun: 0, trav: 0 }; pc_.n++; pc_.venc += a.tVenc.length; pc_.reun += a.rPend.length; if (a.ritmo.cls === 'q4') pc_.trav++; });
  const topT = Object.entries(porTarefa).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const topC = Object.entries(porCons).sort((a, b) => (b[1].venc + b[1].reun) - (a[1].venc + a[1].reun));
  const semEvo = ativas.filter(c => AND[c.id].semEvolucao), semBI = ativas.filter(c => SNAPS[c.fra] && SNAPS[c.fra].mes_ref === c.mes_ref_base && AND[c.id].decorrido >= 40);
  $('csGargalos').innerHTML = !ativas.length ? '<div class="vazio">Nenhuma consultoria ativa.</div>' : `<div class="grid2">
    <div><h3 style="font-size:14px;margin:0 0 6px">Tarefas que mais vencem</h3>${topT.length ? `<table class="lista"><tr><th>Tarefa</th><th class="r">Vencidas</th><th class="r">Lojas</th></tr>${topT.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="r num">${v.n}</td><td class="r num">${v.lojas.size}</td></tr>`).join('')}</table>` : '<div class="vazio">Nenhuma tarefa vencida.</div>'}</div>
    <div><h3 style="font-size:14px;margin:0 0 6px">Por consultor</h3><table class="lista"><tr><th>Consultor</th><th class="r">Ativas</th><th class="r">Tarefas vencidas</th><th class="r">Reuniões sem conf.</th><th class="r">Travadas</th></tr>${topC.map(([id, v]) => `<tr><td>${esc(nomeDe(id))}</td><td class="r num">${v.n}</td><td class="r num">${v.venc}</td><td class="r num">${v.reun}</td><td class="r num">${v.trav}</td></tr>`).join('')}</table></div></div>
    ${semEvo.length ? `<div class="lin" style="margin-top:10px"><span>Lojas com 45+ dias de consultoria e nota que não subiu</span><b>${semEvo.map(c => 'FRA ' + c.fra).join(', ')}</b></div>` : ''}
    ${semBI.length ? `<div class="lin"><span>Consultorias com 40+ dias e raio-x ainda do mês inicial (falta carregar o BI novo)</span><b>${semBI.map(c => 'FRA ' + c.fra).join(', ')}</b></div>` : ''}
    <p class="aviso" style="margin-top:10px">Ritmo = % de tarefas feitas contra % do prazo decorrido (no ritmo: até 10 pontos abaixo · atrasando: até 30 · travada: mais que isso). "Sem reunião" = 2 ou mais reuniões passadas sem marcação de realizada na agenda.</p>`;
  $('btnConsCSV').onclick = () => {
    const seg = v => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
    const l = ['fra;loja;consultor;inicio;fim_previsto;status;dia;ritmo;tarefas_total;tarefas_feitas;tarefas_vencidas;reunioes_total;reunioes_feitas;reunioes_sem_confirmacao;nota_inicial;nota_atual;proxima_reuniao'];
    CONS.forEach(c => { const a = AND[c.id], f = frqDe(c.fra), s = SNAPS[c.fra]; l.push([c.fra, seg(f.nome), seg(nomeDe(c.consultor_id)), c.inicio, c.fim_previsto, c.status, a.decorrido, a.ritmo.l, a.tarefas.length, a.tFeitas.length, a.tVenc.length, a.reunioes.length, a.rFeitas.length, a.rPend.length, c.score_inicial ?? '', s && s.score != null ? s.score : '', a.rProx[0] ? a.rProx[0].data : ''].join(';')); });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'consultorias_' + hojeISO() + '.csv'; a.click();
  };
}

/* ================= RESULTADO DA CONSULTORIA =================
   Compara o raio-x do início (mes_ref_base) com o mais recente e o que o franqueado avaliou.
   Veredito: positiva / negativa / sem diferença — regra fixa, sem opinião. */
async function calcularResultado(c) {
  const [{ data: base }, { data: fim }, { data: avs }, { data: itens }] = await Promise.all([
    c.mes_ref_base ? sb.from('raiox_snapshots').select('mes_ref,score,kpis').eq('fra', c.fra).eq('mes_ref', c.mes_ref_base).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('raiox_snapshots_atual').select('mes_ref,score,kpis').eq('fra', c.fra).maybeSingle(),
    sb.from('raiox_avaliacoes').select('semana,nota,andamento').eq('consultoria_id', c.id).order('semana'),
    sb.from('agenda_eventos').select('tipo,concluida,prazo,data').eq('consultoria_id', c.id).is('cancelado_em', null)
  ]);
  const d = (k) => (base && fim && base.kpis && fim.kpis && base.kpis[k] != null && fim.kpis[k] != null) ? fim.kpis[k] - base.kpis[k] : null;
  const dPct = (k) => (base && fim && base.kpis && base.kpis[k]) ? 100 * (fim.kpis[k] / base.kpis[k] - 1) : null;
  const dScore = (base && fim && base.score != null && fim.score != null) ? fim.score - base.score : null;
  const dLucro = dPct('lucro_mes'), dRec = dPct('receita_mes'), dMg = d('margem_adj'), dId = d('ident_pct'), dRet = d('ret45');
  const tarefas = (itens || []).filter(i => i.tipo === 'tarefa'), reun = (itens || []).filter(i => i.tipo !== 'tarefa');
  const notas = (avs || []).map(a => a.nota), mediaAv = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
  const mesmoMes = !!(base && fim && base.mes_ref === fim.mes_ref);
  let veredito, motivo;
  if (mesmoMes || (dScore == null && dLucro == null)) { veredito = 'sem leitura'; motivo = 'O raio-x atual ainda é o mesmo do início (' + mesBR(c.mes_ref_base) + ') — não há mês novo fechado para comparar. Recalcule depois da próxima carga e reabra o resultado.'; }
  else if ((dScore != null && dScore >= 5) || (dLucro != null && dLucro >= 5 && (dScore == null || dScore >= 0))) { veredito = 'positiva'; motivo = `Nota ${base.score ?? '—'} → ${fim.score ?? '—'} (${dScore == null ? 'sem nota' : (dScore >= 0 ? '+' : '') + dScore}) e lucro bruto/mês ${dLucro == null ? '—' : (dLucro >= 0 ? '+' : '') + br(dLucro, 1) + '%'}.`; }
  else if ((dScore != null && dScore <= -5) || (dLucro != null && dLucro <= -5)) { veredito = 'negativa'; motivo = `Nota ${base.score ?? '—'} → ${fim.score ?? '—'} (${dScore == null ? 'sem nota' : dScore}) e lucro bruto/mês ${dLucro == null ? '—' : (dLucro >= 0 ? '+' : '') + br(dLucro, 1) + '%'} — os indicadores pioraram no período.`; }
  else { veredito = 'não fez diferença'; motivo = `Nota ${base.score ?? '—'} → ${fim.score ?? '—'} (${dScore == null ? 'sem nota' : (dScore >= 0 ? '+' : '') + dScore}) e lucro bruto/mês ${dLucro == null ? '—' : (dLucro >= 0 ? '+' : '') + br(dLucro, 1) + '%'} — variação dentro do ruído normal.`; }
  const texto = `Resultado da consultoria de faturamento · FRA ${c.fra} · ${dBR(c.inicio)} a ${hojeISO().split('-').reverse().join('/')}: ${veredito.toUpperCase()}. ${motivo}` +
    (base && fim && !mesmoMes ? ` Receita/mês ${dRec == null ? '—' : (dRec >= 0 ? '+' : '') + br(dRec, 1) + '%'}, margem ajustada ${dMg == null ? '—' : (dMg >= 0 ? '+' : '') + br(dMg, 1) + ' pp'}, receita identificada ${dId == null ? '—' : (dId >= 0 ? '+' : '') + br(dId, 1) + ' pp'}, ração em dia ${dRet == null ? '—' : (dRet >= 0 ? '+' : '') + br(dRet, 1) + ' pp'}.` : '') +
    ` Plano: ${tarefas.filter(t => t.concluida).length}/${tarefas.length} tarefas feitas, ${reun.filter(r => r.concluida).length}/${reun.length} reuniões realizadas.` +
    (mediaAv != null ? ` Avaliação do franqueado: média ${br(mediaAv, 1)}/5 em ${notas.length} semana(s), última "${(avs[avs.length - 1] || {}).andamento || '—'}".` : ' O franqueado não avaliou nenhuma semana.');
  return { veredito, texto, score_ini: base ? base.score : c.score_inicial, score_fim: fim ? fim.score : null, mes_base: base ? base.mes_ref : c.mes_ref_base, mes_fim: fim ? fim.mes_ref : null,
    d_score: dScore, d_lucro_pct: dLucro, d_receita_pct: dRec, d_margem_pp: dMg, d_ident_pp: dId, d_ret45_pp: dRet,
    tarefas: tarefas.length, tarefas_feitas: tarefas.filter(t => t.concluida).length, reunioes: reun.length, reunioes_feitas: reun.filter(r => r.concluida).length,
    avaliacoes: notas.length, avaliacao_media: mediaAv, calculado_em: new Date().toISOString() };
}

/* ===== FRANQUEADOS (admin = rede toda; consultor = carteira dele) ===== */
async function chamarFranq(corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(FN_FRANQ, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || ('HTTP ' + r.status));
  return j;
}
async function desenharFranqueados() {
  const box = $('fqLista');
  box.innerHTML = '<div class="vazio">carregando\u2026</div>';
  let d;
  try { d = await chamarFranq({ acao: 'listar' }); }
  catch (e) { box.innerHTML = '<div class="vazio">N\u00e3o deu para carregar a lista: ' + esc(e.message || e) + '</div>'; return; }
  FQ_PAPEL = d.papel; FQ_CARTEIRA = d.carteira || []; FQ_LISTA = {};
  const lista = d.franqueados || [], oc = d.ocupacao || {};
  lista.forEach(p => { FQ_LISTA[p.id] = p; });
  const sub = $('fqSub');
  if (sub) sub.textContent = FQ_PAPEL === 'admin'
    ? 'cada login v\u00ea s\u00f3 o raio-x e a consultoria das lojas ligadas a ele; nada mais da Central'
    : 'voc\u00ea cadastra e gerencia apenas franqueados das ' + FQ_CARTEIRA.length + ' lojas da sua carteira';
  const cheias = Object.keys(oc).filter(f => oc[f] >= 3).map(Number).sort((a, b) => a - b);
  const topo = cheias.length
    ? `<div class="s" style="margin-bottom:8px">Limite: <b>3 usu\u00e1rios por loja</b>. Lojas no limite: ${cheias.map(f => 'FRA ' + f).join(', ')}.</div>`
    : `<div class="s" style="margin-bottom:8px">Limite: <b>3 usu\u00e1rios por loja</b> (dono + at\u00e9 2 pessoas da equipe, todos com a mesma vis\u00e3o).</div>`;
  box.innerHTML = topo + (lista.length
    ? `<table class="lista"><tr><th>Nome</th><th>E-mail (login)</th><th>\u00daltimo acesso</th><th>Lojas</th><th></th></tr>` + lista.map(p => `<tr>
        <td><div class="t">${esc(p.nome)}${p.banido ? ' <span class="st verm">desativado</span>' : ''}</div><div class="s" style="font-family:monospace">${p.id.slice(0, 8)}\u2026</div></td>
        <td><div class="t" style="font-family:monospace;font-size:12.5px;word-break:break-all">${p.email ? esc(p.email) : '<span class="st lar">sem e-mail</span>'}</div></td>
        <td>${p.ult ? `<div class="t">${dBR(p.ult)}</div><div class="s">${p.n30} acesso(s) em 30 dias</div>` : '<span class="st lar">nunca entrou</span>'}</td>
        <td>${p.lojas.length ? p.lojas.map(f => `<span class="st cinza" title="${esc(frqDe(f).nome)} \u00b7 ${oc[f] || 0}/3 usu\u00e1rios">FRA ${f} <small>${oc[f] || 0}/3</small></span>`).join(' ') : '<span class="st lar">sem loja</span>'}</td>
        <td style="white-space:nowrap"><button class="btn claro" data-fqlojas="${p.id}" type="button" style="padding:4px 10px;font-size:12px">Lojas</button> <button class="btn claro" data-fqsenha="${p.id}" type="button" style="padding:4px 10px;font-size:12px">Senha</button> <button class="btn verm" data-fqdes="${p.id}" type="button" style="padding:4px 10px;font-size:12px">Desativar</button></td></tr>`).join('') + '</table>'
    : `<div class="vazio">${FQ_PAPEL === 'admin' ? 'Nenhum franqueado cadastrado.' : 'Nenhum franqueado nas lojas da sua carteira ainda.'} Use "+ Novo franqueado".</div>`);
  box.querySelectorAll('[data-fqlojas]').forEach(b => b.onclick = () => { const p = FQ_LISTA[b.dataset.fqlojas];
    const v = prompt('Lojas de ' + p.nome + ' (n\u00fameros de FRA separados por v\u00edrgula)' + (FQ_PAPEL === 'admin' ? '' : ' \u2014 s\u00f3 FRAs da sua carteira') + ':', p.lojas.join(', ')); if (v === null) return;
    chamarFranq({ acao: 'lojas', user_id: p.id, fras: v.split(/[,\s;]+/).filter(Boolean) }).then(() => { toast('lojas atualizadas'); desenharFranqueados(); }).catch(erro); });
  box.querySelectorAll('[data-fqsenha]').forEach(b => b.onclick = () => { const p = FQ_LISTA[b.dataset.fqsenha];
    const v = prompt('Nova senha para ' + p.nome + (p.email ? ' (' + p.email + ')' : '') + ' \u2014 m\u00ednimo 8 caracteres:', senhaInicial()); if (!v) return;
    chamarFranq({ acao: 'senha', user_id: p.id, senha: v }).then(() => alert('Senha redefinida.\n\nE-mail: ' + (p.email || '\u2014') + '\nSenha: ' + v + '\n\nAnote \u2014 ela n\u00e3o aparece de novo.')).catch(erro); });
  box.querySelectorAll('[data-fqdes]').forEach(b => b.onclick = () => { const p = FQ_LISTA[b.dataset.fqdes];
    if (!confirm('Desativar o login de ' + p.nome + (p.email ? ' (' + p.email + ')' : '') + '? Ele n\u00e3o consegue mais entrar e as lojas s\u00e3o desligadas.')) return;
    chamarFranq({ acao: 'desativar', user_id: p.id }).then(() => { toast('desativado'); desenharFranqueados(); }).catch(erro); });
}
function senhaInicial() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const u = new Uint32Array(10); crypto.getRandomValues(u); return 'Pop' + [...u].map(x => A[x % A.length]).join('') + '!'; }
$('btnNovoFranq').onclick = () => {
  const daCarteira = ehAdmin() ? null : new Set(FQ_CARTEIRA.length ? FQ_CARTEIRA : carteiraFras());
  const lojas = FRQ.filter(f => f.fra > 0 && f.ativo !== false && (!daCarteira || daCarteira.has(f.fra))).sort((a, b) => a.fra - b.fra);
  if (!lojas.length) { alert('Voc\u00ea n\u00e3o tem lojas na sua carteira \u2014 fale com a franqueadora.'); return; }
  $('mBox').innerHTML = `<h3>+ Novo login de franqueado</h3>
    <div class="form">
      <label>Nome</label><input id="nfNome" placeholder="Nome do franqueado">
      <label>E-mail (login)</label><input id="nfEmail" type="email" placeholder="franqueado@email.com">
      <label>Senha inicial</label><input id="nfSenha" type="text" value="${senhaInicial()}">
      <label>Lojas (FRA)</label><select id="nfLojas" multiple size="8">${lojas.map(f => `<option value="${f.fra}">FRA ${f.fra} · ${esc(f.nome)}</option>`).join('')}</select>
      <p style="font-size:12px;color:var(--tinta-suave)">Segure Ctrl/Cmd para escolher mais de uma loja. O franqueado entra no mesmo endereço do Raio-X e vê só essas lojas.${daCarteira ? ' Aparecem apenas as lojas da sua carteira.' : ''}</p>
    </div>
    <div class="acoes"><button class="btn claro" id="mFechar" type="button">Cancelar</button><button class="btn laranja" id="nfOk" type="button">Criar login</button></div>`;
  $('mBg').classList.add('on'); $('mFechar').onclick = fecharModal;
  $('nfOk').onclick = async () => {
    const fras = [...$('nfLojas').selectedOptions].map(o => +o.value);
    $('nfOk').disabled = true;
    try { await chamarFranq({ acao: 'criar', nome: $('nfNome').value.trim(), email: $('nfEmail').value.trim(), senha: $('nfSenha').value, fras });
      const senha = $('nfSenha').value, email = $('nfEmail').value.trim();
      fecharModal(); const { data: pf } = await sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults,cor').order('criado_em'); PERFIS = (pf || []).filter(p => !/robo\.raiox/i.test(p.nome || '')); await desenharFranqueados();
      alert('Login criado.\n\nE-mail: ' + email + '\nSenha: ' + senha + '\nEndereço: ' + location.origin + location.pathname + '\n\nAnote — a senha não aparece de novo (dá para redefinir).');
    } catch (e) { erro(e); $('nfOk').disabled = false; }
  };
};

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
      if (tipo === 'estoqueparado') { t = 'estoqueparado'; resumo = MOTOR.analisaEstoqueParadoNativo(rows); }
      else if (tipo === 'abcprod') {
        const A = rows.filter(r => (r['Classe'] || '').trim() === 'A').map(r => ({ desc: r['Descrição'] || r['Descricao'], est: MOTOR.n0(r['Estoque']), vv: MOTOR.n0(r['Valor Vendido']), qv: MOTOR.n0(r['Qtd.Vendida'] || r['Qtd Vendida']) }));
        const zer = A.filter(r => r.est <= 0).sort((a, b) => b.vv - a.vv);
        const par = MOTOR.analisaEstoqueParado(rows, periodoDias);
        const valZer = zer.reduce((x, r) => x + r.vv, 0);
        t = 'abcprod'; resumo = { totalA: A.length, nZer: zer.length, valZer, nNeg: zer.filter(r => r.est < 0).length, top: zer.slice(0, 15), ruptura: { totalA: A.length, nZer: zer.length, valZer, nNeg: zer.filter(r => r.est < 0).length, top: zer.slice(0, 8) }, parado: par };
      }
      else if (tipo === 'estoqueatual') { const r = MOTOR.analisaEstoqueAtual(rows, 'FR ' + fra); t = 'estoqueatual'; resumo = r && Object.assign({ nItens: r.nSKUs, valorEstoque: r.valorCusto }, r); }
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
  if (a.dataset.v === 'franq') desenharFranqueados();
});
iniciar();
