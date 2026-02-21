'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Save, X } from 'lucide-react';
import { SchedulesService } from '../../services/schedules';

interface DelifoodHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  day: number;
  month: number;
  year: number;
  // empresaValue preferred; keep locationValue for backward compatibility
  empresaValue?: string;
  locationValue?: string;
  currentHours?: number;
  onSave: (hours: number) => void;
}

export default function DelifoodHoursModal({
  isOpen,
  onClose,
  employeeName,
  day,
  month,
  year,
  empresaValue,
  locationValue,
  currentHours = 0,
  onSave
}: DelifoodHoursModalProps) {
  const [hours, setHours] = useState<number>(currentHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Reset hours when modal opens
  useEffect(() => {
    if (isOpen) {
      setHours(currentHours > 0 ? currentHours : 0);
      setError('');
    }
  }, [isOpen, currentHours]);

  const handleSave = async () => {
    if (hours < 0 || hours > 24) {
      setError('Las horas deben estar entre 0 y 24');
      return;
    }

    try {
      setSaving(true);
      setError('');

      // Actualizar en la base de datos
      await SchedulesService.updateScheduleHours(
        empresaValue || locationValue || '',
        employeeName,
        year,
        month,
        day,
        hours
      );

      // Notificar al componente padre
      onSave(hours);
      onClose();
    } catch (error) {
      console.error('Error saving hours:', error);
      setError('Error al guardar las horas trabajadas');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const monthName = new Date(year, month, 1).toLocaleDateString('es-CR', { month: 'long' });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Horas Trabajadas
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {employeeName} - {day} de {monthName} {year}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Número de horas trabajadas:
            </label>
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={hours || ''}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              onKeyDown={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-lg font-semibold text-center"
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Puedes usar decimales (ej: 8.5 para 8 horas y 30 minutos)
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
              Colocar 0 horas eliminará este registro
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 ${hours === 0
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Guardando...
              </>
            ) : (
              <>
                {hours === 0 ? (
                  <>
                    <X className="w-4 h-4" />
                    Eliminar
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
