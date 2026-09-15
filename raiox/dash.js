/* Raio-X POP · dash.js · v1.0 · 15/09/2026
Dashboard de acompanhamento da consultoria para diretoria e supervisores.
Lê direto da Central (RLS): raiox_snapshots_atual, raiox_snapshots (só colunas leves), raiox_consultorias,
agenda_eventos com consultoria_id, raiox_avaliacoes, franquias, perfis, franqueado_lojas. Nunca carrega `dados`.
As regras de ritmo/gargalo são as mesmas do raiox/app.js (andamento). */
'use strict';
const SUPABASE_URL = 'https://klcxavgxonpsbsbzqcil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsY3hhdmd4b25wc2JzYnpxY2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzQwMDAsImV4cCI6MjA5OTExMDAwMH0.UJK09SljKG0tJqDcGYQfuk41i1SN8GymL1hTTeE2ruY';
const VERSAO = 'dash v1.1';
const PAPEIS_OK = ['supervisor', 'diretoria'];

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => 'R$ ' + br(Math.round(n || 0));
const kmil = n => n >= 995000 ? 'R$ ' + br(n / 1e6, 2) + ' mi' : n >= 1000 ? 'R$ ' + br(n / 1000, 1) + ' mil' : money(n);
const pc = (n, d = 1) => (n == null || !isFinite(n)) ? '—' : br(n, d) + '%';
const sinal = (n, d = 0, suf = '') => n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + br(n, d) + suf;
const dBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const mesBR = ym => { const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return ym ? M[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4) : '—'; };
const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 864e5);
const segunda = iso => { const d = new Date(iso + 'T12:00:00'); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d.toISOString().slice(0, 10); };
const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const primeiro = n => String(n || '').split(' ')[0];
const seg = v => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
function toast(t) { const el = $('toast'); el.textContent = t || 'ok'; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1600); }
function erro(e) { console.error(e); alert('Erro: ' + (e.message || e)); }
function baixarCSV(nome, linhas) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = nome + '_' + hojeISO() + '.csv'; a.click(); }

let sb, usuario, perfil;
let PERFIS = [], FRQ = [], SNAPS = {}, CONS = [], ITENS = [], AVS = [], HIST = [], FQL = [], ACESSOS = [];
const F = { cons: '', uf: '', per: 30 };
const HOJE = hojeISO();
const SEMANA = segunda(HOJE);

const ehAdmin = () => !!(perfil && perfil.is_admin);
const podeVer = () => ehAdmin() || (perfil && (perfil.papeis || []).some(p => PAPEIS_OK.includes(p)));
const nomeDe = uid => ((PERFIS.find(p => p.id === uid) || {}).nome || '—');
const frqDe = fra => FRQ.find(f => f.fra === fra) || { fra, nome: 'FRA ' + fra };
function perfilDoConsultor(txt) { const t = semAcento(txt); if (!t) return null; return PERFIS.find(p => semAcento(primeiro(p.nome_sults || p.nome)) === t.split(' ')[0]) || null; }
const linkLoja = (fra, aba) => `./?fra=${fra}${aba ? '&aba=' + aba : ''}`;

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
  $('login').style.display = 'none'; $('btnSair').style.display = ''; $('btnImprimir').style.display = '';
  if (!podeVer()) {
    $('app').style.display = 'none';
    const d = document.createElement('div'); d.className = 'negado';
    d.innerHTML = `<h2 style="font-size:18px;color:var(--verde2)">Painel restrito</h2><p style="font-size:13.5px;color:var(--tinta-suave)">Este acompanhamento é da diretoria e dos supervisores de consultores. Seu perfil (${esc(perfil.nome)}) não tem o papel <code>supervisor</code> nem <code>diretoria</code>. Peça a um admin para incluir o papel no seu perfil na Central, ou use o <a href="./">Raio-X</a> da sua carteira.</p>`;
    document.querySelector('main').appendChild(d); return;
  }
  $('app').style.display = '';
  sb.from('acessos').insert({ user_id: usuario.id, origem: 'dash' }).then(() => {});
  try { await carregarTudo(); montarFiltros(); desenhar(); } catch (e) { erro(e); }
}
$('loginForm').onsubmit = async ev => {
  ev.preventDefault(); const b = $('loginBtn'), er = $('loginErro'); b.disabled = true; er.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginSenha').value });
  b.disabled = false;
  if (error) { er.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha inválidos.' : error.message; return; }
  await entrou(data.session);
};
$('btnSair').onclick = async () => { await sb.auth.signOut(); };
$('btnImprimir').onclick = () => window.print();
$('btnRecarregar').onclick = async () => { $('btnRecarregar').disabled = true; try { await carregarTudo(); desenhar(); toast('atualizado'); } catch (e) { erro(e); } $('btnRecarregar').disabled = false; };

/* ================= dados ================= */
async function fetchAll(builder, step = 1000) {
  let all = [], from = 0;
  while (true) { const { data, error } = await builder().range(from, from + step - 1); if (error) throw error; all = all.concat(data || []); if (!data || data.length < step) break; from += step; }
  return all;
}
async function carregarTudo() {
  const [pf, fq, sn, cs, it, av, hs, fl, ac] = await Promise.all([
    sb.from('perfis').select('id,nome,is_admin,papeis,nome_sults').order('criado_em'),
    sb.from('franquias').select('fra,nome,cidade,estado,consultor,ativo').order('fra'),
    fetchAll(() => sb.from('raiox_snapshots_atual').select('fra,mes_ref,calculado_em,score,sem_nota_motivo,sub,kpis').order('fra')),
    sb.from('raiox_consultorias').select('*').order('criado_em', { ascending: false }),
    fetchAll(() => sb.from('agenda_eventos').select('id,consultoria_id,titulo,tipo,data,prazo,concluida,concluida_em,user_id,franquia_fra').not('consultoria_id', 'is', null).order('data')),
    fetchAll(() => sb.from('raiox_avaliacoes').select('id,consultoria_id,fra,user_id,semana,nota,andamento,comentario,sugestao,resposta,respondido_por,respondido_em,criado_em').order('semana', { ascending: false })),
    // histórico leve: só o que a curva precisa (sem `dados`)
    fetchAll(() => sb.from('raiox_snapshots').select('fra,mes_ref,score,receita:kpis->receita_mes,margem:kpis->margem_adj,lucro:kpis->lucro_mes').order('fra').order('mes_ref')),
    sb.from('franqueado_lojas').select('user_id,fra'),
    fetchAll(() => sb.from('acessos').select('user_id,em,origem').gte('em', addDias(HOJE, -60)).order('em', { ascending: false }).order('id'))
  ]);
  if (pf.error) throw pf.error; if (fq.error) throw fq.error; if (cs.error) throw cs.error; if (fl.error) throw fl.error;
  PERFIS = (pf.data || []).filter(p => !/robo\.raiox/i.test(p.nome || ''));
  FRQ = fq.data || [];
  SNAPS = {}; (sn || []).forEach(s => { s.kpis = s.kpis || {}; SNAPS[s.fra] = s; });
  CONS = cs.data || [];
  ITENS = it || [];
  AVS = av || [];
  HIST = (hs || []).map(h => ({ fra: h.fra, mes_ref: h.mes_ref, score: h.score, receita: +h.receita || null, margem: h.margem == null ? null : +h.margem, lucro: +h.lucro || null }));
  FQL = fl.data || [];
  ACESSOS = ac || [];
  $('atualizado').textContent = 'dados de ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function montarFiltros() {
  const sc = $('fCons'); const cs = [...new Set(FRQ.map(f => (f.consultor || '').trim()).filter(Boolean))].sort();
  sc.innerHTML = '<option value="">Todos os consultores</option>' + cs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const su = $('fUf'); const ufs = [...new Set(FRQ.map(f => f.estado).filter(Boolean))].sort();
  su.innerHTML = '<option value="">Todas as UFs</option>' + ufs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  sc.onchange = () => { F.cons = sc.value; desenhar(); }; su.onchange = () => { F.uf = su.value; desenhar(); };
  const P = { 7: '7 dias', 30: '30 dias', 90: '90 dias', 0: 'tudo' };
  const fp = $('fPer'); fp.innerHTML = Object.keys(P).map(k => `<button class="pill${+k === F.per ? ' on' : ''}" data-p="${k}" type="button">${P[k]}</button>`).join('');
  fp.querySelectorAll('.pill').forEach(b => b.onclick = () => { F.per = +b.dataset.p; fp.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b)); desenhar(); });
}

