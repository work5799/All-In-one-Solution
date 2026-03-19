import React, { createContext, useContext, useEffect, useState } from "react";

export interface HistoryItem {
  id: string;
  name: string;
  type: "image" | "video" | "ai";
  action: string;
  originalSize?: number; // in bytes
  optimizedSize?: number; // in bytes
  saved: string; // e.g. "68%" or "—"
  date: string; // e.g. "Mar 10, 2026" or "2 min ago"
  timestamp: number;
  url?: string;
  previewUrl?: string;
}

interface HistoryContextType {
  history: HistoryItem[];
  addHistoryItem: (item: Omit<HistoryItem, "id" | "date" | "timestamp">) => void;
  clearHistory: () => void;
  stats: {
    totalOptimized: number;
    storageUsed: number; // in bytes
    totalSaved: number; // in bytes
    avgTime: string; // mock time for now
  };
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export const HistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const stored = localStorage.getItem("oron_media_history");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("oron_media_history", JSON.stringify(history));
  }, [history]);

  const addHistoryItem = (item: Omit<HistoryItem, "id" | "date" | "timestamp">) => {
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setHistory((prev) => [newItem, ...prev]);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("oron_media_history");
  };

  const stats = {
    totalOptimized: history.length,
    storageUsed: history.reduce((acc, item) => acc + (item.optimizedSize || item.originalSize || 0), 0),
    totalSaved: history.reduce((acc, item) => {
      if (item.originalSize && item.optimizedSize && item.originalSize > item.optimizedSize) {
        return acc + (item.originalSize - item.optimizedSize);
      }
      return acc;
    }, 0),
    avgTime: "1.2s", // We can keep this static or track processing time per item
  };

  return (
    <HistoryContext.Provider value={{ history, addHistoryItem, clearHistory, stats }}>
      {children}
    </HistoryContext.Provider>
  );
};

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return context;
};
