// Firebase configuration
export { db } from '@/config/firebase';
// Services
export { FirestoreService } from '../services/firestore';
export { SorteosService } from '../services/sorteos';
export { ScanningService } from '../services/scanning';
export { CcssConfigService } from '../services/ccss-config';

// Types
export type { Sorteo, ScanResult, CcssConfig } from '../types/firestore';

// Migration utilities
export { MigrationService } from '../utils/migration';