/* ================= regras (iguais ao app.js) ================= */
function quartis(snaps) {
  const v = snaps.filter(s => s.score != null).map(s => s.score).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { q1: q(.75), q2: q(.5), q3: q(.25), n: v.length, media: media(v) };
}
const classeScore = (s, Q) => s == null ? 'sn' : !Q ? 'q2' : s >= Q.q1 ? 'q1' : s >= Q.q2 ? 'q2' : s >= Q.q3 ? 'q3' : 'q4';
function andamento(c) {
  const its = ITENS.filter(i => i.consultoria_id === c.id);
  const tarefas = its.filter(i => i.tipo === 'tarefa'), reunioes = its.filter(i => i.tipo !== 'tarefa');
  const tFeitas = tarefas.filter(t => t.concluida), tVenc = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < HOJE);
  const rPass = reunioes.filter(r => r.data < HOJE), rFeitas = rPass.filter(r => r.concluida), rPend = rPass.filter(r => !r.concluida), rProx = reunioes.filter(r => r.data >= HOJE);
  const total = Math.max(1, diasEntre(c.inicio, c.fim_previsto || c.inicio));
  const decorrido = Math.max(0, Math.min(total, diasEntre(c.inicio, HOJE)));
  const pctTempo = 100 * decorrido / total, pctTarefas = tarefas.length ? 100 * tFeitas.length / tarefas.length : 0;
  const s = SNAPS[c.fra]; const dScore = (s && s.score != null && c.score_inicial != null) ? s.score - c.score_inicial : null;
  let ritmo = c.status !== 'ativa' ? { l: c.status, cls: 'cinza' } : pctTarefas >= pctTempo - 10 ? { l: 'no ritmo', cls: 'q1' } : pctTarefas >= pctTempo - 30 ? { l: 'atrasando', cls: 'lar' } : { l: 'travada', cls: 'q4' };
  if (c.status === 'ativa' && rPend.length >= 2) ritmo = { l: 'sem reunião', cls: 'q4' };
  const avs = AVS.filter(a => a.consultoria_id === c.id).sort((a, b) => b.semana.localeCompare(a.semana));
  const ultAv = avs[0] || null;
  const piorou2 = avs.length >= 2 && avs[0].andamento === 'piorou' && avs[1].andamento === 'piorou';
  const diasSemAvaliar = ultAv ? diasEntre(ultAv.semana, HOJE) : decorrido;
  return { its, tarefas, reunioes, tFeitas, tVenc, rPass, rFeitas, rPend, rProx, total, decorrido, pctTempo, pctTarefas, dScore, ritmo, avs, ultAv, piorou2, diasSemAvaliar,
    semEvolucao: c.status === 'ativa' && decorrido >= 45 && dScore != null && dScore <= 0,
    semBI: c.status === 'ativa' && s && s.mes_ref === c.mes_ref_base && decorrido >= 40,
    temFranq: !!c.franqueado_id || FQL.some(x => x.fra === c.fra) };
}

/* ================= recorte pelos filtros ================= */
function recorte() {
  const lojasUf = FRQ.filter(f => f.ativo !== false && f.fra > 0 && (!F.uf || f.estado === F.uf));
  const lojas = lojasUf.filter(f => !F.cons || (f.consultor || '').trim() === F.cons);
  const fras = new Set(lojas.map(f => f.fra));
  // consultorias: pela carteira (cadastro da loja) OU pelo consultor responsável pela consultoria — os dois podem diferir
  const pid = F.cons ? (perfilDoConsultor(F.cons) || {}).id : null;
  const frasUf = new Set(lojasUf.map(f => f.fra));
  const cons = CONS.filter(c => frasUf.has(c.fra) && (!F.cons || fras.has(c.fra) || (pid && c.consultor_id === pid)));
  cons.forEach(c => fras.add(c.fra));
  const AND = {}; cons.forEach(c => { AND[c.id] = andamento(c); });
  const ids = new Set(cons.map(c => c.id));
  const itens = ITENS.filter(i => ids.has(i.consultoria_id));
  const avs = AVS.filter(a => ids.has(a.consultoria_id));
  const snaps = lojas.map(f => SNAPS[f.fra]).filter(Boolean);
  const desde = F.per ? addDias(HOJE, -F.per) : '0000-00-00';
  return { lojas, fras, cons, AND, itens, avs, snaps, desde, ativas: cons.filter(c => c.status === 'ativa') };
}

/* ================= desenho ================= */
function desenhar() {
  const R = recorte();
  const AL = alertas(R);
  $('conteudo').innerHTML = secAlertas(R, AL) + secRede(R) + secExec(R) + secSatisf(R) + secResult(R) + secEvol(R) + secAcessos(R);
  $('nAlertas').textContent = AL.length; $('nAlertas').style.display = AL.length ? '' : 'none';
  ligar(R, AL);
}
const kpi = (n, l, cls = '', d = '') => `<div class="kpi ${cls}"><div class="n">${n}</div><div class="l">${l}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const barra = (p, cls) => `<span class="mini ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></span>${br(p || 0, 0)}%`;
const estrelas = n => `<span class="estrelas" title="${n}/5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
const lojaCel = (fra, c) => { const f = frqDe(fra); return `<div class="t">${esc(f.nome)}</div><div class="s">FRA ${fra}${f.estado ? ' · ' + esc(f.estado) : ''}${c ? ' · ' + esc(primeiro(nomeDe(c.consultor_id))) : ''}</div>`; };
const titAcao = (id, csv) => `<span class="acoes"><button class="btn claro mini" data-csv="${csv}" type="button">⬇ CSV</button></span>`;

/* ---- 6. alertas ---- */
function alertas(R) {
  const L = [];
  const add = (p, c, aba, motivo, dias, s) => L.push({ p, fra: c.fra, cid: c.id, aba, motivo, dias: dias || 0, s: s || '' });
  R.ativas.forEach(c => {
    const a = R.AND[c.id];
    if (a.ritmo.cls === 'q4') add(1, c, 'tarefas', `Consultoria <b>${a.ritmo.l}</b>: ${a.tFeitas.length}/${a.tarefas.length} tarefas feitas no dia ${a.decorrido} de ${a.total}${a.rPend.length ? ' · ' + a.rPend.length + ' reunião(ões) passada(s) sem confirmação' : ''}`, a.decorrido);
    if (a.ultAv && a.ultAv.nota <= 2) add(1, c, 'avaliacao', `Franqueado deu nota <b>${a.ultAv.nota}/5</b> na semana de ${dBR(a.ultAv.semana)}${a.ultAv.resposta ? '' : ' · <b>sem resposta do consultor</b>'}`, diasEntre(a.ultAv.semana, HOJE));
    if (a.piorou2) add(1, c, 'avaliacao', `Franqueado diz que <b>piorou</b> duas semanas seguidas`, diasEntre(a.avs[1].semana, HOJE));
    const semResp = a.avs.filter(v => !v.resposta && (v.sugestao || v.nota <= 2 || v.andamento === 'piorou') && diasEntre(v.criado_em, HOJE) > 2);
    if (semResp.length) add(semResp.some(v => v.nota <= 2) ? 1 : 2, c, 'avaliacao', `${semResp.length} avaliação(ões) com sugestão ou nota baixa <b>sem resposta há mais de 2 dias</b>`, diasEntre(semResp[semResp.length - 1].criado_em, HOJE));
    if (a.tVenc.length) { const maisAntiga = Math.max(...a.tVenc.map(t => diasEntre(t.prazo, HOJE))); add(maisAntiga > 14 ? 1 : 2, c, 'tarefas', `<b>${a.tVenc.length} tarefa(s) vencida(s)</b> — a mais antiga há ${maisAntiga} dia(s): ${esc(a.tVenc.sort((x, y) => x.prazo.localeCompare(y.prazo))[0].titulo)}`, maisAntiga); }
    if (a.rPend.length === 1 && a.ritmo.cls !== 'q4') add(2, c, 'tarefas', `Reunião de ${dBR(a.rPend[0].data)} (${esc(a.rPend[0].titulo)}) <b>sem confirmação</b> de realizada`, diasEntre(a.rPend[0].data, HOJE));
    if (a.temFranq && a.decorrido >= 10 && a.diasSemAvaliar >= 14) add(2, c, 'avaliacao', a.ultAv ? `Franqueado <b>não avalia há ${a.diasSemAvaliar} dias</b>` : `Franqueado <b>nunca avaliou</b> em ${a.decorrido} dias de consultoria`, a.diasSemAvaliar);
    if (a.semEvolucao) add(2, c, 'consultoria', `45+ dias de consultoria e <b>nota não subiu</b> (${c.score_inicial} → ${SNAPS[c.fra].score})`, a.decorrido);
    if (a.semBI) add(2, c, 'consultoria', `40+ dias e o raio-x <b>ainda é do mês inicial</b> (${mesBR(c.mes_ref_base)}) — falta carregar o BI novo`, a.decorrido);
    const s = SNAPS[c.fra]; if (s && s.kpis.mes_parcial) add(2, c, 'diagnostico', `Loja em consultoria com <b>carga parcial</b> de ${mesBR(s.kpis.mes_parcial.mes)} — reenviar o BI completo`, 0);
    if (!a.temFranq && a.decorrido >= 3) add(3, c, 'consultoria', `Consultoria sem <b>login de franqueado</b> ligado — ele não consegue avaliar o processo`, a.decorrido);
  });
  return L.sort((x, y) => x.p - y.p || y.dias - x.dias);
}
function secAlertas(R, AL) {
  const n1 = AL.filter(a => a.p === 1).length, n2 = AL.filter(a => a.p === 2).length;
  return `<section id="s-alertas"><h2>🔔 Agir hoje ${titAcao('alertas', 'alertas')}</h2><div class="sub">${R.ativas.length} consultoria(s) ativa(s) no recorte · ${n1} urgente(s) · ${n2} para esta semana. Clique para abrir a loja no Raio-X.</div>
