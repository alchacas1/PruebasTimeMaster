import { FirestoreService } from './firestore';

export interface CalculoHorasEntry {
  id?: string;
  companieValue: string;
  employeeName: string;
  year: number;
  month: number;
  day: number;
  timeHHMMSS: string; // "hh:mm:ss"
  totalSeconds: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CalculoHorasService {
  private static readonly COLLECTION_NAME = 'calculohoras';

  static async getEntriesByLocationMonth(locationValue: string, year: number, month: number): Promise<CalculoHorasEntry[]> {
    return await FirestoreService.query(this.COLLECTION_NAME, [
      { field: 'companieValue', operator: '==', value: locationValue },
      { field: 'year', operator: '==', value: year },
      { field: 'month', operator: '==', value: month }
    ]);
  }

  static async findEntry(
    locationValue: string,
    employeeName: string,
    year: number,
    month: number,
    day: number
  ): Promise<CalculoHorasEntry | null> {
    const existing = await FirestoreService.query(this.COLLECTION_NAME, [
      { field: 'companieValue', operator: '==', value: locationValue },
      { field: 'employeeName', operator: '==', value: employeeName },
      { field: 'year', operator: '==', value: year },
      { field: 'month', operator: '==', value: month },
      { field: 'day', operator: '==', value: day }
    ]);

    return existing.length > 0 ? (existing[0] as CalculoHorasEntry) : null;
  }

  /**
   * Upsert time entry in `calculohoras`.
   * If `totalSeconds` <= 0, deletes the entry if it exists.
   */
  static async upsertTime(
    locationValue: string,
    employeeName: string,
    year: number,
    month: number,
    day: number,
    timeHHMMSS: string,
    totalSeconds: number
  ): Promise<void> {
    const existing = await this.findEntry(locationValue, employeeName, year, month, day);

    if (totalSeconds <= 0) {
      if (existing?.id) {
        await FirestoreService.delete(this.COLLECTION_NAME, existing.id);
      }
      return;
    }

    const payload: Omit<CalculoHorasEntry, 'id'> = {
      companieValue: locationValue,
      employeeName,
      year,
      month,
      day,
      timeHHMMSS,
      totalSeconds,
      updatedAt: new Date(),
      createdAt: existing?.createdAt ?? new Date()
    };

    if (existing?.id) {
      await FirestoreService.update(this.COLLECTION_NAME, existing.id, payload);
    } else {
      await FirestoreService.add(this.COLLECTION_NAME, payload);
    }
  }
}
