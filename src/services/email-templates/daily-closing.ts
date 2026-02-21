import { MovementAccountKey } from '../movimientos-fondos';

export type DailyClosingEmailContext = {
    company: string;
    accountKey: MovementAccountKey;
    closingDateISO: string;
    manager: string;
    totalCRC: number;
    totalUSD: number;
    recordedBalanceCRC: number;
    recordedBalanceUSD: number;
    diffCRC: number;
    diffUSD: number;
    notes?: string;
};

type EmailTemplate = {
    subject: string;
    text: string;
    html: string;
};

const crcFormatter = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const formatCurrency = (currency: 'CRC' | 'USD', value: number) => {
    const formatter = currency === 'USD' ? usdFormatter : crcFormatter;
    return formatter.format(Math.trunc(value));
};

const formatDiff = (currency: 'CRC' | 'USD', diff: number) => {
    if (diff === 0) return 'Sin diferencias';
    const formatted = formatCurrency(currency, Math.abs(diff));
    return diff > 0 ? `Sobrante de ${formatted}` : `Faltante de ${formatted}`;
};

export const buildDailyClosingEmailTemplate = (context: DailyClosingEmailContext): EmailTemplate => {
    const closingDate = new Date(context.closingDateISO);
    const dateLabel = new Intl.DateTimeFormat('es-CR', {
        dateStyle: 'full',
        timeStyle: 'short',
    }).format(closingDate);

    const subject = `Nuevo cierre diario — ${context.company}`;

    const notesSection = context.notes && context.notes.trim().length > 0
        ? `
Notas:
${context.notes.trim()}
`
        : '';

    const text = `Se registró un nuevo cierre diario en Time Master.

Empresa: ${context.company}
Cuenta: ${context.accountKey}
Fecha: ${dateLabel}
Encargado: ${context.manager}

Totales declarados:
 - Colones: ${formatCurrency('CRC', context.totalCRC)}
 - Dólares: ${formatCurrency('USD', context.totalUSD)}

Saldos registrados en sistema:
 - Colones: ${formatCurrency('CRC', context.recordedBalanceCRC)}
 - Dólares: ${formatCurrency('USD', context.recordedBalanceUSD)}

Diferencias:
 - Colones: ${formatDiff('CRC', context.diffCRC)}
 - Dólares: ${formatDiff('USD', context.diffUSD)}
${notesSection}`.trim();

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1b1f23;">
            <h2 style="margin-bottom: 12px;">Nuevo cierre diario registrado</h2>
            <p style="margin: 0 0 12px 0;">Se registró un cierre para <strong>${context.company}</strong> en la cuenta <strong>Fondo General</strong>.</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                <tbody>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #d0d7de; font-weight: 600;">Fecha</td>
                        <td style="padding: 8px; border: 1px solid #d0d7de;">${dateLabel}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #d0d7de; font-weight: 600;">Encargado</td>
                        <td style="padding: 8px; border: 1px solid #d0d7de;">${context.manager}</td>
                    </tr>
                </tbody>
            </table>
            <h3 style="margin: 16px 0 8px 0;">Totales declarados</h3>
            <ul style="margin: 0 0 16px 16px; padding: 0;">
                <li>Colones: <strong>${formatCurrency('CRC', context.totalCRC)}</strong></li>
                <li>Dólares: <strong>${formatCurrency('USD', context.totalUSD)}</strong></li>
            </ul>
            <h3 style="margin: 16px 0 8px 0;">Saldos registrados</h3>
            <ul style="margin: 0 0 16px 16px; padding: 0;">
                <li>Colones: ${formatCurrency('CRC', context.recordedBalanceCRC)}</li>
                <li>Dólares: ${formatCurrency('USD', context.recordedBalanceUSD)}</li>
            </ul>
            <h3 style="margin: 16px 0 8px 0;">Diferencias</h3>
            <ul style="margin: 0 0 16px 16px; padding: 0;">
                <li>Colones: ${formatDiff('CRC', context.diffCRC)}</li>
                <li>Dólares: ${formatDiff('USD', context.diffUSD)}</li>
            </ul>
            ${context.notes && context.notes.trim().length > 0
            ? `<div style="border-left: 4px solid #0366d6; background: #f1f8ff; padding: 12px 16px; border-radius: 6px;">
                        <strong>Notas:</strong>
                        <p style="margin: 8px 0 0 0; white-space: pre-line;">${context.notes.trim()}</p>
                    </div>`
            : ''}
        </div>
    `;

    return {
        subject,
        text,
        html,
    };
};
