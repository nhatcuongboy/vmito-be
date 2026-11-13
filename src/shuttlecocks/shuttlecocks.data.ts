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

export const SEED_SHUTTLECOCKS: IShuttlecockItem[] = [
  {
    id: 'sc-88-vnb',
    slug: 'ong-cau-long-88',
    brand: 'ShopVNB',
    name: 'Ống Cầu Lông 88',
    vietnameseName: 'Cầu Lông 88 VNB',
    featuredImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'DUCK',
    featherCount: 16,
    corkType: 'COMPOSITE',
    speedOptions: [76, 77],
    bwfApproved: false,
    suitability: ['BEGINNER', 'INTERMEDIATE'],
    priceRange: {
      minTube: 245000,
      maxTube: 260000,
      minCarton: 12000000,
      maxCarton: 12800000,
    },
    rating: {
      overall: 4.5,
      flightStability: 4.4,
      durability: 4.6,
      feelAndImpact: 4.3,
      totalReviews: 128,
    },
    pros: [
      'Đường cầu bay đầm tay, cảm giác chắc vợt',
      'Độ bền cao, lông vịt tuyển chọn ít bị gãy ngang trong các pha đập',
      'Giá thành hợp lý, tối ưu chi phí cho các nhóm giao lưu phong trào',
      'Dễ mua tại hệ thống ShopVNB trên toàn quốc',
    ],
    cons: [
      'Tốc độ hơi nhanh hơn một chút so với Vina Star khi ở thời tiết nóng ẩm',
      'Đầu đế composite nên âm thanh smash chưa thực sự đanh bằng đế gỗ tự nhiên',
    ],
    description:
      'Ống cầu lông 88 là dòng sản phẩm độc quyền được phân phối bởi hệ thống ShopVNB, thiết kế riêng cho thị trường cầu lông phong trào Việt Nam. Cầu được sản xuất từ 16 cánh lông vịt đủ độ già, giúp đường bay ổn định, quỹ đạo chuẩn xác và độ bền vượt trội trong phân khúc tầm trung.',
    searchAliases: ['88', 'cầu 88', 'vnb 88', 'ống 88', 'cau 88'],
    affiliateStores: [
      {
        id: 'store-vnb-88',
        name: 'ShopVNB Chính Hãng',
        storeName: 'ShopVNB Official',
        url: 'https://shopvnb.com/ong-cau-long-88.html?utm_source=vmito&utm_medium=referral',
        price: 250000,
        originalPrice: 265000,
        unit: 'TUBE',
        isOfficialMall: true,
        promoBadge: 'Độc quyền VNB',
      },
      {
        id: 'store-shopee-88',
        name: 'Shopee Mall ShopVNB',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=ong%20cau%20long%2088&utm_source=vmito',
        price: 245000,
        originalPrice: 260000,
        unit: 'TUBE',
        isOfficialMall: true,
        promoBadge: 'Freeship Xtra',
      },
      {
        id: 'store-tiktok-88',
        name: 'TikTok Shop VNB',
        storeName: 'TikTok Shop',
        url: 'https://www.tiktok.com/search?q=ong+cau+long+88&utm_source=vmito',
        price: 240000,
        originalPrice: 255000,
        unit: 'TUBE',
        isOfficialMall: true,
        promoBadge: 'Voucher Live',
      },
    ],
  },
  {
    id: 'sc-vina-star',
    slug: 'ong-cau-long-vina-star',
    brand: 'Vina Star',
    name: 'Ống Cầu Lông Vina Star',
    vietnameseName: 'Cầu Lông Vina Star Đỏ',
    featuredImage: 'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'DUCK',
    featherCount: 16,
    corkType: 'SANDWICH',
    speedOptions: [50, 51],
    bwfApproved: false,
    suitability: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    priceRange: {
      minTube: 255000,
      maxTube: 275000,
      minCarton: 12600000,
      maxCarton: 13500000,
    },
    rating: {
      overall: 4.7,
      flightStability: 4.7,
      durability: 4.5,
      feelAndImpact: 4.6,
      totalReviews: 245,
    },
    pros: [
      'Được ưa chuộng nhất tại các sân cầu lông miền Nam và miền Trung',
      'Đường cầu bay chuẩn, cảm giác đánh kiểm soát tốt',
      'Đế sandwich êm ái, tiếp xúc mặt vợt dễ chịu',
    ],
    cons: [
      'Giá thị trường có xu hướng biến động cao',
      'Xuất hiện nhiều hàng giả, cần mua ở các đại lý ủy quyền uy tín',
    ],
    description:
      'Vina Star là thương hiệu cầu lông quốc dân tại các sân chơi phong trào Việt Nam. Đường bay đầm, độ xoáy ổn định và khả năng giữ form lông tốt giúp Vina Star luôn là lựa chọn hàng đầu của các chủ kèo.',
    searchAliases: ['vina star', 'vinastar', 'vina', 'cầu vina'],
    affiliateStores: [
      {
        id: 'store-shopee-vinastar',
        name: 'Shopee Mall Đại Lý',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=cau%20long%20vina%20star&utm_source=vmito',
        price: 260000,
        originalPrice: 280000,
        unit: 'TUBE',
        isOfficialMall: true,
        promoBadge: 'Chính Hãng',
      },
      {
        id: 'store-vnb-vinastar',
        name: 'ShopVNB Store',
        storeName: 'ShopVNB',
        url: 'https://shopvnb.com/ong-cau-long-vina-star.html?utm_source=vmito',
        price: 265000,
        unit: 'TUBE',
        isOfficialMall: true,
      },
    ],
  },
  {
    id: 'sc-hai-yen-bac',
    slug: 'ong-cau-long-hai-yen-bac',
    brand: 'Hải Yến',
    name: 'Ống Cầu Lông Hải Yến Bạc',
    vietnameseName: 'Cầu Hải Yến Tem Bạc',
    featuredImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'DUCK',
    featherCount: 16,
    corkType: 'COMPOSITE',
    speedOptions: [76, 77],
    bwfApproved: false,
    suitability: ['INTERMEDIATE', 'ADVANCED'],
    priceRange: {
      minTube: 260000,
      maxTube: 280000,
      minCarton: 12900000,
      maxCarton: 13800000,
    },
    rating: {
      overall: 4.6,
      flightStability: 4.6,
      durability: 4.4,
      feelAndImpact: 4.5,
      totalReviews: 180,
    },
    pros: [
      'Thương hiệu lâu đời và uy tín bậc nhất tại Việt Nam',
      'Tiếng nổ vang và đanh khi đập cầu',
      'Đường cầu bay nhanh và thoát vợt',
    ],
    cons: [
      'Lông vịt có độ giòn nhẹ khi trời khô hanh mùa đông',
    ],
    description:
      'Hải Yến Bạc là dòng cầu truyền thống quen thuộc với các tay vợt miền Bắc và các giải đấu cấp cơ quan, trường học, câu lạc bộ. Cầu cho cảm giác chạm cầu sắc bén và uy lực.',
    searchAliases: ['hải yến', 'hai yen', 'hải yến bạc', 'cau hai yen'],
    affiliateStores: [
      {
        id: 'store-shopee-haiyen',
        name: 'Shopee Mall Hải Yến',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=cau%20long%20hai%20yen&utm_source=vmito',
        price: 268000,
        unit: 'TUBE',
        isOfficialMall: true,
      },
    ],
  },
  {
    id: 'sc-thanh-cong-pro',
    slug: 'ong-cau-long-thanh-cong-pro',
    brand: 'Thành Công',
    name: 'Ống Cầu Lông Thành Công Pro 77',
    vietnameseName: 'Cầu Thành Công Pro',
    featuredImage: 'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'DUCK',
    featherCount: 16,
    corkType: 'SANDWICH',
    speedOptions: [76, 77],
    bwfApproved: false,
    suitability: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    priceRange: {
      minTube: 250000,
      maxTube: 270000,
      minCarton: 12400000,
      maxCarton: 13200000,
    },
    rating: {
      overall: 4.5,
      flightStability: 4.5,
      durability: 4.7,
      feelAndImpact: 4.4,
      totalReviews: 160,
    },
    pros: [
      'Độ bền cực kỳ ấn tượng, chịu lực đập liên tục rất tốt',
      'Giá thành cạnh tranh, phù hợp sinh viên và các nhóm chơi hàng ngày',
    ],
    cons: [
      'Trọng lượng đôi khi hơi đầm, cần lực cổ tay tốt',
    ],
    description:
      'Thành Công Pro là một trong những sản phẩm có độ bền cao nhất phân khúc. Cánh lông vịt được xử lý dẻo dai giúp cầu giữ được quỹ đạo ổn định qua nhiều set đấu căng thẳng.',
    searchAliases: ['thành công', 'thanh cong', 'thành công pro'],
    affiliateStores: [
      {
        id: 'store-shopee-thanhcong',
        name: 'Shopee Mall Thành Công',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=cau%20long%20thanh%20cong&utm_source=vmito',
        price: 255000,
        unit: 'TUBE',
        isOfficialMall: true,
      },
    ],
  },
  {
    id: 'sc-victor-lark-5',
    slug: 'ong-cau-long-victor-lark-5',
    brand: 'Victor',
    name: 'Ống Cầu Lông Victor Lark 5',
    vietnameseName: 'Cầu Victor Lark 5',
    featuredImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'DUCK',
    featherCount: 16,
    corkType: 'COMPOSITE',
    speedOptions: [76, 77],
    bwfApproved: false,
    suitability: ['INTERMEDIATE', 'ADVANCED', 'TOURNAMENT'],
    priceRange: {
      minTube: 275000,
      maxTube: 300000,
      minCarton: 13500000,
      maxCarton: 14800000,
    },
    rating: {
      overall: 4.7,
      flightStability: 4.8,
      durability: 4.5,
      feelAndImpact: 4.8,
      totalReviews: 95,
    },
    pros: [
      'Đường bay chuẩn xác chuẩn hãng Victor quốc tế',
      'Cảm giác gài cầu, bỏ nhỏ và kéo lưới cực kỳ chuẩn tay',
    ],
    cons: [
      'Giá cao hơn mặt bằng chung cầu nội địa',
    ],
    description:
      'Victor Lark 5 là dòng cầu tập luyện và thi đấu cao cấp của thương hiệu Victor. Với công nghệ kiểm soát trọng tâm nghiêm ngặt, Lark 5 mang lại sự nhất quán tuyệt đối trong từng đường cầu.',
    searchAliases: ['victor', 'lark 5', 'victor lark 5'],
    affiliateStores: [
      {
        id: 'store-vnb-victor',
        name: 'ShopVNB Chính Hãng',
        storeName: 'ShopVNB',
        url: 'https://shopvnb.com/search?q=victor+lark+5&utm_source=vmito',
        price: 285000,
        unit: 'TUBE',
        isOfficialMall: true,
      },
    ],
  },
  {
    id: 'sc-yonex-as-30',
    slug: 'ong-cau-long-yonex-aerosensa-30',
    brand: 'Yonex',
    name: 'Ống Cầu Lông Yonex Aerosensa 30',
    vietnameseName: 'Cầu Yonex AS 30',
    featuredImage: 'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1541744573515-4ae0131822f4?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'GOOSE',
    featherCount: 16,
    corkType: 'NATURAL',
    speedOptions: [3, 4],
    bwfApproved: true,
    suitability: ['ADVANCED', 'TOURNAMENT'],
    priceRange: {
      minTube: 750000,
      maxTube: 850000,
      minCarton: 37000000,
      maxCarton: 41000000,
    },
    rating: {
      overall: 4.9,
      flightStability: 5.0,
      durability: 4.8,
      feelAndImpact: 5.0,
      totalReviews: 82,
    },
    pros: [
      'Chất lượng lông ngỗng tự nhiên chuẩn thi đấu quốc tế BWF',
      'Đế gỗ sồi tự nhiên cho âm thanh và cảm giác đánh hoàn hảo',
      'Độ chính xác và quỹ đạo bay ổn định 100%',
    ],
    cons: [
      'Giá thành rất cao, chủ yếu dùng cho giải đấu chuyên nghiệp',
    ],
    description:
      'Yonex Aerosensa 30 là tiêu chuẩn vàng của các giải đấu cầu lông chuyên nghiệp trên thế giới. Được chế tác từ lông ngỗng hảo hạng và đế gỗ tự nhiên nguyên khối.',
    searchAliases: ['yonex', 'as30', 'as 30', 'aerosensa 30'],
    affiliateStores: [
      {
        id: 'store-shopee-yonex',
        name: 'Shopee Mall Yonex Official',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=yonex%20as%2030&utm_source=vmito',
        price: 790000,
        unit: 'TUBE',
        isOfficialMall: true,
        promoBadge: 'BWF Standard',
      },
    ],
  },
  {
    id: 'sc-s70-hybrid',
    slug: 'ong-cau-long-s70-hybrid-3in1',
    brand: 'S70',
    name: 'Ống Cầu Lông S70 Bán Nhân Tạo 3-in-1',
    vietnameseName: 'Cầu S70 3in1',
    featuredImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=80',
    ],
    featherType: 'HYBRID_3IN1',
    featherCount: 16,
    corkType: 'COMPOSITE',
    speedOptions: [76, 77],
    bwfApproved: false,
    suitability: ['BEGINNER', 'INTERMEDIATE'],
    priceRange: {
      minTube: 230000,
      maxTube: 250000,
      minCarton: 11200000,
      maxCarton: 12200000,
    },
    rating: {
      overall: 4.4,
      flightStability: 4.3,
      durability: 4.9,
      feelAndImpact: 4.1,
      totalReviews: 110,
    },
    pros: [
      'Cấu trúc 3-in-1 (khung xương nhựa + cánh lông) siêu bền, khó gãy',
      'Tiết kiệm tối đa chi phí tiền cầu cho các buổi tập kỹ thuật',
    ],
    cons: [
      'Cảm giác đánh hơi cứng hơn cầu lông vũ truyền thống',
    ],
    description:
      'Cầu lông S70 3-in-1 sử dụng công nghệ lai ghép hiện đại: đế composite, khung gắn bằng vật liệu polyme dẻo dai và cánh lông tự nhiên. Đây là giải pháp tiết kiệm hàng đầu cho người chơi phong trào.',
    searchAliases: ['s70', 'cầu 3in1', 'cầu bán nhân tạo'],
    affiliateStores: [
      {
        id: 'store-shopee-s70',
        name: 'Shopee Mall S70',
        storeName: 'Shopee Mall',
        url: 'https://shopee.vn/search?keyword=cau%20long%20s70&utm_source=vmito',
        price: 235000,
        unit: 'TUBE',
        isOfficialMall: true,
      },
    ],
  },
];
