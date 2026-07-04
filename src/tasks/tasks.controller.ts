import { Controller, Post, Param, Body } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskSuggestionDto } from './dto/task-suggestion.dto';
import { SuggestTasksDto } from './dto/suggest-tasks-body.dto';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAccessService } from '../common/session-access/session-access.service';

@ApiTags('Tasks')
@Controller('sessions/:sessionId/tasks')
export class TasksController {
  constructor(
    private tasksService: TasksService,
    private readonly sessionAccess: SessionAccessService
  ) {}

  @Post('suggest')
  @ApiOperation({ summary: 'Get AI-generated task suggestions for a session' })
  @ApiParam({ name: 'sessionId', description: 'The ID of the session' })
  async suggestTasks(
    @Param('sessionId') sessionId: string,
    @Body() dto: SuggestTasksDto,
    @CurrentUser() user: { userId: string; role: string }
  ): Promise<TaskSuggestionDto[]> {
    // Host-only tool; triggers paid AI generation.
    await this.sessionAccess.assertSessionHost(
      sessionId,
      user.userId,
      user.role
    );
    return this.tasksService.suggestTasks(sessionId, dto.language);
  }
}
