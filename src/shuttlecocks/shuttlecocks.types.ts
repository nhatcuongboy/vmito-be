export interface IShuttlecockAffiliateStore {
  id: string;
  name: string;
  storeName: string;
  url: string;
  price: number;
  originalPrice?: number;
  unit: 'TUBE' | 'CARTON';
  isOfficialMall: boolean;
  promoBadge?: string;
}

export interface IShuttlecockItem {
  id: string;
  slug: string;
  brand: string;
  name: string;
  vietnameseName: string;
  featuredImage: string;
  galleryImages: string[];
  featherType: 'DUCK' | 'GOOSE' | 'SYNTHETIC' | 'HYBRID_3IN1';
  featherCount: number;
  corkType: 'NATURAL' | 'COMPOSITE' | 'SANDWICH' | 'FOAM';
  speedOptions: number[];
  bwfApproved: boolean;
  suitability: Array<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'TOURNAMENT'>;
  priceRange: {
    minTube: number;
    maxTube: number;
    minCarton: number;
    maxCarton: number;
  };
  rating: {
    overall: number;
    flightStability: number;
    durability: number;
    feelAndImpact: number;
    totalReviews: number;
  };
  pros: string[];
  cons: string[];
  description: string;
  searchAliases: string[];
  affiliateStores: IShuttlecockAffiliateStore[];
}
