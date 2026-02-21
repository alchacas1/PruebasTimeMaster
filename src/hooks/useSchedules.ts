import { useState, useEffect, useCallback } from 'react';
import { SchedulesService, ScheduleEntry } from '../services/schedules';

export function useSchedules(locationValue?: string, year?: number, month?: number) {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!locationValue || year === undefined || month === undefined) {
      setSchedules([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await SchedulesService.getSchedulesByLocationYearMonth(locationValue, year, month);
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading schedules');
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  }, [locationValue, year, month]);

  const addSchedule = useCallback(async (schedule: Omit<ScheduleEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setError(null);
      const id = await SchedulesService.addSchedule(schedule);
      await fetchSchedules(); // Refresh list
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adding schedule');
      throw err;
    }
  }, [fetchSchedules]);

  const updateSchedule = useCallback(async (id: string, schedule: Partial<ScheduleEntry>) => {
    try {
      setError(null);
      await SchedulesService.updateSchedule(id, schedule);
      await fetchSchedules(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating schedule');
      throw err;
    }
  }, [fetchSchedules]);

  const deleteSchedule = useCallback(async (id: string) => {
    try {
      setError(null);
      await SchedulesService.deleteSchedule(id);
      await fetchSchedules(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting schedule');
      throw err;
    }
  }, [fetchSchedules]);

  const updateScheduleShift = useCallback(async (
    locationValue: string,
    employeeName: string,
    year: number,
    month: number,
    day: number,
    shift: string
  ) => {
    try {
      setError(null);
      await SchedulesService.updateScheduleShift(locationValue, employeeName, year, month, day, shift);
      await fetchSchedules(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating schedule shift');
      throw err;
    }
  }, [fetchSchedules]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedules,
    loading,
    error,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    updateScheduleShift,
    refetch: fetchSchedules
  };
}