<div class="painel">${AL.length ? AL.map(a => { const c = R.cons.find(x => x.id === a.cid); return `<a class="alerta-item" href="${linkLoja(a.fra, a.aba)}" style="text-decoration:none;color:inherit"><span class="pri p${a.p}"></span><div class="m"><b>${esc(frqDe(a.fra).nome)}</b> <span class="s">FRA ${a.fra} · ${esc(primeiro(nomeDe(c.consultor_id)))}</span><div>${a.motivo}</div></div><span class="dias">${a.dias ? 'há ' + a.dias + ' d' : ''}</span></a>`; }).join('')
    : `<div class="vazio">${R.ativas.length ? 'Nenhum alerta: consultorias no ritmo, franqueados respondidos, nada vencido.' : 'Nenhuma consultoria ativa neste recorte. Alertas aparecem quando um consultor inicia a consultoria de faturamento de uma loja no Raio-X.'}</div>`}</div></section>`;
}

/* ---- 1. rede ---- */
function secRede(R) {
  const Q = quartis(R.snaps);
  const semNota = R.snaps.filter(s => s.score == null).length, parcial = R.snaps.filter(s => s.kpis.mes_parcial).length, defas = R.snaps.filter(s => (s.kpis.defasagem_meses || 0) >= 2).length;
  const semDado = R.lojas.length - R.snaps.length;
  const concl = R.cons.filter(c => c.status === 'concluida').length, canc = R.cons.filter(c => c.status === 'cancelada').length;
  const emCons = new Set(R.ativas.map(c => c.fra));
  const cob = R.lojas.length ? 100 * R.snaps.length / R.lojas.length : 0;
  // distribuição por quartil
  const dist = { q1: 0, q2: 0, q3: 0, q4: 0 }; R.snaps.forEach(s => { if (s.score != null) dist[classeScore(s.score, Q)]++; });
  const consQ = { q1: 0, q2: 0, q3: 0, q4: 0 }; R.snaps.forEach(s => { if (s.score != null && emCons.has(s.fra)) consQ[classeScore(s.score, Q)]++; });
  const faixas = [['q1', 'Q1 · melhores'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4 · piores']];
  const kp = R.snaps.filter(s => s.score != null);
  const mRec = media(kp.map(s => s.kpis.receita_mes).filter(v => v != null)), mMg = media(kp.map(s => s.kpis.margem_adj).filter(v => v != null)), mId = media(kp.map(s => s.kpis.ident_pct).filter(v => v != null)), mRet = media(kp.map(s => s.kpis.ret45).filter(v => v != null));
  return `<section id="s-rede"><h2>Rede ${titAcao('rede', 'rede')}</h2><div class="sub">Insumo do processo: quantas lojas têm leitura, qualidade do dado e onde a consultoria está atuando.</div>
<div class="kpis">
${kpi(R.snaps.length + '<small>/ ' + R.lojas.length + '</small>', 'Lojas com raio-x', cob < 70 ? 'atencao' : 'ok', br(cob, 0) + '% de cobertura · ' + semDado + ' aguardando carga')}
${kpi(Q ? br(Q.media, 0) : '—', 'Nota média da rede', '', Q ? 'mediana ' + Q.q2 + ' · Q1 a partir de ' + Q.q1 : 'sem notas')}
${kpi(R.ativas.length, 'Consultorias ativas', R.ativas.length ? 'roxo' : '', concl + ' concluída(s) · ' + canc + ' cancelada(s)')}
${kpi(semNota, 'Sem nota (custo sem cadastro)', semNota ? 'alerta' : '')}
${kpi(parcial, 'Carga parcial do último mês', parcial ? 'atencao' : '', parcial ? 'reenviar BI completo' : '')}
${kpi(defas, 'Dado defasado (2+ meses)', defas ? 'atencao' : '')}
</div>
<div class="grid2">
<div class="painel"><h3>Distribuição por quartil</h3>${Q ? svgBarras(faixas.map(([k, t]) => ({ l: t, v: dist[k], v2: consQ[k], cls: k })), { legenda: ['lojas', 'em consultoria'] }) + `<p class="aviso">Quartis calculados sobre as ${Q.n} lojas com nota no recorte. A consultoria deveria concentrar-se em Q3/Q4: hoje ${consQ.q3 + consQ.q4} de ${R.ativas.length} ativa(s) está lá.</p>` : '<div class="vazio">Nenhuma loja com nota.</div>'}</div>
<div class="painel"><h3>Médias das lojas com nota</h3>
<div class="lin"><span>Receita/mês</span><b>${mRec != null ? kmil(mRec) : '—'}</b></div>
<div class="lin"><span>Margem ajustada</span><b>${pc(mMg)}</b></div>
<div class="lin"><span>Receita identificada (cliente cadastrado)</span><b>${pc(mId)}</b></div>
<div class="lin"><span>Ração em dia (retenção 45 d)</span><b>${pc(mRet)}</b></div>
<div class="lin"><span>Vazamento somado /mês</span><b>${kmil(kp.reduce((n, s) => n + (s.kpis.vaz_total || 0), 0))}</b></div>
<div class="lin"><span>Tarefas graves nos achados</span><b>${kp.reduce((n, s) => n + (s.kpis.tarefas_alta || 0), 0)}</b></div>
</div></div></section>`;
}

/* ---- 2. execução ---- */
function secExec(R) {
  const A = R.ativas.map(c => R.AND[c.id]);
  const tarefas = A.flatMap(a => a.tarefas), reun = A.flatMap(a => a.reunioes);
  const feitas = tarefas.filter(t => t.concluida), venc = tarefas.filter(t => !t.concluida && t.prazo && t.prazo < HOJE), abertas = tarefas.filter(t => !t.concluida && !(t.prazo && t.prazo < HOJE));
  // feitas na janela: inclui consultorias concluídas (o trabalho passado conta)
  const todasT = R.itens.filter(i => i.tipo === 'tarefa');
  const feitasJan = todasT.filter(t => t.concluida && t.concluida_em && t.concluida_em.slice(0, 10) >= R.desde);
  const feitas7 = todasT.filter(t => t.concluida && t.concluida_em && t.concluida_em.slice(0, 10) >= addDias(HOJE, -7)).length;
  const rPass = A.flatMap(a => a.rPass), rFeitas = A.flatMap(a => a.rFeitas), rPend = A.flatMap(a => a.rPend), rProx7 = reun.filter(r => r.data >= HOJE && r.data <= addDias(HOJE, 7));
  const atrasoFeitas = todasT.filter(t => t.concluida && t.concluida_em && t.prazo).map(t => diasEntre(t.prazo, t.concluida_em));
  const noPrazo = atrasoFeitas.filter(d => d <= 0).length;
  const mAtraso = media(atrasoFeitas);
  const ritmoM = A.length ? media(A.map(a => a.pctTarefas - a.pctTempo)) : null;
  // tipos de tarefa: por título, entre tarefas cujo prazo já passou (feitas ou vencidas)
  const tipos = {};
  R.itens.filter(i => i.tipo === 'tarefa' && i.prazo && (i.prazo < HOJE || i.concluida)).forEach(t => { const k = t.titulo; const o = tipos[k] = tipos[k] || { n: 0, feitas: 0, venc: 0, atr: [] }; o.n++; if (t.concluida) { o.feitas++; if (t.concluida_em) o.atr.push(diasEntre(t.prazo, t.concluida_em)); } else if (t.prazo < HOJE) o.venc++; });
  const topTipos = Object.entries(tipos).map(([t, o]) => ({ t, ...o, pctV: 100 * o.venc / o.n, mAtr: media(o.atr) })).sort((a, b) => b.venc - a.venc || b.pctV - a.pctV).slice(0, 10);
  // vencidas há mais tempo
  const lista = venc.map(t => { const c = R.ativas.find(x => x.id === t.consultoria_id); return { t, c, dias: diasEntre(t.prazo, HOJE) }; }).sort((a, b) => b.dias - a.dias).slice(0, 15);
  // por consultor
  const porC = {};
  R.ativas.forEach(c => { const a = R.AND[c.id]; const o = porC[c.consultor_id] = porC[c.consultor_id] || { n: 0, t: 0, f: 0, v: 0, rp: 0, rf: 0, rr: 0, rit: [] }; o.n++; o.t += a.tarefas.length; o.f += a.tFeitas.length; o.v += a.tVenc.length; o.rp += a.rPass.length; o.rf += a.rFeitas.length; o.rr += a.rPend.length; o.rit.push(a.pctTarefas - a.pctTempo); });
  const consRows = Object.entries(porC).sort((a, b) => (b[1].v + b[1].rr) - (a[1].v + a[1].rr));
  return `<section id="s-exec"><h2>Execução das tarefas ${titAcao('exec', 'vencidas')}</h2><div class="sub">O que está sendo feito agora nas ${R.ativas.length} consultoria(s) ativa(s). Tarefas e reuniões vêm da agenda (plano de 90 dias).</div>
