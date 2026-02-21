/**
 * Template de correo para notificación de creación de proveedor de EGRESO (Fondo General)
 */

export interface EgresoProviderCreatedEmailData {
  company: string;
  providerName: string;
  providerType: string;
  createdBy: string;
  createdAt: string;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function generateEgresoProviderCreatedEmail(
  data: EgresoProviderCreatedEmailData
): { subject: string; html: string; text: string } {
  const { company, providerName, providerType, createdBy, createdAt } = data;

  const date = new Date(createdAt);
  const formattedDate = Number.isNaN(date.getTime())
    ? createdAt
    : date.toLocaleString("es-CR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const subject = `Nuevo proveedor de egreso creado - ${company}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Nuevo proveedor de EGRESO creado</h2>
      <p>Se ha creado un nuevo proveedor de tipo <strong>EGRESO</strong> en el Fondo General.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Empresa:</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(company)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Proveedor:</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(providerName)}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Tipo (EGRESO):</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(providerType)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Creado por:</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(createdBy)}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Fecha:</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(formattedDate)}</td>
        </tr>
      </table>

      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        Este es un correo automático generado por el sistema Time Master.
      </p>
    </div>
  `;

  const text = `
Nuevo proveedor de EGRESO creado

Se ha creado un nuevo proveedor de tipo EGRESO en el Fondo General.

Empresa: ${company}
Proveedor: ${providerName}
Tipo (EGRESO): ${providerType}
Creado por: ${createdBy}
Fecha: ${formattedDate}

---
Este es un correo automático generado por el sistema Time Master.
  `;

  return { subject, html, text };
}
