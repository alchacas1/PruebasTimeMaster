import { db } from '@/config/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  encoding?: string;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export class EmailService {
  /**
   * Encola un email en Firestore para que sea procesado por Firebase Functions
   * Este método reemplaza el envío directo de emails
   */
  static async queueEmail(options: EmailOptions): Promise<void> {
    try {
      // Validar datos requeridos
      if (!options.to || !options.subject || !options.text) {
        throw new Error('Missing required email fields: to, subject, text');
      }

      // Preparar datos del email - solo incluir campos definidos
      const emailData: any = {
        to: options.to,
        subject: options.subject,
        text: options.text,
        createdAt: Timestamp.now(),
        status: 'pending'
      };

      // Solo agregar campos opcionales si están definidos
      if (options.html !== undefined) {
        emailData.html = options.html;
      }

      if (options.attachments !== undefined && options.attachments.length > 0) {
        emailData.attachments = options.attachments;
      }

      // Guardar en Firestore - esto disparará la Cloud Function
      await addDoc(collection(db, 'mail'), emailData);

      console.log('✅ Email queued successfully for:', options.to);
    } catch (error) {
      console.error('❌ Error queueing email:', error);
      throw new Error('Failed to queue email: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Envía email de recuperación de contraseña
   */
  static async sendPasswordRecoveryEmail(
    email: string,
    token: string,
    expiresAt: number
  ): Promise<void> {
    const expiryTime = new Date(expiresAt).toLocaleString('es-ES');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');
    const recoveryUrl = `${baseUrl}/reset-password?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { 
            display: inline-block; 
            background: #2563eb; 
            color: white !important; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
            font-weight: bold;
          }
          .token-box {
            background: white;
            border: 2px dashed #2563eb;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
            font-size: 14px;
            word-break: break-all;
          }
          .warning { 
            background: #fef3c7; 
            border-left: 4px solid #f59e0b; 
            padding: 15px; 
            margin: 20px 0; 
          }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Recuperación de Contraseña</h1>
          </div>
          
          <div class="content">
            <h2>Hola,</h2>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de <strong>SuperAdmin</strong> en Time Master.</p>
            
            <p>Para restablecer tu contraseña, haz clic en el siguiente botón:</p>
            
            <div style="text-align: center;">
              <a href="${recoveryUrl}" class="button">Restablecer Contraseña</a>
            </div>
            
            <p>O copia y pega este enlace en tu navegador:</p>
            <div class="token-box">
              ${recoveryUrl}
            </div>
            
            <div class="warning">
              <strong>Importante:</strong>
              <ul style="margin: 10px 0;">
                <li>Este enlace expira el: <strong>${expiryTime}</strong></li>
                <li>Solo puede ser usado una vez</li>
                <li>Si no solicitaste este cambio, ignora este email</li>
              </ul>
            </div>
            
            <p><strong>Por tu seguridad:</strong></p>
            <ul>
              <li>Nunca compartas este enlace con nadie</li>
              <li>No respondas a este email</li>
              <li>Asegúrate de estar en el sitio oficial antes de ingresar datos</li>
            </ul>
          </div>
          
          <div class="footer">
            <p>Este es un email automático de Time Master System</p>
            <p>© ${new Date().getFullYear()} Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Recuperación de Contraseña - Time Master

Recibimos una solicitud para restablecer tu contraseña.

Ingresa al siguiente enlace para continuar:
${recoveryUrl}

Este enlace expira el: ${expiryTime}

Si no solicitaste este cambio, ignora este email.

---
Time Master System
    `;

    await this.queueEmail({
      to: email,
      subject: 'Recuperación de Contraseña - Time Master',
      text: textContent,
      html: htmlContent
    });

  }

  /**
   * Envía notificación de cambio de contraseña exitoso
   */
  static async sendPasswordChangedNotification(email: string): Promise<void> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 30px; background: #f9fafb; border-radius: 0 0 8px 8px; }
          .info-box { background: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
          .warning-text { color: #dc2626; font-weight: bold; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Contraseña Actualizada</h1>
          </div>
          
          <div class="content">
            <p>Tu contraseña ha sido actualizada exitosamente en Time Master.</p>
            
            <div class="info-box">
              <strong>Fecha:</strong> ${new Date().toLocaleString('es-ES')}<br>
              <strong>Cuenta:</strong> ${email}
            </div>
            
            <p class="warning-text">Si no realizaste este cambio, contacta inmediatamente al administrador del sistema.</p>
            
            <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
              Este es un email automático de seguridad. Por favor, no respondas a este mensaje.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Contraseña Actualizada - Time Master

Tu contraseña ha sido actualizada exitosamente.

Fecha: ${new Date().toLocaleString('es-ES')}
Cuenta: ${email}

⚠️ Si no realizaste este cambio, contacta inmediatamente al administrador del sistema.

---
Time Master System
    `;

    await this.queueEmail({
      to: email,
      subject: 'Contraseña Actualizada - Time Master',
      text: textContent,
      html: htmlContent
    });

  }
}
