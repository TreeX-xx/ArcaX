import { create } from 'zustand';
import type { Profile } from '@/lib/tauri';

interface ProfileDialogState {
  open: boolean;
  profile: Profile | null;
  openDialog: (profile?: Profile | null) => void;
  closeDialog: () => void;
}

/** Kept outside the sidebar so closing the drawer never unmounts the dialog. */
export const useProfileDialogStore = create<ProfileDialogState>((set) => ({
  open: false,
  profile: null,
  openDialog: (profile) => set({ open: true, profile: profile ?? null }),
  closeDialog: () => set({ open: false, profile: null }),
}));
