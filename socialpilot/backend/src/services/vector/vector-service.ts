import { config } from '../../config';

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

class VectorService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.qdrant.url;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.qdrant.apiKey) {
      headers['api-key'] = config.qdrant.apiKey;
    }
    
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Qdrant error: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<any>;
  }

  async ensureCollection(name: string, vectorSize: number = 1536) {
    const collections = await this.request('/collections');
    const exists = collections.result?.collections?.some((c: any) => c.name === name);
    
    if (!exists) {
      await this.request('/collections', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          vectors: { size: vectorSize, distance: 'Cosine' },
        }),
      });
    }
  }

  async upsertPoints(collection: string, points: QdrantPoint[]) {
    return this.request(`/collections/${collection}/points`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  async search(collection: string, vector: number[], limit: number = 5) {
    return this.request(`/collections/${collection}/points/search`, {
      method: 'POST',
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });
  }

  async deletePoints(collection: string, ids: string[]) {
    return this.request(`/collections/${collection}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: ids.map(id => ({ id })) }),
    });
  }
}

export const vectorService = new VectorService();
