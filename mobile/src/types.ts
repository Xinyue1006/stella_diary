export type MascotId = 'dinosaur' | 'ladybug' | 'butterfly' | 'cow' | 'bee' | 'bunny';

export interface Photo {
  id: string;
  uri: string;
}

export interface EntryDraft {
  text: string;
  occurredAt: string;
  photos: Photo[];
}

export interface Entry extends EntryDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Countdown {
  id: string;
  title: string;
  /** A local calendar date, without a UTC conversion. */
  date: string;
}

export interface DiaryData {
  schemaVersion: 1;
  entries: Entry[];
  countdowns: Countdown[];
  mascot: MascotId;
  draft: EntryDraft | null;
}

export interface BackupPhoto {
  id: string;
  base64: string;
}

export interface DiaryBackup {
  format: 'sunflower-diary';
  version: 1;
  exportedAt: string;
  diary: DiaryData;
  photos: BackupPhoto[];
}
