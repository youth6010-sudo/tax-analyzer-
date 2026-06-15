export type BlueholeCaseSummary = {
  id: string;
  title?: string;
  status?: string;
  manager?: string;
  updatedAt?: string;
  url: string;
  source: 'api' | 'manual';
};

export type BlueholeApiCaseResponse = {
  id?: string | number;
  title?: string;
  status?: string;
  manager?: string;
  managerName?: string;
  updatedAt?: string;
  updated_at?: string;
};
