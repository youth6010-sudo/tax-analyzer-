export interface LunchVisit {
  id: string;
  date: string;
  rating: number;
  review: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LunchSpotJournal {
  spotId: string;
  visits: LunchVisit[];
}

export type LunchJournalStore = Record<string, LunchSpotJournal>;
