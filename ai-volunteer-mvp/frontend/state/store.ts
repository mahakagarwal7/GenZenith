import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  recentNeedIds: string[];
  addRecentNeedId: (id: string) => void;
  clearRecentNeedIds: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      recentNeedIds: [],
      addRecentNeedId: (id) =>
        set((state) => ({
          recentNeedIds: [id, ...state.recentNeedIds.filter((existingId) => existingId !== id)].slice(0, 10),
        })),
      clearRecentNeedIds: () => set({ recentNeedIds: [] }),
    }),
    {
      name: "volunteer-app-storage",
    }
  )
);
