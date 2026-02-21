import { FirestoreService } from './firestore';
import { User } from '../types/firestore';
import { getDefaultPermissions } from '../utils/permissions';
import { hashPassword } from '../lib/auth/password';
import { getFirestore, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const ARGON2_HASH_PREFIX = '$argon2';

async function preparePasswordForStorage(password?: string | null): Promise<string | undefined> {
  if (typeof password !== 'string') {
    return undefined;
  }

  if (password.length === 0 || password.trim().length === 0) {
    return undefined;
  }

  if (password.startsWith(ARGON2_HASH_PREFIX)) {
    return password;
  }

  return hashPassword(password);
}

export class UsersService {
  private static readonly COLLECTION_NAME = 'users';

  /**
   * Subscribe to real-time updates for a specific user
   * Returns an unsubscribe function to clean up the listener
   */
  static subscribeToUser(
    userId: string,
    callback: (userData: User | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    try {
      const userDocRef = doc(db, this.COLLECTION_NAME, userId);

      const unsubscribe = onSnapshot(
        userDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            callback({ id: snapshot.id, ...snapshot.data() } as User);
          } else {
            callback(null);
          }
        },
        (error) => {
          console.error('Error in user subscription:', error);
          if (onError) onError(error);
        }
      );

      return unsubscribe;
    } catch (err) {
      console.error('Error setting up user subscription:', err);
      if (onError) onError(err as Error);
      return () => {}; // Return empty cleanup function
    }
  }

  /**
   * Get all users
   */
  static async getAllUsers(): Promise<User[]> {
    return await FirestoreService.getAll(this.COLLECTION_NAME);
  }
  // Find users by role with optional actor validation
  static async findUsersByRole(actorOrRole: User | { role?: string } | null | 'admin' | 'user' | 'superadmin', maybeRole?: 'admin' | 'user' | 'superadmin'): Promise<User[]> {
    // Support two call styles: (role) or (actor, role)
    let actor: User | { role?: string } | null = null;
    let role: 'admin' | 'user' | 'superadmin';

    if (typeof actorOrRole === 'string') {
      role = actorOrRole;
    } else {
      actor = actorOrRole as User | { role?: string } | null;
      role = maybeRole as 'admin' | 'user' | 'superadmin';
    }

    const users = await FirestoreService.query(this.COLLECTION_NAME, [
      { field: 'role', operator: '==', value: role }
    ]);

    // Apply actor-based filters similar to other actor-aware methods
    if (actor?.role === 'admin' || actor?.role === 'user') {
      // Admins and regular users should not see superadmins
      return users.filter(u => u.role !== 'superadmin');
    }

    if (actor?.role === 'superadmin') {
      // Superadmins don't need to see plain 'user' accounts
      return users.filter(u => u.role !== 'user');
    }

    return users;
  }
  static async getAllUsersAs(actor: User | { role?: string } | null): Promise<User[]> {
    const allUsers = await this.getAllUsers();

    // If actor is admin or user, filter out superadmin users
    if (actor?.role === 'admin' || actor?.role === 'user') {
      return allUsers.filter(user => user.role !== 'superadmin');
    }

    // If actor is superadmin, they don't need to see plain 'user' accounts
    if (actor?.role === 'superadmin') {
      return allUsers.filter(user => user.role !== 'user');
    }

    return allUsers;
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: string): Promise<User | null> {
    return await FirestoreService.getById(this.COLLECTION_NAME, id);
  }

  static async getPrimaryAdminByOwner(ownerId: string): Promise<User | null> {
    const normalized = (ownerId ?? '').trim();
    if (!normalized) return null;

    let directCandidate: User | null = null;
    try {
      directCandidate = await this.getUserById(normalized);
      if (directCandidate?.role === 'admin') {
        const directEmail = typeof directCandidate.email === 'string' ? directCandidate.email.trim() : '';
        if (directEmail.length > 0) {
          return directCandidate;
        }
      }
    } catch (error) {
      console.error('Error retrieving owner admin by id:', error);
    }

    try {
      const usersRaw = await FirestoreService.query(this.COLLECTION_NAME, [
        { field: 'ownerId', operator: '==', value: normalized }
      ]);
      const adminCandidates = (usersRaw as User[]).filter(user => user.role === 'admin');
      if (adminCandidates.length === 0) {
        return directCandidate;
      }

      const hasEmail = (user: User | undefined): boolean => typeof user?.email === 'string' && user.email.trim().length > 0;

      const preferred = adminCandidates.find(user => user.eliminate === false && hasEmail(user))
        || adminCandidates.find(user => hasEmail(user))
        || adminCandidates.find(user => user.eliminate === false)
        || adminCandidates[0];

      return preferred ?? directCandidate;
    } catch (error) {
      console.error('Error querying admin users by ownerId:', error);
      return directCandidate;
    }
  }

  /**
   * Add a new user
   */
  static async addUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const passwordForStorage = await preparePasswordForStorage(user.password);

    const userWithTimestamps = {
      ...user,
      password: passwordForStorage,
      isActive: user.isActive ?? true,
      // ensure eliminate defaults to false when not provided
      eliminate: user.eliminate ?? false,
      // Add default permissions based on role if not provided
      permissions: user.permissions || getDefaultPermissions(user.role),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return await FirestoreService.add(this.COLLECTION_NAME, userWithTimestamps);
  }

  /**
   * Create a user but validate actor permissions: admins and users cannot create superadmins
   */
  static async createUserAs(actor: User | { role?: string } | null, user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // If actor is admin or user, they cannot create superadmin users
    if ((actor?.role === 'admin' || actor?.role === 'user') && user.role === 'superadmin') {
      throw new Error('Forbidden: non-superadmin users cannot create superadmin users');
    }

    // Decide ownerId according to actor rules:
    // - If actor is an admin and actor.eliminate === false -> new user's ownerId = actor.id
    // - If actor is an admin and actor.eliminate === true  -> new user's ownerId = actor.ownerId
    // - Otherwise prefer the provided user.ownerId or fall back to empty string
    // Start with provided user.ownerId or empty
    let ownerIdToUse = user.ownerId || '';

    // If actor is missing some fields (happens if currentUser wasn't fully hydrated),
    // try to enrich from stored session in localStorage (only in browser).
    let enrichedActor: User | null = null;
    if (actor && (actor as User).role) enrichedActor = actor as User;
    if ((typeof window !== 'undefined') && (!enrichedActor || !('id' in enrichedActor) || !('ownerId' in enrichedActor) || !('eliminate' in enrichedActor))) {
      try {
        const sessionRaw = localStorage.getItem('pricemaster_session');
        if (sessionRaw) {
          const session = JSON.parse(sessionRaw);
          enrichedActor = {
            ...(enrichedActor || {}),
            id: enrichedActor?.id || session.id,
            ownerId: enrichedActor?.ownerId || session.ownerId,
            eliminate: enrichedActor?.eliminate ?? session.eliminate ?? false,
            role: enrichedActor?.role || session.role
          } as User;
        }
      } catch {
        // ignore parsing errors
      }
    }

    if (enrichedActor?.role === 'admin') {
      if (enrichedActor.eliminate === false) {
        ownerIdToUse = enrichedActor.id || enrichedActor.ownerId || ownerIdToUse;
      } else {
        ownerIdToUse = enrichedActor.ownerId || ownerIdToUse;
      }
    } else if (enrichedActor?.role === 'superadmin') {
      // superadmins creating users: if user.ownerId provided keep it, otherwise use actor id
      ownerIdToUse = user.ownerId || enrichedActor.id || ownerIdToUse;
    }

    // Preserve previous behavior for the 'eliminate' field: admins create users with eliminate=true
    const userToCreate: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
      ...user,
      ownerId: ownerIdToUse,
      eliminate: actor?.role === 'admin' ? true : (user.eliminate ?? false),
      // If an admin actor creates another admin, set maxCompanies to -1 so the created admin
      // cannot create companies. A numeric maxCompanies is enforced by EmpresasService when
      // typeof owner.maxCompanies === 'number'. Using -1 will make the owner check fail
      // (currentCount >= -1) and therefore prevent company creation.
      maxCompanies: (enrichedActor?.role === 'admin' && user.role === 'admin') ? -1 : user.maxCompanies,
      permissions: user.permissions || getDefaultPermissions(user.role)
    };

    if (!userToCreate.ownerId) {
      // Helpful debug when ownerId is still empty
      console.warn('UsersService.createUserAs: ownerId resolved to empty string for new user', { actor: actor, providedOwnerId: user.ownerId });
    }

    return await this.addUser(userToCreate);
  }

  /**
   * Update a user
   */
  static async updateUser(id: string, user: Partial<User>): Promise<void> {
    const updatePayload: Partial<User> = { ...user };

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'password')) {
      const passwordForStorage = await preparePasswordForStorage(updatePayload.password as string | undefined);
      if (passwordForStorage) {
        updatePayload.password = passwordForStorage;
      } else {
        delete updatePayload.password;
      }
    }

    const updateDataRaw: Partial<User & { updatedAt: Date }> = {
      ...updatePayload,
      updatedAt: new Date()
    };

    // Firestore update does not accept undefined values — strip them out
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateDataRaw)) {
      if (value !== undefined) {
        updateData[key] = value as unknown;
      }
    }

    return await FirestoreService.update(this.COLLECTION_NAME, id, updateData as Partial<User>);
  }

  /**
   * Update user with actor validation: admins and users cannot modify superadmins
   */
  static async updateUserAs(actor: User | { role?: string } | null, id: string, user: Partial<User>): Promise<void> {
    // If actor is admin or user, prevent modifying users that are superadmins
    const target = await this.getUserById(id);
    if (!target) throw new Error('User not found');

    if ((actor?.role === 'admin' || actor?.role === 'user') && target.role === 'superadmin') {
      throw new Error('Forbidden: non-superadmin users cannot modify superadmin users');
    }

    // Also prevent admins and users from elevating others to superadmin
    if ((actor?.role === 'admin' || actor?.role === 'user') && user.role === 'superadmin') {
      throw new Error('Forbidden: non-superadmin users cannot assign superadmin role');
    }

    return await this.updateUser(id, user);
  }

  /**
   * Delete a user
   */
  static async deleteUser(id: string): Promise<void> {
    return await FirestoreService.delete(this.COLLECTION_NAME, id);
  }

  /**
   * Delete a user with actor validation: admins cannot delete users with eliminate === false
   */
  static async deleteUserAs(actor: User | { role?: string } | null, id: string): Promise<void> {
    const target = await this.getUserById(id);
    if (!target) throw new Error('User not found');

    // Superadmins can delete anyone
    if (actor?.role === 'superadmin') {
      return await this.deleteUser(id);
    }

    // Admins cannot delete users that have eliminate === false
    if (actor?.role === 'admin') {
      if (target.eliminate === false || target.eliminate === undefined) {
        throw new Error('Forbidden: admins cannot delete users with eliminate=false');
      }
      // If eliminate is true, allow delete
      return await this.deleteUser(id);
    }

    // Regular users cannot delete anyone
    throw new Error('Forbidden: insufficient permissions to delete user');
  }
  /**
   * Find users by location
   */
  static async findUsersByLocation(location: string): Promise<User[]> {
    // Legacy function kept for compatibility, query by ownercompanie instead
    return await FirestoreService.query(this.COLLECTION_NAME, [
      { field: 'ownercompanie', operator: '==', value: location }
    ]);
  }
  /**
   * Find users by role (actor-aware implementation exists earlier in file)
   */

  /**
   * Get active users only
   */
  static async getActiveUsers(): Promise<User[]> {
    return await FirestoreService.query(this.COLLECTION_NAME, [
      { field: 'isActive', operator: '==', value: true }
    ]);
  }

  /**
   * Get active users with actor role validation
   */
  static async getActiveUsersAs(actor: User | { role?: string } | null): Promise<User[]> {
    const activeUsers = await this.getActiveUsers();
    // If actor is admin or user, filter out superadmin users
    if (actor?.role === 'admin' || actor?.role === 'user') {
      return activeUsers.filter(user => user.role !== 'superadmin');
    }

    // If actor is superadmin, filter out plain 'user' accounts
    if (actor?.role === 'superadmin') {
      return activeUsers.filter(user => user.role !== 'user');
    }

    return activeUsers;
  }

  /**
   * Get users ordered by name
   */
  static async getUsersOrderedByName(): Promise<User[]> {
    return await FirestoreService.query(this.COLLECTION_NAME, [], 'name', 'asc');
  }
  /**
   * Search users by name or location
   */
  static async searchUsers(searchTerm: string): Promise<User[]> {
    const users = await this.getAllUsers();
    const searchTermLower = searchTerm.toLowerCase();

    return users.filter(user =>
      user.name.toLowerCase().includes(searchTermLower) ||
      (user.ownercompanie && user.ownercompanie.toLowerCase().includes(searchTermLower))
    );
  }

  /**
   * Search users by name or location with actor role validation
   */
  static async searchUsersAs(actor: User | { role?: string } | null, searchTerm: string): Promise<User[]> {
    const users = await this.getAllUsersAs(actor);
    const searchTermLower = searchTerm.toLowerCase();

    return users.filter(user =>
      user.name.toLowerCase().includes(searchTermLower) ||
      (user.ownercompanie && user.ownercompanie.toLowerCase().includes(searchTermLower))
    );
  }

  /**
   * Update user permissions
   */
  static async updateUserPermissions(id: string, permissions: Partial<import('../types/firestore').UserPermissions>): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const currentPermissions = user.permissions || getDefaultPermissions(user.role);
    const updatedPermissions = {
      ...currentPermissions,
      ...permissions
    };

    return await this.updateUser(id, { permissions: updatedPermissions });
  }

  /**
   * Reset user permissions to default based on role
   */
  static async resetUserPermissions(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const defaultPermissions = getDefaultPermissions(user.role);
    return await this.updateUser(id, { permissions: defaultPermissions });
  }

  /**
   * Migrate existing users to add default permissions
   */
  static async migrateUsersPermissions(): Promise<{ updated: number; skipped: number }> {
    const users = await this.getAllUsers();
    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      if (!user.id) {
        skipped++;
        continue;
      }

      // If user already has permissions, skip
      if (user.permissions) {
        skipped++;
        continue;
      }

      // Add default permissions based on role
      const defaultPermissions = getDefaultPermissions(user.role);
      await this.updateUser(user.id, { permissions: defaultPermissions });
      updated++;
    }

    return { updated, skipped };
  }

  /**
   * Update existing users to ensure they have all available permissions
   * This is useful when new permissions are added to the system
   */
  static async ensureAllPermissions(): Promise<{ updated: number; skipped: number }> {
    const users = await this.getAllUsers();
    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      if (!user.id) {
        skipped++;
        continue;
      }

      const defaultPermissions = getDefaultPermissions(user.role);
      const currentPermissions = user.permissions || {};

      // Check if user is missing any permissions
      let needsUpdate = false;
      const updatedPermissions: import('../types/firestore').UserPermissions = { ...defaultPermissions, ...currentPermissions };

      for (const [permission, defaultValue] of Object.entries(defaultPermissions)) {
        if (!(permission in currentPermissions)) {
          (updatedPermissions as unknown as Record<string, unknown>)[permission] = defaultValue;
          needsUpdate = true;
        }
      }

      // One-time legacy migration: permissions.agregaproductodeli -> permissions.agregarproductosdeli
      // Keep runtime checks strict (agregarproductosdeli only), but allow data cleanup via this routine.
      const legacyAgregar = (currentPermissions as any)?.agregaproductodeli === true;
      if (legacyAgregar && updatedPermissions.agregarproductosdeli !== true) {
        updatedPermissions.agregarproductosdeli = true;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await this.updateUser(user.id, { permissions: updatedPermissions });
        updated++;
      } else {
        skipped++;
      }
    }

    return { updated, skipped };
  }
}
