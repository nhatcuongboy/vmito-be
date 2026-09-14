import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ArticlesService } from './articles.service';
import { QueryArticlesDto } from './dto/query-articles.dto';

@ApiTags('articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published articles (paginated, filterable)' })
  findAll(@Query() query: QueryArticlesDto) {
    return this.articlesService.findPublished(query);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Published article count per category' })
  countByCategory(@Query('locale') locale?: string) {
    return this.articlesService.countByCategory(locale);
  }

  // Declared before ':slug' so the literal path isn't swallowed by the param route.
  @Public()
  @Get('sitemap')
  @ApiOperation({ summary: 'Slugs and timestamps for sitemap generation' })
  findForSitemap() {
    return this.articlesService.findForSitemap();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a published article by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.articlesService.findBySlug(slug);
  }

  @Public()
  @Get(':slug/related')
  @ApiOperation({ summary: 'Articles related to the given one' })
  findRelated(@Param('slug') slug: string) {
    return this.articlesService.findRelated(slug);
  }

  @Public()
  @Post(':slug/view')
  @ApiOperation({ summary: 'Increment the view counter for an article' })
  trackView(@Param('slug') slug: string) {
    return this.articlesService.trackView(slug);
  }
}
