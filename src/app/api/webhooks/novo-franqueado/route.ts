import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRegistroFranquiaRecipients, sendRegistroFranquiaEmail } from '@/lib/email';
import { SINO_NOVO_FRANQUEADO_HTML } from '@/lib/sino-novo-franqueado-template';
import { gerarRegistroFranquiaPdf } from '@/lib/registro-franquia-pdf';

type FranqueadoPayload = {
  id: string;
  nome_completo?: string | null;
  n_franquia?: string | null;
  data_ass_contrato?: string | null; // ISO ou texto
  area_atuacao?: string | null;
  email_frank?: string | null;
};

function formatDateBR(input: string | null | undefined): string {
  const s = String(input ?? '').trim();
  if (!s) return '';
  // aceita yyyy-mm-dd ou yyyy-mm-ddTHH...
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function safe(s: unknown): string {
  return String(s ?? '').trim();
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function extractRecord(body: any): FranqueadoPayload | null {
  // Supabase Webhooks costuma enviar: { type, table, schema, record, old_record }
  if (body?.record && typeof body.record === 'object') return body.record as FranqueadoPayload;
  // fallback caso venha diretamente o registro
  if (body?.id && (body?.nome_completo || body?.n_franquia)) return body as FranqueadoPayload;
  return null;
}

export async function POST(req: Request) {
  try {
    const secret = process.env.WEBHOOK_SECRET;
    const got = req.headers.get('x-webhook-secret') ?? '';
    if (!secret || got !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const payload = extractRecord(body);
    if (!payload?.id) {
      return NextResponse.json({ error: 'Payload inválido (sem record.id)' }, { status: 400 });
    }

    const nome = safe(payload.nome_completo);
    const fk = safe(payload.n_franquia);
    const dataBR = formatDateBR(payload.data_ass_contrato);
    const area = safe(payload.area_atuacao);

    // 1) E-mail com PDF: REGISTRO_FRANQUIA_NOTIFY_EMAILS (Vercel) ou email_frank no registro
    try {
      const recipients = getRegistroFranquiaRecipients(payload.email_frank);
      if (recipients.length === 0) {
        console.warn(
          'webhook novo-franqueado: sem destinatário para Registro de Franquia — defina REGISTRO_FRANQUIA_NOTIFY_EMAILS ou preencha email_frank.',
        );
      } else {
        const pdfBytes = await gerarRegistroFranquiaPdf({
          nomeFranqueado: nome || '-',
          numeroFranquia: fk || '-',
          dataAssinaturaContrato: dataBR || '-',
        });
        const emailRes = await sendRegistroFranquiaEmail({
          to: recipients,
          nomeFranqueado: nome || '-',
          numeroFranquia: fk || '-',
          dataAssinaturaContrato: dataBR || '-',
          pdfBytes,
        });
        if (!emailRes.ok) console.error('sendRegistroFranquiaEmail (webhook)', emailRes.error);
      }
    } catch (e) {
      console.error('webhook novo-franqueado: falha no envio de e-mail', e);
    }

    // 2) Post na timeline (service role)
    const sinoHtml =
      SINO_NOVO_FRANQUEADO_HTML
        .replaceAll('[Nome do Franqueado]', escapeHtml(nome || '-'))
        .replaceAll('[Cidade / Estado]', escapeHtml(area || '-'))
        .replaceAll('[FK0000]', escapeHtml(fk || '-'))
        .replaceAll('[Data]', escapeHtml(dataBR || '-'));

    const conteudo =
      `Recebemos com entusiasmo nosso novo parceiro de negócios, ${nome || '-'}, ` +
      `que chega para contribuir na transformação do cenário da incorporação em ` +
      `${area || '-'}. Bem-vindo à rede Casa Moní, ${fk || '-'}.`;

    const admin = createAdminClient();
    const { error: insErr } = await admin.from('community_posts').insert({
      author_type: 'moni',
      tipo: 'sino_franqueado',
      titulo: 'Grandes propósitos se constroem em rede.',
      conteudo,
      sino_html: sinoHtml,
      franqueado_id: payload.id,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('webhook novo-franqueado', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

