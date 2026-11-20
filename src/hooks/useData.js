import { useState, useEffect, useCallback } from 'react';
import { saveData, resetDemo, exportData, importData } from '../services/storage';

const EMPTY_SHEET_DATA = {
  companies: [],
  kilns: [],
  kilnSizes: [],
  orders: [],
  visits: [],
  runningInspections: [],
  callLogs: [],
  shutdownInspections: [],
  restartProcesses: [],
  stepTasks: [],
  historicalCampaigns: [],
  settings: { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } },
  isSyncedFromSheet: true
};
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

      // Google Sheet is the only data source. Never resurrect local records.
      setData(EMPTY_SHEET_DATA);
      return EMPTY_SHEET_DATA;
    } catch (err) {
      console.warn('Google Sheet sync error:', err.message);
      setData(EMPTY_SHEET_DATA);
      setError(err.message || 'Failed to load data');
      return EMPTY_SHEET_DATA;
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Background silent sync: fetches from Google Sheet without showing loading skeleton
  const silentSync = useCallback(async () => {
    try {
      const sheetData = await loadDataFromGoogleSheet();
      if (sheetData) {
        setData(sheetData);
      } else {
        setData(EMPTY_SHEET_DATA);
      }
    } catch (err) {
      console.warn('Background sync error:', err.message);
      setData(EMPTY_SHEET_DATA);
    }
  }, []);

  useEffect(() => {
    refresh();

    // 1. Periodic background sync every 15 seconds
    const interval = setInterval(() => {
      silentSync();
    }, 15000);

    // 2. Real-time sync whenever user returns to the app tab/window
    const handleFocus = () => {
      silentSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh, silentSync]);

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

