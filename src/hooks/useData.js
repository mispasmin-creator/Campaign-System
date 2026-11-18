import { useState, useEffect, useCallback } from 'react';
import { getData, saveData, resetDemo, exportData, importData } from '../services/storage';
import { loadDataFromGoogleSheet } from '../services/googleSheets';

export function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, tone = 'info') => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev && prev.message === message ? null : prev));
    }, 4000);
  }, []);

  const refresh = useCallback(async (showNotification = false) => {
    try {
      setLoading(true);
      setError(null);

      // Google Sheet is the primary source of truth:
      // If sheet has rows -> app displays those rows.
      // If sheet has 0 rows -> app displays clean empty state (0 orders).
      const sheetData = await loadDataFromGoogleSheet();
      if (sheetData) {
        setData(sheetData);
        if (showNotification) {
          notify(`Synced with Google Sheet (${sheetData.orders.length} orders)`, 'good');
        }
        return sheetData;
      }

      // Offline / fallback to local storage cache if sheet was unreachable
      const cached = await getData();
      setData(cached);
      return cached;
    } catch (err) {
      console.warn('Google Sheet sync error, using local cache:', err.message);
      const cached = await getData();
      setData(cached);
      setError(err.message || 'Failed to load data');
      return cached;
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateData = useCallback(async (updaterOrNewData) => {
    try {
      setError(null);
      let nextData;
      if (typeof updaterOrNewData === 'function') {
        nextData = updaterOrNewData(data);
      } else {
        nextData = updaterOrNewData;
      }
      await saveData(nextData);
      setData(nextData);
      return nextData;
    } catch (err) {
      setError(err.message);
      notify(err.message, 'bad');
      throw err;
    }
  }, [data, notify]);

  const handleResetDemo = useCallback(async () => {
    try {
      setLoading(true);
      const fresh = await resetDemo();
      setData(fresh);
      notify('Demo data has been reset to defaults', 'good');
      return fresh;
    } catch (err) {
      notify(err.message, 'bad');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const handleExport = useCallback(async () => {
    try {
      if (!data) return;
      await exportData(data);
      notify('JSON backup exported successfully', 'good');
    } catch (err) {
      notify(err.message, 'bad');
    }
  }, [data, notify]);

  const handleImport = useCallback(async (file) => {
    try {
      setLoading(true);
      const imported = await importData(file);
      setData(imported);
      notify('Data backup imported successfully', 'good');
      return imported;
    } catch (err) {
      notify(err.message, 'bad');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [notify]);

  return {
    data,
    loading,
    error,
    toast,
    setToast,
    notify,
    refresh,
    updateData,
    resetDemo: handleResetDemo,
    exportData: handleExport,
    importData: handleImport
  };
}