<div class="kpis">
${kpi(tarefas.length, 'Tarefas no plano (ativas)', '', feitas.length + ' feitas · ' + abertas.length + ' a fazer · ' + venc.length + ' vencidas')}
${kpi(barra(tarefas.length ? 100 * feitas.length / tarefas.length : 0, venc.length ? 'r' : ''), 'Feitas do total', '')}
${kpi(venc.length, 'Vencidas hoje', venc.length ? 'alerta' : 'ok')}
${kpi(feitasJan.length, 'Feitas na janela' + (F.per ? ' (' + F.per + ' d)' : ''), '', feitas7 + ' nos últimos 7 dias')}
${kpi(rFeitas.length + '<small>/ ' + rPass.length + '</small>', 'Reuniões realizadas × passadas', rPend.length ? 'atencao' : '', rPend.length + ' sem confirmação · ' + rProx7.length + ' nos próximos 7 dias')}
${kpi(atrasoFeitas.length ? br(100 * noPrazo / atrasoFeitas.length, 0) + '%' : '—', 'Feitas dentro do prazo', '', mAtraso != null ? 'conclusão média ' + sinal(mAtraso, 1, ' d') + ' em relação ao prazo' : 'nenhuma tarefa concluída com prazo')}
${kpi(ritmoM == null ? '—' : sinal(ritmoM, 0, ' pts'), 'Ritmo médio', ritmoM == null ? '' : ritmoM >= -10 ? 'ok' : ritmoM >= -30 ? 'atencao' : 'alerta', '% feitas − % do prazo decorrido')}
</div>
<div class="grid2">
<div class="painel"><h3>Vencidas há mais tempo</h3>${lista.length ? `<div class="tw"><table><thead><tr><th>Loja</th><th>Tarefa</th><th class="r">Prazo</th><th class="r">Dias</th></tr></thead><tbody>${lista.map(x => `<tr class="lk" data-href="${linkLoja(x.c.fra, 'tarefas')}"><td>${lojaCel(x.c.fra, x.c)}</td><td>${esc(x.t.titulo)}</td><td class="r num">${dBR(x.t.prazo)}</td><td class="r num" style="color:var(--verm);font-weight:700">${x.dias}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma tarefa vencida.</div>'}</div>
<div class="painel"><h3>Que tipo de tarefa mais atrasa</h3>${topTipos.length ? `<div class="tw"><table><thead><tr><th>Tarefa do plano</th><th class="r">Com prazo vencido</th><th class="r">Feitas</th><th class="r">Ainda vencidas</th><th class="r">Atraso médio</th></tr></thead><tbody>${topTipos.map(o => `<tr><td>${esc(o.t)}</td><td class="r num">${o.n}</td><td class="r num">${o.feitas}</td><td class="r num"${o.venc ? ' style="color:var(--verm);font-weight:700"' : ''}>${o.venc}${o.n ? ' <span class="s">(' + br(o.pctV, 0) + '%)</span>' : ''}</td><td class="r num">${o.mAtr == null ? '—' : sinal(o.mAtr, 1, ' d')}</td></tr>`).join('')}</tbody></table></div><p class="aviso">Conta só tarefas cujo prazo já passou (feitas ou não), em todas as consultorias do recorte. Um tipo que vence em muitas lojas é problema do processo (prazo curto, tarefa mal definida ou depende de terceiros), não do consultor.</p>` : '<div class="vazio">Nenhuma tarefa com prazo vencido ainda.</div>'}</div>
</div>
<div class="painel"><h3>Por consultor (consultorias ativas)</h3>${consRows.length ? `<div class="tw"><table><thead><tr><th>Consultor</th><th class="r">Ativas</th><th>Tarefas feitas</th><th class="r">Vencidas</th><th class="r">Reuniões realizadas</th><th class="r">Sem confirmação</th><th class="r">Ritmo médio</th></tr></thead><tbody>${consRows.map(([id, o]) => { const r = media(o.rit); return `<tr><td class="t">${esc(nomeDe(id))}</td><td class="r num">${o.n}</td><td>${barra(o.t ? 100 * o.f / o.t : 0, o.v ? 'r' : '')} <span class="s">${o.f}/${o.t}</span></td><td class="r num"${o.v ? ' style="color:var(--verm);font-weight:700"' : ''}>${o.v}</td><td class="r num">${o.rf}/${o.rp}</td><td class="r num"${o.rr ? ' style="color:#a34608;font-weight:700"' : ''}>${o.rr}</td><td class="r"><span class="st ${r >= -10 ? 'q1' : r >= -30 ? 'lar' : 'q4'}">${sinal(r, 0, ' pts')}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma consultoria ativa.</div>'}</div>
</section>`;
}

/* ---- 3. satisfação ---- */
function secSatisf(R) {
  const avs = R.avs;
  const comFranq = R.ativas.filter(c => R.AND[c.id].temFranq);
  const semana = avs.filter(a => a.semana === SEMANA), ult4 = avs.filter(a => a.semana >= addDias(SEMANA, -21)), jan = avs.filter(a => a.semana >= R.desde);
  const mSem = media(semana.map(a => a.nota)), m4 = media(ult4.map(a => a.nota)), mJan = media(jan.map(a => a.nota));
  const dist = [1, 2, 3, 4, 5].map(n => ({ l: n + ' ★', v: jan.filter(a => a.nota === n).length, cls: n <= 2 ? 'q4' : n === 3 ? 'q3' : 'q1' }));
  const and = { melhorou: 0, igual: 0, piorou: 0 }; jan.forEach(a => { if (and[a.andamento] != null) and[a.andamento]++; });
  const nJ = jan.length || 1;
  const pendentes = avs.filter(a => !a.resposta && (a.sugestao || a.nota <= 2 || a.andamento === 'piorou'));
  const tResp = avs.filter(a => a.resposta && a.respondido_em && a.criado_em).map(a => (new Date(a.respondido_em) - new Date(a.criado_em)) / 864e5);
  const adesao = comFranq.length ? 100 * comFranq.filter(c => semana.some(a => a.consultoria_id === c.id)).length / comFranq.length : null;
  const ruins = R.ativas.map(c => ({ c, a: R.AND[c.id] })).filter(x => x.a.ultAv && (x.a.ultAv.nota <= 2 || x.a.piorou2));
  // série semanal: últimas 10 semanas
  const semanas = []; for (let i = 9; i >= 0; i--) semanas.push(addDias(SEMANA, -7 * i));
  const serie = semanas.map(s => { const v = avs.filter(a => a.semana === s); return { l: dBR(s).slice(0, 5), v: media(v.map(a => a.nota)), n: v.length }; });
  const sugest = avs.filter(a => (a.sugestao || a.comentario) && a.semana >= R.desde).sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, 12);
  const semLogin = R.ativas.length - comFranq.length;
  return `<section id="s-satisf"><h2>Satisfação do franqueado ${titAcao('satisf', 'avaliacoes')}</h2><div class="sub">Avaliação semanal (1–5, melhorou / igual / piorou, sugestão) feita pelo franqueado no Raio-X. Janela: ${F.per ? F.per + ' dias' : 'tudo'}.</div>
${!avs.length ? `<div class="aviso verm">Nenhuma avaliação registrada ainda. ${comFranq.length ? comFranq.length + ' consultoria(s) já tem franqueado com login — o badge no Raio-X pede a avaliação toda semana.' : 'Nenhuma consultoria ativa tem franqueado com login: crie os logins na aba Franqueados do Raio-X, senão este bloco fica vazio para sempre.'}</div>` : ''}
<div class="kpis">
${kpi(mSem == null ? '—' : br(mSem, 1) + '<small>/5</small>', 'Nota média · semana atual', mSem == null ? '' : mSem >= 4 ? 'ok' : mSem >= 3 ? 'atencao' : 'alerta', semana.length + ' avaliação(ões) desde ' + dBR(SEMANA))}
${kpi(m4 == null ? '—' : br(m4, 1) + '<small>/5</small>', 'Média · 4 últimas semanas', '', ult4.length + ' avaliação(ões)')}
${kpi(adesao == null ? '—' : br(adesao, 0) + '%', 'Adesão nesta semana', adesao == null ? '' : adesao >= 70 ? 'ok' : 'atencao', comFranq.length + ' consultoria(s) com franqueado logado' + (semLogin ? ' · ' + semLogin + ' sem login' : ''))}
${kpi(jan.length ? br(100 * and.melhorou / nJ, 0) + '%' : '—', 'Dizem que melhorou', '', jan.length ? br(100 * and.igual / nJ, 0) + '% igual · ' + br(100 * and.piorou / nJ, 0) + '% piorou' : '')}
${kpi(pendentes.length, 'Sem resposta do consultor', pendentes.length ? 'alerta' : 'ok', 'sugestão, nota ≤ 2 ou "piorou" esperando')}
${kpi(tResp.length ? br(media(tResp), 1) + '<small>d</small>' : '—', 'Tempo médio de resposta', tResp.length && media(tResp) > 2 ? 'atencao' : '', tResp.length + ' respondida(s) · meta 2 dias')}
</div>
<div class="grid2">
<div class="painel"><h3>Nota média por semana</h3>${avs.length ? svgLinha(serie, { min: 1, max: 5, fmt: v => br(v, 1) }) : '<div class="vazio">Sem avaliações.</div>'}</div>
<div class="painel"><h3>Distribuição das notas na janela</h3>${jan.length ? svgBarras(dist, {}) : '<div class="vazio">Sem avaliações na janela.</div>'}</div>
</div>
<div class="grid2">
<div class="painel"><h3>Lojas com nota ≤ 2 ou "piorou" 2 semanas</h3>${ruins.length ? `<div class="tw"><table><thead><tr><th>Loja</th><th>Última</th><th>Andamento</th><th></th></tr></thead><tbody>${ruins.map(x => `<tr class="lk" data-href="${linkLoja(x.c.fra, 'avaliacao')}"><td>${lojaCel(x.c.fra, x.c)}</td><td>${estrelas(x.a.ultAv.nota)} <span class="s">${dBR(x.a.ultAv.semana)}</span></td><td><span class="st ${x.a.ultAv.andamento === 'piorou' ? 'q4' : x.a.ultAv.andamento === 'melhorou' ? 'q1' : 'cinza'}">${esc(x.a.ultAv.andamento || '—')}</span>${x.a.piorou2 ? ' <span class="st q4">2 sem. piorando</span>' : ''}</td><td>${x.a.ultAv.resposta ? '<span class="st ok">respondida</span>' : '<span class="st verm">sem resposta</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma loja nessa situação.</div>'}</div>
<div class="painel"><h3>Consultorias em silêncio</h3>${(() => { const s = R.ativas.map(c => ({ c, a: R.AND[c.id] })).filter(x => x.a.temFranq && x.a.decorrido >= 10 && x.a.diasSemAvaliar >= 14); return s.length ? `<div class="tw"><table><thead><tr><th>Loja</th><th class="r">Dia da consultoria</th><th class="r">Sem avaliar há</th></tr></thead><tbody>${s.map(x => `<tr class="lk" data-href="${linkLoja(x.c.fra, 'avaliacao')}"><td>${lojaCel(x.c.fra, x.c)}</td><td class="r num">${x.a.decorrido}</td><td class="r num" style="font-weight:700">${x.a.ultAv ? x.a.diasSemAvaliar + ' d' : 'nunca avaliou'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Todo franqueado com login avaliou nos últimos 14 dias' + (semLogin ? ' (' + semLogin + ' consultoria(s) sem login não entram aqui)' : '') + '.</div>'; })()}</div>
</div>
<div class="painel"><h3>O que os franqueados estão dizendo</h3>${sugest.length ? sugest.map(a => { const c = R.cons.find(x => x.id === a.consultoria_id) || {}; return `<div class="sug"><div class="cab"><b style="color:var(--tinta)">${esc(frqDe(a.fra).nome)}</b> FRA ${a.fra} · ${esc(primeiro(nomeDe(c.consultor_id)))} · semana ${dBR(a.semana)} · ${estrelas(a.nota)} · <span class="st ${a.andamento === 'piorou' ? 'q4' : a.andamento === 'melhorou' ? 'q1' : 'cinza'}">${esc(a.andamento || '—')}</span> ${a.resposta ? '<span class="st ok">respondida' + (a.respondido_em ? ' em ' + br((new Date(a.respondido_em) - new Date(a.criado_em)) / 864e5, 1) + ' d' : '') + '</span>' : (a.sugestao || a.nota <= 2 || a.andamento === 'piorou') ? '<span class="st verm">sem resposta</span>' : ''} <a href="${linkLoja(a.fra, 'avaliacao')}" style="font-size:12px">abrir</a></div>${a.sugestao ? `<div class="tx">💡 ${esc(a.sugestao)}</div>` : ''}${a.comentario ? `<div class="tx" style="color:var(--tinta-suave)">${esc(a.comentario)}</div>` : ''}${a.resposta ? `<div class="rs">${esc(a.resposta)}</div>` : ''}</div>`; }).join('') : '<div class="vazio">Nenhuma sugestão ou comentário na janela.</div>'}</div>
</section>`;
}

/* ---- 4. resultado + equipe ---- */
function secResult(R) {
  const enc = R.cons.filter(c => c.status === 'concluida' && c.resultado);
  const V = { positiva: 0, negativa: 0, 'não fez diferença': 0, 'sem leitura': 0 }; enc.forEach(c => { V[c.resultado.veredito] = (V[c.resultado.veredito] || 0) + 1; });
  const comLeitura = enc.filter(c => c.resultado.veredito !== 'sem leitura');
  const mdS = media(comLeitura.map(c => c.resultado.d_score).filter(v => v != null)), mdL = media(comLeitura.map(c => c.resultado.d_lucro_pct).filter(v => v != null)), mdR = media(comLeitura.map(c => c.resultado.d_receita_pct).filter(v => v != null)), mAv = media(enc.map(c => c.resultado.avaliacao_media).filter(v => v != null));
  const pctPos = comLeitura.length ? 100 * V.positiva / comLeitura.length : null;
  // por consultor (todas as consultorias)
  const porC = {};
  R.cons.forEach(c => { const a = R.AND[c.id]; const o = porC[c.consultor_id] = porC[c.consultor_id] || { at: 0, enc: 0, pos: 0, lei: 0, rit: [], av: [], venc: 0, dS: [] }; if (c.status === 'ativa') { o.at++; o.rit.push(a.pctTarefas - a.pctTempo); o.venc += a.tVenc.length; if (a.dScore != null) o.dS.push(a.dScore); } if (c.status === 'concluida' && c.resultado) { o.enc++; if (c.resultado.veredito !== 'sem leitura') { o.lei++; if (c.resultado.veredito === 'positiva') o.pos++; } } a.avs.forEach(v => o.av.push(v.nota)); });
  const rows = Object.entries(porC).sort((a, b) => (b[1].at + b[1].enc) - (a[1].at + a[1].enc));
  const listaEnc = enc.sort((a, b) => (b.encerrada_em || '').localeCompare(a.encerrada_em || '')).slice(0, 15);
  return `<section id="s-result"><h2>Resultado das consultorias e equipe ${titAcao('result', 'consultores')}</h2><div class="sub">Veredito calculado no encerramento (raio-x do início × atual): positiva = nota +5 ou lucro +5%; negativa = −5; entre = não fez diferença; sem leitura = raio-x ainda do mês inicial.</div>
<div class="kpis">
${kpi(enc.length, 'Consultorias encerradas', '', enc.length ? V.positiva + ' positiva(s) · ' + V.negativa + ' negativa(s) · ' + V['não fez diferença'] + ' sem diferença · ' + V['sem leitura'] + ' sem leitura' : '')}
${kpi(pctPos == null ? '—' : br(pctPos, 0) + '%', 'Positivas (entre as com leitura)', pctPos == null ? '' : pctPos >= 60 ? 'ok' : 'atencao', comLeitura.length + ' com leitura')}
${kpi(sinal(mdS, 1), 'Δ nota média', mdS == null ? '' : mdS > 0 ? 'ok' : 'atencao', 'início → fim, com leitura')}
${kpi(sinal(mdL, 1, '%'), 'Δ lucro bruto/mês', mdL == null ? '' : mdL > 0 ? 'ok' : 'atencao', 'receita ' + sinal(mdR, 1, '%'))}
${kpi(mAv == null ? '—' : br(mAv, 1) + '<small>/5</small>', 'Satisfação média nas encerradas', '')}
</div>
${enc.length ? '<div class="painel" style="max-width:520px"><h3>Vereditos</h3>' + svgBarras([['positiva', 'q1'], ['não fez diferença', 'q3'], ['negativa', 'q4'], ['sem leitura', 'cinza']].map(([k, cls]) => ({ l: k, v: V[k] || 0, cls })), { altura: 150 }) + '</div>' : ''}
<div class="painel"><h3>Supervisão da equipe</h3>${rows.length ? `<div class="tw"><table><thead><tr><th>Consultor</th><th class="r">Ativas</th><th class="r">Ritmo médio</th><th class="r">Vencidas</th><th class="r">Δ nota (ativas)</th><th class="r">Encerradas</th><th class="r">% positivas</th><th class="r">Satisfação</th></tr></thead><tbody>${rows.map(([id, o]) => { const r = media(o.rit), ds = media(o.dS), av = media(o.av); return `<tr><td class="t">${esc(nomeDe(id))}</td><td class="r num">${o.at}</td><td class="r">${r == null ? '—' : `<span class="st ${r >= -10 ? 'q1' : r >= -30 ? 'lar' : 'q4'}">${sinal(r, 0, ' pts')}</span>`}</td><td class="r num"${o.venc ? ' style="color:var(--verm);font-weight:700"' : ''}>${o.venc}</td><td class="r num">${ds == null ? '—' : sinal(ds, 1)}</td><td class="r num">${o.enc}</td><td class="r num">${o.lei ? br(100 * o.pos / o.lei, 0) + '%' : '—'}</td><td class="r num">${av == null ? '—' : br(av, 1) + '/5 <span class="s">(' + o.av.length + ')</span>'}</td></tr>`; }).join('')}</tbody></table></div><p class="aviso">Ritmo e Δ nota olham só as ativas; % positivas só as encerradas com leitura; satisfação junta todas as avaliações recebidas pelo consultor. Com poucas consultorias por pessoa, um caso muda tudo — leia como tendência, não como ranking.</p>` : '<div class="vazio">Nenhuma consultoria ainda.</div>'}</div>
${listaEnc.length ? `<div class="painel"><h3>Encerradas recentemente</h3><div class="tw"><table><thead><tr><th>Loja</th><th>Período</th><th>Veredito</th><th class="r">Nota</th><th class="r">Lucro/mês</th><th class="r">Plano</th><th class="r">Satisfação</th></tr></thead><tbody>${listaEnc.map(c => { const r = c.resultado; return `<tr class="lk" data-href="${linkLoja(c.fra, 'consultoria')}"><td>${lojaCel(c.fra, c)}</td><td class="num">${dBR(c.inicio)} → ${dBR(c.encerrada_em)}</td><td><span class="st ${r.veredito === 'positiva' ? 'q1' : r.veredito === 'negativa' ? 'q4' : r.veredito === 'sem leitura' ? 'cinza' : 'q3'}">${esc(r.veredito)}</span></td><td class="r num">${r.score_ini ?? '—'} → ${r.score_fim ?? '—'}</td><td class="r num">${sinal(r.d_lucro_pct, 1, '%')}</td><td class="r num">${r.tarefas_feitas}/${r.tarefas} · ${r.reunioes_feitas}/${r.reunioes} reun.</td><td class="r num">${r.avaliacao_media == null ? '—' : br(r.avaliacao_media, 1) + '/5'}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
</section>`;
}

/* ---- 5. evolução ---- */
function secEvol(R) {
  const hist = HIST.filter(h => R.fras.has(h.fra));
  const meses = [...new Set(hist.map(h => h.mes_ref))].sort();
  const porLoja = {}; hist.forEach(h => { (porLoja[h.fra] = porLoja[h.fra] || []).push(h); });
  const lojasComHist = Object.values(porLoja).filter(v => v.length >= 2).length;
  const emCons = fra => R.cons.some(c => c.fra === fra && c.status !== 'cancelada');
  const serie = meses.map(m => { const v = hist.filter(h => h.mes_ref === m); const s = v.filter(h => h.score != null).map(h => h.score); return { m, l: mesBR(m), n: v.length, score: media(s), receita: media(v.map(h => h.receita).filter(x => x)), margem: media(v.map(h => h.margem).filter(x => x != null)), scoreCons: media(v.filter(h => emCons(h.fra) && h.score != null).map(h => h.score)), scoreFora: media(v.filter(h => !emCons(h.fra) && h.score != null).map(h => h.score)) }; });
  // Δ nota primeiro → último por loja, separando quem está/esteve em consultoria
  const delta = g => { const d = Object.entries(porLoja).filter(([fra, v]) => g(+fra) && v.length >= 2 && v[0].score != null && v[v.length - 1].score != null).map(([, v]) => v[v.length - 1].score - v[0].score); return { n: d.length, m: media(d) }; };
  const dC = delta(emCons), dF = delta(f => !emCons(f));
  const poucoHist = lojasComHist < 5 || meses.length < 2;
  return `<section id="s-evol"><h2>Evolução da rede no tempo ${titAcao('evol', 'evolucao')}</h2><div class="sub">Nota e resultado médios por mês de referência (janela móvel de 12 meses do raio-x). Lojas em consultoria × fora dela no mesmo período.</div>
${poucoHist ? `<div class="aviso verm">Histórico curto: ${lojasComHist} loja(s) com 2+ leituras mensais e ${meses.length} mês(es) de referência. A curva só ganha sentido depois de rodar o workflow do rede-pop-jobs com <b>backfill = 6</b> e depois de alguns meses de rotina. Até lá, as médias abaixo refletem quase só o mês atual.</div>` : ''}
<div class="kpis">
${kpi(meses.length, 'Meses com leitura', '', meses.length ? mesBR(meses[0]) + ' a ' + mesBR(meses[meses.length - 1]) : '')}
${kpi(lojasComHist, 'Lojas com 2+ leituras', lojasComHist ? '' : 'atencao')}
${kpi(dC.n ? sinal(dC.m, 1) : '—', 'Δ nota · lojas em consultoria', dC.n && dC.m > 0 ? 'ok' : '', dC.n + ' loja(s), primeira → última leitura')}
${kpi(dF.n ? sinal(dF.m, 1) : '—', 'Δ nota · lojas fora', '', dF.n + ' loja(s), mesmo critério')}
${kpi(dC.n && dF.n ? sinal(dC.m - dF.m, 1) : '—', 'Diferença a favor da consultoria', dC.n && dF.n ? (dC.m - dF.m > 0 ? 'ok' : 'atencao') : '', 'o argumento para a diretoria — só vale com histórico')}
</div>
<div class="grid3">
<div class="painel"><h3>Nota média por mês</h3>${serie.length ? svgLinha(serie.map(s => ({ l: s.l, v: s.score, n: s.n, v2: s.scoreCons, v3: s.scoreFora })), { min: 0, max: 100, fmt: v => br(v, 0), legenda: ['rede', 'em consultoria', 'fora'] }) : '<div class="vazio">Sem histórico.</div>'}</div>
<div class="painel"><h3>Receita média /mês</h3>${serie.length ? svgLinha(serie.map(s => ({ l: s.l, v: s.receita, n: s.n })), { fmt: v => kmil(v) }) : '<div class="vazio">Sem histórico.</div>'}</div>
<div class="painel"><h3>Margem ajustada média</h3>${serie.length ? svgLinha(serie.map(s => ({ l: s.l, v: s.margem, n: s.n })), { fmt: v => pc(v) }) : '<div class="vazio">Sem histórico.</div>'}</div>
</div>
${serie.length ? `<div class="painel"><h3>Leituras mensais</h3><div class="tw"><table><thead><tr><th>Mês</th><th class="r">Lojas</th><th class="r">Nota média</th><th class="r">Em consultoria</th><th class="r">Fora</th><th class="r">Receita média</th><th class="r">Margem</th></tr></thead><tbody>${serie.map(s => `<tr><td>${s.l}</td><td class="r num">${s.n}</td><td class="r num">${s.score == null ? '—' : br(s.score, 1)}</td><td class="r num">${s.scoreCons == null ? '—' : br(s.scoreCons, 1)}</td><td class="r num">${s.scoreFora == null ? '—' : br(s.scoreFora, 1)}</td><td class="r num">${s.receita == null ? '—' : kmil(s.receita)}</td><td class="r num">${pc(s.margem)}</td></tr>`).join('')}</tbody></table></div><p class="aviso">A nota é de janela móvel de 12 meses e sobe devagar por construção. "Em consultoria" = lojas que têm ou tiveram consultoria (não cancelada), em qualquer mês — a comparação justa é a Δ nota por loja acima, não a média absoluta (a consultoria começa pelas piores).</p></div>` : ''}
</section>`;
}

/* ---- 7. acessos: quem está usando o Raio-X / Central / dash ---- */
function secAcessos(R) {
  const d7 = addDias(HOJE, -7), d30 = addDias(HOJE, -30);
  const porU = {}; ACESSOS.forEach(a => { const o = porU[a.user_id] = porU[a.user_id] || { ult: a.em, n7: 0, n30: 0, orig: {} }; if (a.em > o.ult) o.ult = a.em; if (a.em.slice(0, 10) >= d7) o.n7++; if (a.em.slice(0, 10) >= d30) o.n30++; const k = a.origem || 'central'; o.orig[k] = (o.orig[k] || 0) + 1; });
  const franqs = PERFIS.filter(p => !p.is_admin && (p.papeis || []).includes('franqueado'));
  const equipe = PERFIS.filter(p => p.is_admin || (p.papeis || []).some(x => ['consultor', 'supervisor', 'diretoria', 'expansao'].includes(x)));
  const lojasDe = uid => FQL.filter(x => x.user_id === uid).map(x => x.fra).sort((a, b) => a - b);
  const fqR = franqs.filter(p => (!F.cons && !F.uf) || lojasDe(p.id).some(f => R.fras.has(f)));
  const semLogin = fqR.filter(p => !porU[p.id]);
  const ativosCons = new Set(R.ativas.map(c => c.fra));
  const ultDe = p => porU[p.id] ? porU[p.id].ult : '';
  const linha = (p, lojas) => { const u = porU[p.id]; return `<tr><td class="t">${esc(p.nome)}${p.is_admin ? ' <span class="st cinza">admin</span>' : ''}</td><td>${lojas ? (lojas.length ? lojas.map(f => `<span class="st ${ativosCons.has(f) ? 'roxo' : 'cinza'}" title="${esc(frqDe(f).nome)}">FRA ${f}</span>`).join(' ') : '<span class="st lar">sem loja</span>') : esc((p.papeis || []).join(', '))}</td><td class="num">${u ? dBR(u.ult) + ' <span class="s">' + new Date(u.ult).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '<span class="st verm">nunca</span>'}</td><td class="r num">${u ? u.n7 : 0}</td><td class="r num">${u ? u.n30 : 0}</td><td class="s">${u ? Object.entries(u.orig).map(([k, v]) => k + ' ' + v).join(' · ') : '—'}</td></tr>`; };
  const a7 = ACESSOS.filter(a => a.em.slice(0, 10) >= d7), usu7 = new Set(a7.map(a => a.user_id)).size;
  const fq7 = fqR.filter(p => porU[p.id] && porU[p.id].n7 > 0).length;
  return `<section id="s-acessos"><h2>Acessos ${titAcao('acessos', 'acessos')}</h2><div class="sub">Logins registrados na Central, no Raio-X e neste painel (últimos 60 dias). Franqueado que não entra não avalia e não vê o plano.</div>
<div class="kpis">
${kpi(a7.length, 'Logins nos últimos 7 dias', '', usu7 + ' pessoa(s) diferente(s)')}
${kpi(fqR.length ? fq7 + '<small>/ ' + fqR.length + '</small>' : '—', 'Franqueados que entraram na semana', fqR.length && fq7 < fqR.length ? 'atencao' : fqR.length ? 'ok' : '', semLogin.length ? semLogin.length + ' nunca entraram' : '')}
${kpi(equipe.filter(p => porU[p.id] && porU[p.id].n7 > 0).length + '<small>/ ' + equipe.length + '</small>', 'Equipe ativa na semana', '')}
</div>
<div class="painel"><h3>Franqueados</h3>${fqR.length ? `<div class="tw"><table><thead><tr><th>Nome</th><th>Lojas</th><th>Último acesso</th><th class="r">7 d</th><th class="r">30 d</th><th>Por onde</th></tr></thead><tbody>${fqR.sort((a, b) => ultDe(b).localeCompare(ultDe(a))).map(p => linha(p, lojasDe(p.id))).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum franqueado com login. Crie na aba Franqueados do Raio-X.</div>'}</div>
<div class="painel"><h3>Consultores e equipe</h3><div class="tw"><table><thead><tr><th>Nome</th><th>Papéis</th><th>Último acesso</th><th class="r">7 d</th><th class="r">30 d</th><th>Por onde</th></tr></thead><tbody>${equipe.sort((a, b) => ultDe(b).localeCompare(ultDe(a))).map(p => linha(p, null)).join('')}</tbody></table></div><p class="aviso">Cada abertura de painel conta como um acesso (a Central registra a cada F5). Serve para ver quem está usando e quem sumiu, não para medir tempo de uso.</p></div>
</section>`;
}

/* ================= gráficos SVG (sem biblioteca) ================= */
function svgBarras(itens, o = {}) {
  const W = 560, H = o.altura || 170, pad = { l: 8, r: 8, t: 18, b: 26 };
  const max = Math.max(1, ...itens.map(i => Math.max(i.v || 0, i.v2 || 0)));
  const n = itens.length, gw = (W - pad.l - pad.r) / n, bw = Math.min(56, gw * (o.legenda ? .32 : .55));
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const cor = { q1: '#009150', q2: '#5fb98a', q3: '#FDAE25', q4: '#c0392b', cinza: '#9db8aa' };
  let s = `<svg class="g" viewBox="0 0 ${W} ${H}" role="img">`;
  [0, .5, 1].forEach(f => { const yy = y(max * f); s += `<line class="grade" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`; });
  itens.forEach((it, i) => {
    const cx = pad.l + gw * i + gw / 2, c = cor[it.cls] || '#009150';
    const x1 = o.legenda ? cx - bw - 2 : cx - bw / 2;
    s += `<rect x="${x1}" y="${y(it.v || 0)}" width="${bw}" height="${Math.max(0, y(0) - y(it.v || 0))}" rx="4" fill="${c}"><title>${esc(it.l)}: ${it.v || 0}</title></rect>`;
    s += `<text x="${x1 + bw / 2}" y="${y(it.v || 0) - 4}" text-anchor="middle" style="font-weight:600;fill:#1d2b24">${it.v || 0}</text>`;
    if (o.legenda) { s += `<rect x="${cx + 2}" y="${y(it.v2 || 0)}" width="${bw}" height="${Math.max(0, y(0) - y(it.v2 || 0))}" rx="4" fill="#6c4fb3" opacity=".85"><title>${esc(o.legenda[1])}: ${it.v2 || 0}</title></rect><text x="${cx + 2 + bw / 2}" y="${y(it.v2 || 0) - 4}" text-anchor="middle" style="fill:#4d3a8a">${it.v2 || 0}</text>`; }
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(it.l)}</text>`;
  });
  if (o.legenda) s += `<g transform="translate(${W - pad.r - 190},${pad.t - 12})"><rect width="10" height="10" rx="2" fill="#009150"/><text x="14" y="9">${esc(o.legenda[0])}</text><rect x="80" width="10" height="10" rx="2" fill="#6c4fb3"/><text x="94" y="9">${esc(o.legenda[1])}</text></g>`;
  return s + '</svg>';
}
function svgLinha(pts, o = {}) {
  const W = 560, H = 190, pad = { l: 40, r: 10, t: 14, b: 26 };
  const vals = pts.flatMap(p => [p.v, p.v2, p.v3]).filter(v => v != null && isFinite(v));
  if (!vals.length) return '<div class="vazio">Sem valores.</div>';
  let min = o.min != null ? o.min : Math.min(...vals), max = o.max != null ? o.max : Math.max(...vals);
  if (max === min) { max += 1; min = Math.max(0, min - 1); }
  const n = pts.length, x = i => n === 1 ? W / 2 : pad.l + (W - pad.l - pad.r) * i / (n - 1), y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const fmt = o.fmt || (v => br(v, 1));
  let s = `<svg class="g" viewBox="0 0 ${W} ${H}" role="img">`;
  [0, .5, 1].forEach(f => { const v = min + (max - min) * f, yy = y(v); s += `<line class="grade" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 4}" y="${yy + 3}" text-anchor="end">${fmt(v)}</text>`; });
  const linha = (k, cor, dash) => {
    const seg = pts.map((p, i) => p[k] == null ? null : [x(i), y(p[k])]);
    let d = '', prev = false; seg.forEach(pt => { if (!pt) { prev = false; return; } d += (prev ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); prev = true; });
    s += `<path d="${d}" fill="none" stroke="${cor}" stroke-width="2.2"${dash ? ' stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    seg.forEach((pt, i) => { if (!pt) return; s += `<circle cx="${pt[0]}" cy="${pt[1]}" r="3.5" fill="${cor}"><title>${esc(pts[i].l)}: ${fmt(pts[i][k])}${pts[i].n != null ? ' · ' + pts[i].n + (k === 'v' ? ' loja(s)/avaliação(ões)' : '') : ''}</title></circle>`; });
  };
  if (pts.some(p => p.v3 != null)) linha('v3', '#9db8aa', true);
  if (pts.some(p => p.v2 != null)) linha('v2', '#6c4fb3', false);
  linha('v', '#009150', false);
  const passo = Math.ceil(n / 8);
  pts.forEach((p, i) => { if (i % passo === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.l)}</text>`; });
  pts.forEach((p, i) => { if (p.v != null && (n <= 12)) s += `<text x="${x(i)}" y="${y(p.v) - 7}" text-anchor="middle" style="font-weight:600;fill:#1d2b24">${fmt(p.v)}</text>`; });
  if (o.legenda) s += `<g transform="translate(${pad.l + 4},${pad.t - 4})"><line x1="0" x2="14" y1="0" y2="0" stroke="#009150" stroke-width="2.2"/><text x="18" y="3">${esc(o.legenda[0])}</text><line x1="90" x2="104" y1="0" y2="0" stroke="#6c4fb3" stroke-width="2.2"/><text x="108" y="3">${esc(o.legenda[1])}</text><line x1="210" x2="224" y1="0" y2="0" stroke="#9db8aa" stroke-width="2.2" stroke-dasharray="5 4"/><text x="228" y="3">${esc(o.legenda[2])}</text></g>`;
  return s + '</svg>';
}

/* ================= interação e CSV ================= */
function ligar(R, AL) {
  document.querySelectorAll('tr.lk[data-href]').forEach(tr => tr.onclick = () => { location.href = tr.dataset.href; });
  document.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => exportar(b.dataset.csv, R, AL));
}
function exportar(qual, R, AL) {
  const L = [];
  if (qual === 'alertas') { L.push('prioridade;fra;loja;consultor;motivo;dias;link'); AL.forEach(a => { const c = R.cons.find(x => x.id === a.cid); L.push([a.p, a.fra, seg(frqDe(a.fra).nome), seg(nomeDe(c.consultor_id)), seg(a.motivo.replace(/<[^>]+>/g, '')), a.dias, location.origin + location.pathname.replace(/dash\.html$/, '') + linkLoja(a.fra, a.aba).slice(2)].join(';')); }); }
  if (qual === 'rede') { const Q = quartis(R.snaps); L.push('fra;loja;uf;consultor;nota;quartil;mes_ref;receita_mes;margem_adj;ident_pct;ret45;vaz_total;tarefas_alta;carga_parcial;defasagem_meses;consultoria'); R.lojas.forEach(f => { const s = SNAPS[f.fra], c = R.ativas.find(x => x.fra === f.fra); L.push([f.fra, seg(f.nome), f.estado || '', seg(f.consultor), s ? (s.score ?? '') : '', s ? classeScore(s.score, Q) : 'sem raio-x', s ? s.mes_ref : '', s ? (s.kpis.receita_mes ?? '') : '', s ? (s.kpis.margem_adj ?? '') : '', s ? (s.kpis.ident_pct ?? '') : '', s ? (s.kpis.ret45 ?? '') : '', s ? (s.kpis.vaz_total ?? '') : '', s ? (s.kpis.tarefas_alta ?? '') : '', s && s.kpis.mes_parcial ? s.kpis.mes_parcial.mes : '', s ? (s.kpis.defasagem_meses ?? '') : '', c ? c.status + ' desde ' + c.inicio : ''].join(';')); }); }
  if (qual === 'vencidas') { L.push('fra;loja;consultor;consultoria_status;tipo;titulo;data;prazo;concluida;concluida_em;dias_vencida'); R.itens.forEach(i => { const c = R.cons.find(x => x.id === i.consultoria_id); L.push([c.fra, seg(frqDe(c.fra).nome), seg(nomeDe(c.consultor_id)), c.status, i.tipo, seg(i.titulo), i.data || '', i.prazo || '', i.concluida ? 'sim' : 'não', i.concluida_em || '', !i.concluida && i.prazo && i.prazo < HOJE ? diasEntre(i.prazo, HOJE) : ''].join(';')); }); }
  if (qual === 'avaliacoes') { L.push('fra;loja;consultor;semana;nota;andamento;comentario;sugestao;resposta;respondido_em;criado_em'); R.avs.forEach(a => { const c = R.cons.find(x => x.id === a.consultoria_id) || {}; L.push([a.fra, seg(frqDe(a.fra).nome), seg(nomeDe(c.consultor_id)), a.semana, a.nota, a.andamento || '', seg(String(a.comentario || '').replace(/[\r\n;]+/g, ' ')), seg(String(a.sugestao || '').replace(/[\r\n;]+/g, ' ')), seg(String(a.resposta || '').replace(/[\r\n;]+/g, ' ')), a.respondido_em || '', a.criado_em || ''].join(';')); }); }
  if (qual === 'consultores') { L.push('fra;loja;consultor;inicio;fim_previsto;status;dia;ritmo;tarefas;feitas;vencidas;reunioes;realizadas;sem_confirmacao;nota_inicial;nota_atual;avaliacoes;satisfacao_media;veredito;d_score;d_lucro_pct'); R.cons.forEach(c => { const a = R.AND[c.id], s = SNAPS[c.fra], r = c.resultado || {}; L.push([c.fra, seg(frqDe(c.fra).nome), seg(nomeDe(c.consultor_id)), c.inicio, c.fim_previsto, c.status, a.decorrido, a.ritmo.l, a.tarefas.length, a.tFeitas.length, a.tVenc.length, a.reunioes.length, a.rFeitas.length, a.rPend.length, c.score_inicial ?? '', s && s.score != null ? s.score : '', a.avs.length, a.avs.length ? br(media(a.avs.map(v => v.nota)), 2) : '', r.veredito || '', r.d_score ?? '', r.d_lucro_pct == null ? '' : br(r.d_lucro_pct, 2)].join(';')); }); }
  if (qual === 'acessos') { L.push('user_id;nome;papeis;em;origem'); ACESSOS.forEach(a => { const p = PERFIS.find(x => x.id === a.user_id) || {}; L.push([a.user_id, seg(p.nome || ''), (p.papeis || []).join('|'), a.em, a.origem || ''].join(';')); }); }
  if (qual === 'evolucao') { L.push('fra;loja;mes_ref;nota;receita_mes;margem_adj;lucro_mes;em_consultoria'); HIST.filter(h => R.fras.has(h.fra)).forEach(h => L.push([h.fra, seg(frqDe(h.fra).nome), h.mes_ref, h.score ?? '', h.receita ?? '', h.margem ?? '', h.lucro ?? '', R.cons.some(c => c.fra === h.fra && c.status !== 'cancelada') ? 'sim' : 'não'].join(';'))); }
  if (L.length <= 1) { toast('nada para exportar'); return; }
  baixarCSV('acompanhamento_' + qual, L);
}

iniciar().catch(erro);
