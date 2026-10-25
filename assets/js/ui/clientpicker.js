// "Visualizando como": escolhe de qual cliente fictício são os dados da visão Cliente (no lugar do login).
// Fica no topo; em telas estreitas vira só o avatar com as iniciais (o <select> nativo continua por cima).
// Trocar de cliente muda `clienteAtual` no store e a tela atual é redesenhada (main.js).

import { getState, setState, on } from '../store.js';
import { escapar } from './dom.js';

const STATUS = { ativo: '', pausado: ' (pausado)', inativo: ' (inativo)' };

export function iniciais(nome) {
  const partes = String(nome).trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes.at(-1)[0] : '')).toUpperCase();
}

function desenhar() {
  const raiz = document.getElementById('client-picker');
  const select = document.getElementById('client-select');
  const { clientes, clienteAtual, carregando } = getState();
  const lista = Object.values(clientes);
  if (carregando || !lista.length) {
    select.disabled = true;
    select.innerHTML = '<option>Carregando…</option>';
    raiz.querySelector('.client-picker__name').textContent = 'Carregando…';
    raiz.querySelector('.client-picker__avatar').textContent = '';
    return;
  }
  select.disabled = false;
  select.innerHTML = lista
    .map((c) => `<option value="${c.id}"${c.id === clienteAtual ? ' selected' : ''}>${escapar(c.nome)}${STATUS[c.status] ?? ''}</option>`)
    .join('');
  const atual = clientes[clienteAtual];
  raiz.querySelector('.client-picker__name').textContent = atual?.nome ?? '';
  raiz.querySelector('.client-picker__avatar').textContent = atual ? iniciais(atual.nome) : '';
  raiz.dataset.status = atual?.status ?? '';
  raiz.title = atual ? `Visualizando como ${atual.nome}` : '';
}

export function iniciarSeletorCliente() {
  document.getElementById('client-select').addEventListener('change', (e) => {
    if (getState().clientes[e.target.value]) setState({ clienteAtual: e.target.value });
  });
  on('data:ready', desenhar);
  on('state:clienteAtual', desenhar);
  on('client:change', desenhar);
  desenhar();
}
