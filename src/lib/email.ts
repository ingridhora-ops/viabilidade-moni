/**
 * Envio de e-mail para o franqueado quando o status do ticket jurídico muda.
 * Usa Resend (https://resend.com). Configure RESEND_API_KEY e RESEND_FROM no .env.local.
 */

import type { AccessRole } from '@/lib/authz';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Você pode sobrescrever no .env.local com RESEND_FROM=Casa Moní <onboarding@moni.casa>
const RESEND_FROM = process.env.RESEND_FROM ?? 'Casa Moní <onboarding@moni.casa>';

type ResendAttachment = {
  filename: string;
  content: string; // base64
  content_type: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lista de e-mails para avisos de cadastro (separados por vírgula ou ponto-e-vírgula). */
function parseAdminNotifyList(): string[] {
  const raw = process.env.SIGNUP_NOTIFY_ADMIN_EMAILS ?? process.env.ADMIN_NOTIFY_EMAILS ?? '';
  const list = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list;
  return ['ingrid.hora@moni.casa'];
}

export async function sendEmailViaResend(input: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  attachments?: ResendAttachment[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((e) => e.trim())
    .filter(Boolean);
  if (!recipients.length) return { ok: false, error: 'E-mail do destinatário não informado.' };
  if (!RESEND_API_KEY) {
    // Sem chave: não envia, não falha (evita quebrar o fluxo em dev)
    return { ok: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: recipients,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend: ${res.status} ${body}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function sendJuridicoStatusEmail(
  to: string,
  titulo: string,
  mensagem: string,
  statusLabel: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return await sendEmailViaResend({
    to,
    subject: `[Jurídico] ${statusLabel}: ${titulo}`,
    text: `${mensagem}\n\nAcesse o portal para ver detalhes.`,
    html: `<p>${mensagem.replace(/\n/g, '<br>')}</p><p>Acesse o portal para ver detalhes.</p>`,
  });
}

export async function sendRegistroFranquiaEmail(input: {
  to: string;
  nomeFranqueado: string;
  numeroFranquia: string;
  dataAssinaturaContrato: string;
  pdfBytes: Uint8Array;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const base64 = Buffer.from(input.pdfBytes).toString('base64');
  const filename = `registro-franquia-${String(input.numeroFranquia || 'novo').trim() || 'novo'}.pdf`;

  return await sendEmailViaResend({
    to: input.to,
    subject: 'Registro de Franquia — Casa Moní',
    text:
      `Olá!\n\nSegue em anexo o seu Registro de Franquia.\n\n` +
      `Franqueado: ${input.nomeFranqueado}\n` +
      `Número de Franquia: ${input.numeroFranquia}\n` +
      `Data da assinatura: ${input.dataAssinaturaContrato}\n`,
    html:
      `<p>Olá!</p>` +
      `<p>Segue em anexo o seu <strong>Registro de Franquia</strong>.</p>` +
      `<ul>` +
      `<li><strong>Franqueado:</strong> ${input.nomeFranqueado}</li>` +
      `<li><strong>Número de Franquia:</strong> ${input.numeroFranquia}</li>` +
      `<li><strong>Data da assinatura:</strong> ${input.dataAssinaturaContrato}</li>` +
      `</ul>`,
    attachments: [
      {
        filename,
        content: base64,
        content_type: 'application/pdf',
      },
    ],
  });
}

/**
 * Notificações de auto-cadastro: e-mail ao próprio usuário (se pending) e aos administradores.
 */
export async function sendSignupNotifications(opts: {
  userEmail: string;
  userName: string;
  departamento: string;
  accessRole: AccessRole;
}): Promise<void> {
  const admins = parseAdminNotifyList();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const nome = opts.userName || '—';
  const dept = opts.departamento || '—';

  if (opts.accessRole === 'pending') {
    await sendEmailViaResend({
      to: opts.userEmail,
      subject: 'Cadastro recebido — Casa Moní',
      text:
        `Olá${nome !== '—' ? `, ${nome}` : ''}!\n\n` +
        'Recebemos seu cadastro na plataforma Moní. Seu acesso está aguardando aprovação de um administrador.\n\n' +
        'Você receberá outro aviso quando for liberado.\n\n' +
        `${appUrl}\n`,
      html:
        `<p>Olá${nome !== '—' ? `, <strong>${escapeHtml(nome)}</strong>` : ''}!</p>` +
        '<p>Recebemos seu cadastro na plataforma Moní. Seu acesso está <strong>aguardando aprovação</strong> de um administrador.</p>' +
        '<p>Você receberá outro aviso quando for liberado.</p>' +
        `<p><a href="${appUrl.replace(/"/g, '%22')}">Abrir portal</a></p>`,
    });

    const adminText = [
      `E-mail: ${opts.userEmail}`,
      `Nome: ${nome}`,
      `Departamento: ${dept}`,
      `Papel atribuído: ${opts.accessRole}`,
      '',
      `Gerenciar usuários: ${appUrl}/admin/usuarios`,
    ].join('\n');
    const adminHtml =
      '<ul>' +
      `<li><strong>E-mail:</strong> ${escapeHtml(opts.userEmail)}</li>` +
      `<li><strong>Nome:</strong> ${escapeHtml(nome)}</li>` +
      `<li><strong>Departamento:</strong> ${escapeHtml(dept)}</li>` +
      `<li><strong>Papel:</strong> ${escapeHtml(opts.accessRole)}</li>` +
      '</ul>' +
      `<p><a href="${appUrl.replace(/"/g, '%22')}/admin/usuarios">Gerenciar usuários</a></p>`;

    await sendEmailViaResend({
      to: admins,
      subject: `[Moní] Novo cadastro pendente: ${opts.userEmail}`,
      text: adminText,
      html: adminHtml,
    });
    return;
  }

  // Cadastro já liberado (seed team / fluxo aprovado): aviso ao próprio usuário (sem spam para admins).
  if (opts.accessRole === 'team') {
    await sendEmailViaResend({
      to: opts.userEmail,
      subject: 'Conta criada — Casa Moní',
      text:
        `Olá${nome !== '—' ? `, ${nome}` : ''}!\n\n` +
        'Sua conta na plataforma Moní foi criada com sucesso. Você já pode acessar com seu e-mail e senha.\n\n' +
        `${appUrl}\n`,
      html:
        `<p>Olá${nome !== '—' ? `, <strong>${escapeHtml(nome)}</strong>` : ''}!</p>` +
        '<p>Sua conta na plataforma Moní foi <strong>criada com sucesso</strong>. Você já pode acessar com seu e-mail e senha.</p>' +
        `<p><a href="${appUrl.replace(/"/g, '%22')}">Abrir portal</a></p>`,
    });
  }
}
