import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';

// Definir secretos
const gmailUser = defineSecret("GMAIL_USER");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

// Inicializar Firebase Admin
admin.initializeApp();

// Obtener referencia a la base de datos 'restauracion'
const getDb = () => admin.firestore().databaseId === 'restauracion' 
  ? admin.firestore() 
  : admin.app().firestore('restauracion');

/**
 * Cloud Function que se dispara cuando se crea un documento en la colección 'mail'
 * Procesa y envía el email usando nodemailer
 */
export const sendEmailTrigger = onDocumentCreated(
  {
    document: "mail/{emailId}",
    database: "restauracion",
    secrets: [gmailUser, gmailAppPassword],
  },
  async (event) => {
  const emailData = event.data.data();
  const emailId = event.params.emailId;

  console.log(`📧 Processing email ${emailId}:`, {
    to: emailData.to,
    subject: emailData.subject,
  });

  try {
    // Validar datos requeridos
    if (!emailData.to || !emailData.subject) {
      throw new Error("Missing required email fields: to, subject");
    }

    // Configurar transporter de nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser.value(),
        pass: gmailAppPassword.value(),
      },
      pool: true,
      maxConnections: 1,
      rateDelta: 20000,
      rateLimit: 5,
    });

    // Preparar opciones del email
    const mailOptions = {
      from: {
        name: "Time Master System",
        address: gmailUser.value() || "",
      },
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.text || "",
      html: emailData.html || `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333; margin-bottom: 20px;">Time Master System</h2>
            <div style="background-color: white; padding: 20px; border-radius: 6px; border-left: 4px solid #007bff;">
              ${(emailData.text || "").replace(/\n/g, "<br>")}
            </div>
            <div style="margin-top: 20px; padding: 15px; background-color: #e9ecef; border-radius: 6px;">
              <p style="margin: 0; font-size: 12px; color: #6c757d;">
                Este correo fue enviado desde el sistema Time Master. 
                Si no esperabas recibir este mensaje, por favor ignóralo.
              </p>
            </div>
          </div>
        </div>
      `,
      attachments: emailData.attachments || [],
      headers: {
        "X-Priority": "3",
        "X-MSMail-Priority": "Normal",
        "Importance": "Normal",
        "X-Mailer": "Time Master System",
        "Reply-To": gmailUser.value() || "",
      },
      messageId: `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@pricemaster.local>`,
      date: new Date(),
    };

    // Enviar email
    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully:", info.messageId);

    // Actualizar documento en Firestore con el estado
    await getDb().collection("mail").doc(emailId).update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      messageId: info.messageId,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email:", error);

    // Actualizar documento con el error
    await getDb().collection("mail").doc(emailId).update({
      status: "failed",
      error: error.message,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // No lanzar error para evitar reintentos automáticos infinitos
    // Firebase Functions reintenta automáticamente en caso de error
    return { success: false, error: error.message };
  }
});

/**
 * Función auxiliar para verificar la configuración del sistema de emails
 * Puede ser llamada manualmente para diagnóstico
 */
export const checkEmailConfig = onRequest(
  { secrets: [gmailUser, gmailAppPassword] },
  async (req, res) => {
    const hasGmailUser = !!gmailUser.value();
    const hasGmailPassword = !!gmailAppPassword.value();

    res.json({
      configured: hasGmailUser && hasGmailPassword,
      gmailUser: hasGmailUser ? gmailUser.value() : "NOT_SET",
      gmailPassword: hasGmailPassword ? "SET" : "NOT_SET",
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * Función de prueba para enviar un email de prueba
 * Uso: POST /testEmail con body { "to": "email@example.com" }
 */
export const testEmail = onRequest(
  { secrets: [gmailUser, gmailAppPassword] },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: "Missing 'to' email address in request body" });
    }

    try {
      // Crear documento de email de prueba en Firestore
      const emailData = {
        to: to,
        subject: "🧪 Email de Prueba - Time Master",
        text: "Este es un email de prueba para verificar que el sistema de correos funciona correctamente.",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      };

      const docRef = await getDb().collection("mail").add(emailData);

      res.json({
        success: true,
        message: "Email de prueba encolado",
        emailId: docRef.id,
        note: "El trigger sendEmailTrigger debería procesarlo automáticamente",
      });
    } catch (error) {
      console.error("Error creating test email:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
