import { Controller, Post, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskSuggestionDto } from './dto/task-suggestion.dto';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';

@ApiTags('Tasks')
@Controller('sessions/:sessionId/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post('suggest')
  @ApiOperation({ summary: 'Get AI-generated task suggestions for a session' })
  @ApiParam({ name: 'sessionId', description: 'The ID of the session' })
  async suggestTasks(
    @Param('sessionId') sessionId: string
  ): Promise<TaskSuggestionDto[]> {
    return this.tasksService.suggestTasks(sessionId);
  }
}
