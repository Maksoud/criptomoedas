// Confirmação de sinal (docs/ESTRATEGIAS.md §1.3), comum a todas as estratégias.
//
// O motor passa, a cada avaliação de um cliente × moeda (o "grupo"), a lista completa de sinais que
// valem naquele instante. Cada sinal tem uma `chave` estável ('compra', 'venda:o000123', 'ordem:o000555').
//
//   velas  — a condição precisa valer no fechamento de N velas seguidas. Só os fechamentos contam: um
//            sinal que some entre dois fechamentos e volta antes do próximo não é cancelado.
//   tempo  — precisa valer por N segundos sem interrupção: some uma vez, cancela.
//   volume — confirma no fechamento da primeira vela com volume acima da média das 20 anteriores
//            (com a condição valendo). Sem volume conhecido (média 0), a vela confirma.
//
// Sinais de stop sempre pedem confirmação, mesmo com ela desligada na moeda.

export const VELAS_MEDIA_VOLUME = 20;

/** O sinal precisa passar pela confirmação? */
export function precisaConfirmar(sinal, cfg) {
  if (sinal.stop) return true;
  if (!cfg?.ativa) return false;
  return cfg.aplicarEm === 'ambos' || !cfg.aplicarEm || cfg.aplicarEm === sinal.tipo;
}

/** Média de volume das `n` velas anteriores à última da lista. */
export function mediaVolume(velas, n = VELAS_MEDIA_VOLUME) {
  const anteriores = velas.slice(Math.max(0, velas.length - 1 - n), velas.length - 1);
  if (!anteriores.length) return 0;
  return anteriores.reduce((s, v) => s + (v.volume ?? 0), 0) / anteriores.length;
}

export function criarConfirmacao() {
  const grupos = new Map(); // grupo → Map(chave → pendente)

  /**
   * @param grupo   'c01:BTC'
   * @param sinais  sinais que valem agora
   * @param cfg     moeda.confirmacao ({ ativa, modo, n, aplicarEm })
   * @param agora   ms
   * @param vela    vela recém-fechada (avaliação de fechamento) ou null (atualização de preço)
   * @param velas   série de velas fechadas (para a média de volume)
   * @returns { confirmados, pendentes, cancelados }
   */
  function processar({ grupo, sinais, cfg, agora, vela = null, velas = [] }) {
    const modo = cfg?.modo ?? 'velas';
    const n = Math.max(1, Math.round(cfg?.n ?? 2));
    if (!grupos.has(grupo)) grupos.set(grupo, new Map());
    const pend = grupos.get(grupo);

    const confirmados = [];
    const cancelados = [];
    const presentes = new Set();

    for (const sinal of sinais) {
      const chave = sinal.chave ?? sinal.tipo;
      presentes.add(chave);
      if (!precisaConfirmar(sinal, cfg)) {
        if (pend.has(chave)) pend.delete(chave);
        confirmados.push(sinal);
        continue;
      }
      let p = pend.get(chave);
      if (!p || p.modo !== modo || p.n !== n) {
        p = { chave, sinal, modo, n, inicio: agora, contagem: 0 };
        pend.set(chave, p);
      }
      p.sinal = sinal;

      let ok = false;
      if (modo === 'tempo') {
        p.contagem = Math.min(n, Math.floor((agora - p.inicio) / 1000));
        ok = agora - p.inicio >= n * 1000;
      } else if (modo === 'volume') {
        if (vela) {
          const media = mediaVolume(velas);
          ok = !(media > 0) || (vela.volume ?? 0) > media;
          p.contagem = ok ? 1 : 0;
        }
      } else if (vela && p.ultimaVela !== vela.t) {
        p.ultimaVela = vela.t;
        p.contagem++;
        ok = p.contagem >= n;
      }
      if (ok) {
        pend.delete(chave);
        confirmados.push(sinal);
      }
    }

    // Some da lista → cancela (no modo tempo a qualquer momento; nos outros, só num fechamento de vela).
    for (const [chave, p] of [...pend]) {
      if (presentes.has(chave)) continue;
      if (p.modo === 'tempo' || vela) {
        pend.delete(chave);
        cancelados.push(p.sinal);
      }
    }

    const pendentes = [...pend.values()].map((p) => ({
      chave: p.chave,
      tipo: p.sinal.tipo,
      motivo: p.sinal.motivo,
      compraId: p.sinal.compraId ?? null,
      ordemId: p.sinal.ordemId ?? null,
      stop: !!p.sinal.stop,
      modo: p.modo,
      contagem: p.contagem,
      n: p.modo === 'volume' ? 1 : p.n,
      desde: p.inicio,
    }));
    if (!pend.size) grupos.delete(grupo);
    return { confirmados, pendentes, cancelados };
  }

  /** Esquece os pendentes (robô pausado, dados restaurados). Devolve os sinais descartados. */
  function limpar(grupo = null) {
    const lista = [];
    for (const [g, pend] of grupos) {
      if (grupo && g !== grupo) continue;
      for (const p of pend.values()) lista.push({ grupo: g, sinal: p.sinal });
      grupos.delete(g);
    }
    return lista;
  }

  function pendentesDe(grupo) {
    return [...(grupos.get(grupo)?.values() ?? [])];
  }

  return { processar, limpar, pendentesDe, grupos: () => [...grupos.keys()] };
}
