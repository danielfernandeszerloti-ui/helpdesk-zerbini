// Regras de senha forte do helpdesk
export const MIN_SENHA = 10

const COMUNS = [
  'senha', 'password', 'qwerty', 'asdfgh', 'zxcvbn', 'abc123', 'admin', 'teste', 'mudar', 'trocar',
  'zerbini', 'grupozerbini', 'helpdesk', 'bemvindo', 'brasil', 'iloveyou', 'master', 'welcome',
]

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// 3+ caracteres em sequência (abc, 123, cba, 321) ou repetidos (aaa, 111)
function temSequencia(s) {
  const t = normalizar(s)
  for (let i = 0; i + 2 < t.length; i++) {
    const a = t.charCodeAt(i), b = t.charCodeAt(i + 1), c = t.charCodeAt(i + 2)
    if ((b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1) || (a === b && b === c)) return true
  }
  return false
}

export function avaliarSenha(senha, { email = '', nome = '' } = {}) {
  const s = String(senha || '')
  const t = normalizar(s).replace(/[^a-z0-9]/g, '')
  const regras = [
    { ok: s.length >= MIN_SENHA, texto: `Pelo menos ${MIN_SENHA} caracteres` },
    { ok: /[a-z]/.test(s) && /[A-Z]/.test(s), texto: 'Letras maiúsculas e minúsculas' },
    { ok: /\d/.test(s), texto: 'Pelo menos um número' },
    { ok: /[^A-Za-z0-9]/.test(s), texto: 'Pelo menos um símbolo (! @ # $ % …)' },
  ]
  const pessoais = [
    ...normalizar(email.split('@')[0]).split(/[._-]+/),
    ...normalizar(nome).split(/\s+/),
  ].filter((p) => p.length >= 3)
  const extras = [
    { ok: !COMUNS.some((c) => t.includes(c)), texto: 'Sem palavras óbvias (senha, zerbini, admin…)' },
    { ok: !pessoais.some((p) => t.includes(p)), texto: 'Sem seu nome ou e-mail' },
    { ok: !temSequencia(s), texto: 'Sem sequências ou repetições (123, abc, aaa)' },
  ]
  const todas = [...regras, ...extras]
  const ok = todas.every((r) => r.ok)
  // força: base nas regras + bônus de comprimento
  let pontos = regras.filter((r) => r.ok).length + (extras.every((r) => r.ok) ? 1 : 0)
  if (s.length >= 14) pontos++
  const nivel = !s ? 0 : !ok ? Math.min(2, Math.max(1, pontos - 3)) : pontos >= 6 ? 4 : 3
  return { ok, nivel, regras: todas }
}

export const NIVEIS = ['', 'Fraca', 'Média', 'Forte', 'Muito forte']
