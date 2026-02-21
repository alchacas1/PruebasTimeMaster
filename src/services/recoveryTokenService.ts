import { collection, doc, setDoc, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { RecoveryToken } from '../types/recovery';
import crypto from 'crypto';

export class RecoveryTokenService {
  private static readonly COLLECTION = 'recovery_tokens';
  private static readonly TOKEN_EXPIRY = 1800000; // 30 minutos en ms

  /**
   * Genera un token criptográficamente seguro
   */
  private static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash del token para almacenamiento seguro en BD
   */
  private static hashToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Crea un nuevo token de recuperación
   */
  static async createRecoveryToken(
    email: string,
    userId: string
  ): Promise<{ token: string; expiresAt: number }> {
    // Genera token único
    const plainToken = this.generateSecureToken();
    const hashedToken = this.hashToken(plainToken);
    
    const now = Date.now();
    const expiresAt = now + this.TOKEN_EXPIRY;

    // Invalida tokens anteriores del mismo usuario
    await this.invalidatePreviousTokens(email);

    const recoveryToken: RecoveryToken = {
      token: hashedToken,
      email,
      userId,
      createdAt: now,
      expiresAt,
      used: false
    };

    // Guarda en Firestore
    const tokenRef = doc(collection(db, this.COLLECTION));
    await setDoc(tokenRef, recoveryToken);

    // Registra en logs de auditoría
    await this.logRecoveryRequest(email, userId);

    // Retorna el token SIN hashear para enviarlo por email
    return {
      token: plainToken,
      expiresAt
    };
  }

  /**
   * Valida un token de recuperación
   */
  static async validateToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    userId?: string;
    error?: string;
  }> {
    const hashedToken = this.hashToken(token);

    // Busca el token en la base de datos
    const tokensRef = collection(db, this.COLLECTION);
    const q = query(tokensRef, where('token', '==', hashedToken));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return { valid: false, error: 'Token inválido' };
    }

    const tokenDoc = querySnapshot.docs[0];
    const recoveryToken = tokenDoc.data() as RecoveryToken;

    // Verifica si ya fue usado
    if (recoveryToken.used) {
      return { valid: false, error: 'Token ya utilizado' };
    }

    // Verifica expiración
    if (Date.now() > recoveryToken.expiresAt) {
      // Elimina token expirado
      await deleteDoc(tokenDoc.ref);
      return { valid: false, error: 'Token expirado' };
    }

    return {
      valid: true,
      email: recoveryToken.email,
      userId: recoveryToken.userId
    };
  }

  /**
   * Marca un token como usado y lo elimina
   */
  static async markTokenAsUsed(token: string): Promise<void> {
    const hashedToken = this.hashToken(token);

    const tokensRef = collection(db, this.COLLECTION);
    const q = query(tokensRef, where('token', '==', hashedToken));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const tokenDoc = querySnapshot.docs[0];
      // Elimina el token en lugar de marcarlo como usado
      await deleteDoc(tokenDoc.ref);
    }
  }

  /**
   * Invalida y elimina todos los tokens anteriores de un usuario
   */
  private static async invalidatePreviousTokens(email: string): Promise<void> {
    const tokensRef = collection(db, this.COLLECTION);
    const q = query(
      tokensRef,
      where('email', '==', email),
      where('used', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Elimina todos los tokens anteriores
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
  }

  /**
   * Registra solicitud de recuperación en logs
   */
  private static async logRecoveryRequest(
    email: string,
    userId: string
  ): Promise<void> {
    const logRef = doc(collection(db, 'security_logs'));
    
    await setDoc(logRef, {
      type: 'password_recovery_request',
      email,
      userId,
      timestamp: Date.now()
    });
  }

  /**
   * Limpia tokens expirados (ejecutar periódicamente)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const tokensRef = collection(db, this.COLLECTION);
    const now = Date.now();
    
    const q = query(tokensRef, where('expiresAt', '<', now));
    const querySnapshot = await getDocs(q);
    
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return querySnapshot.size;
  }
}
