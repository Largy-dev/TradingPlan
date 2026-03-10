export interface IConfig {
  id: number;
  hasApiKey: boolean;
  testnet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IApiKeysInput {
  apiKey: string;
  secretKey: string;
}
