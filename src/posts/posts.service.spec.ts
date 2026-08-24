import { PostsService } from './posts.service';

describe('PostsService engagement boost integration', () => {
  const prisma = {
    post: {
      findUnique: jest.fn(),
    },
    postLike: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
  const sessionsGateway = {
    notifyPostLikeUpdate: jest.fn(),
  };
  const engagementBoostService = {
    buildCreateData: jest.fn(),
    getDisplayedLikeCount: jest.fn(),
  };

  let service: PostsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PostsService(
      prisma as never,
      {} as never,
      {} as never,
      sessionsGateway as never,
      engagementBoostService as never
    );
  });

  it('adds persisted boost likes to the REST post count without exposing internals', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'author-1',
      images: [],
      originalPost: null,
      likes: [{ userId: 'viewer-1' }],
      engagementBoost: { currentCount: 3 },
      _count: { likes: 2, comments: 1, shares: 0 },
    });

    const post = await service.findOne('post-1', 'viewer-1');

    expect(post._count).toEqual({ likes: 5, comments: 1, shares: 0 });
    expect(post.isLiked).toBe(true);
    expect(post.engagementBoost).toBeUndefined();
  });

  it('returns and broadcasts the aggregate count after a real unlike', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'author-1',
    });
    prisma.postLike.findUnique.mockResolvedValue({ id: 'like-1' });
    prisma.postLike.delete.mockResolvedValue({ id: 'like-1' });
    prisma.postLike.count.mockResolvedValue(2);
    engagementBoostService.getDisplayedLikeCount.mockResolvedValue(6);

    await expect(service.toggleLike('post-1', 'viewer-1')).resolves.toEqual({
      liked: false,
      likeCount: 6,
    });
    expect(engagementBoostService.getDisplayedLikeCount).toHaveBeenCalledWith(
      'post-1',
      2
    );
    expect(sessionsGateway.notifyPostLikeUpdate).toHaveBeenCalledWith(
      'post-1',
      {
        actorId: 'viewer-1',
        isLiked: false,
        likeCount: 6,
        source: 'user',
      }
    );
  });
});
