// Telas da visão Administrador (A1–A7), pelo id da rota em views/routes.js.
import { montarPainel } from './painel.js';
import { montarMoedas } from './moedas.js';
import { montarClientes } from './clientes.js';
import { montarOrdens } from './ordens.js';
import { montarRelatorios } from './relatorios.js';
import { montarComissoesAdmin } from './comissoes.js';
import { montarAlertas } from './alertas.js';

export const TELAS_ADMIN = {
  painel: montarPainel,
  moedas: montarMoedas,
  clientes: montarClientes,
  ordens: montarOrdens,
  relatorios: montarRelatorios,
  comissoes: montarComissoesAdmin,
  alertas: montarAlertas,
};
